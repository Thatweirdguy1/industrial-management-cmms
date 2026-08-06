import os
import sqlite3
from datetime import datetime, timezone

# Safely import the Telegram function from the main app without breaking things
try:
    from app import send_telegram_alert
except ImportError:
    print("Warning: Could not import send_telegram_alert from app.py")
    def send_telegram_alert(msg, reply_to_message_id=None):
        print(f"[MOCK TELEGRAM] {msg}")
        return None

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DB_PATH = os.path.join(BASE_DIR, 'maintenance.db')

def check_machine_maintenance(machine_id, current_hrs, last_service_date_str=None):
    """
    Checks if a machine requires maintenance based on its configured intervals.
    Implements a 'whichever comes first' logic between usage (hours) and time (days).
    
    :param machine_id: The ID linking to the machine in the DB
    :param current_hrs: The total hours run since the last service
    :param last_service_date_str: ISO string of the date the machine was last serviced
    """
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        
        # Get all configurations for this machine (can be multiple, e.g. Half & Full)
        configs = conn.execute(
            "SELECT * FROM machine_config WHERE machine_id = ?", 
            (machine_id,)
        ).fetchall()
        
        if not configs:
            print(f"No configuration found for machine {machine_id}")
            conn.close()
            return
            
        now = datetime.now(timezone.utc)
        
        # Calculate days since last service
        days_passed = None
        if last_service_date_str:
            try:
                last_dt = datetime.fromisoformat(last_service_date_str.replace('Z', '+00:00'))
                days_passed = (now - last_dt).days
            except ValueError:
                print(f"Invalid date format: {last_service_date_str}")
        
        for config in configs:
            machine_name = config['machine_name']
            service_type = config['service_type']
            
            # --- Check Usage (Hours) ---
            hrs_alert_level = 0  # 0 = none, 1 = warning 1, 2 = warning 2, 3 = due
            if config['interval_hrs'] and current_hrs is not None:
                interval = config['interval_hrs']
                n1 = config['notify_1_hrs_before'] or 0
                n2 = config['notify_2_hrs_before'] or 0
                
                if current_hrs >= interval:
                    hrs_alert_level = 3
                elif current_hrs >= (interval - n2):
                    hrs_alert_level = 2
                elif current_hrs >= (interval - n1):
                    hrs_alert_level = 1
                    
            # --- Check Time (Days) ---
            days_alert_level = 0
            if config['interval_days'] and days_passed is not None:
                interval = config['interval_days']
                n1 = config['notify_1_days_before'] or 0
                n2 = config['notify_2_days_before'] or 0
                
                if days_passed >= interval:
                    days_alert_level = 3
                elif days_passed >= (interval - n2):
                    days_alert_level = 2
                elif days_passed >= (interval - n1):
                    days_alert_level = 1
                    
            # --- Whichever Comes First Logic ---
            final_alert_level = max(hrs_alert_level, days_alert_level)
            
            if final_alert_level > 0:
                cause_str = ""
                if final_alert_level == hrs_alert_level and final_alert_level == days_alert_level:
                    cause_str = f"Usage ({current_hrs} hrs) and Time ({days_passed} days)"
                elif final_alert_level == hrs_alert_level:
                    cause_str = f"Usage ({current_hrs} hrs)"
                else:
                    cause_str = f"Time ({days_passed} days)"
                    
                alert_type = "DUE FOR" if final_alert_level == 3 else "UPCOMING"
                urgency = "🚨" if final_alert_level == 3 else ("⚠️" if final_alert_level == 2 else "ℹ️")
                
                msg = f"{urgency} {alert_type} MAINTENANCE: {machine_name}\n"
                msg += f"Service Type: {service_type}\n"
                msg += f"Triggered by: {cause_str}\n"
                
                if config['interval_hrs']:
                    msg += f"- Usage Limit: {config['interval_hrs']} hrs\n"
                if config['interval_days']:
                    msg += f"- Time Limit: {config['interval_days']} days\n"
                    
                send_telegram_alert(msg)
                print(f"Alert sent for {machine_name} ({service_type}): Level {final_alert_level}")
            else:
                print(f"Machine {machine_name} ({service_type}) is within safe limits.")
                
        conn.close()
    except Exception as e:
        print(f"Error in utility_manager: {e}")

def generate_daily_report():
    import json
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        
        # Get all machines
        machines = conn.execute("SELECT * FROM machines").fetchall()
        
        # Mocking some current hours for demonstration, in a real scenario this would come from an external system
        import random
        random.seed(datetime.now().strftime("%Y-%m-%d")) # keep it deterministic per day
        
        report_data = []
        
        now = datetime.now(timezone.utc)
        
        for m in machines:
            machine_id = m['id']
            machine_name = m['name']
            asset_tag = m['asset_tag']
            last_maint = m['last_maintenance'] # e.g. '2026-05-15'
            
            # mock hours between 0 and 7000
            current_hrs = random.randint(100, 6500)
            
            days_passed = None
            if last_maint:
                try:
                    last_dt = datetime.fromisoformat(last_maint)
                    # convert naive to utc
                    last_dt = last_dt.replace(tzinfo=timezone.utc)
                    days_passed = (now - last_dt).days
                except Exception as e:
                    pass

            configs = conn.execute(
                "SELECT * FROM machine_config WHERE machine_id = ?", 
                (machine_id,)
            ).fetchall()
            
            machine_alerts = []
            
            for config in configs:
                service_type = config['service_type']
                
                hrs_alert_level = 0
                if config['interval_hrs'] and current_hrs is not None:
                    interval = config['interval_hrs']
                    n1 = config['notify_1_hrs_before'] or 0
                    n2 = config['notify_2_hrs_before'] or 0
                    
                    if current_hrs >= interval:
                        hrs_alert_level = 3
                    elif current_hrs >= (interval - n2):
                        hrs_alert_level = 2
                    elif current_hrs >= (interval - n1):
                        hrs_alert_level = 1
                
                days_alert_level = 0
                if config['interval_days'] and days_passed is not None:
                    interval = config['interval_days']
                    n1 = config['notify_1_days_before'] or 0
                    n2 = config['notify_2_days_before'] or 0
                    
                    if days_passed >= interval:
                        days_alert_level = 3
                    elif days_passed >= (interval - n2):
                        days_alert_level = 2
                    elif days_passed >= (interval - n1):
                        days_alert_level = 1
                        
                final_alert_level = max(hrs_alert_level, days_alert_level)
                
                if final_alert_level > 0:
                    machine_alerts.append({
                        "service_type": service_type,
                        "alert_level": final_alert_level,
                        "hrs_alert_level": hrs_alert_level,
                        "days_alert_level": days_alert_level,
                        "current_hrs": current_hrs,
                        "days_passed": days_passed,
                        "interval_hrs": config['interval_hrs'],
                        "interval_days": config['interval_days']
                    })
                    
            if machine_alerts:
                report_data.append({
                    "machine_id": machine_id,
                    "machine_name": machine_name,
                    "asset_tag": asset_tag,
                    "last_maintenance": last_maint,
                    "alerts": machine_alerts
                })
                
        conn.close()
        
        output_path = os.path.join(BASE_DIR, 'frontend', 'public', 'utility_report.json')
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, 'w') as f:
            json.dump({
                "generated_at": now.isoformat(),
                "reports": report_data
            }, f, indent=2)
            
        print(f"Daily report generated at {output_path}")
        
    except Exception as e:
        print(f"Error generating daily report: {e}")

if __name__ == '__main__':
    generate_daily_report()
    print("Testing utility_manager module loaded and report generated.")
