import { useCallback, useEffect, useMemo, useState } from "react";
import * as Y from "yjs";

import type { CursorPresence } from "./types";

type RemotePresenceMap = Record<string, CursorPresence>;

/**
 * Keeps collaborator presence (cursor, selection, typing) in sync via Yjs map.
 * - Exposes helper to update local user's presence
 * - Observes remote presence changes
 * - Clears local presence on teardown
 */
export function usePresenceSync(doc: Y.Doc) {
  const localClientKey = useMemo(() => String(doc.clientID), [doc]);
  const presenceMap = useMemo(
    () => doc.getMap<CursorPresence>("presence"),
    [doc],
  );

  const [remotePresenceByClient, setRemotePresenceByClient] =
    useState<RemotePresenceMap>({});

  const updatePresence = useCallback(
    (update: Partial<Omit<CursorPresence, "updatedAt">>) => {
      doc.transact(() => {
        const existing = presenceMap.get(localClientKey);
        const hasNewPosition =
          typeof update.x === "number" && typeof update.y === "number";
        const nextHasPosition =
          typeof update.hasPosition === "boolean"
            ? update.hasPosition
            : hasNewPosition
              ? true
              : (existing?.hasPosition ?? false);

        const next: CursorPresence = {
          x: hasNewPosition ? update.x! : (existing?.x ?? 0),
          y: hasNewPosition ? update.y! : (existing?.y ?? 0),
          nodeId: update.nodeId ?? existing?.nodeId ?? null,
          interaction: update.interaction ?? existing?.interaction ?? "pointer",
          hasPosition: nextHasPosition,
          updatedAt: Date.now(),
        };

        presenceMap.set(localClientKey, next);
      }, "presence");

      return true;
    },
    [doc, localClientKey, presenceMap],
  );

  useEffect(() => {
    const updateRemotePresence = () => {
      const nextPresence: RemotePresenceMap = {};

      presenceMap.forEach((value, key) => {
        if (key === localClientKey || !value) {
          return;
        }

        nextPresence[key] = value;
      });

      setRemotePresenceByClient(nextPresence);
    };

    const observer = (event: Y.YMapEvent<CursorPresence>) => {
      void event;
      updateRemotePresence();
    };

    updateRemotePresence();
    presenceMap.observe(observer);

    return () => {
      presenceMap.unobserve(observer);
    };
  }, [localClientKey, presenceMap]);

  useEffect(
    () => () => {
      doc.transact(() => {
        presenceMap.delete(localClientKey);
      }, "presence");
    },
    [doc, localClientKey, presenceMap],
  );

  const clearRemotePresence = useCallback(() => {
    setRemotePresenceByClient({});
  }, []);

  return {
    updatePresence,
    remotePresenceByClient,
    clearRemotePresence,
  } as const;
}
