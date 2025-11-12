// One source of truth for stacking
export const Z = {
  FRAME_BASE: 10,        // frames sit here
  CONTENT_BASE: 100,     // regular nodes (not in a frame)
  DRAG_BOOST: 1000,      // React Flow uses this while dragging
  CHILD_OFFSET: 1,       // child above its parent frame
} as const;
