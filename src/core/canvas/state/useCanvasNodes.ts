import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { Node } from '@xyflow/react';
import type * as Y from 'yjs';
import { arraysShallowEqual } from './arrayUtils';
import {
  TRANSIENT_NODE_DATA_KEYS,
  restoreTransientNodeState,
  sanitizeNodeForSync,
} from './nodeSync';

type NodeDataRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is NodeDataRecord =>
  !!value && typeof value === 'object';

const hasTransientEditingFlag = (data: Node['data']): boolean => {
  if (!isRecord(data)) {
    return false;
  }

  const record = data as NodeDataRecord;

  for (const key of TRANSIENT_NODE_DATA_KEYS) {
    if (record[key]) {
      return true;
    }
  }

  return false;
};

const dedupeNodeIds = (ids: string[]) => {
  const seenIds = new Set<string>();
  const dedupedIds: string[] = [];
  let duplicateFound = false;

  ids.forEach((id) => {
    if (seenIds.has(id)) {
      duplicateFound = true;
      return;
    }

    seenIds.add(id);
    dedupedIds.push(id);
  });

  return { dedupedIds, duplicateFound };
};

const mergeNodeWhileActiveEdit = (docNode: Node, previousNode?: Node): Node => {
  if (!previousNode || !hasTransientEditingFlag(previousNode.data)) {
    return docNode;
  }

  const docData = docNode.data;
  const previousData = previousNode.data;

  const mergedData = isRecord(docData)
    ? ({
        ...(docData as NodeDataRecord),
        ...(previousData as NodeDataRecord),
      } as Node['data'])
    : previousData;

  return {
    ...docNode,
    data: mergedData,
    width: previousNode.width,
    height: previousNode.height,
    style: previousNode.style,
    measured: previousNode.measured,
    positionAbsolute: previousNode.positionAbsolute,
    dragging: previousNode.dragging,
  } as Node;
};

/** API for managing nodes with Yjs synchronization and local state optimization */
export type CanvasNodeHandles = {
  nodes: Node[]; // React state, triggers re-renders
  setNodes: Dispatch<SetStateAction<Node[]>>; // ReactFlow-compatible setter
  getNodes: () => Node[]; // Ref-based getter for callbacks (avoids stale closures)
  updateLocalNodesState: (nextNodes: Node[]) => void; // Internal: sync refs without Yjs write
  replaceNodesInDoc: (nextNodes: Node[]) => void; // Internal: bulk replace in Yjs
};

export const useCanvasNodes = ({
  canvasDoc,
  nodeOrder,
  nodesMap,
}: {
  canvasDoc: Y.Doc;
  nodeOrder: Y.Array<string>;
  nodesMap: Y.Map<Node>;
}): CanvasNodeHandles => {
  // Tracks each node's index within the local array for fast lookup when
  // handling targeted updates from the shared document.
  const nodeIndexRef = useRef<Map<string, number>>(new Map());
  // Caches serialized node payloads so we can detect structural changes and
  // avoid rewriting identical data back to the document.
  const nodeSerializationRef = useRef<Map<string, string>>(new Map());
  // Stores the latest snapshot of nodes mirrored from the document to serve as
  // the canonical local state reference for optimistic updates.
  const nodesRef = useRef<Node[]>([]);
  const listenersRef = useRef(new Set<() => void>());
  const shouldSyncFromDocRef = useRef(true);

  const compareArrays = useCallback(arraysShallowEqual, []);

  /**
   * Reconstructs local node array from Yjs document.
   * - Restores transient UI state from previous snapshot.
   * - Reuses serialization cache to minimize JSON stringify calls.
   */
  const snapshotNodesFromDoc = useCallback(() => {
    const order = nodeOrder.toArray();
    const { dedupedIds: dedupedOrder, duplicateFound } = dedupeNodeIds(order);

    if (duplicateFound) {
      const doc = nodeOrder.doc ?? canvasDoc;
      doc?.transact(() => {
        nodeOrder.delete(0, nodeOrder.length);
        if (dedupedOrder.length > 0) {
          nodeOrder.insert(0, dedupedOrder);
        }
      }, 'canvas');
    }

    const indexMap = new Map<string, number>();
    const nextNodes: Node[] = [];
    const previousSerialization = nodeSerializationRef.current;
    const nextSerialization = new Map<string, string>();
    const previousNodesById = new Map(nodesRef.current.map((node) => [node.id, node]));

    dedupedOrder.forEach((id) => {
      const node = nodesMap.get(id);
      if (!node) {
        return;
      }

      const index = nextNodes.length;
      const previousNode = previousNodesById.get(id);
      const nodeForSnapshot = mergeNodeWhileActiveEdit(node, previousNode);

      const restoredNode = restoreTransientNodeState(nodeForSnapshot, previousNode);
      nextNodes.push(restoredNode);
      indexMap.set(id, index);

      const serializedDocNode = JSON.stringify(node);
      const existingSerialization = previousSerialization.get(id);
      if (existingSerialization !== undefined && existingSerialization === serializedDocNode) {
        nextSerialization.set(id, existingSerialization);
        return;
      }

      nextSerialization.set(id, serializedDocNode);
    });

    nodeIndexRef.current = indexMap;
    nodeSerializationRef.current = nextSerialization;
    nodesRef.current = nextNodes;
    return nextNodes;
  }, [canvasDoc, mergeNodeWhileActiveEdit, nodeOrder, nodesMap, restoreTransientNodeState]);

  const emit = useCallback(() => {
    listenersRef.current.forEach((listener) => listener());
  }, []);

  /**
   * Updates local node state and refs without writing to Yjs.
   * Used for optimistic updates before sync, or when receiving bulk replacements.
   */
  const updateLocalNodesState = useCallback(
    (nextNodes: Node[]) => {
      const indexMap = new Map<string, number>();
      nextNodes.forEach((node, index) => {
        indexMap.set(node.id, index);
      });

      nodeIndexRef.current = indexMap;

      shouldSyncFromDocRef.current = false;

      const previous = nodesRef.current;
      nodesRef.current = nextNodes;
      if (!compareArrays(previous, nextNodes)) {
        emit();
      }
    },
    [compareArrays, emit],
  );

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    shouldSyncFromDocRef.current = false;
    const previous = nodesRef.current;
    const snapshot = snapshotNodesFromDoc();
    if (!compareArrays(previous, snapshot)) {
      emit();
    }
  }, [compareArrays, emit, snapshotNodesFromDoc]);

  // Listen to Yjs events and sync to React state
  useEffect(() => {
    // Order change: full rebuild needed (nodes added/removed/reordered)
    const handleNodeOrderChange = (event: Y.YArrayEvent<string>) => {
      if (event.transaction?.origin === 'canvas') {
        return; // Skip our own writes to avoid feedback loop
      }

      const previous = nodesRef.current;
      const snapshot = snapshotNodesFromDoc();
      shouldSyncFromDocRef.current = false;
      if (!compareArrays(previous, snapshot)) {
        emit();
      }
    };

    // Map change: targeted updates for modified nodes
    const handleNodesMapChange = (event: Y.YMapEvent<Node>) => {
      if (event.transaction?.origin === 'canvas') {
        return; // Skip our own writes
      }

      if (event.keysChanged.size === 0) {
        return;
      }

      event.keysChanged.forEach((key) => {
        if (!nodesMap.has(key)) {
          nodeSerializationRef.current.delete(key);
        }
      });

      const previous = nodesRef.current;
      const snapshot = snapshotNodesFromDoc();
      shouldSyncFromDocRef.current = false;
      if (!compareArrays(previous, snapshot)) {
        emit();
      }
    };

    nodeOrder.observe(handleNodeOrderChange);
    nodesMap.observe(handleNodesMapChange);

    return () => {
      nodeOrder.unobserve(handleNodeOrderChange);
      nodesMap.unobserve(handleNodesMapChange);
    };
  }, [compareArrays, emit, nodeOrder, nodesMap, snapshotNodesFromDoc]);

  const getSnapshot = useCallback(() => {
    if (shouldSyncFromDocRef.current) {
      const snapshot = snapshotNodesFromDoc();
      shouldSyncFromDocRef.current = false;
      return snapshot;
    }

    return nodesRef.current;
  }, [snapshotNodesFromDoc]);

  const nodes = useSyncExternalStore(subscribe, getSnapshot);

  /**
   * ReactFlow-compatible setter for nodes.
   * - Updates local state optimistically.
   * - Writes sanitized changes to Yjs in a transaction.
   * - Uses serialization cache to skip unchanged nodes.
   */
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

      // Optimistically update local state first (immediate UI feedback)
      updateLocalNodesState(next);

      const nextIds = next.map((node) => node.id);
      const { dedupedIds: dedupedNextIds } = dedupeNodeIds(nextIds);

      const currentIds = current.map((node) => node.id);
      const orderChanged = !compareArrays(currentIds, dedupedNextIds);
      const nextIdSet = new Set(dedupedNextIds);
      const removedIds: string[] = [];

      // Collect IDs of deleted nodes
      currentIds.forEach((id) => {
        if (!nextIdSet.has(id)) {
          removedIds.push(id);
        }
      });

      const sanitizedUpdates = new Map<string, Node>();
      const serializedUpdates = new Map<string, string>();

      // Identify nodes that actually changed (skip identical serializations)
      next.forEach((node) => {
        const sanitized = sanitizeNodeForSync(node);
        const previousIndex = currentIndex.get(node.id);

        if (previousIndex === undefined) {
          // New node, add to updates
          sanitizedUpdates.set(node.id, sanitized);
          serializedUpdates.set(node.id, JSON.stringify(sanitized));
          return;
        }

        const previousSerialization = nodeSerializationRef.current.get(node.id);
        const previousNode = current[previousIndex];

        if (previousNode === node) {
          // Identity match (no change), but ensure serialization exists
          if (previousSerialization === undefined) {
            serializedUpdates.set(node.id, JSON.stringify(sanitized));
          }
          return;
        }

        const serialized = JSON.stringify(sanitized);
        if (previousSerialization === serialized) {
          return; // Structural match, skip write
        }

        sanitizedUpdates.set(node.id, sanitized);
        serializedUpdates.set(node.id, serialized);
      });

      // Batch all changes into one Yjs transaction
      canvasDoc.transact(() => {
        if (orderChanged) {
          nodeOrder.delete(0, nodeOrder.length);
          if (dedupedNextIds.length > 0) {
            nodeOrder.insert(0, dedupedNextIds);
          }
        }

        removedIds.forEach((id) => {
          nodesMap.delete(id);
          nodeSerializationRef.current.delete(id);
        });

        sanitizedUpdates.forEach((value, key) => {
          nodesMap.set(key, value);
        });

        serializedUpdates.forEach((value, key) => {
          nodeSerializationRef.current.set(key, value);
        });
      }, 'canvas');
    },
    [canvasDoc, compareArrays, nodeOrder, nodesMap, sanitizeNodeForSync, updateLocalNodesState],
  );

  // Ref-based getter to avoid stale closures in callbacks
  const getNodes = useCallback(() => nodesRef.current, []);

  /**
   * Replaces entire node set in Yjs document (used for bulk operations like load/restore).
   * Clears and rebuilds both order array and map, resetting serialization cache.
   */
  const replaceNodesInDoc = useCallback(
    (nextNodes: Node[]) => {
      // Completely rebuild the Yjs order/map with sanitized nodes and reset the
      // serialization cache to reflect the fresh document state.
      nodeOrder.delete(0, nodeOrder.length);
      nodesMap.clear();

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
    },
    [nodeOrder, nodesMap, sanitizeNodeForSync],
  );

  return useMemo(
    () => ({
      nodes,
      setNodes,
      getNodes,
      updateLocalNodesState,
      replaceNodesInDoc,
    }),
    [getNodes, nodes, replaceNodesInDoc, setNodes, updateLocalNodesState],
  );
};
