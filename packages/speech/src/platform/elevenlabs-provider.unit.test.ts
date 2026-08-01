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
  });

  it("does not fall back when ElevenLabs is disabled or rejects the request", async () => {
    const disabled = new ElevenLabsSpeechProvider({
      apiKey: "test-key",
      featureEnabled: false,
    });
    await expect(disabled.synthesize(request)).rejects.toMatchObject({
      code: "SPEECH_PROVIDER_DISABLED",
    } satisfies Partial<SpeechDomainError>);

    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
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
});
