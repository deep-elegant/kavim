import {
  useCallback,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { ClipboardEvent as ReactClipboardEvent } from "react";
import type { Node, Edge } from "@xyflow/react";
import { Buffer } from "buffer";
import type { PakAssetRegistration } from "@/core/pak/usePakAssets";

import type { CanvasNode, ToolId } from "../types";
import type { EditableEdgeData } from "../edges/EditableEdge";

// Sentinel value to detect when clipboard contains our custom node data
const COPIED_NODES_MARKER = "__COL_AI_NODES_COPY__";

// Persistent store to track copied nodes and edges across hook invocations without
// mutating module scoped objects directly inside React logic.
const copiedNodesStore = (() => {
  let nodes: Node<CanvasNode>[] = [];
  let edges: Edge<EditableEdgeData>[] = [];

  return {
    getNodes: () => nodes,
    getEdges: () => edges,
    set: (nextNodes: Node<CanvasNode>[], nextEdges: Edge<EditableEdgeData>[]) => {
      nodes = nextNodes;
      edges = nextEdges;
    },
  };
})();

/** Deep clones a node using structuredClone or JSON fallback */
const cloneNode = <T>(node: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(node);
  }

  return JSON.parse(JSON.stringify(node)) as T;
};

const cloneNodes = <T>(nodes: T[]): T[] => nodes.map((node) => cloneNode(node));

/**
 * Copies selected nodes and their connecting edges to clipboard and internal store.
 * - Stores nodes and edges for internal paste operations.
 * - Only copies edges where both source and target are in the selection.
 * - Writes marker text to system clipboard for detection.
 */
export const copyNodesToClipboard = async (
  selectedNodes: Node<CanvasNode>[],
  allEdges: Edge<EditableEdgeData>[],
): Promise<void> => {
  if (!selectedNodes.length) {
    return;
  }

  // Create a set of selected node IDs for quick lookup
  const selectedNodeIds = new Set(selectedNodes.map((node) => node.id));

  // Find all edges where both source and target are in the selection
  const selectedEdges = allEdges.filter(
    (edge) =>
      selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target),
  );

  copiedNodesStore.set(cloneNodes(selectedNodes), cloneNodes(selectedEdges));

  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return;
  }

  try {
    await navigator.clipboard.writeText(COPIED_NODES_MARKER);
  } catch (error) {
    console.error("Failed to write to clipboard:", error);
  }
};

export interface UseCanvasCopyPasteParams {
  nodes: Node[];
  edges: Edge<EditableEdgeData>[];
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEdges: Dispatch<SetStateAction<Edge<EditableEdgeData>[]>>;
  setSelectedTool: Dispatch<SetStateAction<ToolId | null>>;
  addImageNode: (
    src: string,
    position: { x: number; y: number },
    fileName?: string,
  ) => Promise<void>;
  getCanvasCenterPosition: () => { x: number; y: number };
  registerAssetFromBytes: (
    bytes: ArrayBuffer | Uint8Array,
    options?: { fileName?: string; extension?: string },
  ) => Promise<PakAssetRegistration>;
  getFileName: (filePath: string) => string;
  isImageFile: (file: File) => boolean;
}

/**
 * Hook for copy/paste functionality on the canvas.
 * - Handles Ctrl/Cmd+C to copy selected nodes and their connecting edges.
 * - Handles paste events for both nodes and images from clipboard.
 * - Pastes nodes with offset to avoid stacking on originals.
 * - Recreates edges between pasted nodes with proper ID mapping.
 */
export const useCanvasCopyPaste = ({
  nodes,
  edges,
  setNodes,
  setEdges,
  setSelectedTool,
  addImageNode,
  getCanvasCenterPosition,
  registerAssetFromBytes,
  getFileName,
  isImageFile,
}: UseCanvasCopyPasteParams) => {
  // Listen for Ctrl/Cmd+C to copy selected nodes and their edges
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      // Skip if user is typing in an input field
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.code === "KeyC") {
        const selectedNodes = nodes.filter(
          (node) => node.selected,
        ) as Node<CanvasNode>[];
        if (selectedNodes.length > 0) {
          void copyNodesToClipboard(selectedNodes, edges);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [nodes, edges]);

  /**
   * Handles paste events from the clipboard.
   * - Pastes nodes and edges if marker text is detected.
   * - Pastes images from clipboard files.
   * - Offsets pasted items to avoid exact overlap.
   * - Remaps edge connections to use new node IDs.
   */
  const handlePaste = useCallback(
    async (event: ReactClipboardEvent) => {
      const clipboardText = event.clipboardData.getData("text/plain");

      // Check if we're pasting our own copied nodes
      const copiedNodes = copiedNodesStore.getNodes();
      const copiedEdges = copiedNodesStore.getEdges();

      if (clipboardText === COPIED_NODES_MARKER && copiedNodes.length > 0) {
        event.preventDefault();
        setSelectedTool(null);

        const newNodes: Node<CanvasNode>[] = [];
        const updatedCopiedNodes: Node<CanvasNode>[] = [];
        // Map old node IDs to new node IDs for edge recreation
        const oldToNewNodeIdMap = new Map<string, string>();

        copiedNodes.forEach((nodeToCopy: Node<CanvasNode>) => {
          const offset = 20;
          const newPosition = {
            x: nodeToCopy.position.x + offset,
            y: nodeToCopy.position.y + offset,
          };

          const newNodeId = crypto.randomUUID();
          oldToNewNodeIdMap.set(nodeToCopy.id, newNodeId);

          // Create new node with fresh ID and offset position
          const newNode: Node<CanvasNode> = {
            ...cloneNode(nodeToCopy),
            id: newNodeId,
            position: newPosition,
            selected: true,
            data: cloneNode(nodeToCopy.data),
          };
          newNodes.push(newNode);

          // Update ref so next paste is offset from this paste
          const updatedNode = cloneNode(nodeToCopy);
          updatedNode.position = newPosition;
          updatedCopiedNodes.push(updatedNode);
        });

        // Create new edges with remapped node IDs
        const newEdges: Edge<EditableEdgeData>[] = [];
        const updatedCopiedEdges: Edge<EditableEdgeData>[] = [];

        copiedEdges.forEach((edgeToCopy: Edge<EditableEdgeData>) => {
          const newSourceId = oldToNewNodeIdMap.get(edgeToCopy.source);
          const newTargetId = oldToNewNodeIdMap.get(edgeToCopy.target);

          // Both source and target should exist in the map
          if (newSourceId && newTargetId) {
            const newEdge: Edge<EditableEdgeData> = {
              ...cloneNode(edgeToCopy),
              id: crypto.randomUUID(),
              source: newSourceId,
              target: newTargetId,
              selected: true,
              data: cloneNode(edgeToCopy.data),
            };
            newEdges.push(newEdge);

            // Update ref for next paste
            const updatedEdge = cloneNode(edgeToCopy);
            updatedCopiedEdges.push(updatedEdge);
          }
        });

        copiedNodesStore.set(updatedCopiedNodes, updatedCopiedEdges);

        setNodes((currentNodes) => {
          const deselected = currentNodes.map((node) =>
            node.selected ? { ...node, selected: false } : node,
          );
          return [...deselected, ...newNodes];
        });

        setEdges((currentEdges) => {
          const deselected = currentEdges.map((edge) =>
            edge.selected ? { ...edge, selected: false } : edge,
          );
          return [...deselected, ...newEdges];
        });
        return;
      }

      // Check for pasted image files
      const files = Array.from(event.clipboardData?.files ?? []).filter(
        isImageFile,
      );

      if (files.length > 0) {
        event.preventDefault();
        setSelectedTool(null);

        const pastePosition = getCanvasCenterPosition();

        for (const [index, file] of files.entries()) {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            const extension = (() => {
              if (file.name && file.name.includes(".")) {
                const nameExtension = file.name.split(".").pop();
                if (nameExtension) {
                  return nameExtension.toLowerCase();
                }
              }
              const typeExtension = file.type.split("/")[1];
              return typeExtension ?? "png";
            })();
            const base64Data = Buffer.from(bytes).toString("base64");
            const filePath = await window.fileSystem.saveClipboardImage(
              base64Data,
              extension,
            );
            const fileName = getFileName(filePath);
            const asset = await registerAssetFromBytes(bytes, {
              fileName,
              extension,
            });

            // Offset multiple images slightly
            const offset = index * 24;
            await addImageNode(
              asset.uri,
              { x: pastePosition.x + offset, y: pastePosition.y + offset },
              asset.fileName,
            );
          } catch (error) {
            console.error("Failed to paste image", error);
          }
        }
      }
    },
    [
      addImageNode,
      getCanvasCenterPosition,
      getFileName,
      isImageFile,
      registerAssetFromBytes,
      setNodes,
      setSelectedTool,
    ],
  );

  return { handlePaste, copyNodesToClipboard };
};

export default useCanvasCopyPaste;
