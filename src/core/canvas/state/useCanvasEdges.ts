import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { Edge } from '@xyflow/react';
import type * as Y from 'yjs';
import type { EditableEdgeData } from '../edges/EditableEdge';
import { arraysShallowEqual } from './arrayUtils';

/**
 * Handles for managing canvas edges synchronized with Yjs CRDT.
 * - `edges`: Current React state for rendering
 * - `setEdges`: Updates both local state and Yjs structures atomically
 * - `getEdges`: Retrieves latest edges without triggering re-render
 * - `updateLocalEdgesState`: Updates only local state (for remote changes already in Yjs)
 * - `replaceEdgesInDoc`: Replaces entire Yjs document (for loading saved files)
 */
export type CanvasEdgeHandles = {
  edges: Edge<EditableEdgeData>[];
  setEdges: Dispatch<SetStateAction<Edge<EditableEdgeData>[]>>;
  getEdges: () => Edge<EditableEdgeData>[];
  updateLocalEdgesState: (nextEdges: Edge<EditableEdgeData>[]) => void;
  replaceEdgesInDoc: (nextEdges: Edge<EditableEdgeData>[]) => void;
};

/**
 * Synchronizes ReactFlow edges with a Yjs CRDT for real-time collaboration.
 * - Maintains ordered edge array and fast lookup map for incremental updates
 * - Prevents redundant re-renders by comparing arrays before updating state
 * - Distinguishes local changes from remote changes via transaction origin
 * 
 * @param canvasDoc - Yjs document for transactional updates
 * @param edgeOrder - Yjs array maintaining edge display order
 * @param edgesMap - Yjs map storing edge data by ID
 */
export const useCanvasEdges = ({
  canvasDoc,
  edgeOrder,
  edgesMap,
}: {
  canvasDoc: Y.Doc;
  edgeOrder: Y.Array<string>;
  edgesMap: Y.Map<Edge<EditableEdgeData>>;
}): CanvasEdgeHandles => {
  // Index map enables O(1) updates when remote collaborators modify specific edges
  const edgeIndexRef = useRef<Map<string, number>>(new Map());
  // Always-current snapshot avoids stale closures in callbacks
  const edgesRef = useRef<Edge<EditableEdgeData>[]>([]);

  const compareArrays = useCallback(arraysShallowEqual, []);

  /**
   * Rebuilds edge array from Yjs structures and updates lookup cache.
   * Used on mount and when order changes significantly (not for individual edge updates).
   */
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

  const [edges, setEdgesState] = useState<Edge<EditableEdgeData>[]>(() => snapshotEdgesFromDoc());

  /**
   * Updates local React state without touching Yjs.
   * Used when remote changes arrive that are already persisted in Yjs structures.
   */
  const updateLocalEdgesState = useCallback(
    (nextEdges: Edge<EditableEdgeData>[]) => {
      const indexMap = new Map<string, number>();
      nextEdges.forEach((edge, index) => {
        indexMap.set(edge.id, index);
      });

      edgeIndexRef.current = indexMap;
      edgesRef.current = nextEdges;
      setEdgesState((current) => (compareArrays(current, nextEdges) ? current : nextEdges));
    },
    [compareArrays],
  );

  useEffect(() => {
    const handleEdgeOrderChange = (event: Y.YArrayEvent<string>) => {
      // Skip our own changes - local state is already updated before we write to Yjs
      if (event.transaction?.origin === 'canvas') {
        return;
      }

      const snapshot = snapshotEdgesFromDoc();
      setEdgesState((current) => (compareArrays(current, snapshot) ? current : snapshot));
    };

    const handleEdgesMapChange = (event: Y.YMapEvent<Edge<EditableEdgeData>>) => {
      // Skip our own changes - local state is already updated before we write to Yjs
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
          // Patch only the changed edges using cached index - avoids full array rebuild
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

    edgeOrder.observe(handleEdgeOrderChange);
    edgesMap.observe(handleEdgesMapChange);

    return () => {
      edgeOrder.unobserve(handleEdgeOrderChange);
      edgesMap.unobserve(handleEdgesMapChange);
    };
  }, [compareArrays, edgeOrder, edgesMap, snapshotEdgesFromDoc]);

  /**
   * Updates edges in both React state and Yjs document atomically.
   * - Computes minimal changes to avoid unnecessary network traffic
   * - Deletes removed edges, updates modified ones, preserves unchanged ones
   */
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
        // Sync Yjs structures with new edge list, minimizing writes
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

        // Remove edges that no longer exist
        Array.from(edgesMap.keys()).forEach((id) => {
          if (!nextIdSet.has(id)) {
            edgesMap.delete(id);
          }
        });

        // Update only edges that changed (by reference)
        next.forEach((edge) => {
          if (previousById.get(edge.id) !== edge) {
            edgesMap.set(edge.id, edge);
          }
        });
      }, 'canvas');
    },
    [canvasDoc, edgeOrder, edgesMap, updateLocalEdgesState],
  );

  // Returns current edges without triggering re-render (for callbacks)
  const getEdges = useCallback(() => edgesRef.current, []);

  /**
   * Replaces entire Yjs document with new edges.
   * Used when loading a saved file - doesn't update React state (caller handles that).
   */
  const replaceEdgesInDoc = useCallback(
    (nextEdges: Edge<EditableEdgeData>[]) => {
      edgeOrder.delete(0, edgeOrder.length);
      edgesMap.clear();

      if (nextEdges.length > 0) {
        const edgeIds = nextEdges.map((edge) => edge.id);
        edgeOrder.insert(0, edgeIds);
        nextEdges.forEach((edge) => {
          edgesMap.set(edge.id, edge);
        });
      }
    },
    [edgeOrder, edgesMap],
  );

  return useMemo(
    () => ({
      edges,
      setEdges,
      getEdges,
      updateLocalEdgesState,
      replaceEdgesInDoc,
    }),
    [edges, getEdges, replaceEdgesInDoc, setEdges, updateLocalEdgesState],
  );
};
