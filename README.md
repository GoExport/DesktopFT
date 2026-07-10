![asfasf](https://raw.githubusercontent.com/LORE-MMO/.github/main/assets/Nereus-Banner.png)
Another Version of [ElectronFlash ](https://github.com/GoExport/ElectronFlash) developed using Electron Forge, The fastest way to distribute your newly created app with this example bare project structure of Electron comes with Adobe Flash Player Plugin.

## Requirement(s)
1. [Git](https://git-scm.com/).
2. [Yarn](https://yarnpkg.com/).
3. Code Editor; Example [Visual Studio Code](https://code.visualstudio.com/).

## Getting started
1. Clone this project 
```bash
git clone https://github.com/GoExport/FlashThemes
```
2. Open the cloned folder then Install repository modules with `yarn` in your terminal.
```bash
yarn
```
3. Edit and configure the **src/index.js.**

## Package and distribute your application
Run the `build_win32.bat` or `build_win64.bat` in **commands** folder to build your application.

## Testing
Run application in development mode:
```bash
yarn start
```

## Changes
- Add Custom Title and Icon
- Add Mac and Linux Plugin (ia32 and x64)
- Add Lock second instance so only one instance of our application at the same time
- Add **new-window** listener to open new windows with the default browser
- Add custom default Context Menu (Reload, Force Reload, Dev Tools, Separator, Zoom In, Zoom Out, and others)

## To Do
- Discord Rich Presence
- Notification
- Auto Update
