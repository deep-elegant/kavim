import React from "react";
import { cn } from "@/utils/tailwind";
import { type StickyNoteShape } from "@/core/canvas/nodes/StickyNoteNode";

const RectangleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
  </svg>
);

const CircleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9"></circle>
  </svg>
);

const DiamondIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2L22 12L12 22L2 12L12 2Z"></path>
  </svg>
);

const TriangleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2L2 22H22L12 2Z"></path>
  </svg>
);


const shapeIcons: Record<StickyNoteShape, React.FC> = {
  rectangle: RectangleIcon,
  diamond: DiamondIcon,
  triangle: TriangleIcon,
  ellipse: CircleIcon,
};

interface ShapePickerProps {
  shape: StickyNoteShape;
  onShapeChange: (shape: StickyNoteShape) => void;
}

export const ShapePicker: React.FC<ShapePickerProps> = ({ shape, onShapeChange }) => {
  return (
    <div className="flex items-center space-x-1">
      {(Object.keys(shapeIcons) as StickyNoteShape[]).map((s) => {
        const Icon = shapeIcons[s];
        return (
          <button
            key={s}
            onClick={() => onShapeChange(s)}
            className={cn(
              "h-6 w-6 p-1 rounded-md",
              shape === s
                ? "bg-blue-500 text-white"
                : "hover:bg-gray-200 dark:hover:bg-gray-700",
            )}
          >
            <Icon />
          </button>
        );
      })}
    </div>
  );
};
