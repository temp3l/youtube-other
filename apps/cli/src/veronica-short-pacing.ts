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
import {
  fileExists,
  hashFile,
  hashText,
  writeJsonAtomic,
} from "@mediaforge/shared";
import { runCommand } from "@mediaforge/process-runner";

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
  readonly schemaVersion?: string;
}): string {
  return hashText(
    JSON.stringify({
      schemaVersion: input.schemaVersion ?? VERONICA_SHORT_PACING_CALIBRATION_SCHEMA_VERSION,
      narrationHash: input.narrationHash,
      locale: input.locale,
      model: input.model,
      voice: input.voice,
      instructions: input.instructions,
      outputFormat: input.outputFormat,
      initialSpeed: input.initialSpeed,
      pacingPolicy: resolveVeronicaShortPacingPolicy(input.locale),
    })
  );
}

function candidateRequestFingerprint(input: {
  readonly narrationHash: string;
  readonly locale: string;
  readonly model: string;
  readonly voice: string;
  readonly instructions: string;
}): string {
  return hashText(
    JSON.stringify({
      schemaVersion: "veronica-short-pacing-candidate-v1",
      narrationHash: input.narrationHash,
      locale: input.locale,
      model: input.model,
      voice: input.voice,
      instructions: input.instructions,
      outputFormat: "wav",
    })
  );
}

function legacyCandidatePrefixFromArtifact(input: {
  readonly raw: unknown;
  readonly narrationHash: string;
  readonly locale: string;
  readonly model: string;
  readonly voice: string;
}): string | undefined {
  if (!input.raw || typeof input.raw !== "object") return undefined;
  const value = input.raw as Record<string, unknown>;
  return value["narrationHash"] === input.narrationHash &&
    value["locale"] === input.locale &&
    value["model"] === input.model &&
    value["voice"] === input.voice &&
    typeof value["inputFingerprint"] === "string"
    ? value["inputFingerprint"]
    : undefined;
}

function artifactHash(value: unknown): string {
  return hashText(JSON.stringify(value));
}

function preferredTempoFactor(input: {
  readonly wordCount: number;
  readonly durationSeconds: number;
  readonly locale: string;
}): number | undefined {
  const range = resolveVeronicaShortPacingPolicy(input.locale)?.preferredWpmRange;
  if (!range || input.wordCount === 0) return undefined;
  const currentWpm = calculateWordsPerMinute(input.wordCount, input.durationSeconds);
  if (currentWpm >= range[0] && currentWpm <= range[1]) return undefined;
  const targetDuration = (input.wordCount / ((range[0] + range[1]) / 2)) * 60;
  return Math.round((input.durationSeconds / targetDuration) * 10_000) / 10_000;
}

async function applyPitchPreservingTempo(input: {
  readonly sourcePath: string;
  readonly outputPath: string;
  readonly tempoFactor: number;
}): Promise<void> {
  await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
  await runCommand("ffmpeg", [
    "-y", "-i", input.sourcePath, "-map", "0:a:0", "-af",
    `atempo=${input.tempoFactor.toFixed(4)}`,
    "-c:a", "pcm_s16le", input.outputPath,
  ], { timeoutMs: 120_000 });
}

/**
 * One provider request produces a complete Veronica Short candidate. This keeps
 * the live calibration budget at three requests (one initial plus two controlled
 * remediations) rather than multiplying it by
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
  readonly synthesize: (request: {
    readonly text: string;
    readonly instructions: string;
    readonly outputPath: string;
    readonly speed: number;
  }) => Promise<void>;
  readonly probeDuration: (filePath: string) => Promise<number>;
}): Promise<VeronicaShortPacingRunResult | undefined> {
  const policy = resolveVeronicaShortPacingPolicy(input.locale);
  if (!policy) return undefined;
  const narrationHash = hashText(input.narration);
  const audioRoot = path.join(
    input.episodeDir,
    "locales",
    input.locale,
    "short",
    "audio"
  );
  const narrationRoot = path.join(audioRoot, "narration");
  const calibrationPath = path.join(
    narrationRoot,
    "pacing-calibration.v1.json"
  );
  const selectedAudioPath = path.join(
    narrationRoot,
    "pacing-calibration",
    "selected-narration.wav"
  );
  const inputFingerprint = calibrationInputFingerprint({
    narrationHash,
    locale: input.locale,
    model: input.model,
    voice: input.voice,
    instructions: input.baseInstructions,
    outputFormat: "wav",
    initialSpeed: input.baselineSpeed,
  });
  let legacyPrefix: string | undefined;
  if (
    (await fileExists(calibrationPath)) &&
    (await fileExists(selectedAudioPath))
  ) {
    const rawCalibration = JSON.parse(
      await fs.readFile(calibrationPath, "utf8")
    ) as unknown;
    legacyPrefix = legacyCandidatePrefixFromArtifact({
      raw: rawCalibration,
      narrationHash,
      locale: input.locale,
      model: input.model,
      voice: input.voice,
    });
    try {
      const stored = veronicaShortPacingCalibrationSchema.parse(rawCalibration);
      const compatibleV3Fingerprint = stored.schemaVersion === "veronica-short-pacing-calibration-v3"
        ? calibrationInputFingerprint({
            narrationHash,
            locale: input.locale,
            model: input.model,
            voice: input.voice,
            instructions: input.baseInstructions,
            outputFormat: "wav",
            initialSpeed: input.baselineSpeed,
            schemaVersion: "veronica-short-pacing-calibration-v3",
          })
        : undefined;
      if (
        (stored.inputFingerprint === inputFingerprint || stored.inputFingerprint === compatibleV3Fingerprint) &&
        stored.selectedAudioHash === (await hashFile(selectedAudioPath))
      ) {
        const tempoFactor = preferredTempoFactor({
          wordCount: stored.wordCount,
          durationSeconds: stored.selectedDurationSeconds,
          locale: input.locale,
        });
        if (tempoFactor !== undefined) {
          const normalizedPath = path.join(
            narrationRoot,
            "pacing-calibration",
            "normalized",
            `${stored.selectedAudioHash}-${tempoFactor.toFixed(4)}.wav`,
          );
          if (!(await fileExists(normalizedPath))) {
            await applyPitchPreservingTempo({
              sourcePath: selectedAudioPath,
              outputPath: normalizedPath,
              tempoFactor,
            });
          }
          const normalizedDuration = await input.probeDuration(normalizedPath);
          const normalizedWpm = calculateWordsPerMinute(stored.wordCount, normalizedDuration);
          const range = policy.preferredWpmRange;
          if (!range || normalizedWpm < range[0] || normalizedWpm > range[1]) {
            throw new Error("VERONICA_SHORT_TEMPO_NORMALIZATION_OUTSIDE_TARGET_WPM");
          }
          const normalizedHash = await hashFile(normalizedPath);
          const { artifactHash: _previousHash, ...storedWithoutHash } = stored;
          const normalizedUnsealed = {
            ...storedWithoutHash,
            schemaVersion: VERONICA_SHORT_PACING_CALIBRATION_SCHEMA_VERSION,
            selectedDurationSeconds: normalizedDuration,
            selectedWpm: normalizedWpm,
            selectedPacingStatus: "NATURAL" as const,
            speedNormalizationApplied: true,
            selectedAudioHash: normalizedHash,
            tempoNormalization: {
              algorithm: "ffmpeg-atempo" as const,
              tempoFactor,
              sourceAudioHash: stored.selectedAudioHash,
              outputAudioHash: normalizedHash,
              measuredDurationSeconds: normalizedDuration,
              measuredWpm: normalizedWpm,
              pitchPreserved: true as const,
              artificialSilenceAdded: false as const,
            },
          };
          const normalized = veronicaShortPacingCalibrationSchema.parse({
            ...normalizedUnsealed,
            artifactHash: artifactHash(normalizedUnsealed),
          });
          await writeJsonAtomic(calibrationPath, normalized);
          await Promise.all([
            fs.copyFile(normalizedPath, selectedAudioPath),
            fs.copyFile(normalizedPath, path.join(audioRoot, "narration.wav")),
            fs.copyFile(normalizedPath, path.join(narrationRoot, "clean-narration.wav")),
            fs.copyFile(normalizedPath, path.join(narrationRoot, "mastered-narration.wav")),
          ]);
          return {
            selectedSpeed: normalized.selectedSpeed,
            selectedAudioPath,
            calibrationPath,
            calibration: normalized,
            providerCalls: 0,
            cacheHits: stored.attempts.length,
          };
        }
        await Promise.all([
          fs.copyFile(selectedAudioPath, path.join(audioRoot, "narration.wav")),
          fs.copyFile(
            selectedAudioPath,
            path.join(narrationRoot, "clean-narration.wav")
          ),
          fs.copyFile(
            selectedAudioPath,
            path.join(narrationRoot, "mastered-narration.wav")
          ),
        ]);
        return {
          selectedSpeed: stored.selectedSpeed,
          selectedAudioPath,
          calibrationPath,
          calibration: stored,
          providerCalls: 0,
          cacheHits: stored.attempts.length,
        };
      }
    } catch {
      // A schema/policy change intentionally invalidates completed calibration.
    }
  }
  const wordCount =
    input.narration.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)?/gu)?.length ??
    0;
  const candidatesDir = path.join(
    narrationRoot,
    "pacing-calibration",
    "candidates"
  );
  const candidateFingerprint = candidateRequestFingerprint({
    narrationHash,
    locale: input.locale,
    model: input.model,
    voice: input.voice,
    instructions: input.baseInstructions,
  });
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
      const candidatePath = path.join(
        candidatesDir,
        `${candidateFingerprint}-${speedToken}.wav`
      );
      const legacyPath = legacyPrefix
        ? path.join(candidatesDir, `${legacyPrefix}-${speedToken}.wav`)
        : undefined;
      const cachePath = (await fileExists(candidatePath))
        ? candidatePath
        : legacyPath && (await fileExists(legacyPath))
          ? legacyPath
          : candidatePath;
      const cacheHit = await fileExists(cachePath);
      if (!cacheHit) {
        providerCalls += 1;
        await input.synthesize({
          text: input.narration,
          instructions: input.baseInstructions,
          outputPath: candidatePath,
          speed: requestedSpeed,
        });
      } else {
        cacheHits += 1;
      }
      const durationSeconds = await input.probeDuration(cachePath);
      if (!(durationSeconds > 0))
        throw new Error(
          `Adaptive Veronica pacing candidate has invalid duration: ${cachePath}`
        );
      const audioHash = await hashFile(cachePath);
      pathsByHash.set(audioHash, cachePath);
      return {
        audioHash,
        durationSeconds,
        cacheHit,
        hardConstraintsPassed: true,
      };
    },
  });
  const selectedPath = pathsByHash.get(result.selectedAttempt.audioHash);
  if (!selectedPath)
    throw new Error(
      "Adaptive Veronica pacing did not retain its selected candidate."
    );
  await fs.mkdir(path.dirname(selectedAudioPath), { recursive: true });
  await fs.copyFile(selectedPath, selectedAudioPath);
  await Promise.all([
    fs.copyFile(selectedAudioPath, path.join(audioRoot, "narration.wav")),
    fs.copyFile(
      selectedAudioPath,
      path.join(narrationRoot, "clean-narration.wav")
    ),
    fs.copyFile(
      selectedAudioPath,
      path.join(narrationRoot, "mastered-narration.wav")
    ),
  ]);
  const unsealed = {
    schemaVersion: VERONICA_SHORT_PACING_CALIBRATION_SCHEMA_VERSION,
    contentId: input.episodeId,
    locale: input.locale,
    variant: "short" as const,
    provider: "openai-compatible",
    model: input.model,
    voice: input.voice,
    narrationHash,
    pacingPolicyVersion: policy.pacingPolicyVersion,
    pacingProfileId: policy.profileId,
    platformMaximumDurationSeconds: policy.platformMaximumDurationSeconds,
    editorialLongShortReviewThresholdSeconds:
      policy.editorialLongShortReviewThresholdSeconds,
    targetDurationRange: [...policy.preferredDurationRangeSeconds] as [
      number,
      number,
    ],
    ...(policy.preferredWpmRange
      ? { preferredWpmRange: [...policy.preferredWpmRange] as [number, number] }
      : {}),
    wordCount,
    attempts: [...result.attempts],
    selectedAttempt: result.selectedAttempt.attemptIndex,
    selectedSpeed: result.selectedAttempt.requestedSpeed,
    selectedDurationSeconds: result.selectedAttempt.measuredDurationSeconds,
    selectedWpm: calculateWordsPerMinute(
      wordCount,
      result.selectedAttempt.measuredDurationSeconds
    ),
    selectedPacingStatus: result.selectedAttempt.pacingStatus,
    selectedDurationAcceptanceStatus:
      result.selectedAttempt.durationAcceptanceStatus,
    speedNormalizationApplied:
      result.selectedAttempt.requestedSpeed !== input.baselineSpeed,
    calibrationStatus: result.calibrationStatus,
    selectedAudioHash: await hashFile(selectedAudioPath),
    inputFingerprint,
  };
  const calibration = veronicaShortPacingCalibrationSchema.parse({
    ...unsealed,
    artifactHash: artifactHash(unsealed),
  });
  await writeJsonAtomic(calibrationPath, calibration);
  return {
    selectedSpeed: calibration.selectedSpeed,
    selectedAudioPath,
    calibrationPath,
    calibration,
    providerCalls,
    cacheHits,
  };
}
