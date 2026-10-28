"use strict";

/**
 * ZuperHR Monitor — Electron main process (Company Admin Monitoring).
 *
 * Responsibilities:
 *  1. Run as a single, background instance.
 *  2. Store the device token securely (Electron safeStorage, encrypted at rest).
 *  3. Grant screen capture SILENTLY — no "choose what to share" picker.
 *  4. Show a sign-in window only on first launch; after registration the app
 *     runs hidden and starts automatically with Windows.
 *  5. Capture periodic screenshots and upload to the server.
 *  6. Track active window / website and upload activity data.
 *  7. Uninstall protection: require password before quit/uninstall.
 */

const { app, BrowserWindow, desktopCapturer, session, ipcMain, Tray, Menu, nativeImage, dialog } = require("electron");
const { execFile, exec } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { safeStorage } = require("electron");
const { spawn } = require("child_process");
const { SERVER_BASE, SHOW_TRAY, AUTO_LAUNCH, APP_VERSION } = require("./config");

const API_BASE = "/api/v1/monitoring";

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;
let tray = null;
let messagePopup = null;
const messageQueue = [];
let processingMessage = false;
let quitAuthorized = false;

const TOKEN_FILE = () => path.join(app.getPath("userData"), "device.bin");
const UNINSTALL_HASH_FILE = () => path.join(app.getPath("userData"), "up.bin");

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
      { label: "Quit", click: () => attemptQuit() },
    ])
  );
}

// --------------------------------------------------------- uninstall protection
let protectionEnabled = false;

async function fetchProtectionStatus() {
  const tokenData = loadToken();
  if (!tokenData || !tokenData.device_token) return;
  try {
    const r = await fetch(SERVER_BASE + API_BASE + "/agent/verify-uninstall-password/", {
      headers: { "Authorization": "Device " + tokenData.device_token },
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
    const r = await fetch(SERVER_BASE + API_BASE + "/agent/verify-uninstall-password/", {
      method: "POST",
      headers: {
        "Authorization": "Device " + tokenData.device_token,
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

let passwordWindow = null;

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

    const html = `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 24px; background: #f8f9fa; }
  h3 { margin: 0 0 8px; font-size: 15px; color: #333; }
  p { margin: 0 0 16px; font-size: 12px; color: #666; }
  input { width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
  .btns { display: flex; gap: 8px; margin-top: 16px; }
  button { flex: 1; padding: 8px; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; font-weight: 600; }
  .ok { background: #0d6efd; color: #fff; }
  .cancel { background: #e9ecef; color: #333; }
  .err { color: #dc3545; font-size: 12px; margin-top: 8px; display: none; }
</style></head><body>
<h3>Admin Password Required</h3>
<p>Enter the uninstall password to quit or uninstall this application.</p>
<input type="password" id="pw" placeholder="Password" autofocus>
<div class="err" id="err">Incorrect password. Try again.</div>
<div class="btns">
  <button class="cancel" onclick="window.zuperhrAgent.sendPasswordResult('')">Cancel</button>
  <button class="ok" onclick="window.zuperhrAgent.sendPasswordResult(document.getElementById('pw').value)">Verify</button>
</div>
<script>
  document.getElementById('pw').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') window.zuperhrAgent.sendPasswordResult(document.getElementById('pw').value);
  });
</script>
</body></html>`;

    const tmpHtml = path.join(os.tmpdir(), "zuperhr-pw-prompt.html");
    fs.writeFileSync(tmpHtml, html, "utf8");
    passwordWindow.loadFile(tmpHtml);

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
          passwordWindow.webContents.executeJavaScript(`document.getElementById('err').style.display='block';document.getElementById('pw').value='';document.getElementById('pw').focus();`);
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
    removeWatchdog();
    quitAuthorized = true;
    app.isQuitting = true;
    app.quit();
    return;
  }
  const ok = await showPasswordPrompt();
  if (ok) {
    removeWatchdog();
    quitAuthorized = true;
    app.isQuitting = true;
    app.quit();
  }
}

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
    await fetch(
      SERVER_BASE + API_BASE + `/agent/messages/${messageId}/acknowledge/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Device ${tokenData.device_token}`,
        },
      }
    );
  } catch (_) {}
  dismissMessagePopup();
  return { ok: true };
});

function dismissMessagePopup() {
  messageQueue.shift();
  processingMessage = false;
  if (messagePopup) { messagePopup.destroy(); messagePopup = null; }
  showNextMessage();
}

// ------------------------------------------------------------ auto-update
let updateInProgress = false;
const UPDATE_CHECK_INTERVAL = 5 * 60 * 1000;

async function checkForUpdates() {
  if (updateInProgress) return;
  const tokenData = loadToken();
  if (!tokenData || !tokenData.device_token) return;

  const portableExe = process.env.PORTABLE_EXECUTABLE_FILE;
  if (!portableExe) return;

  try {
    const res = await fetch(
      `${SERVER_BASE}${API_BASE}/agent/check-update/?v=${APP_VERSION}`,
      { headers: { Authorization: `Device ${tokenData.device_token}` } }
    );
    if (!res.ok) return;
    const data = await res.json();
    if (!data.update_available) return;

    updateInProgress = true;
    const updatePath = portableExe + ".update";

    const dlRes = await fetch(
      `${SERVER_BASE}${API_BASE}/agent/download-update/`,
      { headers: { Authorization: `Device ${tokenData.device_token}` } }
    );
    if (!dlRes.ok) { updateInProgress = false; return; }

    const buffer = Buffer.from(await dlRes.arrayBuffer());
    fs.writeFileSync(updatePath, buffer);

    const scriptPath = path.join(path.dirname(portableExe), "_zhr_update.bat");
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

    removeWatchdog();
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
    const bat = path.join(path.dirname(portableExe), "_zhr_update.bat");
    fs.existsSync(bat) && fs.unlinkSync(bat);
  } catch (_) {}
}

// --------------------------------------------------------- watchdog & file lock
const TASK_NAME = "ZuperHRCompanyMonitorWatchdog";

function setupWatchdog() {
  const portableExe = process.env.PORTABLE_EXECUTABLE_FILE;
  if (!portableExe) return;

  const vbsPath = path.join(path.dirname(portableExe), "_zuperhr_co_watchdog.vbs");
  const vbs = [
    'Set WshShell = CreateObject("WScript.Shell")',
    'exePath = "' + portableExe.replace(/"/g, '""') + '"',
    'Do While True',
    '  On Error Resume Next',
    '  Set objWMI = GetObject("winmgmts:\\\\.\\" & "root\\cimv2")',
    '  Set procs = objWMI.ExecQuery("SELECT * FROM Win32_Process WHERE ExecutablePath=\'" & Replace(exePath, "\\", "\\\\") & "\'")',
    '  If procs.Count = 0 Then',
    '    WshShell.Run """" & exePath & """ --hidden", 0, False',
    '  End If',
    '  On Error GoTo 0',
    '  WScript.Sleep 30000',
    'Loop',
  ].join("\r\n");
  try { fs.writeFileSync(vbsPath, vbs, "utf8"); } catch (_) {}

  const taskCmd = `schtasks /create /tn "${TASK_NAME}" /tr "wscript.exe \\"${vbsPath}\\"" /sc onlogon /f`;
  exec(taskCmd, { timeout: 10000 }, () => {});

  const checkCmd = `schtasks /create /tn "${TASK_NAME}_Check" /tr "wscript.exe \\"${vbsPath}\\"" /sc minute /mo 2 /f`;
  exec(checkCmd, { timeout: 10000 }, () => {});

  try {
    const isRunning = require("child_process").execSync(
      `tasklist /fi "IMAGENAME eq wscript.exe" /fo csv /nh`,
      { timeout: 5000 }
    ).toString();
    if (!isRunning.includes("_zuperhr_co_watchdog.vbs")) {
      const child = spawn("wscript.exe", [vbsPath], { detached: true, stdio: "ignore", windowsHide: true });
      child.unref();
    }
  } catch (_) {
    const child = spawn("wscript.exe", [vbsPath], { detached: true, stdio: "ignore", windowsHide: true });
    child.unref();
  }
}

let exeFileHandle = null;

function lockExeFile() {
  const portableExe = process.env.PORTABLE_EXECUTABLE_FILE;
  if (!portableExe) return;
  try {
    exeFileHandle = fs.openSync(portableExe, "r");
  } catch (_) {}
}

function removeWatchdog() {
  exec(`schtasks /delete /tn "${TASK_NAME}" /f`, { timeout: 5000 }, () => {});
  exec(`schtasks /delete /tn "${TASK_NAME}_Check" /f`, { timeout: 5000 }, () => {});
  exec(`taskkill /f /fi "WINDOWTITLE eq _zuperhr_co_watchdog.vbs"`, { timeout: 5000 }, () => {});
  const portableExe = process.env.PORTABLE_EXECUTABLE_FILE;
  if (portableExe) {
    try {
      const vbsPath = path.join(path.dirname(portableExe), "_zuperhr_co_watchdog.vbs");
      fs.existsSync(vbsPath) && fs.unlinkSync(vbsPath);
    } catch (_) {}
  }
  if (exeFileHandle !== null) {
    try { fs.closeSync(exeFileHandle); } catch (_) {}
    exeFileHandle = null;
  }
}

// --------------------------------------------------------------------- IPC
ipcMain.handle("agent:getBootState", () => ({
  server: SERVER_BASE,
  token: loadToken(),
}));

ipcMain.handle("agent:register", async (_e, payload) => {
  try {
    const res = await fetch(SERVER_BASE + API_BASE + "/devices/register/", {
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
  fetchProtectionStatus();
  setupAutoRestart();
  setupWatchdog();
  lockExeFile();
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

// --------------------------------------------------------- auto-restart
function setupAutoRestart() {
  const exePath = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const taskName = "ZuperHRMonitorRestart";
  const cmd = `schtasks /create /tn "${taskName}" /tr "\\"${exePath}\\" --hidden" /sc onlogon /f`;
  exec(cmd, { timeout: 10000 }, (err) => {
    if (err) console.error("Failed to register auto-restart task:", err.message);
  });
}

// --------------------------------------------------------------------- boot
app.on("second-instance", () => {
  if (win) { win.show(); win.setSkipTaskbar(false); }
});

async function validateToken() {
  const tokenData = loadToken();
  if (!tokenData || !tokenData.device_token) return false;
  try {
    const r = await fetch(SERVER_BASE + API_BASE + "/devices/heartbeat/", {
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

app.on("before-quit", (e) => {
  if (!quitAuthorized && protectionEnabled && loadToken()) {
    e.preventDefault();
    attemptQuit();
    return;
  }
});

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
  cleanupStaleUpdate();

  if (hasToken) {
    startSnapshotLoop();
    startActivityTracking();
    fetchProtectionStatus();
    setupAutoRestart();
    setInterval(fetchProtectionStatus, 5 * 60 * 1000);
    setupWatchdog();
    lockExeFile();
  }

  setTimeout(checkForUpdates, 10_000);
  setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(!loadToken());
  });
});

app.on("window-all-closed", (e) => { /* do not quit */ });
