/** CSS injected into Obsidian popout windows for Minima styling */
export const POPOUT_CSS = `
/* Hide Obsidian chrome */
.titlebar,
.workspace-tab-header-container,
.sidebar-toggle-button,
.workspace-ribbon,
.status-bar,
.view-header {
  display: none !important;
}

/* Clean panel */
.app-container {
  border-radius: 10px !important;
  overflow: hidden !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18) !important;
}

.workspace { padding-top: 0 !important; }
.workspace-split.mod-root { margin: 0 !important; }
.workspace-leaf { border-radius: 10px !important; }

/* Drag area at top */
.workspace-leaf-content { position: relative; }
.workspace-leaf-content::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 28px;
  -webkit-app-region: drag;
  z-index: 100;
}

/* Editor padding */
.markdown-source-view,
.markdown-preview-view {
  padding: 32px 18px 18px !important;
}

.cm-editor,
.markdown-preview-view {
  -webkit-app-region: no-drag;
}

/* Scrollbar */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.2);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(128, 128, 128, 0.35);
}
`;
