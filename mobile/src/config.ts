// Base URL of the ZuperHR Django backend.
//
// This auto-switches so you don't have to remember to change it before publishing:
// - __DEV__ (running via `expo start` / Expo Go / a dev client) -> DEV_API_BASE_URL
// - Production build (EAS build / `expo run` release / published app)   -> PROD_API_BASE_URL
//
// DEV_API_BASE_URL — point this at wherever your Django backend is running while developing:
//   - Physical device on the same Wi-Fi as your dev machine: your machine's LAN IP (current default)
//   - Android emulator: http://10.0.2.2:8001
//   - iOS simulator: http://127.0.0.1:8001
//   The backend must have this host in ALLOWED_HOSTS (backend/.env) or requests will be rejected.
const DEV_API_BASE_URL = "http://192.168.18.93:8001";

// PROD_API_BASE_URL — your live ZuperHR site. Double-check this matches your actual
// production domain before publishing a release build.
const PROD_API_BASE_URL = "https://zuperhr.in";

export const API_BASE_URL = __DEV__ ? DEV_API_BASE_URL : PROD_API_BASE_URL;

// The web dashboard, for the few things that must happen in a browser
// (e.g. paying for a plan through the Razorpay checkout). In development it
// is the local Next.js server on port 3000.
export const WEB_APP_URL = __DEV__ ? DEV_API_BASE_URL.replace(/:\d+$/, ":3000") : PROD_API_BASE_URL;
