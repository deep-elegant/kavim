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

const TRANSIENT_NODE_DATA_KEYS = new Set(['isTyping', 'isEditing', 'isActive']);

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
  doc,
  children,
}: {
  doc?: Y.Doc;
  children: React.ReactNode;
}) => {
  const sanitizeNodeDataForSync = useCallback((data: Node['data']) => {
    if (!data || typeof data !== 'object') {
      return data;
    }

    let hasTransientKey = false;

    const sanitizedEntries = Object.entries(data).filter(([key]) => {
      if (TRANSIENT_NODE_DATA_KEYS.has(key)) {
        hasTransientKey = true;
        return false;
      }
      return true;
    });

    if (!hasTransientKey) {
      return data;
    }

    return Object.fromEntries(sanitizedEntries) as Node['data'];
  }, []);

  const sanitizeNodeForSync = useCallback(
    (node: Node) => {
      const sanitizedData = sanitizeNodeDataForSync(node.data);

      if (sanitizedData === node.data && node.selected === undefined) {
        return node;
      }

      const { selected: _selected, ...rest } = node;
      return {
        ...rest,
        data: sanitizedData,
      } as Node;
    },
    [sanitizeNodeDataForSync],
  );

  const canvasDoc = useMemo(() => doc ?? new Y.Doc(), [doc]);
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

  const nodeIndexRef = useRef<Map<string, number>>(new Map());
  const nodeSerializationRef = useRef<Map<string, string>>(new Map());
  const edgeIndexRef = useRef<Map<string, number>>(new Map());
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge<EditableEdgeData>[]>([]);

  const arraysShallowEqual = useCallback(<T,>(a: T[], b: T[]) => {
    if (a === b) {
      return true;
    }

    if (a.length !== b.length) {
      return false;
    }

    for (let index = 0; index < a.length; index += 1) {
      if (a[index] !== b[index]) {
        return false;
      }
    }

    return true;
  }, []);

  const snapshotNodesFromDoc = useCallback(() => {
    const order = nodeOrder.toArray();
    const indexMap = new Map<string, number>();
    const nextNodes: Node[] = [];
    const previousSerialization = nodeSerializationRef.current;
    const nextSerialization = new Map<string, string>();

    order.forEach((id) => {
      const node = nodesMap.get(id);
      if (!node) {
        return;
      }

      const index = nextNodes.length;
      nextNodes.push(node);
      indexMap.set(id, index);

      const existingSerialization = previousSerialization.get(id);
      if (existingSerialization !== undefined) {
        nextSerialization.set(id, existingSerialization);
        return;
      }

      nextSerialization.set(id, JSON.stringify(node));
    });

    nodeIndexRef.current = indexMap;
    nodeSerializationRef.current = nextSerialization;
    nodesRef.current = nextNodes;
    return nextNodes;
  }, [nodeOrder, nodesMap]);

  const snapshotEdgesFromDoc = useCallback(() => {
    const order = edgeOrder.toArray();
    const indexMap = new Map<string, number>();
    const nextEdges: Edge<EditableEdgeData>[] = [];

    order.forEach((id) => {
      const edge = edgesMap.get(id);
      if (!edge) {
        return;
      }

      const index = nextEdges.length;
      nextEdges.push(edge);
      indexMap.set(id, index);
    });

    edgeIndexRef.current = indexMap;
    edgesRef.current = nextEdges;
    return nextEdges;
  }, [edgeOrder, edgesMap]);

  const [nodes, setNodesState] = useState<Node[]>(() => snapshotNodesFromDoc());
  const [edges, setEdgesState] = useState<Edge<EditableEdgeData>[]>(() =>
    snapshotEdgesFromDoc(),
  );

  const updateLocalNodesState = useCallback(
    (nextNodes: Node[]) => {
      const indexMap = new Map<string, number>();
      nextNodes.forEach((node, index) => {
        indexMap.set(node.id, index);
      });

      nodeIndexRef.current = indexMap;
      nodesRef.current = nextNodes;
      setNodesState((current) => (arraysShallowEqual(current, nextNodes) ? current : nextNodes));
    },
    [arraysShallowEqual],
  );

  const updateLocalEdgesState = useCallback(
    (nextEdges: Edge<EditableEdgeData>[]) => {
      const indexMap = new Map<string, number>();
      nextEdges.forEach((edge, index) => {
        indexMap.set(edge.id, index);
      });

      edgeIndexRef.current = indexMap;
      edgesRef.current = nextEdges;
      setEdgesState((current) => (arraysShallowEqual(current, nextEdges) ? current : nextEdges));
    },
    [arraysShallowEqual],
  );

  const ownsDoc = doc === undefined;

  useEffect(() => {
    if (!ownsDoc) {
      return;
    }

    return () => {
      canvasDoc.destroy();
    };
  }, [canvasDoc, ownsDoc]);

  useEffect(() => {
    const handleNodeOrderChange = (event: Y.YArrayEvent<string>) => {
      if (event.transaction?.origin === 'canvas') {
        return;
      }

      const snapshot = snapshotNodesFromDoc();
      setNodesState((current) =>
        arraysShallowEqual(current, snapshot) ? current : snapshot,
      );
    };

    const handleNodesMapChange = (event: Y.YMapEvent<Node>) => {
      if (event.transaction?.origin === 'canvas') {
        return;
      }

      if (event.keysChanged.size === 0) {
        return;
      }

      setNodesState((current) => {
        let next: Node[] | undefined;
        let changed = false;

        event.keysChanged.forEach((key) => {
          const index = nodeIndexRef.current.get(key);
          if (index === undefined) {
            return;
          }
          const value = nodesMap.get(key);
          if (!value) {
            nodeSerializationRef.current.delete(key);
            return;
          }
          if (!next) {
            next = [...current];
          }
          if (next[index] !== value) {
            next[index] = value;
            changed = true;
          }

          nodeSerializationRef.current.set(key, JSON.stringify(value));
        });

        if (!next || !changed) {
          return current;
        }

        nodesRef.current = next;
        return next;
      });
    };

    const handleEdgeOrderChange = (event: Y.YArrayEvent<string>) => {
      if (event.transaction?.origin === 'canvas') {
        return;
      }

      const snapshot = snapshotEdgesFromDoc();
      setEdgesState((current) =>
        arraysShallowEqual(current, snapshot) ? current : snapshot,
      );
    };

    const handleEdgesMapChange = (event: Y.YMapEvent<Edge<EditableEdgeData>>) => {
      if (event.transaction?.origin === 'canvas') {
        return;
      }

      if (event.keysChanged.size === 0) {
        return;
      }

      setEdgesState((current) => {
        let next: Edge<EditableEdgeData>[] | undefined;
        let changed = false;

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
          if (next[index] !== value) {
            next[index] = value;
            changed = true;
          }
        });

        if (!next || !changed) {
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
  }, [arraysShallowEqual, edgeOrder, edgesMap, nodeOrder, nodesMap, snapshotEdgesFromDoc, snapshotNodesFromDoc]);

  const setNodes = useCallback<Dispatch<SetStateAction<Node[]>>>(
    (updater) => {
      const current = nodesRef.current;
      const currentIndex = nodeIndexRef.current;
      const next =
        typeof updater === 'function'
          ? (updater as (prevState: Node[]) => Node[])(current)
          : updater;

      if (!Array.isArray(next)) {
        return;
      }

      updateLocalNodesState(next);

      const nextIds = next.map((node) => node.id);
      const currentIds = current.map((node) => node.id);
      const orderChanged = !arraysShallowEqual(currentIds, nextIds);
      const nextIdSet = new Set(nextIds);
      const removedIds: string[] = [];

      currentIds.forEach((id) => {
        if (!nextIdSet.has(id)) {
          removedIds.push(id);
        }
      });

      const sanitizedUpdates = new Map<string, Node>();
      const serializedUpdates = new Map<string, string>();

      next.forEach((node) => {
        const sanitized = sanitizeNodeForSync(node);
        const previousIndex = currentIndex.get(node.id);

        if (previousIndex === undefined) {
          sanitizedUpdates.set(node.id, sanitized);
          serializedUpdates.set(node.id, JSON.stringify(sanitized));
          return;
        }

        const previousSerialization = nodeSerializationRef.current.get(node.id);
        const previousNode = current[previousIndex];

        if (previousNode === node) {
          if (previousSerialization === undefined) {
            serializedUpdates.set(node.id, JSON.stringify(sanitized));
          }
          return;
        }

        const storedNode = nodesMap.get(node.id);
        if (storedNode === sanitized) {
          if (previousSerialization === undefined) {
            serializedUpdates.set(node.id, JSON.stringify(sanitized));
          }
          return;
        }

        const serialized = JSON.stringify(sanitized);
        if (previousSerialization === serialized) {
          return;
        }

        sanitizedUpdates.set(node.id, sanitized);
        serializedUpdates.set(node.id, serialized);
      });

      if (!orderChanged && removedIds.length === 0 && sanitizedUpdates.size === 0) {
        if (serializedUpdates.size > 0) {
          serializedUpdates.forEach((serialized, id) => {
            nodeSerializationRef.current.set(id, serialized);
          });
        }
        return;
      }

      canvasDoc.transact(() => {
        if (orderChanged) {
          nodeOrder.delete(0, nodeOrder.length);
          if (nextIds.length > 0) {
            nodeOrder.insert(0, nextIds);
          }
        }

        removedIds.forEach((id) => {
          nodesMap.delete(id);
        });

        sanitizedUpdates.forEach((node, id) => {
          nodesMap.set(id, node);
        });
      }, 'canvas');

      if (removedIds.length > 0) {
        removedIds.forEach((id) => {
          nodeSerializationRef.current.delete(id);
        });
      }

      if (serializedUpdates.size > 0) {
        serializedUpdates.forEach((serialized, id) => {
          nodeSerializationRef.current.set(id, serialized);
        });
      }
    },
    [
      arraysShallowEqual,
      canvasDoc,
      nodeOrder,
      nodesMap,
      sanitizeNodeForSync,
      updateLocalNodesState,
    ],
  );

  const setEdges = useCallback<Dispatch<SetStateAction<Edge<EditableEdgeData>[]>>>(
    (updater) => {
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

      updateLocalEdgesState(next);

      canvasDoc.transact(() => {
        const nextIds = next.map((edge) => edge.id);
        const currentOrder = current.map((edge) => edge.id);
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
      }, 'canvas');
    },
    [canvasDoc, edgeOrder, edgesMap, updateLocalEdgesState],
  );

  const setCanvasState = useCallback(
    (nextNodes: Node[], nextEdges: Edge<EditableEdgeData>[]) => {
      updateLocalNodesState(nextNodes);
      updateLocalEdgesState(nextEdges);

      canvasDoc.transact(() => {
        nodeOrder.delete(0, nodeOrder.length);
        nodesMap.clear();
        edgeOrder.delete(0, edgeOrder.length);
        edgesMap.clear();

        const sanitizedNodes = nextNodes.map((node) => sanitizeNodeForSync(node));
        nodeSerializationRef.current.clear();

        if (sanitizedNodes.length > 0) {
          const nodeIds = sanitizedNodes.map((node) => node.id);
          nodeOrder.insert(0, nodeIds);
          sanitizedNodes.forEach((node) => {
            nodesMap.set(node.id, node);
            nodeSerializationRef.current.set(node.id, JSON.stringify(node));
          });
        }

        if (nextEdges.length > 0) {
          const edgeIds = nextEdges.map((edge) => edge.id);
          edgeOrder.insert(0, edgeIds);
          nextEdges.forEach((edge) => {
            edgesMap.set(edge.id, edge);
          });
        }
      }, 'canvas');
    },
    [
      canvasDoc,
      edgeOrder,
      edgesMap,
      nodeOrder,
      nodesMap,
      sanitizeNodeForSync,
      updateLocalEdgesState,
      updateLocalNodesState,
    ],
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
      doc: canvasDoc,
    }),
    [canvasDoc, edges, getEdges, getNodes, nodes, setCanvasState, setEdges, setNodes],
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
