import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { SpeechSynthesisRequest, SpeechProvider } from "./index.js";
import { MockSpeechProvider } from "./index.js";
import { describe, expect, it } from "vitest";
import { buildEducationalSpeechPlan } from "./educational-speech-planning.js";
import { generateEducationalSpeech } from "./educational-speech-pipeline.js";
import { resolveSpeechDeliveryProfile } from "./speech-delivery-profile.js";

class FakeEducationalProvider implements SpeechProvider {
  readonly delegate = new MockSpeechProvider();
  calls = 0;
  readonly durationByPath = new Map<string, number>();

  async synthesize(request: SpeechSynthesisRequest, signal: AbortSignal) {
    this.calls += 1;
    this.durationByPath.set(
      request.outputPath,
      request.targetDurationSeconds ?? 2
    );
    return this.delegate.synthesize(request, signal);
  }
}

describe("educational speech pipeline integration", () => {
  it("generates, validates, joins, masters, resumes, and preserves candidate files with a fake provider", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "education-tts-"));
    const profile = resolveSpeechDeliveryProfile(
      "education-natural-teacher",
      "en",
      { targetWordsPerMinute: 150 }
    );
    const plan = buildEducationalSpeechPlan({
      episodeId: "fake-provider-lesson",
      profile,
      beats: [
        {
          id: "intro",
          kind: "introduction",
          displayText: "2 + 3 = 5",
          spokenText:
            "Let us add 2 and 3 carefully. The board keeps the original values visible while we explain the operation.",
          writingBehavior: "overlap-narration",
        },
        {
          id: "explain",
          kind: "explanation",
          displayText: "2 + 3",
          spokenText:
            "Starting at 2 and moving 3 places forward gives 5. Notice that addition combines the two quantities.",
          writingBehavior: "overlap-narration",
        },
        {
          id: "answer",
          kind: "final-answer",
          displayText: "5",
          spokenText:
            "The final answer is 5. We can check it by counting 2 objects and then 3 more objects.",
          writingBehavior: "overlap-narration",
        },
      ],
      createdAt: "2026-07-13T10:00:00.000Z",
    });
    const provider = new FakeEducationalProvider();
    let assembledDuration = 0;
    const runFfmpeg = async (args: readonly string[]) => {
      const inputIndex = args.indexOf("-i");
      const source = args[inputIndex + 1];
      const target = args.at(-1);
      if (!source || !target) throw new Error("Fake FFmpeg arguments are incomplete.");
      await fs.copyFile(source, target);
    };
    const probeAudio = async (filePath: string) => {
      const direct = provider.durationByPath.get(filePath);
      if (direct !== undefined)
        return { durationSeconds: direct, sampleRate: 24_000, channels: 1 };
      assembledDuration =
        assembledDuration ||
        plan.chunks.reduce(
          (sum, chunk) => sum + chunk.estimatedDurationMs / 1000,
          0
        );
      return { durationSeconds: assembledDuration, sampleRate: 48_000, channels: 1 };
    };
    const request = {
      plan,
      profile,
      pronunciationDictionaries: [],
      providerId: "fake" as const,
      provider,
      outputRoot: root,
      candidateCount: 2 as const,
      runFfmpeg,
      probeAudio,
    };
    const first = await generateEducationalSpeech(request);
    expect(first.status).toBe("completed");
    if (first.status !== "completed") throw new Error("Expected completion.");
    expect(first.workflow.status).toBe("completed");
    expect(first.workflow.providerRequestCount).toBeGreaterThan(0);
    expect(first.workflow.chunks.flatMap((chunk) => chunk.candidates).some((candidate) => candidate.candidateIndex === 2)).toBe(true);
    expect((await fs.stat(path.join(root, "narration.wav"))).size).toBeGreaterThan(44);
    const callsAfterFirst = provider.calls;
    const second = await generateEducationalSpeech(request);
    expect(second.status).toBe("completed");
    expect(provider.calls).toBe(callsAfterFirst);
    if (second.status !== "completed") throw new Error("Expected cache completion.");
    expect(second.workflow.cacheHit).toBe(true);
  });
});
