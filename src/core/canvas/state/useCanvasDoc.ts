import { useEffect, useMemo } from 'react';
import * as Y from 'yjs';
import type { Edge, Node } from '@xyflow/react';
import type { EditableEdgeData } from '../edges/EditableEdge';

/** Yjs shared types for collaborative canvas state */
export type CanvasDocHandles = {
  canvasDoc: Y.Doc;
  ownsDoc: boolean; // True if this hook created the doc (cleanup responsibility)
  nodesMap: Y.Map<Node>;
  nodeOrder: Y.Array<string>; // Preserves z-order for rendering
  edgesMap: Y.Map<Edge<EditableEdgeData>>;
  edgeOrder: Y.Array<string>;
};

/**
 * Ensures a single Yjs document instance is shared across the provider.
 * - If doc is provided externally, reuses it (e.g., for collaboration).
 * - Otherwise creates and owns a local doc, cleaning it up on unmount.
 */
export const useCanvasDoc = (doc?: Y.Doc): CanvasDocHandles => {
  const canvasDoc = useMemo(() => doc ?? new Y.Doc(), [doc]);
  const ownsDoc = doc === undefined;

  // Lazily get or create shared Yjs types (memoized per doc instance)
  const nodesMap = useMemo(() => canvasDoc.getMap<Node>('nodes'), [canvasDoc]);
  const nodeOrder = useMemo(() => canvasDoc.getArray<string>('node-order'), [canvasDoc]);
  const edgesMap = useMemo(
    () => canvasDoc.getMap<Edge<EditableEdgeData>>('edges'),
    [canvasDoc],
  );
  const edgeOrder = useMemo(
    () => canvasDoc.getArray<string>('edge-order'),
    [canvasDoc],
  );

  // Only destroy doc if we created it (not externally owned)
  useEffect(() => {
    if (!ownsDoc) {
      return;
    }

    return () => {
      canvasDoc.destroy();
    };
  }, [canvasDoc, ownsDoc]);

  return {
    canvasDoc,
    ownsDoc,
    nodesMap,
    nodeOrder,
    edgesMap,
    edgeOrder,
  };
};
