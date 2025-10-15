import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import type { EditableEdgeData } from "./edges/EditableEdge";

export type CanvasDataContextValue = {
  nodes: Node[];
  edges: Edge<EditableEdgeData>[];
  setCanvasState: (nodes: Node[], edges: Edge<EditableEdgeData>[]) => void;
};

const CanvasDataContext = createContext<CanvasDataContextValue | undefined>(
  undefined,
);

export const CanvasDataProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge<EditableEdgeData>[]>([]);

  const setCanvasState = useCallback(
    (nextNodes: Node[], nextEdges: Edge<EditableEdgeData>[]) => {
      setNodes(nextNodes);
      setEdges(nextEdges);
    },
    [],
  );

  const value = useMemo(
    () => ({
      nodes,
      edges,
      setCanvasState,
    }),
    [nodes, edges, setCanvasState],
  );

  return (
    <CanvasDataContext.Provider value={value}>
      {children}
    </CanvasDataContext.Provider>
  );
};

export const useCanvasData = () => {
  const context = useContext(CanvasDataContext);
  if (!context) {
    throw new Error("useCanvasData must be used within a CanvasDataProvider");
  }
  return context;
};
