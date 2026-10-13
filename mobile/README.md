# ZuperHR Mobile

Employee-facing React Native (Expo) app for ZuperHR: sign in, check in/out with GPS, view attendance history, apply for leave, and view holidays. Talks to the same Django REST API as the web dashboard.

## Setup

```powershell
cd mobile
npm install
```

Edit `src/config.ts` and set `API_BASE_URL` to your backend's address:

- Physical device on the same Wi-Fi: your PC's LAN IP (e.g. `http://192.168.18.93:8001`)
- Android emulator: `http://10.0.2.2:8001`
- iOS simulator: `http://127.0.0.1:8001`

The backend's `ALLOWED_HOSTS` (in `backend/.env`) must include whichever host/IP you use here.

## Run

```powershell
npx expo start
```

Scan the QR code with Expo Go (Android/iOS) or press `a` / `i` for an emulator/simulator.

Make sure the Django backend is running and reachable at the address configured above:

```powershell
cd ../backend
.\venv\Scripts\Activate.ps1
python manage.py runserver 0.0.0.0:8001
```

## What's included

- JWT login with token refresh (`src/context/AuthContext.tsx`, `src/api/client.ts`)
- Today's attendance + check-in/check-out with GPS (`src/screens/HomeScreen.tsx`)
- Attendance history (`src/screens/AttendanceHistoryScreen.tsx`)
- Leave requests: list + create (`src/screens/LeaveScreen.tsx`, `src/screens/NewLeaveScreen.tsx`)
- Holidays list (`src/screens/HolidaysScreen.tsx`)
- Profile + logout (`src/screens/ProfileScreen.tsx`)

Only role `EMPLOYEE` accounts have a linked employee profile for full functionality; HR/Admin accounts can still log in and check attendance status.
