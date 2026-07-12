import fs from "node:fs/promises";
import path from "node:path";
import { sceneIdSchema } from "@mediaforge/domain";
import {
  canonicalHash,
  createNarrationDrivenTiming,
  localizedNarrationSchema,
  MATH_SPEECH_FORMAT_VERSION,
  type LocalizedNarration,
  type NarrationAudioTiming,
  type TimingManifest,
} from "@mediaforge/math-education";
import { runCommand, runCommandJson } from "@mediaforge/process-runner";
import {
  copyAtomic,
  hashFile,
  writeJsonAtomic,
} from "@mediaforge/shared";
import { MockSpeechProvider } from "@mediaforge/speech";
import { z } from "zod";

export const MATH_MOCK_TTS_VERSION = "math-mock-tts.v1";
const MATH_MOCK_VOICE_PROFILE = {
  id: "math-local-mock-v1",
  label: "Math local mock",
  gender: "neutral" as const,
  style: "deterministic-test-tone",
  paceWpm: 120,
};
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
export const mathTtsArtifactSchema = z.strictObject({
  artifactVersion: z.literal("math-tts.v1"),
  provider: z.literal("mock-speech.v1"),
  paidProviderCalled: z.literal(false),
  narrationHash: hashSchema,
  targetDurationSeconds: z.number().min(180).max(300),
  segments: z
    .array(
      z.strictObject({
        segmentId: z.string().regex(/^segment-\d{3}$/u),
        sceneId: z.string().regex(/^scene-\d{3}$/u),
        filePath: z.string().min(1),
        durationSeconds: z.number().positive(),
        sha256: hashSchema,
        cacheKey: hashSchema,
        cacheHit: z.boolean(),
      })
    )
    .length(9),
  masterAudioPath: z.string().min(1),
  masterAudioSha256: hashSchema,
  durationSeconds: z.number().min(180).max(300),
  contentHash: hashSchema,
});
export type MathTtsArtifact = z.infer<typeof mathTtsArtifactSchema>;

const wavProbeSchema = z.strictObject({
  streams: z.array(
    z.looseObject({
      codec_type: z.string().optional(),
      sample_rate: z.string().optional(),
      channels: z.number().optional(),
      duration: z.string().optional(),
    })
  ),
  format: z.looseObject({ duration: z.string().optional() }),
});

async function probeMockWav(filePath: string): Promise<number> {
  const probe = await runCommandJson(
    "ffprobe",
    [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_streams",
      "-show_format",
      filePath,
    ],
    { timeoutMs: 30_000 },
    (raw) => wavProbeSchema.parse(raw)
  );
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  const duration = Number(audio?.duration ?? probe.format.duration ?? "0");
  if (
    !audio ||
    audio.sample_rate !== "24000" ||
    audio.channels !== 1 ||
    !Number.isFinite(duration) ||
    duration <= 0
  )
    throw new Error(`Invalid local mock TTS WAV artifact: ${filePath}`);
  return duration;
}

function segmentFrames(narration: LocalizedNarration, targetSeconds: number): number[] {
  if (!Number.isInteger(targetSeconds) || targetSeconds < 180 || targetSeconds > 300)
    throw new Error("Mock TTS target duration must be an integer from 180 through 300 seconds.");
  const totalFrames = targetSeconds * 30;
  const minimumFrames = 60;
  const distributable = totalFrames - minimumFrames * narration.segments.length;
  const weights = narration.segments.map(
    (segment) => segment.spokenText.trim().split(/\s+/u).filter(Boolean).length || 1
  );
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let assigned = 0;
  return weights.map((weight, index) => {
    const frames =
      index === weights.length - 1
        ? totalFrames - assigned
        : minimumFrames + Math.floor((distributable * weight) / totalWeight);
    assigned += frames;
    return frames;
  });
}

export async function generateLocalMockTts(args: {
  narration: LocalizedNarration;
  targetDurationSeconds: 180 | 240 | 300;
  outputDir: string;
  cacheDir?: string;
}): Promise<{ artifact: MathTtsArtifact; timing: TimingManifest }> {
  const narration = localizedNarrationSchema.parse(args.narration);
  const outputDir = path.resolve(args.outputDir);
  const cacheDir = path.resolve(args.cacheDir ?? path.join(outputDir, ".cache"));
  const segmentDir = path.join(outputDir, "segments");
  await Promise.all([
    fs.mkdir(segmentDir, { recursive: true }),
    fs.mkdir(cacheDir, { recursive: true }),
  ]);
  const provider = new MockSpeechProvider();
  const frames = segmentFrames(narration, args.targetDurationSeconds);
  const segments: MathTtsArtifact["segments"][number][] = [];
  const audioTiming: NarrationAudioTiming[] = [];
  for (const [index, segment] of narration.segments.entries()) {
    const targetFrames = frames[index];
    if (!targetFrames) throw new Error(`Missing mock TTS duration for ${segment.segmentId}.`);
    const cacheKey = canonicalHash({
      version: MATH_MOCK_TTS_VERSION,
      speechFormatVersion: MATH_SPEECH_FORMAT_VERSION,
      voiceProfile: MATH_MOCK_VOICE_PROFILE,
      narrationHash: narration.contentHash,
      segmentId: segment.segmentId,
      spokenText: segment.spokenText,
      targetFrames,
      sampleRate: 24_000,
    });
    const cachedPath = path.join(cacheDir, `${cacheKey}.wav`);
    let cacheHit = false;
    try {
      await probeMockWav(cachedPath);
      cacheHit = true;
    } catch {
      await provider.synthesize(
        {
          sceneId: sceneIdSchema.parse(segment.sceneId),
          text: segment.spokenText,
          voiceProfile: MATH_MOCK_VOICE_PROFILE,
          outputPath: cachedPath,
          targetDurationSeconds: targetFrames / 30,
          requestFingerprint: cacheKey,
        },
        new AbortController().signal
      );
    }
    const filePath = path.join(segmentDir, `${segment.segmentId}.wav`);
    await copyAtomic(cachedPath, filePath);
    const durationSeconds = await probeMockWav(filePath);
    const sha256 = await hashFile(filePath);
    segments.push({
      segmentId: segment.segmentId,
      sceneId: segment.sceneId,
      filePath,
      durationSeconds,
      sha256,
      cacheKey,
      cacheHit,
    });
    audioTiming.push({
      segmentId: segment.segmentId,
      sceneId: segment.sceneId,
      durationSeconds,
    });
  }
  const masterAudioPath = path.join(outputDir, "narration.wav");
  const ffmpegInputs = segments.flatMap((segment) => ["-i", segment.filePath]);
  const concatInputs = segments.map((_, index) => `[${index}:a]`).join("");
  await runCommand(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      ...ffmpegInputs,
      "-filter_complex",
      `${concatInputs}concat=n=${segments.length}:v=0:a=1[out]`,
      "-map",
      "[out]",
      "-c:a",
      "pcm_s16le",
      masterAudioPath,
    ],
    { timeoutMs: 120_000 }
  );
  const durationSeconds = await probeMockWav(masterAudioPath);
  const content = {
    artifactVersion: "math-tts.v1" as const,
    provider: "mock-speech.v1" as const,
    paidProviderCalled: false as const,
    narrationHash: narration.contentHash,
    targetDurationSeconds: args.targetDurationSeconds,
    segments,
    masterAudioPath,
    masterAudioSha256: await hashFile(masterAudioPath),
    durationSeconds,
  };
  const artifact = mathTtsArtifactSchema.parse({
    ...content,
    contentHash: canonicalHash(content),
  });
  await writeJsonAtomic(path.join(outputDir, "audio.json"), artifact);
  return {
    artifact,
    timing: createNarrationDrivenTiming(narration, audioTiming),
  };
}
