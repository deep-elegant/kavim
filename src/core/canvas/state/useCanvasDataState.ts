import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { Edge, Node } from '@xyflow/react';
import * as Y from 'yjs';
import type { EditableEdgeData } from '../edges/EditableEdge';
import { useCanvasDoc } from './useCanvasDoc';
import { useCanvasNodes } from './useCanvasNodes';
import { useCanvasEdges } from './useCanvasEdges';

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

export const useCanvasDataState = (doc?: Y.Doc): CanvasDataContextValue => {
  const { canvasDoc, nodeOrder, nodesMap, edgeOrder, edgesMap } = useCanvasDoc(doc);
  const { nodes, setNodes, getNodes, updateLocalNodesState, replaceNodesInDoc } =
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

  const setCanvasState = useCallback(
    (nextNodes: Node[], nextEdges: Edge<EditableEdgeData>[]) => {
      updateLocalNodesState(nextNodes);
      updateLocalEdgesState(nextEdges);

      // Replace the entire graph in a single transaction so collaborators see a
      // consistent snapshot of nodes and edges.
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
