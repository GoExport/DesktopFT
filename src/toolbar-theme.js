// Derives the toolbar palette from the colours the native window is actually drawn with,
// so the toolbar blends into the menu bar above it. Electron 4 does not follow the Windows
// dark-app setting, but it does draw its menu bar with the system colours read here; if
// those are dark (high contrast, a custom theme) the toolbar follows.

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const parseHex = (value) => {
  // systemPreferences colours are "#RRGGBB"; accept "RRGGBB(AA)" as well.
  const text = String(value || "").trim().replace(/^#/, "").slice(0, 6);
  return /^[0-9a-f]{6}$/i.test(text)
    ? [0, 2, 4].map((i) => parseInt(text.slice(i, i + 2), 16))
    : null;
};

const toHex = (rgb) => "#" + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");

const mix = (from, to, amount) => from.map((v, i) => v + (to[i] - v) * amount);

const luminance = (rgb) => {
  const linear = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

const contrast = (a, b) => {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

const LIGHT_DEFAULTS = { background: "#f0f0f0", text: "#000000", field: "#ffffff" };
const DARK_DEFAULTS = { background: "#1f1f1f", text: "#f5f5f5", field: "#141414" };

// colors: { background, text, field } as hex strings (any may be missing or invalid).
// Returns a map of CSS custom properties, every value a validated "#rrggbb".
const buildToolbarTheme = (colors) => {
  const input = colors || {};
  const background = parseHex(input.background) || parseHex(LIGHT_DEFAULTS.background);
  const isDark = luminance(background) < 0.2;
  const defaults = isDark ? DARK_DEFAULTS : LIGHT_DEFAULTS;

  let text = parseHex(input.text);
  if (!text || contrast(text, background) < 4.5) {
    text = parseHex(defaults.text);
  }

  // The address field should read as an inset surface: brighter than a light toolbar,
  // darker than a dark one. Fall back to a derived shade when the system colour doesn't.
  let field = parseHex(input.field);
  const fieldOk = field && (isDark ? luminance(field) <= luminance(background) : luminance(field) >= luminance(background));
  if (!fieldOk) {
    field = isDark ? mix(background, [0, 0, 0], 0.35) : mix(background, [255, 255, 255], 0.75);
  }

  const theme = {
    "--toolbar-bg": toHex(background),
    "--toolbar-fg": toHex(text),
    "--toolbar-border": toHex(mix(background, text, 0.12)),
    "--button-hover": toHex(mix(background, text, 0.08)),
    "--button-active": toHex(mix(background, text, 0.14)),
    "--button-disabled": toHex(mix(background, text, 0.35)),
    "--field-bg": toHex(field),
    "--field-fg": toHex(text),
    "--field-placeholder": toHex(mix(field, text, 0.5)),
    "--message-error": isDark ? "#f0a39e" : "#b3261e",
    "--message-info": isDark ? "#8fd18f" : "#1e7b34",
    "--invalid-border": isDark ? "#e5534b" : "#c62828",
  };

  Object.keys(theme).forEach((key) => {
    if (!HEX_COLOR.test(theme[key])) delete theme[key];
  });
  theme.scheme = isDark ? "dark" : "light";
  return theme;
};

const readSystemColors = () => {
  const { systemPreferences } = require("electron");

  if (process.platform === "win32") {
    try {
      return {
        background: systemPreferences.getColor("menubar") || systemPreferences.getColor("menu"),
        text: systemPreferences.getColor("menu-text"),
        field: systemPreferences.getColor("window"),
      };
    } catch (error) {
      console.warn("[DesktopFT] Could not read system colours:", error);
    }
  }

  if (process.platform === "darwin") {
    try {
      return systemPreferences.isDarkMode() ? DARK_DEFAULTS : LIGHT_DEFAULTS;
    } catch (error) {
      console.warn("[DesktopFT] Could not read macOS appearance:", error);
    }
  }

  return LIGHT_DEFAULTS;
};

// Calls onChange(theme) now and whenever the system colours change. Returns a disposer.
const watchToolbarTheme = (onChange) => {
  const { systemPreferences } = require("electron");
  const emit = () => onChange(buildToolbarTheme(readSystemColors()));
  const events = ["color-changed", "inverted-color-scheme-changed"];
  let macSubscription = null;

  events.forEach((name) => systemPreferences.on(name, emit));
  if (process.platform === "darwin" && typeof systemPreferences.subscribeNotification === "function") {
    macSubscription = systemPreferences.subscribeNotification("AppleInterfaceThemeChangedNotification", emit);
  }

  emit();

  return () => {
    events.forEach((name) => systemPreferences.removeListener(name, emit));
    if (macSubscription !== null) {
      systemPreferences.unsubscribeNotification(macSubscription);
    }
  };
};

module.exports = { buildToolbarTheme, watchToolbarTheme };
