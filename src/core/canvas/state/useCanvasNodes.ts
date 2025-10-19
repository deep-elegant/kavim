import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { Node } from '@xyflow/react';
import type * as Y from 'yjs';
import { arraysShallowEqual } from './arrayUtils';
import { restoreTransientNodeState, sanitizeNodeForSync } from './nodeSync';

export type CanvasNodeHandles = {
  nodes: Node[];
  setNodes: Dispatch<SetStateAction<Node[]>>;
  getNodes: () => Node[];
  updateLocalNodesState: (nextNodes: Node[]) => void;
  replaceNodesInDoc: (nextNodes: Node[]) => void;
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

  const compareArrays = useCallback(arraysShallowEqual, []);

  // Recreates the local node snapshot from the shared document while restoring
  // transient UI-only fields from the previous state and reusing cached
  // serializations whenever possible to minimize JSON work.
  const snapshotNodesFromDoc = useCallback(() => {
    const order = nodeOrder.toArray();
    const indexMap = new Map<string, number>();
    const nextNodes: Node[] = [];
    const previousSerialization = nodeSerializationRef.current;
    const nextSerialization = new Map<string, string>();
    const previousNodesById = new Map(nodesRef.current.map((node) => [node.id, node]));

    order.forEach((id) => {
      const node = nodesMap.get(id);
      if (!node) {
        return;
      }

      const index = nextNodes.length;
      const restoredNode = restoreTransientNodeState(node, previousNodesById.get(id));
      nextNodes.push(restoredNode);
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
  }, [nodeOrder, nodesMap, restoreTransientNodeState]);

  const [nodes, setNodesState] = useState<Node[]>(() => snapshotNodesFromDoc());

  const updateLocalNodesState = useCallback(
    (nextNodes: Node[]) => {
      const indexMap = new Map<string, number>();
      nextNodes.forEach((node, index) => {
        indexMap.set(node.id, index);
      });

      nodeIndexRef.current = indexMap;
      nodesRef.current = nextNodes;
      setNodesState((current) => (compareArrays(current, nextNodes) ? current : nextNodes));
    },
    [compareArrays],
  );

  useEffect(() => {
    // Ignore events originating from this provider's transactions to avoid
    // redundant re-renders when we already updated local state optimistically.
    const handleNodeOrderChange = (event: Y.YArrayEvent<string>) => {
      if (event.transaction?.origin === 'canvas') {
        return;
      }

      const snapshot = snapshotNodesFromDoc();
      setNodesState((current) => (compareArrays(current, snapshot) ? current : snapshot));
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
            // Remove any stale serialization for nodes that were deleted in the
            // document so the cache reflects current reality.
            nodeSerializationRef.current.delete(key);
            return;
          }
          if (!next) {
            next = [...current];
          }
          // Merge persisted data with transient fields (selection, dragging, etc.)
          // so external edits do not wipe in-flight UI state.
          const restoredNode = restoreTransientNodeState(value, current[index]);
          if (next[index] !== restoredNode) {
            next[index] = restoredNode;
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

    nodeOrder.observe(handleNodeOrderChange);
    nodesMap.observe(handleNodesMapChange);

    return () => {
      nodeOrder.unobserve(handleNodeOrderChange);
      nodesMap.unobserve(handleNodesMapChange);
    };
  }, [compareArrays, nodeOrder, nodesMap, snapshotNodesFromDoc]);

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

      // First update local state optimistically, then reconcile the Yjs map in
      // a transaction. The serialization map helps us detect whether a node's
      // structural payload actually changed to avoid unnecessary writes, while
      // sanitizedUpdates/serializedUpdates ensure we only push sanitized data to
      // the document and retain transient selection flags on identical nodes.
      updateLocalNodesState(next);

      const nextIds = next.map((node) => node.id);
      const currentIds = current.map((node) => node.id);
      const orderChanged = !compareArrays(currentIds, nextIds);
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

        const serialized = JSON.stringify(sanitized);
        if (previousSerialization === serialized) {
          return;
        }

        sanitizedUpdates.set(node.id, sanitized);
        serializedUpdates.set(node.id, serialized);
      });

      canvasDoc.transact(() => {
        if (orderChanged) {
          nodeOrder.delete(0, nodeOrder.length);
          if (nextIds.length > 0) {
            nodeOrder.insert(0, nextIds);
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

  const getNodes = useCallback(() => nodesRef.current, []);

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
