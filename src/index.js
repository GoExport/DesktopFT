const { app, BrowserWindow, shell, Menu, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");
const gotTheLock = app.requestSingleInstanceLock();

let APP_URL = "https://flashthemes.net/";
let APP_NAME = "FlashThemes";
let APP_ICON = "logo.ico";

// Account Options
let APP_HOME = "https://flashthemes.net/dashboard/#main";
let APP_VIDEOS = "https://flashthemes.net/dashboard#videos";
let APP_BADGES = "https://flashthemes.net/dashboard#badges";
let APP_FRIENDS = "https://flashthemes.net/dashboard#friends";
let APP_MESSAGES = "https://flashthemes.net/dashboard#messages";
let APP_SETTINGS = "https://flashthemes.net/dashboard#settings";
let APP_LOGO = "https://flashthemes.net/dashboard#logo";
let APP_ASSETS = "https://flashthemes.net/dashboard#assets";

// Explore Options
let APP_ANIMATIONS = "https://flashthemes.net/watch/";
let APP_COMMUNITY = "https://flashthemes.net/mingle/";

// Shop Options
let APP_SHOP = "https://flashthemes.net/shop/";

// Create Options
let APP_CREATE = "https://flashthemes.net/create/";

// Editor - Full
let FVM_EDITOR_COMEDY_WORLD = "https://flashthemes.net/videomaker/custom/full";
let FVM_EDITOR_CARTOON_CLASSICS = "https://flashthemes.net/videomaker/retro/full";

let FVM_EDITOR_ANIME = "https://flashthemes.net/videomaker/anime/full";
let FVM_EDITOR_NINJA_ANIME = "https://flashthemes.net/videomaker/ninjaanime/full";
let FVM_EDITOR_SPACE_CITIZENS = "https://flashthemes.net/videomaker/spacecitizen/full";

let FVM_EDITOR_LIL_PEEPZ = "https://flashthemes.net/videomaker/action/full";
let FVM_EDITOR_LIL_PETZ_WORLD = "https://flashthemes.net/videomaker/animal/full";
let FVM_EDITOR_CHIBI_NINJAS = "https://flashthemes.net/videomaker/ninja/full";
let FVM_EDITOR_CHIBI_PEEPZ = "https://flashthemes.net/videomaker/chibi/full";
let FVM_EDITOR_SPACE_PEEPZ = "https://flashthemes.net/videomaker/space/full";
let FVM_EDITOR_JUNGLE_WARFARE = "https://flashthemes.net/videomaker/vietnam/full";

let FVM_EDITOR_ELECTION_2012 = "https://flashthemes.net/videomaker/politics2/full";
let FVM_EDITOR_STICK_FIGURE = "https://flashthemes.net/videomaker/stick/full";
let FVM_EDITOR_STICKLY_BUSINESS = "https://flashthemes.net/videomaker/sticklybiz/full";

// Editor - Lite
let QVM_EDITOR_GENERAL = "https://flashthemes.net/create/#quickvideo";

let win;
let goExportSettingsWindow;
const APP_SESSION_PARTITION = "persist:desktopft";
const EDITOR_PATH_PATTERN = /\/videomaker\/.+\/full/i;
const MOVIE_PATH_PATTERN = /\/movie\//i;
const GOEXPORT_SETTINGS_PROTOCOL = "desktopft-goexport-settings://open";
const GOEXPORT_SETTINGS_FILE = path.join(app.getPath("userData"), "goexport-settings.json");

const DEFAULT_GOEXPORT_SETTINGS = {
  aspectRatio: "16:9",
  resolution: "720p",
  openFolder: false,
  useOutro: true,
  requireOBS: false,
};

const GOEXPORT_RESOLUTION_OPTIONS = {
  "16:9": ["360p", "480p", "720p", "1080p", "2k", "4k", "5k", "8k"],
  "14:9": ["360p", "480p", "720p", "1080p", "2k", "4k", "5k", "8k"],
  "9:16": ["360p", "480p", "720p", "1080p", "2k", "4k", "5k", "8k"],
  "4:3": ["240p", "360p", "420p", "480p"],
};

const isFlashThemesUrl = (targetUrl) => {
  try {
    const parsed = new URL(targetUrl);
    const host = parsed.hostname.toLowerCase();
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      (host === "flashthemes.net" || host.endsWith(".flashthemes.net"))
    );
  } catch (error) {
    return false;
  }
};

const isGoExportSettingsUrl = (targetUrl) => {
  return typeof targetUrl === "string" && targetUrl.toLowerCase().startsWith(GOEXPORT_SETTINGS_PROTOCOL);
};

const sanitizeGoExportSettings = (inputSettings) => {
  const incoming = inputSettings && typeof inputSettings === "object" ? inputSettings : {};
  const aspectRatio = Object.prototype.hasOwnProperty.call(GOEXPORT_RESOLUTION_OPTIONS, incoming.aspectRatio)
    ? incoming.aspectRatio
    : DEFAULT_GOEXPORT_SETTINGS.aspectRatio;

  const allowedResolutions = GOEXPORT_RESOLUTION_OPTIONS[aspectRatio] || GOEXPORT_RESOLUTION_OPTIONS[DEFAULT_GOEXPORT_SETTINGS.aspectRatio];
  const resolution = allowedResolutions.includes(incoming.resolution)
    ? incoming.resolution
    : allowedResolutions.includes(DEFAULT_GOEXPORT_SETTINGS.resolution)
      ? DEFAULT_GOEXPORT_SETTINGS.resolution
      : allowedResolutions[0];

  return {
    aspectRatio,
    resolution,
    openFolder: Boolean(incoming.openFolder),
    useOutro: typeof incoming.useOutro === "boolean" ? incoming.useOutro : DEFAULT_GOEXPORT_SETTINGS.useOutro,
    requireOBS: Boolean(incoming.requireOBS),
  };
};

const readGoExportSettings = () => {
  try {
    if (!fs.existsSync(GOEXPORT_SETTINGS_FILE)) {
      return { ...DEFAULT_GOEXPORT_SETTINGS };
    }

    const rawSettings = fs.readFileSync(GOEXPORT_SETTINGS_FILE, "utf8");
    const parsed = JSON.parse(rawSettings);
    return sanitizeGoExportSettings({ ...DEFAULT_GOEXPORT_SETTINGS, ...parsed });
  } catch (error) {
    console.error("[DesktopFT] Failed to read GoExport settings:", error);
    return { ...DEFAULT_GOEXPORT_SETTINGS };
  }
};

const saveGoExportSettings = (nextSettings) => {
  const sanitized = sanitizeGoExportSettings(nextSettings);

  try {
    fs.writeFileSync(GOEXPORT_SETTINGS_FILE, JSON.stringify(sanitized, null, 2), "utf8");
  } catch (error) {
    console.error("[DesktopFT] Failed to save GoExport settings:", error);
  }

  return sanitized;
};

const buildMovieDownloaderPatchScript = () => `
;(() => {
  const isMoviePage = location.pathname.toLowerCase().indexOf('/movie/') !== -1;
  if (!isMoviePage) return;

  const getLoggedInUsername = () => {
    const selectors = [
      '#usernameheader',
      'a[href*="/user/"]',
      '.dropdown-toggle .username',
      '#header_profile_username'
    ];

    for (let i = 0; i < selectors.length; i += 1) {
      const el = document.querySelector(selectors[i]);
      if (el && el.textContent && el.textContent.trim()) {
        return el.textContent.trim();
      }
    }

    return null;
  };

  const gatherMovieData = () => {
    const scripts = document.querySelectorAll('script');
    const movieData = {};

    for (let i = 0; i < scripts.length; i += 1) {
      const scriptText = scripts[i].textContent || '';
      if (scriptText.indexOf('flashvars') === -1) {
        continue;
      }

      const match = scriptText.match(/flashvars\\s*:\\s*\\{([\\s\\S]*?)\\}\\s*\\}/);
      if (!match) {
        continue;
      }

      const objectBody = match[1];
      const pairs = objectBody.match(/(\\w+):\"([^\"]*)\"/g);
      if (!pairs) {
        continue;
      }

      for (let j = 0; j < pairs.length; j += 1) {
        const parts = pairs[j].split(':');
        const key = parts[0].trim();
        const value = parts.slice(1).join(':').trim().replace(/^\"|\"$/g, '');
        movieData[key] = value;
      }

      break;
    }

    return movieData;
  };

  const createDownloadMovieZipButton = () => {
    const container = document.querySelector('#movie_actions .actions');
    if (!container) return;

    if (document.getElementById('desktopft-download-movie-zip')) return;

    const movieData = gatherMovieData();
    const movieOwner = movieData.movieOwner;
    const loggedInUser = getLoggedInUsername();

    // Match ownership exactly as the site does (case-sensitive and character-sensitive).
    if (!movieOwner || !loggedInUser || movieOwner !== loggedInUser) {
      return;
    }

    const newButton = document.createElement('div');
    newButton.className = 'movie_action_button';
    newButton.id = 'desktopft-download-movie-zip';
    newButton.addEventListener('click', async () => {
      const movieId = movieData.movieId;
      const movieOwnerId = movieData.movieOwnerId;
      if (!movieId || !movieOwnerId) {
        alert('Could not extract movie ID or owner ID.');
        return;
      }

      const url = 'https://flashthemes.net/goapi/getMovie/?userId=' +
        encodeURIComponent(movieOwnerId) +
        '&movieId=' +
        encodeURIComponent(movieId);

      const options = {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({ userId: movieOwnerId, movieId })
      };

      try {
        const response = await fetch(url, options);
        if (!response.ok) throw new Error('Network response was not ok');
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();

        // FlashThemes payload includes a leading byte that breaks extracted zip tools.
        const fixedBuffer = arrayBuffer.slice(1);
        const fixedBlob = new Blob([fixedBuffer], { type: blob.type || 'application/zip' });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(fixedBlob);
        link.download = 'movie.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
      } catch (error) {
        alert('Failed to download movie.zip: ' + error);
      }
    });

    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.textContent = 'Download movie.zip';
    newButton.appendChild(tooltip);

    container.appendChild(newButton);
  };

  createDownloadMovieZipButton();

  const observer = new MutationObserver(() => {
    createDownloadMovieZipButton();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
`;

const buildGoExportNavbarPatchScript = () => `
;(() => {
  const navId = 'desktopft-goexport-settings-nav';
  const navSelectors = [
    '.top-nav ul',
    '.top-nav .nav',
    '.site-header .nav',
    '.site-header ul',
    '.navbar-nav',
    '.navigation ul',
    '#site-nav ul',
    '#header ul',
    'header nav ul',
    'header nav',
    '.top-nav'
  ];

  const createSettingsAnchor = () => {
    const item = document.createElement('a');
    item.id = navId;
    item.href = '${GOEXPORT_SETTINGS_PROTOCOL}';
    item.textContent = 'GoExport Settings';
    item.style.marginLeft = '12px';
    item.style.cursor = 'pointer';
    item.style.textDecoration = 'none';
    item.style.color = 'inherit';
    item.style.fontWeight = '600';

    item.addEventListener('click', (event) => {
      event.preventDefault();
      location.href = '${GOEXPORT_SETTINGS_PROTOCOL}';
    });

    return item;
  };

  const findNavContainer = () => {
    for (let i = 0; i < navSelectors.length; i += 1) {
      const found = document.querySelector(navSelectors[i]);
      if (found) {
        return found;
      }
    }

    return null;
  };

  const injectSettingsNav = () => {
    if (document.getElementById(navId)) {
      return true;
    }

    const navContainer = findNavContainer();
    if (!navContainer) {
      return false;
    }

    const sampleLink = navContainer.querySelector('a');
    const item = createSettingsAnchor();

    if (sampleLink) {
      item.className = sampleLink.className || '';
    }

    if (navContainer.tagName && navContainer.tagName.toLowerCase() === 'ul') {
      const li = document.createElement('li');
      li.style.listStyle = 'none';

      const sampleLi = navContainer.querySelector('li');
      if (sampleLi) {
        li.className = sampleLi.className || '';
      }

      li.appendChild(item);
      navContainer.appendChild(li);
      return true;
    }

    navContainer.appendChild(item);
    return true;
  };

  if (injectSettingsNav()) {
    return;
  }

  const observer = new MutationObserver(() => {
    if (injectSettingsNav()) {
      observer.disconnect();
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
`;

const buildGoExportMoviePatchScript = (settings) => {
  const escapedSettings = JSON.stringify(settings)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");

  return `
;(() => {
  const isMoviePage = location.pathname.toLowerCase().indexOf('/movie/') !== -1;
  if (!isMoviePage) return;

  const settings = ${escapedSettings};

  const gatherMovieData = () => {
    const scripts = document.querySelectorAll('script');
    const movieData = {};

    for (let i = 0; i < scripts.length; i += 1) {
      const scriptText = scripts[i].textContent || '';
      if (scriptText.indexOf('flashvars') === -1) continue;

      const match = scriptText.match(/flashvars\\s*:\\s*\\{([\\s\\S]*?)\\}\\s*\\}/);
      if (!match) continue;

      const objectBody = match[1];
      const pairs = objectBody.match(/(\\w+):"([^"]*)"/g);
      if (!pairs) continue;

      for (let j = 0; j < pairs.length; j += 1) {
        const parts = pairs[j].split(':');
        const key = parts[0].trim();
        const value = parts.slice(1).join(':').trim().replace(/^"|"$/g, '');
        movieData[key] = value;
      }

      break;
    }

    return movieData;
  };

  const launchGoExport = (movieId, movieOwnerId, isWide) => {
    const aspectRatio = settings.aspectRatio || (isWide === '1' ? '16:9' : '14:9');
    const goExportUrl =
      'goexport://?video_id=' + encodeURIComponent(movieId) +
      '&user_id=' + encodeURIComponent(movieOwnerId) +
      '&service=ft' +
      '&no_input=1' +
      '&aspect_ratio=' + encodeURIComponent(aspectRatio) +
      '&resolution=' + encodeURIComponent(settings.resolution) +
      '&open_folder=' + (settings.openFolder ? '1' : '0') +
      '&use_outro=' + (settings.useOutro ? '1' : '0') +
      '&obs_required=' + (settings.requireOBS ? '1' : '0');

    location.href = goExportUrl;
  };

  const createGoExportButton = () => {
    const container = document.querySelector('#movie_actions .actions');
    if (!container) return;
    if (document.getElementById('goexport_integration_button')) return;

    const movieData = gatherMovieData();
    const movieId = movieData.movieId;
    const movieOwnerId = movieData.movieOwnerId;
    const wide = movieData.isWide;

    if (!movieId || !movieOwnerId) return;

    const newButton = document.createElement('div');
    newButton.className = 'movie_action_button';
    newButton.id = 'goexport_integration_button';
    newButton.addEventListener('click', () => launchGoExport(movieId, movieOwnerId, wide));

    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.textContent = 'Export with GoExport (' + settings.resolution + ')';
    newButton.appendChild(tooltip);

    container.appendChild(newButton);
  };

  createGoExportButton();

  const observer = new MutationObserver(() => {
    createGoExportButton();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
`;
};

const applyEditorViewportFix = () => {
  if (!win || win.isDestroyed()) {
    return;
  }

  win.webContents
    .insertCSS(
      "html, body { height: 100% !important; margin: 0 !important; overflow: hidden !important; }"
    )
    .catch((error) => {
      console.error("[DesktopFT] Editor viewport CSS injection failed:", error);
    });
};

const openGoExportSettingsWindow = () => {
  if (goExportSettingsWindow && !goExportSettingsWindow.isDestroyed()) {
    goExportSettingsWindow.focus();
    return;
  }

  goExportSettingsWindow = new BrowserWindow({
    title: "GoExport Settings",
    width: 560,
    height: 700,
    parent: win,
    modal: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  goExportSettingsWindow.removeMenu();
  goExportSettingsWindow.loadFile(path.join(__dirname, "goexport-settings.html"));

  goExportSettingsWindow.on("closed", () => {
    goExportSettingsWindow = null;
  });
};

if (!gotTheLock) {
  app.quit();
} else {
  const openInMainWindow = async (url) => {
    if (win && !win.isDestroyed()) {
      win.loadURL(url);
      win.focus();
    }
  };

  const createMenu = () => {
    const template = [
      {
        label: "FlashThemes",
        submenu: [
          {
            label: "Home",
            click: async () => {
              win.loadURL(APP_URL);
            },
          },
          { type: "separator" },
          {
            label: "GoExport Settings",
            click: () => {
              openGoExportSettingsWindow();
            },
          },
        ],
      },
      {
        label: "Dashboard",
        submenu: [
          {
            label: "Home",
            click: async () => {
              win.loadURL(APP_HOME);
            },
          },
          {
            label: "Videos",
            click: async () => {
              win.loadURL(APP_VIDEOS);
            },
          },
          {
            label: "Messages",
            click: async () => {
              win.loadURL(APP_MESSAGES);
            },
          },
          {
            label: "Friends",
            click: async () => {
              win.loadURL(APP_FRIENDS);
            },
          },
          {
            label: "Badges",
            click: async () => {
              win.loadURL(APP_BADGES);
            },
          },
          { type: "separator" },
          {
            label: "Explore Community",
            click: async () => {
              win.loadURL(APP_COMMUNITY);
            },
          },
          {
            label: "Explore Animations",
            click: async () => {
              win.loadURL(APP_ANIMATIONS);
            },
          },
          {
            label: "Shop",
            click: async () => {
              win.loadURL(APP_SHOP);
            },
          },
          { type: "separator" },
          {
            label: "Logo",
            click: async () => {
              win.loadURL(APP_LOGO);
            },
          },
          {
            label: "Assets",
            click: async () => {
              win.loadURL(APP_ASSETS);
            },
          },
          {
            label: "Settings",
            click: async () => {
              win.loadURL(APP_SETTINGS);
            },
          },
        ],
      },
      {
        label: "Create",
        submenu: [
          {
            label: "Comedy World",
            click: async () => {
              openInMainWindow(FVM_EDITOR_COMEDY_WORLD);
            },
          },
          {
            label: "Cartoon Classics",
            click: async () => {
              openInMainWindow(FVM_EDITOR_CARTOON_CLASSICS);
            },
          },
          { type: "separator" },
          {
            label: "Anime",
            click: async () => {
              openInMainWindow(FVM_EDITOR_ANIME);
            },
          },
          {
            label: "Ninja Anime",
            click: async () => {
              openInMainWindow(FVM_EDITOR_NINJA_ANIME);
            },
          },
          {
            label: "Chibi Ninjas",
            click: async () => {
              openInMainWindow(FVM_EDITOR_CHIBI_NINJAS);
            },
          },
          { type: "separator" },
          {
            label: "Space Citizens",
            click: async () => {
              openInMainWindow(FVM_EDITOR_SPACE_CITIZENS);
            },
          },
          {
            label: "Space Peepz",
            click: async () => {
              openInMainWindow(FVM_EDITOR_SPACE_PEEPZ);
            },
          },
          { type: "separator" },
          {
            label: "Lil Peepz",
            click: async () => {
              openInMainWindow(FVM_EDITOR_LIL_PEEPZ);
            },
          },
          {
            label: "Lil Petz World",
            click: async () => {
              openInMainWindow(FVM_EDITOR_LIL_PETZ_WORLD);
            },
          },
          {
            label: "Chibi Peepz",
            click: async () => {
              openInMainWindow(FVM_EDITOR_CHIBI_PEEPZ);
            },
          },
          { type: "separator" },
          {
            label: "Jungle Warfare",
            click: async () => {
              openInMainWindow(FVM_EDITOR_JUNGLE_WARFARE);
            },
          },
          {
            label: "Election 2012",
            click: async () => {
              openInMainWindow(FVM_EDITOR_ELECTION_2012);
            },
          },
          {
            label: "Stick Figure",
            click: async () => {
              openInMainWindow(FVM_EDITOR_STICK_FIGURE);
            },
          },
          {
            label: "Stickly Business",
            click: async () => {
              openInMainWindow(FVM_EDITOR_STICKLY_BUSINESS);
            },
          },
          { type: "separator" },
          {
            label: "Quick Video Maker",
            click: async () => {
              openInMainWindow(QVM_EDITOR_GENERAL);
            },
          },
        ],
      },
      {
        label: "View",
        submenu: [
          {
            label: "Zoom In",
            accelerator: "Ctrl+=",
            role: "zoomIn",
          },
          {
            label: "Zoom Out",
            accelerator: "Ctrl+-",
            role: "zoomOut",
          },
          {
            label: "Actual Size",
            accelerator: "Ctrl+0",
            role: "resetZoom",
          },
        ],
      },
      {
        label: "Developer",
        submenu: [
          {
            label: "Toggle DevTools",
            accelerator: "F12",
            click: () => {
              if (win && !win.isDestroyed()) {
                win.webContents.toggleDevTools();
              }
            },
          },
          {
            label: "Open DevTools (Detached)",
            accelerator: "Ctrl+Shift+I",
            click: () => {
              if (win && !win.isDestroyed()) {
                win.webContents.openDevTools({ mode: "detach" });
              }
            },
          },
          { type: "separator" },
          {
            role: "reload",
          },
          {
            role: "forceReload",
          },
        ],
      },
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  };

  const createWindow = () => {
    win = new BrowserWindow({
      title: APP_NAME,
      icon: "/build/icon.ico",
      autoHideMenuBar: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        plugins: true,
        partition: APP_SESSION_PARTITION,
      },
    });

    win.webContents.on("new-window", (event, targetUrl) => {
      event.preventDefault();

      if (isGoExportSettingsUrl(targetUrl)) {
        openGoExportSettingsWindow();
        return;
      }

      if (isFlashThemesUrl(targetUrl)) {
        openInMainWindow(targetUrl);
        return;
      }

      shell.openExternal(targetUrl);
    });

    win.webContents.on("will-navigate", (event, targetUrl) => {
      if (targetUrl === win.webContents.getURL()) {
        return;
      }

      if (isGoExportSettingsUrl(targetUrl)) {
        event.preventDefault();
        openGoExportSettingsWindow();
        return;
      }

      if (!isFlashThemesUrl(targetUrl)) {
        event.preventDefault();
        shell.openExternal(targetUrl);
      }
    });

    win.webContents.on("will-prevent-unload", (event) => {
      // Legacy editor sets beforeunload; allow leaving when app navigation requests it.
      event.preventDefault();
    });

    const patchPageEnhancementsIfNeeded = () => {
      const currentUrl = win.webContents.getURL();
      if (EDITOR_PATH_PATTERN.test(currentUrl)) {
        applyEditorViewportFix();
      }

      if (isFlashThemesUrl(currentUrl)) {
        win.webContents.executeJavaScript(buildGoExportNavbarPatchScript()).catch((error) => {
          console.error("[DesktopFT] GoExport navbar patch injection failed:", error);
        });
      }

      if (MOVIE_PATH_PATTERN.test(currentUrl)) {
        win.webContents.executeJavaScript(buildMovieDownloaderPatchScript()).catch((error) => {
          console.error("[DesktopFT] Movie downloader patch injection failed:", error);
        });

        const goExportSettings = readGoExportSettings();
        win.webContents.executeJavaScript(buildGoExportMoviePatchScript(goExportSettings)).catch((error) => {
          console.error("[DesktopFT] GoExport movie patch injection failed:", error);
        });
      }
    };

    win.webContents.on("did-finish-load", patchPageEnhancementsIfNeeded);
    win.webContents.on("dom-ready", patchPageEnhancementsIfNeeded);

    win.webContents.on("context-menu", (event, params) => {
      Menu.getApplicationMenu().popup(win, params.x, params.y);
    });

    win.maximize();
    win.loadURL(APP_URL);

    win.once("page-title-updated", function (event, title) {
      event.preventDefault();
      // win.title = title;
      win.title = APP_NAME;
    });
  };

  const setupFlashPlugin = () => {
    let pluginName;
    let pluginType;

    switch (process.platform) {
      case "win32":
        pluginType = "win/";
        pluginName = "pepflashplayer.dll";
        break;
      case "darwin":
        pluginType = "mac/";
        pluginName = "PepperFlashPlayer.plugin";
        break;
      default:
        pluginType = "linux/";
        pluginName = "libpepflashplayer.so";
    }

    if (["freebsd", "linux", "netbsd", "openbsd"].includes(process.platform)) {
      app.commandLine.appendSwitch("no-sandbox");
    }

    app.commandLine.appendSwitch(
      "ppapi-flash-path",
      path.join(
        __dirname +
        "/plugins/" +
        pluginType +
        (process.arch == "x64" ? "x64" : "ia32"),
        pluginName
      )
    );
    app.commandLine.appendSwitch("ppapi-flash-version", "32.0.0.371");
  };

  app.setAsDefaultProtocolClient(app.getName());

  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  setupFlashPlugin();

  app.whenReady().then(() => {
    app.allowRendererProcessReuse = true;

    ipcMain.handle("desktopft:get-goexport-settings", () => {
      return readGoExportSettings();
    });

    ipcMain.handle("desktopft:save-goexport-settings", (event, incomingSettings) => {
      const savedSettings = saveGoExportSettings(incomingSettings);

      if (win && !win.isDestroyed()) {
        const currentUrl = win.webContents.getURL();
        if (MOVIE_PATH_PATTERN.test(currentUrl)) {
          win.webContents.reload();
        }
      }

      return savedSettings;
    });

    createMenu();
    createWindow();

    win.setIcon(path.join(__dirname, "/assets/", APP_ICON));

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}
