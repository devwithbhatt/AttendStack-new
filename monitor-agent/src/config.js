// Central configuration for the ZuperHR Monitor agent.
//
// SERVER_BASE is the ZuperHR backend origin the agent connects to.
// The SHIPPED installer must point at production, so that is the default.
// For LOCAL testing, override at launch with the ZUPERHR_SERVER env var:
//   Windows:  set ZUPERHR_SERVER=http://localhost:8001 && npm start
const PROD_SERVER = "https://zuperhr.in";
const SERVER_BASE = process.env.ZUPERHR_SERVER || PROD_SERVER;

// Show a system-tray icon (with Quit). Set to false for a fully invisible
// production build. Kept true during testing so the agent is easy to stop.
const SHOW_TRAY = process.env.ZUPERHR_TRAY !== "false";

// Start automatically when Windows starts, once the device is registered.
const AUTO_LAUNCH = process.env.ZUPERHR_AUTOLAUNCH !== "false";

module.exports = { SERVER_BASE, SHOW_TRAY, AUTO_LAUNCH };
