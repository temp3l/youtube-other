import { computePayloadHash } from "@mediaforge/narrative-core";

import { MICRO_034_VISUAL_PROFILE_REVISION } from "./micro-034-canary-bindings.js";
import { proposeMicrodramaTtsCanaryCostLimitMinor } from "./microdrama-openai-tts-pricing-catalog.js";

export const MICRO_036_BATCH_EPISODE_IDS = [
  "E004",
  "E005",
  "E006",
  "E007",
  "E008",
  "E009",
  "E010",
] as const;

export type Micro036BatchEpisodeId = (typeof MICRO_036_BATCH_EPISODE_IDS)[number];

export const MICRO_036_BATCH_LOCALES = ["en-US", "de-DE", "es-ES", "pt-BR"] as const;
export type Micro036BatchLocale = (typeof MICRO_036_BATCH_LOCALES)[number];

export type Micro036NonEnLocale = Exclude<Micro036BatchLocale, "en-US">;

export const MICRO_036_NON_EN_LOCALES = ["de-DE", "es-ES", "pt-BR"] as const;

export const MICRO_036_AUTHORIZATION_PACK_SCRIPT_REVISIONS = {
  "en-US": {
    E004: "rev.script.en-us.e004",
    E005: "rev.script.en-us.e005",
    E006: "rev.script.en-us.e006",
    E007: "rev.script.en-us.e007",
    E008: "rev.script.en-us.e008",
    E009: "rev.script.en-us.e009",
    E010: "rev.script.en-us.e010",
  },
  "de-DE": {
    E004: "rev.script.de-de.e004",
    E005: "rev.script.de-de.e005",
    E006: "rev.script.de-de.e006",
    E007: "rev.script.de-de.e007",
    E008: "rev.script.de-de.e008",
    E009: "rev.script.de-de.e009",
    E010: "rev.script.de-de.e010",
  },
  "es-ES": {
    E004: "rev.script.es-es.e004",
    E005: "rev.script.es-es.e005",
    E006: "rev.script.es-es.e006",
    E007: "rev.script.es-es.e007",
    E008: "rev.script.es-es.e008",
    E009: "rev.script.es-es.e009",
    E010: "rev.script.es-es.e010",
  },
  "pt-BR": {
    E004: "rev.script.pt-br.e004",
    E005: "rev.script.pt-br.e005",
    E006: "rev.script.pt-br.e006",
    E007: "rev.script.pt-br.e007",
    E008: "rev.script.pt-br.e008",
    E009: "rev.script.pt-br.e009",
    E010: "rev.script.pt-br.e010",
  },
} as const;

/** Pack file manifest SHA-256 from admitted script `contentHash` fields. */
export const MICRO_036_AUTHORIZATION_PACK_SCRIPT_FILE_HASHES = {
  "en-US": {
    E004: "6670a03b6b84a15801ddac26a4ca356efa3ba8fb32f21718a2f0c991cd738f02",
    E005: "53caff34e7ae8a2242b198c2739f4574ee7fc0cf9d1d65aa620ba72302c10509",
    E006: "0c0659f176bd1f6a5431cf24d769ea2cf275524ba6b2e52afa490d9bdf023832",
    E007: "6bf4db0e122314492e74d4295ddb0cc9f7b58f23d26c81e89cc7d270335a2fc3",
    E008: "ac00418735ca583ab0e3f443d7aaadde7f4df0a5a3de2e3fead7ccd9f4644aea",
    E009: "34a3ac7e7e511fc885f91392e413041a0662df67c86f6bc3b34f607f8307dc47",
    E010: "0caf2488e838d21f75ebdeff168ed642dd0c7511d9c888c05384baca5d7aab92",
  },
  "de-DE": {
    E004: "09463619aae278071027f0aaeaf819a8cbf42a1e7d814ad21f998422aef6797d",
    E005: "d57276f4a133e81ae99bd829906667122662dd73d841f35c10440e4231b0eb3d",
    E006: "571e1eb545b5d48c7eaec4f3ff72bfd6745463a02888f31b789255e621f1460f",
    E007: "10aa07a91c2f9d6a5d75197c25276ceacdb33528953820b77d360d8ee301565b",
    E008: "5b5a9fee12915a0369323ac059dc3fb2d34e3cb9e62aa4c083139242c4d0f74e",
    E009: "63af8158582fc744b66d3dd71484ed22f1c3fa8b8212f13718eeb4db3263a082",
    E010: "5cd6f908ecdff2f8bce665673b0a99fc05f8905baf8ce5f7423b8706909d4800",
  },
  "es-ES": {
    E004: "b73cd389f2d83a7f1abb7f3e160efefe3399d3bcefc26c3cfa6fe65cf461ab58",
    E005: "d86db44f628c4b6cb1b4a548a58e58db12cae30dbebcda8bd21315c5c518d89a",
    E006: "e5a04e7c0e45e9e54e4583a10c552016f656286ead924eeae8307d326d2bed1c",
    E007: "4ea207b8ef2c67eb32887787dd8a93dd455b4984afd4d1b56b54878a220eebe0",
    E008: "7a3b0d8e112c26e1432ec920b680d76dabe0b7f57593b1d0b04b7bcdf4423d2b",
    E009: "3549cb0dc8357a8df818cc3fc494ce3f630b69fbd50d350c2f2dd77f5cb7c2ff",
    E010: "88f0984e8ab8fa70306d028ce8592a40c4a4de7b029b66db48d9ed69efbab07f",
  },
  "pt-BR": {
    E004: "74e1525004a09160ef8614c8b4fc83d8b7327d82795319496db9f35a6cc65b2f",
    E005: "49b31b473b30eef0e852f84f1e743ace8397621154571532829b33b7d897304b",
    E006: "80498bc4505131ea88549d409d345795305e226ae48fcae7b4011499f7fdc77e",
    E007: "a6c5122e2df81802d6f6e5348afdfee5b0e7120ed83cbf5df3e91f41da85e0c9",
    E008: "c0afe8ffc9aced62c78b76e861170b895cc8ebe048e4f951f9d45bb1da7fc682",
    E009: "5526abb69c7b896d50faafb24b96003a5a70262d08985e5215598f2aa3043191",
    E010: "3bfebf1ab9c5b77aa0ba976da11dcbaa6a5ce263574ef252653bd1cc4de994f8",
  },
} as const;

export const MICRO_036_BATCH_EPISODE_BILLABLE_CHARACTERS: Record<
  Micro036BatchLocale,
  Record<Micro036BatchEpisodeId, number>
> = {
  "en-US": {
    E004: 949,
    E005: 872,
    E006: 905,
    E007: 888,
    E008: 952,
    E009: 947,
    E010: 892,
  },
  "de-DE": {
    E004: 997,
    E005: 909,
    E006: 941,
    E007: 914,
    E008: 918,
    E009: 949,
    E010: 912,
  },
  "es-ES": {
    E004: 957,
    E005: 831,
    E006: 857,
    E007: 902,
    E008: 887,
    E009: 921,
    E010: 902,
  },
  "pt-BR": {
    E004: 903,
    E005: 884,
    E006: 834,
    E007: 879,
    E008: 930,
    E009: 966,
    E010: 913,
  },
};

export const MICRO_036_BATCH_TOTAL_BILLABLE_CHARACTERS = 25_511;
export const MICRO_036_BATCH_INITIAL_PROVIDER_SYNTHESES = 480;
export const MICRO_036_BATCH_MAXIMUM_TOTAL_PROVIDER_REQUESTS = 2_000;
export const MICRO_036_BATCH_COST_LIMIT_MINOR = 9_999;
export const MICRO_036_BATCH_CURRENCY = "USD";

export const MICRO_036_VISUAL_PROFILE_REVISION = MICRO_034_VISUAL_PROFILE_REVISION;
export const MICRO_036_ESTIMATED_COST_MINOR_PER_IMAGE = 25;

export const MICRO_036_PRODUCTION_PROVIDERS = ["openai", "mock-image", "ffmpeg"] as const;

export function isMicro036BatchEpisodeId(episodeId: string): episodeId is Micro036BatchEpisodeId {
  return (MICRO_036_BATCH_EPISODE_IDS as readonly string[]).includes(episodeId);
}

export function isMicro036OutOfScopeEpisodeId(episodeId: string): boolean {
  const match = /^E(\d{3})$/u.exec(episodeId);
  if (!match) {
    return false;
  }
  const episodeNumber = Number.parseInt(match[1]!, 10);
  return episodeNumber >= 11;
}

export function computeMicro036ProviderConfigRevision(): string {
  return computePayloadHash({
    scope: "micro-036.provider-config.v1",
    providers: MICRO_036_PRODUCTION_PROVIDERS,
    renderProfileRevision: MICRO_036_VISUAL_PROFILE_REVISION,
    estimatedCostMinorPerImage: MICRO_036_ESTIMATED_COST_MINOR_PER_IMAGE,
  });
}

export function resolveMicro036BatchCostProposal(): ReturnType<
  typeof proposeMicrodramaTtsCanaryCostLimitMinor
> {
  return proposeMicrodramaTtsCanaryCostLimitMinor({
    billableCharacters: MICRO_036_BATCH_TOTAL_BILLABLE_CHARACTERS,
    initialProviderSyntheses: MICRO_036_BATCH_INITIAL_PROVIDER_SYNTHESES,
    maximumTotalProviderRequests: MICRO_036_BATCH_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
  });
}

export function resolveMicro036BatchEpisodeCostMinorAllocations(): Record<
  `${Micro036BatchLocale}:${Micro036BatchEpisodeId}`,
  number
> {
  const keys = MICRO_036_BATCH_LOCALES.flatMap((locale) =>
    MICRO_036_BATCH_EPISODE_IDS.map((episodeId) => `${locale}:${episodeId}` as const)
  );
  let allocated = 0;
  const allocations = {} as Record<
    `${Micro036BatchLocale}:${Micro036BatchEpisodeId}`,
    number
  >;

  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]!;
    const [locale, episodeId] = key.split(":") as [
      Micro036BatchLocale,
      Micro036BatchEpisodeId,
    ];
    if (index === keys.length - 1) {
      allocations[key] = MICRO_036_BATCH_COST_LIMIT_MINOR - allocated;
      continue;
    }
    const share = Math.floor(
      (MICRO_036_BATCH_COST_LIMIT_MINOR *
        MICRO_036_BATCH_EPISODE_BILLABLE_CHARACTERS[locale][episodeId]) /
        MICRO_036_BATCH_TOTAL_BILLABLE_CHARACTERS
    );
    allocations[key] = share;
    allocated += share;
  }

  return allocations;
}

export function localeOutputSegment(locale: Micro036BatchLocale): string {
  return locale.toLowerCase();
}
