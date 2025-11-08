import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { Node } from "@xyflow/react";
import type * as Y from "yjs";
import { arraysShallowEqual } from "./arrayUtils";
import {
  TRANSIENT_NODE_DATA_KEYS,
  restoreTransientNodeState,
  sanitizeNodeForSync,
} from "./nodeSync";

type NodeDataRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is NodeDataRecord =>
  !!value && typeof value === "object";

const hasTransientEditingFlag = (data: Node["data"]): boolean => {
  if (!isRecord(data)) return false;
  const record = data as NodeDataRecord;
  for (const key of TRANSIENT_NODE_DATA_KEYS) {
    if (record[key]) return true;
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
      } as Node["data"])
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
  // ---------- Canonical + local state refs ----------
  const nodeIndexRef = useRef<Map<string, number>>(new Map());
  const nodeSerializationRef = useRef<Map<string, string>>(new Map());
  const nodesRef = useRef<Node[]>([]);
  const listenersRef = useRef(new Set<() => void>());
  const shouldSyncFromDocRef = useRef(true);

  // ---------- rAF batching state ----------
  const emitScheduledRef = useRef(false);
  const rebuildScheduledRef = useRef(false);

  const raf =
    typeof window !== "undefined" && "requestAnimationFrame" in window
      ? window.requestAnimationFrame.bind(window)
      : (cb: FrameRequestCallback) =>
          setTimeout(() => cb(performance.now()), 16) as unknown as number;

  const compareArrays = useCallback(
    <T,>(a: readonly T[], b: readonly T[]) => arraysShallowEqual(a, b),
    [],
  );

  // ---------- Core emit (unchanged) ----------
  const emit = useCallback(() => {
    listenersRef.current.forEach((listener) => listener());
  }, []);

  // ---------- rAF-coalesced emit ----------
  const scheduleEmit = useCallback(() => {
    if (emitScheduledRef.current) return;
    emitScheduledRef.current = true;
    raf(() => {
      emitScheduledRef.current = false;
      emit();
    });
  }, [emit, raf]);

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
      }, "canvas");
    }

    const indexMap = new Map<string, number>();
    const nextNodes: Node[] = [];
    const previousSerialization = nodeSerializationRef.current;
    const nextSerialization = new Map<string, string>();
    const previousNodesById = new Map(
      nodesRef.current.map((node) => [node.id, node]),
    );

    dedupedOrder.forEach((id) => {
      const node = nodesMap.get(id);
      if (!node) return;

      const index = nextNodes.length;
      const previousNode = previousNodesById.get(id);
      const nodeForSnapshot = mergeNodeWhileActiveEdit(node, previousNode);

      const restoredNode = restoreTransientNodeState(
        nodeForSnapshot,
        previousNode,
      );
      nextNodes.push(restoredNode);
      indexMap.set(id, index);

      const serializedDocNode = JSON.stringify(node);
      const existingSerialization = previousSerialization.get(id);
      if (
        existingSerialization !== undefined &&
        existingSerialization === serializedDocNode
      ) {
        nextSerialization.set(id, existingSerialization);
        return;
      }

      nextSerialization.set(id, serializedDocNode);
    });

    nodeIndexRef.current = indexMap;
    nodeSerializationRef.current = nextSerialization;
    nodesRef.current = nextNodes;
    return nextNodes;
  }, [
    canvasDoc,
    mergeNodeWhileActiveEdit,
    nodeOrder,
    nodesMap,
    restoreTransientNodeState,
  ]);

  // ---------- rAF-coalesced rebuild from doc + emit ----------
  const scheduleRebuildFromDoc = useCallback(() => {
    if (rebuildScheduledRef.current) return;
    rebuildScheduledRef.current = true;
    raf(() => {
      rebuildScheduledRef.current = false;
      const previous = nodesRef.current;
      const snapshot = snapshotNodesFromDoc();
      shouldSyncFromDocRef.current = false;
      if (!compareArrays(previous, snapshot)) {
        scheduleEmit();
      }
    });
  }, [raf, snapshotNodesFromDoc, compareArrays, scheduleEmit]);

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
        // rAF: coalesce local emits (e.g., many position changes per drag)
        scheduleEmit();
      }
    },
    [compareArrays, scheduleEmit],
  );

  // ---------- subscribe/getSnapshot ----------
  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const getSnapshot = useCallback(() => {
    if (shouldSyncFromDocRef.current) {
      const snapshot = snapshotNodesFromDoc();
      shouldSyncFromDocRef.current = false;
      return snapshot;
    }
    return nodesRef.current;
  }, [snapshotNodesFromDoc]);

  const nodes = useSyncExternalStore(subscribe, getSnapshot);

  // ---------- Initial bootstrap from doc (batched) ----------
  useEffect(() => {
    shouldSyncFromDocRef.current = false;
    scheduleRebuildFromDoc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Yjs observers (batched) ----------
  useEffect(() => {
    const handleNodeOrderChange = (event: Y.YArrayEvent<string>) => {
      if (event.transaction?.origin === "canvas") return; // skip our own writes
      scheduleRebuildFromDoc();
    };

    const handleNodesMapChange = (event: Y.YMapEvent<Node>) => {
      if (event.transaction?.origin === "canvas") return; // skip our own writes
      if (event.keysChanged.size === 0) return;

      // keep serialization cache clean for removed keys
      event.keysChanged.forEach((key) => {
        if (!nodesMap.has(key)) nodeSerializationRef.current.delete(key);
      });

      scheduleRebuildFromDoc();
    };

    nodeOrder.observe(handleNodeOrderChange);
    nodesMap.observe(handleNodesMapChange);
    return () => {
      nodeOrder.unobserve(handleNodeOrderChange);
      nodesMap.unobserve(handleNodesMapChange);
    };
  }, [nodesMap, nodeOrder, scheduleRebuildFromDoc]);

  /**
   * ReactFlow-compatible setter for nodes.
   * - Updates local state optimistically (rAF-batched emit).
   * - Writes sanitized changes to Yjs in a transaction.
   * - Uses serialization cache to skip unchanged nodes.
   */
  const setNodes = useCallback<Dispatch<SetStateAction<Node[]>>>(
    (updater) => {
      const current = nodesRef.current;
      const currentIndex = nodeIndexRef.current;
      const next =
        typeof updater === "function"
          ? (updater as (prevState: Node[]) => Node[])(current)
          : updater;

      if (!Array.isArray(next)) return;

      // Optimistic local update (rAF emit)
      updateLocalNodesState(next);

      const nextIds = next.map((node) => node.id);
      const { dedupedIds: dedupedNextIds } = dedupeNodeIds(nextIds);

      const currentIds = current.map((node) => node.id);
      const orderChanged = !compareArrays(currentIds, dedupedNextIds);
      const nextIdSet = new Set(dedupedNextIds);
      const removedIds: string[] = [];

      currentIds.forEach((id) => {
        if (!nextIdSet.has(id)) removedIds.push(id);
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

        const serialized = JSON.stringify(sanitized);
        if (previousSerialization === serialized) return;

        sanitizedUpdates.set(node.id, sanitized);
        serializedUpdates.set(node.id, serialized);
      });

      // Single Yjs transaction; our observers are rAF-batched anyway
      canvasDoc.transact(() => {
        if (orderChanged) {
          nodeOrder.delete(0, nodeOrder.length);
          if (dedupedNextIds.length > 0) nodeOrder.insert(0, dedupedNextIds);
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
      }, "canvas");
    },
    [
      canvasDoc,
      compareArrays,
      nodeOrder,
      nodesMap,
      sanitizeNodeForSync,
      updateLocalNodesState,
    ],
  );

  // Ref-based getter to avoid stale closures in callbacks
  const getNodes = useCallback(() => nodesRef.current, []);

  /**
   * Replaces entire node set in Yjs document (used for bulk operations like load/restore).
   * Clears and rebuilds both order array and map, resetting serialization cache.
   */
  const replaceNodesInDoc = useCallback(
    (nextNodes: Node[]) => {
      nodeOrder.delete(0, nodeOrder.length);
      nodesMap.clear();

      const sanitized = nextNodes.map((n) => sanitizeNodeForSync(n));
      nodeSerializationRef.current.clear();

      if (sanitized.length > 0) {
        const ids = sanitized.map((n) => n.id);
        nodeOrder.insert(0, ids);
        sanitized.forEach((n) => {
          nodesMap.set(n.id, n);
          nodeSerializationRef.current.set(n.id, JSON.stringify(n));
        });
      }
      // Let the observer rebuild + emit in the next frame
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
