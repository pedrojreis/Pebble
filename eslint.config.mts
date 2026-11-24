import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ["eslint.config.mts", "manifest.json"],
					defaultProject: "tsconfig.json",
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: [".json"],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		rules: {
			// TypeScript already checks this; no-undef doesn't understand
			// TS-only globals like the NodeJS namespace.
			"no-undef": "off",
		},
	},
	{
		// The editor runs in its own BrowserWindow, outside Obsidian: no
		// createEl/activeDocument there, and console.log is its IPC channel.
		files: ["src/editor/**/*.ts"],
		rules: {
			"no-console": "off",
			"obsidianmd/rule-custom-message": "off",
			"obsidianmd/prefer-active-doc": "off",
			"obsidianmd/prefer-create-el": "off",
		},
	},
	globalIgnores([
		"node_modules",
		"dist",
		"esbuild.config.mjs",
		"eslint.config.js",
		"version-bump.mjs",
		"versions.json",
		"main.js",
	]),
);
