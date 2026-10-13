"use strict";

// Minimal, locked-down bridge between the renderer and the main process.
// The renderer can read boot state (server URL + stored token), sign in,
// report a successful sign-in, and report being signed out. Nothing else.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agentAPI", {
  getBootState: () => ipcRenderer.invoke("agent:getBootState"),
  signIn: (payload) => ipcRenderer.invoke("agent:signIn", payload),
  onSignedIn: (data) => ipcRenderer.invoke("agent:onSignedIn", data),
  signedOut: () => ipcRenderer.invoke("agent:signedOut"),
});
