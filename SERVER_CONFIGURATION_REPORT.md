# AttendStack Production Server Configuration Report
**Generated:** May 20, 2026

---

## 📋 Executive Summary

The production server uses a full-stack architecture with:
- **Frontend:** Next.js running on port 3003 (managed by PM2)
- **Backend:** Django REST API running on port 8001 (managed by Gunicorn)
- **Reverse Proxy:** Nginx on standard HTTP/HTTPS ports
- **Process Management:** PM2 for frontend, systemd for backend
- **Web Server Status:** Apache installed but not in active use; Nginx is the primary reverse proxy

---

## 1. NGINX CONFIGURATION FILES

### Location: `/etc/nginx/`

#### Main Configuration: `nginx.conf`
```
/etc/nginx/nginx.conf
```
**Size:** 229 bytes | **Owner:** root | **Permissions:** -rw-r--r--

**Content:**
```nginx
user www-data;

events {
    worker_connections 768;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    sendfile on;
    keepalive_timeout 65;

    include /etc/nginx/sites-enabled/*;
}
```

**Purpose:** Main Nginx configuration that loads all enabled sites

---

### Nginx Sites Configuration

#### Sites Available: `/etc/nginx/sites-available/`
```
attendance.nextgenapplication.com (2,831 bytes)
backend (3,218 bytes)
default (1,115 bytes)
default.backup (499 bytes)
ecom-app (2,824 bytes)
gymproject (1,965 bytes)
mafroosh (1,029 bytes)
testing (1,879 bytes)
.attendance.nextgenapplication.comsudo.swp (1,024 bytes - editor backup file)
```

#### Sites Enabled: `/etc/nginx/sites-enabled/`
```
✓ attendance.nextgenapplication.com
✓ backend
✓ ecom-app
✓ gymproject
✓ mafroosh
✓ testing
```

---

### Active Production Site: `attendance.nextgenapplication.com`

**Location:** `/etc/nginx/sites-enabled/attendance.nextgenapplication.com`

**Configuration:**
```nginx
server {
    listen 80;
    server_name attendance.nextgenapplication.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name attendance.nextgenapplication.com;

    ssl_certificate /etc/letsencrypt/live/attendance.nextgenapplication.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/attendance.nextgenapplication.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;

    # Custom login page (MUST come before /admin)
    location = /admin/sign-in {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Django admin panel
    location /admin {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Django API
    location /api {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Next.js frontend (root path)
    location / {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static files
    location /static/ {
        alias /var/www/attendstack/static/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Media files
    location /media/ {
        alias /home/squarefit/AttendStack/backend/media/;
    }
}
```

**Key Features:**
- HTTP to HTTPS redirect (80 → 443)
- SSL/TLS with Let's Encrypt certificates
- Security headers (HSTS, X-Content-Type-Options, X-Frame-Options)
- Routes `/admin` and `/api` to Django backend (port 8001)
- Routes `/` and `/admin/sign-in` to Next.js frontend (port 3003)
- Static files served from `/var/www/attendstack/static/`
- Media files served from backend media directory

---

## 2. SYSTEMD SERVICE FILES

### Location: `/etc/systemd/system/`

#### Django Backend Service: `attendstack-backend.service`

**Path:** `/etc/systemd/system/attendstack-backend.service`
**Size:** 503 bytes | **Owner:** root | **Permissions:** -rw-r--r--
**Last Modified:** May 19, 2026

**Configuration:**
```ini
[Unit]
Description=AttendStack Django Backend
After=network.target

[Service]
User=squarefit
Group=squarefit
WorkingDirectory=/home/squarefit/AttendStack/backend
Environment="PATH=/home/squarefit/AttendStack/backend/venv/bin"
Environment="DJANGO_SETTINGS_MODULE=attendstack_backend.settings"
ExecStart=/home/squarefit/AttendStack/backend/venv/bin/gunicorn --workers 3 --bind 127.0.0.1:8001 --reload attendstack_backend.wsgi:application
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Key Details:**
- Runs as user `squarefit` with group `squarefit`
- Working directory: `/home/squarefit/AttendStack/backend`
- Gunicorn: 3 workers on 127.0.0.1:8001
- Python virtual environment: `/home/squarefit/AttendStack/backend/venv`
- Django settings module: `attendstack_backend.settings`
- Auto-restart enabled with 10-second delay
- Starts on multi-user boot target

---

#### PM2 Service (for squarefit user): `pm2-squarefit.service`

**Path:** `/etc/systemd/system/pm2-squarefit.service`
**Size:** 1,118 bytes | **Owner:** root | **Permissions:** -rw-r--r--
**Last Modified:** May 19, 2026

**Configuration:**
```ini
[Unit]
Description=PM2 process manager
Documentation=https://pm2.keymetrics.io/
After=network.target

[Service]
Type=forking
User=squarefit
LimitNOFILE=infinity
LimitNPROC=infinity
LimitCORE=infinity
Environment=PATH=/home/squarefit/AttendStack/backend/venv/bin:...
Environment=PM2_HOME=/home/squarefit/.pm2
PIDFile=/home/squarefit/.pm2/pm2.pid
Restart=on-failure

ExecStart=/usr/lib/node_modules/pm2/bin/pm2 resurrect
ExecReload=/usr/lib/node_modules/pm2/bin/pm2 reload all
ExecStop=/usr/lib/node_modules/pm2/bin/pm2 kill

[Install]
WantedBy=multi-user.target
```

**Key Details:**
- Runs as user `squarefit`
- PM2 home directory: `/home/squarefit/.pm2`
- PID file: `/home/squarefit/.pm2/pm2.pid`
- Type: forking
- Restart policy: on-failure
- Resource limits: unlimited file descriptors, processes, and core
- Resurrects processes on boot

---

#### PM2 Root Service: `pm2-root.service`

**Path:** `/etc/systemd/system/pm2-root.service`
**Last Modified:** Mar 15, 2026

**Status:** Installed but not actively used for AttendStack

---

---

## 3. PM2 PROCESS MANAGER CONFIGURATION

### PM2 Home Directory: `~/.pm2/`

**Location:** `/home/squarefit/.pm2/`

**Directory Contents:**
```
dump.pm2                 (JSON process dump)
pm2.pid                  (Process ID file)
pm2.sock                 (Socket file)
logs/                    (Process logs directory)
pids/                    (Process ID references)
```

---

### PM2 Dump File: `dump.pm2`

**Location:** `/home/squarefit/.pm2/dump.pm2`

**Process Configuration:**
```json
[
  {
    "name": "attendstack-frontend",
    "namespace": "default",
    "args": [
      "start",
      "--",
      "--port",
      "3003"
    ],
    "status": "online",
    "pm_uptime": 1779275004953,
    "created_at": 1779275004953,
    "restart_time": 0,
    "unstable_restarts": 0,
    "node_version": "24.13.0",
    "version": "N/A"
  }
]
```

**Details:**
- **Process Name:** attendstack-frontend
- **Command:** npm start with port 3003
- **Status:** online (running)
- **Node Version:** 24.13.0
- **Port:** 3003
- **Uptime:** 1779275004953 (milliseconds since epoch)

---

### PM2 Logs Location

**Log Directory:** `/home/squarefit/.pm2/logs/`

Commands to view logs:
```bash
pm2 logs attendstack-frontend
pm2 list                           # Show all processes
pm2 show attendstack-frontend      # Show process details
```

---

## 4. GUNICORN CONFIGURATION

### Gunicorn Startup Script

**Location:** `/home/squarefit/AttendStack/backend/gunicorn_start.sh`

**Script Content:**
```bash
#!/bin/bash

# The name of your Django project
NAME="attendstack_backend"

# The directory where your project is located
DJANGODIR=/home/squarefit/AttendStack/backend

# The user and group to run as
USER=squarefit
GROUP=www-data

# Set the PATH to include the virtual environment's bin directory
PATH="/home/squarefit/AttendStack/backend/venv/bin:$PATH"

# The path to your project's settings module
export DJANGO_SETTINGS_MODULE=attendstack_backend.settings

# The path to your project's root directory
export PYTHONPATH=$DJANGODIR:$PYTHONPATH

# Start Gunicorn
exec /home/squarefit/AttendStack/backend/venv/bin/gunicorn ${NAME}.wsgi:application \
  --name $NAME \
  --workers 3 \
  --bind=127.0.0.1:8000 \
  --log-level=debug \
  --log-file=-
```

**Key Configuration:**
- **Script Location:** `/home/squarefit/AttendStack/backend/gunicorn_start.sh`
- **Django Project:** attendstack_backend
- **Working Directory:** `/home/squarefit/AttendStack/backend`
- **User:** squarefit, Group: www-data
- **Workers:** 3
- **Bind Address:** 127.0.0.1:8000 (Note: systemd service uses port 8001)
- **Log Level:** debug
- **Logging:** stdout (-f flag)
- **Virtual Environment:** `/home/squarefit/AttendStack/backend/venv`

**Note:** The systemd service file uses port 8001, while this script specifies port 8000. The systemd configuration takes precedence in production.

---

## 5. SSL/TLS CERTIFICATE CONFIGURATION

### Let's Encrypt Certificates

**Location:** `/etc/letsencrypt/live/attendance.nextgenapplication.com/`

**Certificate Files:**
```
fullchain.pem      (Full certificate chain)
privkey.pem        (Private key)
```

**SSL Configuration in Nginx:**
- Full chain used for certificate verification chain
- Private key for decryption
- HSTS header: `max-age=31536000; includeSubDomains` (1 year)
- Options: `/etc/letsencrypt/options-ssl-nginx.conf`
- DH parameters: `/etc/letsencrypt/ssl-dhparams.pem`
- Protocol: TLSv1.2+ via ssl_protocols

---

## 6. APACHE CONFIGURATION (Not Actively Used)

### Apache Status
**Status:** Installed but not actively used for AttendStack

### Apache Sites Configuration

**Location:** `/etc/apache2/sites-available/`

**Available Sites:**
```
000-default.conf           (Default HTTP site)
default-ssl.conf           (Default HTTPS site)
gymproject-le-ssl.conf     (SSL certificate)
gymproject.conf            (HTTP)
testing-le-ssl.conf        (SSL certificate)
testing.conf               (HTTP)
```

**Enabled Sites:**
```
gymproject.conf → ../sites-available/gymproject.conf
gymproject-le-ssl.conf → ../sites-available/gymproject-le-ssl.conf
testing.conf → ../sites-available/testing.conf
testing-le-ssl.conf → ../sites-available/testing-le-ssl.conf
```

**Note:** These are for other projects (gymproject, testing), not for AttendStack. Nginx is the primary web server for AttendStack.

---

## 7. DOCKER CONFIGURATION

### Docker Status
**Status:** ❌ Not configured for production

**Search Results:**
- No docker-compose.yml found in workspace
- No Dockerfile found (except in dependencies: `/home/squarefit/AttendStack/dashboard/node_modules/bcrypt/Dockerfile`)
- No .dockerignore files in workspace

**Note:** Application is deployed directly on the host system, not containerized.

---

## 8. HAPROXY CONFIGURATION

### HAProxy Status
**Status:** ❌ Not installed

HAProxy is not installed on the server. Nginx serves as the reverse proxy instead.

---

## 9. DEPLOYMENT ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────────────┐
│                          CLIENT BROWSER                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  HTTPS:443  │
                    │   (Nginx)   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              │         ┌──▼───┐        │
              │         │ /api │        │
              │         │/admin│        │
              │         └──┬───┘        │
              │            │           │
          ┌───▼─────┐   ┌──▼──────────▼──┐   ┌─────────────┐
          │   /     │   │   Gunicorn     │   │  PostgreSQL │
          │/admin/  │   │   :8001        │   │  Database   │
          │sign-in  │   │                │   └─────────────┘
          │         │   │ Django REST    │
          └───┬─────┘   │ API            │
              │         │ (3 workers)    │
          ┌───▼──────┐  └────────────────┘
          │ PM2      │
          │ :3003    │
          │          │
          │ Next.js  │
          │ Frontend │
          └──────────┘
```

---

## 10. CONFIGURATION FILE LOCATIONS SUMMARY

### Critical Configuration Files

| Type | Location | Status |
|------|----------|--------|
| **Nginx Main Config** | `/etc/nginx/nginx.conf` | ✅ Active |
| **Nginx Site Config** | `/etc/nginx/sites-enabled/attendance.nextgenapplication.com` | ✅ Active |
| **Django Backend Service** | `/etc/systemd/system/attendstack-backend.service` | ✅ Active |
| **PM2 Frontend Service** | `/etc/systemd/system/pm2-squarefit.service` | ✅ Active |
| **PM2 Dump File** | `/home/squarefit/.pm2/dump.pm2` | ✅ Active |
| **Gunicorn Script** | `/home/squarefit/AttendStack/backend/gunicorn_start.sh` | ⚠️ Reference only |
| **SSL Certificates** | `/etc/letsencrypt/live/attendance.nextgenapplication.com/` | ✅ Active |
| **Apache Sites** | `/etc/apache2/sites-available/` | ❌ Not for AttendStack |
| **Docker** | N/A | ❌ Not used |
| **HAProxy** | N/A | ❌ Not installed |

---

## 11. PROCESS MANAGEMENT COMMANDS

### Check Status

```bash
# Django Backend
sudo systemctl status attendstack-backend

# PM2 Frontend
pm2 list
pm2 show attendstack-frontend

# Nginx
sudo systemctl status nginx
sudo nginx -t                    # Test nginx config

# Check logs
sudo journalctl -u attendstack-backend -f
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
pm2 logs attendstack-frontend
```

### Restart Services

```bash
# Restart Nginx
sudo systemctl restart nginx

# Restart Django Backend
sudo systemctl restart attendstack-backend

# Restart PM2 Frontend
pm2 restart attendstack-frontend
```

### Enable at Boot

```bash
# Ensure services start on boot
sudo systemctl enable attendstack-backend
sudo systemctl enable nginx
pm2 startup
pm2 save
```

---

## 12. WORKSPACE CONFIGURATION FILES

### Directory Structure

```
/home/squarefit/AttendStack/
├── imptortant.txt                    # Setup instructions
├── backend/
│   ├── gunicorn_start.sh            # Gunicorn startup script
│   ├── requirements.txt             # Python dependencies
│   ├── manage.py                    # Django management
│   ├── db.sqlite3                   # Database (for dev)
│   ├── venv/                        # Virtual environment
│   └── [Django apps...]
└── dashboard/
    ├── pm2                          # Empty PM2 config file
    ├── next.config.js               # Next.js config
    ├── next.config.mjs
    ├── next.config.ts
    ├── package.json
    ├── tsconfig.json
    ├── app/                         # Next.js app directory
    ├── components/
    ├── public/
    └── [other Next.js files]
```

---

## 13. KEY ENDPOINTS AND PORTS

| Service | Host | Port | Protocol | Purpose |
|---------|------|------|----------|---------|
| Nginx | 0.0.0.0 | 80 | HTTP | HTTP redirect to HTTPS |
| Nginx | 0.0.0.0 | 443 | HTTPS | Primary entry point |
| Django/Gunicorn | 127.0.0.1 | 8001 | HTTP | Backend API & Admin |
| Next.js/PM2 | 127.0.0.1 | 3003 | HTTP | Frontend app |
| PM2 Socket | - | - | Unix socket | PM2 IPC |
| Nginx | - | - | - | Static/Media files |

---

## 14. SECURITY HEADERS

Configured in Nginx for HTTPS:
- **HSTS:** `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- **Content-Type:** `X-Content-Type-Options: nosniff`
- **Clickjacking:** `X-Frame-Options: SAMEORIGIN`

---

## 15. IMPORTANT NOTES

1. **Port 8001 vs 8000:** The systemd service uses port 8001, while the gunicorn_start.sh script references port 8000. The systemd service takes precedence.

2. **Static Files:** 
   - Nginx location: `/var/www/attendstack/static/` with 30-day cache
   - Django media: `/home/squarefit/AttendStack/backend/media/`

3. **Proxy Headers:** All locations include proper headers for logging client IP and forwarded protocol

4. **Process Management:**
   - Django: systemd with auto-restart
   - Next.js: PM2 with systemd integration

5. **SSL/TLS:**
   - Let's Encrypt certificates with auto-renewal capability
   - DH parameters configured for PFS (Perfect Forward Secrecy)

6. **Nginx Sites:** Multiple projects configured but only attendance.nextgenapplication.com is actively used for AttendStack

7. **Apache:** Installed but not in use for AttendStack deployment

---

## 16. TROUBLESHOOTING CHECKLIST

```bash
# 1. Verify Nginx configuration syntax
sudo nginx -t

# 2. Check if Nginx is listening on ports 80/443
sudo netstat -tlnp | grep nginx

# 3. Check Django backend status
sudo systemctl status attendstack-backend
sudo journalctl -u attendstack-backend -n 50

# 4. Check if Gunicorn is listening on 8001
sudo netstat -tlnp | grep 8001

# 5. Check PM2 processes
pm2 list
pm2 logs attendstack-frontend

# 6. Check if Next.js is listening on 3003
sudo netstat -tlnp | grep 3003

# 7. Test Nginx access logs
sudo tail -f /var/log/nginx/access.log

# 8. Test Nginx error logs
sudo tail -f /var/log/nginx/error.log

# 9. Check SSL certificate status
sudo certbot certificates

# 10. Verify DNS resolution
dig attendance.nextgenapplication.com
nslookup attendance.nextgenapplication.com
```

---

**End of Report**
