/**
 * The JavaScript file is the executable Expo config plugin because app.config.js
 * loads it during prebuild. Keep this typed entry point intentionally thin so
 * there is a single source of truth for generated Android code.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const withNotificationListener = require('./withNotificationListener.js');

export default withNotificationListener;
