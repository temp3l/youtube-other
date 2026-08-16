import { computePayloadHash } from "@mediaforge/narrative-core";

import { MICRO_033_CANARY_EPISODE_IDS } from "./micro-033-canary-bindings.js";
import { MICRO_034_VISUAL_PROFILE_REVISION } from "./micro-034-canary-bindings.js";
import { proposeMicrodramaTtsCanaryCostLimitMinor } from "./microdrama-openai-tts-pricing-catalog.js";

export const MICRO_035_CANARY_LOCALES = ["de-DE", "es-ES", "pt-BR"] as const;
export type Micro035CanaryLocale = (typeof MICRO_035_CANARY_LOCALES)[number];

export const MICRO_035_CANARY_EPISODE_IDS = MICRO_033_CANARY_EPISODE_IDS;

export const MICRO_035_AUTHORIZATION_PACK_SCRIPT_REVISIONS = {
  "de-DE": {
    E001: "rev.script.de-de.e001",
    E002: "rev.script.de-de.e002",
    E003: "rev.script.de-de.e003",
  },
  "es-ES": {
    E001: "rev.script.es-es.e001",
    E002: "rev.script.es-es.e002",
    E003: "rev.script.es-es.e003",
  },
  "pt-BR": {
    E001: "rev.script.pt-br.e001",
    E002: "rev.script.pt-br.e002",
    E003: "rev.script.pt-br.e003",
  },
} as const;

export const MICRO_035_AUTHORIZATION_PACK_SCRIPT_FILE_HASHES = {
  "de-DE": {
    E001: "1caf2470dc1ed8950843a2911c5043ce9f0c7a48685472883e0d2cb0369d22cb",
    E002: "f4a29add702baf486e2c32840f963197c1a738df293527541fe88e5cafcfe1df",
    E003: "686b62ad93b33945f5ccce2990ae77318c24e8333ab2bdb14c6657b01f70def6",
  },
  "es-ES": {
    E001: "aa2e416ab766ad09bb2d5e5e6f43e95cb12be1e5fb37348bf382b7eee5f51fb4",
    E002: "851012240954b714a87421371e31acabe7783a9180932f3284e313ff4d562a53",
    E003: "a4c1af17ab4e3e9ecb0175d7e5f112496f4d0673e20f00b385b1bb965c0cb1e0",
  },
  "pt-BR": {
    E001: "333adc4c4f350a6b069f9706da960170781a245f7a5a1cd0e4f42a0da0ebc3eb",
    E002: "cef4a3391d4ffe0ccf3d26ebe4f489ddc5aed338bb42b81ba99ff4cc49869bc0",
    E003: "16618d0199c43e7f9db8cf6406d4dbdafb09824a0354ccf0c62cd0292366a142",
  },
} as const;

/** Approved EN shared-visual revision hashes from MICRO-034 canary evidence. */
export const MICRO_035_SHARED_VISUAL_REVISION_IDS = {
  E001: "ce619e9b7d2443a9baad6153c81ee92cb297c50069e138ddd079d94506d3861b",
  E002: "b6cf995e9381069200964055e04f8ef157dbb7964c39257a0500cc650ecb02e1",
  E003: "ef26414c72453a14d81df753a25c6e19491fc08df7f9fc488cb7f3b226d4db83",
} as const;

export const MICRO_035_CANARY_EPISODE_BILLABLE_CHARACTERS: Record<
  Micro035CanaryLocale,
  Record<(typeof MICRO_035_CANARY_EPISODE_IDS)[number], number>
> = {
  "de-DE": { E001: 1909, E002: 1952, E003: 2037 },
  "es-ES": { E001: 1875, E002: 1949, E003: 2060 },
  "pt-BR": { E001: 1953, E002: 1927, E003: 2049 },
};

export const MICRO_035_CANARY_TOTAL_BILLABLE_CHARACTERS = 17_711;
export const MICRO_035_CANARY_INITIAL_PROVIDER_SYNTHESES = 333;
export const MICRO_035_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS = 400;
export const MICRO_035_CANARY_COST_LIMIT_MINOR = 2_999;
export const MICRO_035_CANARY_CURRENCY = "USD";

export const MICRO_035_VISUAL_PROFILE_REVISION = MICRO_034_VISUAL_PROFILE_REVISION;
export const MICRO_035_ESTIMATED_COST_MINOR_PER_IMAGE = 0;

export const MICRO_035_PRODUCTION_PROVIDERS = ["openai", "mock-image", "ffmpeg"] as const;

export function computeMicro035ProviderConfigRevision(): string {
  return computePayloadHash({
    scope: "micro-035.provider-config.v1",
    providers: MICRO_035_PRODUCTION_PROVIDERS,
    renderProfileRevision: MICRO_035_VISUAL_PROFILE_REVISION,
    estimatedCostMinorPerImage: MICRO_035_ESTIMATED_COST_MINOR_PER_IMAGE,
  });
}

export function resolveMicro035CanaryCostProposal(): ReturnType<
  typeof proposeMicrodramaTtsCanaryCostLimitMinor
> {
  return proposeMicrodramaTtsCanaryCostLimitMinor({
    billableCharacters: MICRO_035_CANARY_TOTAL_BILLABLE_CHARACTERS,
    initialProviderSyntheses: MICRO_035_CANARY_INITIAL_PROVIDER_SYNTHESES,
    maximumTotalProviderRequests: MICRO_035_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
  });
}

export function resolveMicro035CanaryEpisodeCostMinorAllocations(): Record<
  `${Micro035CanaryLocale}:${(typeof MICRO_035_CANARY_EPISODE_IDS)[number]}`,
  number
> {
  const proposal = resolveMicro035CanaryCostProposal();
  const keys = MICRO_035_CANARY_LOCALES.flatMap((locale) =>
    MICRO_035_CANARY_EPISODE_IDS.map((episodeId) => `${locale}:${episodeId}` as const)
  );
  let allocated = 0;
  const allocations = {} as Record<
    `${Micro035CanaryLocale}:${(typeof MICRO_035_CANARY_EPISODE_IDS)[number]}`,
    number
  >;

  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]!;
    const [locale, episodeId] = key.split(":") as [Micro035CanaryLocale, (typeof MICRO_035_CANARY_EPISODE_IDS)[number]];
    if (index === keys.length - 1) {
      allocations[key] = proposal.proposedMaximumCostMinor - allocated;
      continue;
    }
    const share = Math.floor(
      (proposal.proposedMaximumCostMinor *
        MICRO_035_CANARY_EPISODE_BILLABLE_CHARACTERS[locale][episodeId]) /
        MICRO_035_CANARY_TOTAL_BILLABLE_CHARACTERS
    );
    allocations[key] = share;
    allocated += share;
  }

  return allocations;
}

export function localeOutputSegment(locale: Micro035CanaryLocale): string {
  return locale.toLowerCase();
}
