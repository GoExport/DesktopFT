const { app, BrowserWindow, shell, Menu } = require("electron");
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
const APP_SESSION_PARTITION = "persist:desktopft";
const EDITOR_PATH_PATTERN = /\/videomaker\/.+\/full/i;
const MOVIE_PATH_PATTERN = /\/movie\//i;

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

const buildEditorLayoutPatchScript = () => `
;(() => {
  const isEditor = /\\/videomaker\\/.+\\/full/i.test(location.pathname);
  if (!isEditor) return;

  const styleId = 'desktopft-editor-layout-fix';
  let style = document.getElementById(styleId);
  if (!style) {
    style = document.createElement('style');
    style.id = styleId;
    document.head.appendChild(style);
  }

  style.textContent = [
    'html, body { overflow: hidden !important; height: 100% !important; max-height: 100% !important; margin: 0 !important; padding: 0 !important; }',
    '#studioBlock { height: 0 !important; min-height: 0 !important; }',
    '.top-nav, .site-header, header { display: none !important; }',
    '#studio_container { position: fixed !important; left: 0 !important; right: 0 !important; top: 0 !important; width: 100vw !important; height: 100vh !important; overflow: hidden !important; z-index: 1 !important; }',
    '#previewPlayerContainer { position: fixed !important; inset: 0 !important; z-index: 10000 !important; }',
    '#previewPlayer, #characterCreator { position: absolute !important; left: 50% !important; top: 60px !important; transform: translateX(-50%) !important; z-index: 10001 !important; margin: 0 !important; }',
    '#previewPlayerContainer .blockUI.blockOverlay { position: fixed !important; inset: 0 !important; }',
    '#studio_holder, #studio_holder object, #studio_holder embed, #studio_holder iframe { width: 100% !important; height: 100% !important; display: block !important; }',
    '#studio_container .site-footer, .site-footer { display: none !important; }'
  ].join('\\n');

  const syncPreviewMode = () => {
    const studioContainer = document.getElementById('studio_container');
    const previewContainer = document.getElementById('previewPlayerContainer');
    const previewVisible = !!previewContainer && window.getComputedStyle(previewContainer).display !== 'none';

    if (studioContainer) {
      studioContainer.style.visibility = previewVisible ? 'hidden' : 'visible';
      studioContainer.style.pointerEvents = previewVisible ? 'none' : 'auto';
    }

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  };

  syncPreviewMode();

  const previewContainer = document.getElementById('previewPlayerContainer');
  if (previewContainer) {
    const observer = new MutationObserver(syncPreviewMode);
    observer.observe(previewContainer, {
      attributes: true,
      attributeFilter: ['style', 'class']
    });
  }
})();
`;

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

if (!gotTheLock) {
  app.quit();
} else {
  const openInMainWindow = async (url) => {
    if (win && !win.isDestroyed()) {
      try {
        await win.webContents.executeJavaScript("window.onbeforeunload = null;");
      } catch (error) {
        // Ignore if script cannot run during early navigation states.
      }

      win.loadURL(url);
      win.focus();
    }
  };

  const createMenu = () => {
    const template = [
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
      {
        label: "Home",
        click: async () => {
          win.loadURL(APP_URL);
        },
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
            label: "Badges",
            click: async () => {
              win.loadURL(APP_BADGES);
            },
          },
          {
            label: "Friends",
            click: async () => {
              win.loadURL(APP_FRIENDS);
            },
          },
          {
            label: "Messages",
            click: async () => {
              win.loadURL(APP_MESSAGES);
            },
          },
          {
            label: "Settings",
            click: async () => {
              win.loadURL(APP_SETTINGS);
            },
          },
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
        ],
      },
      {
        label: "Explore",
        submenu: [
          {
            label: "Animations",
            click: async () => {
              win.loadURL(APP_ANIMATIONS);
            },
          },
          {
            label: "Community",
            click: async () => {
              win.loadURL(APP_COMMUNITY);
            },
          },
        ],
      },
      {
        label: "Shop",
        click: async () => {
          win.loadURL(APP_SHOP);
        },
      },
      {
        label: "CREATE",
        submenu: [
          {
            label: "Comedy World",
            click: async () => {
              openInMainWindow(FVM_EDITOR_COMEDY_WORLD);
            },
          },
          { type: "separator" },
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
            label: "Space Citizens",
            click: async () => {
              openInMainWindow(FVM_EDITOR_SPACE_CITIZENS);
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
            label: "Chibi Ninjas",
            click: async () => {
              openInMainWindow(FVM_EDITOR_CHIBI_NINJAS);
            },
          },
          {
            label: "Chibi Peepz",
            click: async () => {
              openInMainWindow(FVM_EDITOR_CHIBI_PEEPZ);
            },
          },
          {
            label: "Space Peepz",
            click: async () => {
              openInMainWindow(FVM_EDITOR_SPACE_PEEPZ);
            },
          },
          {
            label: "Jungle Warfare",
            click: async () => {
              openInMainWindow(FVM_EDITOR_JUNGLE_WARFARE);
            },
          },
          { type: "separator" },
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
        win.webContents.executeJavaScript(buildEditorLayoutPatchScript()).catch((error) => {
          console.error("[DesktopFT] Editor layout patch injection failed:", error);
        });
      }

      if (MOVIE_PATH_PATTERN.test(currentUrl)) {
        win.webContents.executeJavaScript(buildMovieDownloaderPatchScript()).catch((error) => {
          console.error("[DesktopFT] Movie downloader patch injection failed:", error);
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

    createMenu();
    createWindow();

    win.setIcon(path.join(__dirname, "/assets/", APP_ICON));

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}
