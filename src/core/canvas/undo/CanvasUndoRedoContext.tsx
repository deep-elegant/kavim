import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Edge, Node } from "@xyflow/react";

import { useCanvasData } from "../CanvasDataContext";
import type { EditableEdgeData } from "../edges/EditableEdge";

/**
 * Manages undo/redo state for the canvas.
 * - Provides `performAction` for atomic mutations.
 * - Provides `beginAction`/`commitAction` for complex, multi-part mutations.
 * - Exposes `undo`, `redo`, `canUndo`, `canRedo`.
 */
const MAX_HISTORY = 30;

/** A snapshot of the canvas nodes and edges at a point in time. */
type GraphSnapshot = {
  nodes: Node[];
  edges: Edge<EditableEdgeData>[];
};

/** A single entry in the undo/redo history stack. */
type HistoryEntry = {
  before: GraphSnapshot;
  after: GraphSnapshot;
  label?: string;
};

type CanvasUndoRedoContextValue = {
  /**
   * Starts a new undoable action, returning a token.
   * Used for multi-step operations like dragging.
   */
  beginAction: (label?: string) => symbol | null;
  /** Commits an action started with `beginAction`. */
  commitAction: (token: symbol) => void;
  /** Cancels an action started with `beginAction`. */
  cancelAction: (token: symbol) => void;
  /**
   * Wraps a function that mutates canvas state, creating a single undo entry.
   * This is for simple, one-shot actions.
   */
  performAction: <T>(mutator: () => T, label?: string) => T;
  /** Reverts to the previous state in the history. */
  undo: () => void;
  /** Applies the next state in the history. */
  redo: () => void;
  /** Whether an undo operation is available. */
  canUndo: boolean;
  /** Whether a redo operation is available. */
  canRedo: boolean;
  /**
   * True if the canvas is currently applying a historical snapshot.
   * This is used to prevent re-triggering undo history recording.
   */
  isReplaying: boolean;
};

const CanvasUndoRedoContext = createContext<CanvasUndoRedoContextValue | null>(
  null,
);

/**
 * Deep-clones a value using `structuredClone` if available, falling back to JSON serialization.
 * This is critical for creating independent history snapshots.
 */
const clone = <T,>(value: T): T => {
  const structuredCloneImpl = globalThis.structuredClone;
  if (typeof structuredCloneImpl === "function") {
    return structuredCloneImpl(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

/**
 * Prepares a node for history storage.
 * - Removes transient state like `dragging`.
 * - Removes volatile state like AI results or `isTyping`.
 */
const sanitizeNodeForHistory = (node: Node): Node => {
  const shallow = { ...(node as Node & { dragging?: boolean }) };
  delete (shallow as { dragging?: boolean }).dragging;
  const cloned = clone(shallow);

  if (cloned.data && typeof cloned.data === "object") {
    const dataClone = { ...(cloned.data as Record<string, unknown>) };
    delete dataClone.isTyping;

    if (cloned.type === "ai-node" && "result" in dataClone) {
      delete dataClone.result;
    }

    cloned.data = dataClone as typeof cloned.data;
  }

  return cloned;
};

/** Prepares an edge for history storage by deep-cloning it. */
const sanitizeEdgeForHistory = (
  edge: Edge<EditableEdgeData>,
): Edge<EditableEdgeData> => clone(edge);

/**
 * Compares two snapshots for equality to avoid storing redundant history entries.
 * Uses JSON stringification for a pragmatic, if imperfect, comparison.
 */
const snapshotsEqual = (a: GraphSnapshot, b: GraphSnapshot) => {
  if (a.nodes.length !== b.nodes.length || a.edges.length !== b.edges.length) {
    return false;
  }

  return (
    JSON.stringify(a.nodes) === JSON.stringify(b.nodes) &&
    JSON.stringify(a.edges) === JSON.stringify(b.edges)
  );
};

/**
 * When restoring a snapshot, this function merges volatile state from the current canvas
 * (e.g., AI results) into the historical nodes to avoid losing it.
 */
const mergeSnapshotNodes = (
  target: Node[],
  current: Node[],
): Node[] => {
  const currentById = new Map(current.map((node) => [node.id, node]));

  return target.map((snapshotNode) => {
    if (snapshotNode.type !== "ai-node") {
      return snapshotNode;
    }

    const existing = currentById.get(snapshotNode.id);
    if (!existing || existing.type !== "ai-node") {
      return snapshotNode;
    }

    const snapshotData = {
      ...(snapshotNode.data as Record<string, unknown> | undefined),
    } as Record<string, unknown> | undefined;
    const existingData = existing.data as Record<string, unknown> | undefined;

    if (existingData && "result" in existingData) {
      if (!snapshotData) {
        return {
          ...snapshotNode,
          data: {
            result: existingData.result,
          } as Node["data"],
        };
      }

      snapshotData.result = existingData.result;
    }

    if (existingData && "responseBlocks" in existingData) {
      if (!snapshotData) {
        return {
          ...snapshotNode,
          data: {
            responseBlocks: existingData.responseBlocks,
          } as Node["data"],
        };
      }

      snapshotData.responseBlocks = existingData.responseBlocks;
    }

    return {
      ...snapshotNode,
      data: snapshotData as Node["data"],
    };
  });
};

/**
 * Provides undo/redo functionality to its children.
 * Manages the history stack and exposes methods to interact with it.
 */
export const CanvasUndoRedoProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const { getNodes, getEdges, setCanvasState } = useCanvasData();
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);
  const actionRef = useRef<{
    token: symbol;
    label?: string;
    snapshot: GraphSnapshot;
  } | null>(null);
  const isReplayingRef = useRef(false);

  const captureSnapshot = useCallback((): GraphSnapshot => {
    const nodes = getNodes().map(sanitizeNodeForHistory);
    const edges = getEdges().map(sanitizeEdgeForHistory);
    return { nodes, edges };
  }, [getEdges, getNodes]);

  const applySnapshot = useCallback(
    (snapshot: GraphSnapshot) => {
      isReplayingRef.current = true;
      try {
        const currentNodes = getNodes();
        const mergedNodes = mergeSnapshotNodes(snapshot.nodes, currentNodes);
        const edges = snapshot.edges.map((edge) => clone(edge));
        setCanvasState(mergedNodes, edges);
      } finally {
        isReplayingRef.current = false;
      }
    },
    [getNodes, setCanvasState],
  );

  const pushEntry = useCallback(
    (entry: HistoryEntry) => {
      setUndoStack((current) => {
        const next = [...current, entry];
        if (next.length > MAX_HISTORY) {
          next.shift();
        }
        return next;
      });
      setRedoStack([]);
    },
    [],
  );

  const beginAction = useCallback(
    (label?: string) => {
      if (isReplayingRef.current) {
        return null;
      }
      const token = Symbol(label ?? "canvas-action");
      actionRef.current = {
        token,
        label,
        snapshot: captureSnapshot(),
      };
      return token;
    },
    [captureSnapshot],
  );

  const commitAction = useCallback(
    (token: symbol) => {
      if (!actionRef.current || actionRef.current.token !== token) {
        return;
      }

      const before = actionRef.current.snapshot;
      const after = captureSnapshot();
      actionRef.current = null;

      if (snapshotsEqual(before, after)) {
        return;
      }

      pushEntry({ before, after });
    },
    [captureSnapshot, pushEntry],
  );

  const cancelAction = useCallback((token: symbol) => {
    if (actionRef.current && actionRef.current.token === token) {
      actionRef.current = null;
    }
  }, []);

  const performAction = useCallback(
    <T,>(mutator: () => T, label?: string): T => {
      if (isReplayingRef.current) {
        return mutator();
      }

      const before = captureSnapshot();
      const result = mutator();
      const after = captureSnapshot();

      if (!snapshotsEqual(before, after)) {
        pushEntry({ before, after, label });
      }

      return result;
    },
    [captureSnapshot, pushEntry],
  );

  const undo = useCallback(() => {
    if (undoStack.length === 0) {
      return;
    }

    const entry = undoStack[undoStack.length - 1]!;
    setUndoStack((currentUndo) => currentUndo.slice(0, -1));
    setRedoStack((currentRedo) => [...currentRedo, entry]);
    applySnapshot(entry.before);
  }, [applySnapshot, undoStack]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) {
      return;
    }

    const entry = redoStack[redoStack.length - 1]!;
    setRedoStack((currentRedo) => currentRedo.slice(0, -1));
    setUndoStack((currentUndo) => [...currentUndo, entry]);
    applySnapshot(entry.after);
  }, [applySnapshot, redoStack]);

  const value = useMemo(
    (): CanvasUndoRedoContextValue => ({
      beginAction,
      commitAction,
      cancelAction,
      performAction,
      undo,
      redo,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      isReplaying: isReplayingRef.current,
    }),
    [beginAction, commitAction, cancelAction, performAction, redo, undo, undoStack, redoStack],
  );

  return (
    <CanvasUndoRedoContext.Provider value={value}>
      {children}
    </CanvasUndoRedoContext.Provider>
  );
};

/** Hook to access the canvas undo/redo context. */
export const useCanvasUndoRedo = () => {
  const context = useContext(CanvasUndoRedoContext);
  if (!context) {
    throw new Error("useCanvasUndoRedo must be used within a CanvasUndoRedoProvider");
  }
  return context;
};
