import { act, renderHook } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { useCanvasNodes } from '@/core/canvas/state/useCanvasNodes';

const createNode = (data: Node['data'] = {}): Node =>
  ({
    id: 'node-1',
    type: 'test-node',
    position: { x: 0, y: 0 },
    data,
  }) as Node;

describe('useCanvasNodes', () => {
  it('preserves typing node data on remote updates and refreshes serialization cache', () => {
    const canvasDoc = new Y.Doc();
    const nodeOrder = canvasDoc.getArray<string>('node-order');
    const nodesMap = canvasDoc.getMap<Node>('nodes-map');

    const baseNode = createNode({ label: 'Initial document label' });

    canvasDoc.transact(() => {
      nodeOrder.push(['node-1']);
      nodesMap.set('node-1', baseNode);
    });

    const { result } = renderHook(() => useCanvasNodes({ canvasDoc, nodeOrder, nodesMap }));

    act(() => {
      const [currentNode] = result.current.getNodes();
      result.current.updateLocalNodesState([
        {
          ...currentNode,
          data: { ...currentNode.data, label: 'Local draft label', isTyping: true },
        },
      ]);
    });

    const typingBeforeRemote = result.current.getNodes()[0];
    expect(typingBeforeRemote.data).toMatchObject({
      label: 'Local draft label',
      isTyping: true,
    });

    act(() => {
      canvasDoc.transact(() => {
        nodesMap.set('node-1', createNode({ label: 'Remote document label' }));
      });
    });

    const typingAfterRemote = result.current.getNodes()[0];
    expect(typingAfterRemote.data).toMatchObject({
      label: 'Local draft label',
      isTyping: true,
    });

    act(() => {
      result.current.setNodes((nodes) =>
        nodes.map((node) => ({
          ...node,
          data: { ...node.data, isTyping: false },
        })),
      );
    });

    const docNode = nodesMap.get('node-1');
    expect(docNode?.data).toMatchObject({ label: 'Local draft label' });
  });
});
