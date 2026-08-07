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

def send_telegram_document(filepath, caption=None):
    BOT_TOKEN = '8809133258:AAGMvbwWEp_T0TVYLezec4KM5d6X_R-Ty04'
    GROUP_CHAT_ID = '-5182937655' 
    print(f"\n[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] UPLOADING TELEGRAM DOCUMENT...")
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendDocument"
    
    data = {'chat_id': GROUP_CHAT_ID}
    if caption:
        data['caption'] = caption
        data['parse_mode'] = 'Markdown'
        
    try:
        with open(filepath, 'rb') as f:
            files = {'document': f}
            res = requests.post(url, data=data, files=files).json()
            if res.get("ok"):
                return res["result"]["message_id"]
    except Exception as e:
        print(f"❌ Telegram Document Error: {e}")
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
    ten_days_ago = now - timedelta(days=10)
    
    recent_breakdowns = conn.execute(
        "SELECT * FROM work_orders WHERE machine_id=? AND schedule_type='breakdown_report' AND created_at >= ?", 
        (machine['id'], ten_days_ago.isoformat())
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
        "breakdown_count_10d": breakdown_count,
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
                f"Failures in last 10 days: *{risk_data['breakdown_count_10d']}*\n\n"
                f"⚠️ _This machine requires a deep inspection to prevent imminent total failure._"
            )
            send_telegram_alert(msg)
            alerts_sent += 1
            
    conn.close()
    return results, alerts_sent

def predict_inventory_burn_rate(db_path):
    print(f"[{datetime.now(timezone.utc)}] Running Inventory Prediction Engine...")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    
    parts = conn.execute("SELECT * FROM spare_parts WHERE quantity > 0").fetchall()
    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)
    
    results = []
    alerts_sent = 0
    
    for p in parts:
        # Sum quantity_used in the last 30 days
        usage_data = conn.execute(
            "SELECT SUM(quantity_used) as total_used FROM part_usage_logs WHERE part_id=? AND timestamp >= ?",
            (p['id'], thirty_days_ago.isoformat())
        ).fetchone()
        
        total_used = usage_data['total_used'] if usage_data and usage_data['total_used'] else 0
        
        if total_used > 0:
            daily_burn_rate = total_used / 30.0
            days_until_empty = p['quantity'] / daily_burn_rate
            
            # Alert if running out in 7 days or less
            if days_until_empty <= 7:
                msg = (
                    f"⚠️ *INVENTORY ALERT* ⚠️\n\n"
                    f"Part: *{p['part_name']}*\n"
                    f"Current Stock: {p['quantity']}\n"
                    f"Burn Rate: {round(daily_burn_rate, 2)} / day\n\n"
                    f"🚨 _Based on recent repair rates, you will run out in ~{int(days_until_empty)} days. Please reorder!_"
                )
                send_telegram_alert(msg)
                alerts_sent += 1
                
            results.append({
                "part_name": p['part_name'],
                "current_quantity": p['quantity'],
                "daily_burn_rate": round(daily_burn_rate, 2),
                "days_until_empty": round(days_until_empty, 1)
            })
            
    conn.close()
    return results, alerts_sent
