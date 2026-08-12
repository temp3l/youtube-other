import { computePayloadHash } from "@mediaforge/narrative-core";

import { proposeMicrodramaTtsCanaryCostLimitMinor } from "./microdrama-openai-tts-pricing-catalog.js";
import type { LocaleTtsModelConfiguration } from "@mediaforge/speech";

export const MICRO_033_CANARY_EPISODE_IDS = ["E001", "E002", "E003"] as const;

export const MICRO_033_CANARY_EPISODE_BILLABLE_CHARACTERS = {
  E001: 823,
  E002: 865,
  E003: 855,
} as const;

export const MICRO_033_CANARY_TOTAL_BILLABLE_CHARACTERS = 2543;
export const MICRO_033_CANARY_INITIAL_PROVIDER_SYNTHESES = 37;
export const MICRO_033_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS = 111;

export const MICRO_033_CANARY_COST_LIMIT_MINOR = 199;
export const MICRO_033_CANARY_CURRENCY = "USD";

export const MICRO_033_AUTHORIZATION_PACK_SCRIPT_REVISIONS = {
  E001: "rev.script.en-us.e001",
  E002: "rev.script.en-us.e002",
  E003: "rev.script.en-us.e003",
} as const;

export const MICRO_033_AUTHORIZATION_PACK_SCRIPT_HASHES = {
  E001: "810786522f12d2168fb30ae21840de0cce247966d0362d057db0b80920f64669",
  E002: "f6f6d234257ed88c08c0d504b9f4262da6730e5accc25ab3d642d5d3fd0d2f49",
  E003: "0f0b2983fc90cab8d0fb2d826282e2bea170f7f5e25fb4b376110037e9a78727",
} as const;

/** Pack file manifest SHA-256 from admitted script `contentHash` fields. */
export const MICRO_033_AUTHORIZATION_PACK_SCRIPT_FILE_HASHES = {
  E001: "f5403a5d87ef6bd4fbce2076963bca7153b387cb1a01e33f1858081cc33b31e6",
  E002: "43aad0048c56de9ac5a6998fb7f731e776f67b2a8b50d5ebaef6a029bef01ef1",
  E003: "c658e3141d34c5f2cd120080b01649c216530f1825ec2657d05a65f59afe5948",
} as const;

export const MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION: LocaleTtsModelConfiguration = {
  provider: "openai",
  model: "tts-1-hd",
  voice: "alloy",
  instructions: "Measured pacing for microdrama.",
  speed: 1,
};

export const MICRO_033_PROVIDER_VOICE_ID = "alloy" as const;

export function computeMicro033ProviderConfigRevision(
  modelConfiguration: LocaleTtsModelConfiguration = MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION
): string {
  return computePayloadHash(modelConfiguration);
}

export function resolveMicro033CanaryCostProposal(): ReturnType<
  typeof proposeMicrodramaTtsCanaryCostLimitMinor
> {
  return proposeMicrodramaTtsCanaryCostLimitMinor({
    billableCharacters: MICRO_033_CANARY_TOTAL_BILLABLE_CHARACTERS,
    initialProviderSyntheses: MICRO_033_CANARY_INITIAL_PROVIDER_SYNTHESES,
    maximumTotalProviderRequests: MICRO_033_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
  });
}

export function resolveMicro033CanaryEpisodeCostMinorAllocations(): Record<
  (typeof MICRO_033_CANARY_EPISODE_IDS)[number],
  number
> {
  const proposal = resolveMicro033CanaryCostProposal();
  let allocated = 0;
  const allocations = {} as Record<
    (typeof MICRO_033_CANARY_EPISODE_IDS)[number],
    number
  >;

  for (let index = 0; index < MICRO_033_CANARY_EPISODE_IDS.length; index += 1) {
    const episodeId = MICRO_033_CANARY_EPISODE_IDS[index];
    if (index === MICRO_033_CANARY_EPISODE_IDS.length - 1) {
      allocations[episodeId] = proposal.proposedMaximumCostMinor - allocated;
      continue;
    }
    const share = Math.floor(
      (proposal.proposedMaximumCostMinor *
        MICRO_033_CANARY_EPISODE_BILLABLE_CHARACTERS[episodeId]) /
        MICRO_033_CANARY_TOTAL_BILLABLE_CHARACTERS
    );
    allocations[episodeId] = share;
    allocated += share;
  }

  return allocations;
}
