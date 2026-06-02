# Terminal Manager

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A cross-platform multi-terminal manager built with Electron, solving the problem of messy multiple terminal windows and tedious path switching.

English | **[中文](./README_CN.md)**

## Documentation

- [User Guide](./docs/USER_GUIDE.md) | [用户指南](./docs/USER_GUIDE_CN.md)
- [Known Limitations](./docs/KNOWN_LIMITATIONS.md)
- [Changelog](./docs/CHANGELOG.md)
- [Contributing](./docs/CONTRIBUTING.md)
- [All Documentation](./docs/README.md)

## Features

- **Multi-tab Terminal**: Manage multiple terminal sessions in one window
- **Split Layout**: Support horizontal/vertical split with resizable panes
- **Project Management**: Add frequently used project directories and open terminals with one click
- **Layout Restoration**: Automatically restore tabs, splits, and working directories after restart
- **Cross-platform**: Supports Windows and macOS

## System Requirements

- Windows 10 (1809+) or macOS 10.15+
- Node.js 20+

## Installation

### Download Installer

Download the installer for your platform from the [Releases](https://github.com/Echo0355/terminal-manager/releases) page:

- Windows: `Terminal Manager-1.2.1-x64-Setup.exe`
- macOS: `Terminal Manager-1.2.1-arm64.dmg` or `Terminal Manager-1.2.1-x64.dmg`

### Build from Source

```bash
# Clone the repository
git clone https://github.com/Echo0355/terminal-manager.git
cd terminal-manager

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build a package for the current system
npm run build
npm run package

# Build for a specific target platform
npm run package:win
npm run package:mac
```

`node-pty` is a native module. For release builds, use the included GitHub Actions
workflow so each package is built on its matching Windows or macOS host.

## Quick Start

### Launch Application

```bash
npm run dev
```

The application will automatically open a terminal window on startup.

### Add Projects

1. Click the **＋** button at the top of the sidebar
2. Select a project directory in the dialog
3. The project will appear in the sidebar list

### Open Terminal from Project

- **Click project name**: Open in a new tab
- **Click ▶**: Open in a new tab

### Tab Operations

| Action | Shortcut |
|--------|----------|
| New tab | `Ctrl+T` |
| Close tab | `Ctrl+W` |
| Next tab | `Ctrl+Tab` |
| Previous tab | `Ctrl+Shift+Tab` |
| Switch to Nth tab | `Ctrl+1~9` |

### Split Operations

| Action | Shortcut |
|--------|----------|
| Close current pane | `Alt+Shift+W` |

### Focus Navigation

| Action | Shortcut |
|--------|----------|
| Focus left | `Alt+←` |
| Focus right | `Alt+→` |
| Focus up | `Alt+↑` |
| Focus down | `Alt+↓` |

### Settings

Press `Ctrl+,` to open the settings dialog. You can configure:

- Default Shell (choose an auto-detected Shell or enter a custom path)
- Default working directory
- Font size (8-32)
- Scrollback lines
- Theme (dark/light)

Theme changes apply immediately. Other terminal settings are used by newly created terminals; existing terminals remain unchanged.

## Layout Restoration

The application automatically saves the following state:

- All tabs and panes
- Split layout structure
- Shell and working directory for each pane
- Sidebar width

These states are automatically restored after restarting the application.

## Data Storage

Application data is stored in the user directory:

- **Windows**: `%APPDATA%/terminal-manager/`
- **macOS**: `~/Library/Application Support/terminal-manager/`

Contains the following files:

- `config.json`: Application configuration
- `projects.json`: Project list
- `layout-state.json`: Layout state

## FAQ

**Q: Terminal won't start?**

A: Please check:
1. Is the Shell path correct?
2. Does the working directory exist?
3. Is the corresponding Shell installed on your system?

**Q: How to change the default Shell?**

A: Press `Ctrl+,` to open settings, choose an auto-detected Shell or enter a custom path, then save. You can also right-click a project in the Explorer to create a tab with a specific Shell and that project as the working directory.

**Q: Layout not restored?**

A: Please check:
1. Was the application closed normally (not force-killed)?
2. Does the `layout-state.json` file exist and contain valid content?

## Contributing

Contributions are welcome! Please check the [Contributing Guide](./docs/CONTRIBUTING.md) for how to participate in the project.

### Quick Start

1. Fork this repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'feat: add some feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Create a Pull Request

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Electron](https://www.electronjs.org/) - Cross-platform desktop application framework
- [xterm.js](https://xtermjs.org/) - Terminal emulator
- [node-pty](https://github.com/microsoft/node-pty) - PTY bindings
- [electron-vite](https://electron-vite.org/) - Build tool
