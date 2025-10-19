import type { Node } from '@xyflow/react';

/**
 * Transient keys represent UI-only metadata that should never be synchronized
 * with the shared Yjs document. Stripping them keeps the collaborative state
 * focused on the persisted node shape.
 */
export const TRANSIENT_NODE_DATA_KEYS = new Set(['isTyping', 'isEditing', 'isActive']);

/**
 * Removes transient UI keys from a node's data object before sending it to Yjs.
 */
export const sanitizeNodeDataForSync = (data: Node['data']) => {
  if (!data || typeof data !== 'object') {
    return data;
  }

  let hasTransientKey = false;

  const sanitizedEntries = Object.entries(data).filter(([key]) => {
    if (TRANSIENT_NODE_DATA_KEYS.has(key)) {
      hasTransientKey = true;
      return false;
    }
    return true;
  });

  if (!hasTransientKey) {
    return data;
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
    return node;
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
export const restoreTransientNodeState = (docNode: Node, previousNode?: Node) => {
  if (!previousNode) {
    return docNode;
  }

  const previousData = previousNode.data;
  const docData = docNode.data;

  let nextData = docData;
  let restoredData = false;

  if (previousData && typeof previousData === 'object') {
    const transientEntries = Object.entries(previousData).filter(([key]) =>
      TRANSIENT_NODE_DATA_KEYS.has(key),
    );

    if (transientEntries.length > 0) {
      const baseData =
        docData && typeof docData === 'object'
          ? (docData as Record<string, unknown>)
          : {};

      nextData = {
        ...baseData,
        ...Object.fromEntries(transientEntries),
      } as Node['data'];
      restoredData = true;
    }
  }

  const shouldRestoreSelected = previousNode.selected !== undefined;

  if (!restoredData && !shouldRestoreSelected) {
    return docNode;
  }

  const restoredNode: Node = {
    ...docNode,
    data: nextData,
  };

  if (shouldRestoreSelected) {
    restoredNode.selected = previousNode.selected;
  } else if ('selected' in restoredNode) {
    delete restoredNode.selected;
  }

  return restoredNode;
};
