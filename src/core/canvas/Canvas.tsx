import { useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  ControlButton,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
} from '@xyflow/react';
import { ArrowRight, MessageSquareDashed, StickyNote, Square, Type } from 'lucide-react';

import '@xyflow/react/dist/style.css';

const initialNodes = [
  { id: '1', position: { x: 0, y: 0 }, data: { label: '1' } },
  { id: '2', position: { x: 0, y: 100 }, data: { label: '2' } },
];

const initialEdges = [{ id: 'e1-2', source: '1', target: '2' }];

const tools = [
  { id: 'sticky-note', label: 'Sticky Note', icon: StickyNote },
  { id: 'shape', label: 'Shape', icon: Square },
  { id: 'arrow', label: 'Arrow', icon: ArrowRight },
  { id: 'prompt-node', label: 'Prompt Node', icon: MessageSquareDashed },
  { id: 'text', label: 'Text', icon: Type },
];

function Flow() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  return (
    <div style={{ height: '100%', width: '100%' }}>
        <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        >
        <MiniMap />
        <Controls
        position="bottom-center"
        showZoom={true}
        showInteractive={true}
        showFitView={true}
        orientation='horizontal'
        // className="!bg-transparent !shadow-none"
      >
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-background/95 p-2 shadow-lg">
          {tools.map(({ id, label, icon: Icon }) => (
            <ControlButton
              key={id}
              aria-label={label}
              className="!h-auto !w-auto !rounded-md !bg-transparent !p-2 hover:!bg-accent/60"
              title={label}
            >
              <Icon className="h-5 w-5" />
              <span className="sr-only">{label}</span>
            </ControlButton>
          ))}
        </div>
      </Controls>
        <Background />
        </ReactFlow>
    </div>
  );
}

export default Flow;
