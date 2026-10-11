const assert = require("assert");
const { buildToolbarTheme } = require("../src/toolbar-theme");

const HEX = /^#[0-9a-f]{6}$/;

test("standard Windows menu bar colours give a matching light toolbar", () => {
  const theme = buildToolbarTheme({ background: "#F0F0F0", text: "#000000", field: "#FFFFFF" });
  assert.strictEqual(theme.scheme, "light");
  assert.strictEqual(theme["--toolbar-bg"], "#f0f0f0");
  assert.strictEqual(theme["--toolbar-fg"], "#000000");
  assert.strictEqual(theme["--field-bg"], "#ffffff");
});

test("dark system colours give a dark toolbar", () => {
  const theme = buildToolbarTheme({ background: "#000000", text: "#FFFFFF", field: "#000000" });
  assert.strictEqual(theme.scheme, "dark");
  assert.strictEqual(theme["--toolbar-bg"], "#000000");
  assert.strictEqual(theme["--toolbar-fg"], "#ffffff");

  const grey = buildToolbarTheme({ background: "#2b2b2b", text: "#ffffff", field: "#ffffff" });
  assert.strictEqual(grey.scheme, "dark");
  assert.notStrictEqual(grey["--field-bg"], "#ffffff", "a white field on a dark bar is replaced with a darker shade");
});

test("unreadable or missing colours fall back safely", () => {
  const lowContrast = buildToolbarTheme({ background: "#f0f0f0", text: "#eeeeee" });
  assert.strictEqual(lowContrast["--toolbar-fg"], "#000000");

  const garbage = buildToolbarTheme({ background: "red; x: url(evil)", text: null, field: 42 });
  assert.strictEqual(garbage["--toolbar-bg"], "#f0f0f0");

  assert.strictEqual(buildToolbarTheme(undefined).scheme, "light");
});

test("every theme value is a plain hex colour", () => {
  [{ background: "#F0F0F0", text: "#000000" }, { background: "#101010", text: "#e0e0e0" }, {}].forEach((colors) => {
    const theme = buildToolbarTheme(colors);
    Object.keys(theme)
      .filter((key) => key !== "scheme")
      .forEach((key) => assert.ok(HEX.test(theme[key]), key + "=" + theme[key]));
  });
});
