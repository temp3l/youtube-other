import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createSpeechCacheKey } from "./cache-key.js";
import { splitSpeechText } from "./chunking.js";
import { assertSpeechConsent } from "./consent.js";
import type {
  ResolvedSpeechProfile,
  SpeechProvider,
  SpeechSynthesisRequest,
} from "./contracts.js";
import { SpeechDomainError } from "./errors.js";
import { SpeechProviderRegistry } from "./registry.js";
import {
  assertSpeechGenerationTransition,
  failureStateForRetryClass,
} from "./state-machine.js";
import { VersionedSpeechProfileResolver } from "./profile-resolver.js";
import { AtomicSpeechQuotaGuard } from "./quota.js";
import { estimateSpeechCharacterPricing } from "./pricing.js";

const profile: ResolvedSpeechProfile = {
  profileId: "profile-1",
  profileVersionId: "profile-1-v1",
  language: "de",
  configuration: {
    provider: "elevenlabs",
    modelId: "eleven_multilingual_v2",
    voiceId: "voice-1",
    outputFormat: "mp3_44100_128",
    pronunciationDictionaryVersions: ["dictionary-v1"],
    settings: {
      speed: 1,
      stability: 0.65,
      similarityBoost: 0.8,
      style: 0,
      useSpeakerBoost: true,
    },
    chunking: {
      targetCharacters: 30,
      hardMaximumCharacters: 45,
      previousContextCharacters: 8,
      nextContextCharacters: 8,
    },
  },
};

describe("speech platform domain", () => {
  it("builds a stable NFC cache key and changes it for material inputs", () => {
    const composed = createSpeechCacheKey({ text: "Café", profile });
    const decomposed = createSpeechCacheKey({ text: "Cafe\u0301", profile });
    const changed = createSpeechCacheKey({
      text: "Café",
      profile: {
        ...profile,
        configuration: {
          ...profile.configuration,
          settings: { ...profile.configuration.settings, stability: 0.64 },
        },
      },
    });
    expect(composed.cacheKey).toBe(decomposed.cacheKey);
    expect(changed.cacheKey).not.toBe(composed.cacheKey);
    expect(composed.canonicalInput).toContain("speech-cache-key-v1");
  });

  it("chunks only at semantic boundaries where possible and preserves every character", () => {
    const text =
      "One short sentence. Two short sentence.\n\nA final paragraph, with a clause that can split if needed.";
    const chunks = splitSpeechText(text, profile.configuration.chunking);
    expect(chunks.map((chunk) => chunk.text).join("")).toBe(text);
    expect(chunks.every((chunk) => chunk.text.length <= 45)).toBe(true);
    expect(chunks[1]?.previousContext).toBeDefined();
    expect(chunks[0]?.nextContext).toBeDefined();
  });

  it("enforces cloned-voice consent without requiring it for OpenAI", () => {
    expect(() =>
      assertSpeechConsent({
        profile,
        channel: "youtube",
        now: new Date("2026-01-01T00:00:00Z"),
      })
    ).toThrow(/consent/i);
    expect(() =>
      assertSpeechConsent({
        profile,
        channel: "youtube",
        now: new Date("2026-01-01T00:00:00Z"),
        consent: {
          id: "consent",
          subjectName: "Subject",
          evidenceArtifactId: "artifact",
          evidenceSha256: "a".repeat(64),
          syntheticSpeechAllowed: true,
          commercialUseAllowed: true,
          multilingualUseAllowed: true,
          permittedChannels: ["youtube"],
          validFrom: new Date("2025-01-01T00:00:00Z"),
        },
      })
    ).not.toThrow();
    expect(() =>
      assertSpeechConsent({
        profile: {
          ...profile,
          configuration: {
            provider: "openai",
            model: "gpt-4o-mini-tts",
            voice: "onyx",
            speed: 1,
          },
        },
        channel: "youtube",
      })
    ).not.toThrow();
  });

  it("centralizes transitions, failure classes, and provider registration", async () => {
    expect(() =>
      assertSpeechGenerationTransition("SUCCEEDED", "GENERATING")
    ).toThrow(/Invalid/u);
    expect(failureStateForRetryClass("retryable")).toBe("RETRYABLE_FAILURE");
    const provider: SpeechProvider = {
      id: "openai",
      validateProfile: async () => undefined,
      estimate: async () => ({ billableCharacters: 1 }),
      synthesize: async (_request: SpeechSynthesisRequest) => ({
        rawAudio: Readable.from([]),
        rawContentType: "audio/wav",
      }),
    };
    const registry = new SpeechProviderRegistry([provider]);
    expect(registry.get("openai")).toBe(provider);
    expect(() => registry.get("elevenlabs")).toThrow(SpeechDomainError);
    await expect(
      provider.estimate({
        generationId: "generation",
        text: "x",
        profile: {
          ...profile,
          configuration: {
            provider: "openai",
            model: "gpt-4o-mini-tts",
            voice: "onyx",
            speed: 1,
          },
        },
        forceRegeneration: false,
      })
    ).resolves.toEqual({ billableCharacters: 1 });
  });

  it("resolves replacement, video, genre, then the OpenAI system default", async () => {
    const openAi = {
      ...profile,
      profileVersionId: "system",
      configuration: {
        provider: "openai",
        model: "gpt-4o-mini-tts",
        voice: "onyx",
        speed: 1,
      },
    } as const;
    const versions = new Map([
      ["system", { profile: openAi, status: "ACTIVE" as const }],
      [
        "genre",
        {
          profile: { ...profile, profileVersionId: "genre" },
          status: "ACTIVE" as const,
        },
      ],
      [
        "video",
        {
          profile: { ...profile, profileVersionId: "video" },
          status: "ACTIVE" as const,
        },
      ],
      [
        "replacement",
        {
          profile: { ...profile, profileVersionId: "replacement" },
          status: "ACTIVE" as const,
        },
      ],
    ]);
    const resolver = new VersionedSpeechProfileResolver({
      versions,
      videoOverrides: new Map([["v", "video"]]),
      genreDefaults: new Map([["g", "genre"]]),
      systemDefaultProfileVersionId: "system",
    });
    await expect(
      resolver.resolve({
        workspaceId: "w",
        videoId: "v",
        genreId: "g",
        language: "de",
      })
    ).resolves.toMatchObject({ profileVersionId: "video" });
    await expect(
      resolver.resolve({ workspaceId: "w", genreId: "g", language: "de" })
    ).resolves.toMatchObject({ profileVersionId: "genre" });
    await expect(
      resolver.resolve({ workspaceId: "w", language: "de" })
    ).resolves.toMatchObject({
      profileVersionId: "system",
      configuration: { provider: "openai" },
    });
    await expect(
      resolver.resolve({
        workspaceId: "w",
        videoId: "v",
        genreId: "g",
        language: "de",
        replacementProfileVersionId: "replacement",
      })
    ).resolves.toMatchObject({ profileVersionId: "replacement" });
  });

  it("serializes quota reservations and calculates versioned character pricing", async () => {
    const quota = new AtomicSpeechQuotaGuard([
      {
        scope: "provider",
        scopeId: "elevenlabs",
        monthlyHardLimitCharacters: 100,
      },
    ]);
    const outcomes = await Promise.allSettled([
      quota.reserve({
        generationId: "one",
        workspaceId: "w",
        provider: "elevenlabs",
        estimate: { billableCharacters: 60 },
      }),
      quota.reserve({
        generationId: "two",
        workspaceId: "w",
        provider: "elevenlabs",
        estimate: { billableCharacters: 60 },
      }),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled")
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === "rejected")
    ).toHaveLength(1);
    expect(
      estimateSpeechCharacterPricing(2_500, {
        id: "pricing-v1",
        provider: "elevenlabs",
        creditsPerThousandCharacters: 1,
        currencyAmountPerThousandCharacters: 0.2,
        currency: "usd",
        activeFrom: "2026-08-01T00:00:00Z",
      })
    ).toMatchObject({
      billableCharacters: 2_500,
      estimatedCredits: 2.5,
      estimatedCurrencyAmount: 0.5,
      currency: "USD",
    });
  });
});
