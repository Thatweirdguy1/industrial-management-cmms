import sqlite3
import os

basedir = os.path.abspath(os.path.dirname(__file__))
db_path = os.path.join(basedir, 'maintenance.db')

def upgrade():
    print(f"Connecting to {db_path}...")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check if telegram_message_id column exists
    cursor.execute("PRAGMA table_info(work_orders);")
    columns = [info[1] for info in cursor.fetchall()]
    
    if 'telegram_message_id' not in columns:
        print("Adding telegram_message_id column to work_orders table...")
        try:
            cursor.execute("ALTER TABLE work_orders ADD COLUMN telegram_message_id VARCHAR(100);")
            conn.commit()
            print("✅ Column added successfully.")
        except Exception as e:
            print(f"❌ Failed to add column: {e}")
    else:
        print("✅ Column telegram_message_id already exists.")
        
    conn.close()

if __name__ == '__main__':
    upgrade()
