# Minima

A minimal Obsidian companion that lives in your menu bar for quick note-taking.

Minima adds a small, always-accessible window from your system tray/menu bar. Point it at any markdown file in your vault and start writing — no need to keep the full Obsidian window front and center.

## Features

- **Minimal** — small and distraction-free writing window.
- **Menu-bar toggle** — click the Minima icon to open/close the note window.
- **Anchored window (macOS)** — opens near the menu bar icon for quick access.
- **Auto-close on blur** — closes when you click outside the pop-out window.
- **Single-file focus** — choose one markdown note from your vault; Minima reads and writes to that file only.
- **Fast autosave** — edits are written back to disk automatically.
- **Always on top** — optionally keep the window above other windows.
- **Tray icon style** — choose between color and monochrome menu bar icons.

## Installation

### From community plugins (once published)

1. Open **Settings → Community plugins → Browse**.
2. Search for **Minima**.
3. Select **Install**, then **Enable**.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/pedrojreis/Minima/releases).
2. Create a folder at `<your-vault>/.obsidian/plugins/minima/`.
3. Copy the downloaded files into that folder.
4. Reload Obsidian and enable **Minima** in **Settings → Community plugins**.

## Usage

1. Open **Settings → Minima** and choose a note from your vault.
2. Click the Minima menu bar / system tray icon to show or hide the window.
3. Write away.

## Settings

| Setting                      | Description                                      | Default |
| ---------------------------- | ------------------------------------------------ | ------- |
| **Note**                     | The vault note that Minima reads and writes to.  | None    |
| **Always on top**            | Keep the note window above other windows.        | On      |
| **Monochrome menu bar icon** | Use a template icon in the macOS menu bar.       | Off     |
| **Show note title**          | Show the note title as a subtle background hint. | On      |

## Requirements

- Obsidian **v0.15.0** or later.
- Desktop only (macOS, Windows, Linux). Mobile is not supported.

## Development

```bash
# Install dependencies
npm install

# Build in watch mode
npm run dev

# Production build
npm run build
```

## License

[MIT](LICENSE)
