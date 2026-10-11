(() => {
  const api = window.desktopftToolbar;
  const $ = (id) => document.getElementById(id);

  const backButton = $("back");
  const forwardButton = $("forward");
  const reloadButton = $("reload");
  const homeButton = $("home");
  const updatesButton = $("updates");
  const updateBadge = $("update-badge");
  const addressBox = $("address-box");
  const addressInput = $("address");
  const addressMessage = $("address-message");

  let currentUrl = "";
  let isLoading = false;
  let isEditing = false;
  let messageTimer = null;

  const setAddressValue = (value) => {
    if (!isEditing) {
      addressInput.value = value;
    }
  };

  const clearMessage = () => {
    clearTimeout(messageTimer);
    addressBox.classList.remove("invalid");
    addressMessage.classList.add("hidden");
    addressMessage.textContent = "";
  };

  const showMessage = (text, isInfo) => {
    clearTimeout(messageTimer);
    addressMessage.textContent = text;
    addressMessage.classList.toggle("info", Boolean(isInfo));
    addressMessage.classList.remove("hidden");
    addressBox.classList.toggle("invalid", !isInfo);
    messageTimer = setTimeout(clearMessage, 4000);
  };

  const revertAddress = () => {
    isEditing = false;
    addressInput.value = currentUrl;
  };

  api.onState((state) => {
    if (!state || typeof state !== "object") {
      return;
    }

    currentUrl = typeof state.url === "string" ? state.url : "";
    isLoading = Boolean(state.isLoading);
    backButton.disabled = !state.canGoBack;
    forwardButton.disabled = !state.canGoForward;

    $("reload-icon").classList.toggle("hidden", isLoading);
    $("stop-icon").classList.toggle("hidden", !isLoading);
    reloadButton.title = isLoading ? "Stop" : "Reload (Ctrl+R)";
    reloadButton.setAttribute("aria-label", isLoading ? "Stop" : "Reload");

    setAddressValue(currentUrl);
  });

  api.onFocusAddress(() => {
    addressInput.focus();
    addressInput.select();
  });

  api.onAddressFeedback((payload) => {
    const text = payload && typeof payload.message === "string" ? payload.message : "";
    if (!text) {
      return;
    }
    const isInfo = payload.kind === "info";
    showMessage(text, isInfo);
    if (isInfo) {
      revertAddress();
    }
  });

  api.onUpdateState((update) => {
    const available = Boolean(update && update.available);
    const version = update && typeof update.version === "string" ? update.version : "";
    updateBadge.classList.toggle("hidden", !available);
    updatesButton.classList.toggle("has-update", available);
    const label = available ? "Update available: " + version : "Check for updates";
    updatesButton.title = label;
    updatesButton.setAttribute("aria-label", label);
  });

  // Theme values come from the main process; only known variables with hex colours apply.
  const THEME_VARIABLES = /^--(toolbar|button|field|message|invalid)-[a-z-]+$/;
  api.onTheme((theme) => {
    if (!theme || typeof theme !== "object") {
      return;
    }
    const root = document.documentElement;
    Object.keys(theme).forEach((name) => {
      if (THEME_VARIABLES.test(name) && /^#[0-9a-f]{6}$/i.test(theme[name])) {
        root.style.setProperty(name, theme[name]);
      }
    });
    root.setAttribute("data-scheme", theme.scheme === "dark" ? "dark" : "light");
  });

  backButton.addEventListener("click", () => api.command("back"));
  forwardButton.addEventListener("click", () => api.command("forward"));
  reloadButton.addEventListener("click", () => api.command(isLoading ? "stop" : "reload"));
  homeButton.addEventListener("click", () => api.command("home"));
  updatesButton.addEventListener("click", () => api.command("updates"));

  // Select the whole address on the first click, like a browser omnibox.
  let selectOnMouseUp = false;
  addressInput.addEventListener("mousedown", () => {
    selectOnMouseUp = document.activeElement !== addressInput;
  });
  addressInput.addEventListener("mouseup", (event) => {
    if (selectOnMouseUp && addressInput.selectionStart === addressInput.selectionEnd) {
      event.preventDefault();
      addressInput.select();
    }
    selectOnMouseUp = false;
  });

  addressInput.addEventListener("input", () => {
    isEditing = true;
    clearMessage();
  });

  addressInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const value = addressInput.value;
      isEditing = false;
      api.navigate(value);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      clearMessage();
      revertAddress();
      addressInput.blur();
    }
  });

  addressInput.addEventListener("blur", () => {
    revertAddress();
    api.addressBlur();
  });

  api.ready();
})();
