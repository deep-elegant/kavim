import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { Edge, Node } from '@xyflow/react';
import * as Y from 'yjs';
import type { EditableEdgeData } from '../edges/EditableEdge';
import { useCanvasDoc } from './useCanvasDoc';
import { useCanvasNodes } from './useCanvasNodes';
import { useCanvasEdges } from './useCanvasEdges';
import { useStatsForNerds } from '../../diagnostics/StatsForNerdsContext';

/** Main API surface for canvas state management with Yjs synchronization */
export type CanvasDataContextValue = {
  nodes: Node[];
  edges: Edge<EditableEdgeData>[];
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEdges: Dispatch<SetStateAction<Edge<EditableEdgeData>[]>>;
  getNodes: () => Node[];
  getEdges: () => Edge<EditableEdgeData>[];
  setCanvasState: (nodes: Node[], edges: Edge<EditableEdgeData>[]) => void;
  doc: Y.Doc;
};

/**
 * Orchestrates Yjs-backed canvas state with nodes and edges.
 * - Provides React state hooks (nodes/edges) synced to a Yjs document.
 * - setCanvasState replaces entire graph atomically in one transaction.
 * - Accepts optional Yjs doc for external ownership (e.g., collaboration provider).
 */
export const useCanvasDataState = (doc?: Y.Doc): CanvasDataContextValue => {
  const { canvasDoc, nodeOrder, nodesMap, edgeOrder, edgesMap } = useCanvasDoc(doc);
  const { recordSetNodesInvocation } = useStatsForNerds();

  const { nodes, setNodes: setNodesInternal, getNodes, updateLocalNodesState, replaceNodesInDoc } =
    useCanvasNodes({
      canvasDoc,
      nodeOrder,
      nodesMap,
    });
  const { edges, setEdges, getEdges, updateLocalEdgesState, replaceEdgesInDoc } =
    useCanvasEdges({
      canvasDoc,
      edgeOrder,
      edgesMap,
    });

  const setNodes: Dispatch<SetStateAction<Node[]>> = useCallback(
    (value) => {
      recordSetNodesInvocation();
      setNodesInternal(value);
    },
    [recordSetNodesInvocation, setNodesInternal],
  );

  // Replace entire graph in one transaction for atomic updates
  const setCanvasState = useCallback(
    (nextNodes: Node[], nextEdges: Edge<EditableEdgeData>[]) => {
      updateLocalNodesState(nextNodes);
      updateLocalEdgesState(nextEdges);

      // Single transaction ensures collaborators see consistent snapshot
      canvasDoc.transact(() => {
        replaceNodesInDoc(nextNodes);
        replaceEdgesInDoc(nextEdges);
      }, 'canvas');
    },
    [
      canvasDoc,
      replaceEdgesInDoc,
      replaceNodesInDoc,
      updateLocalEdgesState,
      updateLocalNodesState,
    ],
  );

  return useMemo(
    () => ({
      nodes,
      edges,
      setNodes,
      setEdges,
      getNodes,
      getEdges,
      setCanvasState,
      doc: canvasDoc,
    }),
    [canvasDoc, edges, getEdges, getNodes, nodes, setCanvasState, setEdges, setNodes],
  );
};
