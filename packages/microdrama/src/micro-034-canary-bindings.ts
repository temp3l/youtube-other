import { computePayloadHash } from "@mediaforge/narrative-core";

import {
  MICRO_033_AUTHORIZATION_PACK_SCRIPT_FILE_HASHES,
  MICRO_033_AUTHORIZATION_PACK_SCRIPT_HASHES,
  MICRO_033_AUTHORIZATION_PACK_SCRIPT_REVISIONS,
  MICRO_033_CANARY_EPISODE_IDS,
} from "./micro-033-canary-bindings.js";
import { DEFAULT_RENDER_PROFILE_REVISION } from "./visual-render-readiness.js";

export const MICRO_034_CANARY_EPISODE_IDS = MICRO_033_CANARY_EPISODE_IDS;

export const MICRO_034_AUTHORIZATION_PACK_SCRIPT_REVISIONS =
  MICRO_033_AUTHORIZATION_PACK_SCRIPT_REVISIONS;

export const MICRO_034_AUTHORIZATION_PACK_SCRIPT_HASHES =
  MICRO_033_AUTHORIZATION_PACK_SCRIPT_HASHES;

export const MICRO_034_AUTHORIZATION_PACK_SCRIPT_FILE_HASHES =
  MICRO_033_AUTHORIZATION_PACK_SCRIPT_FILE_HASHES;

export const MICRO_034_VISUAL_PROFILE_REVISION = DEFAULT_RENDER_PROFILE_REVISION;

export const MICRO_034_ESTIMATED_COST_MINOR_PER_IMAGE = 25;
export const MICRO_034_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS = 90;
export const MICRO_034_CANARY_COST_LIMIT_MINOR = 999;
export const MICRO_034_CANARY_CURRENCY = "USD";

export const MICRO_034_VISUAL_PROVIDERS = ["openai", "mock-image", "ffmpeg"] as const;

export function computeMicro034ProviderConfigRevision(): string {
  return computePayloadHash({
    scope: "micro-034.provider-config.v1",
    providers: MICRO_034_VISUAL_PROVIDERS,
    renderProfileRevision: MICRO_034_VISUAL_PROFILE_REVISION,
    estimatedCostMinorPerImage: MICRO_034_ESTIMATED_COST_MINOR_PER_IMAGE,
  });
}

export function resolveMicro034CanaryEpisodeCostMinorAllocations(): Record<
  (typeof MICRO_034_CANARY_EPISODE_IDS)[number],
  number
> {
  const perEpisode = Math.floor(
    MICRO_034_CANARY_COST_LIMIT_MINOR / MICRO_034_CANARY_EPISODE_IDS.length
  );
  let allocated = 0;
  const allocations = {} as Record<
    (typeof MICRO_034_CANARY_EPISODE_IDS)[number],
    number
  >;

  for (let index = 0; index < MICRO_034_CANARY_EPISODE_IDS.length; index += 1) {
    const episodeId = MICRO_034_CANARY_EPISODE_IDS[index]!;
    if (index === MICRO_034_CANARY_EPISODE_IDS.length - 1) {
      allocations[episodeId] = MICRO_034_CANARY_COST_LIMIT_MINOR - allocated;
      continue;
    }
    allocations[episodeId] = perEpisode;
    allocated += perEpisode;
  }

  return allocations;
}
