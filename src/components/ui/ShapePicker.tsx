import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type StickyNoteShape } from "@/core/canvas/nodes/StickyNoteNode";
import { ShapesIcon } from "lucide-react";
import React from "react";
import { Button } from "./button";

const shapes: StickyNoteShape[] = [
  "rectangle",
  "diamond",
  "triangle",
  "ellipse",
];


const RectangleIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    className="h-full w-full"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
  </svg>
);

const CircleIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    className="h-full w-full"
  >
    <circle cx="12" cy="12" r="9"></circle>
  </svg>
);

const DiamondIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    className="h-full w-full"
  >
    <path d="M12 2L22 12L12 22L2 12L12 2Z"></path>
  </svg>
);

const TriangleIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    className="h-full w-full"
  >
    <path d="M12 2L2 22H22L12 2Z"></path>
  </svg>
);

export function ShapePicker({
  shape,
  onShapeChange,
}: {
  shape: StickyNoteShape;
  onShapeChange: (shape: StickyNoteShape) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-1">
          <ShapesIcon className="h-full w-full" style={{width: 24, height: 24}} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-1">
        <ToggleGroup
          type="single"
          value={shape}
          onValueChange={(value) => {
            if (value) {
              onShapeChange(value as StickyNoteShape);
            }
          }}
          className="flex items-center"
        >
          {shapes.map((s) => (
            <ToggleGroupItem
              key={s}
              value={s}
              aria-label={`Change shape to ${s}`}
              className="h-8 w-8 p-1"
            >
              <ShapePreview shape={s} />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </PopoverContent>
    </Popover>
  );
}

function ShapePreview({ shape }: { shape: StickyNoteShape }) {
  switch (shape) {
    case "rectangle":
      return <RectangleIcon />;
    case "diamond":
      return <DiamondIcon />;
    case "triangle":
      return <TriangleIcon />;
    case "ellipse":
      return <CircleIcon />;
    default:
      return <ShapesIcon className="h-full w-full" />;
  }
}
