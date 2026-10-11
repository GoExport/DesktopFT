![FlashThemes Desktop Logo](https://github.com/GoExport/DesktopFT/blob/main/src/assets/background.png?raw=true)

![GitHub Repo stars](https://img.shields.io/github/stars/GoExport/DesktopFT?cacheBuster=true)
![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/GoExport/DesktopFT/total?cacheBuster=true)
![GitHub License](https://img.shields.io/github/license/GoExport/DesktopFT?cacheBuster=true)
![GitHub Release](https://img.shields.io/github/v/release/GoExport/DesktopFT?include_prereleases&cacheBuster=true)
[![Discord](https://img.shields.io/badge/Discord-%235865F2.svg?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/ejwJYtQDrS)

This is an **unofficial** desktop client for FlashThemes.net

## Requirement(s)
1. [Git](https://git-scm.com/).
2. [Yarn](https://yarnpkg.com/).
3. Code Editor; Example [Visual Studio Code](https://code.visualstudio.com/).

## Getting started
1. Clone this project 
```bash
git clone https://github.com/GoExport/DesktopFT
```
2. Open the cloned folder then Install repository modules with `yarn` in your terminal.
```bash
yarn
```
3. Edit and configure the **src/index.js.**

## Package and distribute your application
Run the `build_win32.bat` or `build_win64.bat` in **commands** folder to build your application.

## Navigation and updates
- The toolbar above the page has Back, Forward, Reload, an address bar, Home, and an update indicator.
- `Ctrl+L` focuses the address bar; `Alt+Left` / `Alt+Right` go back and forward.
- Only `flashthemes.net` (and its subdomains) open inside DesktopFT. Other web links open in your default browser, and other protocols are refused.
- The toolbar hides itself in the Flash video editor; press `Ctrl+L` to bring it back while typing an address.
- DesktopFT checks [GitHub Releases](https://github.com/GoExport/DesktopFT/releases) at launch and every six hours, and from **Help → Check for Updates**. It only notifies you; it never downloads or installs anything.

## Testing
Run application in development mode:
```bash
yarn start
```

Run the unit tests (URL policy and update checks):
```bash
npm test
```
