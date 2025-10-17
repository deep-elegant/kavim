import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import * as Y from 'yjs';
import type { Edge, Node } from '@xyflow/react';
import type { EditableEdgeData } from './edges/EditableEdge';

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

const CanvasDataContext = createContext<CanvasDataContextValue | undefined>(undefined);

export const CanvasDataProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const doc = useMemo(() => new Y.Doc(), []);
  const nodesMap = useMemo(() => doc.getMap<Node>('nodes'), [doc]);
  const nodeOrder = useMemo(() => doc.getArray<string>('node-order'), [doc]);
  const edgesMap = useMemo(
    () => doc.getMap<Edge<EditableEdgeData>>('edges'),
    [doc],
  );
  const edgeOrder = useMemo(
    () => doc.getArray<string>('edge-order'),
    [doc],
  );

  const nodeIndexRef = useRef<Map<string, number>>(new Map());
  const edgeIndexRef = useRef<Map<string, number>>(new Map());
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge<EditableEdgeData>[]>([]);

  const computeNodesFromDoc = useCallback(() => {
    const order = nodeOrder.toArray();
    const indexMap = new Map<string, number>();
    const nextNodes: Node[] = [];

    order.forEach((id, index) => {
      indexMap.set(id, index);
      const node = nodesMap.get(id);
      if (node) {
        nextNodes.push(node);
      }
    });

    nodeIndexRef.current = indexMap;
    nodesRef.current = nextNodes;
    return nextNodes;
  }, [nodeOrder, nodesMap]);

  const computeEdgesFromDoc = useCallback(() => {
    const order = edgeOrder.toArray();
    const indexMap = new Map<string, number>();
    const nextEdges: Edge<EditableEdgeData>[] = [];

    order.forEach((id, index) => {
      indexMap.set(id, index);
      const edge = edgesMap.get(id);
      if (edge) {
        nextEdges.push(edge);
      }
    });

    edgeIndexRef.current = indexMap;
    edgesRef.current = nextEdges;
    return nextEdges;
  }, [edgeOrder, edgesMap]);

  const [nodes, setNodesState] = useState<Node[]>(() => computeNodesFromDoc());
  const [edges, setEdgesState] = useState<Edge<EditableEdgeData>[]>(() =>
    computeEdgesFromDoc(),
  );

  useEffect(() => () => doc.destroy(), [doc]);

  useEffect(() => {
    const handleNodeOrderChange = () => {
      setNodesState(computeNodesFromDoc());
    };

    const handleNodesMapChange = (event: Y.YMapEvent<Node>) => {
      if (event.keysChanged.size === 0) {
        return;
      }

      setNodesState((current) => {
        let next: Node[] | undefined;

        event.keysChanged.forEach((key) => {
          const index = nodeIndexRef.current.get(key);
          if (index === undefined) {
            return;
          }
          const value = nodesMap.get(key);
          if (!value) {
            return;
          }
          if (!next) {
            next = [...current];
          }
          next[index] = value;
        });

        if (!next) {
          return current;
        }

        nodesRef.current = next;
        return next;
      });
    };

    const handleEdgeOrderChange = () => {
      setEdgesState(computeEdgesFromDoc());
    };

    const handleEdgesMapChange = (event: Y.YMapEvent<Edge<EditableEdgeData>>) => {
      if (event.keysChanged.size === 0) {
        return;
      }

      setEdgesState((current) => {
        let next: Edge<EditableEdgeData>[] | undefined;

        event.keysChanged.forEach((key) => {
          const index = edgeIndexRef.current.get(key);
          if (index === undefined) {
            return;
          }
          const value = edgesMap.get(key);
          if (!value) {
            return;
          }
          if (!next) {
            next = [...current];
          }
          next[index] = value;
        });

        if (!next) {
          return current;
        }

        edgesRef.current = next;
        return next;
      });
    };

    nodeOrder.observe(handleNodeOrderChange);
    nodesMap.observe(handleNodesMapChange);
    edgeOrder.observe(handleEdgeOrderChange);
    edgesMap.observe(handleEdgesMapChange);

    return () => {
      nodeOrder.unobserve(handleNodeOrderChange);
      nodesMap.unobserve(handleNodesMapChange);
      edgeOrder.unobserve(handleEdgeOrderChange);
      edgesMap.unobserve(handleEdgesMapChange);
    };
  }, [computeEdgesFromDoc, computeNodesFromDoc, edgeOrder, edgesMap, nodeOrder, nodesMap]);

  const setNodes = useCallback<Dispatch<SetStateAction<Node[]>>>(
    (updater) => {
      doc.transact(() => {
        const current = nodesRef.current;
        const next =
          typeof updater === 'function'
            ? (updater as (prevState: Node[]) => Node[])(current)
            : updater;

        if (!Array.isArray(next)) {
          return;
        }

        const nextIds = next.map((node) => node.id);
        const currentOrder = nodesRef.current.map((node) => node.id);
        const orderChanged =
          nextIds.length !== currentOrder.length ||
          nextIds.some((id, index) => currentOrder[index] !== id);

        if (orderChanged) {
          nodeOrder.delete(0, nodeOrder.length);
          if (nextIds.length > 0) {
            nodeOrder.insert(0, nextIds);
          }
        }

        const previousById = new Map(current.map((node) => [node.id, node]));
        const nextIdSet = new Set(nextIds);

        Array.from(nodesMap.keys()).forEach((id) => {
          if (!nextIdSet.has(id)) {
            nodesMap.delete(id);
          }
        });

        next.forEach((node) => {
          if (previousById.get(node.id) !== node) {
            nodesMap.set(node.id, node);
          }
        });
      });
    },
    [doc, nodeOrder, nodesMap],
  );

  const setEdges = useCallback<Dispatch<SetStateAction<Edge<EditableEdgeData>[]>>>(
    (updater) => {
      doc.transact(() => {
        const current = edgesRef.current;
        const next =
          typeof updater === 'function'
            ? (updater as (prevState: Edge<EditableEdgeData>[]) => Edge<EditableEdgeData>[])(
                current,
              )
            : updater;

        if (!Array.isArray(next)) {
          return;
        }

        const nextIds = next.map((edge) => edge.id);
        const currentOrder = edgesRef.current.map((edge) => edge.id);
        const orderChanged =
          nextIds.length !== currentOrder.length ||
          nextIds.some((id, index) => currentOrder[index] !== id);

        if (orderChanged) {
          edgeOrder.delete(0, edgeOrder.length);
          if (nextIds.length > 0) {
            edgeOrder.insert(0, nextIds);
          }
        }

        const previousById = new Map(current.map((edge) => [edge.id, edge]));
        const nextIdSet = new Set(nextIds);

        Array.from(edgesMap.keys()).forEach((id) => {
          if (!nextIdSet.has(id)) {
            edgesMap.delete(id);
          }
        });

        next.forEach((edge) => {
          if (previousById.get(edge.id) !== edge) {
            edgesMap.set(edge.id, edge);
          }
        });
      });
    },
    [doc, edgeOrder, edgesMap],
  );

  const setCanvasState = useCallback(
    (nextNodes: Node[], nextEdges: Edge<EditableEdgeData>[]) => {
      doc.transact(() => {
        nodeOrder.delete(0, nodeOrder.length);
        nodesMap.clear();
        edgeOrder.delete(0, edgeOrder.length);
        edgesMap.clear();

        if (nextNodes.length > 0) {
          const nodeIds = nextNodes.map((node) => node.id);
          nodeOrder.insert(0, nodeIds);
          nextNodes.forEach((node) => {
            nodesMap.set(node.id, node);
          });
        }

        if (nextEdges.length > 0) {
          const edgeIds = nextEdges.map((edge) => edge.id);
          edgeOrder.insert(0, edgeIds);
          nextEdges.forEach((edge) => {
            edgesMap.set(edge.id, edge);
          });
        }
      });
    },
    [doc, edgeOrder, edgesMap, nodeOrder, nodesMap],
  );

  const getNodes = useCallback(() => nodesRef.current, []);
  const getEdges = useCallback(() => edgesRef.current, []);

  const value = useMemo(
    () => ({
      nodes,
      edges,
      setNodes,
      setEdges,
      getNodes,
      getEdges,
      setCanvasState,
      doc,
    }),
    [doc, edges, getEdges, getNodes, nodes, setCanvasState, setEdges, setNodes],
  );

  return (
    <CanvasDataContext.Provider value={value}>
      {children}
    </CanvasDataContext.Provider>
  );
};

export const useCanvasData = () => {
  const context = useContext(CanvasDataContext);
  if (!context) {
    throw new Error('useCanvasData must be used within a CanvasDataProvider');
  }
  return context;
};
