import { type Node, type XYPosition } from "@xyflow/react";

/**
 * Defines the behavior for nodes that can be drawn/created by dragging on the canvas.
 * - Used for creating nodes with custom sizing (e.g., drag to define width/height).
 * - Separates drawing logic from node rendering for cleaner architecture.
 */
export interface DrawableNode<T extends Node = Node> {
  /** Initialize node on first mouse press (sets initial position & default size) */
  onPaneMouseDown: (id: string, position: XYPosition) => T;

  /** Update node dimensions while dragging (calculates width/height from mouse movement) */
  onPaneMouseMove: (
    node: T,
    startPosition: XYPosition,
    currentPosition: XYPosition,
  ) => T;

  /** Finalize node on mouse release (enforce min constraints, activate typing mode) */
  onPaneMouseUp: (node: T) => T;
}
