export const CANARY_EPISODE_NUMBER_MAX = 3 as const;

export const CANARY_SOURCE_PLATE_RANGE = {
  min: 5,
  max: 7,
} as const;

export const CANARY_EDITORIAL_CUT_RANGE = {
  min: 8,
  max: 12,
} as const;

/** Target unique-image cadence for review renders (seconds per unique plate). */
export const UNIQUE_IMAGE_CADENCE_SECONDS = {
  min: 3.5,
  max: 4.5,
} as const;

/** First quarter of runtime (~0-15s on a 60s episode). */
export const REVIEW_FRONT_LOAD_UNTIL_RATIO = 0.25 as const;

/** @deprecated Prefer cadence resolution; kept as fallback defaults for ~60s. */
export const REVIEW_SOURCE_PLATE_TARGET = 15 as const;
export const REVIEW_EDITORIAL_CUT_TARGET = 15 as const;
export const REVIEW_FRONT_LOAD_UNIQUE_CUTS = 4 as const;

export type MicrodramaAssetDensityScope = "canary" | "standard" | "review";

export type MicrodramaAssetDensityPolicy = {
  readonly scope: MicrodramaAssetDensityScope;
  readonly sourcePlateTarget: number;
  readonly editorialCutTarget: number;
  readonly sourcePlateMin: number;
  readonly sourcePlateMax: number;
  readonly editorialCutMin: number;
  readonly editorialCutMax: number;
};

export type MicrodramaAssetDensityProfile = "canary" | "standard" | "review";

export function resolveMicrodramaAssetDensityProfile(
  env: Readonly<Record<string, string | undefined>> = process.env
): MicrodramaAssetDensityProfile | undefined {
  const raw = env.MICRODRAMA_ASSET_DENSITY_PROFILE?.trim().toLowerCase();
  if (raw === "review" || raw === "canary" || raw === "standard") {
    return raw;
  }
  return undefined;
}

/**
 * Unique images for a duration so each image lands about every 5–8 seconds.
 * Uses the midpoint cadence (~6.5s) clamped into the 5–8s band.
 */
export function resolveUniqueImageCountForDuration(durationSeconds: number): number {
  const duration = Math.max(1, durationSeconds);
  const minCount = Math.max(1, Math.ceil(duration / UNIQUE_IMAGE_CADENCE_SECONDS.max));
  const maxCount = Math.max(minCount, Math.floor(duration / UNIQUE_IMAGE_CADENCE_SECONDS.min));
  const midpointSeconds =
    (UNIQUE_IMAGE_CADENCE_SECONDS.min + UNIQUE_IMAGE_CADENCE_SECONDS.max) / 2;
  const preferred = Math.round(duration / midpointSeconds);
  return Math.min(maxCount, Math.max(minCount, preferred));
}

export function resolveFrontLoadUniqueCutsForDuration(
  durationSeconds: number,
  untilRatio: number = REVIEW_FRONT_LOAD_UNTIL_RATIO
): number {
  const openingSeconds = Math.max(1, durationSeconds * untilRatio);
  return resolveUniqueImageCountForDuration(openingSeconds);
}

export function resolveMicrodramaAssetDensityPolicy(
  episodeNumber: number,
  options?: {
    readonly profile?: MicrodramaAssetDensityProfile;
    readonly env?: Readonly<Record<string, string | undefined>>;
    readonly durationSeconds?: number;
  }
): MicrodramaAssetDensityPolicy {
  const profile =
    options?.profile ?? resolveMicrodramaAssetDensityProfile(options?.env ?? process.env);

  if (profile === "review") {
    const durationSeconds = options?.durationSeconds ?? 60;
    const uniqueImages = resolveUniqueImageCountForDuration(durationSeconds);
    return {
      scope: "review",
      sourcePlateTarget: uniqueImages,
      editorialCutTarget: uniqueImages,
      sourcePlateMin: uniqueImages,
      sourcePlateMax: uniqueImages,
      editorialCutMin: uniqueImages,
      editorialCutMax: uniqueImages,
    };
  }

  if (
    profile !== "standard" &&
    episodeNumber >= 1 &&
    episodeNumber <= CANARY_EPISODE_NUMBER_MAX
  ) {
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
  readonly sceneStartRatios?: readonly number[];
  readonly sceneEndRatios?: readonly number[];
  readonly frontLoadUntilRatio?: number;
  readonly frontLoadUniqueCuts?: number;
}): number[] {
  const { sceneCount, editorialCutTarget, sceneWeights } = args;
  if (sceneCount <= 0) {
    return [];
  }

  const weights =
    sceneWeights.length === sceneCount
      ? sceneWeights
      : Array.from({ length: sceneCount }, () => 1);
  const order = weights
    .map((weight, index) => ({ weight, index }))
    .sort((left, right) => right.weight - left.weight || left.index - right.index);

  const frontLoadUntilRatio = args.frontLoadUntilRatio;
  const frontLoadUniqueCuts = args.frontLoadUniqueCuts;
  const startRatios = args.sceneStartRatios;
  const endRatios = args.sceneEndRatios;
  const canFrontLoad =
    typeof frontLoadUntilRatio === "number" &&
    typeof frontLoadUniqueCuts === "number" &&
    frontLoadUniqueCuts > 0 &&
    Array.isArray(startRatios) &&
    startRatios.length === sceneCount &&
    Array.isArray(endRatios) &&
    endRatios.length === sceneCount;

  if (canFrontLoad) {
    const counts = Array.from({ length: sceneCount }, () => 0);
    const earlyIndexes = weights
      .map((_, index) => index)
      .filter((index) => {
        const start = startRatios[index] ?? 1;
        const end = endRatios[index] ?? 1;
        return start < frontLoadUntilRatio && end > 0;
      });
    const earlyOrdered = [...earlyIndexes].sort((left, right) => {
      const leftSpan = (endRatios[left] ?? 0) - (startRatios[left] ?? 0);
      const rightSpan = (endRatios[right] ?? 0) - (startRatios[right] ?? 0);
      return rightSpan - leftSpan || left - right;
    });

    const earlyBudget = Math.min(frontLoadUniqueCuts, editorialCutTarget, earlyIndexes.length > 0 ? editorialCutTarget : 0);
    if (earlyOrdered.length > 0 && earlyBudget > 0) {
      for (const index of earlyOrdered) {
        counts[index] = 1;
      }
      let placed = earlyOrdered.length;
      // If fewer early scenes than budget, stack extras on the longest early scenes.
      let cursor = 0;
      while (placed < earlyBudget) {
        const index = earlyOrdered[cursor % earlyOrdered.length]!;
        counts[index] = (counts[index] ?? 0) + 1;
        placed += 1;
        cursor += 1;
      }
      // If more early scenes than budget, keep longest early scenes only.
      if (earlyOrdered.length > earlyBudget) {
        for (let index = 0; index < sceneCount; index += 1) {
          counts[index] = 0;
        }
        for (let index = 0; index < earlyBudget; index += 1) {
          counts[earlyOrdered[index]!] = 1;
        }
        placed = earlyBudget;
      }

      let remaining = editorialCutTarget - placed;
      for (const entry of order) {
        if (remaining <= 0) {
          break;
        }
        if ((counts[entry.index] ?? 0) > 0) {
          continue;
        }
        counts[entry.index] = 1;
        remaining -= 1;
      }
      cursor = 0;
      while (remaining > 0) {
        const entry = order[cursor % order.length];
        if (entry) {
          counts[entry.index] = (counts[entry.index] ?? 0) + 1;
          remaining -= 1;
        }
        cursor += 1;
        if (cursor > sceneCount * 8) {
          break;
        }
      }
      return counts;
    }
  }

  // Review/sparse targets may be below scene count; keep highest-weight scenes only.
  if (editorialCutTarget < sceneCount) {
    const counts = Array.from({ length: sceneCount }, () => 0);
    const selected = Math.max(0, editorialCutTarget);
    for (let index = 0; index < selected; index += 1) {
      const entry = order[index];
      if (entry) {
        counts[entry.index] = 1;
      }
    }
    return counts;
  }

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const baseCounts = weights.map((weight) =>
    Math.max(1, Math.floor((editorialCutTarget * weight) / totalWeight))
  );
  let remaining = editorialCutTarget - baseCounts.reduce((sum, count) => sum + count, 0);

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
