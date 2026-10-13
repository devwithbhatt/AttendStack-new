# ZuperHR Monitor — Agent

Background Windows agent for ZuperHR **Live Monitoring**. Read-only: it
streams the computer's screen to an authorised Company Admin and does nothing
else — no input, no file access, no remote control.

## How it behaves
- **First launch:** a small window asks for Organisation ID + email + password.
- **After sign-in:** the window hides, the agent runs in the background, starts
  automatically with Windows, and keeps itself connected (auto-reconnect).
- **When an admin watches:** the primary screen is captured **silently** — the
  employee sees no "choose what to share" prompt (unlike a browser).

## Run from source (testing)
```bash
cd monitor-agent
npm install
# point at your backend (default is http://localhost:8001)
#   Windows:  set ZUPERHR_SERVER=http://localhost:8001
npm start
```
During testing a tray icon with **Quit** is shown. Set `ZUPERHR_TRAY=false`
for a fully invisible production build.

## Build the installer
```bash
npm run dist
```
Produces `dist/ZuperHRMonitor-Setup.exe`. Drop that file at
`backend/media/monitoring/agent/ZuperHRMonitor-Setup.exe` so the dashboard's
**Download App** button serves it.

## Configuration (env vars)
| Var | Default | Meaning |
|-----|---------|---------|
| `ZUPERHR_SERVER` | `http://localhost:8001` | Backend origin |
| `ZUPERHR_TRAY` | `true` | Show tray icon with Quit |
| `ZUPERHR_AUTOLAUNCH` | `true` | Start with Windows after registration |

For production, bake the real server URL into `src/config.js` before building.

## Notes / limits
- DRM-protected video and the Windows UAC secure desktop capture as black — expected.
- The device token is stored encrypted (Electron `safeStorage`) under the app's
  userData directory; it is revocable from the admin dashboard.
