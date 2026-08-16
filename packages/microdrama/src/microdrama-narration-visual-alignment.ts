export type NarrationCaptionCue = {
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
};

export type ShotTimingRatios = {
  readonly startRatio: number;
  readonly endRatio: number;
};

export function shotTimeWindowMs(
  timing: ShotTimingRatios,
  totalDurationMs: number
): { readonly startMs: number; readonly endMs: number } {
  const duration = Math.max(1, totalDurationMs);
  const startMs = Math.max(0, Math.floor(timing.startRatio * duration));
  const endMs = Math.max(startMs + 1, Math.ceil(timing.endRatio * duration));
  return { startMs, endMs: Math.min(endMs, duration) };
}

export function normalizeNarrationCueText(text: string): string {
  return text
    .replace(/\s+/gu, " ")
    .replace(/[“”]/gu, '"')
    .replace(/[‘’]/gu, "'")
    .trim();
}

const IMAGE_SAFE_STAGING_SUFFIX =
  "Stage this as a PG-13 cinematic still: imply danger through faces, blocking, and environment—not graphic harm.";

/**
 * Keep story alignment while avoiding image-safety refusals for graphic violence.
 */
export function toImageSafeVisualMoment(text: string): string {
  const normalized = normalizeNarrationCueText(text);
  if (normalized.length === 0) {
    return normalized;
  }
  if (normalized.endsWith(IMAGE_SAFE_STAGING_SUFFIX)) {
    return normalized;
  }
  const softened = normalized
    .replace(/\bboyfriend die\b/giu, "boyfriend in sudden danger on-screen")
    .replace(/\bdie on her phone\b/giu, "faces sudden danger on her phone")
    .replace(/\ba dying stranger\b/giu, "an injured stranger")
    .replace(/\bdying\b/giu, "badly hurt")
    .replace(/\bdie\b/giu, "fall into danger")
    .replace(/\bdead\b/giu, "motionless")
    .replace(/\bkneeling over a bloodied stranger\b/giu, "kneeling over an injured stranger")
    .replace(/\bbloodied\b/giu, "distressed")
    .replace(/\bhands covered in blood\b/giu, "hands marked with a dark red stain")
    .replace(/\bcovered in a stranger['’']s blood\b/giu, "marked by a dark red stain after helping someone")
    .replace(/\bcovered in\b/giu, "marked by")
    .replace(/\bbleeding from a head wound\b/giu, "dazed after a fall, a small mark at the hairline")
    .replace(/\bbleeding\b/giu, "hurt")
    .replace(/\bhead wound\b/giu, "mark at the hairline")
    .replace(/\bwound\b/giu, "mark")
    .replace(/\bblood\b/giu, "a dark red stain")
    .replace(/\ba van hits him\b/giu, "a van rushes toward him at the curb")
    .replace(/\bbefore she hits the floor\b/giu, "before she reaches the floor")
    .replace(/\bhits him\b/giu, "rushes toward him")
    .replace(/\bhits the floor\b/giu, "reaches the floor")
    .replace(/\bhits the\b/giu, "reaches the")
    .replace(/\bhits\b/giu, "reaches")
    .replace(/\btumbles down\b/giu, "slips down")
    .replace(/\blook like a killer\b/giu, "look wrongly accused")
    .replace(/\bkiller\b/giu, "suspect")
    .replace(/\bwants her gone\b/giu, "wants her out of the way")
    .replace(/\bexplodes through\b/giu, "barrels through")
    .replace(/\bmurder\b/giu, "dangerous confrontation")
    .replace(/\bkilling\b/giu, "dangerous confrontation");

  return `${softened} ${IMAGE_SAFE_STAGING_SUFFIX}`;
}

/**
 * Collect narration text overlapping a shot window so image prompts track speech.
 */
export function resolveNarrationMomentForTimeWindow(input: {
  readonly startMs: number;
  readonly endMs: number;
  readonly cues: readonly NarrationCaptionCue[];
}): string {
  const overlapping = input.cues.filter(
    (cue) => cue.startMs < input.endMs && cue.endMs > input.startMs
  );
  if (overlapping.length > 0) {
    return toImageSafeVisualMoment(
      overlapping
        .map((cue) => normalizeNarrationCueText(cue.text))
        .filter((text) => text.length > 0)
        .join(" ")
    );
  }

  if (input.cues.length === 0) {
    return "";
  }

  const midpoint = (input.startMs + input.endMs) / 2;
  let nearest = input.cues[0]!;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const cue of input.cues) {
    const cueMid = (cue.startMs + cue.endMs) / 2;
    const distance = Math.abs(cueMid - midpoint);
    if (distance < nearestDistance) {
      nearest = cue;
      nearestDistance = distance;
    }
  }
  return toImageSafeVisualMoment(normalizeNarrationCueText(nearest.text));
}

export function buildNarrationMomentsByPlateId(input: {
  readonly totalDurationMs: number;
  readonly cues: readonly NarrationCaptionCue[];
  readonly plates: readonly {
    readonly sourcePlateSemanticId: string;
    readonly timing: ShotTimingRatios;
  }[];
}): ReadonlyMap<string, string> {
  const moments = new Map<string, string>();
  for (const plate of input.plates) {
    if (moments.has(plate.sourcePlateSemanticId)) {
      continue;
    }
    const window = shotTimeWindowMs(plate.timing, input.totalDurationMs);
    const moment = resolveNarrationMomentForTimeWindow({
      ...window,
      cues: input.cues,
    });
    if (moment.length > 0) {
      moments.set(plate.sourcePlateSemanticId, moment);
    }
  }
  return moments;
}
