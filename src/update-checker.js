// Notify-only update detection against GitHub Releases. Nothing here downloads or installs
// anything; the result is just "is there a newer stable release, and where is its page".
// Free of Electron imports so it can be unit tested with plain Node.

const RELEASES_API_URL = "https://api.github.com/repos/GoExport/DesktopFT/releases/latest";
const RELEASES_PAGE_URL = "https://github.com/GoExport/DesktopFT/releases";
const RELEASE_PATH_PREFIX = "/goexport/desktopft/releases/";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_NOTES_LENGTH = 700;

const VERSION_PATTERN = /^v?(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-.]+)?$/i;

const parseVersion = (value) => {
  const match = typeof value === "string" ? VERSION_PATTERN.exec(value.trim()) : null;
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3] || 0),
    prerelease: match[4] ? match[4].split(".") : [],
  };
};

const formatVersion = (parsed) => {
  const core = parsed.major + "." + parsed.minor + "." + parsed.patch;
  return parsed.prerelease.length ? core + "-" + parsed.prerelease.join(".") : core;
};

const comparePrereleaseIds = (left, right) => {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) {
    return Math.sign(Number(left) - Number(right));
  }
  if (leftNumeric !== rightNumeric) {
    return leftNumeric ? -1 : 1;
  }
  return left < right ? -1 : left > right ? 1 : 0;
};

// Semantic Versioning 2.0 precedence. Returns -1, 0 or 1; throws on unparseable input.
const compareVersions = (a, b) => {
  const left = typeof a === "string" ? parseVersion(a) : a;
  const right = typeof b === "string" ? parseVersion(b) : b;
  if (!left || !right) {
    throw new Error("Cannot compare invalid versions");
  }

  const fields = ["major", "minor", "patch"];
  for (let i = 0; i < fields.length; i += 1) {
    const diff = Math.sign(left[fields[i]] - right[fields[i]]);
    if (diff !== 0) {
      return diff;
    }
  }

  // A version without a prerelease tag ranks higher than one with it.
  if (!left.prerelease.length || !right.prerelease.length) {
    return Math.sign(right.prerelease.length - left.prerelease.length);
  }

  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let i = 0; i < length; i += 1) {
    if (left.prerelease[i] === undefined) return -1;
    if (right.prerelease[i] === undefined) return 1;
    const diff = comparePrereleaseIds(left.prerelease[i], right.prerelease[i]);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
};

const cleanText = (value, maxLength) => {
  if (typeof value !== "string") {
    return "";
  }

  // Release text is untrusted: drop control characters and cap the length. It is only ever
  // displayed as plain text in a native dialog, never as HTML.
  const text = value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text.length > maxLength ? text.slice(0, maxLength - 1).trimRight() + "…" : text;
};

const isReleasePageUrl = (value) => {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "github.com" &&
      !parsed.username &&
      !parsed.password &&
      parsed.port === "" &&
      parsed.pathname.toLowerCase().indexOf(RELEASE_PATH_PREFIX) === 0
    );
  } catch (error) {
    return false;
  }
};

// Validates a GitHub "latest release" payload. Returns a normalized release or null.
const normalizeRelease = (data) => {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  if (data.draft === true || data.prerelease === true) {
    return null;
  }

  const parsed = parseVersion(data.tag_name);
  if (!parsed || parsed.prerelease.length) {
    return null;
  }

  const version = formatVersion(parsed);
  return {
    version,
    tagName: cleanText(data.tag_name, 64),
    name: cleanText(data.name, 120) || "DesktopFT " + version,
    notes: cleanText(data.body, MAX_NOTES_LENGTH),
    publishedAt: typeof data.published_at === "string" && !isNaN(Date.parse(data.published_at)) ? data.published_at : "",
    url: isReleasePageUrl(data.html_url) ? data.html_url : RELEASES_PAGE_URL + "/latest",
  };
};

const getHeader = (headers, name) => {
  if (!headers) {
    return "";
  }
  const value = headers[name] !== undefined ? headers[name] : headers[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] || "") : value === undefined ? "" : String(value);
};

// Interprets one HTTP response from the releases endpoint.
// response: { statusCode, headers, body } where body is the raw text.
const interpretResponse = (response, now) => {
  const statusCode = response && Number(response.statusCode);
  const headers = response && response.headers;

  if (statusCode === 403 || statusCode === 429) {
    const remaining = getHeader(headers, "x-ratelimit-remaining");
    const resetSeconds = Number(getHeader(headers, "x-ratelimit-reset"));
    const retryAfter = Number(getHeader(headers, "retry-after"));
    if (remaining === "0" || statusCode === 429 || retryAfter > 0) {
      let retryAt = now + 60 * 60 * 1000;
      if (resetSeconds > 0) retryAt = resetSeconds * 1000;
      else if (retryAfter > 0) retryAt = now + retryAfter * 1000;
      return { status: "error", reason: "rate-limited", retryAt };
    }
    return { status: "error", reason: "http", statusCode };
  }

  if (statusCode === 404) {
    return { status: "error", reason: "no-release" };
  }

  if (statusCode !== 200) {
    return { status: "error", reason: "http", statusCode: statusCode || 0 };
  }

  let data;
  try {
    data = JSON.parse(String(response.body || ""));
  } catch (error) {
    return { status: "error", reason: "invalid-response" };
  }

  const release = normalizeRelease(data);
  if (!release) {
    return { status: "error", reason: "invalid-response" };
  }
  return { status: "ok", release };
};

const sanitizeState = (state) => {
  const dismissed = state && typeof state.dismissedVersion === "string" ? parseVersion(state.dismissedVersion) : null;
  return { dismissedVersion: dismissed ? formatVersion(dismissed) : "" };
};

// options:
//   currentVersion  installed version (app.getVersion())
//   fetchLatest     () => Promise<{ statusCode, headers, body }>
//   loadState       () => object | null           (persisted dismissal state)
//   saveState       (state) => void
//   onChange        (snapshot) => void             (called after every check/dismissal)
//   now, setTimer, clearTimer                       (injectable for tests)
const createUpdateChecker = (options) => {
  const now = options.now || Date.now;
  const setTimer = options.setTimer || setTimeout;
  const clearTimer = options.clearTimer || clearTimeout;
  const intervalMs = options.intervalMs || CHECK_INTERVAL_MS;
  const installed = parseVersion(options.currentVersion);

  let state = sanitizeState(safeCall(options.loadState));
  let latest = null;
  let inFlight = null;
  let timer = null;
  let stopped = true;
  let retryAt = 0;

  const getComparison = (release) => {
    if (!installed || !release) return null;
    return compareVersions(release.version, installed);
  };

  const snapshot = () => {
    const comparison = getComparison(latest);
    const updateAvailable = comparison === 1;
    return {
      currentVersion: installed ? formatVersion(installed) : String(options.currentVersion || ""),
      latest,
      updateAvailable,
      dismissed: updateAvailable && state.dismissedVersion === latest.version,
    };
  };

  const notify = () => {
    if (typeof options.onChange === "function") {
      try {
        options.onChange(snapshot());
      } catch (error) {
        console.error("[DesktopFT] Update listener failed:", error);
      }
    }
  };

  const runCheck = () => {
    if (!installed) {
      return Promise.resolve({ status: "error", reason: "invalid-installed-version" });
    }

    return Promise.resolve()
      .then(() => options.fetchLatest())
      .then(
        (response) => interpretResponse(response, now()),
        (error) => ({ status: "error", reason: "network", message: String((error && error.message) || error) })
      )
      .then((result) => {
        if (result.status !== "ok") {
          if (result.reason === "rate-limited") retryAt = result.retryAt;
          return result;
        }

        retryAt = 0;
        latest = result.release;
        notify();

        const comparison = getComparison(latest);
        const info = snapshot();
        if (comparison === 1) return Object.assign({ status: "update-available" }, info);
        if (comparison === 0) return Object.assign({ status: "up-to-date" }, info);
        return Object.assign({ status: "ahead" }, info);
      });
  };

  // While GitHub's rate-limit window is active no request is sent at all; the caller gets
  // the rate-limit result so a manual check can explain why nothing happened.
  const check = () => {
    if (retryAt && now() < retryAt) {
      return Promise.resolve({ status: "error", reason: "rate-limited", retryAt });
    }

    if (!inFlight) {
      inFlight = runCheck().then(
        (result) => {
          inFlight = null;
          return result;
        },
        (error) => {
          inFlight = null;
          return { status: "error", reason: "unexpected", message: String((error && error.message) || error) };
        }
      );
    }
    return inFlight;
  };

  const scheduleNext = (delay) => {
    if (stopped) return;
    timer = setTimer(() => {
      timer = null;
      check().then((result) => {
        if (result.status === "error") {
          console.warn("[DesktopFT] Background update check failed:", result.reason);
        }
        scheduleNext(intervalMs);
      });
    }, delay);
    if (timer && typeof timer.unref === "function") timer.unref();
  };

  return {
    check,
    snapshot,
    start(initialDelayMs) {
      if (!stopped) return;
      stopped = false;
      scheduleNext(typeof initialDelayMs === "number" ? initialDelayMs : 0);
    },
    stop() {
      stopped = true;
      if (timer) {
        clearTimer(timer);
        timer = null;
      }
    },
    dismiss(version) {
      const parsed = parseVersion(version);
      if (!parsed) return;
      state = { dismissedVersion: formatVersion(parsed) };
      safeCall(options.saveState, state);
      notify();
    },
  };
};

function safeCall(fn, arg) {
  if (typeof fn !== "function") return null;
  try {
    return fn(arg);
  } catch (error) {
    console.error("[DesktopFT] Update state access failed:", error);
    return null;
  }
}

module.exports = {
  RELEASES_API_URL,
  RELEASES_PAGE_URL,
  CHECK_INTERVAL_MS,
  parseVersion,
  compareVersions,
  normalizeRelease,
  interpretResponse,
  isReleasePageUrl,
  createUpdateChecker,
};
