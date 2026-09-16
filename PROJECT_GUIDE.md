# AttendStack Project Guide

## 1. Project Name

**AttendStack - HR, Attendance, Leave, and Payroll Management System**

AttendStack is a full-stack web application built to manage employee attendance, HR operations, leave requests, holidays, payroll, and company-level attendance rules. It has a Django REST API backend and a Next.js dashboard frontend.

This document can be used to explain the project in interviews, demos, project reviews, or handover discussions.

---

## 2. Main Topic Of The Project

The main topic of AttendStack is **employee attendance and HR management automation**.

The system helps an organization manage:

- Admin, HR, and Employee login
- Employee records and profiles
- Daily attendance check-in and check-out
- Attendance status calculation such as Present, Late, Half Day, Absent, Leave, Holiday, and Sunday Unpaid
- Leave request creation, approval, and rejection
- Holiday management
- Monthly salary and payroll records
- Company attendance rules
- IP and geolocation based attendance security
- Password reset using OTP
- Dashboard reports for admins, HR, and employees

In simple words:

> AttendStack is an HRMS-style attendance platform where employees can mark attendance and request leaves, while admins or HR can manage employees, attendance records, holidays, payroll, and company rules from a dashboard.

---

## 3. Tech Stack

### Frontend

- **Next.js** - React framework for the dashboard application
- **React** - UI component library
- **TypeScript** - Type-safe frontend development
- **Bootstrap 5** - UI styling and layout
- **React Bootstrap** - Bootstrap components for React
- **Sass/SCSS** - Custom theme styling
- **Axios** - API calls from frontend to backend
- **Redux Toolkit / React Redux** - State management support
- **TanStack React Table** - Data table features
- **ApexCharts / React ApexCharts** - Dashboard charts and reports
- **SweetAlert2 / React Toastify** - Alerts and notifications
- **Moment.js** - Date formatting and date handling

### Backend

- **Python**
- **Django 5**
- **Django REST Framework** - REST API development
- **Simple JWT** - JWT based login and authentication
- **Django CORS Headers** - Frontend-backend CORS support
- **drf-spectacular** - OpenAPI schema and API documentation support
- **python-decouple** - Environment variable management
- **dj-database-url** - Database URL configuration
- **SQLite** - Default local development database
- **PostgreSQL** - Production or local PostgreSQL option
- **Gunicorn** - Production WSGI server
- **Celery settings** - Background task configuration support
- **Redis** - Celery broker/result backend when background tasks are enabled

### Deployment / Server

- **Nginx** - Reverse proxy for frontend, backend, static files, and media files
- **PM2** - Process manager for the Next.js frontend
- **Gunicorn** - Runs the Django backend in production
- **systemd** - Can be used to manage backend service
- **Let's Encrypt SSL** - HTTPS certificates in production

---

## 4. Project Architecture

The project is divided into two main applications:

```text
AttendStack/
  backend/       Django REST API
  dashboard/     Next.js frontend dashboard
```

### Backend Structure

```text
backend/
  attendstack_backend/   Main Django project settings and URLs
  accounts/              Authentication, roles, profile, password reset OTP
  organizations/         Organization management
  employees/             Employee CRUD, employee profile, status, password setup
  attendance/            Attendance records, check-in/check-out, leave requests
  holidays/              Holiday management
  payroll/               Salary and payroll management
  settings/              Global system/company/attendance settings
  templates/             Email templates for password reset OTP
  manage.py              Django command entry point
  requirements.txt       Python dependencies
```

### Frontend Structure

```text
dashboard/
  app/                   Next.js App Router pages
  components/            Shared UI and feature components
  layouts/               Sidebar, header, dashboard layout
  routes/                Route helpers
  styles/                Theme and SCSS files
  public/                Static images, logos, favicon, assets
  package.json           Node dependencies and scripts
```

---

## 5. Main Modules And Features

### 5.1 Authentication And Roles

The project uses a custom Django user model with email login.

Supported roles:

- **SUPER_ADMIN**
- **HR**
- **EMPLOYEE**

Authentication features:

- JWT login
- JWT refresh token
- User profile API
- Change password
- Password reset with OTP
- Admin can create HR users

Important backend paths:

```text
/api/v1/accounts/login/
/api/v1/accounts/login/refresh/
/api/v1/accounts/profile/
/api/v1/accounts/profile/change-password/
/api/v1/accounts/password-reset/request/
/api/v1/accounts/password-reset/confirm/
/api/v1/accounts/admin/create-hr/
```

### 5.2 Employee Management

Admins and HR can manage employee records.

Employee data includes:

- Employee ID
- Full name
- Email and phone
- Date of birth
- Aadhaar number and document
- Address
- Emergency contact
- Joining date
- Department and designation
- Employment type
- Reporting manager
- Employee status
- Annual salary
- Bank details
- Tax ID

Important backend paths:

```text
/api/v1/employees/
/api/v1/employees/me/
/api/v1/employees/{id}/create-password/
/api/v1/employees/{id}/reset-password/
/api/v1/employees/{id}/status/
```

### 5.3 Attendance Management

Employees can mark check-in and check-out. The system stores time, status, IP address, and GPS location fields.

Attendance statuses:

- Present
- Late Entry
- Half Day
- Absent
- Leave
- Paid Leave
- Holiday
- Sunday Paid
- Sunday Unpaid

Important features:

- Check-in and check-out
- Today's attendance
- My attendance
- Attendance records for admin/HR
- IP restriction support
- Geofencing support
- Automatic status calculation
- Late cutoff time
- Half-day threshold
- Sunday unpaid rule
- Audit trail with IP and latitude/longitude

Important backend paths:

```text
/api/v1/attendance/
/api/v1/attendance/today/
/api/v1/attendance/me/
/api/v1/attendance/me/today/
/api/v1/attendance/check-in/
/api/v1/attendance/check-out/
/api/v1/attendance/auto-mark/
/api/v1/attendance/my-ip/
```

### 5.4 Leave Management

Employees can apply for leave, and admin/HR users can approve or reject leave requests.

Leave types:

- Casual Leave
- Sick Leave
- Annual Leave
- Study Leave
- Maternity Leave
- Paternity Leave
- Bereavement Leave
- Marriage Leave
- Other

Leave statuses:

- Pending
- Approved
- Rejected

Important backend paths:

```text
/api/v1/attendance/leaves/
/api/v1/attendance/leaves/types/
```

### 5.5 Holiday Management

The system supports company holiday records.

Holiday types:

- Public Holiday
- National Holiday
- Festival
- Optional Holiday

Important backend path:

```text
/api/v1/holidays/
```

### 5.6 Payroll Management

Payroll records are generated monthly for employees.

Payroll data includes:

- Employee
- Month and year
- Basic salary
- Allowances
- Deductions
- Deduction details
- Net salary
- Paid or Pending status
- Paid date

Important backend paths:

```text
/api/v1/payroll/
/api/v1/payroll/generate/
/api/v1/payroll/summary/
```

### 5.7 System Settings

Admin can manage global rules and company settings.

Settings include:

- Shift start time
- Late cutoff time
- Shift end time
- Half-day threshold
- Auto checkout time
- IP restriction
- Allowed IP ranges
- Geofencing settings
- Office latitude and longitude
- Geofence radius
- Company name, address, email, phone, logo
- Attendance rules
- Timezone, currency, date format
- Working days
- Email and browser notification settings
- Leave allocation settings
- Sunday unpaid rule
- Burger rule for holiday/leave sandwich cases
- Settings change log

Important backend path:

```text
/api/v1/settings/
```

---

## 6. Local Installation Guide

### 6.1 Prerequisites

Install these tools before running the project:

- Python 3.11 or newer
- Node.js 20 or newer
- npm
- Git
- PostgreSQL only if you want to use PostgreSQL locally
- Redis only if you want to run Celery background workers locally

For simple local development, PostgreSQL and Redis are optional because the backend uses SQLite by default when `DEBUG=True`.

---

## 7. Backend Setup

Open a terminal in the project root:

```powershell
cd C:\Bhatt-projects\AttendStack
```

Go to the backend folder:

```powershell
cd backend
```

Create a Python virtual environment:

```powershell
python -m venv venv
```

Activate the virtual environment on Windows PowerShell:

```powershell
.\venv\Scripts\Activate.ps1
```

Install backend dependencies:

```powershell
pip install -r requirements.txt
```

Create a `.env` file inside the `backend` folder:

```env
SECRET_KEY=change-this-secret-key
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
DEFAULT_FROM_EMAIL=AttendStack <no-reply@attendstack.com>
PASSWORD_RESET_SUPPORT_EMAIL=support@attendstack.com
```

Run database migrations:

```powershell
python manage.py migrate
```

Create an admin user:

```powershell
python manage.py createsuperuser
```

Run the backend server:

```powershell
python manage.py runserver
```

Backend will run at:

```text
http://127.0.0.1:8000
```

Django admin:

```text
http://127.0.0.1:8000/admin/
```

API base URL:

```text
http://127.0.0.1:8000/api/v1/
```

---

## 8. Frontend Setup

Open another terminal and go to the dashboard folder:

```powershell
cd C:\Bhatt-projects\AttendStack\dashboard
```

Install frontend dependencies:

```powershell
npm install
```

Create a `.env.local` file inside the `dashboard` folder:

```env
NEXT_PUBLIC_API_ENDPOINT=http://127.0.0.1:8000
```

Run the frontend development server:

```powershell
npm run dev
```

Frontend will run at:

```text
http://localhost:3000
```

---

## 9. How To Run The Full App Locally

You need two terminals.

### Terminal 1 - Backend

```powershell
cd C:\Bhatt-projects\AttendStack\backend
.\venv\Scripts\Activate.ps1
python manage.py runserver
```

### Terminal 2 - Frontend

```powershell
cd C:\Bhatt-projects\AttendStack\dashboard
npm run dev
```

Then open:

```text
http://localhost:3000
```

Login using the user created from Django admin or the credentials available in your local database.

---

## 10. Optional PostgreSQL Local Setup

By default, local development uses SQLite when `DEBUG=True`.

To use PostgreSQL locally, add these values in `backend/.env`:

```env
DEBUG=True
USE_POSTGRES_LOCALLY=True
DATABASE_URL=postgres://postgres:your_password@localhost:5432/attendstack
```

Then run:

```powershell
python manage.py migrate
```

---

## 11. Optional Email Setup

For local development, password reset OTP emails are printed in the terminal because the default backend is:

```env
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
```

For SMTP email, update `backend/.env`:

```env
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-app-password
EMAIL_USE_TLS=True
DEFAULT_FROM_EMAIL=AttendStack <your-email@gmail.com>
```

---

## 12. Useful Commands

### Backend

```powershell
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
python manage.py test
python manage.py collectstatic
```

### Frontend

```powershell
npm run dev
npm run build
npm run start
```

Note: The `lint` script in `package.json` uses `next lint`, but newer Next.js versions may require a different lint setup.

---

## 13. Production Overview

The production setup described in this project uses:

- Nginx as reverse proxy
- Next.js frontend managed by PM2
- Django backend served by Gunicorn
- Static files served from a static directory
- Media files served from the backend media directory
- HTTPS using Let's Encrypt SSL

Common production routing:

```text
/           Next.js frontend
/admin/     Django admin
/api/       Django REST API
/static/    Django static files
/media/     Uploaded media files
```

Production environment variables should include:

```env
SECRET_KEY=strong-production-secret
DEBUG=False
ALLOWED_HOSTS=your-domain.com,www.your-domain.com
CORS_ALLOWED_ORIGINS=https://your-domain.com
DATABASE_URL=postgres://user:password@host:5432/database
STATIC_ROOT=/var/www/attendstack/static/
```

Frontend production environment:

```env
NEXT_PUBLIC_API_ENDPOINT=https://your-domain.com
```

---

## 14. Important Screens In The Dashboard

The dashboard includes pages for:

- Landing page
- Admin login
- Employee login
- Admin dashboard
- Employee dashboard
- Employee management
- Employee profile
- Attendance marking
- Today's attendance
- Attendance records
- Leave requests
- Employee leave dashboard
- Holidays
- Salary and payroll
- Settings
- Rulebook
- Forgot password

---

## 15. How To Explain This Project

Here is a short explanation:

> AttendStack is a full-stack HR and attendance management system. I built it using Django REST Framework for the backend and Next.js with TypeScript for the frontend. The system supports role-based access for Super Admin, HR, and Employee users. Employees can check in and check out, apply for leaves, view attendance reports, and see salary details. Admin and HR users can manage employees, attendance records, holidays, payroll, and company rules. The backend uses JWT authentication, custom user roles, attendance automation rules, password reset OTP, IP/geolocation audit data, and configurable system settings.

Here is a more detailed explanation:

> The main problem this project solves is manual attendance and HR record management. Instead of tracking attendance, leaves, holidays, and salary manually, AttendStack centralizes everything in one dashboard. The backend is modular, with separate Django apps for accounts, organizations, employees, attendance, holidays, payroll, and settings. The frontend is built with Next.js and provides different dashboard experiences for admin/HR users and employees. The project also includes production server configuration using Nginx, Gunicorn, PM2, and SSL.

---

## 16. Key Highlights To Mention

- Full-stack project with separate frontend and backend
- Role-based system for Super Admin, HR, and Employee
- JWT authentication using Django REST Framework Simple JWT
- Custom Django user model with email login
- Employee CRUD with auto-generated employee IDs
- Attendance check-in and check-out with live status
- IP address and GPS location audit trail
- Configurable attendance rules like late cutoff and half-day threshold
- Leave request workflow with approval and rejection
- Holiday management
- Payroll generation and salary tracking
- Company settings and rulebook
- Password reset using OTP
- Local SQLite support and production PostgreSQL support
- Production-ready reverse proxy setup with Nginx

---

## 17. Database Models Summary

Main backend models:

- `User` - Custom authentication user with role
- `PasswordResetOTP` - OTP based password recovery
- `Organization` - Company/organization record
- `Employee` - Employee personal, job, salary, and bank details
- `AttendanceRecord` - Daily attendance data
- `LeaveRequest` - Employee leave application data
- `Holiday` - Company holiday calendar
- `Payroll` - Monthly payroll record
- `SystemSettings` - Global attendance, company, security, and notification settings
- `SettingsChangeLog` - Audit log for settings changes

---

## 18. API Summary

Main API base:

```text
/api/v1/
```

Main API groups:

```text
/api/v1/accounts/
/api/v1/employees/
/api/v1/attendance/
/api/v1/attendance/leaves/
/api/v1/holidays/
/api/v1/payroll/
/api/v1/settings/
```

Most APIs require JWT authentication:

```http
Authorization: Bearer <access_token>
```

---

## 19. Common Issues And Fixes

### Frontend cannot connect to backend

Check `dashboard/.env.local`:

```env
NEXT_PUBLIC_API_ENDPOINT=http://127.0.0.1:8000
```

Restart the frontend after changing environment variables.

### CORS error

Check `backend/.env`:

```env
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

### Database error

Run migrations:

```powershell
cd backend
python manage.py migrate
```

### Login not working

Check that:

- Backend server is running
- Frontend environment variable points to backend URL
- User exists in the database
- User has correct role
- Password is correct

### Password reset email not visible

For local development, OTP emails appear in the backend terminal when console email backend is used.

---

## 20. Future Improvements

Possible future improvements:

- Add automated API documentation page in frontend
- Add more analytics charts
- Add export to Excel for attendance and payroll
- Add biometric device integration
- Add mobile app support
- Add advanced notification system
- Add Docker setup for easier deployment
- Add CI/CD pipeline
- Add more automated tests

---

## 21. Final One-Line Description

**AttendStack is a full-stack HRMS and attendance management system built with Django REST Framework and Next.js, designed to manage employees, attendance, leaves, holidays, payroll, and company rules with role-based access.**
