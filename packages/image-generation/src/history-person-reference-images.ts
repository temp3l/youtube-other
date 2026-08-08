import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Scene } from "@mediaforge/domain";
import type { HistoryVisualPlan } from "./history-image-plan.js";

export type HistoricalPersonSceneReference = {
  readonly characterId: string;
  readonly canonicalName: string;
  readonly assetFileId: string;
  readonly filePath: string;
  readonly role: string;
  readonly likenessPolicy: string;
};

const HISTORY_ASSET_ROOT = path.resolve(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "..",
  "history",
  "assets",
  "person-references"
);

export function resolveHistoricalPersonReferenceAssetPath(
  assetFileId: string
): string {
  return path.join(HISTORY_ASSET_ROOT, `${assetFileId}.png`);
}

function resolveShotIdForScene(input: {
  readonly plan: HistoryVisualPlan;
  readonly scene: Scene;
}): string | null {
  const match = /^scene-(\d{3})$/u.exec(input.scene.id);
  if (!match || !input.plan.shots?.length) return null;
  const sortedShots = [...input.plan.shots].sort((left, right) => {
    if (left.startMs !== right.startMs) return left.startMs - right.startMs;
    return left.id.localeCompare(right.id);
  });
  const index = Number(match[1]) - 1;
  return sortedShots[index]?.id ?? null;
}

export function resolveHistoricalPersonReferencesForScene(input: {
  readonly plan: HistoryVisualPlan;
  readonly scene: Scene;
}): readonly HistoricalPersonSceneReference[] {
  const report = input.plan.historicalPersonReferences;
  if (!report) return [];
  const shotId = resolveShotIdForScene(input);
  if (!shotId) return [];
  const usages = report.usages.filter(
    (usage) =>
      usage.shotId === shotId &&
      usage.attachmentStatus === "attached" &&
      usage.selectedReferenceAssetIds.length > 0
  );
  const references: HistoricalPersonSceneReference[] = [];
  for (const usage of usages) {
    for (const assetFileId of usage.selectedReferenceAssetIds) {
      references.push({
        characterId: usage.canonicalPersonId,
        canonicalName: usage.canonicalName,
        assetFileId,
        filePath: resolveHistoricalPersonReferenceAssetPath(assetFileId),
        role: "canonical-likeness",
        likenessPolicy: usage.likenessPolicy,
      });
    }
  }
  return references;
}
