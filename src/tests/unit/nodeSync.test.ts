import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { restoreTransientNodeState, sanitizeNodeDataForSync } from '@/core/canvas/state/nodeSync';

const createNode = (data: Node['data']): Node =>
  ({
    id: 'node-id',
    type: 'text',
    position: { x: 0, y: 0 },
    data,
  } as unknown as Node);

describe('sanitizeNodeDataForSync', () => {
  it('removes fontSizeValue when fontSizeMode is auto', () => {
    const data = { fontSizeMode: 'auto', fontSizeValue: 42, color: 'red' } satisfies Node['data'];

    const sanitized = sanitizeNodeDataForSync(data);

    expect(sanitized).not.toBe(data);
    expect(sanitized).not.toHaveProperty('fontSizeValue');
    expect(sanitized).toMatchObject({ fontSizeMode: 'auto', color: 'red' });
  });

  it('preserves fontSizeValue when fontSizeMode is fixed', () => {
    const data = { fontSizeMode: 'fixed', fontSizeValue: 24, color: 'blue' } satisfies Node['data'];

    const sanitized = sanitizeNodeDataForSync(data);

    expect(sanitized).toHaveProperty('fontSizeValue', 24);
    expect(sanitized).toBe(data);
  });
});

describe('restoreTransientNodeState', () => {
  it('restores fontSizeValue locally for auto mode nodes', () => {
    const previousNode = createNode({ fontSizeMode: 'auto', fontSizeValue: 18 });
    const docNode = createNode({ fontSizeMode: 'auto' });

    const restored = restoreTransientNodeState(docNode, previousNode);

    expect(restored.data).toMatchObject({ fontSizeMode: 'auto', fontSizeValue: 18 });
  });

  it('retains synced fontSizeValue for fixed mode nodes', () => {
    const previousNode = createNode({ fontSizeMode: 'auto', fontSizeValue: 18 });
    const docNode = createNode({ fontSizeMode: 'fixed', fontSizeValue: 32 });

    const restored = restoreTransientNodeState(docNode, previousNode);

    expect(restored.data).toMatchObject({ fontSizeMode: 'fixed', fontSizeValue: 32 });
  });
});
