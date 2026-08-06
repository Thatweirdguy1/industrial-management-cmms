from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(50), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)

class Machine(db.Model):
    __tablename__ = 'machines'
    id = db.Column(db.Integer, primary_key=True)
    asset_tag = db.Column(db.String(50), unique=True, nullable=True) 
    name = db.Column(db.String(100), nullable=False)
    location = db.Column(db.String(100), nullable=False)
    model_number = db.Column(db.String(50), nullable=True)
    last_maintenance = db.Column(db.Date, nullable=True)
    next_maintenance = db.Column(db.Date, nullable=True)
    status = db.Column(db.String(50), default='operational')
    
class WorkOrder(db.Model):
    __tablename__ = 'work_orders'
    id = db.Column(db.Integer, primary_key=True)
    machine_id = db.Column(db.Integer, db.ForeignKey('machines.id'), nullable=False)
    schedule_type = db.Column(db.String(50), nullable=False) 
    task_category = db.Column(db.String(50), nullable=True)  
    description = db.Column(db.Text, nullable=True)          
    status = db.Column(db.String(50), default='pending') 
    
    # --- CHANGED FROM IDs TO STRINGS ---
    supervisor_name = db.Column(db.String(100), nullable=True)
    technician_name = db.Column(db.String(100), nullable=True)
    operator_name = db.Column(db.String(100), nullable=True) 
    telegram_message_id = db.Column(db.String(100), nullable=True)
    
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = db.Column(db.DateTime, nullable=True)
    photos = db.relationship('PhotoRecord', backref='work_order', lazy=True)

class PhotoRecord(db.Model):
    __tablename__ = 'photo_records'
    id = db.Column(db.Integer, primary_key=True)
    work_order_id = db.Column(db.Integer, db.ForeignKey('work_orders.id'), nullable=False)
    storage_url = db.Column(db.String(255), nullable=False) 
    uploaded_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))