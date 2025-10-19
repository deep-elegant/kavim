import type { CanvasSnapshot } from "@/core/pak/types";

export type DraftRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  projectName: string | null;
  filePath: string | null;
  promotedAt: string | null;
};

export type DraftDetail = DraftRecord & {
  canvas: CanvasSnapshot;
};

export type SaveDraftRequest = {
  draftId?: string;
  canvas: CanvasSnapshot;
  projectName?: string | null;
  filePath?: string | null;
  promotedAt?: string | null;
  assets?: { path: string; data: unknown }[];
};

export type MarkDraftPromotedRequest = {
  draftId: string;
  promotedAt?: string;
  filePath?: string | null;
};

export type CleanupDraftsRequest = {
  maxAgeMs?: number;
  maxFiles?: number;
};
