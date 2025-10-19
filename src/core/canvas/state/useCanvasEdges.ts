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

export type CanvasEdgeHandles = {
  edges: Edge<EditableEdgeData>[];
  setEdges: Dispatch<SetStateAction<Edge<EditableEdgeData>[]>>;
  getEdges: () => Edge<EditableEdgeData>[];
  updateLocalEdgesState: (nextEdges: Edge<EditableEdgeData>[]) => void;
  replaceEdgesInDoc: (nextEdges: Edge<EditableEdgeData>[]) => void;
};

export const useCanvasEdges = ({
  canvasDoc,
  edgeOrder,
  edgesMap,
}: {
  canvasDoc: Y.Doc;
  edgeOrder: Y.Array<string>;
  edgesMap: Y.Map<Edge<EditableEdgeData>>;
}): CanvasEdgeHandles => {
  const edgeIndexRef = useRef<Map<string, number>>(new Map());
  const edgesRef = useRef<Edge<EditableEdgeData>[]>([]);

  const compareArrays = useCallback(arraysShallowEqual, []);

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
      if (event.transaction?.origin === 'canvas') {
        return;
      }

      const snapshot = snapshotEdgesFromDoc();
      setEdgesState((current) => (compareArrays(current, snapshot) ? current : snapshot));
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

    edgeOrder.observe(handleEdgeOrderChange);
    edgesMap.observe(handleEdgesMapChange);

    return () => {
      edgeOrder.unobserve(handleEdgeOrderChange);
      edgesMap.unobserve(handleEdgesMapChange);
    };
  }, [compareArrays, edgeOrder, edgesMap, snapshotEdgesFromDoc]);

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

  const getEdges = useCallback(() => edgesRef.current, []);

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
