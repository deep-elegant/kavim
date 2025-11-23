import type { PakReadResult } from "../types";

export type PakMigration = {
  fromVersion: number;
  toVersion: number;
  name?: string;
  canApply?: (pak: PakReadResult) => boolean;
  apply: (filePath: string, pak: PakReadResult) => Promise<PakReadResult>;
};
