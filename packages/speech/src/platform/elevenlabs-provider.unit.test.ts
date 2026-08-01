import { describe, expect, it, vi } from "vitest";
import { ElevenLabsSpeechProvider } from "./elevenlabs-provider.js";
import type { SpeechSynthesisRequest } from "./contracts.js";
import { SpeechDomainError } from "./errors.js";

const request: SpeechSynthesisRequest = {
  generationId: "spg_test",
  text: "A short narration.",
  forceRegeneration: false,
  profile: {
    profileId: "vp_test",
    profileVersionId: "vpv_test",
    language: "en",
    configuration: {
      provider: "elevenlabs",
      modelId: "eleven_multilingual_v2",
      voiceId: "voice_test",
      outputFormat: "mp3_44100_128",
      settings: {
        speed: 1,
        stability: 0.65,
        similarityBoost: 0.8,
        style: 0,
        useSpeakerBoost: true,
      },
      pronunciationDictionaryVersions: ["dictionary-version"],
      chunking: {
        targetCharacters: 4_000,
        hardMaximumCharacters: 8_000,
        previousContextCharacters: 400,
        nextContextCharacters: 400,
      },
    },
  },
};

describe("ElevenLabsSpeechProvider", () => {
  it("streams audio and maps supported profile fields to a typed provider request", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          "content-type": "audio/mpeg",
          "content-length": "3",
          "request-id": "req_123",
          "x-elevenlabs-character-count": "18",
        },
      })
    );
    const provider = new ElevenLabsSpeechProvider({
      apiKey: "test-key",
      featureEnabled: true,
      fetchImplementation,
    });

    const result = await provider.synthesize(request);

    expect(fetchImplementation).toHaveBeenCalledOnce();
    const [url, init] = fetchImplementation.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://api.elevenlabs.io/v1/text-to-speech/voice_test/stream?output_format=mp3_44100_128"
    );
    expect(init?.headers).toMatchObject({ "xi-api-key": "test-key" });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      text: request.text,
      model_id: "eleven_multilingual_v2",
      language_code: "en",
      voice_settings: { stability: 0.65, similarity_boost: 0.8, speed: 1 },
      pronunciation_dictionary_locators: [
        {
          pronunciation_dictionary_id: "dictionary-version",
          version_id: "dictionary-version",
        },
      ],
    });
    const chunks: Buffer[] = [];
    for await (const chunk of result.rawAudio) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(Buffer.from([1, 2, 3]));
    expect(result).toMatchObject({
      rawContentType: "audio/mpeg",
      providerRequestId: "req_123",
      actualBillableCharacters: 18,
    });
    expect(result.actualCredits).toBeUndefined();
  });

  it("does not fall back when ElevenLabs is disabled or rejects the request", async () => {
    const disabled = new ElevenLabsSpeechProvider({
      apiKey: "test-key",
      featureEnabled: false,
    });
    await expect(disabled.synthesize(request)).rejects.toMatchObject({
      code: "SPEECH_PROVIDER_DISABLED",
    } satisfies Partial<SpeechDomainError>);

    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ detail: "voice not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      })
    );
    const provider = new ElevenLabsSpeechProvider({
      apiKey: "test-key",
      featureEnabled: true,
      fetchImplementation,
    });
    await expect(provider.synthesize(request)).rejects.toMatchObject({
      code: "SPEECH_PROVIDER_REJECTED_INPUT",
      retryClass: "permanent",
    } satisfies Partial<SpeechDomainError>);
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it.each([
    [401, "SPEECH_PROVIDER_AUTHENTICATION_FAILED", "permanent"],
    [403, "SPEECH_PROVIDER_AUTHENTICATION_FAILED", "permanent"],
    [429, "SPEECH_PROVIDER_RATE_LIMITED", "retryable"],
    [500, "SPEECH_PROVIDER_UNAVAILABLE", "retryable"],
    [503, "SPEECH_PROVIDER_UNAVAILABLE", "retryable"],
  ] as const)("maps HTTP %i to %s", async (status, code, retryClass) => {
    const provider = new ElevenLabsSpeechProvider({
      apiKey: "test-key",
      featureEnabled: true,
      fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ detail: "provider diagnostic" }), {
          status,
          headers: { "content-type": "application/json" },
        })
      ),
    });
    await expect(provider.synthesize(request)).rejects.toMatchObject({
      code,
      retryClass,
    });
  });

  it("distinguishes timeout from caller cancellation", async () => {
    const abortingFetch = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async (_url, init) =>
          new Promise<Response>((_resolve, reject) =>
            init?.signal?.addEventListener(
              "abort",
              () => reject(new Error("aborted")),
              { once: true }
            )
          )
      );
    const timed = new ElevenLabsSpeechProvider({
      apiKey: "test-key",
      featureEnabled: true,
      requestTimeoutMs: 1,
      fetchImplementation: abortingFetch,
    });
    await expect(timed.synthesize(request)).rejects.toMatchObject({
      code: "SPEECH_PROVIDER_TIMEOUT",
      retryClass: "retryable",
    });

    const controller = new AbortController();
    controller.abort();
    const cancelled = new ElevenLabsSpeechProvider({
      apiKey: "test-key",
      featureEnabled: true,
      fetchImplementation: vi
        .fn<typeof fetch>()
        .mockRejectedValue(new Error("cancelled")),
    });
    await expect(
      cancelled.synthesize({ ...request, abortSignal: controller.signal })
    ).rejects.toMatchObject({
      code: "SPEECH_GENERATION_CANCELLED",
      retryClass: "cancelled",
    });
  });

  it("rejects invalid content types, declared oversize responses, and empty audio streams", async () => {
    const invalidType = new ElevenLabsSpeechProvider({
      apiKey: "test-key",
      featureEnabled: true,
      fetchImplementation: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response("not audio", {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        ),
    });
    await expect(invalidType.synthesize(request)).rejects.toMatchObject({
      code: "SPEECH_PROVIDER_INVALID_RESPONSE",
    });

    const oversized = new ElevenLabsSpeechProvider({
      apiKey: "test-key",
      featureEnabled: true,
      maxResponseBytes: 2,
      fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "audio/mpeg", "content-length": "3" },
        })
      ),
    });
    await expect(oversized.synthesize(request)).rejects.toMatchObject({
      code: "SPEECH_PROVIDER_INVALID_RESPONSE",
    });

    const empty = new ElevenLabsSpeechProvider({
      apiKey: "test-key",
      featureEnabled: true,
      fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(new Uint8Array(), {
          status: 200,
          headers: { "content-type": "audio/mpeg" },
        })
      ),
    });
    const emptyResult = await empty.synthesize(request);
    const consume = async () => {
      for await (const _chunk of emptyResult.rawAudio) {
        /* consume */
      }
    };
    await expect(consume()).rejects.toMatchObject({
      code: "SPEECH_PROVIDER_INVALID_RESPONSE",
    });
  });

  it("enforces streaming size limits when content-length is absent", async () => {
    const provider = new ElevenLabsSpeechProvider({
      apiKey: "test-key",
      featureEnabled: true,
      maxResponseBytes: 2,
      fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "audio/mpeg" },
        })
      ),
    });
    const result = await provider.synthesize(request);
    const consume = async () => {
      for await (const _chunk of result.rawAudio) {
        /* consume */
      }
    };
    await expect(consume()).rejects.toMatchObject({
      code: "SPEECH_PROVIDER_INVALID_RESPONSE",
    });
  });

  it("allows a missing request ID while extracting usage and chunk context", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([1]), {
        status: 200,
        headers: {
          "content-type": "audio/mpeg",
          "x-elevenlabs-character-count": "17",
          "x-elevenlabs-credits-used": "2.5",
        },
      })
    );
    const provider = new ElevenLabsSpeechProvider({
      apiKey: "test-key",
      featureEnabled: true,
      fetchImplementation,
    });
    const result = await provider.synthesize({
      ...request,
      chunk: { index: 1, previousContext: "Before.", nextContext: "After." },
    });
    expect(result.providerRequestId).toBeUndefined();
    expect(result.actualBillableCharacters).toBe(17);
    expect(result.actualCredits).toBe(2.5);
    expect(
      JSON.parse(String(fetchImplementation.mock.calls[0]?.[1]?.body))
    ).toMatchObject({
      previous_text: "Before.",
      next_text: "After.",
      pronunciation_dictionary_locators: [
        { pronunciation_dictionary_id: "dictionary-version" },
      ],
    });
  });

  it("rejects missing backend credentials before network dispatch", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    const provider = new ElevenLabsSpeechProvider({
      featureEnabled: true,
      fetchImplementation,
    });
    await expect(provider.synthesize(request)).rejects.toMatchObject({
      code: "SPEECH_PROVIDER_AUTHENTICATION_FAILED",
    });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
