import React, { memo, useCallback, useMemo } from "react";
import { type Node, type NodeProps } from "@xyflow/react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import NodeInteractionOverlay from "./NodeInteractionOverlay";
import { ContextMenuItem } from "@/components/ui/context-menu";

const stripPakProtocol = (value: string) =>
  value.startsWith("pak://") ? value.slice("pak://".length) : value;

const sanitizeFileName = (name: string) =>
  name.replace(/[<>:"/\\|?*]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

const getExtensionFromName = (value?: string | null) => {
  if (!value) {
    return undefined;
  }

  const match = /\.([a-z0-9]+)$/i.exec(value.trim());
  return match ? match[1]?.toLowerCase() : undefined;
};

const ensureExtension = (fileName: string, extension: string) => {
  if (!extension) {
    return fileName;
  }

  const normalizedExtension = extension.startsWith(".")
    ? extension.slice(1)
    : extension;
  const lowerCaseName = fileName.toLowerCase();
  const expectedSuffix = `.${normalizedExtension.toLowerCase()}`;

  return lowerCaseName.endsWith(expectedSuffix)
    ? fileName
    : `${fileName}${expectedSuffix}`;
};

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/apng": "apng",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

/** Data structure for image nodes on the canvas */
export type ImageNodeData = {
  src: string;
  alt?: string;
  fileName?: string;
  /** Original image dimensions (used for aspect ratio calculations) */
  naturalWidth?: number;
  naturalHeight?: number;
  /** Local-only status for asset availability */
  assetStatus?: "downloading" | "ready" | "error";
  /** Hint about where the asset originated (local vs. remote) */
  assetOrigin?: "local" | "remote";
  assetError?: string;
};

export type ImageNodeType = Node<ImageNodeData, "image-node">;

export const IMAGE_NODE_MIN_WIDTH = 120;
export const IMAGE_NODE_MIN_HEIGHT = 120;

/**
 * Displays an image on the canvas with optional filename overlay.
 * - Uses object-contain to preserve aspect ratio.
 * - Shows filename badge at bottom when available.
 * - Lazy loads images for performance with many nodes.
 */
const ImageNode = memo(({ id, data, selected }: NodeProps<ImageNodeType>) => {
  const { src, alt, fileName, assetStatus, assetError } = data;
  const isDownloading = assetStatus === "downloading";
  const hasError = assetStatus === "error";
  const shouldShowImage = Boolean(src) && !isDownloading && !hasError;
  const shouldShowPlaceholder = !src && !isDownloading && !hasError;
  const canExportImage = shouldShowImage && Boolean(src);

  const handleExportImage = useCallback(async () => {
    const assetPath = stripPakProtocol(src);

    try {
      const asset = await window.projectPak.getAssetData(assetPath);

      if (!asset) {
        toast.error("Image asset could not be found.");
        return;
      }

      const defaultNameSource =
        fileName ?? asset.path.split("/").pop() ?? "image-node";
      const normalizedBaseName =
        sanitizeFileName(defaultNameSource) || "image-node";

      const extension =
        getExtensionFromName(fileName) ??
        getExtensionFromName(asset.path) ??
        MIME_EXTENSION_MAP[asset.mimeType?.toLowerCase() ?? ""] ??
        "png";

      const defaultFileName = ensureExtension(normalizedBaseName, extension);
      const filters = [
        {
          name: "Images",
          extensions: [extension],
        },
      ];

      const savedPath = await window.fileSystem.saveFile(asset.data, {
        defaultPath: defaultFileName,
        filters,
      });

      if (!savedPath) {
        return;
      }

      toast.success("Image exported successfully.");
    } catch (error) {
      console.error("Failed to export image", error);
      toast.error("Failed to export image.");
    }
  }, [fileName, src]);

  const contextMenuItems = useMemo(
    () => (
      <ContextMenuItem
        onSelect={() => {
          void handleExportImage();
        }}
        disabled={!canExportImage}
      >
        Export Image
      </ContextMenuItem>
    ),
    [canExportImage, handleExportImage],
  );

  return (
    <NodeInteractionOverlay
      nodeId={id}
      isActive={selected}
      minWidth={IMAGE_NODE_MIN_WIDTH}
      minHeight={IMAGE_NODE_MIN_HEIGHT}
      contextMenuItems={contextMenuItems}
    >
      <div className="border-border bg-background relative h-full w-full overflow-hidden rounded-lg border">
        {shouldShowImage ? (
          <img
            src={src}
            alt={alt ?? fileName ?? "Canvas image"}
            className="h-full w-full object-contain select-none"
            draggable={false}
            loading="lazy"
          />
        ) : shouldShowPlaceholder ? (
          <div className="text-muted-foreground flex h-full w-full items-center justify-center text-sm">
            No image
          </div>
        ) : null}

        {isDownloading ? (
          <div className="bg-background/80 absolute inset-0 flex items-center justify-center">
            <Loader2
              className="text-muted-foreground h-6 w-6 animate-spin"
              aria-hidden="true"
            />
            <span className="sr-only">Downloading image</span>
          </div>
        ) : null}

        {hasError ? (
          <div className="bg-background/90 absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
            <AlertTriangle
              className="text-destructive h-6 w-6"
              aria-hidden="true"
            />
            <p className="text-destructive text-xs">
              {assetError ?? "Failed to load image"}
            </p>
          </div>
        ) : null}

        {/* Show filename badge when available (helps identify images in complex canvases) */}
        {fileName ? (
          <div className="pointer-events-none absolute right-2 bottom-2 left-2 rounded bg-black/50 px-2 py-1 text-xs text-white">
            {fileName}
          </div>
        ) : null}
      </div>
    </NodeInteractionOverlay>
  );
});

ImageNode.displayName = "ImageNode";

export default ImageNode;
