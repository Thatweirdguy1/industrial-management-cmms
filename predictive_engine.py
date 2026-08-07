import os
import sqlite3
import requests
from datetime import datetime, timezone, timedelta

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

def calculate_machine_risk(conn, machine):
    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)
    
    recent_breakdowns = conn.execute(
        "SELECT * FROM work_orders WHERE machine_id=? AND schedule_type='breakdown_report' AND created_at >= ?", 
        (machine['id'], thirty_days_ago.isoformat())
    ).fetchall()
    
    breakdown_count = len(recent_breakdowns)
    
    last_fix_record = conn.execute(
        "SELECT completed_at FROM work_orders WHERE machine_id=? AND schedule_type='breakdown_report' AND status='completed' ORDER BY completed_at DESC LIMIT 1", 
        (machine['id'],)
    ).fetchone()
    
    hours_since_last_fix = 0
    if last_fix_record and last_fix_record['completed_at']:
        last_fix_date = parse_sqlite_date(last_fix_record['completed_at'])
        if last_fix_date:
            hours_since_last_fix = (now - last_fix_date).total_seconds() / 3600

    assumed_op_hours_per_month = 720
    mtbf = (assumed_op_hours_per_month) / breakdown_count if breakdown_count > 0 else 5000
    
    base_risk = (hours_since_last_fix / mtbf) * 100
    total_risk = min(round(base_risk, 1), 99.9)
    if machine['status'] == 'breakdown':
        total_risk = 100.0
        
    return {
        "machine_id": machine['id'],
        "name": machine['name'],
        "asset_tag": machine['asset_tag'],
        "breakdown_count_30d": breakdown_count,
        "mtbf": round(mtbf, 1),
        "risk_score": total_risk,
        "is_critical": breakdown_count >= 3
    }

def run_predictive_analysis(db_path):
    print(f"[{datetime.now(timezone.utc)}] Running Predictive Analysis Engine...")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    machines = conn.execute("SELECT * FROM machines").fetchall()
    
    results = []
    alerts_sent = 0
    
    for m in machines:
        risk_data = calculate_machine_risk(conn, m)
        results.append(risk_data)
        
        if risk_data['is_critical']:
            msg = (
                f"🚨 *PREDICTIVE ALERT* 🚨\n\n"
                f"Machine: *{risk_data['name']}* ({risk_data['asset_tag']})\n"
                f"Status: High Breakdown Frequency\n"
                f"Failures in last 30 days: *{risk_data['breakdown_count_30d']}*\n\n"
                f"⚠️ _This machine requires a deep inspection to prevent imminent total failure._"
            )
            send_telegram_alert(msg)
            alerts_sent += 1
            
    conn.close()
    return results, alerts_sent
