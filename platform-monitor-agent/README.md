# Bhatt Square Watch

The Super Admin's Live Monitoring app. Read-only: it streams the computer's
screen to the ZuperHR **Super Admin** and does nothing else — no input, no
file access, no remote control.

It is separate from the Company Admin app in `../monitor-agent` (different app
ID, install folder, data folder, server endpoints and tokens). Both can be
installed on the same computer.

## How it works
1. Super Admin → **Live Monitoring** → **Create User** issues a 5-digit
   **User ID**, a **password** and a **passkey** (shown once; **Reset** issues new ones).
2. The Super Admin downloads the installer (**Download App**) and gives it to the person.
3. On first launch the app asks for **User ID, Password and Passkey**. The server
   checks all three exactly (case-sensitive). 5 wrong tries lock the account for 15 minutes.
4. After sign-in the window hides, the app runs in the background, starts with
   Windows, and reconnects by itself. The screen is captured **silently** only
   while the Super Admin is watching.
5. If the Super Admin signs the computer out, or disables/deletes the user, the
   app stops streaming and shows the sign-in screen again.

## Run from source (testing)
```bash
cd platform-monitor-agent
npm install
#   Windows (cmd):  set ZUPERHR_SERVER=http://localhost:8001 && npm start
npm start
```
In the VS Code terminal, `ELECTRON_RUN_AS_NODE=1` is set and breaks Electron;
run `env -u ELECTRON_RUN_AS_NODE npm start` there, or use a normal terminal.

## Build the installer
```bash
npm run dist
```
Produces `dist/BhattSquareWatch.exe`. Publish it at
`backend/media/platform_monitoring/agent/BhattSquareWatch.exe`
so the Super Admin's **Download App** button serves it. The shipped build must
point at production (the default in `src/config.js`).

## Configuration (env vars)
| Var | Default | Meaning |
|-----|---------|---------|
| `ZUPERHR_SERVER` | production URL | Backend origin |
| `ZUPERHR_TRAY` | `true` | Show tray icon (Show status / Quit) |
| `ZUPERHR_AUTOLAUNCH` | `true` | Start with Windows after sign-in |
