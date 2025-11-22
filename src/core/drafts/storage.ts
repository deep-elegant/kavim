import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { PakAssetInput, PakManifest } from "@/core/pak/types";
import {
  buildManifest,
  createPakArchive,
  readPakArchive,
} from "@/core/pak/pak-utils";
import { readPak } from "@/core/pak/unpacker";
import { upgradePak } from "@/core/pak/migrations";
import { getActivePak, setActivePak, toBuffer } from "@/core/pak/pak-manager";
import type {
  CleanupDraftsRequest,
  DraftDetail,
  DraftRecord,
  MarkDraftPromotedRequest,
  SaveDraftRequest,
} from "./types";

const DRAFTS_FOLDER_NAME = "Drafts";
const DRAFT_FILE_EXTENSION = ".pak";

// Keys for storing draft metadata in PAK manifest
const MANIFEST_KEYS = {
  draftId: "draftId",
  createdAt: "draftCreatedAt",
  updatedAt: "draftUpdatedAt",
  projectName: "draftProjectName",
  linkedFilePath: "draftLinkedFilePath",
  promotedAt: "draftPromotedAt",
} as const;

const getDraftsDirectory = () => {
  const userData = app.getPath("userData");
  return path.join(userData, DRAFTS_FOLDER_NAME);
};

const ensureDraftsDirectory = async () => {
  const directory = getDraftsDirectory();
  await fs.mkdir(directory, { recursive: true });
  return directory;
};

const getDraftFilePath = async (draftId: string) => {
  const directory = await ensureDraftsDirectory();
  return path.join(directory, `${draftId}${DRAFT_FILE_EXTENSION}`);
};

const getStringOrNull = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

// Converts PAK manifest metadata to draft record with fallbacks
const manifestToRecord = (
  manifest: PakManifest,
  archivePath: string,
): DraftRecord => {
  const fallbackId = path.parse(archivePath).name;
  const id = getStringOrNull(manifest[MANIFEST_KEYS.draftId]) ?? fallbackId;

  const createdAt =
    getStringOrNull(manifest[MANIFEST_KEYS.createdAt]) ??
    manifest.savedAt ??
    new Date().toISOString();
  const updatedAt =
    getStringOrNull(manifest[MANIFEST_KEYS.updatedAt]) ??
    manifest.savedAt ??
    createdAt;

  const projectName =
    getStringOrNull(manifest[MANIFEST_KEYS.projectName]) ??
    (typeof manifest.name === "string" ? manifest.name : null);
  const linkedFilePath = getStringOrNull(
    manifest[MANIFEST_KEYS.linkedFilePath],
  );
  const promotedAt = getStringOrNull(manifest[MANIFEST_KEYS.promotedAt]);

  return {
    id,
    createdAt,
    updatedAt,
    projectName,
    filePath: linkedFilePath,
    promotedAt,
  };
};

const readDraft = async (draftId: string) => {
  const filePath = await getDraftFilePath(draftId);
  try {
    const pak = await readPakArchive(filePath);
    const record = manifestToRecord(pak.manifest, filePath);
    return {
      record,
      canvas: pak.canvas,
      pak,
    };
  } catch (error) {
    const nodeError = error as { code?: string };
    if (nodeError?.code !== "ENOENT") {
      console.error(`Failed to read draft ${draftId}`, error);
    }
    return null;
  }
};

// Builds extra manifest fields for draft metadata
const mapToManifestExtras = (options: {
  draftId: string;
  createdAt: string;
  updatedAt: string;
  projectName: string | null;
  linkedFilePath: string | null;
  promotedAt: string | null;
}) => {
  const entries: [string, string | null][] = [
    [MANIFEST_KEYS.draftId, options.draftId],
    [MANIFEST_KEYS.createdAt, options.createdAt],
    [MANIFEST_KEYS.updatedAt, options.updatedAt],
    [MANIFEST_KEYS.projectName, options.projectName],
    [MANIFEST_KEYS.linkedFilePath, options.linkedFilePath],
    [MANIFEST_KEYS.promotedAt, options.promotedAt],
  ];

  const extras: Record<string, string | null> = {};
  entries.forEach(([key, value]) => {
    if (value !== null) {
      extras[key] = value;
    }
  });

  return extras;
};

/**
 * Saves canvas to draft file (PAK format).
 * - Creates new draft if no draftId provided
 * - Updates existing draft, preserving creation time
 * - Stores metadata in PAK manifest for quick listing
 */
export const saveDraft = async (
  payload: SaveDraftRequest,
): Promise<DraftDetail> => {
  const now = new Date().toISOString();
  const draftId = payload.draftId ?? randomUUID();
  const archivePath = await getDraftFilePath(draftId);

  const existing = await readDraft(draftId);

  const createdAt = existing?.record.createdAt ?? now;
  const projectName =
    payload.projectName ?? existing?.record.projectName ?? null;
  const linkedFilePath = payload.filePath ?? existing?.record.filePath ?? null;
  const promotedAt = payload.promotedAt ?? existing?.record.promotedAt ?? null;

  const manifest = buildManifest(
    archivePath,
    mapToManifestExtras({
      draftId,
      createdAt,
      updatedAt: now,
      projectName,
      linkedFilePath,
      promotedAt,
    }),
  );

  const activePakFiles = getActivePak()?.files;
  const cachedAssets: PakAssetInput[] = activePakFiles
    ? Object.entries(activePakFiles)
        .filter(([assetPath]) => assetPath.startsWith("assets/"))
        .map(([assetPath, data]) => ({ path: assetPath, data }))
    : [];

  const assetMap = new Map<string, Buffer>();
  cachedAssets.forEach((asset) => {
    const buffer = Buffer.isBuffer(asset.data)
      ? asset.data
      : toBuffer(asset.data);
    assetMap.set(asset.path, buffer);
  });

  (payload.assets ?? []).forEach((asset) => {
    assetMap.set(asset.path, toBuffer(asset.data));
  });

  const mergedAssets: PakAssetInput[] = Array.from(assetMap.entries()).map(
    ([assetPath, data]) => ({
      path: assetPath,
      data,
    }),
  );

  await createPakArchive(archivePath, payload.canvas, manifest, mergedAssets);

  const pak = await readPakArchive(archivePath);
  const record = manifestToRecord(pak.manifest, archivePath);

  return {
    ...record,
    canvas: pak.canvas,
  };
};

/**
 * Loads draft and sets it as active PAK (for asset resolution).
 */
export const loadDraft = async (
  draftId: string,
): Promise<DraftDetail | null> => {
  const draft = await readDraft(draftId);
  if (!draft) {
    return null;
  }

  setActivePak(draft.pak);

  return {
    ...draft.record,
    canvas: draft.canvas,
  };
};

export const deleteDraft = async (draftId: string) => {
  const filePath = await getDraftFilePath(draftId);
  try {
    await fs.unlink(filePath);
  } catch (error: unknown) {
    const nodeError = error as { code?: string };
    if (nodeError?.code === "ENOENT") {
      return;
    }
    console.error(`Failed to delete draft ${draftId}`, error);
  }
};

/**
 * Marks draft as promoted (saved to file).
 * Promoted drafts are hidden from recovery dialog and eligible for cleanup.
 */
export const markDraftPromoted = async ({
  draftId,
  promotedAt = new Date().toISOString(),
  filePath,
}: MarkDraftPromotedRequest) => {
  const draft = await loadDraft(draftId);
  if (!draft) {
    return;
  }

  await saveDraft({
    draftId,
    canvas: draft.canvas,
    projectName: draft.projectName,
    filePath: filePath ?? draft.filePath,
    promotedAt,
  });
};

/**
 * Lists all draft files from disk.
 * Reads manifest metadata without loading full canvas for performance.
 */
export const listDrafts = async (): Promise<DraftRecord[]> => {
  const directory = await ensureDraftsDirectory();

  let entries: string[] = [];
  try {
    entries = await fs.readdir(directory);
  } catch (error) {
    const nodeError = error as { code?: string };
    if (nodeError?.code === "ENOENT") {
      return [];
    }
    console.error("Failed to read drafts directory", error);
    return [];
  }

  const drafts: DraftRecord[] = [];

  for (const fileName of entries) {
    if (!fileName.endsWith(DRAFT_FILE_EXTENSION)) {
      continue;
    }
    const archivePath = path.join(directory, fileName);
    try {
      const pak = await readPak(archivePath);
      const upgradedPak = await upgradePak(archivePath, pak);
      drafts.push(manifestToRecord(upgradedPak.manifest, archivePath));
    } catch (error) {
      console.error(`Failed to inspect draft archive ${archivePath}`, error);
    }
  }

  drafts.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return drafts;
};

/**
 * Removes old or promoted drafts to free disk space.
 * - Deletes drafts older than maxAgeMs
 * - Deletes promoted (saved) drafts
 * - Limits total draft count to maxFiles (oldest first)
 */
export const cleanupDrafts = async ({
  maxAgeMs = 1000 * 60 * 60 * 24 * 30, // 30 days
  maxFiles = 50,
}: CleanupDraftsRequest = {}) => {
  const directory = await ensureDraftsDirectory();
  const drafts = await listDrafts();
  const now = Date.now();

  const deletionQueue = new Set<string>();

  drafts.forEach((draft, index) => {
    const updatedTime = Date.parse(draft.updatedAt);
    if (!Number.isNaN(updatedTime) && now - updatedTime > maxAgeMs) {
      deletionQueue.add(draft.id);
      return;
    }

    if (draft.promotedAt) {
      deletionQueue.add(draft.id);
      return;
    }

    if (index >= maxFiles) {
      deletionQueue.add(draft.id);
    }
  });

  for (const draftId of deletionQueue) {
    const filePath = path.join(directory, `${draftId}${DRAFT_FILE_EXTENSION}`);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      const nodeError = error as { code?: string };
      if (nodeError?.code === "ENOENT") {
        continue;
      }
      console.error(`Failed to cleanup draft ${draftId}`, error);
    }
  }
};
