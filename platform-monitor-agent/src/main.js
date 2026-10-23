"use strict";

/**
 * Bhatt Square Watch — Electron main process.
 *
 * The Super Admin's monitoring app. Separate from the Company Admin app in
 * ../monitor-agent (different app ID, data folder, server endpoints and
 * tokens), so both can be installed on one computer without interfering.
 *
 * Responsibilities:
 *  1. Run as a single, background instance.
 *  2. Store the device token securely (Electron safeStorage, encrypted at rest).
 *  3. Grant screen capture SILENTLY (no "choose what to share" picker) by
 *     answering getDisplayMedia with the primary screen via desktopCapturer.
 *  4. Show the sign-in window (User ID + password + passkey) only when not
 *     signed in; afterwards run hidden and start automatically with Windows.
 *
 * The app is deliberately powerless: it streams the screen and nothing else.
 * There is no input-injection, file-access or remote-control code anywhere.
 */

const { app, BrowserWindow, desktopCapturer, session, ipcMain, Tray, Menu, nativeImage } = require("electron");
const fs = require("fs");
const path = require("path");
const { safeStorage } = require("electron");
const os = require("os");
const { spawn, execFile } = require("child_process");
const { SERVER_BASE, SHOW_TRAY, AUTO_LAUNCH, APP_VERSION } = require("./config");

const APP_TITLE = "ZuperHR Monitor";

// --- Single instance: a second launch just exits (app already running). ---
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;
let tray = null;
let messagePopup = null;
const messageQueue = [];
let processingMessage = false;
let quitAuthorized = false;
let protectionEnabled = false;
let passwordWindow = null;

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
function showWindow() {
  if (!win) return;
  win.show();
  win.setSkipTaskbar(false);
}

function createWindow(showForSignIn) {
  win = new BrowserWindow({
    width: 460,
    height: 680,
    show: showForSignIn,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: !showForSignIn,
    title: APP_TITLE,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  // Closing the window never quits the app; it just hides again.
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
  const img = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
  );
  tray = new Tray(img);
  tray.setToolTip(`${APP_TITLE} — active`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `${APP_TITLE} (active)`, enabled: false },
      { label: "Show status", click: showWindow },
      { type: "separator" },
      { label: "Quit", click: attemptQuit },
    ])
  );
}

// --------------------------------------------------------------------- IPC
ipcMain.handle("agent:getBootState", () => ({
  server: SERVER_BASE,
  token: loadToken(),              // null when not signed in
}));

// Sign-in runs in the MAIN process (Node fetch), so the cross-origin POST is
// not subject to browser CORS. The server checks all three credentials.
ipcMain.handle("agent:signIn", async (_e, payload) => {
  try {
    const res = await fetch(SERVER_BASE + "/api/v1/platform-monitoring/agent/sign-in/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { detail: "Cannot reach the server. Check the internet connection." } };
  }
});

ipcMain.handle("agent:onSignedIn", (_e, data) => {
  saveToken(data);                 // { device_id, device_token, who }
  if (AUTO_LAUNCH) {
    app.setLoginItemSettings({ openAtLogin: true, args: ["--hidden"] });
  }
  if (win) { win.hide(); win.setSkipTaskbar(true); }
  startSnapshotLoop();
  startActivityTracking();
  fetchProtectionStatus();
  return true;
});

// The server refused this computer (signed out by the Super Admin, account
// disabled or deleted): forget the token and ask for credentials again.
ipcMain.handle("agent:signedOut", () => {
  clearToken();
  app.setLoginItemSettings({ openAtLogin: false });
  showWindow();
  return true;
});

// ------------------------------------------------------------ message popup
function showNextMessage() {
  if (processingMessage || messageQueue.length === 0) return;
  processingMessage = true;
  const msg = messageQueue[0];

  const { screen } = require("electron");
  const primary = screen.getPrimaryDisplay();
  const { width, height } = primary.workAreaSize;
  const popW = 480, popH = 340;

  messagePopup = new BrowserWindow({
    width: popW,
    height: popH,
    x: Math.round((width - popW) / 2),
    y: Math.round((height - popH) / 2),
    resizable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    frame: false,
    transparent: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, "message-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  messagePopup.setAlwaysOnTop(true, "screen-saver");
  messagePopup.loadFile(path.join(__dirname, "renderer", "message-popup.html"));
  messagePopup.webContents.on("did-finish-load", () => {
    messagePopup.webContents.send("display-message", msg);
  });
  messagePopup.on("closed", () => { messagePopup = null; });
  messagePopup.show();
  messagePopup.focus();
}

ipcMain.handle("agent:showAdminMessage", (_e, msg) => {
  messageQueue.push(msg);
  if (!processingMessage) showNextMessage();
  return true;
});

ipcMain.handle("agent:acknowledgeMessage", async (_e, messageId) => {
  const tokenData = loadToken();
  if (!tokenData || !tokenData.device_token) {
    dismissMessagePopup();
    return { ok: true };
  }
  try {
    const res = await fetch(
      SERVER_BASE + `/api/v1/platform-monitoring/agent/messages/${messageId}/acknowledge/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Device ${tokenData.device_token}`,
        },
      }
    );
    dismissMessagePopup();
    return { ok: true };
  } catch (e) {
    dismissMessagePopup();
    return { ok: true };
  }
});

function dismissMessagePopup() {
  messageQueue.shift();
  processingMessage = false;
  if (messagePopup) { messagePopup.destroy(); messagePopup = null; }
  showNextMessage();
}

// --------------------------------------------------------- auto screenshots
let snapshotTimer = null;
let snapshotIntervalMs = 30 * 60 * 1000;

async function captureAndUpload() {
  const tokenData = loadToken();
  if (!tokenData || !tokenData.device_token) return;

  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 1920, height: 1080 },
    });
    if (!sources.length) return;

    const screenshot = sources[0].thumbnail.toJPEG(80);
    const boundary = "----BSWatch" + Date.now();
    const filename = "screenshot.jpg";
    const header = `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;
    const body = Buffer.concat([Buffer.from(header), screenshot, Buffer.from(footer)]);

    await fetch(SERVER_BASE + "/api/v1/platform-monitoring/agent/snapshot/upload/", {
      method: "POST",
      headers: {
        Authorization: "Device " + tokenData.device_token,
        "Content-Type": "multipart/form-data; boundary=" + boundary,
      },
      body,
    });
  } catch (e) {
    console.error("Snapshot capture/upload failed:", e.message);
  }
}

async function fetchSnapshotInterval() {
  const tokenData = loadToken();
  if (!tokenData || !tokenData.device_token) return;
  try {
    const r = await fetch(SERVER_BASE + "/api/v1/platform-monitoring/agent/snapshot/interval/", {
      headers: { Authorization: "Device " + tokenData.device_token },
    });
    if (r.ok) {
      const data = await r.json();
      if (data.interval_minutes && data.interval_minutes > 0) {
        snapshotIntervalMs = data.interval_minutes * 60 * 1000;
      }
    }
  } catch (_) {}
}

function startSnapshotLoop() {
  stopSnapshotLoop();
  fetchSnapshotInterval().then(() => {
    captureAndUpload();
    snapshotTimer = setInterval(() => {
      fetchSnapshotInterval();
      captureAndUpload();
    }, snapshotIntervalMs);
    setInterval(async () => {
      const oldInterval = snapshotIntervalMs;
      await fetchSnapshotInterval();
      if (snapshotIntervalMs !== oldInterval && snapshotTimer) {
        clearInterval(snapshotTimer);
        snapshotTimer = setInterval(() => {
          fetchSnapshotInterval();
          captureAndUpload();
        }, snapshotIntervalMs);
      }
    }, 5 * 60 * 1000);
  });
}

function stopSnapshotLoop() {
  if (snapshotTimer) { clearInterval(snapshotTimer); snapshotTimer = null; }
}

// --------------------------------------------------------- activity tracking
const ACTIVITY_POLL_MS = 10 * 1000;
const ACTIVITY_UPLOAD_MS = 2 * 60 * 1000;
const ACTIVITY_SCRIPT = path.join(os.tmpdir(), "bswatch-activity.ps1");

let activityPollTimer = null;
let activityUploadTimer = null;
let currentActivity = null;
let pendingEntries = [];

function ensureActivityScript() {
  try {
    if (fs.existsSync(ACTIVITY_SCRIPT)) return;
    const script = [
      'Add-Type @"',
      "using System;",
      "using System.Runtime.InteropServices;",
      "using System.Text;",
      "using System.Diagnostics;",
      "public class BSWAW {",
      '    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();',
      '    [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder t, int n);',
      '    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);',
      "    [StructLayout(LayoutKind.Sequential)] struct LII { public uint s; public uint t; }",
      '    [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LII i);',
      "    public static string G() {",
      "        var h = GetForegroundWindow();",
      "        var b = new StringBuilder(512);",
      "        GetWindowText(h, b, 512);",
      "        uint p; GetWindowThreadProcessId(h, out p);",
      '        string n = "";',
      "        try { n = Process.GetProcessById((int)p).ProcessName; } catch {}",
      "        LII i = new LII(); i.s = 8; GetLastInputInfo(ref i);",
      '        return n + "<|>" + b.ToString() + "<|>" + ((Environment.TickCount - i.t) / 1000);',
      "    }",
      "}",
      '"@',
      "[BSWAW]::G()",
    ].join("\n");
    fs.writeFileSync(ACTIVITY_SCRIPT, script, "utf8");
  } catch (e) {
    console.error("ensureActivityScript:", e.message);
  }
}

function getActiveWindow() {
  return new Promise((resolve) => {
    ensureActivityScript();
    execFile(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ACTIVITY_SCRIPT],
      { timeout: 8000 },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        const parts = stdout.trim().split("<|>");
        if (parts.length < 3) return resolve(null);
        resolve({
          processName: parts[0] || "",
          title: parts[1] || "",
          idleSeconds: parseInt(parts[2], 10) || 0,
        });
      }
    );
  });
}

function parseBrowserTitle(processName, title) {
  const browsers = {
    chrome: " - Google Chrome",
    msedge: " - Microsoft Edge",
    firefox: " — Mozilla Firefox",
    brave: " - Brave",
    opera: " - Opera",
  };
  const pn = processName.toLowerCase();
  for (const [key, suffix] of Object.entries(browsers)) {
    if (pn.includes(key)) {
      const idx = title.lastIndexOf(suffix);
      return idx > 0 ? title.substring(0, idx).trim() : title;
    }
  }
  return "";
}

function closeCurrentActivity() {
  if (!currentActivity) return;
  const now = new Date();
  const started = new Date(currentActivity.started_at);
  const durationSec = Math.round((now.getTime() - started.getTime()) / 1000);
  if (durationSec >= 5) {
    pendingEntries.push({
      ...currentActivity,
      ended_at: now.toISOString(),
      duration_seconds: durationSec,
    });
  }
  currentActivity = null;
}

async function pollActivity() {
  const info = await getActiveWindow();
  if (!info) return;

  if (info.idleSeconds > 60) {
    if (currentActivity) closeCurrentActivity();
    return;
  }

  const appName = info.processName;
  const rawTitle = info.title;
  const pageTitle = parseBrowserTitle(appName, rawTitle);
  const displayTitle = pageTitle || rawTitle;

  if (currentActivity && currentActivity.app_name === appName && currentActivity.title === displayTitle) {
    return;
  }

  if (currentActivity) closeCurrentActivity();

  currentActivity = {
    app_name: appName,
    title: displayTitle,
    url: "",
    started_at: new Date().toISOString(),
  };
}

async function uploadActivityEntries() {
  if (pendingEntries.length === 0) return;
  const tokenData = loadToken();
  if (!tokenData || !tokenData.device_token) return;

  const entries = [...pendingEntries];
  pendingEntries = [];

  try {
    const r = await fetch(SERVER_BASE + "/api/v1/platform-monitoring/agent/activity/upload/", {
      method: "POST",
      headers: {
        Authorization: "Device " + tokenData.device_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ entries }),
    });
    if (!r.ok) {
      pendingEntries = entries.concat(pendingEntries);
    }
  } catch {
    pendingEntries = entries.concat(pendingEntries);
  }
}

function startActivityTracking() {
  stopActivityTracking();
  activityPollTimer = setInterval(pollActivity, ACTIVITY_POLL_MS);
  activityUploadTimer = setInterval(uploadActivityEntries, ACTIVITY_UPLOAD_MS);
}

function stopActivityTracking() {
  if (activityPollTimer) { clearInterval(activityPollTimer); activityPollTimer = null; }
  if (activityUploadTimer) { clearInterval(activityUploadTimer); activityUploadTimer = null; }
}

// --------------------------------------------------------- uninstall protection
async function fetchProtectionStatus() {
  const tokenData = loadToken();
  if (!tokenData || !tokenData.device_token) return;
  try {
    const r = await fetch(SERVER_BASE + "/api/v1/platform-monitoring/agent/verify-uninstall-password/", {
      headers: { Authorization: "Device " + tokenData.device_token },
    });
    if (r.ok) {
      const data = await r.json();
      protectionEnabled = data.protection_enabled;
    }
  } catch (_) {}
}

async function verifyUninstallPassword(password) {
  const tokenData = loadToken();
  if (!tokenData || !tokenData.device_token) return true;
  try {
    const r = await fetch(SERVER_BASE + "/api/v1/platform-monitoring/agent/verify-uninstall-password/", {
      method: "POST",
      headers: {
        Authorization: "Device " + tokenData.device_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
    });
    if (r.ok) {
      const data = await r.json();
      return data.verified;
    }
    return false;
  } catch (_) {
    return false;
  }
}

function showPasswordPrompt() {
  return new Promise((resolve) => {
    if (passwordWindow) {
      passwordWindow.focus();
      return resolve(false);
    }

    passwordWindow = new BrowserWindow({
      width: 380,
      height: 220,
      resizable: false,
      minimizable: false,
      maximizable: false,
      alwaysOnTop: true,
      title: "ZuperHR Monitor — Authorization Required",
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    passwordWindow.setMenuBarVisibility(false);
    passwordWindow.loadFile(path.join(__dirname, "renderer", "password-prompt.html"));

    passwordWindow.on("closed", () => {
      passwordWindow = null;
      resolve(false);
    });

    ipcMain.handleOnce("agent:passwordResult", async (_e, password) => {
      if (!password) {
        if (passwordWindow) { passwordWindow.close(); passwordWindow = null; }
        return resolve(false);
      }
      const verified = await verifyUninstallPassword(password);
      if (verified) {
        if (passwordWindow) { passwordWindow.close(); passwordWindow = null; }
        resolve(true);
      } else {
        if (passwordWindow) {
          passwordWindow.webContents.executeJavaScript(
            `document.getElementById('err').style.display='block';document.getElementById('pw').value='';document.getElementById('pw').focus();`
          );
        }
        ipcMain.handleOnce("agent:passwordResult", async (_e2, pw2) => {
          if (!pw2) {
            if (passwordWindow) { passwordWindow.close(); passwordWindow = null; }
            return resolve(false);
          }
          const v2 = await verifyUninstallPassword(pw2);
          if (passwordWindow) { passwordWindow.close(); passwordWindow = null; }
          resolve(v2);
        });
      }
    });
  });
}

async function attemptQuit() {
  if (!protectionEnabled || !loadToken()) {
    quitAuthorized = true;
    app.isQuitting = true;
    app.quit();
    return;
  }
  const ok = await showPasswordPrompt();
  if (ok) {
    quitAuthorized = true;
    app.isQuitting = true;
    app.quit();
  }
}

// ------------------------------------------------------------ auto-update
let updateInProgress = false;
const UPDATE_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

async function checkForUpdates() {
  if (updateInProgress) return;
  const tokenData = loadToken();
  if (!tokenData || !tokenData.device_token) return;

  const portableExe = process.env.PORTABLE_EXECUTABLE_FILE;
  if (!portableExe) return;

  try {
    const res = await fetch(
      `${SERVER_BASE}/api/v1/platform-monitoring/agent/check-update/?v=${APP_VERSION}`,
      { headers: { Authorization: `Device ${tokenData.device_token}` } }
    );
    if (!res.ok) return;
    const data = await res.json();
    if (!data.update_available) return;

    updateInProgress = true;
    const updatePath = portableExe + ".update";

    const dlRes = await fetch(
      `${SERVER_BASE}/api/v1/platform-monitoring/agent/download-update/`,
      { headers: { Authorization: `Device ${tokenData.device_token}` } }
    );
    if (!dlRes.ok) { updateInProgress = false; return; }

    const buffer = Buffer.from(await dlRes.arrayBuffer());
    fs.writeFileSync(updatePath, buffer);

    const scriptPath = path.join(path.dirname(portableExe), "_bsw_update.bat");
    const script = [
      "@echo off",
      "timeout /t 3 /nobreak >nul",
      ":wait",
      `tasklist /fi "PID eq ${process.pid}" 2>nul | find "${process.pid}" >nul`,
      "if not errorlevel 1 (",
      "    timeout /t 2 /nobreak >nul",
      "    goto wait",
      ")",
      "timeout /t 1 /nobreak >nul",
      `move /y "${updatePath}" "${portableExe}"`,
      `start "" "${portableExe}" --hidden`,
      `del "%~f0"`,
    ].join("\r\n");
    fs.writeFileSync(scriptPath, script);

    const child = spawn("cmd.exe", ["/c", scriptPath], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();

    quitAuthorized = true;
    app.isQuitting = true;
    app.quit();
  } catch (e) {
    console.error("Update check failed:", e.message);
    updateInProgress = false;
  }
}

function cleanupStaleUpdate() {
  const portableExe = process.env.PORTABLE_EXECUTABLE_FILE;
  if (!portableExe) return;
  try { fs.existsSync(portableExe + ".update") && fs.unlinkSync(portableExe + ".update"); } catch (_) {}
  try {
    const bat = path.join(path.dirname(portableExe), "_bsw_update.bat");
    fs.existsSync(bat) && fs.unlinkSync(bat);
  } catch (_) {}
}

// --------------------------------------------------------------------- boot
app.on("second-instance", showWindow);

app.on("before-quit", (e) => {
  if (!quitAuthorized && protectionEnabled && loadToken()) {
    e.preventDefault();
    attemptQuit();
  }
});

app.whenReady().then(() => {
  installDisplayMediaHandler();

  const launchedHidden = process.argv.includes("--hidden");
  const hasToken = !!loadToken();

  createWindow(/* showForSignIn */ !hasToken && !launchedHidden);
  createTray();
  cleanupStaleUpdate();

  if (hasToken) {
    startSnapshotLoop();
    startActivityTracking();
    fetchProtectionStatus();
    setInterval(fetchProtectionStatus, 5 * 60 * 1000);
  }

  setTimeout(checkForUpdates, 10_000);
  setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(!loadToken());
  });
});

// Keep running when all windows are closed (background app).
app.on("window-all-closed", () => { /* do not quit */ });
