# 🏭 Dadri Plant Control (CMMS)

![Dadri Plant Control](https://img.shields.io/badge/Status-Active-brightgreen?style=for-the-badge) ![Version](https://img.shields.io/badge/Version-2.0-blue?style=for-the-badge) ![Tech Stack](https://img.shields.io/badge/Tech_Stack-Next.js_|_Flask_|_SQLite-black?style=for-the-badge)

A next-generation, AI-assisted Computerized Maintenance Management System (CMMS) built specifically for the **Prem Industries - Dadri Plant**. This software tracks breakdowns, schedules preventive maintenance, predicts spare parts depletion, and generates automated executive reports.

---

## ✨ Core Features

### 🧠 1. Predictive Maintenance Engine
Monitors machine health in real-time. If a machine breaks down **3 or more times within a 10-day rolling window**, the engine automatically flags the machine as `CRITICAL` and dispatches an emergency Telegram alert to the engineering team.

### 📦 2. Smart Inventory & Burn Rate API
Tracks the consumption of spare parts on the factory floor. The engine calculates the **Daily Burn Rate** based on the last 30 days of usage. If any spare part is predicted to hit zero inventory in **7 days or less**, it automatically triggers a reorder alert via Telegram.

### 📊 3. Automated Executive Reporting
Every Monday at 8:00 AM, a background cron job compiles the plant's health metrics:
*   **Total Plant Downtime** (Hours)
*   **Mean Time To Repair (MTTR)**
*   **Top 5 Problematic Machines**
It generates a clean, high-contrast PDF report and uploads it directly to the management Telegram group. The reports are also downloadable from the main dashboard.

### 🗣️ 4. Voice-to-Text Integration
Technicians on the floor can use the built-in speech recognition to dictate their service notes and resolution reports hands-free (Supports Hindi & English).

---

## 🏗️ System Architecture

```mermaid
graph TD
    Client[Client Browser/Mobile] --> Nginx[Nginx Reverse Proxy / SSL]
    
    subgraph Frontend [Next.js Dashboard]
        Nginx -->|Port 3000| UI[User Interface]
        UI --> API_Calls[REST API Client]
        Voice[Speech Recognition] --> UI
    end

    subgraph Backend [Flask Server]
        Nginx -->|Port 5000| API[API Endpoints]
        API --> SQLite[(SQLite DB)]
        
        subgraph Scheduled Tasks
            Predictive[Predictive Engine]
            Inventory[Burn Rate Calculator]
            PDF[PDF Report Generator]
        end
        
        Predictive --> SQLite
        Inventory --> SQLite
        PDF --> SQLite
    end

    subgraph External
        Telegram[Telegram Bot API]
    end

    API_Calls <--> API
    Predictive --> Telegram
    Inventory --> Telegram
    PDF --> Telegram
```

---

## 📈 Inventory Prediction Logic

```mermaid
sequenceDiagram
    participant Tech as Technician
    participant DB as Database
    participant Engine as Predictive Engine
    participant TG as Telegram Group

    Tech->>DB: Logs Part Usage (e.g., 2 Bearings used)
    loop Every 4 Hours
        Engine->>DB: Fetch last 30 days of usage
        Engine->>Engine: Calculate Daily Burn Rate
        Engine->>Engine: Divide Current Stock by Burn Rate
        alt Days Until Empty <= 7
            Engine->>TG: 🚨 Send Reorder Warning!
        end
    end
```

---

## 🛠️ Technology Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | `Next.js`, `React`, `Tailwind CSS` | High-performance, SSR-capable React framework styled with a raw, high-contrast "Newsprint" aesthetic. |
| **Backend** | `Python 3.12`, `Flask` | Lightweight, robust API server handling data routing and business logic. |
| **Database** | `SQLite3` | Self-contained, serverless SQL database perfect for low-latency read/writes. |
| **Task Scheduler**| `APScheduler` | In-memory cron-job runner executing Python functions on exact intervals. |
| **PDF Generation**| `fpdf2` | Pure Python library used to draw and compile the weekly executive summaries. |
| **Deployment** | `DigitalOcean`, `Nginx`, `PM2` | Hosted on a dedicated Ubuntu Droplet, managed by PM2 process manager and reverse-proxied via Nginx. |

---

## 🚀 Deployment & Installation (Production)

To deploy to a DigitalOcean Ubuntu droplet with full SSL (required for Voice-to-Text):

### 1. Clone & Setup
```bash
git clone https://github.com/Thatweirdguy1/premindustries1.git ~/dadri-cmms
cd ~/dadri-cmms
```

### 2. Python Backend
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pm2 start app.py --name dadri-backend --interpreter ./venv/bin/python
```

### 3. Next.js Frontend
```bash
cd frontend
npm install
npm run build
pm2 start npm --name "dadri-frontend" -- start
```

### 4. Nginx & SSL (HTTPS)
> **Note:** A domain name (e.g., DuckDNS) is required to generate an SSL certificate. The Voice-to-Text Web Speech API will **not** work on mobile devices without HTTPS.

```bash
sudo apt install -y nginx certbot python3-certbot-nginx

# Create Nginx config to route / to port 3000, and /api/ to port 5000
cat << 'EOF' > /etc/nginx/sites-available/dadri-cmms
server {
    listen 80;
    server_name YOUR_DOMAIN.duckdns.org;

    location /api/ { proxy_pass http://127.0.0.1:5000/api/; }
    location /static/ { proxy_pass http://127.0.0.1:5000/static/; }
    location / { proxy_pass http://127.0.0.1:3000; }
}
EOF

sudo ln -s /etc/nginx/sites-available/dadri-cmms /etc/nginx/sites-enabled/
sudo systemctl restart nginx
sudo certbot --nginx -d YOUR_DOMAIN.duckdns.org --redirect
```

---

## 📝 Maintenance & Updates

This README serves as the source of truth for the project's architecture and capabilities. **It must be updated immediately upon the completion of any new feature or architectural change.** 

> *Property of Prem Industries - Dadri Plant. Unauthorized distribution is prohibited.*
