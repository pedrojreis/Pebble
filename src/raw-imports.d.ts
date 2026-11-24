declare module "*.html" {
	const value: string;
	export default value;
}

declare module "*.css" {
	const value: string;
	export default value;
}

/** The editor window script (src/editor/index.ts), bundled as a string. */
declare module "pebble-editor-bundle" {
	const value: string;
	export default value;
}
