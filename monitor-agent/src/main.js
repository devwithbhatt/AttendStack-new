"use strict";

/**
 * ZuperHR Monitor — Electron main process (Super Admin / Platform Monitoring).
 *
 * Responsibilities:
 *  1. Run as a single, background instance.
 *  2. Store the device token securely (Electron safeStorage, encrypted at rest).
 *  3. Grant screen capture SILENTLY — no "choose what to share" picker.
 *  4. Show a sign-in window only on first launch; after registration the app
 *     runs hidden and starts automatically with Windows.
 *  5. Capture periodic screenshots and upload to the server.
 *  6. Track active window / website and upload activity data.
 */

const { app, BrowserWindow, desktopCapturer, session, ipcMain, Tray, Menu, nativeImage } = require("electron");
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { safeStorage } = require("electron");
const { SERVER_BASE, SHOW_TRAY, AUTO_LAUNCH } = require("./config");

const API_BASE = "/api/v1/platform-monitoring";

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
  session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      desktopCapturer
        .getSources({ types: ["screen"] })
        .then((sources) => {
          const primary = sources[0];
          if (!primary) return callback({});
          callback({ video: primary });
        })
        .catch(() => callback({}));
    },
    { useSystemPicker: false }
  );
}

// ------------------------------------------------------------------- window
function createWindow(showForSignIn) {
  const iconPath = path.join(__dirname, "..", "build", "icon.png");
  win = new BrowserWindow({
    width: 460,
    height: 640,
    show: showForSignIn,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: !showForSignIn,
    title: "ZuperHR Monitor",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
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
  const iconPath = path.join(__dirname, "..", "build", "icon.png");
  const img = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();
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
  token: loadToken(),
}));

ipcMain.handle("agent:register", async (_e, payload) => {
  try {
    const res = await fetch(SERVER_BASE + API_BASE + "/agent/sign-in/", {
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
  saveToken(data);
  if (AUTO_LAUNCH) {
    app.setLoginItemSettings({ openAtLogin: true, args: ["--hidden"] });
  }
  if (win) { win.hide(); win.setSkipTaskbar(true); }
  startSnapshotLoop();
  startActivityTracking();
  return true;
});

ipcMain.handle("agent:forget", () => {
  clearToken();
  app.setLoginItemSettings({ openAtLogin: false });
  return true;
});

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
    const boundary = "----ZuperHR" + Date.now();
    const filename = "screenshot.jpg";
    const header = `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;
    const body = Buffer.concat([Buffer.from(header), screenshot, Buffer.from(footer)]);

    await fetch(SERVER_BASE + API_BASE + "/agent/snapshot/upload/", {
      method: "POST",
      headers: {
        "Authorization": "Device " + tokenData.device_token,
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
    const r = await fetch(SERVER_BASE + API_BASE + "/agent/snapshot/interval/", {
      headers: { "Authorization": "Device " + tokenData.device_token },
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
const ACTIVITY_SCRIPT = path.join(os.tmpdir(), "zuperhr-activity.ps1");

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
      "public class ZAW {",
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
      "[ZAW]::G()",
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
    const r = await fetch(SERVER_BASE + API_BASE + "/agent/activity/upload/", {
      method: "POST",
      headers: {
        "Authorization": "Device " + tokenData.device_token,
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

// --------------------------------------------------------------------- boot
app.on("second-instance", () => {
  if (win) { win.show(); win.setSkipTaskbar(false); }
});

async function validateToken() {
  const tokenData = loadToken();
  if (!tokenData || !tokenData.device_token) return false;
  try {
    const r = await fetch(SERVER_BASE + API_BASE + "/agent/heartbeat/", {
      method: "POST",
      headers: {
        "Authorization": "Device " + tokenData.device_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ active: true }),
    });
    return r.ok;
  } catch (_) {
    return true;
  }
}

app.whenReady().then(async () => {
  installDisplayMediaHandler();

  const launchedHidden = process.argv.includes("--hidden");
  let hasToken = !!loadToken();

  if (hasToken) {
    const valid = await validateToken();
    if (!valid) {
      clearToken();
      hasToken = false;
    }
  }

  createWindow(!hasToken && !launchedHidden);
  createTray();

  if (hasToken) {
    startSnapshotLoop();
    startActivityTracking();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(!loadToken());
  });
});

app.on("window-all-closed", (e) => { /* do not quit */ });
