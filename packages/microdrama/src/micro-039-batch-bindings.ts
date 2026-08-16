import { computePayloadHash } from "@mediaforge/narrative-core";

import { MICRO_034_VISUAL_PROFILE_REVISION } from "./micro-034-canary-bindings.js";
import { MICRO_050_CANARY_PROVIDER_ACCOUNT_ID } from "./micro-050-canary-bindings.js";

export const MICRO_039_TASK_ID = "MICRO-039";

/** First progressive batch — explicitly E011 only; later batches need new authorization. */
export const MICRO_039_BATCH_EPISODE_IDS = ["E011"] as const;
export type Micro039BatchEpisodeId = (typeof MICRO_039_BATCH_EPISODE_IDS)[number];

export const MICRO_039_BATCH_LOCALES = ["en-US", "de-DE", "es-ES", "pt-BR"] as const;
export type Micro039BatchLocale = (typeof MICRO_039_BATCH_LOCALES)[number];

export const MICRO_039_EPISODE_RANGE = {
  startEpisodeId: "e011",
  endEpisodeId: "e011",
} as const;

/** Hard cap so no authorization can imply "all remaining" E011–E100. */
export const MICRO_039_MAX_EPISODES_PER_BATCH = 2;

export const MICRO_039_SCHEDULE_MODE = "manual" as const;

export const MICRO_039_PRODUCTION_PROVIDERS = [
  "openai",
  "mock-image",
  "ffmpeg",
  "tiktok",
] as const;

export const MICRO_039_BATCH_ACCOUNTS = [MICRO_050_CANARY_PROVIDER_ACCOUNT_ID] as const;

export const MICRO_039_BATCH_COST_LIMIT_MINOR = 2_500;
export const MICRO_039_BATCH_CURRENCY = "USD";
export const MICRO_039_BATCH_MAXIMUM_TOTAL_PROVIDER_REQUESTS = 80;

export const MICRO_039_VISUAL_PROFILE_REVISION = MICRO_034_VISUAL_PROFILE_REVISION;

export const MICRO_039_PUBLICATION_INTENT_ID = "intent.micro-039.e011.en-us.private";
export const MICRO_039_PUBLICATION_ATTEMPT_ID = "attempt.micro-039.e011.en-us.private";
export const MICRO_039_PUBLICATION_IDEMPOTENCY_KEY =
  "idempotency.micro-039.e011.en-us.private";

export function parseEpisodeNumber(episodeId: string): number | null {
  const match = /^e(\d{3})$/iu.exec(episodeId);
  if (!match) {
    return null;
  }
  return Number.parseInt(match[1]!, 10);
}

export function assertMicro039EpisodeRangeAllowed(input: {
  readonly startEpisodeId: string;
  readonly endEpisodeId: string;
}): { readonly allowed: boolean; readonly reason?: string } {
  const start = parseEpisodeNumber(input.startEpisodeId);
  const end = parseEpisodeNumber(input.endEpisodeId);
  if (start === null || end === null) {
    return { allowed: false, reason: "EPISODE_RANGE_INVALID" };
  }
  if (start < 11) {
    return { allowed: false, reason: "EPISODE_RANGE_BELOW_E011" };
  }
  if (end < start) {
    return { allowed: false, reason: "EPISODE_RANGE_INVERTED" };
  }
  const span = end - start + 1;
  if (span > MICRO_039_MAX_EPISODES_PER_BATCH) {
    return { allowed: false, reason: "EPISODE_RANGE_EXCEEDS_BATCH_CAP" };
  }
  // Reject open-ended / "all remaining" style authorizations.
  if (end >= 100 || span >= 90) {
    return { allowed: false, reason: "EPISODE_RANGE_ALL_REMAINING_FORBIDDEN" };
  }
  // First progressive authorization is E011-only.
  if (start !== 11 || end !== 11) {
    return { allowed: false, reason: "EPISODE_RANGE_NOT_FIRST_PROGRESSIVE_BATCH" };
  }
  return { allowed: true };
}

export function isMicro039InScopeEpisodeId(episodeId: string): boolean {
  return (MICRO_039_BATCH_EPISODE_IDS as readonly string[]).includes(
    episodeId.toUpperCase()
  );
}

export function isMicro039OutOfScopeEpisodeId(episodeId: string): boolean {
  const match = /^E(\d{3})$/u.exec(episodeId.toUpperCase());
  if (!match) {
    return false;
  }
  const episodeNumber = Number.parseInt(match[1]!, 10);
  return episodeNumber !== 11;
}

export function computeMicro039ProviderConfigRevision(): string {
  return computePayloadHash({
    scope: "micro-039.provider-config.v1",
    providers: MICRO_039_PRODUCTION_PROVIDERS,
    renderProfileRevision: MICRO_039_VISUAL_PROFILE_REVISION,
  });
}

export function buildMicro039BatchBindingProbe(input: {
  readonly revisionSet: readonly string[];
}): {
  readonly episodeRange: typeof MICRO_039_EPISODE_RANGE;
  readonly locales: string[];
  readonly providers: string[];
  readonly accounts: string[];
  readonly revisionSet: string[];
  readonly costLimitMinor: number;
  readonly scheduleMode: typeof MICRO_039_SCHEDULE_MODE;
} {
  return {
    episodeRange: { ...MICRO_039_EPISODE_RANGE },
    locales: [...MICRO_039_BATCH_LOCALES],
    providers: [...MICRO_039_PRODUCTION_PROVIDERS],
    accounts: [...MICRO_039_BATCH_ACCOUNTS],
    revisionSet: [...input.revisionSet],
    costLimitMinor: MICRO_039_BATCH_COST_LIMIT_MINOR,
    scheduleMode: MICRO_039_SCHEDULE_MODE,
  };
}

export function localeOutputSegment(locale: Micro039BatchLocale): string {
  return locale.toLowerCase();
}
