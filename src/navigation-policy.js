// URL policy shared by every DesktopFT window. This module is intentionally free of
// Electron imports so it can be unit tested with plain Node.
//
// DesktopFT is a FlashThemes-only client. The rules below are the single source of truth
// for what may load inside the Flash-enabled site view; everything else is either handed
// to the system browser (ordinary web links) or refused outright (dangerous schemes).

const MAX_ADDRESS_LENGTH = 2048;

// Protocols that may be handed to the operating system. http/https open the default
// browser, mailto opens the mail client, and goexport launches the GoExport integration.
const EXTERNAL_PROTOCOLS = ["http:", "https:", "mailto:", "goexport:"];

const parseUrl = (value) => {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_ADDRESS_LENGTH) {
    return null;
  }

  try {
    return new URL(value);
  } catch (error) {
    return null;
  }
};

const isWebProtocol = (protocol) => protocol === "https:" || protocol === "http:";

const isFlashThemesHost = (hostname) => {
  const host = String(hostname || "").toLowerCase();
  return host === "flashthemes.net" || host.endsWith(".flashthemes.net");
};

const isFlashThemesUrl = (targetUrl) => {
  const parsed = parseUrl(targetUrl);
  return Boolean(parsed && isWebProtocol(parsed.protocol) && isFlashThemesHost(parsed.hostname));
};

const isSafeExternalUrl = (targetUrl) => {
  const parsed = parseUrl(targetUrl);
  if (!parsed || EXTERNAL_PROTOCOLS.indexOf(parsed.protocol) === -1) {
    return false;
  }

  // Web links must name a real host; "https://" alone or host-less forms are refused.
  return !isWebProtocol(parsed.protocol) || parsed.hostname.length > 0;
};

// Turns whatever the user typed into the address bar into a navigation decision.
// Returns { action: "internal" | "external", url } or { action: "reject", reason }.
const resolveAddressInput = (input) => {
  const text = typeof input === "string" ? input.trim() : "";
  if (!text) {
    return { action: "reject", reason: "Enter a FlashThemes address." };
  }

  if (text.length > MAX_ADDRESS_LENGTH) {
    return { action: "reject", reason: "That address is too long." };
  }

  if (/\s/.test(text)) {
    return { action: "reject", reason: "DesktopFT only opens FlashThemes addresses." };
  }

  let candidate = text;
  if (candidate.charAt(0) === "/" && candidate.charAt(1) !== "/") {
    // Site-relative path such as "/dashboard".
    candidate = "https://flashthemes.net" + candidate;
  } else {
    const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(candidate);
    // "flashthemes.net:443/x" looks like a scheme but is really host:port.
    const isHostWithPort = schemeMatch && /^\d/.test(candidate.slice(schemeMatch[0].length));
    if (!schemeMatch || isHostWithPort) {
      candidate = "https://" + candidate.replace(/^\/\//, "");
    }
  }

  const parsed = parseUrl(candidate);
  if (!parsed) {
    return { action: "reject", reason: "That is not a valid address." };
  }

  if (!isWebProtocol(parsed.protocol)) {
    return { action: "reject", reason: "Only web addresses can be opened." };
  }

  if (isFlashThemesHost(parsed.hostname)) {
    parsed.protocol = "https:";
    parsed.username = "";
    parsed.password = "";
    return { action: "internal", url: parsed.toString() };
  }

  // Bare words ("dashboard") are not treated as hosts to avoid surprising external opens.
  if (parsed.hostname.indexOf(".") === -1) {
    return { action: "reject", reason: "DesktopFT only opens FlashThemes addresses." };
  }

  return { action: "external", url: parsed.toString() };
};

module.exports = {
  MAX_ADDRESS_LENGTH,
  isFlashThemesUrl,
  isSafeExternalUrl,
  resolveAddressInput,
};
