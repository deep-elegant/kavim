import { MutableRefObject, useCallback, useRef, useState } from "react";

import { FileTransfer } from "./types";

export interface TransferStore {
  transfersRef: MutableRefObject<Map<string, FileTransfer>>;
  activeTransfers: FileTransfer[];
  completedTransfers: FileTransfer[];
  failedTransfers: FileTransfer[];
  setTransfer: (transfer: FileTransfer) => void;
  deleteTransfer: (id: string) => void;
  updateTransfer: (
    id: string,
    updater: (previous: FileTransfer | null) => FileTransfer | null,
  ) => FileTransfer | null;
}

export const useTransferStore = (): TransferStore => {
  const [activeTransfers, setActiveTransfers] = useState<FileTransfer[]>([]);
  const [completedTransfers, setCompletedTransfers] = useState<FileTransfer[]>(
    [],
  );
  const [failedTransfers, setFailedTransfers] = useState<FileTransfer[]>([]);

  const transfersRef = useRef<Map<string, FileTransfer>>(new Map());

  const recategorize = useCallback(() => {
    const nextActive: FileTransfer[] = [];
    const nextCompleted: FileTransfer[] = [];
    const nextFailed: FileTransfer[] = [];

    transfersRef.current.forEach((transfer) => {
      if (transfer.status === "completed") {
        nextCompleted.push(transfer);
        return;
      }

      if (transfer.status === "failed" || transfer.status === "cancelled") {
        nextFailed.push(transfer);
        return;
      }

      nextActive.push(transfer);
    });

    setActiveTransfers(nextActive);
    setCompletedTransfers(nextCompleted);
    setFailedTransfers(nextFailed);
  }, []);

  const setTransfer = useCallback(
    (transfer: FileTransfer) => {
      transfersRef.current.set(transfer.id, transfer);
      recategorize();
    },
    [recategorize],
  );

  const deleteTransfer = useCallback(
    (id: string) => {
      transfersRef.current.delete(id);
      recategorize();
    },
    [recategorize],
  );

  const updateTransfer = useCallback(
    (
      id: string,
      updater: (previous: FileTransfer | null) => FileTransfer | null,
    ) => {
      const previous = transfersRef.current.get(id) ?? null;
      const next = updater(previous);

      if (!next) {
        transfersRef.current.delete(id);
      } else {
        transfersRef.current.set(id, next);
      }

      recategorize();

      return next;
    },
    [recategorize],
  );

  return {
    transfersRef,
    activeTransfers,
    completedTransfers,
    failedTransfers,
    setTransfer,
    deleteTransfer,
    updateTransfer,
  };
};
