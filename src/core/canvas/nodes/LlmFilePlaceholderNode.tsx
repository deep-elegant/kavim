import React, { memo } from "react";
import { type Node, type NodeProps } from "@xyflow/react";
import { Loader2 } from "lucide-react";

import NodeInteractionOverlay from "./NodeInteractionOverlay";
import { IMAGE_NODE_MIN_HEIGHT, IMAGE_NODE_MIN_WIDTH } from "./ImageNode";

export type LlmFilePlaceholderNodeData = {
  assetPath: string;
  fileName?: string;
};

export type LlmFilePlaceholderNodeType = Node<
  LlmFilePlaceholderNodeData,
  "llm-file-placeholder"
>;

const getDisplayName = (assetPath: string, fileName?: string) => {
  if (fileName) {
    return fileName;
  }

  const segments = assetPath.split("/");
  const last = segments[segments.length - 1];
  return last && last.length > 0 ? last : assetPath;
};

const LlmFilePlaceholderNode = memo(
  ({ id, data, selected }: NodeProps<LlmFilePlaceholderNodeType>) => {
    const displayName = getDisplayName(data.assetPath, data.fileName);

    return (
      <NodeInteractionOverlay
        nodeId={id}
        isActive={selected}
        minWidth={IMAGE_NODE_MIN_WIDTH}
        minHeight={IMAGE_NODE_MIN_HEIGHT}
        contextMenuItems={undefined}
      >
        <div className="border-border/70 bg-muted/40 relative flex h-full w-full items-center justify-center rounded-lg border border-dashed">
          <div className="flex max-w-[180px] flex-col items-center gap-2 text-center">
            <Loader2
              className="text-muted-foreground h-5 w-5 animate-spin"
              aria-hidden="true"
            />
            <span className="text-muted-foreground text-xs font-medium">
              Preparing image…
            </span>
            <span className="text-muted-foreground/70 text-[10px] font-medium truncate">
              {displayName}
            </span>
          </div>
        </div>
      </NodeInteractionOverlay>
    );
  },
);

LlmFilePlaceholderNode.displayName = "LlmFilePlaceholderNode";

export default LlmFilePlaceholderNode;
