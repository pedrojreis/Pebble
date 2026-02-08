import { App, Notice, TFile, WorkspaceLeaf } from "obsidian";
import { MinimaSettings } from "./settings";
import { getRemote } from "./electron-utils";

/** Padding added around the panel for the arrow and drop-shadow. */
const ARROW_HEIGHT = 10;
const SHADOW_PADDING = 16;

/**
 * Uses Obsidian's native popout window but injects custom Minima styling.
 * This gives full Obsidian editing experience with the Minima look and feel.
 */
export class NativeWindow {
	private app: App;
	private settings: MinimaSettings;
	private popoutLeaf: WorkspaceLeaf | null = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private popoutWindow: any = null;
	private getTrayBounds:
		| (() => { x: number; y: number; width: number; height: number } | null)
		| null;
	private styleInjected = false;

	constructor(
		app: App,
		settings: MinimaSettings,
		getTrayBounds?: () => {
			x: number;
			y: number;
			width: number;
			height: number;
		} | null,
	) {
		this.app = app;
		this.settings = settings;
		this.getTrayBounds = getTrayBounds ?? null;
	}

	/**
	 * Get the TFile for the configured note path.
	 */
	private getNoteFile(): TFile | null {
		if (!this.settings.notePath) {
			console.debug("Minima: No note path configured in settings");
			return null;
		}
		const file = this.app.vault.getAbstractFileByPath(
			this.settings.notePath,
		);
		if (!file) {
			console.debug(
				"Minima: Note file not found at path:",
				this.settings.notePath,
			);
			return null;
		}
		return file instanceof TFile ? file : null;
	}

	/**
	 * Check if the popout window is currently visible.
	 */
	isVisible(): boolean {
		if (!this.popoutWindow) return false;
		try {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			return this.popoutWindow.isVisible();
		} catch {
			return false;
		}
	}

	/**
	 * Toggle the native Obsidian popout window.
	 */
	async toggle(): Promise<void> {
		console.debug("Minima: Toggle called, isVisible:", this.isVisible());
		if (this.isVisible()) {
			this.hide();
		} else {
			await this.show();
		}
	}

	/**
	 * Show the native Obsidian popout window with the configured note.
	 */
	async show(): Promise<boolean> {
		console.debug("Minima: Show called");

		const file = this.getNoteFile();
		if (!file) {
			console.error(
				"Minima: Cannot show - no note file configured or file not found",
			);
			new Notice("Minima: Please select a note in settings first");
			return false;
		}

		console.debug("Minima: Opening file:", file.path);

		try {
			// If we already have a popout, just show and focus it
			if (this.popoutLeaf && this.popoutWindow) {
				try {
					this.positionNearTray();
					// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
					this.popoutWindow.show();
					// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
					this.popoutWindow.focus();
					console.debug("Minima: Reused existing popout window");
					return true;
				} catch (e) {
					console.debug(
						"Minima: Existing window invalid, recreating",
						e,
					);
					// Window was closed externally, recreate it
					this.popoutLeaf = null;
					this.popoutWindow = null;
					this.styleInjected = false;
				}
			}

			// Get current window count to detect new window
			const remote = getRemote();
			if (!remote) {
				console.error("Minima: No Electron remote available");
				return false;
			}

			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			const mainWindow = remote.getCurrentWindow();
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			const windowsBefore = new Set(
				remote.BrowserWindow.getAllWindows().map(
					(w: { id: number }) => w.id,
				),
			);

			console.debug("Minima: Creating new popout leaf...");

			// Use getLeaf with 'window' to create a new window
			this.popoutLeaf = this.app.workspace.getLeaf("window");

			if (!this.popoutLeaf) {
				console.error(
					"Minima: Failed to create popout leaf via getLeaf('window')",
				);
				new Notice("Minima: Could not create popout window");
				return false;
			}

			// Find and hide the new window immediately (before it fully renders)
			// Poll rapidly to catch it as soon as possible
			let attempts = 0;
			const maxAttempts = 50; // 500ms max

			while (attempts < maxAttempts && !this.popoutWindow) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
				const allWindows = remote.BrowserWindow.getAllWindows();
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
				this.popoutWindow = allWindows.find(
					// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
					(w: any) => !windowsBefore.has(w.id),
				);

				if (this.popoutWindow) {
					// Hide immediately to prevent flash
					// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
					this.popoutWindow.hide();
					break;
				}

				await new Promise((resolve) => setTimeout(resolve, 10));
				attempts++;
			}

			if (!this.popoutWindow) {
				console.error("Minima: Could not find the new popout window");
				return false;
			}

			console.debug(
				"Minima: Found popout window, configuring while hidden...",
			);

			// Configure window while hidden
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			this.popoutWindow.setAlwaysOnTop(this.settings.alwaysOnTop);

			// Set size
			const outerWidth = this.settings.windowWidth + 2 * SHADOW_PADDING;
			const outerHeight =
				this.settings.windowHeight + ARROW_HEIGHT + SHADOW_PADDING;
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			this.popoutWindow.setSize(outerWidth, outerHeight);

			// Position near tray
			this.positionNearTray();

			// Open the file in the popout leaf
			console.debug("Minima: Opening file in leaf...");
			await this.popoutLeaf.openFile(file);

			// Inject custom Minima styling
			await this.injectMinimaStyle();

			// Set up event handlers
			this.setupWindowEventHandlers();

			// Small delay to ensure content is rendered, then show
			await new Promise((resolve) => setTimeout(resolve, 50));

			// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			this.popoutWindow.show();
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			this.popoutWindow.focus();

			console.debug("Minima: Show complete");
			return true;
		} catch (e) {
			console.error("Minima: Failed to show native window", e);
			new Notice("Minima: Error opening window - " + String(e));
			return false;
		}
	}

	/**
	 * Set up event handlers for the popout window.
	 */
	private setupWindowEventHandlers(): void {
		if (!this.popoutWindow) return;

		// Handle blur to auto-hide
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
		this.popoutWindow.on("blur", () => {
			setTimeout(() => {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
				if (this.popoutWindow && !this.popoutWindow.isFocused()) {
					this.hide();
				}
			}, 100);
		});

		// Track window close
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
		this.popoutWindow.on("closed", () => {
			this.popoutWindow = null;
			this.popoutLeaf = null;
			this.styleInjected = false;
		});

		// Save bounds on resize
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
		this.popoutWindow.on("resized", () => {
			this.saveWindowBounds();
		});
	}

	/**
	 * Find the popout window among all Electron windows and configure it.
	 */
	private async findAndConfigurePopoutWindow(): Promise<void> {
		const remote = getRemote();
		if (!remote) {
			console.debug("Minima: No Electron remote available");
			return;
		}

		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
		const allWindows = remote.BrowserWindow.getAllWindows();
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
		const mainWindow = remote.getCurrentWindow();

		console.debug(
			"Minima: Total windows:",
			(allWindows as unknown[]).length,
		);

		// Find the popout window (most recently created one that isn't main)
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
		this.popoutWindow = allWindows.find(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
			(w: any) => w.id !== mainWindow.id,
		);

		if (!this.popoutWindow) {
			console.debug("Minima: Could not find popout window");
			return;
		}

		console.debug("Minima: Found popout window, configuring...");

		// Configure the popout window
		try {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			this.popoutWindow.setAlwaysOnTop(this.settings.alwaysOnTop);

			// Set size (add padding for arrow effect we'll create with CSS)
			const outerWidth = this.settings.windowWidth + 2 * SHADOW_PADDING;
			const outerHeight =
				this.settings.windowHeight + ARROW_HEIGHT + SHADOW_PADDING;
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			this.popoutWindow.setSize(outerWidth, outerHeight);

			// Position near tray
			this.positionNearTray();

			// Inject custom Minima styling
			await this.injectMinimaStyle();

			// Handle blur to auto-hide
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			this.popoutWindow.on("blur", () => {
				setTimeout(() => {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
					if (this.popoutWindow && !this.popoutWindow.isFocused()) {
						this.hide();
					}
				}, 100);
			});

			// Track window close
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			this.popoutWindow.on("closed", () => {
				this.popoutWindow = null;
				this.popoutLeaf = null;
				this.styleInjected = false;
			});

			// Save bounds on resize
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			this.popoutWindow.on("resized", () => {
				this.saveWindowBounds();
			});
		} catch (e) {
			console.error("Minima: Error configuring popout window", e);
		}
	}

	/**
	 * Inject Minima's custom styling into the popout window.
	 */
	private async injectMinimaStyle(): Promise<void> {
		if (!this.popoutWindow || this.styleInjected) return;

		const css = `
			/* Hide default Obsidian titlebar and extra UI for cleaner look */
			.titlebar,
			.mod-windows .titlebar,
			.mod-linux .titlebar {
				display: none !important;
			}
			
			/* Main content area styling */
			.app-container {
				border-radius: 10px !important;
				overflow: hidden !important;
				box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18) !important;
			}
			
			/* Custom minimal titlebar */
			.workspace {
				padding-top: 0 !important;
			}
			
			/* Hide tabs and extra UI for focused writing */
			.workspace-tab-header-container,
			.workspace-tab-header,
			.sidebar-toggle-button,
			.workspace-ribbon,
			.status-bar,
			.view-header {
				display: none !important;
			}
			
			/* Make the view take full space */
			.workspace-split.mod-root {
				margin: 0 !important;
			}
			
			.workspace-leaf {
				border-radius: 10px !important;
			}
			
			/* Make top area draggable for window movement */
			.workspace-leaf-content {
				position: relative;
			}
			
			.workspace-leaf-content::before {
				content: '';
				position: absolute;
				top: 0;
				left: 0;
				right: 0;
				height: 28px;
				-webkit-app-region: drag;
				z-index: 100;
				pointer-events: auto;
			}
			
			/* Editor styling - add top padding for drag area */
			.markdown-source-view,
			.markdown-preview-view {
				padding: 32px 18px 18px !important;
			}
			
			/* Make editor content not draggable */
			.cm-editor,
			.markdown-preview-view {
				-webkit-app-region: no-drag;
			}
			
			/* Scrollbar styling */
			::-webkit-scrollbar {
				width: 6px;
			}
			::-webkit-scrollbar-track {
				background: transparent;
			}
			::-webkit-scrollbar-thumb {
				background: var(--scrollbar-thumb-bg, rgba(128,128,128,0.2));
				border-radius: 3px;
			}
			::-webkit-scrollbar-thumb:hover {
				background: var(--scrollbar-active-thumb-bg, rgba(128,128,128,0.35));
			}
		`;

		const js = `
			(function() {
				// Add Minima CSS
				var existingStyle = document.getElementById('minima-style');
				if (existingStyle) existingStyle.remove();
				
				var style = document.createElement('style');
				style.id = 'minima-style';
				style.textContent = ${JSON.stringify(css)};
				document.head.appendChild(style);
				console.log('Minima: Style injected');
			})();
		`;

		try {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			await this.popoutWindow.webContents.executeJavaScript(js);
			this.styleInjected = true;
			console.debug("Minima: Style injection successful");
		} catch (e) {
			console.error("Minima: Failed to inject style", e);
		}
	}

	/**
	 * Hide the popout window.
	 */
	hide(): void {
		if (this.popoutWindow) {
			try {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
				this.popoutWindow.hide();
			} catch {
				// Window may be destroyed
			}
		}
	}

	/**
	 * Position the window near the tray icon.
	 */
	private positionNearTray(): void {
		if (!this.popoutWindow || !this.getTrayBounds) return;

		const trayBounds = this.getTrayBounds();
		if (!trayBounds) return;

		const remote = getRemote();
		if (!remote) return;

		const { screen } = remote;
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
		const display = screen.getDisplayNearestPoint({
			x: trayBounds.x,
			y: trayBounds.y,
		});
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
		const workArea = display.workArea;

		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
		const winSize: number[] = this.popoutWindow.getSize();
		const winWidth = winSize[0] ?? this.settings.windowWidth;

		// Centre horizontally under the tray icon
		const trayCenterX = Math.round(trayBounds.x + trayBounds.width / 2);
		let x = trayCenterX - Math.round(winWidth / 2);
		const y = trayBounds.y + trayBounds.height + 4;

		// Clamp to screen edges
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		const rightEdge = workArea.x + workArea.width;
		if (x + winWidth > rightEdge) x = rightEdge - winWidth;
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		if (x < workArea.x) x = workArea.x;

		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
		this.popoutWindow.setPosition(x, y);
	}

	/**
	 * Save window bounds to settings.
	 */
	private saveWindowBounds(): void {
		if (!this.popoutWindow) return;
		try {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			const bounds = this.popoutWindow.getBounds();
			// Store logical size minus padding
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
			this.settings.windowWidth = bounds.width - 2 * SHADOW_PADDING;
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
			this.settings.windowHeight =
				bounds.height - ARROW_HEIGHT - SHADOW_PADDING;
		} catch {
			// Window may be destroyed
		}
	}

	/**
	 * Update always-on-top setting.
	 */
	setAlwaysOnTop(value: boolean): void {
		if (this.popoutWindow) {
			try {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
				this.popoutWindow.setAlwaysOnTop(value);
			} catch {
				// Window may be destroyed
			}
		}
	}

	/**
	 * Get current settings (with updated window bounds).
	 */
	getSettings(): MinimaSettings {
		return this.settings;
	}

	/**
	 * Destroy the popout window.
	 */
	destroy(): void {
		if (this.popoutLeaf) {
			try {
				this.popoutLeaf.detach();
			} catch {
				// Already detached
			}
			this.popoutLeaf = null;
		}

		if (this.popoutWindow) {
			try {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
				this.popoutWindow.destroy();
			} catch {
				// Already destroyed
			}
			this.popoutWindow = null;
		}

		this.styleInjected = false;
	}

	/**
	 * Close any stale popout windows that Obsidian may have restored from a previous session.
	 * Called on plugin load to prevent auto-opening windows.
	 */
	closeStalePopouts(): void {
		const remote = getRemote();
		if (!remote) return;

		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
		const allWindows = remote.BrowserWindow.getAllWindows();
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
		const mainWindow = remote.getCurrentWindow();

		// Close all windows except the main one
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		for (const win of allWindows as any[]) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			if (win.id !== mainWindow.id) {
				try {
					console.debug(
						"Minima: Closing stale popout window on startup",
					);
					// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
					win.close();
				} catch {
					// Window may already be closed
				}
			}
		}
	}
}
