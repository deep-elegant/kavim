import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  createMutableNodeRecord,
  reconcileSelectedFlag,
  restoreAutoFontSize,
  restoreTransientKeys,
  restoreTransientNodeState,
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

describe('restoreAutoFontSize', () => {
  it('restores the auto font size value when the document omits it', () => {
    const mutableData: Record<string, unknown> = {
      fontSizeMode: 'auto',
    };

    const changed = restoreAutoFontSize(mutableData, {
      fontSizeMode: 'auto',
      fontSizeValue: 42,
    });

    expect(changed).toBe(true);
    expect(mutableData).toMatchObject({
      fontSizeMode: 'auto',
      fontSizeValue: 42,
    });
  });

  it('skips restoration when the document already has a numeric value', () => {
    const mutableData: Record<string, unknown> = {
      fontSizeMode: 'auto',
      fontSizeValue: 24,
    };

    const changed = restoreAutoFontSize(mutableData, {
      fontSizeMode: 'auto',
      fontSizeValue: 42,
    });

    expect(changed).toBe(false);
    expect(mutableData['fontSizeValue']).toBe(24);
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

  it('preserves locally computed auto font sizes from the previous node', () => {
    const docNode = createNode({
      label: 'hello',
      fontSizeMode: 'auto',
    });
    const previousNode = createNode({
      label: 'hello',
      fontSizeMode: 'auto',
      fontSizeValue: 32,
    });

    const result = restoreTransientNodeState(docNode, previousNode);

    expect(result.data).toMatchObject({
      fontSizeMode: 'auto',
      fontSizeValue: 32,
    });
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
