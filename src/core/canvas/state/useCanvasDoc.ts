import { useEffect, useMemo } from 'react';
import * as Y from 'yjs';
import type { Edge, Node } from '@xyflow/react';
import type { EditableEdgeData } from '../edges/EditableEdge';

export type CanvasDocHandles = {
  canvasDoc: Y.Doc;
  ownsDoc: boolean;
  nodesMap: Y.Map<Node>;
  nodeOrder: Y.Array<string>;
  edgesMap: Y.Map<Edge<EditableEdgeData>>;
  edgeOrder: Y.Array<string>;
};

/**
 * Ensures a single Yjs document instance is shared across the provider and
 * cleans it up only when the provider created it.
 */
export const useCanvasDoc = (doc?: Y.Doc): CanvasDocHandles => {
  const canvasDoc = useMemo(() => doc ?? new Y.Doc(), [doc]);
  const ownsDoc = doc === undefined;

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
