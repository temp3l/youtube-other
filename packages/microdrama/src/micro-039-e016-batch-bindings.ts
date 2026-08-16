import { computePayloadHash } from "@mediaforge/narrative-core";

import { MICRO_034_VISUAL_PROFILE_REVISION } from "./micro-034-canary-bindings.js";
import { MICRO_050_CANARY_PROVIDER_ACCOUNT_ID } from "./micro-050-canary-bindings.js";

/** Continuation progressive batch under MICRO-039 — separately authorized E016 only. */
export const MICRO_039_E016_TASK_ID = "MICRO-039-E016";

export const MICRO_039_E016_BATCH_EPISODE_IDS = ["E016"] as const;
export type Micro039E016BatchEpisodeId = (typeof MICRO_039_E016_BATCH_EPISODE_IDS)[number];

export const MICRO_039_E016_BATCH_LOCALES = ["en-US", "de-DE", "es-ES", "pt-BR"] as const;
export type Micro039E016BatchLocale = (typeof MICRO_039_E016_BATCH_LOCALES)[number];

export const MICRO_039_E016_EPISODE_RANGE = {
  startEpisodeId: "e016",
  endEpisodeId: "e016",
} as const;

/** Hard cap so no authorization can imply "all remaining" E016–E100. */
export const MICRO_039_E016_MAX_EPISODES_PER_BATCH = 2;

export const MICRO_039_E016_SCHEDULE_MODE = "manual" as const;

export const MICRO_039_E016_PRODUCTION_PROVIDERS = [
  "openai",
  "mock-image",
  "ffmpeg",
  "tiktok",
] as const;

export const MICRO_039_E016_BATCH_ACCOUNTS = [MICRO_050_CANARY_PROVIDER_ACCOUNT_ID] as const;

export const MICRO_039_E016_BATCH_COST_LIMIT_MINOR = 2_500;
export const MICRO_039_E016_BATCH_CURRENCY = "USD";
export const MICRO_039_E016_BATCH_MAXIMUM_TOTAL_PROVIDER_REQUESTS = 80;

export const MICRO_039_E016_VISUAL_PROFILE_REVISION = MICRO_034_VISUAL_PROFILE_REVISION;

export const MICRO_039_E016_PUBLICATION_INTENT_ID = "intent.micro-039-e016.e016.en-us.private";
export const MICRO_039_E016_PUBLICATION_ATTEMPT_ID = "attempt.micro-039-e016.e016.en-us.private";
export const MICRO_039_E016_PUBLICATION_IDEMPOTENCY_KEY =
  "idempotency.micro-039-e016.e016.en-us.private";

export function parseEpisodeNumber(episodeId: string): number | null {
  const match = /^e(\d{3})$/iu.exec(episodeId);
  if (!match) {
    return null;
  }
  return Number.parseInt(match[1]!, 10);
}

export function assertMicro039E016EpisodeRangeAllowed(input: {
  readonly startEpisodeId: string;
  readonly endEpisodeId: string;
}): { readonly allowed: boolean; readonly reason?: string } {
  const start = parseEpisodeNumber(input.startEpisodeId);
  const end = parseEpisodeNumber(input.endEpisodeId);
  if (start === null || end === null) {
    return { allowed: false, reason: "EPISODE_RANGE_INVALID" };
  }
  if (start < 16) {
    return { allowed: false, reason: "EPISODE_RANGE_BELOW_E016" };
  }
  if (end < start) {
    return { allowed: false, reason: "EPISODE_RANGE_INVERTED" };
  }
  const span = end - start + 1;
  if (span > MICRO_039_E016_MAX_EPISODES_PER_BATCH) {
    return { allowed: false, reason: "EPISODE_RANGE_EXCEEDS_BATCH_CAP" };
  }
  if (end >= 100 || span >= 90) {
    return { allowed: false, reason: "EPISODE_RANGE_ALL_REMAINING_FORBIDDEN" };
  }
  if (start !== 16 || end !== 16) {
    return { allowed: false, reason: "EPISODE_RANGE_NOT_E016_PROGRESSIVE_BATCH" };
  }
  return { allowed: true };
}

export function isMicro039E016InScopeEpisodeId(episodeId: string): boolean {
  return (MICRO_039_E016_BATCH_EPISODE_IDS as readonly string[]).includes(
    episodeId.toUpperCase()
  );
}

export function isMicro039E016OutOfScopeEpisodeId(episodeId: string): boolean {
  const match = /^E(\d{3})$/u.exec(episodeId.toUpperCase());
  if (!match) {
    return false;
  }
  const episodeNumber = Number.parseInt(match[1]!, 10);
  return episodeNumber !== 16;
}

export function computeMicro039E016ProviderConfigRevision(): string {
  return computePayloadHash({
    scope: "micro-039-e016.provider-config.v1",
    providers: MICRO_039_E016_PRODUCTION_PROVIDERS,
    renderProfileRevision: MICRO_039_E016_VISUAL_PROFILE_REVISION,
  });
}

export function buildMicro039E016BatchBindingProbe(input: {
  readonly revisionSet: readonly string[];
}): {
  readonly episodeRange: typeof MICRO_039_E016_EPISODE_RANGE;
  readonly locales: string[];
  readonly providers: string[];
  readonly accounts: string[];
  readonly revisionSet: string[];
  readonly costLimitMinor: number;
  readonly scheduleMode: typeof MICRO_039_E016_SCHEDULE_MODE;
} {
  return {
    episodeRange: { ...MICRO_039_E016_EPISODE_RANGE },
    locales: [...MICRO_039_E016_BATCH_LOCALES],
    providers: [...MICRO_039_E016_PRODUCTION_PROVIDERS],
    accounts: [...MICRO_039_E016_BATCH_ACCOUNTS],
    revisionSet: [...input.revisionSet],
    costLimitMinor: MICRO_039_E016_BATCH_COST_LIMIT_MINOR,
    scheduleMode: MICRO_039_E016_SCHEDULE_MODE,
  };
}

export function localeOutputSegment(locale: Micro039E016BatchLocale): string {
  return locale.toLowerCase();
}
