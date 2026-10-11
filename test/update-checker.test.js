const assert = require("assert");
const {
  compareVersions,
  parseVersion,
  normalizeRelease,
  interpretResponse,
  createUpdateChecker,
} = require("../src/update-checker");

const release = (tag, extra) =>
  Object.assign(
    {
      tag_name: tag,
      name: "DesktopFT " + tag,
      body: "## What's Changed\n* Stuff",
      draft: false,
      prerelease: false,
      published_at: "2026-10-01T12:00:00Z",
      html_url: "https://github.com/GoExport/DesktopFT/releases/tag/" + tag,
    },
    extra
  );

const ok = (data) => ({ statusCode: 200, headers: {}, body: JSON.stringify(data) });

// In-memory persistence standing in for update-state.json.
const memoryStore = () => {
  const store = { data: null };
  store.load = () => store.data && JSON.parse(store.data);
  store.save = (state) => {
    store.data = JSON.stringify(state);
  };
  return store;
};

const makeChecker = (options) =>
  createUpdateChecker(
    Object.assign(
      {
        currentVersion: "1.0.9",
        loadState: () => null,
        saveState: () => {},
      },
      options
    )
  );

test("semantic versions compare numerically, not lexicographically", () => {
  assert.strictEqual(compareVersions("1.0.10", "1.0.9"), 1);
  assert.strictEqual(compareVersions("1.10.0", "1.9.9"), 1);
  assert.strictEqual(compareVersions("2.0.0", "10.0.0"), -1);
  assert.strictEqual(compareVersions("v1.0.9", "1.0.9"), 0);
  assert.strictEqual(compareVersions("1.0", "1.0.0"), 0);
  assert.strictEqual(compareVersions("1.0.0+build.5", "1.0.0"), 0);
});

test("prerelease precedence follows SemVer 2.0", () => {
  const ordered = ["1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0"];
  for (let i = 0; i < ordered.length - 1; i += 1) {
    assert.strictEqual(compareVersions(ordered[i], ordered[i + 1]), -1, ordered[i] + " < " + ordered[i + 1]);
    assert.strictEqual(compareVersions(ordered[i + 1], ordered[i]), 1);
  }
});

test("invalid versions are rejected", () => {
  ["", "latest", "1", "v", "1.0.0.0", "1.x.0", null, {}].forEach((value) => assert.strictEqual(parseVersion(value), null));
  assert.throws(() => compareVersions("nope", "1.0.0"));
});

test("drafts, prereleases and malformed payloads are ignored", () => {
  assert.strictEqual(normalizeRelease(release("v2.0.0", { draft: true })), null);
  assert.strictEqual(normalizeRelease(release("v2.0.0", { prerelease: true })), null);
  assert.strictEqual(normalizeRelease(release("v2.0.0-beta.1")), null);
  assert.strictEqual(normalizeRelease(release("nightly")), null);
  assert.strictEqual(normalizeRelease(null), null);
  assert.strictEqual(normalizeRelease([]), null);
  assert.strictEqual(normalizeRelease({ tag_name: 5 }), null);
});

test("release page URL and text fields are sanitized", () => {
  const spoofed = normalizeRelease(
    release("v1.1.0", {
      html_url: "https://evil.com/GoExport/DesktopFT/releases/tag/v1.1.0",
      name: "‮evil\u0007",
      body: "<script>alert(1)</script>\r\n" + "x".repeat(5000),
      published_at: "not a date",
    })
  );
  assert.strictEqual(spoofed.url, "https://github.com/GoExport/DesktopFT/releases/latest");
  assert.strictEqual(spoofed.name, "evil");
  assert.ok(spoofed.notes.length <= 700);
  assert.strictEqual(spoofed.publishedAt, "");

  const lookalike = normalizeRelease(release("v1.1.0", { html_url: "https://github.com.evil.com/GoExport/DesktopFT/releases/x" }));
  assert.strictEqual(lookalike.url, "https://github.com/GoExport/DesktopFT/releases/latest");
  const userinfo = normalizeRelease(release("v1.1.0", { html_url: "https://github.com@evil.com/GoExport/DesktopFT/releases/x" }));
  assert.strictEqual(userinfo.url, "https://github.com/GoExport/DesktopFT/releases/latest");

  const valid = normalizeRelease(release("v1.1.0"));
  assert.strictEqual(valid.url, "https://github.com/GoExport/DesktopFT/releases/tag/v1.1.0");
  assert.strictEqual(valid.version, "1.1.0");
});

test("HTTP failures and rate limits are classified", () => {
  const now = 1000000;
  assert.deepStrictEqual(
    interpretResponse({ statusCode: 403, headers: { "x-ratelimit-remaining": ["0"], "x-ratelimit-reset": ["2000"] }, body: "{}" }, now),
    { status: "error", reason: "rate-limited", retryAt: 2000000 }
  );
  assert.strictEqual(interpretResponse({ statusCode: 429, headers: { "retry-after": "60" } }, now).retryAt, now + 60000);
  assert.strictEqual(interpretResponse({ statusCode: 403, headers: {} }, now).reason, "http");
  assert.strictEqual(interpretResponse({ statusCode: 404, headers: {} }, now).reason, "no-release");
  assert.strictEqual(interpretResponse({ statusCode: 500, headers: {} }, now).reason, "http");
  assert.strictEqual(interpretResponse({ statusCode: 200, headers: {}, body: "<html>" }, now).reason, "invalid-response");
  assert.strictEqual(interpretResponse({ statusCode: 200, headers: {}, body: "[]" }, now).reason, "invalid-response");
  assert.strictEqual(interpretResponse(undefined, now).reason, "http");
});

test("a newer stable release is reported as available", async () => {
  const changes = [];
  const checker = makeChecker({ fetchLatest: async () => ok(release("v1.1.0")), onChange: (s) => changes.push(s) });
  const result = await checker.check();
  assert.strictEqual(result.status, "update-available");
  assert.strictEqual(result.latest.version, "1.1.0");
  assert.strictEqual(result.currentVersion, "1.0.9");
  assert.strictEqual(changes.length, 1);
  assert.ok(changes[0].updateAvailable && !changes[0].dismissed);
});

test("current and ahead-of-release installs report no update", async () => {
  const current = await makeChecker({ fetchLatest: async () => ok(release("v1.0.9")) }).check();
  assert.strictEqual(current.status, "up-to-date");
  assert.strictEqual(current.updateAvailable, false);

  const ahead = await makeChecker({ currentVersion: "1.1.0", fetchLatest: async () => ok(release("v1.0.10")) }).check();
  assert.strictEqual(ahead.status, "ahead");
  assert.strictEqual(ahead.updateAvailable, false);
});

test("dismissal hides only that release and survives a restart", async () => {
  const store = memoryStore();
  let latestTag = "v1.1.0";
  const options = { fetchLatest: async () => ok(release(latestTag)), loadState: store.load, saveState: store.save };

  const first = makeChecker(options);
  await first.check();
  first.dismiss("1.1.0");
  assert.strictEqual(first.snapshot().dismissed, true);

  // Simulated restart: a fresh checker reads the persisted state.
  const second = makeChecker(options);
  const again = await second.check();
  assert.strictEqual(again.updateAvailable, true);
  assert.strictEqual(again.dismissed, true);

  // A newer release than the dismissed one is shown again.
  latestTag = "v1.2.0";
  const newer = await second.check();
  assert.strictEqual(newer.dismissed, false);
});

test("corrupt persisted state is ignored", async () => {
  const checker = makeChecker({
    fetchLatest: async () => ok(release("v1.1.0")),
    loadState: () => ({ dismissedVersion: "<img src=x>" }),
  });
  assert.strictEqual((await checker.check()).dismissed, false);

  const throwing = makeChecker({
    fetchLatest: async () => ok(release("v1.1.0")),
    loadState: () => {
      throw new SyntaxError("Unexpected token");
    },
  });
  assert.strictEqual((await throwing.check()).status, "update-available");
});

test("network errors and timeouts resolve to an error result", async () => {
  const checker = makeChecker({
    fetchLatest: async () => {
      throw new Error("Request timed out");
    },
  });
  const result = await checker.check();
  assert.strictEqual(result.status, "error");
  assert.strictEqual(result.reason, "network");
  assert.strictEqual(checker.snapshot().updateAvailable, false);
});

test("rate limits suppress further requests until the reset time", async () => {
  let clock = 1000;
  let calls = 0;
  const checker = makeChecker({
    now: () => clock,
    fetchLatest: async () => {
      calls += 1;
      return { statusCode: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "5" } };
    },
  });
  assert.strictEqual((await checker.check()).reason, "rate-limited");
  assert.strictEqual((await checker.check()).reason, "rate-limited");
  assert.strictEqual(calls, 1);
  clock = 6000;
  await checker.check();
  assert.strictEqual(calls, 2);
});

test("concurrent checks share a single request", async () => {
  let calls = 0;
  const checker = makeChecker({
    fetchLatest: () => {
      calls += 1;
      return new Promise((resolve) => setTimeout(() => resolve(ok(release("v1.1.0"))), 10));
    },
  });
  const results = await Promise.all([checker.check(), checker.check()]);
  assert.strictEqual(calls, 1);
  assert.strictEqual(results[0], results[1]);
});

test("background checks run on startup delay, repeat on the interval, and stop", async () => {
  const timers = [];
  let calls = 0;
  const checker = makeChecker({
    intervalMs: 21600000,
    setTimer: (fn, delay) => {
      const handle = { fn, delay, cleared: false };
      timers.push(handle);
      return handle;
    },
    clearTimer: (handle) => {
      handle.cleared = true;
    },
    fetchLatest: async () => {
      calls += 1;
      return ok(release("v1.0.9"));
    },
  });

  checker.start(10000);
  assert.strictEqual(timers.length, 1);
  assert.strictEqual(timers[0].delay, 10000);
  assert.strictEqual(calls, 0, "startup is not blocked by a request");

  timers[0].fn();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(calls, 1);
  assert.strictEqual(timers.length, 2);
  assert.strictEqual(timers[1].delay, 21600000);

  checker.stop();
  assert.strictEqual(timers[1].cleared, true);
});

test("an invalid installed version never reports updates", async () => {
  const result = await makeChecker({ currentVersion: "dev", fetchLatest: async () => ok(release("v9.9.9")) }).check();
  assert.strictEqual(result.status, "error");
});
