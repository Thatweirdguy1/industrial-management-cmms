import os
import io
import uuid
import requests
import boto3
from PIL import Image
from botocore.exceptions import NoCredentialsError
from werkzeug.utils import secure_filename
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from models import db, WorkOrder, User, Machine, PhotoRecord
from datetime import datetime, timezone, timedelta
import sqlite3

try:
    from tasks import start_scheduler
except ImportError:
    def start_scheduler(app): pass

basedir = os.path.abspath(os.path.dirname(__file__))
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'maintenance.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

UPLOAD_FOLDER = os.path.join(basedir, 'static', 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

db.init_app(app)

# --- AWS S3 CONFIGURATION ---
AWS_ACCESS_KEY = 'YOUR_AWS_ACCESS_KEY'
AWS_SECRET_KEY = 'YOUR_AWS_SECRET_KEY'
AWS_BUCKET_NAME = 'dadri-plant-maintenance'
AWS_REGION = 'ap-south-1' 

s3_client = boto3.client(
    's3',
    aws_access_key_id=AWS_ACCESS_KEY,
    aws_secret_access_key=AWS_SECRET_KEY,
    region_name=AWS_REGION
)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'pdf', 'doc', 'docx', 'xls', 'xlsx'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# --- DATE PARSING HELPER ---
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
        
        if AWS_ACCESS_KEY != 'YOUR_AWS_ACCESS_KEY':
            try:
                s3_client.upload_fileobj(img_io, AWS_BUCKET_NAME, filename, ExtraArgs={'ContentType': 'image/jpeg'})
                return filename
            except Exception as e:
                print(f"❌ AWS Upload failed: {e}")
        
        with open(filepath, 'wb') as f:
            f.write(img_io.read())
        return filename
    else:
        filename = f"{prefix}_{timestamp}_{unique_id}.{ext}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        if AWS_ACCESS_KEY != 'YOUR_AWS_ACCESS_KEY':
            try:
                s3_client.upload_fileobj(file_obj, AWS_BUCKET_NAME, filename)
                return filename
            except Exception as e:
                print(f"❌ AWS Upload failed: {e}")
                
        file_obj.save(filepath)
        return filename

# --- TELEGRAM CONFIGURATION ---
def send_telegram_alert(message, reply_to_message_id=None):
    BOT_TOKEN = '8809133258:AAGMvbwWEp_T0TVYLezec4KM5d6X_R-Ty04'
    GROUP_CHAT_ID = '-5182937655' 
    print(f"\n[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] 🚨 FIRING TELEGRAM ALERT...")
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    payload = {'chat_id': GROUP_CHAT_ID, 'text': message, 'parse_mode': 'Markdown'}
    if reply_to_message_id:
        payload['reply_to_message_id'] = reply_to_message_id
    try:
        res = requests.post(url, json=payload).json()
        if res.get("ok"):
            return res["result"]["message_id"]
    except Exception as e:
        print(f"❌ Telegram Error: {e}")
    return None

def to_utc_iso(dt):
    if not dt: return datetime.now(timezone.utc).isoformat() + 'Z'
    iso = dt.isoformat()
    if not iso.endswith('Z') and '+' not in iso:
        return iso + 'Z'
    return iso

# --- ROUTES ---
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
            
            breakdowns = conn.execute("SELECT * FROM work_orders WHERE machine_id=? AND schedule_type='breakdown_report' AND status='completed'", (m_id,)).fetchall()
            b_count = len(breakdowns)
            
            assumed_op_hours = 720
            mtbf = (assumed_op_hours * 6) / b_count if b_count > 0 else 5000 
            
            last_fix_record = conn.execute("SELECT completed_at FROM work_orders WHERE machine_id=? AND status='completed' ORDER BY completed_at DESC LIMIT 1", (m_id,)).fetchone()
            
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
                        days_overdue = (now - next_pm).days
                        pm_penalty = min(days_overdue * 2, 40) 
                except Exception:
                    pass
            
            base_risk = (hours_since_last_fix / mtbf) * 100
            total_risk = min(round(base_risk + pm_penalty, 1), 99.9)
            
            if m['status'] == 'breakdown':
                total_risk = 100.0
                
            output.append({
                "id": m['id'],
                "name": m['name'],
                "asset_tag": m['asset_tag'],
                "last_maintenance": m['last_maintenance'] if m['last_maintenance'] else "Never",
                "next_maintenance": m['next_maintenance'] if m['next_maintenance'] else "Not Scheduled",
                "status": m['status'],
                "risk_score": total_risk
            })
            
        conn.close()
        return jsonify(output), 200
    except Exception as e:
        print(f"❌ Error in get_machines: {e}")
        return jsonify({"error": "Failed to extract machine array"}), 500

@app.route('/api/machines/<int:machine_id>/history', methods=['GET'])
def get_machine_history(machine_id):
    history = WorkOrder.query.filter_by(machine_id=machine_id, status='completed').order_by(WorkOrder.completed_at.desc()).all()
    output = []
    for order in history:
        hours_taken = 0
        if order.completed_at and order.created_at:
            time_delta = order.completed_at.replace(tzinfo=None) - order.created_at.replace(tzinfo=None)
            hours_taken = round(time_delta.total_seconds() / 3600, 2)
            
        photo_urls = []
        for p in order.photos:
            if AWS_ACCESS_KEY != 'YOUR_AWS_ACCESS_KEY':
                try:
                    url = s3_client.generate_presigned_url('get_object', Params={'Bucket': AWS_BUCKET_NAME, 'Key': p.storage_url}, ExpiresIn=3600)
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
            "photos": photo_urls
        })
    return jsonify(output), 200

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
    except Exception as e:
        print(f"❌ Error getting reports: {e}")
        return jsonify({"error": "Failed to fetch reports"}), 500

@app.route('/api/work-orders', methods=['GET'])
def get_all_work_orders():
    # Return all work orders ordered by creation date descending
    all_orders = WorkOrder.query.order_by(WorkOrder.created_at.desc()).limit(500).all()
    output = []
    for order in all_orders:
        machine = Machine.query.get(order.machine_id)
        # Add a safely padded ID
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
            "status": order.status
        })
    return jsonify(output), 200

@app.route('/api/work-orders/report', methods=['POST'])
def report_breakdown():
    machine_id = request.form.get('machine_id')
    task_category = request.form.get('task_category')
    description = request.form.get('description', 'No notes provided.')
    
    if not machine_id or not task_category:
        return jsonify({'error': 'Missing required fields'}), 400
    
    new_order = WorkOrder(
        machine_id=machine_id,
        schedule_type='breakdown_report',
        task_category=task_category,
        description=description,
        status='pending'
    )
    
    machine = Machine.query.get(machine_id)
    if machine:
        machine.status = 'breakdown'
        
    db.session.add(new_order)
    db.session.commit()
    
    photo_file = request.files.get('photo')
    if photo_file:
        saved_filename = save_and_upload_file(photo_file, prefix=f"wo_{new_order.id}")
        if saved_filename:
            new_photo = PhotoRecord(work_order_id=new_order.id, storage_url=saved_filename)
            db.session.add(new_photo)
            db.session.commit()
    
    # 3 Digit Padded ID formatting
    formatted_id = f"{machine.id:03d}" if machine else "000"
    machine_name = machine.name if machine else "Unknown Machine"
    asset_tag = machine.asset_tag if machine else "Unknown Tag"
    
    alert_message = (
        f"🚨 *URGENT BREAKDOWN / अति आवश्यक खराबी* 🚨\n\n"
        f"🎫 *Task ID:* {new_order.id}\n"
        f"🏭 *Plant / प्लांट:* Dadri Main Floor\n"
        f"⚙️ *Machine / मशीन:* *[{formatted_id}]* {machine_name} ({asset_tag})\n"
        f"🔧 *Category / श्रेणी:* {task_category.upper()}\n"
        f"📝 *Notes / विवरण:* {description}\n\n"
        f"👉 _Please check the dashboard to assign a technician._"
    )
    msg_id = send_telegram_alert(alert_message)
    if msg_id:
        new_order.telegram_message_id = str(msg_id)
        db.session.commit()
    
    return jsonify({"message": "Breakdown reported successfully.", "order_id": new_order.id}), 201

@app.route('/api/work-orders/preventive', methods=['POST'])
def log_preventive_maintenance():
    try:
        now_utc = datetime.now(timezone.utc)
        new_order = WorkOrder(
            machine_id=request.form.get('machine_id'),
            schedule_type='preventive_maintenance',
            task_category=request.form.get('task_category'),
            description=request.form.get('description', 'Routine maintenance completed.'),
            status='completed',
            completed_at=now_utc,
            supervisor_name=request.form.get('supervisor_name'),
            technician_name=request.form.get('technician_name'),
            operator_name=request.form.get('operator_name')
        )
        db.session.add(new_order)
        db.session.commit() 
        
        photo_file = request.files.get('photo')
        if photo_file:
            saved_filename = save_and_upload_file(photo_file, prefix=f"pm_{new_order.id}")
            if saved_filename:
                new_photo = PhotoRecord(work_order_id=new_order.id, storage_url=saved_filename)
                db.session.add(new_photo)
                
        machine = Machine.query.get(request.form.get('machine_id'))
        if machine:
            machine.last_maintenance = now_utc.date()
            machine.next_maintenance = now_utc.date() + timedelta(days=30)
            machine.status = 'operational'
            
        db.session.commit()
        return jsonify({"message": "Preventive maintenance logged.", "order_id": new_order.id}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/work-orders/<int:order_id>/complete', methods=['POST'])
def complete_work_order(order_id):
    order = WorkOrder.query.get_or_404(order_id)
    if order.status == 'completed':
        return jsonify({"error": "Already completed"}), 400
        
    data = request.json or {}
    order.supervisor_name = data.get('supervisor_name')
    order.technician_name = data.get('technician_name')
    order.operator_name = data.get('operator_name')
    
    # Append the resolution notes into the description
    resolution_notes = data.get('resolution_notes', '')
    if resolution_notes:
        order.description = f"{order.description}\n\n[Resolution]: {resolution_notes}"

    now_utc = datetime.now(timezone.utc)
    order.completed_at = now_utc
    order.status = 'completed'
    
    machine = Machine.query.get(order.machine_id)
    if machine and machine.status == 'breakdown':
        machine.status = 'operational'
        machine.last_maintenance = now_utc.date()
        machine.next_maintenance = now_utc.date() + timedelta(days=30)
        
    created_dt = order.created_at.replace(tzinfo=None) if order.created_at else now_utc.replace(tzinfo=None)
    time_delta = now_utc.replace(tzinfo=None) - created_dt
    hours_taken = round(time_delta.total_seconds() / 3600, 2)
    db.session.commit()
    
    formatted_id = f"{machine.id:03d}" if machine else "000"
    tech_name = order.technician_name or "Not Specified"
    
    completion_message = (
        f"✅ *MACHINE REPAIRED / मशीन की मरम्मत हो गई* ✅\n\n"
        f"⚙️ *Machine / मशीन:* *[{formatted_id}]* {machine.name if machine else 'Unknown'} ({machine.asset_tag if machine else 'N/A'})\n"
        f"👨‍🔧 *Repaired By / तकनीशियन:* {tech_name}\n"
        f"🛠 *Fix Details / विवरण:* {resolution_notes}\n"
        f"⏱️ *Total Downtime / कुल डाउनटाइम:* {hours_taken} Hrs\n"
        f"Status is now OPERATIONAL. / मशीन अब चालू है।"
    )
    send_telegram_alert(completion_message, reply_to_message_id=order.telegram_message_id)
    
    return jsonify({"message": "Work order signed off successfully.", "time_taken_hours": hours_taken}), 200

@app.route('/api/reports', methods=['POST'])
def upload_report():
    machine_id = request.form.get('machine_id')
    engineer_type = request.form.get('engineer_type')
    engineer_name = request.form.get('engineer_name')
    notes = request.form.get('notes', '')
    
    if not machine_id or not engineer_type or not engineer_name:
        return jsonify({'error': 'Missing required fields'}), 400
        
    report_file = request.files.get('file')
    file_url = None
    
    if report_file:
        saved_filename = save_and_upload_file(report_file, prefix=f"rep_{machine_id}")
        if saved_filename:
            file_url = f"/static/uploads/{saved_filename}"
    try:
        conn = sqlite3.connect(os.path.join(basedir, 'maintenance.db'))
        conn.execute(
            '''INSERT INTO machine_reports (machine_id, engineer_type, engineer_name, notes, file_url)
               VALUES (?, ?, ?, ?, ?)''',
            (machine_id, engineer_type, engineer_name, notes, file_url)
        )
        conn.commit()
        conn.close()
        return jsonify({'message': 'Report uploaded successfully'}), 201
    except Exception as e:
        print(f"Report Database Error: {e}")
        return jsonify({'error': 'Failed to save report to database'}), 500

@app.route('/api/reports', methods=['GET'])
def get_all_reports():
    try:
        conn = sqlite3.connect(os.path.join(basedir, 'maintenance.db'))
        conn.row_factory = sqlite3.Row
        
        # Join with machines to get machine details
        reports = conn.execute('''
            SELECT r.*, m.machine_name, m.formatted_id
            FROM machine_reports r
            LEFT JOIN machines m ON r.machine_id = m.id
            ORDER BY r.created_at DESC
        ''').fetchall()
        
        conn.close()
        return jsonify([dict(r) for r in reports]), 200
    except Exception as e:
        print(f"❌ Error getting all reports: {e}")
        return jsonify({"error": "Failed to fetch reports"}), 500

@app.route('/api/machines/<int:machine_id>/parts', methods=['GET'])
def get_spare_parts(machine_id):
    try:
        conn = sqlite3.connect(os.path.join(basedir, 'maintenance.db'))
        conn.row_factory = sqlite3.Row
        parts = conn.execute('SELECT * FROM spare_parts WHERE machine_id = ? ORDER BY part_name ASC', (machine_id,)).fetchall()
        conn.close()
        
        output = []
        for p in parts:
            part_dict = dict(p)
            if part_dict.get('photo_url'):
                if AWS_ACCESS_KEY != 'YOUR_AWS_ACCESS_KEY':
                    try:
                        part_dict['photo_url'] = s3_client.generate_presigned_url('get_object', Params={'Bucket': AWS_BUCKET_NAME, 'Key': part_dict['photo_url'].replace('/static/uploads/', '')}, ExpiresIn=3600)
                    except Exception:
                        pass
            output.append(part_dict)
            
        return jsonify(output), 200
    except Exception as e:
        print(f"Fetch Parts Error: {e}")
        return jsonify({'error': 'Failed to fetch parts'}), 500

@app.route('/api/machines/<int:machine_id>/parts', methods=['POST'])
def add_spare_part(machine_id):
    part_name = request.form.get('part_name')
    part_number = request.form.get('part_number', '')
    quantity = request.form.get('quantity', 0)
    
    if not part_name:
        return jsonify({'error': 'Part name is required'}), 400
        
    part_photo = request.files.get('photo')
    photo_url = None
    
    if part_photo:
        saved_filename = save_and_upload_file(part_photo, prefix=f"part_{machine_id}")
        if saved_filename:
            photo_url = f"/static/uploads/{saved_filename}"
            
    try:
        conn = sqlite3.connect(os.path.join(basedir, 'maintenance.db'))
        conn.execute(
            '''INSERT INTO spare_parts (machine_id, part_name, part_number, quantity, photo_url)
               VALUES (?, ?, ?, ?, ?)''',
            (machine_id, part_name, part_number, quantity, photo_url)
        )
        conn.commit()
        conn.close()
        return jsonify({'message': 'Spare part added successfully'}), 201
    except Exception as e:
        print(f"Add Part Error: {e}")
        return jsonify({'error': 'Failed to add spare part'}), 500

@app.route('/api/parts/<int:part_id>', methods=['PUT'])
def update_spare_part(part_id):
    data = request.json
    quantity = data.get('quantity')
    
    if quantity is None:
        return jsonify({'error': 'Quantity is required'}), 400
        
    try:
        conn = sqlite3.connect(os.path.join(basedir, 'maintenance.db'))
        conn.execute(
            'UPDATE spare_parts SET quantity = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?',
            (quantity, part_id)
        )
        conn.commit()
        conn.close()
        return jsonify({'message': 'Spare part updated successfully'}), 200
    except Exception as e:
        print(f"Update Part Error: {e}")
        return jsonify({'error': 'Failed to update spare part'}), 500

@app.route('/api/analytics', methods=['GET'])
def get_analytics():
    try:
        conn = sqlite3.connect(os.path.join(basedir, 'maintenance.db'))
        conn.row_factory = sqlite3.Row
        
        all_orders = conn.execute("SELECT * FROM work_orders WHERE status='completed'").fetchall()
        machines = conn.execute("SELECT id, name FROM machines").fetchall()
        
        machine_stats = {m['id']: {'name': m['name'], 'breakdowns': 0, 'downtime': 0} for m in machines}
        
        total_downtime = 0
        breakdown_count = 0
        pm_count = 0
        
        days_of_week = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        temporal_stats = {day: 0 for day in days_of_week}
        team_stats = {}
        
        for b in all_orders:
            is_breakdown = b['schedule_type'] == 'breakdown_report'
            if is_breakdown:
                breakdown_count += 1
            else:
                pm_count += 1
            
            tech = b['technician_name'] or "Unassigned"
            if tech not in team_stats:
                team_stats[tech] = {'tasks': 0, 'total_hours': 0}
            team_stats[tech]['tasks'] += 1
            
            created = parse_sqlite_date(b['created_at'])
            completed = parse_sqlite_date(b['completed_at'])
            
            hours = 0
            if completed and created:
                hours = (completed - created).total_seconds() / 3600
                
            team_stats[tech]['total_hours'] += hours
            
            if is_breakdown:
                total_downtime += hours
                m_id = b['machine_id']
                if m_id in machine_stats:
                    machine_stats[m_id]['breakdowns'] += 1
                    machine_stats[m_id]['downtime'] += hours
                
                if created:
                    day_name = created.strftime('%A')
                    if day_name in temporal_stats:
                        temporal_stats[day_name] += 1
                
        mttr = round(total_downtime / breakdown_count, 1) if breakdown_count > 0 else 0
        
        assumed_op_hours_per_machine = 720 
        total_op_hours = (len(machines) * assumed_op_hours_per_machine) - total_downtime
        mtbf = round(total_op_hours / breakdown_count, 1) if breakdown_count > 0 else total_op_hours
        
        chart_data = []
        for k, v in machine_stats.items():
            b_count = v['breakdowns']
            d_time = v['downtime']
            
            m_mttr = round(d_time / b_count, 1) if b_count > 0 else 0
            m_op_hours = assumed_op_hours_per_machine - d_time
            m_mtbf = round(m_op_hours / b_count, 1) if b_count > 0 else assumed_op_hours_per_machine
            
            chart_data.append({
                "name": v['name'], 
                "Breakdowns": b_count, 
                "Downtime (Hrs)": round(d_time, 1),
                "MTTR": m_mttr,
                "MTBF": m_mtbf
            })
        
        temporal_chart = [{"day": k[:3], "Breakdowns": v} for k, v in temporal_stats.items()]
        
        team_chart = [
            {"name": k, "Tasks": v['tasks'], "AvgTime": round(v['total_hours'] / v['tasks'], 1) if v['tasks'] > 0 else 0}
            for k, v in team_stats.items()
        ]
        
        ratio_chart = [
            {"name": "Preventive (PM)", "value": pm_count},
            {"name": "Reactive (Breakdown)", "value": breakdown_count}
        ]
        
        conn.close()
        return jsonify({
            "mttr": mttr,
            "mtbf": mtbf,
            "total_breakdowns": breakdown_count,
            "total_downtime": round(total_downtime, 1),
            "chart_data": chart_data,
            "temporal_chart": temporal_chart,
            "team_chart": team_chart,
            "ratio_chart": ratio_chart
        }), 200
    except Exception as e:
        print(f"Analytics Error: {e}")
        return jsonify({'error': 'Failed to generate analytics'}), 500

if __name__ == '__main__':
    start_scheduler(app)
    app.run(host='0.0.0.0', port=5000, debug=False)