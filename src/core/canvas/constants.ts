/**
 * Canvas configuration constants
 * These values control interaction behaviors and visual appearance of the canvas
 */

/**
 * CONNECTION HANDLE SNAPPING CONFIGURATION
 * 
 * HANDLE_SNAP_RADIUS: The distance (in pixels) from a connection handle where
 * an edge will automatically snap to that handle when released.
 * 
 * Increasing this value makes it easier to connect edges without precise mouse placement.
 * Default ReactFlow behavior uses a much smaller internal radius (~8-10px).
 */
export const HANDLE_SNAP_RADIUS = 20; // Increased from ReactFlow's internal default

/**
 * NODE_BOUNDS_SNAP_RADIUS: The distance (in pixels) from a node's bounding box
 * where an edge will automatically connect to the nearest available handle.
 * 
 * This allows users to release the mouse anywhere inside or near the node,
 * and the edge will intelligently find the best connection point.
 */
export const NODE_BOUNDS_SNAP_RADIUS = 20;

/**
 * CONNECTION_RADIUS: The distance (in pixels) around a node where connection
 * handles become visible during a connection attempt.
 * 
 * This provides visual feedback to users that they're close enough to make a connection.
 * Should be >= HANDLE_SNAP_RADIUS for consistent UX.
 */
export const CONNECTION_RADIUS = 30; // Increased from 50 for better discoverability

/**
 * Node interaction configuration
 */
export const HANDLE_SIZE = 12;
export const HANDLE_OFFSET = 10;
export const CONNECTION_HANDLE_OFFSET = 14;
export const DEFAULT_CONNECTION_RADIUS = 30;
export const TOOLBAR_VERTICAL_GAP = 36;
