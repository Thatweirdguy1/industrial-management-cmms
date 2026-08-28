import os
import io
import uuid
import requests
import boto3
from PIL import Image
from werkzeug.utils import secure_filename
from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
from models import db, WorkOrder, User, Machine, PhotoRecord
from datetime import datetime, timezone, timedelta
import sqlite3
from predictive_engine import send_telegram_alert, run_predictive_analysis
from pdf_report_generator import generate_weekly_pdf_report

try:
    from tasks import start_scheduler
except ImportError:
    def start_scheduler(app):
        pass

basedir = os.path.abspath(os.path.dirname(__file__))
app = Flask(__name__)

allowed_origins = [
    origin.strip()
    for origin in os.environ.get("CMMS_ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]
CORS(app, resources={r"/api/*": {"origins": allowed_origins}})

app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get(
    'DATABASE_URL',
    'sqlite:///' + os.path.join(basedir, 'maintenance.db')
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

UPLOAD_FOLDER = os.path.join(basedir, 'static', 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

db.init_app(app)

AWS_ACCESS_KEY = os.environ.get('AWS_ACCESS_KEY_ID', '')
AWS_SECRET_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY', '')
AWS_BUCKET_NAME = os.environ.get('AWS_BUCKET_NAME', '')
AWS_REGION = os.environ.get('AWS_REGION', 'ap-south-1')
AWS_ENABLED = bool(AWS_ACCESS_KEY and AWS_SECRET_KEY and AWS_BUCKET_NAME)

s3_client = (
    boto3.client(
        's3',
        aws_access_key_id=AWS_ACCESS_KEY,
        aws_secret_access_key=AWS_SECRET_KEY,
        region_name=AWS_REGION,
    )
    if AWS_ENABLED
    else None
)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'heic', 'heif', 'webp'}


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def parse_sqlite_date(date_str):
    if not date_str:
        return None
    try:
        clean_str = str(date_str).replace('Z', '+00:00')
        dt = datetime.fromisoformat(clean_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        try:
            clean_str = str(date_str).split('.')[0]
            dt = datetime.strptime(clean_str, "%Y-%m-%d %H:%M:%S")
            return dt.replace(tzinfo=timezone.utc)
        except Exception:
            return None


def save_and_upload_file(file_obj, prefix="file"):
    if not file_obj or not file_obj.filename or not allowed_file(file_obj.filename):
        return None

    original_filename = secure_filename(file_obj.filename)
    ext = original_filename.rsplit('.', 1)[1].lower()
    unique_id = uuid.uuid4().hex[:8]
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')

    if ext in ['jpg', 'jpeg', 'png']:
        img = Image.open(file_obj)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        img.thumbnail((1024, 1024))

        img_io = io.BytesIO()
        img.save(img_io, format='JPEG', quality=60, optimize=True)
        img_io.seek(0)

        filename = f"{prefix}_{timestamp}_{unique_id}.jpg"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)

        if s3_client:
            try:
                s3_client.upload_fileobj(img_io, AWS_BUCKET_NAME, filename, ExtraArgs={'ContentType': 'image/jpeg'})
                return filename
            except Exception as exc:
                app.logger.warning("S3 upload failed; falling back to local storage: %s", exc)
                img_io.seek(0)

        with open(filepath, 'wb') as f:
            f.write(img_io.read())
        return filename

    filename = f"{prefix}_{timestamp}_{unique_id}.{ext}"
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)

    if s3_client:
        try:
            s3_client.upload_fileobj(file_obj, AWS_BUCKET_NAME, filename)
            return filename
        except Exception as exc:
            app.logger.warning("S3 upload failed; falling back to local storage: %s", exc)
            try:
                file_obj.seek(0)
            except Exception:
                pass

    file_obj.save(filepath)
    return filename


def to_utc_iso(dt):
    if not dt:
        return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


@app.route('/api/predictive-analysis', methods=['GET'])
def api_predictive_analysis():
    try:
        db_path = os.path.join(basedir, 'maintenance.db')
        results, alerts_sent = run_predictive_analysis(db_path)
        return jsonify({"success": True, "results": results, "alerts_sent": alerts_sent}), 200
    except Exception:
        app.logger.exception("Predictive analysis failed")
        return jsonify({"success": False, "error": "Predictive analysis failed"}), 500


@app.route('/api/run-predictions', methods=['POST'])
def api_run_predictions():
    try:
        db_path = os.path.join(basedir, 'maintenance.db')
        _, alerts_sent = run_predictive_analysis(db_path)
        return jsonify({"message": f"Predictions run successfully. {alerts_sent} alerts sent.", "alerts_sent": alerts_sent}), 200
    except Exception:
        app.logger.exception("Prediction run failed")
        return jsonify({"success": False, "error": "Prediction run failed"}), 500


@app.route('/api/reports/weekly', methods=['GET'])
def api_download_weekly_report():
    try:
        db_path = os.path.join(basedir, 'maintenance.db')
        filepath = generate_weekly_pdf_report(db_path, send_telegram=False)
        return send_file(filepath, as_attachment=True, download_name="weekly_maintenance_report.pdf")
    except Exception:
        app.logger.exception("Report generation failed")
        return jsonify({"success": False, "error": "Report generation failed"}), 500


@app.route('/static/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


@app.route('/api/machines', methods=['GET'])
def get_machines():
    try:
        conn = sqlite3.connect(os.path.join(basedir, 'maintenance.db'))
        conn.row_factory = sqlite3.Row
        machines = conn.execute("SELECT * FROM machines").fetchall()
        output = []
        now = datetime.now(timezone.utc)

        for m in machines:
            m_id = m['id']
            breakdowns = conn.execute(
                "SELECT * FROM work_orders WHERE machine_id=? AND schedule_type='breakdown_report' AND status='completed'",
                (m_id,),
            ).fetchall()
            b_count = len(breakdowns)
            assumed_op_hours = 720
            mtbf = (assumed_op_hours * 6) / b_count if b_count > 0 else 5000
            last_fix_record = conn.execute(
                "SELECT completed_at FROM work_orders WHERE machine_id=? AND status='completed' ORDER BY completed_at DESC LIMIT 1",
                (m_id,),
            ).fetchone()

            hours_since_last_fix = 0
            if last_fix_record and last_fix_record['completed_at']:
                last_fix_date = parse_sqlite_date(last_fix_record['completed_at'])
                if last_fix_date:
                    hours_since_last_fix = (now - last_fix_date).total_seconds() / 3600

            pm_penalty = 0
            if m['next_maintenance']:
                try:
                    clean_date_str = str(m['next_maintenance']).split(' ')[0]
                    next_pm = datetime.strptime(clean_date_str, '%Y-%m-%d').replace(tzinfo=timezone.utc)
                    if now > next_pm:
                        pm_penalty = min((now - next_pm).days * 2, 40)
                except Exception:
                    pass

            total_risk = min(round((hours_since_last_fix / mtbf) * 100 + pm_penalty, 1), 99.9)
            if m['status'] == 'breakdown':
                total_risk = 100.0

            output.append({
                "id": m['id'],
                "name": m['name'],
                "asset_tag": m['asset_tag'],
                "last_maintenance": m['last_maintenance'] if m['last_maintenance'] else "Never",
                "next_maintenance": m['next_maintenance'] if m['next_maintenance'] else "Not Scheduled",
                "status": m['status'],
                "risk_score": total_risk,
            })

        conn.close()
        return jsonify(output), 200
    except Exception:
        app.logger.exception("Failed to list machines")
        return jsonify({"error": "Failed to fetch machines"}), 500


@app.route('/api/machines/<int:machine_id>/history', methods=['GET'])
def get_machine_history(machine_id):
    page = max(request.args.get('page', 1, type=int), 1)
    limit = min(max(request.args.get('limit', 100, type=int), 1), 500)
    offset = (page - 1) * limit

    history = WorkOrder.query.filter_by(machine_id=machine_id, status='completed').order_by(
        WorkOrder.completed_at.desc()
    ).offset(offset).limit(limit).all()
    output = []

    for order in history:
        hours_taken = 0
        if order.completed_at and order.created_at:
            time_delta = order.completed_at.replace(tzinfo=None) - order.created_at.replace(tzinfo=None)
            hours_taken = round(time_delta.total_seconds() / 3600, 2)

        photo_urls = []
        for p in order.photos:
            if s3_client:
                try:
                    url = s3_client.generate_presigned_url(
                        'get_object',
                        Params={'Bucket': AWS_BUCKET_NAME, 'Key': p.storage_url},
                        ExpiresIn=3600,
                    )
                    photo_urls.append(url)
                except Exception:
                    photo_urls.append(f"/static/uploads/{p.storage_url}")
            else:
                photo_urls.append(f"/static/uploads/{p.storage_url}")

        output.append({
            "id": order.id,
            "schedule_type": order.schedule_type,
            "task_category": order.task_category,
            "description": order.description,
            "created_at": to_utc_iso(order.created_at),
            "completed_at": to_utc_iso(order.completed_at),
            "time_taken_hours": hours_taken,
            "technician": order.technician_name or "Not Specified",
            "supervisor": order.supervisor_name or "Not Specified",
            "operator": order.operator_name or "Not Specified",
            "photos": photo_urls,
        })
    return jsonify(output), 200


@app.route('/api/machines/<int:machine_id>/active-orders', methods=['GET'])
def get_machine_active_orders(machine_id):
    active_orders = WorkOrder.query.filter(
        WorkOrder.machine_id == machine_id,
        WorkOrder.status != 'completed'
    ).order_by(WorkOrder.created_at.desc()).all()
    return jsonify([{
        "id": order.id,
        "schedule_type": order.schedule_type,
        "task_category": order.task_category,
        "description": order.description,
        "created_at": to_utc_iso(order.created_at),
        "status": order.status,
    } for order in active_orders]), 200


@app.route('/api/machines/<int:machine_id>/reports', methods=['GET'])
def get_machine_reports(machine_id):
    try:
        conn = sqlite3.connect(os.path.join(basedir, 'maintenance.db'))
        conn.row_factory = sqlite3.Row
        reports = conn.execute(
            "SELECT * FROM machine_reports WHERE machine_id = ? ORDER BY created_at DESC", (machine_id,)
        ).fetchall()
        conn.close()
        return jsonify([dict(r) for r in reports]), 200
    except Exception:
        app.logger.exception("Failed to fetch reports")
        return jsonify({"error": "Failed to fetch reports"}), 500


@app.route('/api/work-orders/active', methods=['GET'])
def get_active_work_orders():
    active_orders = WorkOrder.query.filter(WorkOrder.status != 'completed').order_by(WorkOrder.created_at.desc()).all()
    output = []
    for order in active_orders:
        machine = db.session.get(Machine, order.machine_id)
        formatted_id = f"{machine.id:03d}" if machine else "000"
        output.append({
            "id": order.id,
            "machine_raw_name": machine.name if machine else "Unknown Machine",
            "machine_formatted_id": formatted_id,
            "asset_tag": machine.asset_tag if machine else "Unknown Tag",
            "schedule_type": order.schedule_type,
            "task_category": order.task_category,
            "description": order.description,
            "created_at": to_utc_iso(order.created_at),
            "status": order.status,
            "machine_id": order.machine_id,
        })
    return jsonify(output), 200


@app.route('/api/work-orders', methods=['GET'])
def get_all_work_orders():
    page = max(request.args.get('page', 1, type=int), 1)
    limit = min(max(request.args.get('limit', 100, type=int), 1), 500)
    offset = (page - 1) * limit
    all_orders = WorkOrder.query.order_by(WorkOrder.created_at.desc()).offset(offset).limit(limit).all()
    output = []
    for order in all_orders:
        machine = db.session.get(Machine, order.machine_id)
        formatted_id = f"{machine.id:03d}" if machine else "000"
        output.append({
            "id": order.id,
            "machine_raw_name": machine.name if machine else "Unknown Machine",
            "machine_formatted_id": formatted_id,
            "asset_tag": machine.asset_tag if machine else "Unknown Tag",
            "schedule_type": order.schedule_type,
            "task_category": order.task_category,
            "description": order.description,
            "created_at": to_utc_iso(order.created_at),
            "status": order.status,
        })
    return jsonify(output), 200


@app.route('/api/work-orders/report', methods=['POST'])
def report_breakdown():
    machine_id = request.form.get('machine_id', type=int)
    task_category = request.form.get('task_category')
    description = request.form.get('description', 'No notes provided.')

    if not machine_id or not task_category:
        return jsonify({'error': 'Missing required fields'}), 400

    machine = db.session.get(Machine, machine_id)
    if not machine:
        return jsonify({'error': 'Machine not found'}), 404

    new_order = WorkOrder(
        machine_id=machine_id,
        schedule_type='breakdown_report',
        task_category=task_category,
        description=description,
        status='pending',
    )
    machine.status = 'breakdown'
    db.session.add(new_order)
    db.session.commit()

    photo_file = request.files.get('photo')
    if photo_file:
        saved_filename = save_and_upload_file(photo_file, prefix=f"wo_{new_order.id}")
        if saved_filename:
            db.session.add(PhotoRecord(work_order_id=new_order.id, storage_url=saved_filename))
            db.session.commit()

    alert_message = (
        f"URGENT BREAKDOWN\n"
        f"Task ID: {new_order.id}\n"
        f"Machine: [{machine.id:03d}] {machine.name} ({machine.asset_tag})\n"
        f"Category: {task_category}\n"
        f"Notes: {description}"
    )
    send_telegram_alert(alert_message)
    return jsonify({'success': True, 'work_order_id': new_order.id}), 201


@app.route('/api/work-orders/<int:order_id>/complete', methods=['POST'])
def complete_work_order(order_id):
    order = db.session.get(WorkOrder, order_id)
    if not order:
        return jsonify({'error': 'Work order not found'}), 404

    order.status = 'completed'
    order.completed_at = datetime.now(timezone.utc)
    order.supervisor_name = request.form.get('supervisor_name')
    order.technician_name = request.form.get('technician_name')
    order.operator_name = request.form.get('operator_name')

    machine = db.session.get(Machine, order.machine_id)
    if machine:
        machine.status = 'operational'
        machine.last_maintenance = datetime.now(timezone.utc).date()

    photo_file = request.files.get('photo')
    if photo_file:
        saved_filename = save_and_upload_file(photo_file, prefix=f"wo_{order.id}_done")
        if saved_filename:
            db.session.add(PhotoRecord(work_order_id=order.id, storage_url=saved_filename))

    db.session.commit()
    return jsonify({'success': True}), 200


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'}), 200


with app.app_context():
    db.create_all()

if os.environ.get('CMMS_ENABLE_SCHEDULER', 'true').lower() in {'1', 'true', 'yes'}:
    start_scheduler(app)

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=int(os.environ.get('PORT', '5000')), debug=False)
