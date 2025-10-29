import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { type Node, type NodeProps } from "@xyflow/react";
import { AlertTriangle, Loader2 } from "lucide-react";

import NodeInteractionOverlay from "./NodeInteractionOverlay";

export type YouTubeNodeData = {
  /** Normalized YouTube video identifier */
  videoId: string;
  /** Original URL provided by the user */
  url: string;
  /** Optional human-readable title */
  title?: string;
};

/**
 * Type definition for a YouTube node, extending the base Node type with YouTube-specific data.
 */
export type YouTubeNodeType = Node<YouTubeNodeData, "youtube-node">;

export const YOUTUBE_NODE_MIN_WIDTH = 320; // Minimum width for a YouTube node
export const YOUTUBE_NODE_MIN_HEIGHT = 180; // Minimum height for a YouTube node

/**
 * Constructs the YouTube embed URL from a video ID.
 * @param videoId - The YouTube video ID.
 * @returns The full embed URL.
 */
const buildEmbedUrl = (videoId: string) =>
  `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0`;

/**
 * React Flow node component for displaying an embedded YouTube video.
 * It handles loading states, errors, and provides an interaction overlay.
 */
const YouTubeNode = memo(({ id, data, selected }: NodeProps<YouTubeNodeType>) => {
  const { videoId, title } = data;

  const [isLoaded, setIsLoaded] = useState(false); // State to track if the iframe content has loaded
  const [hasError, setHasError] = useState(false); // State to track if there was an error loading the iframe

  const embedSrc = useMemo(() => { // Memoize the embed URL to prevent unnecessary re-renders
    if (!videoId) {
      return null;
    }
    return buildEmbedUrl(videoId);
  }, [videoId]);

  useEffect(() => {
    setIsLoaded(false);
    setHasError(false); // Reset loading and error states when the embed source changes
  }, [embedSrc]);

  /**
   * Callback for when the iframe successfully loads.
   */
  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    setHasError(false);
  }, []);

  /**
   * Callback for when the iframe encounters an error during loading.
   */
  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  const showLoader = Boolean(embedSrc) && !isLoaded && !hasError; // Determine if the loading spinner should be shown

  return (
    <NodeInteractionOverlay
      nodeId={id}
      isActive={selected}
      minWidth={YOUTUBE_NODE_MIN_WIDTH}
      minHeight={YOUTUBE_NODE_MIN_HEIGHT}
      contextMenuItems={undefined}
    >
      <div className="border-border bg-background relative h-full w-full overflow-hidden rounded-lg border">
        {embedSrc ? (
          <iframe
            src={embedSrc}
            title={title ?? "YouTube video"}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            onLoad={handleLoad}
            onError={handleError}
            loading="lazy"
          />
        ) : (
          <div className="text-muted-foreground flex h-full w-full items-center justify-center text-sm">
            No video selected
          </div>
        )}

        {showLoader ? (
          <div className="bg-background/80 absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" aria-hidden="true" />
            <span className="sr-only">Loading YouTube video</span>
          </div>
        ) : null}

        {hasError ? (
          <div className="bg-background/90 absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
            <AlertTriangle className="text-destructive h-6 w-6" aria-hidden="true" />
            <p className="text-destructive text-xs">Failed to load video</p>
          </div>
        ) : null}
      </div>
    </NodeInteractionOverlay>
  );
});

YouTubeNode.displayName = "YouTubeNode";

export default YouTubeNode;
