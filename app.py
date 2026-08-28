import os
import io
import json
import mimetypes
import uuid
import boto3
from PIL import Image, ImageOps, UnidentifiedImageError
from werkzeug.utils import secure_filename
from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
from models import db, WorkOrder, Machine, PhotoRecord
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
database_url = os.environ.get('DATABASE_URL', '').strip()
configured_db_path = os.environ.get('CMMS_DATABASE_PATH', '').strip()
if configured_db_path:
    DB_PATH = os.path.abspath(configured_db_path)
elif database_url.startswith('sqlite:///'):
    DB_PATH = os.path.abspath(database_url.removeprefix('sqlite:///'))
else:
    DB_PATH = os.path.join(basedir, 'maintenance.db')
app = Flask(__name__)

allowed_origins = [
    origin.strip()
    for origin in os.environ.get("CMMS_ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]
CORS(app, resources={r"/api/*": {"origins": allowed_origins}})

app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get(
    'DATABASE_URL',
    'sqlite:///' + DB_PATH
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['MAX_CONTENT_LENGTH'] = int(os.environ.get('CMMS_MAX_UPLOAD_BYTES', 25 * 1024 * 1024))

UPLOAD_FOLDER = os.path.abspath(os.environ.get('CMMS_UPLOAD_FOLDER', os.path.join(basedir, 'static', 'uploads')))
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
MIME_EXTENSIONS = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/heic-sequence': 'heic',
    'image/heif-sequence': 'heif',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
}

def get_db_connection():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_auxiliary_schema():
    """Create tables that were historically installed by one-off scripts."""
    conn = get_db_connection()
    try:
        conn.executescript('''
            CREATE TABLE IF NOT EXISTS machine_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                machine_id INTEGER NOT NULL,
                engineer_type TEXT NOT NULL,
                engineer_name TEXT NOT NULL,
                notes TEXT,
                file_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (machine_id) REFERENCES machines (id)
            );
            CREATE TABLE IF NOT EXISTS spare_parts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                machine_id INTEGER NOT NULL,
                part_name TEXT NOT NULL,
                part_number TEXT,
                quantity INTEGER DEFAULT 0,
                photo_url TEXT,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (machine_id) REFERENCES machines (id)
            );
            CREATE TABLE IF NOT EXISTS part_usage_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                part_id INTEGER NOT NULL,
                quantity_used INTEGER NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (part_id) REFERENCES spare_parts (id)
            );
        ''')
        columns = {row['name'] for row in conn.execute('PRAGMA table_info(spare_parts)')}
        if 'photo_url' not in columns:
            conn.execute('ALTER TABLE spare_parts ADD COLUMN photo_url TEXT')
        conn.commit()
    finally:
        conn.close()


def resolve_upload_extension(file_obj):
    """Resolve an upload extension from its name or MIME type.

    Android document providers and iOS camera uploads sometimes provide a blob
    name without an extension, so MIME fallback is required for those devices.
    """
    safe_name = secure_filename(file_obj.filename or '')
    if '.' in safe_name:
        extension = safe_name.rsplit('.', 1)[1].lower()
        if extension in ALLOWED_EXTENSIONS:
            return extension

    mime_type = (file_obj.mimetype or '').split(';', 1)[0].strip().lower()
    extension = MIME_EXTENSIONS.get(mime_type)
    if extension in ALLOWED_EXTENSIONS:
        return extension

    guessed = mimetypes.guess_extension(mime_type or '') or ''
    guessed = guessed.lstrip('.').lower()
    return guessed if guessed in ALLOWED_EXTENSIONS else None


def uploaded_files(*field_names):
    files = []
    for field_name in field_names:
        files.extend(file_obj for file_obj in request.files.getlist(field_name) if file_obj and file_obj.filename)
    return files


def client_file_url(stored_url):
    if not stored_url:
        return None
    if str(stored_url).startswith(('http://', 'https://')):
        return stored_url
    key = os.path.basename(stored_url)
    if s3_client:
        try:
            return s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': AWS_BUCKET_NAME, 'Key': key},
                ExpiresIn=3600,
            )
        except Exception as exc:
            app.logger.warning('Could not sign S3 file URL: %s', exc)
    return f'/static/uploads/{key}'


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
    if not file_obj or not file_obj.filename:
        return None

    ext = resolve_upload_extension(file_obj)
    if not ext:
        return None
    unique_id = uuid.uuid4().hex[:8]
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')

    if ext in {'jpg', 'jpeg', 'png', 'webp'}:
        try:
            img = ImageOps.exif_transpose(Image.open(file_obj))
        except (UnidentifiedImageError, OSError):
            return None
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
            extra_args = {'ContentType': file_obj.mimetype} if file_obj.mimetype else None
            if extra_args:
                s3_client.upload_fileobj(file_obj, AWS_BUCKET_NAME, filename, ExtraArgs=extra_args)
            else:
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


@app.errorhandler(413)
def upload_too_large(_error):
    max_mb = app.config['MAX_CONTENT_LENGTH'] // (1024 * 1024)
    return jsonify({'error': f'Upload is too large. Maximum request size is {max_mb} MB.'}), 413


def to_utc_iso(dt):
    if not dt:
        return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


@app.route('/api/predictive-analysis', methods=['GET'])
def api_predictive_analysis():
    try:
        results, alerts_sent = run_predictive_analysis(DB_PATH)
        return jsonify({"success": True, "results": results, "alerts_sent": alerts_sent}), 200
    except Exception:
        app.logger.exception("Predictive analysis failed")
        return jsonify({"success": False, "error": "Predictive analysis failed"}), 500


@app.route('/api/run-predictions', methods=['POST'])
def api_run_predictions():
    try:
        _, alerts_sent = run_predictive_analysis(DB_PATH)
        return jsonify({"message": f"Predictions run successfully. {alerts_sent} alerts sent.", "alerts_sent": alerts_sent}), 200
    except Exception:
        app.logger.exception("Prediction run failed")
        return jsonify({"success": False, "error": "Prediction run failed"}), 500


@app.route('/api/reports/weekly', methods=['GET'])
def api_download_weekly_report():
    try:
        filepath = generate_weekly_pdf_report(DB_PATH, send_telegram=False)
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
        conn = get_db_connection()
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
    conn = None
    try:
        conn = get_db_connection()
        reports = conn.execute(
            "SELECT * FROM machine_reports WHERE machine_id = ? ORDER BY created_at DESC", (machine_id,)
        ).fetchall()
        output = []
        for report in reports:
            item = dict(report)
            item['file_url'] = client_file_url(item.get('file_url'))
            output.append(item)
        return jsonify(output), 200
    except Exception:
        app.logger.exception("Failed to fetch reports")
        return jsonify({"error": "Failed to fetch reports"}), 500
    finally:
        if conn:
            conn.close()


@app.route('/api/reports', methods=['POST'])
def upload_report():
    machine_id = request.form.get('machine_id', type=int)
    engineer_type = (request.form.get('engineer_type') or '').strip().lower()
    engineer_name = (request.form.get('engineer_name') or '').strip()
    notes = (request.form.get('notes') or '').strip()

    if not machine_id or engineer_type not in {'internal', 'external'} or not engineer_name:
        return jsonify({'error': 'Machine, engineer type, and engineer name are required.'}), 400
    if len(engineer_name) > 100:
        return jsonify({'error': 'Engineer name must be 100 characters or fewer.'}), 400

    conn = get_db_connection()
    if not conn.execute('SELECT id FROM machines WHERE id = ?', (machine_id,)).fetchone():
        conn.close()
        return jsonify({'error': 'Machine not found.'}), 404

    report_file = request.files.get('file')
    stored_filename = None
    if report_file and report_file.filename:
        stored_filename = save_and_upload_file(report_file, prefix=f'rep_{machine_id}')
        if not stored_filename:
            conn.close()
            return jsonify({
                'error': 'Unsupported or unreadable file. Use PDF, Word, Excel, JPG, PNG, WEBP, HEIC, or HEIF.'
            }), 415

    try:
        cursor = conn.execute(
            '''INSERT INTO machine_reports (machine_id, engineer_type, engineer_name, notes, file_url)
               VALUES (?, ?, ?, ?, ?)''',
            (machine_id, engineer_type, engineer_name, notes, stored_filename),
        )
        conn.commit()
        return jsonify({
            'message': 'Report uploaded successfully.',
            'report': {
                'id': cursor.lastrowid,
                'machine_id': machine_id,
                'engineer_type': engineer_type,
                'engineer_name': engineer_name,
                'notes': notes,
                'file_url': client_file_url(stored_filename),
            },
        }), 201
    except Exception:
        if conn:
            conn.rollback()
        app.logger.exception('Failed to save inspection report')
        return jsonify({'error': 'Failed to save report.'}), 500
    finally:
        if conn:
            conn.close()


@app.route('/api/reports', methods=['GET'])
def get_all_reports():
    page = max(request.args.get('page', 1, type=int), 1)
    limit = min(max(request.args.get('limit', 20, type=int), 1), 100)
    offset = (page - 1) * limit
    conn = None
    try:
        conn = get_db_connection()
        reports = conn.execute(
            '''SELECT r.*, m.name AS machine_name, m.id AS m_id
               FROM machine_reports r
               LEFT JOIN machines m ON r.machine_id = m.id
               ORDER BY r.created_at DESC
               LIMIT ? OFFSET ?''',
            (limit, offset),
        ).fetchall()
        output = []
        for report in reports:
            item = dict(report)
            item['formatted_id'] = f"{item['m_id']:03d}" if item.get('m_id') else '000'
            item['file_url'] = client_file_url(item.get('file_url'))
            output.append(item)
        return jsonify(output), 200
    except Exception:
        app.logger.exception('Failed to fetch reports')
        return jsonify({'error': 'Failed to fetch reports.'}), 500
    finally:
        if conn:
            conn.close()


@app.route('/api/reports/monthly-pm/download', methods=['GET'])
def download_monthly_pm_report():
    try:
        import openpyxl
        from collections import defaultdict
        from openpyxl.styles import Font
    except ImportError:
        return jsonify({'error': 'openpyxl is not installed on the server.'}), 500

    conn = None
    try:
        conn = get_db_connection()
        records = conn.execute(
            '''SELECT w.*, m.name AS machine_name, m.asset_tag
               FROM work_orders w
               LEFT JOIN machines m ON w.machine_id = m.id
               WHERE w.schedule_type != 'breakdown_report' AND w.status = 'completed'
               ORDER BY w.completed_at DESC'''
        ).fetchall()

        grouped_records = defaultdict(list)
        for record in records:
            completed = parse_sqlite_date(record['completed_at'])
            grouped_records[completed.strftime('%b %Y') if completed else 'Unknown Month'].append(record)

        workbook = openpyxl.Workbook()
        if not grouped_records:
            worksheet = workbook.active
            worksheet.title = 'No Data'
            worksheet.append(['No preventive maintenance records found.'])
        else:
            workbook.remove(workbook.active)
            headers = [
                'Machine Name', 'Asset Tag', 'Task Category', 'Schedule Type',
                'Completed Date', 'Technician', 'Supervisor', 'Service Notes',
            ]
            for month, month_records in grouped_records.items():
                worksheet = workbook.create_sheet(title=str(month)[:31])
                worksheet.append(headers)
                for cell in worksheet[1]:
                    cell.font = Font(bold=True)
                for record in month_records:
                    completed = parse_sqlite_date(record['completed_at'])
                    worksheet.append([
                        record['machine_name'], record['asset_tag'] or 'N/A', record['task_category'],
                        record['schedule_type'], completed.strftime('%Y-%m-%d %H:%M') if completed else '',
                        record['technician_name'], record['supervisor_name'], record['description'],
                    ])
                for column_cells in worksheet.columns:
                    width = min(max(len(str(cell.value or '')) for cell in column_cells) + 2, 50)
                    worksheet.column_dimensions[column_cells[0].column_letter].width = width

        output = io.BytesIO()
        workbook.save(output)
        output.seek(0)
        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name='All_PM_Reports.xlsx',
        )
    except Exception:
        app.logger.exception('Failed to generate monthly PM report')
        return jsonify({'error': 'Failed to generate report.'}), 500
    finally:
        if conn:
            conn.close()


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

    for photo_file in uploaded_files('photos', 'photo'):
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


@app.route('/api/work-orders/preventive', methods=['POST'])
def log_preventive_maintenance():
    machine_id = request.form.get('machine_id', type=int)
    task_category = (request.form.get('task_category') or '').strip()
    if not machine_id or not task_category:
        return jsonify({'error': 'Machine and task category are required.'}), 400

    machine = db.session.get(Machine, machine_id)
    if not machine:
        return jsonify({'error': 'Machine not found.'}), 404

    now_utc = datetime.now(timezone.utc)
    order = WorkOrder(
        machine_id=machine_id,
        schedule_type='preventive_maintenance',
        task_category=task_category,
        description=request.form.get('description', 'Routine maintenance completed.'),
        status='completed',
        completed_at=now_utc,
        supervisor_name=request.form.get('supervisor_name'),
        technician_name=request.form.get('technician_name'),
        operator_name=request.form.get('operator_name'),
    )
    machine.last_maintenance = now_utc.date()
    machine.next_maintenance = now_utc.date() + timedelta(days=30)
    machine.status = 'operational'
    db.session.add(order)
    db.session.flush()

    for photo_file in uploaded_files('photos', 'photo'):
        saved_filename = save_and_upload_file(photo_file, prefix=f'pm_{order.id}')
        if saved_filename:
            db.session.add(PhotoRecord(work_order_id=order.id, storage_url=saved_filename))

    db.session.commit()
    return jsonify({'message': 'Preventive maintenance logged.', 'order_id': order.id}), 201


@app.route('/api/work-orders/<int:order_id>/complete', methods=['POST'])
def complete_work_order(order_id):
    order = db.session.get(WorkOrder, order_id)
    if not order:
        return jsonify({'error': 'Work order not found'}), 404
    if order.status == 'completed':
        return jsonify({'error': 'Work order is already completed.'}), 409

    data = request.get_json(silent=True) or {}
    form_data = request.form
    order.supervisor_name = data.get('supervisor_name') or form_data.get('supervisor_name') or form_data.get('supervisor')
    order.technician_name = data.get('technician_name') or form_data.get('technician_name') or form_data.get('technician')
    order.operator_name = data.get('operator_name') or form_data.get('operator_name')
    resolution_notes = data.get('resolution_notes') or form_data.get('notes') or ''
    parts_used = data.get('parts_used') or form_data.get('parts_used')
    if isinstance(parts_used, str):
        try:
            parts_used = json.loads(parts_used)
        except json.JSONDecodeError:
            return jsonify({'error': 'parts_used must be valid JSON.'}), 400
    if resolution_notes:
        order.description = f'{order.description or ""}\n\n[Resolution]: {resolution_notes}'.strip()

    order.status = 'completed'
    now_utc = datetime.now(timezone.utc)
    order.completed_at = now_utc

    machine = db.session.get(Machine, order.machine_id)
    if machine:
        machine.status = 'operational'
        machine.last_maintenance = now_utc.date()
        machine.next_maintenance = now_utc.date() + timedelta(days=30)

    db.session.commit()

    inventory_warning = None
    if isinstance(parts_used, list):
        conn = get_db_connection()
        try:
            for part in parts_used:
                part_id = part.get('part_id') if isinstance(part, dict) else None
                try:
                    requested = int(part.get('quantity', 0))
                except (AttributeError, TypeError, ValueError):
                    continue
                if not part_id or requested <= 0:
                    continue
                current = conn.execute(
                    'SELECT quantity FROM spare_parts WHERE id = ?', (part_id,)
                ).fetchone()
                if not current:
                    continue
                deducted = min(requested, max(current['quantity'], 0))
                conn.execute(
                    'UPDATE spare_parts SET quantity = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?',
                    (current['quantity'] - deducted, part_id),
                )
                if deducted:
                    conn.execute(
                        'INSERT INTO part_usage_logs (part_id, quantity_used) VALUES (?, ?)',
                        (part_id, deducted),
                    )
            conn.commit()
        except Exception:
            conn.rollback()
            app.logger.exception('Failed to deduct parts for work order %s', order_id)
            inventory_warning = 'Work order completed, but inventory could not be updated.'
        finally:
            conn.close()

    for photo_file in uploaded_files('photos', 'photo'):
        saved_filename = save_and_upload_file(photo_file, prefix=f"wo_{order.id}_done")
        if saved_filename:
            db.session.add(PhotoRecord(work_order_id=order.id, storage_url=saved_filename))

    db.session.commit()
    response = {'success': True, 'message': 'Work order completed.'}
    if inventory_warning:
        response['warning'] = inventory_warning
    return jsonify(response), 200


@app.route('/api/work-orders/<int:order_id>/photos', methods=['POST'])
def upload_work_order_photos(order_id):
    if not db.session.get(WorkOrder, order_id):
        return jsonify({'error': 'Work order not found.'}), 404
    files = uploaded_files('photos', 'photo')
    if not files:
        return jsonify({'error': 'No photos were provided.'}), 400

    saved_count = 0
    for photo_file in files:
        saved_filename = save_and_upload_file(photo_file, prefix=f'wo_{order_id}_done')
        if saved_filename:
            db.session.add(PhotoRecord(work_order_id=order_id, storage_url=saved_filename))
            saved_count += 1
    if not saved_count:
        return jsonify({'error': 'No supported image files were provided.'}), 415
    db.session.commit()
    return jsonify({'message': 'Photos uploaded.', 'count': saved_count}), 201


@app.route('/api/machines/<int:machine_id>/parts', methods=['GET'])
def get_spare_parts(machine_id):
    conn = None
    try:
        conn = get_db_connection()
        parts = conn.execute(
            'SELECT * FROM spare_parts WHERE machine_id = ? ORDER BY part_name ASC',
            (machine_id,),
        ).fetchall()
        output = []
        for part in parts:
            item = dict(part)
            item['photo_url'] = client_file_url(item.get('photo_url'))
            output.append(item)
        return jsonify(output), 200
    except Exception:
        app.logger.exception('Failed to fetch spare parts')
        return jsonify({'error': 'Failed to fetch parts.'}), 500
    finally:
        if conn:
            conn.close()


@app.route('/api/machines/<int:machine_id>/parts', methods=['POST'])
def add_spare_part(machine_id):
    part_name = (request.form.get('part_name') or '').strip()
    part_number = (request.form.get('part_number') or '').strip()
    quantity = request.form.get('quantity', 0, type=int)
    if not part_name:
        return jsonify({'error': 'Part name is required.'}), 400
    if quantity is None or quantity < 0:
        return jsonify({'error': 'Quantity must be a non-negative integer.'}), 400

    conn = get_db_connection()
    if not conn.execute('SELECT id FROM machines WHERE id = ?', (machine_id,)).fetchone():
        conn.close()
        return jsonify({'error': 'Machine not found.'}), 404

    photo_file = request.files.get('photo')
    stored_filename = None
    if photo_file and photo_file.filename:
        stored_filename = save_and_upload_file(photo_file, prefix=f'part_{machine_id}')
        if not stored_filename:
            conn.close()
            return jsonify({'error': 'Unsupported or unreadable part image.'}), 415

    try:
        cursor = conn.execute(
            '''INSERT INTO spare_parts (machine_id, part_name, part_number, quantity, photo_url)
               VALUES (?, ?, ?, ?, ?)''',
            (machine_id, part_name, part_number, quantity, stored_filename),
        )
        conn.commit()
        return jsonify({'message': 'Spare part added.', 'id': cursor.lastrowid}), 201
    except Exception:
        if conn:
            conn.rollback()
        app.logger.exception('Failed to add spare part')
        return jsonify({'error': 'Failed to add spare part.'}), 500
    finally:
        if conn:
            conn.close()


@app.route('/api/parts/<int:part_id>', methods=['PUT'])
def update_spare_part(part_id):
    data = request.get_json(silent=True) or {}
    quantity = data.get('quantity')
    if isinstance(quantity, bool):
        quantity = None
    try:
        quantity = int(quantity)
    except (TypeError, ValueError):
        return jsonify({'error': 'Quantity must be an integer.'}), 400
    if quantity < 0:
        return jsonify({'error': 'Quantity cannot be negative.'}), 400

    conn = get_db_connection()
    try:
        existing = conn.execute(
            'SELECT quantity FROM spare_parts WHERE id = ?', (part_id,)
        ).fetchone()
        if not existing:
            return jsonify({'error': 'Spare part not found.'}), 404
        if quantity < existing['quantity']:
            conn.execute(
                'INSERT INTO part_usage_logs (part_id, quantity_used) VALUES (?, ?)',
                (part_id, existing['quantity'] - quantity),
            )
        conn.execute(
            'UPDATE spare_parts SET quantity = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?',
            (quantity, part_id),
        )
        conn.commit()
        return jsonify({'message': 'Spare part updated.'}), 200
    except Exception:
        conn.rollback()
        app.logger.exception('Failed to update spare part')
        return jsonify({'error': 'Failed to update spare part.'}), 500
    finally:
        conn.close()


@app.route('/api/analytics', methods=['GET'])
def get_analytics():
    conn = None
    try:
        conn = get_db_connection()
        orders = conn.execute("SELECT * FROM work_orders WHERE status = 'completed'").fetchall()
        machines = conn.execute('SELECT id, name FROM machines').fetchall()
        machine_stats = {
            machine['id']: {'name': machine['name'], 'breakdowns': 0, 'downtime': 0.0}
            for machine in machines
        }
        temporal_stats = {day: 0 for day in ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']}
        team_stats = {}
        total_downtime = 0.0
        breakdown_count = 0
        pm_count = 0

        for order in orders:
            is_breakdown = order['schedule_type'] == 'breakdown_report'
            breakdown_count += int(is_breakdown)
            pm_count += int(not is_breakdown)
            created = parse_sqlite_date(order['created_at'])
            completed = parse_sqlite_date(order['completed_at'])
            hours = max((completed - created).total_seconds() / 3600, 0) if created and completed else 0
            technician = order['technician_name'] or 'Unassigned'
            stats = team_stats.setdefault(technician, {'tasks': 0, 'total_hours': 0.0})
            stats['tasks'] += 1
            stats['total_hours'] += hours
            if is_breakdown:
                total_downtime += hours
                machine = machine_stats.get(order['machine_id'])
                if machine:
                    machine['breakdowns'] += 1
                    machine['downtime'] += hours
                if created:
                    temporal_stats[created.strftime('%A')] += 1

        assumed_hours = 720
        chart_data = []
        for stats in machine_stats.values():
            failures = stats['breakdowns']
            downtime = stats['downtime']
            chart_data.append({
                'name': stats['name'],
                'Breakdowns': failures,
                'Downtime (Hrs)': round(downtime, 1),
                'MTTR': round(downtime / failures, 1) if failures else 0,
                'MTBF': round((assumed_hours - downtime) / failures, 1) if failures else assumed_hours,
            })

        total_operating_hours = max(len(machines) * assumed_hours - total_downtime, 0)
        return jsonify({
            'mttr': round(total_downtime / breakdown_count, 1) if breakdown_count else 0,
            'mtbf': round(total_operating_hours / breakdown_count, 1) if breakdown_count else total_operating_hours,
            'total_breakdowns': breakdown_count,
            'total_downtime': round(total_downtime, 1),
            'chart_data': chart_data,
            'temporal_chart': [{'day': day[:3], 'Breakdowns': count} for day, count in temporal_stats.items()],
            'team_chart': [
                {
                    'name': name,
                    'Tasks': stats['tasks'],
                    'AvgTime': round(stats['total_hours'] / stats['tasks'], 1) if stats['tasks'] else 0,
                }
                for name, stats in team_stats.items()
            ],
            'ratio_chart': [
                {'name': 'Preventive (PM)', 'value': pm_count},
                {'name': 'Reactive (Breakdown)', 'value': breakdown_count},
            ],
        }), 200
    except Exception:
        app.logger.exception('Failed to generate analytics')
        return jsonify({'error': 'Failed to generate analytics.'}), 500
    finally:
        if conn:
            conn.close()


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'}), 200


with app.app_context():
    db.create_all()
    ensure_auxiliary_schema()

if os.environ.get('CMMS_ENABLE_SCHEDULER', 'true').lower() in {'1', 'true', 'yes'}:
    start_scheduler(app)

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=int(os.environ.get('PORT', '5000')), debug=False)
