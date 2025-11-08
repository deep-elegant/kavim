import React, { memo } from "react";
import { type Node, type NodeProps } from "@xyflow/react";

import NodeInteractionOverlay from "./NodeInteractionOverlay";
import { type DrawableNode } from "./DrawableNode";
import { Z } from "./nodesZindex";

export type FrameNodeData = {
  title?: string;
  fill?: string;
  stroke?: string;
};

export type FrameNodeType = Node<FrameNodeData, "frame-node">;

export const FRAME_NODE_MIN_WIDTH = 240;
export const FRAME_NODE_MIN_HEIGHT = 160;

const FrameNode = memo(({ id, data, selected }: NodeProps<FrameNodeType>) => {
  const title = data.title ?? "Frame";
  const fill = data.fill ?? "hsl(var(--background))";
  const stroke = data.stroke ?? "hsl(var(--border))";

  return (
    <NodeInteractionOverlay
      nodeId={id}
      isActive={selected}
      minWidth={FRAME_NODE_MIN_WIDTH}
      minHeight={FRAME_NODE_MIN_HEIGHT}
    >
      <div
        className="relative h-full w-full select-none rounded-xl"
        style={{
          background: fill,
          border: `1px solid ${stroke}`,
          overflow: "visible",
        }}
      >
        <div
          className="pointer-events-none absolute left-0 top-0 z-10 m-2 rounded-md bg-black/40 px-2 py-1 text-xs font-medium text-white"
          title={title}
        >
          {title}
        </div>
        {/* visual frame content; children nodes are separate ReactFlow nodes layered above */}
      </div>
    </NodeInteractionOverlay>
  );
});

FrameNode.displayName = "FrameNode";

export default FrameNode;

// Drawable tool implementation for Frame (drag to create/resize)
const DRAG_ACTIVATION_THRESHOLD = 4;

export const frameDrawable: DrawableNode<FrameNodeType> = {
  onPaneMouseDown: (id, position) => ({
    id,
    type: "frame-node",
    position,
    data: { title: "Frame" },
    width: 600,
    height: 400,
    style: { width: 600, height: 400 },
    selected: true,
    zIndex: Z.FRAME_BASE,
  }),

  onPaneMouseMove: (node, start, current) => {
    const dx = Math.abs(current.x - start.x);
    const dy = Math.abs(current.y - start.y);
    const hasDragged = Math.max(dx, dy) >= DRAG_ACTIVATION_THRESHOLD;
    if (!hasDragged) {
      return node;
    }

    const width = Math.max(dx, FRAME_NODE_MIN_WIDTH);
    const height = Math.max(dy, FRAME_NODE_MIN_HEIGHT);
    const position = { x: Math.min(start.x, current.x), y: Math.min(start.y, current.y) };

    return {
      ...node,
      position,
      width,
      height,
      style: { ...(node.style ?? {}), width, height },
    };
  },

  onPaneMouseUp: (node) => {
    const width = Math.max(Number(node.style?.width ?? node.width ?? 0), FRAME_NODE_MIN_WIDTH);
    const height = Math.max(Number(node.style?.height ?? node.height ?? 0), FRAME_NODE_MIN_HEIGHT);
    return {
      ...node,
      width,
      height,
      style: { ...(node.style ?? {}), width, height },
    };
  },
};
