import { type Node, type XYPosition } from '@xyflow/react';

export interface DrawableNode<T extends Node = Node> {
  onPaneMouseDown: (id: string, position: XYPosition) => T;
  onPaneMouseMove: (
    node: T,
    startPosition: XYPosition,
    currentPosition: XYPosition,
  ) => T;
  onPaneMouseUp: (node: T) => T;
}
