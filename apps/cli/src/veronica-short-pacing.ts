import fs from "node:fs/promises";
import path from "node:path";
import {
  calibrateVeronicaShortPacing,
  calculateWordsPerMinute,
  resolveVeronicaShortPacingPolicy,
  veronicaShortPacingCalibrationSchema,
  VERONICA_SHORT_PACING_CALIBRATION_SCHEMA_VERSION,
  type VeronicaShortPacingCalibration,
} from "@mediaforge/speech";
import { fileExists, hashFile, hashText, writeJsonAtomic } from "@mediaforge/shared";

export interface VeronicaShortPacingRunResult {
  readonly selectedSpeed: number;
  readonly selectedAudioPath: string;
  readonly calibrationPath: string;
  readonly calibration: VeronicaShortPacingCalibration;
  readonly providerCalls: number;
  readonly cacheHits: number;
}

function calibrationInputFingerprint(input: {
  readonly narrationHash: string;
  readonly locale: string;
  readonly model: string;
  readonly voice: string;
  readonly instructions: string;
  readonly outputFormat: string;
  readonly initialSpeed: number;
}): string {
  return hashText(JSON.stringify({
    schemaVersion: VERONICA_SHORT_PACING_CALIBRATION_SCHEMA_VERSION,
    narrationHash: input.narrationHash, locale: input.locale, model: input.model,
    voice: input.voice, instructions: input.instructions, outputFormat: input.outputFormat,
    initialSpeed: input.initialSpeed,
    pacingPolicy: resolveVeronicaShortPacingPolicy(input.locale),
  }));
}

function artifactHash(value: Omit<VeronicaShortPacingCalibration, "artifactHash">): string {
  return hashText(JSON.stringify(value));
}

/**
 * One provider request produces a complete Veronica Short candidate. This keeps
 * the live calibration budget at three requests rather than multiplying it by
 * narration chunks. The selected candidate is then promoted into the existing
 * canonical compatibility locations used by production timing reconciliation.
 */
export async function calibrateVeronicaShortNarration(input: {
  readonly episodeDir: string;
  readonly episodeId: string;
  readonly locale: string;
  readonly narration: string;
  readonly model: string;
  readonly voice: string;
  readonly baselineSpeed: number;
  readonly baseInstructions: string;
  readonly synthesize: (request: { readonly text: string; readonly instructions: string; readonly outputPath: string; readonly speed: number }) => Promise<void>;
  readonly probeDuration: (filePath: string) => Promise<number>;
}): Promise<VeronicaShortPacingRunResult | undefined> {
  const policy = resolveVeronicaShortPacingPolicy(input.locale);
  if (!policy) return undefined;
  const narrationHash = hashText(input.narration);
  const audioRoot = path.join(input.episodeDir, "locales", input.locale, "short", "audio");
  const narrationRoot = path.join(audioRoot, "narration");
  const calibrationPath = path.join(narrationRoot, "pacing-calibration.v1.json");
  const selectedAudioPath = path.join(narrationRoot, "pacing-calibration", "selected-narration.wav");
  const inputFingerprint = calibrationInputFingerprint({
    narrationHash, locale: input.locale, model: input.model, voice: input.voice,
    instructions: input.baseInstructions, outputFormat: "wav", initialSpeed: input.baselineSpeed,
  });
  if (await fileExists(calibrationPath) && await fileExists(selectedAudioPath)) {
    const stored = veronicaShortPacingCalibrationSchema.parse(JSON.parse(await fs.readFile(calibrationPath, "utf8")) as unknown);
    if (stored.inputFingerprint === inputFingerprint && stored.selectedAudioHash === await hashFile(selectedAudioPath)) {
      return { selectedSpeed: stored.selectedSpeed, selectedAudioPath, calibrationPath, calibration: stored, providerCalls: 0, cacheHits: stored.attempts.length };
    }
  }
  const wordCount = input.narration.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)?/gu)?.length ?? 0;
  const candidatesDir = path.join(narrationRoot, "pacing-calibration", "candidates");
  await fs.mkdir(candidatesDir, { recursive: true });
  let providerCalls = 0;
  let cacheHits = 0;
  const pathsByHash = new Map<string, string>();
  const result = await calibrateVeronicaShortPacing({
    initialSpeed: input.baselineSpeed,
    wordCount,
    policy,
    synthesize: async ({ requestedSpeed }) => {
      const speedToken = requestedSpeed.toFixed(4).replace(/\.?0+$/u, "");
      const candidatePath = path.join(candidatesDir, `${inputFingerprint}-${speedToken}.wav`);
      const cacheHit = await fileExists(candidatePath);
      if (!cacheHit) {
        providerCalls += 1;
        await input.synthesize({ text: input.narration, instructions: input.baseInstructions, outputPath: candidatePath, speed: requestedSpeed });
      } else {
        cacheHits += 1;
      }
      const durationSeconds = await input.probeDuration(candidatePath);
      if (!(durationSeconds > 0)) throw new Error(`Adaptive Veronica pacing candidate has invalid duration: ${candidatePath}`);
      const audioHash = await hashFile(candidatePath);
      pathsByHash.set(audioHash, candidatePath);
      return { audioHash, durationSeconds, cacheHit };
    },
  });
  const selectedPath = pathsByHash.get(result.selectedAttempt.audioHash);
  if (!selectedPath) throw new Error("Adaptive Veronica pacing did not retain its selected candidate.");
  await fs.mkdir(path.dirname(selectedAudioPath), { recursive: true });
  await fs.copyFile(selectedPath, selectedAudioPath);
  await Promise.all([
    fs.copyFile(selectedAudioPath, path.join(audioRoot, "narration.wav")),
    fs.copyFile(selectedAudioPath, path.join(narrationRoot, "clean-narration.wav")),
    fs.copyFile(selectedAudioPath, path.join(narrationRoot, "mastered-narration.wav")),
  ]);
  const unsealed = {
    schemaVersion: VERONICA_SHORT_PACING_CALIBRATION_SCHEMA_VERSION,
    contentId: input.episodeId, locale: input.locale, variant: "short" as const,
    provider: "openai-compatible", model: input.model, voice: input.voice, narrationHash,
    pacingPolicyVersion: policy.pacingPolicyVersion,
    targetDurationRange: [...policy.preferredDurationRangeSeconds] as [number, number],
    ...(policy.preferredWpmRange ? { preferredWpmRange: [...policy.preferredWpmRange] as [number, number] } : {}),
    wordCount, attempts: [...result.attempts], selectedAttempt: result.selectedAttempt.attemptIndex,
    selectedSpeed: result.selectedAttempt.requestedSpeed,
    selectedDurationSeconds: result.selectedAttempt.measuredDurationSeconds,
    selectedWpm: calculateWordsPerMinute(wordCount, result.selectedAttempt.measuredDurationSeconds),
    selectedPacingStatus: result.selectedAttempt.pacingStatus,
    speedNormalizationApplied: result.selectedAttempt.requestedSpeed !== input.baselineSpeed,
    calibrationStatus: result.calibrationStatus,
    selectedAudioHash: await hashFile(selectedAudioPath), inputFingerprint,
  };
  const calibration = veronicaShortPacingCalibrationSchema.parse({
    ...unsealed,
    artifactHash: artifactHash(unsealed),
  });
  await writeJsonAtomic(calibrationPath, calibration);
  return { selectedSpeed: calibration.selectedSpeed, selectedAudioPath, calibrationPath, calibration, providerCalls, cacheHits };
}
