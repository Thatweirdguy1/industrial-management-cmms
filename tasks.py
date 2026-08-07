from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime, timezone, timedelta
from models import db, WorkOrder, Machine, PhotoRecord
import os
from predictive_engine import run_predictive_analysis

def generate_monthly_maintenance():
    """Runs on the 1st of every month to generate automatic work orders."""
    print(f"[{datetime.now(timezone.utc)}] Running monthly maintenance scheduler...")
    
    # In a real scenario, you might filter for machines that actually require monthly PM
    active_machines = Machine.query.all()
    
    new_orders = []
    for machine in active_machines:
        order = WorkOrder(
            machine_id=machine.id,
            schedule_type='monthly_auto',
            status='pending'
            # Personnel IDs are left null until a leader assigns them
        )
        new_orders.append(order)
        
    db.session.bulk_save_objects(new_orders)
    db.session.commit()
    print(f"Generated {len(new_orders)} automated monthly work orders.")

def cleanup_old_photos():
    """Runs daily to delete photo records older than 6 months (180 days)."""
    print(f"[{datetime.now(timezone.utc)}] Running 6-month photo retention cleanup...")
    
    six_months_ago = datetime.now(timezone.utc) - timedelta(days=180)
    
    # Find all photos older than 6 months
    old_photos = PhotoRecord.query.filter(PhotoRecord.uploaded_at < six_months_ago).all()
    
    deleted_count = 0
    for photo in old_photos:
        # 1. Delete the actual file from your cloud storage (AWS S3, GCP, etc.)
        # e.g., delete_from_s3(photo.storage_url)
        print(f"Deleting file from storage: {photo.storage_url}")
        
        # 2. Delete the record from the PostgreSQL database
        db.session.delete(photo)
        deleted_count += 1
        
    db.session.commit()
    print(f"Cleaned up {deleted_count} expired photo records.")

def run_predictive_task():
    """Runs the predictive engine to check for highly critical machines."""
    basedir = os.path.abspath(os.path.dirname(__file__))
    db_path = os.path.join(basedir, 'maintenance.db')
    run_predictive_analysis(db_path)

def start_scheduler(app):
    """Initializes and starts the background jobs."""
    scheduler = BackgroundScheduler()
    
    # Push an app context so the database queries work inside the background threads
    def run_with_context(func):
        with app.app_context():
            func()

    # Schedule the monthly job (e.g., 1st day of the month at 00:01 AM)
    scheduler.add_job(
        lambda: run_with_context(generate_monthly_maintenance),
        trigger='cron',
        day=1,
        hour=0,
        minute=1
    )
    
    # Schedule the daily photo cleanup (e.g., every night at 02:00 AM)
    scheduler.add_job(
        lambda: run_with_context(cleanup_old_photos),
        trigger='cron',
        hour=2,
        minute=0
    )
    
    # Schedule the predictive analysis (every 4 hours)
    scheduler.add_job(
        lambda: run_with_context(run_predictive_task),
        trigger='interval',
        hours=4
    )
    
    scheduler.start()