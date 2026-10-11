// Preload for the local toolbar page. Node integration is off; only this narrow API is
// exposed, and ipcRenderer itself never reaches the page. The main process re-validates
// every request, so this API is a convenience, not a security boundary.
const { ipcRenderer } = require("electron");

const subscribe = (channel) => (callback) => {
  ipcRenderer.on(channel, (event, payload) => callback(payload));
};

window.desktopftToolbar = Object.freeze({
  ready: () => ipcRenderer.send("desktopft:toolbar:ready"),
  navigate: (input) => ipcRenderer.send("desktopft:toolbar:navigate", String(input || "").slice(0, 2048)),
  command: (name) => ipcRenderer.send("desktopft:toolbar:command", String(name)),
  addressBlur: () => ipcRenderer.send("desktopft:toolbar:address-blur"),
  onState: subscribe("desktopft:toolbar:state"),
  onFocusAddress: subscribe("desktopft:toolbar:focus-address"),
  onAddressFeedback: subscribe("desktopft:toolbar:address-feedback"),
  onUpdateState: subscribe("desktopft:toolbar:update-state"),
  onTheme: subscribe("desktopft:toolbar:theme"),
});
