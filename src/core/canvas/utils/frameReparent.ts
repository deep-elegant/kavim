// frameReparent.ts
import type { Node, XYPosition } from "@xyflow/react";

export const ATTACH_MARGIN = 8;
export const OVERLAP_MIN = 0.25;

export const isFrameNode = (
  n: Node,
): n is Node & { type: "frame-node" } => n.type === "frame-node";

const clonePosition = (pt?: XYPosition): XYPosition =>
  pt ? { x: pt.x, y: pt.y } : { x: 0, y: 0 };

const getAbs = (n: Node): XYPosition =>
  clonePosition(n.positionAbsolute ?? n.position);

const resolveAbsWithFrames = (
  n: Node,
  framesById: Map<string, Node>,
  visited: Set<string> = new Set(),
): XYPosition => {
  if (n.positionAbsolute) {
    return clonePosition(n.positionAbsolute);
  }

  const base = clonePosition(n.position);
  const parentId = (n as any).parentId as string | undefined;
  if (!parentId) {
    return base;
  }

  if (visited.has(parentId)) {
    return base;
  }

  const parent = framesById.get(parentId);
  if (!parent) {
    return base;
  }

  visited.add(parentId);
  const parentAbs = resolveAbsWithFrames(parent, framesById, visited);
  visited.delete(parentId);

  return {
    x: parentAbs.x + base.x,
    y: parentAbs.y + base.y,
  };
};

export const getAbsolutePosition = (
  node: Node,
  framesById?: Map<string, Node>,
): XYPosition => {
  if (!framesById || framesById.size === 0) {
    return getAbs(node);
  }
  return resolveAbsWithFrames(node, framesById);
};

const containsWithMargin = (
  f: Node,
  p: { x: number; y: number },
  framesById?: Map<string, Node>,
) => {
  const fa = getAbsolutePosition(f, framesById);
  const fw = (f.width ?? 0) + ATTACH_MARGIN * 2;
  const fh = (f.height ?? 0) + ATTACH_MARGIN * 2;
  const fx = fa.x - ATTACH_MARGIN;
  const fy = fa.y - ATTACH_MARGIN;
  return p.x >= fx && p.x <= fx + fw && p.y >= fy && p.y <= fy + fh;
};

const overlapRatio = (
  n: Node,
  f: Node,
  framesById?: Map<string, Node>,
): number => {
  const na = getAbsolutePosition(n, framesById);
  const fa = getAbsolutePosition(f, framesById);
  const nx1 = na.x;
  const ny1 = na.y;
  const nx2 = na.x + (n.width ?? 0);
  const ny2 = na.y + (n.height ?? 0);
  const fx1 = fa.x;
  const fy1 = fa.y;
  const fx2 = fa.x + (f.width ?? 0);
  const fy2 = fa.y + (f.height ?? 0);
  const ix = Math.max(0, Math.min(nx2, fx2) - Math.max(nx1, fx1));
  const iy = Math.max(0, Math.min(ny2, fy2) - Math.max(ny1, fy1));
  const inter = ix * iy;
  const nArea = Math.max(1, (n.width ?? 0) * (n.height ?? 0));
  return inter / nArea;
};

export const toLocal = (
  nodeAbsPosition: XYPosition,
  parentAbsPosition: XYPosition,
): XYPosition => {
  return { x: nodeAbsPosition.x - parentAbsPosition.x, y: nodeAbsPosition.y - parentAbsPosition.y };
};

/**
 * Pick the top-most frame that contains the node center or overlaps it enough.
 * Assumes no nested frames.
 */
export const pickContainingFrame = (node: Node, frames: Node[]) => {
  if (frames.length === 0) {
    return null;
  }

  const framesById = new Map(frames.map((frame) => [frame.id, frame]));

  const na = getAbsolutePosition(node, framesById);
  const center = {
    x: na.x + (node.width ?? 0) / 2,
    y: na.y + (node.height ?? 0) / 2,
  };

  let best: Node | null = null;
  let bestZ = -Infinity;

  for (const f of frames) {
    if ((f.width ?? 0) <= 0 || (f.height ?? 0) <= 0) continue;
    const inside = containsWithMargin(f, center, framesById);
    const overlap = overlapRatio(node, f, framesById);
    if (inside || overlap >= OVERLAP_MIN) {
      const z = (f as any).zIndex ?? 0;
      if (z >= bestZ) {
        bestZ = z;
        best = f;
      }
    }
  }
  return best;
};

/**
 * Attach a *newly created* node to a frame if it was created inside a frame.
 * Returns the same node if no frame matched, or if it's a frame/has a parent already.
 * (Position is assumed absolute on creation.)
 */
export function attachToFrameOnCreate(newNode: Node, allNodes: Node[]): Node {
  if (isFrameNode(newNode) || (newNode as any).parentId) return newNode;

  const frames = allNodes.filter(isFrameNode);
  if (frames.length === 0) return newNode;

  const target = pickContainingFrame(newNode, frames);
  if (!target) return newNode;

  const framesById = new Map(frames.map((frame) => [frame.id, frame]));
  const absPos = getAbsolutePosition(newNode, framesById);
  const local = toLocal(absPos, target, framesById);

  return {
    ...newNode,
    position: local,
    parentId: target.id,
    extent: "parent",
    // zIndex left for your normalize pass
  };
}

/**
 * Batch version, useful if you add several nodes at once.
 */
export function attachManyOnCreate(
  newNodes: Node[],
  allNodes: Node[],
): Node[] {
  if (!newNodes.length) return newNodes;
  const frames = allNodes.filter(isFrameNode);
  if (frames.length === 0) return newNodes;

  const framesById = new Map(frames.map((frame) => [frame.id, frame]));

  return newNodes.map((n) =>
    isFrameNode(n) || (n as any).parentId
      ? n
      : ((): Node => {
          const target = pickContainingFrame(n, frames);
          if (!target) return n;
          const local = toLocal(
            getAbsolutePosition(n, framesById),
            target,
            framesById,
          );
          return { ...n, position: local, parentId: target.id, extent: "parent" };
        })(),
  );
}
