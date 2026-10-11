const assert = require("assert");
const { isFlashThemesUrl, isSafeExternalUrl, resolveAddressInput } = require("../src/navigation-policy");

test("FlashThemes URLs and subdomains are internal", () => {
  assert.ok(isFlashThemesUrl("https://flashthemes.net/"));
  assert.ok(isFlashThemesUrl("https://FlashThemes.NET/dashboard#videos"));
  assert.ok(isFlashThemesUrl("http://flashthemes.net/movie/abc"));
  assert.ok(isFlashThemesUrl("https://cdn.flashthemes.net/a.swf"));
  assert.ok(isFlashThemesUrl("https://a.b.flashthemes.net/"));
});

test("lookalike and external hosts are not internal", () => {
  [
    "https://flashthemes.net.evil.com/",
    "https://evilflashthemes.net/",
    "https://flashthemes.net@evil.com/",
    "https://evil.com/?r=https://flashthemes.net/",
    "https://evil.com/#flashthemes.net",
    "https://flashthemes.network/",
    "https://xn--flashthmes-g7a.net/",
    "https://chars.malamations.com/",
  ].forEach((url) => assert.ok(!isFlashThemesUrl(url), url));
});

test("non-web schemes are never internal", () => {
  [
    "javascript:alert(1)",
    "file:///C:/Windows/win.ini",
    "data:text/html,<script>alert(1)</script>",
    "ftp://flashthemes.net/",
    "blob:https://flashthemes.net/uuid",
    "desktopft-goexport-settings://open",
    "",
    null,
    undefined,
    42,
  ].forEach((url) => assert.ok(!isFlashThemesUrl(url), String(url)));
});

test("external opens are limited to safe protocols", () => {
  assert.ok(isSafeExternalUrl("https://discord.gg/flashthemes"));
  assert.ok(isSafeExternalUrl("http://example.com/"));
  assert.ok(isSafeExternalUrl("mailto:someone@example.com"));
  assert.ok(isSafeExternalUrl("goexport://?video_id=1&user_id=2"));
  ["javascript:alert(1)", "file:///C:/x.exe", "data:text/html,x", "vbscript:x", "ms-settings:", "smb://host/share", "https://"].forEach(
    (url) => assert.ok(!isSafeExternalUrl(url), url)
  );
});

test("address input is normalized to HTTPS FlashThemes URLs", () => {
  const cases = {
    "flashthemes.net/dashboard": "https://flashthemes.net/dashboard",
    "  flashthemes.net  ": "https://flashthemes.net/",
    "http://flashthemes.net/watch/": "https://flashthemes.net/watch/",
    "https://flashthemes.net/videomaker/custom/full": "https://flashthemes.net/videomaker/custom/full",
    "/dashboard#videos": "https://flashthemes.net/dashboard#videos",
    "www.flashthemes.net/shop/": "https://www.flashthemes.net/shop/",
    "flashthemes.net:443/create/": "https://flashthemes.net/create/",
    "//flashthemes.net/mingle/": "https://flashthemes.net/mingle/",
    "https://user:pw@flashthemes.net/": "https://flashthemes.net/",
  };
  Object.keys(cases).forEach((input) => {
    assert.deepStrictEqual(resolveAddressInput(input), { action: "internal", url: cases[input] }, input);
  });
});

test("address input to other sites is routed to the system browser", () => {
  assert.deepStrictEqual(resolveAddressInput("flashthemes.net.evil.com/login"), {
    action: "external",
    url: "https://flashthemes.net.evil.com/login",
  });
  assert.deepStrictEqual(resolveAddressInput("https://google.com"), { action: "external", url: "https://google.com/" });
});

test("dangerous or meaningless address input is rejected", () => {
  [
    "javascript:alert(document.cookie)",
    "JavaScript:alert(1)",
    "file:///C:/Windows/System32/calc.exe",
    "data:text/html,<h1>x</h1>",
    "about:blank",
    "chrome://gpu",
    "goexport://?video_id=1",
    "desktopft-goexport-settings://open",
    "",
    "   ",
    "dashboard",
    "how to make a video",
    "https://",
    "x".repeat(3000),
  ].forEach((input) => {
    assert.strictEqual(resolveAddressInput(input).action, "reject", input.slice(0, 40));
  });
});
