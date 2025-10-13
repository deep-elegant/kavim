import React, { type PropsWithChildren, useMemo } from 'react';
import { Handle, NodeResizer, Position } from '@xyflow/react';
import { type Editor } from '@tiptap/react';

import { cn } from '@/utils/tailwind';
import { TiptapToolbar, type ToolbarItem } from '@/components/ui/minimal-tiptap/TiptapToolbar';

const HANDLE_SIZE = 12;
const HANDLE_OFFSET = 10;

const handlePositions: { id: string; position: Position }[] = [
  { id: 'top', position: Position.Top },
  { id: 'right', position: Position.Right },
  { id: 'bottom', position: Position.Bottom },
  { id: 'left', position: Position.Left },
];

const getHandleStyle = (position: Position): React.CSSProperties => {
  switch (position) {
    case Position.Top:
      return { marginTop: -HANDLE_OFFSET };
    case Position.Bottom:
      return { marginBottom: -HANDLE_OFFSET };
    case Position.Left:
      return { marginLeft: -HANDLE_OFFSET };
    case Position.Right:
      return { marginRight: -HANDLE_OFFSET };
    default:
      return {};
  }
};

const sharedHandleStyle: React.CSSProperties = {
  width: HANDLE_SIZE,
  height: HANDLE_SIZE,
  borderRadius: '9999px',
  border: '2px solid rgb(59 130 246)',
  backgroundColor: 'white',
  boxShadow: '0 0 0 2px rgb(191 219 254 / 0.45)',
};

export type NodeInteractionOverlayProps = PropsWithChildren<{
  isActive: boolean;
  isEditing?: boolean;
  minWidth?: number;
  minHeight?: number;
  className?: string;
  editor?: Editor | null;
  toolbarItems?: ToolbarItem[];
}>;

const NodeInteractionOverlay = ({
  children,
  isActive,
  isEditing = false,
  minWidth,
  minHeight,
  className,
  editor,
  toolbarItems,
}: NodeInteractionOverlayProps) => {
  const shouldShowInteractions = isActive && !isEditing;
  const containerStyle = useMemo<React.CSSProperties>(
    () => ({
      minWidth,
      minHeight,
    }),
    [minHeight, minWidth],
  );

  return (
    <div
      className={cn('relative h-full w-full', className, isEditing && 'cursor-text')}
      style={containerStyle}
    >
      {editor && (
        <div
          data-editor-toolbar
          className="pointer-events-auto absolute left-1/2 top-0 z-10 -mt-2 -translate-y-full -translate-x-1/2"
        >
          {(isActive || isEditing) && <TiptapToolbar editor={editor} items={toolbarItems} />}
        </div>
      )}

      {children}

      {shouldShowInteractions && (
        <div className="pointer-events-none absolute inset-0 -m-2">
          <div className="absolute inset-0 rounded-xl border-2 border-sky-500/80" />
        </div>
      )}

      <NodeResizer
        isVisible={shouldShowInteractions}
        minWidth={minWidth}
        minHeight={minHeight}
        lineClassName="!border-sky-500/60"
        handleStyle={sharedHandleStyle}
      />

      {handlePositions.map(({ id, position }) => (
        <React.Fragment key={id}>
          <Handle
            type="target"
            id={`${id}-target`}
            position={position}
            className={cn(
              'transition-opacity',
              shouldShowInteractions
                ? 'pointer-events-auto opacity-100'
                : 'pointer-events-none opacity-0',
            )}
            style={{ ...sharedHandleStyle, ...getHandleStyle(position) }}
          />
          <Handle
            type="source"
            id={`${id}-source`}
            position={position}
            className={cn(
              'transition-opacity',
              shouldShowInteractions
                ? 'pointer-events-auto opacity-100'
                : 'pointer-events-none opacity-0',
            )}
            style={{ ...sharedHandleStyle, ...getHandleStyle(position) }}
          />
        </React.Fragment>
      ))}
    </div>
  );
};

export default NodeInteractionOverlay;
