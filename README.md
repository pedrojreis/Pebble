# Minima

A minimal Obsidian companion that lives in your menu bar for quick note-taking.

Minima adds a small, always-accessible window anchored to your system tray. Point it at any markdown file in your vault and start writing — no need to open the full Obsidian window.

## Features

- **Menu-bar window** — toggle a lightweight note window from the system tray or with a command.
- **Inherits your theme** — the pop-out window uses your current Obsidian theme and CSS snippets, so it feels native.
- **Full Obsidian editor** — supports all the editing features you're used to (links, embeds, plugins, etc.).
- **Single-file focus** — choose one markdown note from your vault; Minima reads and writes to that file only.
- **Always on top** — optionally keep the window above all other windows (configurable in settings).

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
2. Use the command **Toggle Minima** (or click the tray icon) to show/hide the window.
3. Write away.

## Settings

| Setting           | Description                                     | Default |
| ----------------- | ----------------------------------------------- | ------- |
| **Note**          | The vault note that Minima reads and writes to. | None    |
| **Always on top** | Keep the note window above other windows.       | On      |

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
