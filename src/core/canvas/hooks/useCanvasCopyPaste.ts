import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
import type { ClipboardEvent as ReactClipboardEvent } from 'react';
import type { Node } from '@xyflow/react';

import type { CanvasNode, ToolId } from '../types';

const COPIED_NODES_MARKER = '__COL_AI_NODES_COPY__';

const copiedNodesRef: { current: Node<CanvasNode>[] } = { current: [] };

const cloneNode = <T,>(node: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(node);
  }

  return JSON.parse(JSON.stringify(node)) as T;
};

const cloneNodes = <T,>(nodes: T[]): T[] => nodes.map((node) => cloneNode(node));

export const copyNodesToClipboard = async (
  selectedNodes: Node<CanvasNode>[],
): Promise<void> => {
  if (!selectedNodes.length) {
    return;
  }

  copiedNodesRef.current = cloneNodes(selectedNodes);

  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return;
  }

  try {
    await navigator.clipboard.writeText(COPIED_NODES_MARKER);
  } catch (error) {
    console.error('Failed to write to clipboard:', error);
  }
};

export interface UseCanvasCopyPasteParams {
  nodes: Node[];
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setSelectedTool: Dispatch<SetStateAction<ToolId | null>>;
  addImageNode: (src: string, position: { x: number; y: number }, fileName?: string) => Promise<void>;
  getCanvasCenterPosition: () => { x: number; y: number };
  readFileAsDataUrl: (file: File) => Promise<string>;
  getFileName: (filePath: string) => string;
  isImageFile: (file: File) => boolean;
}

export const useCanvasCopyPaste = ({
  nodes,
  setNodes,
  setSelectedTool,
  addImageNode,
  getCanvasCenterPosition,
  readFileAsDataUrl,
  getFileName,
  isImageFile,
}: UseCanvasCopyPasteParams) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.code === 'KeyC') {
        const selectedNodes = nodes.filter((node) => node.selected) as Node<CanvasNode>[];
        if (selectedNodes.length > 0) {
          void copyNodesToClipboard(selectedNodes);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [nodes]);

  const handlePaste = useCallback(
    async (event: ReactClipboardEvent) => {
      const clipboardText = event.clipboardData.getData('text/plain');

      if (clipboardText === COPIED_NODES_MARKER && copiedNodesRef.current.length > 0) {
        event.preventDefault();
        setSelectedTool(null);

        const newNodes: Node<CanvasNode>[] = [];
        const updatedCopiedNodes: Node<CanvasNode>[] = [];

        copiedNodesRef.current.forEach((nodeToCopy) => {
          const offset = 20;
          const newPosition = {
            x: nodeToCopy.position.x + offset,
            y: nodeToCopy.position.y + offset,
          };

          const newNode: Node<CanvasNode> = {
            ...cloneNode(nodeToCopy),
            id: crypto.randomUUID(),
            position: newPosition,
            selected: true,
            data: cloneNode(nodeToCopy.data),
          };
          newNodes.push(newNode);

          const updatedNode = cloneNode(nodeToCopy);
          updatedNode.position = newPosition;
          updatedCopiedNodes.push(updatedNode);
        });

        copiedNodesRef.current = updatedCopiedNodes;

        setNodes((currentNodes) => {
          const deselected = currentNodes.map((node) =>
            node.selected ? { ...node, selected: false } : node,
          );
          return [...deselected, ...newNodes];
        });
        return;
      }

      const files = Array.from(event.clipboardData?.files ?? []).filter(isImageFile);

      if (files.length > 0) {
        event.preventDefault();
        setSelectedTool(null);

        const pastePosition = getCanvasCenterPosition();

        for (const [index, file] of files.entries()) {
          try {
            const dataUrl = await readFileAsDataUrl(file);
            const base64Data = dataUrl.split(',')[1];
            if (!base64Data) {
              continue;
            }

            const extension = file.type.split('/')[1] ?? 'png';
            const filePath = await window.fileSystem.saveClipboardImage(base64Data, extension);
            const newSrc = await window.fileSystem.readFileAsDataUrl(filePath);
            const fileName = getFileName(filePath);

            const offset = index * 24;
            await addImageNode(
              newSrc,
              { x: pastePosition.x + offset, y: pastePosition.y + offset },
              fileName,
            );
          } catch (error) {
            console.error('Failed to paste image', error);
          }
        }
      }
    },
    [
      addImageNode,
      getCanvasCenterPosition,
      getFileName,
      isImageFile,
      readFileAsDataUrl,
      setNodes,
      setSelectedTool,
    ],
  );

  return { handlePaste, copyNodesToClipboard };
};

export default useCanvasCopyPaste;
