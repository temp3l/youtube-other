export const CANARY_EPISODE_NUMBER_MAX = 3 as const;

export const CANARY_SOURCE_PLATE_RANGE = {
  min: 5,
  max: 7,
} as const;

export const CANARY_EDITORIAL_CUT_RANGE = {
  min: 8,
  max: 12,
} as const;

export type MicrodramaAssetDensityScope = "canary" | "standard";

export type MicrodramaAssetDensityPolicy = {
  readonly scope: MicrodramaAssetDensityScope;
  readonly sourcePlateTarget: number;
  readonly editorialCutTarget: number;
  readonly sourcePlateMin: number;
  readonly sourcePlateMax: number;
  readonly editorialCutMin: number;
  readonly editorialCutMax: number;
};

export function resolveMicrodramaAssetDensityPolicy(
  episodeNumber: number
): MicrodramaAssetDensityPolicy {
  if (episodeNumber >= 1 && episodeNumber <= CANARY_EPISODE_NUMBER_MAX) {
    const sourcePlateTarget =
      CANARY_SOURCE_PLATE_RANGE.min +
      ((episodeNumber - 1) % (CANARY_SOURCE_PLATE_RANGE.max - CANARY_SOURCE_PLATE_RANGE.min + 1));
    const editorialCutTarget =
      CANARY_EDITORIAL_CUT_RANGE.min +
      ((episodeNumber - 1) % (CANARY_EDITORIAL_CUT_RANGE.max - CANARY_EDITORIAL_CUT_RANGE.min + 1));

    return {
      scope: "canary",
      sourcePlateTarget,
      editorialCutTarget,
      sourcePlateMin: CANARY_SOURCE_PLATE_RANGE.min,
      sourcePlateMax: CANARY_SOURCE_PLATE_RANGE.max,
      editorialCutMin: CANARY_EDITORIAL_CUT_RANGE.min,
      editorialCutMax: CANARY_EDITORIAL_CUT_RANGE.max,
    };
  }

  return {
    scope: "standard",
    sourcePlateTarget: 7,
    editorialCutTarget: 12,
    sourcePlateMin: 5,
    sourcePlateMax: 9,
    editorialCutMin: 8,
    editorialCutMax: 14,
  };
}

export function distributeEditorialCutsAcrossScenes(args: {
  readonly sceneCount: number;
  readonly editorialCutTarget: number;
  readonly sceneWeights: readonly number[];
}): number[] {
  const { sceneCount, editorialCutTarget, sceneWeights } = args;
  if (sceneCount <= 0) {
    return [];
  }

  const weights =
    sceneWeights.length === sceneCount
      ? sceneWeights
      : Array.from({ length: sceneCount }, () => 1);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const baseCounts = weights.map((weight) =>
    Math.max(1, Math.floor((editorialCutTarget * weight) / totalWeight))
  );
  let remaining = editorialCutTarget - baseCounts.reduce((sum, count) => sum + count, 0);

  const order = weights
    .map((weight, index) => ({ weight, index }))
    .sort((left, right) => right.weight - left.weight || left.index - right.index);

  let cursor = 0;
  while (remaining > 0) {
    const entry = order[cursor % order.length];
    if (entry) {
      baseCounts[entry.index] = (baseCounts[entry.index] ?? 1) + 1;
      remaining -= 1;
    }
    cursor += 1;
  }

  while (remaining < 0) {
    const entry = order[cursor % order.length];
    if (entry && (baseCounts[entry.index] ?? 0) > 1) {
      baseCounts[entry.index] = (baseCounts[entry.index] ?? 1) - 1;
      remaining += 1;
    }
    cursor += 1;
    if (cursor > sceneCount * 4) {
      break;
    }
  }

  return baseCounts;
}
