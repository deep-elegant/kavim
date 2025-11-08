// frameReparent.ts
import { useCallback } from "react";
import type { Node, XYPosition } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";

export const ATTACH_MARGIN = 8;
export const OVERLAP_MIN = 0.25;

const isFrameNode = (n: Node): n is Node & { type: "frame-node" } =>
  n.type === "frame-node";

const containsWithMarginInternal = (
  frameAbsPos: XYPosition,
  frameWidth: number,
  frameHeight: number,
  p: XYPosition,
) => {
  const fw = frameWidth + ATTACH_MARGIN * 2;
  const fh = frameHeight + ATTACH_MARGIN * 2;
  const fx = frameAbsPos.x - ATTACH_MARGIN;
  const fy = frameAbsPos.y - ATTACH_MARGIN;
  return p.x >= fx && p.x <= fx + fw && p.y >= fy && p.y <= fy + fh;
};

const overlapRatioInternal = (
  nodeAbsPos: XYPosition,
  nodeWidth: number,
  nodeHeight: number,
  frameAbsPos: XYPosition,
  frameWidth: number,
  frameHeight: number,
): number => {
  const nx1 = nodeAbsPos.x;
  const ny1 = nodeAbsPos.y;
  const nx2 = nodeAbsPos.x + nodeWidth;
  const ny2 = nodeAbsPos.y + nodeHeight;
  const fx1 = frameAbsPos.x;
  const fy1 = frameAbsPos.y;
  const fx2 = frameAbsPos.x + frameWidth;
  const fy2 = frameAbsPos.y + frameHeight;
  const ix = Math.max(0, Math.min(nx2, fx2) - Math.max(nx1, fx1));
  const iy = Math.max(0, Math.min(ny2, fy2) - Math.max(ny1, fy1));
  const inter = ix * iy;
  const nArea = Math.max(1, nodeWidth * nodeHeight);
  return inter / nArea;
};

export const toLocal = (
  nodeAbsPosition: XYPosition,
  parentAbsPosition: XYPosition,
): XYPosition => {
  return {
    x: nodeAbsPosition.x - parentAbsPosition.x,
    y: nodeAbsPosition.y - parentAbsPosition.y,
  };
};

export const useCanvasFrame = () => {
  const { getInternalNode } = useReactFlow();

  /**
   * Pick the top-most frame that contains the node center or overlaps it enough.
   * Assumes no nested frames.
   */
  const pickContainingFrame = useCallback(
    (node: Node, frames: Node[]) => {
      if (frames.length === 0) {
        return null;
      }

      const nodeAbsPos =
        getInternalNode(node.id)?.internals.positionAbsolute ?? node.position;

      const center = {
        x: nodeAbsPos.x + (node.width ?? 0) / 2,
        y: nodeAbsPos.y + (node.height ?? 0) / 2,
      };

      let best: Node | null = null;
      let bestZ = -Infinity;

      for (const f of frames) {
        if ((f.width ?? 0) <= 0 || (f.height ?? 0) <= 0) continue;

        const frameAbsPos = getInternalNode(f.id)?.internals.positionAbsolute;
        if (!frameAbsPos) continue;

        const inside = containsWithMarginInternal(
          frameAbsPos,
          f.width ?? 0,
          f.height ?? 0,
          center,
        );
        const overlap = overlapRatioInternal(
          nodeAbsPos,
          node.width ?? 0,
          node.height ?? 0,
          frameAbsPos,
          f.width ?? 0,
          f.height ?? 0,
        );

        if (inside || overlap >= OVERLAP_MIN) {
          const z = (f as any).zIndex ?? 0;
          if (z >= bestZ) {
            bestZ = z;
            best = f;
          }
        }
      }
      return best;
    },
    [getInternalNode],
  );

  /**
   * Attach a *newly created* node to a frame if it was created inside a frame.
   * Returns the same node if no frame matched, or if it's a frame/has a parent already.
   * (Position is assumed absolute on creation.)
   */
  const attachToFrameOnCreate = useCallback(
    (newNode: Node, allNodes: Node[]): Node => {
      if (isFrameNode(newNode) || (newNode as any).parentId) return newNode;

      const frames = allNodes.filter(isFrameNode);
      if (frames.length === 0) return newNode;

      const target = pickContainingFrame(newNode, frames);
      if (!target) return newNode;

      // For a new node, its position is absolute.
      const nodeAbsPos = newNode.position;

      const targetAbsPos = getInternalNode(target.id)?.internals
        .positionAbsolute;
      if (!targetAbsPos) {
        console.warn(
          `Could not get absolute position for target frame ${target.id}`,
        );
        return newNode;
      }
      const local = toLocal(nodeAbsPos, targetAbsPos);

      return {
        ...newNode,
        position: local,
        parentId: target.id,
        // zIndex left for your normalize pass
      };
    },
    [getInternalNode, pickContainingFrame],
  );

  return {
    pickContainingFrame,
    attachToFrameOnCreate,
  };
};
