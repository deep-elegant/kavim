/**
 * Canvas configuration constants
 * These values control interaction behaviors and visual appearance of the canvas
 */


/**
 * NODE_BOUNDS_SNAP_RADIUS: "Forgiveness zone" for auto-connecting
 * When you release within this distance of a node (but not on a handle),
 * it will auto-snap to the nearest handle
 */
export const NODE_BOUNDS_SNAP_RADIUS = 50;

/**
 * CONNECTION_RADIUS: Distance where connection handles become VISIBLE
 * Increase this to make handles appear from farther away (better UX)
 */
export const CONNECTION_RADIUS = 80; // Increased from 50 for better discoverability

/**
 * Node interaction configuration
 */
export const HANDLE_SIZE = 12;
export const HANDLE_OFFSET = 10;
export const CONNECTION_HANDLE_OFFSET = 14;
export const DEFAULT_CONNECTION_RADIUS = 30;
export const TOOLBAR_VERTICAL_GAP = 36;
