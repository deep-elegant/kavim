import type { Node } from '@xyflow/react';

type NodeDataRecord = Record<string, unknown>;

const asNodeDataRecord = (value: Node['data']): NodeDataRecord | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  return value as NodeDataRecord;
};

/**
 * Transient keys represent UI-only metadata that should never be synchronized
 * with the shared Yjs document. Stripping them keeps the collaborative state
 * focused on the persisted node shape.
 */
export const TRANSIENT_NODE_DATA_KEYS = new Set(['isTyping', 'isEditing', 'isActive']);

/**
 * Determines if a key should be excluded from Yjs sync.
 * - Always excludes UI-only flags (isTyping, isEditing, isActive).
 * - Excludes fontSizeValue when mode is 'auto' (it's computed, not authored).
 */
export const isTransientNodeDataKey = (key: string, data?: Node['data']) => {
  if (TRANSIENT_NODE_DATA_KEYS.has(key)) {
    return true;
  }

  // Auto-calculated font size shouldn't be synced; each client computes their own
  if (key === 'fontSizeValue' && data && typeof data === 'object') {
    const { fontSizeMode } = data as { fontSizeMode?: unknown };
    if (fontSizeMode === 'auto') {
      return true;
    }
  }

  return false;
};

/**
 * Removes transient UI keys from a node's data object before sending it to Yjs.
 */
export const sanitizeNodeDataForSync = (data: Node['data']) => {
  if (!data || typeof data !== 'object') {
    return data;
  }

  let hasTransientKey = false;

  const sanitizedEntries = Object.entries(data).filter(([key]) => {
    if (isTransientNodeDataKey(key, data)) {
      hasTransientKey = true;
      return false;
    }
    return true;
  });

  if (!hasTransientKey) {
    return data; // Nothing to strip, return original to avoid unnecessary clones
  }

  return Object.fromEntries(sanitizedEntries) as Node['data'];
};

/**
 * Produces a node copy that excludes transient UI state and undefined
 * selection flags, keeping the serialized payload deterministic.
 */
export const sanitizeNodeForSync = (node: Node): Node => {
  const sanitizedData = sanitizeNodeDataForSync(node.data);

  if (sanitizedData === node.data && node.selected === undefined) {
    return node; // No changes needed, return original
  }

  const { selected: _selected, ...rest } = node;
  return {
    ...rest,
    data: sanitizedData,
  } as Node;
};

/**
 * Rehydrates transient node properties that are intentionally omitted from the
 * collaborative document so local UI state is preserved across updates.
 */
export type MutableNodeRecord = {
  node: Node;
  data: NodeDataRecord; // Mutable reference for efficient in-place updates
};

export const createMutableNodeRecord = (node: Node): MutableNodeRecord => {
  const record = {
    ...(asNodeDataRecord(node.data) ?? {}),
  } satisfies NodeDataRecord;

  return {
    node: {
      ...node,
      data: record as Node['data'],
    },
    data: record,
  };
};

/**
 * Restores transient UI flags from previous node state.
 * Returns true if any keys were restored (indicating the object was mutated).
 */
export const restoreTransientKeys = (
  mutableData: NodeDataRecord,
  previousData?: Node['data'],
): boolean => {
  const previousRecord = asNodeDataRecord(previousData);
  if (!previousRecord) {
    return false;
  }

  let restored = false;

  for (const key of TRANSIENT_NODE_DATA_KEYS) {
    if (!(key in previousRecord)) {
      continue;
    }

    const previousValue = previousRecord[key];
    if (mutableData[key] !== previousValue) {
      mutableData[key] = previousValue;
      restored = true;
    }
  }

  return restored;
};

/**
 * Restores auto-calculated font size from previous state when still in auto mode.
 * Prevents losing locally computed value when receiving updates from Yjs.
 */
export const restoreAutoFontSize = (
  mutableData: NodeDataRecord,
  previousData?: Node['data'],
): boolean => {
  const previousRecord = asNodeDataRecord(previousData);
  if (!previousRecord) {
    return false;
  }

  const previousMode = previousRecord['fontSizeMode'];
  if (previousMode !== 'auto') {
    return false; // Was manual, don't restore
  }

  const previousValue = previousRecord['fontSizeValue'];
  if (typeof previousValue !== 'number') {
    return false;
  }

  const nextMode = mutableData['fontSizeMode'];
  if (typeof nextMode === 'string' && nextMode !== 'auto') {
    return false; // Switched to manual, use new value
  }

  if (typeof mutableData['fontSizeValue'] === 'number') {
    return false; // Already has a value from Yjs
  }

  mutableData['fontSizeMode'] = 'auto';
  mutableData['fontSizeValue'] = previousValue;
  return true;
};

/**
 * Reconciles the selected flag between incoming doc node and previous local state.
 * Keeps local selection state stable during remote updates.
 */
export const reconcileSelectedFlag = (mutableNode: Node, previousNode: Node): boolean => {
  if (previousNode.selected !== undefined) {
    if (mutableNode.selected !== previousNode.selected) {
      mutableNode.selected = previousNode.selected;
      return true;
    }

    return false;
  }

  if ('selected' in mutableNode) {
    delete (mutableNode as { selected?: Node['selected'] }).selected;
    return true;
  }

  return false;
};

/**
 * Main entry point for merging Yjs document node with local transient state.
 * - Restores UI flags (isTyping, selection).
 * - Preserves auto-calculated font sizes.
 * - Returns original node if no restoration was needed (preserves identity).
 */
export const restoreTransientNodeState = (docNode: Node, previousNode?: Node) => {
  if (!previousNode) {
    return docNode;
  }

  const mutable = createMutableNodeRecord(docNode);

  const restoredTransient = restoreTransientKeys(mutable.data, previousNode.data);
  const restoredFontSize = restoreAutoFontSize(mutable.data, previousNode.data);
  const reconciledSelected = reconcileSelectedFlag(mutable.node, previousNode);

  if (!restoredTransient && !restoredFontSize && !reconciledSelected) {
    return docNode;
  }

  return mutable.node;
};
