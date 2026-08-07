import sqlite3
import os

basedir = os.path.abspath(os.path.dirname(__file__))
db_path = os.path.join(basedir, 'maintenance.db')

def upgrade_db():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Create the part_usage_logs table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS part_usage_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            part_id INTEGER NOT NULL,
            quantity_used INTEGER NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (part_id) REFERENCES spare_parts (id)
        )
    ''')
    
    conn.commit()
    conn.close()
    print("✅ Database successfully upgraded! 'part_usage_logs' table added.")

if __name__ == '__main__':
    upgrade_db()
