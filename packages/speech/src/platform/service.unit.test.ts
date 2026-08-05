import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { ResolvedSpeechProfile, SpeechProvider } from "./contracts.js";
import { SpeechDomainError } from "./errors.js";
import { VersionedSpeechProfileResolver } from "./profile-resolver.js";
import { SpeechProviderRegistry } from "./registry.js";
import {
  SpeechGenerationService,
  type SpeechArtifactService,
  type SpeechCacheClaim,
  type SpeechGenerationResult,
  type SpeechGenerationStore,
  type SpeechQuotaGuard,
  type SpeechUsageLedger,
} from "./service.js";

const profile: ResolvedSpeechProfile = {
  profileId: "openai-default",
  profileVersionId: "openai-default-v1",
  language: "en",
  configuration: {
    provider: "openai",
    model: "gpt-4o-mini-tts",
    voice: "onyx",
    speed: 1,
    outputFormat: "wav",
    chunking: {
      targetCharacters: 30,
      hardMaximumCharacters: 60,
      previousContextCharacters: 0,
      nextContextCharacters: 0,
    },
  },
};

const germanProfile: ResolvedSpeechProfile = { ...profile, language: "de" };

class MemoryGenerationStore implements SpeechGenerationStore {
  private readonly cache = new Map<string, SpeechGenerationResult>();
  private readonly owners = new Map<string, Promise<SpeechGenerationResult>>();
  private readonly resolveOwner = new Map<
    string,
    (result: SpeechGenerationResult) => void
  >();
  private readonly generationCache = new Map<string, string>();
  private readonly successfulChunks = new Map<
    string,
    NonNullable<Parameters<SpeechGenerationStore["recordChunk"]>[0]["artifact"]>
  >();

  public async claim(
    input: Parameters<SpeechGenerationStore["claim"]>[0]
  ): Promise<SpeechCacheClaim> {
    this.generationCache.set(input.command.generationId, input.cacheKey);
    if (input.command.forceRegeneration) return { kind: "owner" };
    const cached = this.cache.get(input.cacheKey);
    if (cached) return { kind: "hit", result: cached };
    if (this.owners.has(input.cacheKey)) return { kind: "wait" };
    this.owners.set(
      input.cacheKey,
      new Promise((resolve) => this.resolveOwner.set(input.cacheKey, resolve))
    );
    return { kind: "owner" };
  }
  public async waitFor(cacheKey: string): Promise<SpeechGenerationResult> {
    const owner = this.owners.get(cacheKey);
    if (!owner) throw new Error("cache owner missing");
    return owner;
  }
  public async renewLease(): Promise<void> {}
  public async transition(): Promise<void> {}
  public async recordChunk(
    input: Parameters<SpeechGenerationStore["recordChunk"]>[0]
  ): Promise<void> {
    if (input.artifact)
      this.successfulChunks.set(
        `${input.generationId}:${input.chunk.index}:${input.chunk.textSha256}`,
        input.artifact
      );
  }
  public async reusableChunk(
    input: Parameters<NonNullable<SpeechGenerationStore["reusableChunk"]>>[0]
  ) {
    return (
      this.successfulChunks.get(
        `${input.generationId}:${input.chunk.index}:${input.chunk.textSha256}`
      ) ?? null
    );
  }
  public async complete(result: SpeechGenerationResult): Promise<void> {
    this.cache.set(result.cacheKey, result);
    this.resolveOwner.get(result.cacheKey)?.(result);
    this.resolveOwner.delete(result.cacheKey);
    this.owners.delete(result.cacheKey);
  }
  public async recordCacheHit(
    input: Parameters<SpeechGenerationStore["recordCacheHit"]>[0]
  ): Promise<SpeechGenerationResult> {
    return {
      ...input.source,
      generationId: input.generationId,
      cacheHit: true,
      actualBillableCharacters: 0,
      actualCredits: 0,
    };
  }
}

function fixture(
  provider: SpeechProvider = {
    id: "openai",
    validateProfile: async () => undefined,
    estimate: async (request) => ({
      billableCharacters: [...request.text].length,
      estimatedCredits: 1,
    }),
    synthesize: vi.fn(async (request) => ({
      rawAudio: Readable.from([Buffer.from(request.text)]),
      rawContentType: "audio/wav",
      actualBillableCharacters: [...request.text].length,
      providerRequestId: `request-${request.chunk?.index ?? 0}`,
    })),
  },
  profileOverride: ResolvedSpeechProfile = profile
): {
  readonly service: SpeechGenerationService;
  readonly provider: SpeechProvider;
  readonly usage: ReturnType<typeof vi.fn>;
  readonly reserve: ReturnType<typeof vi.fn>;
} {
  const store = new MemoryGenerationStore();
  const resolver = new VersionedSpeechProfileResolver({
    versions: new Map([
      [profileOverride.profileVersionId, { profile: profileOverride, status: "ACTIVE" }],
    ]),
    videoOverrides: new Map(),
    genreDefaults: new Map(),
    systemDefaultProfileVersionId: profileOverride.profileVersionId,
  });
  const reserve = vi.fn(async () => ({ reservationId: "reservation" }));
  const quota: SpeechQuotaGuard = {
    reserve,
    reconcile: async () => undefined,
    release: async () => undefined,
  };
  const artifacts: SpeechArtifactService = {
    async persistRaw(input) {
      const buffers: Buffer[] = [];
      for await (const chunk of input.audio) buffers.push(Buffer.from(chunk));
      const bytes = Buffer.concat(buffers);
      return {
        artifactId: `speech/raw/${input.generationId}/${input.chunkIndex}.wav`,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        contentType: input.contentType,
      };
    },
    async createCanonicalMaster(input) {
      return {
        artifactId: `speech/master/${input.generationId}.flac`,
        sha256: "a".repeat(64),
        contentType: "audio/flac",
      };
    },
  };
  const usage = vi.fn(async () => undefined);
  const ledger: SpeechUsageLedger = { record: usage };
  return {
    service: new SpeechGenerationService({
      providers: new SpeechProviderRegistry([provider]),
      profiles: resolver,
      generations: store,
      quotas: quota,
      artifacts,
      usage: ledger,
      retryBaseDelayMs: 1,
      sleep: async () => undefined,
      random: () => 0,
    }),
    provider,
    usage,
    reserve,
  };
}

const command = (generationId: string, forceRegeneration = false) => ({
  generationId,
  workspaceId: "workspace",
  videoId: "video",
  genreId: "documentary",
  language: "en",
  text: "First sentence. Second sentence. Third sentence.",
  channel: "youtube",
  forceRegeneration,
});

describe("SpeechGenerationService", () => {
  it("deduplicates concurrent identical generations and records zero provider usage for the waiter", async () => {
    const test = fixture();
    const [first, second] = await Promise.all([
      test.service.generate(command("generation-1")),
      test.service.generate(command("generation-2")),
    ]);
    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(test.provider.synthesize).toHaveBeenCalledTimes(3);
    expect(test.reserve).toHaveBeenCalledTimes(1);
    expect(test.usage).toHaveBeenCalledTimes(2);
    expect(test.usage.mock.calls[1]?.[0]).toMatchObject({
      cacheHit: true,
      actualBillableCharacters: 0,
      actualCredits: 0,
    });
  });

  it("forces a distinct lineage without overwriting the reusable cache identity", async () => {
    const test = fixture();
    const first = await test.service.generate(command("generation-1"));
    const forced = await test.service.generate({
      ...command("generation-2", true),
      supersedesGenerationId: first.generationId,
    });
    expect(forced.cacheKey).toBe(first.cacheKey);
    expect(forced.generationId).not.toBe(first.generationId);
    expect(forced.cacheHit).toBe(false);
    expect(test.provider.synthesize).toHaveBeenCalledTimes(6);
  });

  it("sends natural German cardinals to the provider while preserving the source command", async () => {
    const synthesize = vi.fn<SpeechProvider["synthesize"]>(async (request) => ({
      rawAudio: Readable.from([Buffer.from(request.text)]),
      rawContentType: "audio/wav",
      actualBillableCharacters: [...request.text].length,
    }));
    const estimate = vi.fn<SpeechProvider["estimate"]>(async (request) => ({
      billableCharacters: [...request.text].length,
    }));
    const test = fixture({ id: "openai", validateProfile: async () => undefined, estimate, synthesize }, germanProfile);
    const source = { ...command("german-numbers"), language: "de", text: "12 Kinder und 15 Erwachsene." };
    await test.service.generate(source);
    expect(estimate).toHaveBeenCalledWith(expect.objectContaining({ text: "zwölf Kinder und fünfzehn Erwachsene." }));
    expect(synthesize).toHaveBeenCalledWith(expect.objectContaining({ text: "zwölf Kinder und fünfzehn Erwachsene." }));
    expect(source.text).toBe("12 Kinder und 15 Erwachsene.");
  });

  it("keeps identifiers and explicit digit annotations intentional in German provider requests", async () => {
    const synthesize = vi.fn<SpeechProvider["synthesize"]>(async (request) => ({ rawAudio: Readable.from([]), rawContentType: "audio/wav" }));
    const test = fixture({ id: "openai", validateProfile: async () => undefined, estimate: async () => ({ billableCharacters: 1 }), synthesize }, germanProfile);
    await test.service.generate({ ...command("german-identifiers"), language: "de", text: "Raum 237. Code [[numeric:digits:12]]." });
    expect(synthesize).toHaveBeenCalledWith(expect.objectContaining({ text: "Raum 237. Code eins zwei." }));
  });

  it("does not invoke another provider after an explicitly selected provider fails", async () => {
    const selected: SpeechProvider = {
      id: "openai",
      validateProfile: async () => undefined,
      estimate: async () => ({ billableCharacters: 10 }),
      synthesize: async () => {
        throw new SpeechDomainError(
          "SPEECH_PROVIDER_REJECTED_INPUT",
          "rejected"
        );
      },
    };
    const other = {
      ...selected,
      id: "elevenlabs" as const,
      synthesize: vi.fn(selected.synthesize),
    };
    const test = fixture(selected);
    (
      test.service as unknown as {
        options: { providers: SpeechProviderRegistry };
      }
    ).options.providers.register(other);
    await expect(
      test.service.generate(command("failed"))
    ).rejects.toMatchObject({ code: "SPEECH_PROVIDER_REJECTED_INPUT" });
    expect(other.synthesize).not.toHaveBeenCalled();
  });

  it("reuses successful chunks and retries only failed or unattempted chunks", async () => {
    const synthesize = vi.fn<SpeechProvider["synthesize"]>(async (request) => {
      if (request.generationId === "generation-1" && request.chunk?.index === 1)
        throw new SpeechDomainError(
          "SPEECH_PROVIDER_REJECTED_INPUT",
          "chunk failed"
        );
      return {
        rawAudio: Readable.from([Buffer.from(request.text)]),
        rawContentType: "audio/wav",
        actualBillableCharacters: [...request.text].length,
        providerRequestId: `request-${request.generationId}-${request.chunk?.index ?? 0}`,
      };
    });
    const test = fixture({
      id: "openai",
      validateProfile: async () => undefined,
      estimate: async (request) => ({
        billableCharacters: [...request.text].length,
      }),
      synthesize,
    });

    await expect(
      test.service.generate(command("generation-1"))
    ).rejects.toMatchObject({ code: "SPEECH_PROVIDER_REJECTED_INPUT" });
    const retried = await test.service.generate({
      ...command("generation-2", true),
      supersedesGenerationId: "generation-1",
      reuseSuccessfulChunksFromGenerationId: "generation-1",
    });

    expect(retried.state).toBe("SUCCEEDED");
    expect(
      synthesize.mock.calls
        .filter(([request]) => request.generationId === "generation-2")
        .map(([request]) => request.chunk?.index)
    ).toEqual([1, 2]);
    expect(test.usage).toHaveBeenCalledTimes(2);
    const partialUsage = test.usage.mock.calls[0]?.[0];
    expect(partialUsage).toMatchObject({ cacheHit: false });
    expect(partialUsage?.actualBillableCharacters).toBeGreaterThan(0);
    expect(partialUsage?.actualBillableCharacters).toBeLessThan(
      [...command("unused").text].length
    );
  });
});
