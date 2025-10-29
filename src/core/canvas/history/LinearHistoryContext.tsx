import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Edge, Node } from "@xyflow/react";

import { useCanvasData } from "../CanvasDataContext";
import type { EditableEdgeData } from "../edges/EditableEdge";
import type { AiNodeData } from "../nodes/AINode";
import type { TextNodeData } from "../nodes/TextNode";
import type { StickyNoteData } from "../nodes/StickyNoteNode";
import type { ShapeNodeData } from "../nodes/ShapeNode";
import type { ImageNodeData } from "../nodes/ImageNode";
import type { YouTubeNodeData } from "../nodes/YouTubeNode";
import { htmlToPlainText } from "../utils/text";

export type LinearHistoryItem = {
  id: string;
  type?: string;
  title: string;
  summary?: string | null;
  prompt?: string | null;
  response?: string | null;
};

type LinearHistoryContextValue = {
  isOpen: boolean;
  activeNodeId: string | null;
  items: LinearHistoryItem[];
  isCycleTruncated: boolean;
  open: (nodeId: string) => void;
  close: () => void;
};

const LinearHistoryContext = createContext<LinearHistoryContextValue | undefined>(
  undefined,
);

const deriveLinearHistoryPath = (
  activeNodeId: string,
  nodes: Node[],
  edges: Edge<EditableEdgeData>[],
) => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const visited = new Set<string>();
  const ordered: Node[] = [];
  let currentId: string | undefined = activeNodeId;
  let isCycleTruncated = false;

  while (currentId) {
    if (visited.has(currentId)) {
      isCycleTruncated = true;
      break;
    }

    visited.add(currentId);
    const node = nodeMap.get(currentId);
    if (!node) {
      break;
    }
    ordered.push(node);

    let parentId: string | undefined;
    for (const edge of edges) {
      if (edge.target === currentId) {
        parentId = edge.source;
        break;
      }
    }

    if (!parentId) {
      break;
    }

    currentId = parentId;
  }

  return {
    nodes: ordered.reverse(),
    isCycleTruncated,
  };
};

const summarizeNodeForHistory = (node: Node): LinearHistoryItem => {
  const type = node.type;

  switch (type) {
    case "ai-node": {
      const data = (node.data as Partial<AiNodeData> | undefined) ?? {};
      const prompt = htmlToPlainText(data.label ?? "");
      const response = (data.result ?? "").trim();
      const modelLabel = data.model ? `AI (${data.model})` : "AI Node";

      return {
        id: node.id,
        type,
        title: modelLabel,
        summary: null,
        prompt: prompt || null,
        response: response || null,
      } satisfies LinearHistoryItem;
    }
    case "text-node": {
      const data = (node.data as Partial<TextNodeData> | undefined) ?? {};
      const summary = htmlToPlainText(data.label ?? "");
      return {
        id: node.id,
        type,
        title: "Text node",
        summary: summary || null,
      } satisfies LinearHistoryItem;
    }
    case "sticky-note": {
      const data = (node.data as Partial<StickyNoteData> | undefined) ?? {};
      const summary = htmlToPlainText(data.label ?? "");
      return {
        id: node.id,
        type,
        title: "Sticky note",
        summary: summary || null,
      } satisfies LinearHistoryItem;
    }
    case "shape-node": {
      const data = (node.data as Partial<ShapeNodeData> | undefined) ?? {};
      const summary = htmlToPlainText(data.label ?? "");
      const shapeLabel = data.shapeType
        ? `${data.shapeType.charAt(0).toUpperCase()}${data.shapeType.slice(1)} shape`
        : "Shape";
      return {
        id: node.id,
        type,
        title: shapeLabel,
        summary: summary || null,
      } satisfies LinearHistoryItem;
    }
    case "image-node": {
      const data = (node.data as Partial<ImageNodeData> | undefined) ?? {};
      const descriptor = data.fileName ?? data.alt ?? data.src ?? "";
      return {
        id: node.id,
        type,
        title: "Image",
        summary: descriptor || null,
      } satisfies LinearHistoryItem;
    }
    case "youtube-node": {
      const data = (node.data as Partial<YouTubeNodeData> | undefined) ?? {};
      const descriptor = data.title ?? data.url ?? data.videoId ?? "";
      return {
        id: node.id,
        type,
        title: "YouTube video",
        summary: descriptor || null,
      } satisfies LinearHistoryItem;
    }
    default:
      return {
        id: node.id,
        type,
        title: node.type ?? "Node",
        summary: null,
      } satisfies LinearHistoryItem;
  }
};

export const LinearHistoryProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { nodes, edges } = useCanvasData();
  const [state, setState] = useState<{
    isOpen: boolean;
    activeNodeId: string | null;
  }>({
    isOpen: false,
    activeNodeId: null,
  });

  const open = useCallback((nodeId: string) => {
    setState({
      isOpen: true,
      activeNodeId: nodeId,
    });
  }, []);

  const close = useCallback(() => {
    setState({ isOpen: false, activeNodeId: null });
  }, []);

  useEffect(() => {
    if (!state.isOpen || !state.activeNodeId) {
      return;
    }

    const exists = nodes.some((node) => node.id === state.activeNodeId);
    if (!exists) {
      setState({ isOpen: false, activeNodeId: null });
    }
  }, [nodes, state.activeNodeId, state.isOpen]);

  const { nodes: pathNodes, isCycleTruncated } = useMemo(() => {
    if (!state.activeNodeId) {
      return { nodes: [] as Node[], isCycleTruncated: false };
    }

    return deriveLinearHistoryPath(state.activeNodeId, nodes, edges);
  }, [edges, nodes, state.activeNodeId]);

  const items = useMemo(
    () => pathNodes.map((node) => summarizeNodeForHistory(node)),
    [pathNodes],
  );

  const value = useMemo<LinearHistoryContextValue>(
    () => ({
      isOpen: state.isOpen,
      activeNodeId: state.activeNodeId,
      items,
      isCycleTruncated,
      open,
      close,
    }),
    [close, isCycleTruncated, items, open, state.activeNodeId, state.isOpen],
  );

  return (
    <LinearHistoryContext.Provider value={value}>
      {children}
    </LinearHistoryContext.Provider>
  );
};

export const useLinearHistory = () => {
  const context = useContext(LinearHistoryContext);
  if (!context) {
    throw new Error(
      "useLinearHistory must be used within a LinearHistoryProvider",
    );
  }
  return context;
};

