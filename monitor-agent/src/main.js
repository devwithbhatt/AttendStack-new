"use strict";

/**
 * ZuperHR Monitor — Electron main process.
 *
 * Responsibilities:
 *  1. Run as a single, background instance.
 *  2. Store the device token securely (Electron safeStorage, encrypted at rest).
 *  3. Grant screen capture SILENTLY — no "choose what to share" picker — by
 *     handling the renderer's getDisplayMedia request with desktopCapturer and
 *     auto-selecting the primary screen. This is the whole point of shipping a
 *     desktop app instead of a web page.
 *  4. Show a sign-in window only on first launch; after registration the app
 *     runs hidden in the background and starts automatically with Windows.
 *
 * The agent is deliberately powerless: it streams the screen and nothing else.
 * There is no input-injection, file-access or remote-control code anywhere.
 */

const { app, BrowserWindow, desktopCapturer, session, ipcMain, Tray, Menu, nativeImage } = require("electron");
const fs = require("fs");
const path = require("path");
const { safeStorage } = require("electron");
const { SERVER_BASE, SHOW_TRAY, AUTO_LAUNCH } = require("./config");

// --- Single instance: a second launch just exits (agent already running). ---
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;
let tray = null;

const TOKEN_FILE = () => path.join(app.getPath("userData"), "device.bin");

// ---------------------------------------------------------------- token store
function saveToken(data) {
  try {
    const json = JSON.stringify(data);
    const buf = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(json)
      : Buffer.from(json, "utf8");
    fs.writeFileSync(TOKEN_FILE(), buf);
    return true;
  } catch (e) {
    console.error("saveToken failed", e);
    return false;
  }
}

function loadToken() {
  try {
    if (!fs.existsSync(TOKEN_FILE())) return null;
    const buf = fs.readFileSync(TOKEN_FILE());
    const json = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : buf.toString("utf8");
    return JSON.parse(json);
  } catch (e) {
    console.error("loadToken failed", e);
    return null;
  }
}

function clearToken() {
  try { fs.existsSync(TOKEN_FILE()) && fs.unlinkSync(TOKEN_FILE()); } catch (_) {}
}

// ------------------------------------------------- silent screen-capture grant
function installDisplayMediaHandler() {
  // When the renderer calls navigator.mediaDevices.getDisplayMedia(), Electron
  // routes it here. We pick the primary screen ourselves and grant it — the
  // employee sees no prompt and makes no choice.
  session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      desktopCapturer
        .getSources({ types: ["screen"] })
        .then((sources) => {
          const primary = sources[0];
          if (!primary) return callback({}); // no screen -> deny
          callback({ video: primary }); // audio intentionally omitted
        })
        .catch(() => callback({}));
    },
    { useSystemPicker: false }
  );
}

// ------------------------------------------------------------------- window
function createWindow(showForSignIn) {
  win = new BrowserWindow({
    width: 460,
    height: 640,
    show: showForSignIn,          // first launch shows sign-in; otherwise hidden
    resizable: false,
    fullscreenable: false,
    skipTaskbar: !showForSignIn,  // stay out of the taskbar when running hidden
    title: "ZuperHR Monitor",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  // Closing the window never quits the agent — it just hides again.
  win.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
      win.setSkipTaskbar(true);
    }
  });
}

function createTray() {
  if (!SHOW_TRAY) return;
  // A 1x1 transparent image is enough to register a tray entry without assets.
  const img = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
  );
  tray = new Tray(img);
  tray.setToolTip("ZuperHR Monitor — active");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "ZuperHR Monitor (active)", enabled: false },
      { type: "separator" },
      { label: "Quit", click: () => { app.isQuitting = true; app.quit(); } },
    ])
  );
}

// --------------------------------------------------------------------- IPC
ipcMain.handle("agent:getBootState", () => ({
  server: SERVER_BASE,
  token: loadToken(),              // null on first launch
}));

// Registration runs in the MAIN process (Node), not the renderer, so the
// cross-origin POST to the API is not subject to browser CORS — the renderer
// has no same-origin server of its own. Keeps webSecurity on.
ipcMain.handle("agent:register", async (_e, payload) => {
  try {
    const res = await fetch(SERVER_BASE + "/api/v1/monitoring/devices/register/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { detail: "Cannot reach server: " + (e && e.message) } };
  }
});

ipcMain.handle("agent:onRegistered", (_e, data) => {
  saveToken(data);                 // { device_id, device_token, who }
  if (AUTO_LAUNCH) {
    app.setLoginItemSettings({ openAtLogin: true, args: ["--hidden"] });
  }
  // Sign-in done: hide the window, keep running in the background.
  if (win) { win.hide(); win.setSkipTaskbar(true); }
  return true;
});

ipcMain.handle("agent:forget", () => {
  clearToken();
  app.setLoginItemSettings({ openAtLogin: false });
  return true;
});

// --------------------------------------------------------------------- boot
app.on("second-instance", () => {
  // If the user relaunches while registered, surface the status window.
  if (win) { win.show(); win.setSkipTaskbar(false); }
});

app.whenReady().then(() => {
  installDisplayMediaHandler();

  const launchedHidden = process.argv.includes("--hidden");
  const hasToken = !!loadToken();

  // Show the sign-in window only when there is no device token AND we weren't
  // auto-started hidden. Otherwise boot straight into hidden background mode.
  createWindow(/* showForSignIn */ !hasToken && !launchedHidden);
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(!loadToken());
  });
});

// Keep running when all windows are closed (background agent).
app.on("window-all-closed", (e) => { /* do not quit */ });
