import type { PakReadResult } from "../types";
import { CURRENT_PAK_VERSION } from "./constants";
import type { PakMigration } from "./types";

const migrations: PakMigration[] = [
];

const getPakVersion = (pak: PakReadResult) => pak.manifest?.version ?? 0;

export const upgradePak = async (
  filePath: string,
  pak: PakReadResult,
): Promise<PakReadResult> => {
  let upgradedPak = pak;

  for (const migration of migrations) {
    const version = getPakVersion(upgradedPak);
    if (version >= CURRENT_PAK_VERSION && !migration.canApply) {
      break;
    }

    const shouldApply =
      typeof migration.canApply === "function"
        ? migration.canApply(upgradedPak)
        : version < migration.toVersion;

    if (!shouldApply) {
      continue;
    }

    upgradedPak = await migration.apply(filePath, upgradedPak);
  }

  return upgradedPak;
};
