import fs from "node:fs/promises";
import path from "node:path";
import {
  ensureDir,
  hashFile,
  hashText,
  splitIntoWords,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";
import { z } from "zod";
import {
  createNarrationArtifactPaths,
  type NarrationVariant,
} from "./narration-paths.js";
import {
  NARRATION_ARTIFACT_SCHEMA_VERSION,
  narrationChunkManifestSchema,
  narrationDirectionSetSchema,
  pronunciationTransformationReportSchema,
  spokenNarrationArtifactSchema,
  type NarrationChunkManifest,
  type NarrationDirectionSet,
} from "./narration-schemas.js";
import {
  NarrationPipeline,
  type NarrationChunkSynthesisRequest,
  type NarrationPipelineResult,
} from "./narration-pipeline.js";
import type { ProbeAudioMetadata } from "./audio-validation.js";

const supportedDarkTruthLanguages = ["en", "de", "es", "fr"] as const;
const supportedDarkTruthArtifactTypes = ["full", "short"] as const;
const segmentIdPattern = /^segment-[0-9]{3,}$/u;

const darkTruthSpeechSegmentSchema = z
  .object({
    id: z.string().regex(segmentIdPattern),
    sequenceNumber: z.number().int().positive(),
    sectionTitle: z.string().nullable(),
    text: z.string().min(1).max(8000),
    type: z.enum(["narration", "human-dialogue", "supernatural-dialogue"]),
    pace: z.enum(["slow", "normal", "fast"]),
    intensity: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
    ]),
    pauseBeforeMs: z.number().finite().nonnegative(),
    pauseAfterMs: z.number().finite().nonnegative(),
    wordCount: z.number().int().nonnegative(),
    characterCount: z.number().int().nonnegative(),
  })
  .strict();

const darkTruthSpeechPlanSchema = z
  .object({
    version: z.string().min(1).max(80),
    episodeId: z.string().regex(/^[a-z0-9][a-z0-9-]{2,127}$/u),
    language: z.enum(supportedDarkTruthLanguages),
    artifactType: z.enum(supportedDarkTruthArtifactTypes),
    title: z.string().min(1).max(500),
    canonicalVoiceProfile: z.string().min(1),
    canonicalVoiceProfileHash: z.string().regex(/^[a-f0-9]{64}$/u),
    segments: z.array(darkTruthSpeechSegmentSchema).min(1),
    pronunciations: z.array(z.unknown()),
    soundCues: z.array(z.unknown()),
    warnings: z.array(z.string().max(1000)),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    for (const [index, segment] of value.segments.entries()) {
      if (ids.has(segment.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["segments", index, "id"],
          message: `Duplicate speech segment ID: ${segment.id}`,
        });
      }
      ids.add(segment.id);
      if (segment.sequenceNumber !== index + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["segments", index, "sequenceNumber"],
          message: "Speech segment sequence numbers must be contiguous and one-based.",
        });
      }
      if (segment.id !== `segment-${String(index + 1).padStart(3, "0")}`) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["segments", index, "id"],
          message: "Speech segment IDs must match their sequence numbers.",
        });
      }
      if (segment.wordCount !== splitIntoWords(segment.text).length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["segments", index, "wordCount"],
          message: "Speech segment wordCount does not match text.",
        });
      }
      if (segment.characterCount !== segment.text.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["segments", index, "characterCount"],
          message: "Speech segment characterCount does not match text.",
        });
      }
    }
  });

type DarkTruthSpeechPlan = z.infer<typeof darkTruthSpeechPlanSchema>;

export interface DarkTruthNarrationAdapterInput {
  readonly episodeDir: string;
  readonly speechPlan: unknown;
  readonly synthesizeChunk: (request: NarrationChunkSynthesisRequest) => Promise<void>;
  readonly model?: string;
  readonly voice?: string;
  readonly speed?: number;
  readonly baseVoiceInstructions?: string;
  readonly runFfmpeg?: (args: readonly string[]) => Promise<void>;
  readonly probeAudio?: (filePath: string) => Promise<ProbeAudioMetadata>;
  readonly logger?: {
    info(value: Record<string, unknown>, message?: string): void;
    warn?(value: Record<string, unknown>, message?: string): void;
  };
}

export interface DarkTruthCompatibilityNarrationManifest {
  readonly schemaVersion: 2;
  readonly episodeId: string;
  readonly language: string;
  readonly artifactType: NarrationVariant;
  readonly speechPlanHash: string;
  readonly voiceProfileHash: string;
  readonly segmentCount: number;
  readonly segmentSha256s: readonly string[];
  readonly narrationPath: string;
  readonly narrationSha256: string;
  readonly generatedAt: string;
  readonly adapterMode?: "new";
  readonly canonicalManifestHash?: string;
}

export interface DarkTruthNarrationAdapterResult {
  readonly narrationPath: string;
  readonly manifestPath: string;
  readonly speechPlanHash: string;
  readonly outputManifestHash: string;
  readonly chunkManifest: NarrationChunkManifest;
  readonly directionSet: NarrationDirectionSet;
  readonly pipelineResult: NarrationPipelineResult;
  readonly compatibilityManifest: DarkTruthCompatibilityNarrationManifest;
}

function nowIso(): string {
  return new Date().toISOString();
}

function episodeRootFromVariantDir(episodeDir: string, speechPlan: DarkTruthSpeechPlan): string {
  const resolved = path.resolve(episodeDir);
  const episodeRoot = path.resolve(resolved, "..", "..");
  if (path.basename(episodeRoot) !== speechPlan.episodeId) {
    throw new Error("Dark Truth adapter episodeDir must be <episode>/<language>/<artifactType>.");
  }
  if (path.basename(path.dirname(resolved)) !== speechPlan.language) {
    throw new Error("Dark Truth adapter episodeDir language does not match SpeechPlan.");
  }
  if (path.basename(resolved) !== speechPlan.artifactType) {
    throw new Error("Dark Truth adapter episodeDir artifact type does not match SpeechPlan.");
  }
  return episodeRoot;
}

function buildSpeechPlanHash(speechPlan: DarkTruthSpeechPlan): string {
  return hashText(
    JSON.stringify({
      version: speechPlan.version,
      episodeId: speechPlan.episodeId,
      language: speechPlan.language,
      artifactType: speechPlan.artifactType,
      title: speechPlan.title,
      canonicalVoiceProfileHash: speechPlan.canonicalVoiceProfileHash,
      segments: speechPlan.segments.map((segment) => ({
        id: segment.id,
        sequenceNumber: segment.sequenceNumber,
        text: segment.text,
        wordCount: segment.wordCount,
        characterCount: segment.characterCount,
        type: segment.type,
        pace: segment.pace,
        intensity: segment.intensity,
        pauseBeforeMs: segment.pauseBeforeMs,
        pauseAfterMs: segment.pauseAfterMs,
      })),
    })
  );
}

function chunkIdForSequence(sequence: number): string {
  return `narr-chunk-${String(sequence + 1).padStart(3, "0")}`;
}

function roleFor(index: number, total: number): NarrationChunkManifest["chunks"][number]["role"] {
  if (index === 0) {
    return "hook";
  }
  if (index === total - 1) {
    return "closing";
  }
  const ratio = index / Math.max(1, total - 1);
  if (ratio < 0.2) {
    return "setup";
  }
  if (ratio < 0.4) {
    return "discovery";
  }
  if (ratio < 0.62) {
    return "escalation";
  }
  if (ratio < 0.78) {
    return "climax";
  }
  return "reveal";
}

function flowIntentFor(index: number, total: number, text: string): NarrationChunkManifest["chunks"][number]["flowIntent"] {
  if (index === total - 1) {
    return "concludes";
  }
  if (/[?!…]$/u.test(text.trim())) {
    return "unresolved_reveal";
  }
  return "continues";
}

function paceFor(segment: DarkTruthSpeechPlan["segments"][number]) {
  if (segment.pace === "slow") {
    return "slow" as const;
  }
  if (segment.pace === "fast") {
    return "brisk" as const;
  }
  return "normal" as const;
}

function moodFor(segment: DarkTruthSpeechPlan["segments"][number], role: NarrationChunkManifest["chunks"][number]["role"]) {
  if (segment.type === "supernatural-dialogue") {
    return "disturbed" as const;
  }
  if (segment.type === "human-dialogue") {
    return "intimate" as const;
  }
  if (role === "climax" || role === "reveal") {
    return "uneasy" as const;
  }
  if (role === "closing") {
    return "reflective" as const;
  }
  return "restrained" as const;
}

function relative(root: string, target: string): string {
  return path.relative(root, target).replace(/\\/gu, "/");
}

function buildChunkManifest(input: {
  readonly speechPlan: DarkTruthSpeechPlan;
  readonly speechPlanHash: string;
  readonly createdAt: string;
}): NarrationChunkManifest {
  const chunksWithoutManifest = input.speechPlan.segments.map((segment, index) => {
    const role = roleFor(index, input.speechPlan.segments.length);
    const flowIntent = flowIntentFor(index, input.speechPlan.segments.length, segment.text);
    const previous = input.speechPlan.segments[index - 1]?.text ?? "";
    const next = input.speechPlan.segments[index + 1]?.text ?? "";
    return {
      chunkId: chunkIdForSequence(index),
      sequence: index,
      text: segment.text,
      textHash: hashText(segment.text),
      role,
      estimatedWordCount: segment.wordCount,
      estimatedDurationMs: Math.max(1_000, Math.round((segment.wordCount / 180) * 60_000)),
      previousContextExcerpt: previous.slice(0, 500),
      nextContextExcerpt: next.slice(0, 500),
      flowIntent,
      warnings: [
        {
          code: "DARK_TRUTH_SEGMENT",
          message: `Adapted from ${segment.id}.`,
        },
      ],
    };
  });
  const manifestWithoutFingerprint = {
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    episodeId: input.speechPlan.episodeId,
    locale: input.speechPlan.language,
    variant: input.speechPlan.artifactType,
    sourceSpokenTextHash: hashText(input.speechPlan.segments.map((segment) => segment.text).join("\n\n")),
    segmentationConfig: {
      mode: "manual" as const,
      version: "dark-truth-speech-plan-v1",
      fingerprint: input.speechPlanHash,
    },
    chunks: chunksWithoutManifest,
    manifestFingerprint: hashText("pending"),
    createdAt: input.createdAt,
  };
  return narrationChunkManifestSchema.parse({
    ...manifestWithoutFingerprint,
    manifestFingerprint: hashText(JSON.stringify(manifestWithoutFingerprint)),
  });
}

function buildDirectionSet(input: {
  readonly speechPlan: DarkTruthSpeechPlan;
  readonly manifest: NarrationChunkManifest;
  readonly speechPlanHash: string;
  readonly createdAt: string;
}): NarrationDirectionSet {
  const directionsWithoutFingerprint = input.manifest.chunks.map((chunk, index) => {
    const segment = input.speechPlan.segments[index];
    if (!segment) {
      throw new Error(`Missing Dark Truth segment for ${chunk.chunkId}.`);
    }
    const restraint =
      segment.type === "supernatural-dialogue"
        ? 0.62
        : segment.type === "human-dialogue"
          ? 0.72
          : 0.84;
    return {
      chunkId: chunk.chunkId,
      role: chunk.role,
      mood: moodFor(segment, chunk.role),
      pace: paceFor(segment),
      intensity: Number((segment.intensity / 5).toFixed(2)),
      restraint,
      pauseBeforeMs: segment.pauseBeforeMs,
      pauseAfterMs: segment.pauseAfterMs,
      emphasisTargets: [],
      deliveryNote: [
        `Use Dark Truth ${segment.type} delivery.`,
        segment.sectionTitle ? `Section: ${segment.sectionTitle}.` : "",
        `Source segment ${segment.id}; preserve its pacing metadata.`,
      ].filter(Boolean).join(" "),
      negativeConstraints: [
        "Do not speak source segment IDs.",
        "Do not add words that are not present in the current chunk.",
      ],
      continuityGuidance: "Use neighboring chunks only for performance continuity; speak only the current input.",
      flowIntent: chunk.flowIntent,
    };
  });
  const setWithoutFingerprint = {
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    manifestFingerprint: input.manifest.manifestFingerprint,
    plannerMode: "manual" as const,
    plannerVersion: "dark-truth-speech-plan-v1",
    sourceFingerprint: input.speechPlanHash,
    fallbackUsage: { used: false },
    directions: directionsWithoutFingerprint,
    setFingerprint: hashText("pending"),
    createdAt: input.createdAt,
  };
  return narrationDirectionSetSchema.parse({
    ...setWithoutFingerprint,
    setFingerprint: hashText(JSON.stringify(setWithoutFingerprint)),
  });
}

async function writeAdapterArtifacts(input: {
  readonly episodeDir: string;
  readonly episodeRoot: string;
  readonly speechPlan: DarkTruthSpeechPlan;
  readonly speechPlanHash: string;
  readonly manifest: NarrationChunkManifest;
  readonly directionSet: NarrationDirectionSet;
  readonly createdAt: string;
}): Promise<void> {
  const paths = createNarrationArtifactPaths({
    episodeId: input.speechPlan.episodeId,
    locale: input.speechPlan.language,
    variant: input.speechPlan.artifactType,
    episodeRoot: input.episodeRoot,
  });
  await ensureDir(paths.narrationRoot);
  const spokenText = input.speechPlan.segments.map((segment) => segment.text).join("\n\n");
  await writeTextAtomic(paths.spokenTextMarkdown, `${spokenText}\n`);
  const spokenArtifact = spokenNarrationArtifactSchema.parse({
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    status: "completed",
    episodeId: input.speechPlan.episodeId,
    locale: input.speechPlan.language,
    variant: input.speechPlan.artifactType,
    preparationMode: "manual",
    sourceArtifact: {
      artifactType: "dark-truth-speech-plan",
      fingerprint: input.speechPlanHash,
      schemaVersion: input.speechPlan.version,
    },
    sourceHash: input.speechPlanHash,
    spokenTextPath: relative(paths.narrationRoot, paths.spokenTextMarkdown),
    spokenTextHash: input.manifest.sourceSpokenTextHash,
    wordCount: input.speechPlan.segments.reduce((sum, segment) => sum + segment.wordCount, 0),
    warnings: input.speechPlan.warnings.map((warning) => ({
      code: "DARK_TRUTH_WARNING",
      message: warning,
    })),
    createdAt: input.createdAt,
    provenance: {
      generator: "dark-truth-compatibility-adapter",
      generatorVersion: "1",
    },
  });
  await writeJsonAtomic(paths.spokenTextJson, spokenArtifact);
  await writeJsonAtomic(paths.chunkManifest, input.manifest);
  await writeJsonAtomic(paths.performanceDirections, input.directionSet);
  const pronunciationWithoutFingerprint = {
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    sourceManifestFingerprint: input.manifest.manifestFingerprint,
    dictionaryFingerprint: hashText(`dark-truth-pronunciation:${input.speechPlanHash}`),
    language: input.speechPlan.language,
    appliedTransformations: [],
    collisions: [],
    skippedEntries: [],
    warnings: [],
    reportFingerprint: hashText("pending"),
    createdAt: input.createdAt,
  };
  await writeJsonAtomic(
    paths.pronunciationTransforms,
    pronunciationTransformationReportSchema.parse({
      ...pronunciationWithoutFingerprint,
      reportFingerprint: hashText(JSON.stringify(pronunciationWithoutFingerprint)),
    })
  );
}

async function writeCompatibilityManifest(input: {
  readonly episodeDir: string;
  readonly speechPlan: DarkTruthSpeechPlan;
  readonly speechPlanHash: string;
  readonly chunkManifest: NarrationChunkManifest;
  readonly chunkAudioDir: string;
  readonly narrationPath: string;
  readonly generatedAt: string;
}): Promise<{
  readonly manifestPath: string;
  readonly manifest: DarkTruthCompatibilityNarrationManifest;
  readonly outputManifestHash: string;
}> {
  const segmentSha256s: string[] = [];
  for (const chunk of input.chunkManifest.chunks) {
    const chunkPath = path.join(input.chunkAudioDir, `${chunk.chunkId}.wav`);
    segmentSha256s.push(await hashFile(chunkPath));
  }
  const manifestPath = path.join(input.episodeDir, "audio", "narration-manifest.json");
  const manifest: DarkTruthCompatibilityNarrationManifest = {
    schemaVersion: 2,
    episodeId: input.speechPlan.episodeId,
    language: input.speechPlan.language,
    artifactType: input.speechPlan.artifactType,
    speechPlanHash: input.speechPlanHash,
    voiceProfileHash: input.speechPlan.canonicalVoiceProfileHash,
    segmentCount: input.speechPlan.segments.length,
    segmentSha256s,
    narrationPath: input.narrationPath,
    narrationSha256: await hashFile(input.narrationPath),
    generatedAt: input.generatedAt,
    adapterMode: "new",
    canonicalManifestHash: input.chunkManifest.manifestFingerprint,
  };
  await writeJsonAtomic(manifestPath, manifest);
  return {
    manifestPath,
    manifest,
    outputManifestHash: await hashFile(manifestPath),
  };
}

export async function runDarkTruthNarrationAdapter(
  input: DarkTruthNarrationAdapterInput
): Promise<DarkTruthNarrationAdapterResult> {
  const speechPlan = darkTruthSpeechPlanSchema.parse(input.speechPlan);
  const speechPlanHash = buildSpeechPlanHash(speechPlan);
  const createdAt = nowIso();
  const episodeRoot = episodeRootFromVariantDir(input.episodeDir, speechPlan);
  const chunkManifest = buildChunkManifest({ speechPlan, speechPlanHash, createdAt });
  const directionSet = buildDirectionSet({
    speechPlan,
    manifest: chunkManifest,
    speechPlanHash,
    createdAt,
  });
  await writeAdapterArtifacts({
    episodeDir: path.resolve(input.episodeDir),
    episodeRoot,
    speechPlan,
    speechPlanHash,
    manifest: chunkManifest,
    directionSet,
    createdAt,
  });
  input.logger?.info(
    {
      adapterMode: "new",
      episodeId: speechPlan.episodeId,
      language: speechPlan.language,
      variant: speechPlan.artifactType,
      speechPlanHash,
      fallbackUsed: false,
    },
    "Running Dark Truth narration adapter."
  );
  const pipeline = new NarrationPipeline();
  const pipelineResult = await pipeline.run({
    episodeDir: episodeRoot,
    episodeId: speechPlan.episodeId,
    language: speechPlan.language,
    locale: speechPlan.language,
    variant: speechPlan.artifactType,
    stage: "all",
    rolloutMode: "new",
    model: input.model ?? "gpt-4o-mini-tts",
    voice: input.voice ?? "onyx",
    speed: input.speed ?? 1,
    outputFormat: "wav",
    baseVoiceInstructions:
      input.baseVoiceInstructions ?? speechPlan.canonicalVoiceProfile,
    synthesizeChunk: input.synthesizeChunk,
    ...(input.runFfmpeg ? { runFfmpeg: input.runFfmpeg } : {}),
    ...(input.probeAudio ? { probeAudio: input.probeAudio } : {}),
    ...(input.logger ? { logger: input.logger } : {}),
  });
  if (pipelineResult.exitCode !== 0) {
    throw new Error(`Dark Truth narration adapter blocked with exit code ${pipelineResult.exitCode}.`);
  }
  const legacyNarrationPath = path.join(path.resolve(input.episodeDir), "audio", "narration.wav");
  await ensureDir(path.dirname(legacyNarrationPath));
  await fs.copyFile(pipelineResult.paths.compatibilityNarration, legacyNarrationPath);
  const compatibility = await writeCompatibilityManifest({
    episodeDir: path.resolve(input.episodeDir),
    speechPlan,
    speechPlanHash,
    chunkManifest,
    chunkAudioDir: pipelineResult.paths.chunkAudioDir,
    narrationPath: legacyNarrationPath,
    generatedAt: nowIso(),
  });
  input.logger?.info(
    {
      adapterMode: "new",
      episodeId: speechPlan.episodeId,
      language: speechPlan.language,
      variant: speechPlan.artifactType,
      speechPlanHash,
      outputManifestHash: compatibility.outputManifestHash,
      fallbackUsed: false,
    },
    "Dark Truth narration adapter completed."
  );
  return {
    narrationPath: compatibility.manifest.narrationPath,
    manifestPath: compatibility.manifestPath,
    speechPlanHash,
    outputManifestHash: compatibility.outputManifestHash,
    chunkManifest,
    directionSet,
    pipelineResult,
    compatibilityManifest: compatibility.manifest,
  };
}
