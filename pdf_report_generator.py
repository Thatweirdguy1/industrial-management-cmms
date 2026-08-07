import sqlite3
import os
from datetime import datetime, timezone, timedelta
from fpdf import FPDF
from predictive_engine import send_telegram_document

def parse_sqlite_date(date_str):
    if not date_str: return None
    try:
        clean_str = str(date_str).replace('Z', '+00:00')
        dt = datetime.fromisoformat(clean_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except:
        return None

class PDFReport(FPDF):
    def header(self):
        self.set_font("helvetica", "B", 18)
        self.cell(0, 10, "Weekly Maintenance Executive Summary", border=False, align="C")
        self.ln(10)
        self.set_font("helvetica", "I", 12)
        self.cell(0, 10, f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", border=False, align="C")
        self.ln(20)

def generate_weekly_pdf_report(db_path, send_telegram=True):
    print("Generating Weekly PDF Report...")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    
    now = datetime.now(timezone.utc)
    seven_days_ago = now - timedelta(days=7)
    
    # Query completed breakdowns in the last 7 days
    breakdowns = conn.execute(
        "SELECT w.*, m.name as machine_name, m.asset_tag FROM work_orders w "
        "JOIN machines m ON w.machine_id = m.id "
        "WHERE w.schedule_type='breakdown_report' AND w.status='completed' AND w.completed_at >= ?",
        (seven_days_ago.isoformat(),)
    ).fetchall()
    
    total_breakdowns = len(breakdowns)
    total_downtime_hours = 0.0
    
    machine_counts = {}
    
    for b in breakdowns:
        created = parse_sqlite_date(b['created_at'])
        completed = parse_sqlite_date(b['completed_at'])
        
        if created and completed:
            hours = (completed - created).total_seconds() / 3600.0
            total_downtime_hours += hours
            
        m_name = f"{b['machine_name']} ({b['asset_tag']})"
        machine_counts[m_name] = machine_counts.get(m_name, 0) + 1
        
    mttr = total_downtime_hours / total_breakdowns if total_breakdowns > 0 else 0.0
    
    # Sort top offenders
    top_offenders = sorted(machine_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    
    conn.close()
    
    # Build PDF
    pdf = PDFReport()
    pdf.add_page()
    
    # Overview Section
    pdf.set_font("helvetica", "B", 14)
    pdf.cell(0, 10, "1. Executive Overview", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "", 12)
    pdf.cell(0, 10, f"Total Breakdowns (Last 7 Days): {total_breakdowns}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 10, f"Total Plant Downtime: {round(total_downtime_hours, 1)} Hours", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 10, f"Mean Time To Repair (MTTR): {round(mttr, 1)} Hours", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(10)
    
    # Top Offenders Section
    pdf.set_font("helvetica", "B", 14)
    pdf.cell(0, 10, "2. Top Problematic Machines", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "", 12)
    
    if top_offenders:
        for name, count in top_offenders:
            pdf.cell(0, 10, f"- {name}: {count} breakdowns", new_x="LMARGIN", new_y="NEXT")
    else:
        pdf.cell(0, 10, "No breakdowns this week. Great job!", new_x="LMARGIN", new_y="NEXT")
        
    pdf.ln(10)
    
    # Save PDF
    report_filename = f"weekly_report_{now.strftime('%Y%m%d')}.pdf"
    basedir = os.path.dirname(db_path)
    filepath = os.path.join(basedir, report_filename)
    
    pdf.output(filepath)
    
    # Send via Telegram
    if send_telegram:
        caption = f"📊 *Weekly Maintenance Report*\nTotal Downtime: {round(total_downtime_hours, 1)} hrs\nMTTR: {round(mttr, 1)} hrs"
        send_telegram_document(filepath, caption)
        print(f"Report generated and sent: {report_filename}")
    else:
        print(f"Report generated locally: {report_filename}")
        
    return filepath

if __name__ == "__main__":
    basedir = os.path.abspath(os.path.dirname(__file__))
    generate_weekly_pdf_report(os.path.join(basedir, 'maintenance.db'))
