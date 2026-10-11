const { app, dialog, net, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { RELEASES_API_URL, createUpdateChecker, isReleasePageUrl } = require("./update-checker");

const STATE_FILE = "update-state.json";
const REQUEST_TIMEOUT_MS = 15000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const STARTUP_DELAY_MS = 10000;

const getStatePath = () => path.join(app.getPath("userData"), STATE_FILE);

const loadState = () => {
  const filePath = getStatePath();
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
};

const saveState = (state) => {
  const filePath = getStatePath();
  const tempPath = filePath + ".tmp";
  fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(tempPath, filePath);
};

// Single GET using Chromium's network stack (honours system proxy settings).
const fetchLatestRelease = () =>
  new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        callback(value);
      }
    };

    const request = net.request({ method: "GET", url: RELEASES_API_URL });
    const timeout = setTimeout(() => {
      request.abort();
      finish(reject, new Error("Request timed out"));
    }, REQUEST_TIMEOUT_MS);

    request.setHeader("Accept", "application/vnd.github+json");
    request.setHeader("User-Agent", "DesktopFT/" + app.getVersion());

    request.on("response", (response) => {
      const chunks = [];
      let size = 0;

      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          request.abort();
          finish(reject, new Error("Response too large"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        finish(resolve, {
          statusCode: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
      response.on("error", (error) => finish(reject, error));
    });
    request.on("error", (error) => finish(reject, error));
    request.end();
  });

const describeFailure = (result) => {
  switch (result.reason) {
    case "rate-limited": {
      const when = result.retryAt ? new Date(result.retryAt).toLocaleTimeString() : "later";
      return "GitHub is temporarily limiting update checks. Please try again after " + when + ".";
    }
    case "no-release":
      return "No published DesktopFT releases were found.";
    case "invalid-response":
      return "GitHub returned an unexpected response.";
    case "network":
      return "Could not reach GitHub. Check your internet connection and try again.";
    default:
      return "Something went wrong while checking for updates.";
  }
};

const formatReleaseDetail = (info) => {
  const release = info.latest;
  const lines = ["Installed version: " + info.currentVersion, "Available version: " + release.version];
  if (release.publishedAt) {
    lines.push("Released: " + new Date(release.publishedAt).toLocaleDateString());
  }
  lines.push("", release.name);
  if (release.notes) {
    lines.push("", release.notes);
  }
  return lines.join("\n");
};

// options: getWindow() -> BrowserWindow | null, setIndicator({ available, version })
const createUpdateNotifier = (options) => {
  let dialogOpen = false;

  const checker = createUpdateChecker({
    currentVersion: app.getVersion(),
    fetchLatest: fetchLatestRelease,
    loadState,
    saveState,
    onChange: (info) => {
      const showBadge = info.updateAvailable && !info.dismissed;
      options.setIndicator({ available: showBadge, version: showBadge ? info.latest.version : "" });
    },
  });

  const showMessage = (messageOptions, callback) => {
    const win = options.getWindow();
    if (dialogOpen || !win || win.isDestroyed()) {
      return;
    }

    dialogOpen = true;
    // Callback form keeps Electron 4 from blocking the main process while the dialog is open.
    dialog.showMessageBox(win, Object.assign({ noLink: true }, messageOptions), (response) => {
      dialogOpen = false;
      if (typeof callback === "function") callback(response);
    });
  };

  const showUpdateAvailable = (info) => {
    showMessage(
      {
        type: "info",
        title: "Update Available",
        message: "A new version of DesktopFT is available.",
        detail: formatReleaseDetail(info),
        buttons: ["View Release", "Dismiss", "Later"],
        defaultId: 0,
        cancelId: 2,
      },
      (response) => {
        if (response === 0 && isReleasePageUrl(info.latest.url)) {
          shell.openExternal(info.latest.url);
        } else if (response === 1) {
          checker.dismiss(info.latest.version);
        }
      }
    );
  };

  const checkManually = () =>
    checker.check().then((result) => {
      if (result.status === "update-available") {
        showUpdateAvailable(result);
      } else if (result.status === "up-to-date") {
        showMessage({
          type: "info",
          title: "No Updates",
          message: "You're up to date.",
          detail: "DesktopFT " + result.currentVersion + " is the latest release.",
          buttons: ["OK"],
        });
      } else if (result.status === "ahead") {
        showMessage({
          type: "info",
          title: "No Updates",
          message: "You're running a newer version than the latest release.",
          detail: "Installed version: " + result.currentVersion + "\nLatest release: " + result.latest.version,
          buttons: ["OK"],
        });
      } else {
        showMessage({
          type: "warning",
          title: "Update Check Failed",
          message: "Couldn't check for updates.",
          detail: describeFailure(result),
          buttons: ["OK"],
        });
      }
    });

  return {
    start() {
      // Background checks only ever update the toolbar badge; failures are logged, not shown.
      checker.start(STARTUP_DELAY_MS);
    },
    stop() {
      checker.stop();
    },
    checkManually,
    // Toolbar button: show the known update without another request, otherwise check.
    openNotification() {
      const info = checker.snapshot();
      if (info.updateAvailable) {
        showUpdateAvailable(info);
        return;
      }
      checkManually();
    },
  };
};

module.exports = { createUpdateNotifier };
