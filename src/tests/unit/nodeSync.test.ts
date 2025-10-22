import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  createMutableNodeRecord,
  reconcileSelectedFlag,
  restoreTransientKeys,
  restoreTransientNodeState,
  sanitizeNodeDataForSync,
} from '@/core/canvas/state/nodeSync';

const createNode = (data: Node['data'] = {}): Node =>
  ({
    id: 'node-id',
    type: 'test-node',
    position: { x: 0, y: 0 },
    data,
  }) as Node;

describe('restoreTransientKeys', () => {
  it('copies transient keys from the previous node data', () => {
    const mutableData: Record<string, unknown> = {};
    const changed = restoreTransientKeys(mutableData, {
      label: 'Hello',
      isTyping: true,
      isActive: true,
    });

    expect(changed).toBe(true);
    expect(mutableData).toMatchObject({
      isTyping: true,
      isActive: true,
    });
  });

  it('does nothing when previous data is missing', () => {
    const mutableData: Record<string, unknown> = {};
    const changed = restoreTransientKeys(mutableData, undefined);

    expect(changed).toBe(false);
    expect(mutableData).toEqual({});
  });
});

describe('sanitizeNodeDataForSync', () => {
  it('removes transient keys from node data', () => {
    const sanitized = sanitizeNodeDataForSync({
      label: 'hello',
      isTyping: true,
      isEditing: false,
    });

    expect(sanitized).toMatchObject({ label: 'hello' });
    expect('isTyping' in (sanitized as Record<string, unknown>)).toBe(false);
    expect('isEditing' in (sanitized as Record<string, unknown>)).toBe(false);
  });

  it('returns the original reference when no transient keys are present', () => {
    const data = { label: 'hello', fontSize: 'auto' };
    const sanitized = sanitizeNodeDataForSync(data);

    expect(sanitized).toBe(data);
  });
});

describe('reconcileSelectedFlag', () => {
  it('restores the previous selection state when provided', () => {
    const mutable = createMutableNodeRecord(createNode()).node;
    const changed = reconcileSelectedFlag(mutable, {
      ...createNode(),
      selected: true,
    });

    expect(changed).toBe(true);
    expect(mutable.selected).toBe(true);
  });

  it('removes the selected flag when the previous node did not have it', () => {
    const mutable = {
      ...createNode(),
      selected: false,
    } as Node;

    const changed = reconcileSelectedFlag(mutable, createNode());

    expect(changed).toBe(true);
    expect('selected' in mutable).toBe(false);
  });
});

describe('restoreTransientNodeState', () => {
  it('returns the document node when no previous snapshot exists', () => {
    const docNode = createNode({ label: 'hello' });
    const result = restoreTransientNodeState(docNode);

    expect(result).toBe(docNode);
  });

  it('restores transient keys without mutating the original document node', () => {
    const docNode = createNode({ label: 'hello' });
    const previousNode = createNode({ label: 'hello', isTyping: true });

    const result = restoreTransientNodeState(docNode, previousNode);

    expect(result).not.toBe(docNode);
    expect(result.data).toMatchObject({ label: 'hello', isTyping: true });
    expect(docNode.data).toMatchObject({ label: 'hello' });
  });

  it('reconciles the selected flag with the previous node snapshot', () => {
    const docNode = createNode({ label: 'hello' });
    const previousNode = {
      ...createNode({ label: 'hello' }),
      selected: true,
    } as Node;

    const result = restoreTransientNodeState(docNode, previousNode);

    expect(result.selected).toBe(true);
  });
});
