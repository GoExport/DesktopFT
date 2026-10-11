const { BrowserView, Menu, ipcMain, shell } = require("electron");
const path = require("path");
const { isFlashThemesUrl, isSafeExternalUrl, resolveAddressInput } = require("./navigation-policy");
const { watchToolbarTheme } = require("./toolbar-theme");

// The application-owned toolbar lives in the BrowserWindow's own webContents (a local,
// trusted page). FlashThemes runs in a BrowserView laid out underneath it, with the same
// Flash-enabled webPreferences the main window used before.
const TOOLBAR_HEIGHT = 40;
const TOOLBAR_FILE = path.join(__dirname, "toolbar", "toolbar.html");
const TOOLBAR_PRELOAD = path.join(__dirname, "toolbar", "toolbar-preload.js");

const IPC = {
  ready: "desktopft:toolbar:ready",
  navigate: "desktopft:toolbar:navigate",
  command: "desktopft:toolbar:command",
  addressBlur: "desktopft:toolbar:address-blur",
  state: "desktopft:toolbar:state",
  focusAddress: "desktopft:toolbar:focus-address",
  addressFeedback: "desktopft:toolbar:address-feedback",
  updateState: "desktopft:toolbar:update-state",
  theme: "desktopft:toolbar:theme",
};

let toolbarIpcRegistered = false;
const toolbarControllers = new Map();

const openExternalSafely = (targetUrl) => {
  if (isSafeExternalUrl(targetUrl)) {
    shell.openExternal(targetUrl);
    return true;
  }

  console.warn("[DesktopFT] Blocked unsupported external URL:", String(targetUrl).slice(0, 200));
  return false;
};

// One set of ipcMain listeners serves every toolbar; messages are routed by sender id so a
// message from any other webContents (site view, Characters window, settings) is ignored.
const registerToolbarIpc = () => {
  if (toolbarIpcRegistered) {
    return;
  }
  toolbarIpcRegistered = true;

  const withController = (handler) => (event, payload) => {
    const controller = toolbarControllers.get(event.sender.id);
    if (controller) {
      handler(controller, payload);
    }
  };

  ipcMain.on(IPC.ready, withController((controller) => controller.handleToolbarReady()));
  ipcMain.on(IPC.navigate, withController((controller, input) => controller.navigateFromAddressBar(input)));
  ipcMain.on(IPC.command, withController((controller, command) => controller.runCommand(command)));
  ipcMain.on(IPC.addressBlur, withController((controller) => controller.handleAddressBlur()));
};

const createNavigation = (options) => {
  const { win, homeUrl, webPreferences, isEditorUrl, onUpdateButton } = options;

  const view = new BrowserView({ webPreferences });
  const site = view.webContents;
  const toolbar = win.webContents;

  let collapsed = false;
  let htmlFullScreen = false;
  let addressRevealed = false;
  let updateIndicator = { available: false, version: "" };

  const isAlive = () => !win.isDestroyed() && !view.isDestroyed();

  const shouldCollapse = () => {
    if (htmlFullScreen) {
      return true;
    }
    // In the Flash editor the toolbar stays hidden unless Ctrl+L reveals it.
    return isEditorUrl(site.getURL()) && !addressRevealed;
  };

  const layout = () => {
    if (!isAlive()) {
      return;
    }

    collapsed = shouldCollapse();
    const size = win.getContentSize();
    const top = collapsed ? 0 : TOOLBAR_HEIGHT;
    view.setBounds({
      x: 0,
      y: top,
      width: Math.max(0, size[0]),
      height: Math.max(0, size[1] - top),
    });
  };

  const sendToToolbar = (channel, payload) => {
    if (!win.isDestroyed() && !toolbar.isDestroyed()) {
      toolbar.send(channel, payload);
    }
  };

  const sendState = () => {
    if (!isAlive()) {
      return;
    }

    sendToToolbar(IPC.state, {
      url: site.getURL(),
      canGoBack: site.canGoBack(),
      canGoForward: site.canGoForward(),
      isLoading: site.isLoading(),
    });
  };

  const syncAfterNavigation = () => {
    layout();
    sendState();
  };

  const loadUrl = (targetUrl) => {
    if (!isAlive()) {
      return false;
    }

    if (!isFlashThemesUrl(targetUrl)) {
      console.warn("[DesktopFT] Refused to load non-FlashThemes URL in main window.");
      return false;
    }

    site.loadURL(targetUrl);
    return true;
  };

  const focusSite = () => {
    if (isAlive()) {
      site.focus();
    }
  };

  const focusAddressBar = () => {
    if (!isAlive()) {
      return;
    }

    if (collapsed && !htmlFullScreen) {
      addressRevealed = true;
      layout();
    }

    toolbar.focus();
    sendToToolbar(IPC.focusAddress);
  };

  const goBack = () => {
    if (isAlive() && site.canGoBack()) {
      site.goBack();
    }
  };

  const goForward = () => {
    if (isAlive() && site.canGoForward()) {
      site.goForward();
    }
  };

  const reload = (ignoreCache) => {
    if (!isAlive()) {
      return;
    }
    if (ignoreCache) {
      site.reloadIgnoringCache();
    } else {
      site.reload();
    }
  };

  const hideRevealedAddressBar = () => {
    if (addressRevealed) {
      addressRevealed = false;
      layout();
    }
  };

  const controller = {
    handleToolbarReady() {
      sendState();
      sendToToolbar(IPC.updateState, updateIndicator);
      sendToToolbar(IPC.theme, toolbarTheme);
    },

    navigateFromAddressBar(input) {
      const decision = resolveAddressInput(input);

      if (decision.action === "internal") {
        hideRevealedAddressBar();
        loadUrl(decision.url);
        focusSite();
        return;
      }

      if (decision.action === "external" && openExternalSafely(decision.url)) {
        sendToToolbar(IPC.addressFeedback, { kind: "info", message: "Opened in your web browser." });
        sendState();
        return;
      }

      sendToToolbar(IPC.addressFeedback, {
        kind: "error",
        message: decision.reason || "DesktopFT only opens FlashThemes addresses.",
      });
    },

    runCommand(command) {
      switch (command) {
        case "back":
          goBack();
          break;
        case "forward":
          goForward();
          break;
        case "reload":
          reload(false);
          break;
        case "stop":
          if (isAlive()) site.stop();
          break;
        case "home":
          hideRevealedAddressBar();
          loadUrl(homeUrl);
          break;
        case "updates":
          if (typeof onUpdateButton === "function") onUpdateButton();
          break;
        default:
          break;
      }
    },

    handleAddressBlur() {
      hideRevealedAddressBar();
    },
  };

  // --- Toolbar window contents: a local page that must never navigate anywhere. ---
  toolbar.on("will-navigate", (event) => event.preventDefault());
  toolbar.on("new-window", (event) => event.preventDefault());
  toolbar.on("context-menu", (event, params) => {
    if (params.isEditable) {
      Menu.buildFromTemplate([
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { type: "separator" },
        { role: "selectAll" },
      ]).popup({ window: win });
    }
  });

  // --- Site view: enforce the FlashThemes-only policy for every kind of navigation. ---
  // Server-side redirects never reach will-navigate, so they are checked separately.
  site.on("will-redirect", (event, targetUrl, isInPlace, isMainFrame) => {
    if (isMainFrame && !isFlashThemesUrl(targetUrl)) {
      event.preventDefault();
      openExternalSafely(targetUrl);
    }
  });

  // Backstop for browser-initiated navigations (history, loadURL) that bypass will-navigate.
  site.on("did-start-navigation", (event, targetUrl, isInPlace, isMainFrame) => {
    if (!isMainFrame || isInPlace || isFlashThemesUrl(targetUrl)) {
      return;
    }
    if (targetUrl === "about:blank" || targetUrl.indexOf("chrome-error:") === 0) {
      return;
    }

    console.warn("[DesktopFT] Stopped non-FlashThemes main-frame navigation.");
    site.stop();
  });

  site.on("did-navigate", (event, targetUrl) => {
    // Last line of defence: a non-FlashThemes page must never stay committed in this view.
    if (/^(https?|file|data|blob|ftp):/i.test(targetUrl) && !isFlashThemesUrl(targetUrl)) {
      console.warn("[DesktopFT] Non-FlashThemes page committed; returning home.");
      site.loadURL(homeUrl);
      return;
    }

    addressRevealed = false;
    syncAfterNavigation();
  });

  site.on("did-navigate-in-page", (event, targetUrl, isMainFrame) => {
    if (isMainFrame) {
      syncAfterNavigation();
    }
  });

  site.on("did-start-loading", sendState);
  site.on("did-stop-loading", sendState);
  site.on("did-fail-load", sendState);

  site.on("enter-html-full-screen", () => {
    htmlFullScreen = true;
    layout();
  });
  site.on("leave-html-full-screen", () => {
    htmlFullScreen = false;
    layout();
  });

  // --- Window layout. Electron 4 does not reliably resize BrowserViews itself. ---
  const scheduleLayout = () => setImmediate(layout);
  ["resize", "maximize", "unmaximize", "restore", "enter-full-screen", "leave-full-screen"].forEach((eventName) => {
    win.on(eventName, scheduleLayout);
  });

  const toolbarId = toolbar.id;
  toolbarControllers.set(toolbarId, controller);
  registerToolbarIpc();

  // Match the toolbar to the colours the native menu bar is drawn with, and follow changes.
  let toolbarTheme = null;
  const stopWatchingTheme = watchToolbarTheme((theme) => {
    toolbarTheme = theme;
    if (!win.isDestroyed()) {
      win.setBackgroundColor(theme["--toolbar-bg"]);
    }
    sendToToolbar(IPC.theme, theme);
  });

  win.on("closed", () => {
    stopWatchingTheme();
    toolbarControllers.delete(toolbarId);
    if (!view.isDestroyed()) {
      view.destroy();
    }
  });

  view.setBackgroundColor("#ffffff");
  win.setBrowserView(view);
  layout();

  win.loadFile(TOOLBAR_FILE);

  return {
    TOOLBAR_HEIGHT,
    getSiteContents: () => (isAlive() ? site : null),
    getContentOffsetY: () => (collapsed ? 0 : TOOLBAR_HEIGHT),
    loadUrl,
    goBack,
    goForward,
    reload,
    focusAddressBar,
    focusSite,
    openExternalSafely,
    setUpdateIndicator(indicator) {
      updateIndicator = {
        available: Boolean(indicator && indicator.available),
        version: indicator && typeof indicator.version === "string" ? indicator.version.slice(0, 64) : "",
      };
      sendToToolbar(IPC.updateState, updateIndicator);
    },
  };
};

module.exports = {
  createNavigation,
  openExternalSafely,
  TOOLBAR_PRELOAD,
  TOOLBAR_HEIGHT,
};
