// Central configuration for Bhatt Square Watch (the Super Admin's monitoring app).
//
// SERVER_BASE is the ZuperHR backend origin the agent connects to.
// The SHIPPED installer must point at production, so that is the default.
// For LOCAL testing, override at launch with the ZUPERHR_SERVER env var:
//   Windows:  set ZUPERHR_SERVER=http://localhost:8001 && npm start
const PROD_SERVER = "https://zuperhr.in";
// A LOCAL-TEST installer is built with src/server.local.json
// ({"server": "http://localhost:8001"}) present; it is git-ignored and must
// not exist when building the shipped installer.
let LOCAL_SERVER = null;
try { LOCAL_SERVER = require("./server.local.json").server || null; } catch (_) {}
const SERVER_BASE = process.env.ZUPERHR_SERVER || LOCAL_SERVER || PROD_SERVER;

// Show a system-tray icon (with Quit). Set to false for a fully invisible
// No tray icon in production — fully invisible.
const SHOW_TRAY = process.env.ZUPERHR_TRAY === "true";

// Start automatically when Windows starts, once the device is registered.
const AUTO_LAUNCH = process.env.ZUPERHR_AUTOLAUNCH !== "false";

module.exports = { SERVER_BASE, SHOW_TRAY, AUTO_LAUNCH };
