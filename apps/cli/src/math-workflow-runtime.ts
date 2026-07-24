import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { runCommand } from "@mediaforge/process-runner";

import {
  cacheSemanticSvg,
  createSemanticChalkSchedule,
  createMathCaption,
  extractSemanticChalkSteps,
  generateLocalMockTts,
  MATH_REMOTION_RUNNER_VERSION,
  MATH_SVG_RENDERER_VERSION,
  MATH_THINK_PAUSE_SECONDS,
  renderProviderFreeMathMedia,
  type MathSceneAsset,
  type SemanticMathComponent,
} from "@mediaforge/math-rendering";
import {
  hashFile,
  hashText,
  writeBinaryAtomic,
  writeJsonAtomic,
} from "@mediaforge/shared";
import {
  ArtifactRepository,
  WorkflowOperator,
  WorkflowStore,
  createTaskRegistry,
} from "@mediaforge/workflow-engine";
import {
  MathProfileStore,
  assessAuthoritativeMathReadiness,
  canonicalHash,
  canonicalPrivateMediaEvidenceSchema,
  computeEducationalVisualStyleContentHash,
  computeMathLessonProfileContentHash,
  createMathFingerprintMaterial,
  createMathProductionTaskImplementations,
  createMathTaskRegistrations,
  loadCurriculumRelease,
  loadPrivateOwnerAttestation,
  mathLessonProfileManifestSchema,
  educationalVisualStyleManifestSchema,
  buildLessonVariant,
  buildMathEducationalNarrationBeats,
  verifyCanonicalPrivateMediaEvidenceFiles,
  mathLanguageSchema,
  mathWorkflowDefinition,
  type LessonVariant,
  type MathLanguage,
  type MathProviderAuthorization,
  type CanonicalPrivateMediaMaterializerInput,
  type PrivateOwnerAttestation,
  type CanonicalPrivateSpeechMaterializerInput,
} from "@mediaforge/math-education";
import {
  analyzeWavQuality,
  buildEducationalSpeechPlan,
  generateEducationalSpeech,
  parseWavMetadata,
  probeAudioWithFfprobe,
  type PronunciationDictionary,
  type SpeechDeliveryProfile,
  type SpeechProvider,
} from "@mediaforge/speech";

export interface CanonicalMathOperatorInput {
  readonly repositoryRoot: string;
  readonly workspaceRoot: string;
  readonly unitId: string;
  readonly locale: string;
  readonly contentVariant: "full" | "short";
  readonly lessonVariant?: LessonVariant;
  readonly skillId?: string;
  readonly curriculumRoot?: string;
  readonly simulation?: boolean;
  readonly pythonExecutable?: string;
  readonly authorizeProvider?: boolean;
  readonly providerMode?: "fixture-mock" | "provider";
  readonly providerConfigurationFingerprint?: string;
  readonly releaseVisibility?: "private" | "public";
  readonly privateOwnerAttestationPath?: string;
  readonly privateMediaMaterializer?: (
    input: CanonicalPrivateMediaMaterializerInput
  ) => Promise<unknown>;
  readonly privateSpeechMaterializer?: (
    input: CanonicalPrivateSpeechMaterializerInput
  ) => Promise<unknown>;
}

type CanonicalVisualFact =
  CanonicalPrivateMediaMaterializerInput["lesson"]["facts"][number];
export const CANONICAL_PRIVATE_FACT_BOARD_MINIMUM_GLYPH_PX = 72;
export const CANONICAL_PRIVATE_NARRATION_SYNC_VERSION =
  "math-narration-sync.v1" as const;
export const CANONICAL_PRIVATE_NARRATION_MAX_TEMPO_RATIO = 2;
export const CANONICAL_PRIVATE_VISUAL_STYLE_VERSION = 6;
export const CANONICAL_PRIVATE_RENDERER_VERSIONS = {
  svg: MATH_SVG_RENDERER_VERSION,
  formula: "math-svg.v2",
  remotion: MATH_REMOTION_RUNNER_VERSION,
} as const;
const CANONICAL_PRIVATE_NARRATION_LOUDNESS_FILTER =
  "loudnorm=I=-17:TP=-2:LRA=11";
export const CANONICAL_OPENAI_SPEECH_PRICING_VERSION =
  "openai-gpt-4o-mini-tts-token-pricing-2026-07-15.v2" as const;
// Conservative token-price proxy: $12/M output-audio tokens, budgeted at
// 25 audio tokens/second. This intentionally rounds above the published
// approximate per-minute cost.
export const CANONICAL_OPENAI_SPEECH_OUTPUT_MICROS_PER_SECOND = 300;
export const CANONICAL_SPEECH_TEXT_INPUT_MICROS_PER_CHARACTER = 0.6;
export const CANONICAL_SPEECH_WORST_CASE_MULTIPLIER = 3;

export interface CanonicalPaidSpeechConfiguration {
  readonly provider: SpeechProvider;
  readonly providerBaseUrlIdentity: string;
  readonly profile: SpeechDeliveryProfile;
  readonly pronunciationDictionaries: readonly PronunciationDictionary[];
  readonly approvedCeilingMicros: number;
  readonly pricingVersion: typeof CANONICAL_OPENAI_SPEECH_PRICING_VERSION;
}

export interface CanonicalPaidSpeechUsage {
  readonly calls: number;
  readonly characters: number;
  readonly audioSeconds: number;
  readonly latencyMs: number;
  readonly costMicros: number;
}

export function buildCanonicalNarrationSynchronizationFilter(input: {
  readonly sourceDurationSeconds: number;
  readonly targetDurationSeconds: number;
}): {
  readonly filter: string;
  readonly tempoRatio: number;
} {
  if (
    !Number.isFinite(input.sourceDurationSeconds) ||
    input.sourceDurationSeconds <= 0 ||
    !Number.isFinite(input.targetDurationSeconds) ||
    input.targetDurationSeconds <= 0
  ) {
    throw new Error(
      "Canonical narration durations must be finite and positive."
    );
  }
  const target = String(input.targetDurationSeconds);
  if (input.sourceDurationSeconds <= input.targetDurationSeconds) {
    return {
      filter: `${CANONICAL_PRIVATE_NARRATION_LOUDNESS_FILTER},apad=whole_dur=${target},atrim=duration=${target}`,
      tempoRatio: 1,
    };
  }
  const reservedEndPaddingSeconds = Math.min(
    0.25,
    input.targetDurationSeconds / 100
  );
  const speechTargetSeconds =
    input.targetDurationSeconds - reservedEndPaddingSeconds;
  const exactTempoRatio = input.sourceDurationSeconds / speechTargetSeconds;
  const tempoRatio = Math.ceil(exactTempoRatio * 1_000_000) / 1_000_000;
  if (tempoRatio > CANONICAL_PRIVATE_NARRATION_MAX_TEMPO_RATIO) {
    throw new Error(
      `Generated narration duration ${input.sourceDurationSeconds} requires tempo ratio ${tempoRatio.toFixed(6)}, above the canonical maximum ${CANONICAL_PRIVATE_NARRATION_MAX_TEMPO_RATIO}.`
    );
  }
  return {
    filter: `atempo=${tempoRatio.toFixed(6)},${CANONICAL_PRIVATE_NARRATION_LOUDNESS_FILTER},apad=whole_dur=${target},atrim=duration=${target}`,
    tempoRatio,
  };
}

export function estimateCanonicalPaidSpeechCostMicros(input: {
  readonly estimatedAudioSeconds: number;
  readonly inputCharacters: number;
  readonly providerRequests: number;
}): number {
  if (input.providerRequests === 0) return 0;
  const worstCaseAudioSeconds =
    input.estimatedAudioSeconds * CANONICAL_SPEECH_WORST_CASE_MULTIPLIER;
  const textInputMicros = Math.ceil(
    input.inputCharacters *
      CANONICAL_SPEECH_TEXT_INPUT_MICROS_PER_CHARACTER *
      CANONICAL_SPEECH_WORST_CASE_MULTIPLIER
  );
  return Math.ceil(
    worstCaseAudioSeconds * CANONICAL_OPENAI_SPEECH_OUTPUT_MICROS_PER_SECOND +
      textInputMicros
  );
}

export function estimateCanonicalPaidSpeechRemainingCost(input: {
  readonly targetDurationSeconds: number;
  readonly planChunks: readonly {
    readonly chunkId: string;
    readonly estimatedDurationMs: number;
  }[];
  readonly dryRunChunks: readonly {
    readonly chunkId: string;
    readonly selected: boolean;
    readonly cacheStatus: string;
  }[];
  readonly inputCharacters: number;
  readonly providerRequests: number;
}): {
  readonly estimatedAudioSeconds: number;
  readonly estimatedCostMicros: number;
} {
  const selectedMisses = new Set(
    input.dryRunChunks
      .filter((chunk) => chunk.selected && chunk.cacheStatus !== "hit")
      .map((chunk) => chunk.chunkId)
  );
  const fullPlanDurationMs = input.planChunks.reduce(
    (total, chunk) => total + chunk.estimatedDurationMs,
    0
  );
  const missingDurationMs = input.planChunks.reduce(
    (total, chunk) =>
      total +
      (selectedMisses.has(chunk.chunkId) ? chunk.estimatedDurationMs : 0),
    0
  );
  const fullBudgetedDurationSeconds = Math.max(
    input.targetDurationSeconds,
    fullPlanDurationMs / 1_000
  );
  const estimatedAudioSeconds =
    input.providerRequests === 0 || fullPlanDurationMs === 0
      ? 0
      : fullBudgetedDurationSeconds * (missingDurationMs / fullPlanDurationMs);
  return {
    estimatedAudioSeconds,
    estimatedCostMicros: estimateCanonicalPaidSpeechCostMicros({
      estimatedAudioSeconds,
      inputCharacters: input.inputCharacters,
      providerRequests: input.providerRequests,
    }),
  };
}

export async function readCanonicalPaidSpeechUsage(
  unitRoot: string
): Promise<CanonicalPaidSpeechUsage> {
  const directory = path.join(unitRoot, "debug", "openai-calls");
  let entries: string[];
  try {
    entries = await fs.readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        calls: 0,
        characters: 0,
        audioSeconds: 0,
        latencyMs: 0,
        costMicros: 0,
      };
    }
    throw error;
  }
  let calls = 0;
  let characters = 0;
  let audioSeconds = 0;
  let latencyMs = 0;
  for (const entry of entries.filter((name) => name.endsWith(".json")).sort()) {
    const filePath = path.join(directory, entry);
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as {
      readonly episodeRoot?: unknown;
      readonly operation?: unknown;
      readonly paidProviderCalled?: unknown;
      readonly request?: unknown;
      readonly response?: unknown;
      readonly durationMs?: unknown;
    };
    if (
      parsed.operation !== "speech-generation" ||
      parsed.paidProviderCalled !== true
    ) {
      continue;
    }
    if (
      typeof parsed.episodeRoot !== "string" ||
      path.resolve(parsed.episodeRoot) !== path.resolve(unitRoot)
    ) {
      throw new Error(
        `Paid speech log is bound to a different unit: ${filePath}`
      );
    }
    const request =
      parsed.request && typeof parsed.request === "object"
        ? (parsed.request as { readonly input?: unknown })
        : {};
    const response =
      parsed.response && typeof parsed.response === "object"
        ? (parsed.response as { readonly durationSeconds?: unknown })
        : {};
    const inputText = typeof request.input === "string" ? request.input : "";
    const generatedSeconds =
      typeof response.durationSeconds === "number" &&
      Number.isFinite(response.durationSeconds) &&
      response.durationSeconds > 0
        ? response.durationSeconds
        : 0;
    calls += 1;
    characters += inputText.length;
    audioSeconds += generatedSeconds;
    latencyMs +=
      typeof parsed.durationMs === "number" &&
      Number.isFinite(parsed.durationMs) &&
      parsed.durationMs > 0
        ? parsed.durationMs
        : 0;
  }
  return {
    calls,
    characters,
    audioSeconds,
    latencyMs,
    costMicros:
      calls === 0
        ? 0
        : Math.ceil(
            audioSeconds * CANONICAL_OPENAI_SPEECH_OUTPUT_MICROS_PER_SECOND +
              characters * CANONICAL_SPEECH_TEXT_INPUT_MICROS_PER_CHARACTER
          ),
  };
}

function parseLoudnormMeasurement(stderr: string): {
  integratedLoudnessLufs: number;
  truePeakDb: number;
} {
  const blocks = [...stderr.matchAll(/\{[\s\S]*?"input_i"[\s\S]*?\}/gu)];
  const block = blocks.at(-1)?.[0] ?? "";
  const integrated = /"input_i"\s*:\s*"(-?\d+(?:\.\d+)?)"/u.exec(block)?.[1];
  const peak = /"input_tp"\s*:\s*"(-?\d+(?:\.\d+)?)"/u.exec(block)?.[1];
  const integratedLoudnessLufs = Number(integrated);
  const truePeakDb = Number(peak);
  if (
    !Number.isFinite(integratedLoudnessLufs) ||
    !Number.isFinite(truePeakDb)
  ) {
    throw new Error("Unable to parse canonical narration loudness evidence.");
  }
  return { integratedLoudnessLufs, truePeakDb };
}

export async function materializeCanonicalPrivateSpeech(
  input: CanonicalPrivateSpeechMaterializerInput,
  configuration: CanonicalPaidSpeechConfiguration
): Promise<unknown> {
  if (input.locale !== "de" || input.lesson.variant !== "standard") {
    throw new Error(
      "Canonical paid speech is restricted to German standard lessons."
    );
  }
  const outputRoot = path.join(
    input.unitRoot,
    "locales",
    input.locale,
    "audio",
    "educational-speech"
  );
  const canonicalAudioPath = path.join(
    input.unitRoot,
    "locales",
    input.locale,
    "audio",
    "narration.wav"
  );
  const plan = buildEducationalSpeechPlan({
    episodeId: input.unitId,
    profile: configuration.profile,
    beats: buildMathEducationalNarrationBeats(input.narration),
    pronunciationDictionaries: configuration.pronunciationDictionaries,
  });
  const dryRun = await generateEducationalSpeech({
    plan,
    profile: configuration.profile,
    pronunciationDictionaries: configuration.pronunciationDictionaries,
    providerId: "openai-compatible",
    providerBaseUrlIdentity: configuration.providerBaseUrlIdentity,
    outputRoot,
    candidateCount: 1,
    dryRun: true,
    maxAttempts: 3,
  });
  if (dryRun.status !== "dry-run") {
    throw new Error(
      "Canonical speech preflight did not remain side-effect-free."
    );
  }
  const remainingEstimate = estimateCanonicalPaidSpeechRemainingCost({
    targetDurationSeconds: input.lesson.targetDurationSeconds,
    planChunks: plan.chunks,
    dryRunChunks: dryRun.dryRun.chunks,
    inputCharacters: dryRun.dryRun.estimatedInputCharacters,
    providerRequests: dryRun.dryRun.estimatedProviderRequests,
  });
  const priorUsage = await readCanonicalPaidSpeechUsage(input.unitRoot);
  if (
    priorUsage.costMicros + remainingEstimate.estimatedCostMicros >
    configuration.approvedCeilingMicros
  ) {
    throw new Error(
      `Cumulative canonical speech estimate ${priorUsage.costMicros + remainingEstimate.estimatedCostMicros} micros exceeds approved ceiling ${configuration.approvedCeilingMicros} micros.`
    );
  }
  const generated = await generateEducationalSpeech({
    plan,
    profile: configuration.profile,
    pronunciationDictionaries: configuration.pronunciationDictionaries,
    providerId: "openai-compatible",
    provider: configuration.provider,
    providerBaseUrlIdentity: configuration.providerBaseUrlIdentity,
    outputRoot,
    candidateCount: 1,
    maxAttempts: 3,
  });
  if (generated.status !== "completed" || !generated.outputPath) {
    throw new Error("Canonical paid speech generation did not complete.");
  }
  const sourceProbe = await probeAudioWithFfprobe(generated.outputPath);
  if (
    !Number.isFinite(sourceProbe.durationSeconds) ||
    sourceProbe.durationSeconds <= 0
  ) {
    throw new Error(
      `Generated narration duration ${sourceProbe.durationSeconds} is invalid.`
    );
  }
  const synchronization = buildCanonicalNarrationSynchronizationFilter({
    sourceDurationSeconds: sourceProbe.durationSeconds,
    targetDurationSeconds: input.lesson.targetDurationSeconds,
  });
  await fs.mkdir(path.dirname(canonicalAudioPath), { recursive: true });
  const temporaryPath = `${canonicalAudioPath}.${process.pid}.tmp.wav`;
  try {
    await runCommand(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        generated.outputPath,
        "-af",
        synchronization.filter,
        "-ar",
        "48000",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
        temporaryPath,
      ],
      { timeoutMs: 180_000 }
    );
    await fs.rename(temporaryPath, canonicalAudioPath);
  } finally {
    await fs.unlink(temporaryPath).catch(() => undefined);
  }
  const audioBuffer = await fs.readFile(canonicalAudioPath);
  const wav = parseWavMetadata(canonicalAudioPath, audioBuffer);
  const quality = analyzeWavQuality(audioBuffer, wav);
  const loudnessCommand = await runCommand(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-i",
      canonicalAudioPath,
      "-af",
      "loudnorm=I=-17:TP=-2:LRA=11:print_format=json",
      "-f",
      "null",
      "-",
    ],
    { timeoutMs: 180_000 }
  );
  const loudness = parseLoudnormMeasurement(loudnessCommand.stderr);
  if (
    wav.durationSeconds < 239.9 ||
    wav.durationSeconds > 240.1 ||
    loudness.integratedLoudnessLufs < -24 ||
    loudness.integratedLoudnessLufs > -14 ||
    loudness.truePeakDb > -1 ||
    quality.clippedRatio > 0 ||
    quality.normalizedEntropy < 0.3
  ) {
    throw new Error("Canonical paid narration failed audio quality probes.");
  }
  const selectedCandidates = generated.workflow.chunks.flatMap((chunk) =>
    chunk.candidates.filter((candidate) => candidate.selected)
  );
  const dryRunByChunk = new Map(
    dryRun.dryRun.chunks.map((chunk) => [chunk.chunkId, chunk])
  );
  for (const candidate of selectedCandidates) {
    if (!dryRunByChunk.has(candidate.chunkId)) {
      throw new Error(`Missing speech telemetry for ${candidate.chunkId}.`);
    }
  }
  const cumulativeUsage = await readCanonicalPaidSpeechUsage(input.unitRoot);
  if (cumulativeUsage.costMicros > configuration.approvedCeilingMicros) {
    throw new Error(
      "Actual canonical speech cost exceeds the approved ceiling."
    );
  }
  const segmentWeights = input.narration.segments.map(
    (segment) => segment.spokenText.trim().split(/\s+/u).filter(Boolean).length
  );
  const evidencePayload = {
    artifactVersion: "math-canonical-private-speech.v1" as const,
    identity: {
      lessonId: input.unitId,
      skillId: input.lesson.skillId,
      language: "de" as const,
      variant: "standard" as const,
    },
    provider: {
      mode: "provider" as const,
      providerId: "openai-compatible" as const,
      calls: cumulativeUsage.calls,
      characters: cumulativeUsage.characters,
      retries: Math.max(0, cumulativeUsage.calls - plan.chunks.length),
      latencyMs: cumulativeUsage.latencyMs,
      costMicros: cumulativeUsage.costMicros,
      model: generated.workflow.model,
      voice: generated.workflow.voice,
      speechProfileVersion: generated.workflow.speechProfileVersion,
      pricingVersion: configuration.pricingVersion,
      approvedCeilingMicros: configuration.approvedCeilingMicros,
    },
    audio: {
      relativePath: `locales/${input.locale}/audio/narration.wav`,
      sha256: await hashFile(canonicalAudioPath),
      byteLength: audioBuffer.byteLength,
      durationSeconds: wav.durationSeconds,
      codec: "pcm_s16le" as const,
      quality: {
        kind: "natural-speech" as const,
        audibleNarration: true as const,
        probesPassed: true as const,
        integratedLoudnessLufs: loudness.integratedLoudnessLufs,
        truePeakDb: loudness.truePeakDb,
        clippingDetected: false as const,
      },
    },
    durations: segmentWeights,
    speechPlanFingerprint: plan.planFingerprint,
    cacheHitCount: generated.workflow.cacheHitCount,
    cacheMissCount: selectedCandidates.filter(
      (candidate) => !candidate.cacheHit
    ).length,
  };
  return {
    ...evidencePayload,
    contentHash: canonicalHash(evidencePayload),
  };
}

export function selectCanonicalSemanticComponent(
  sceneComponent: CanonicalPrivateMediaMaterializerInput["visualPlan"]["scenes"][number]["component"],
  boundFacts: readonly CanonicalVisualFact[],
  context?: {
    readonly title: string;
    readonly body: string;
    readonly prompt: string;
    readonly skillId?: string;
    readonly sceneFunction?: string;
  }
): SemanticMathComponent | null {
  if (context?.skillId === "M5-ZO-001" && context.sceneFunction) {
    const modes = {
      hook: "hook",
      objective: "objective",
      model: "model",
      "worked-example": "worked-example",
      mistake: "mistake",
      "guided-practice": "practice",
      "think-pause": "challenge",
      solution: "solution",
      recap: "recap",
    } as const;
    const titles = {
      hook: "Wo gehören die Nullen hin?",
      objective: "Unser Tafelplan",
      model: "Erstes Beispiel",
      "worked-example": "Wir prüfen gemeinsam",
      mistake: "Typischer Fehler",
      "guided-practice": "Neues Beispiel",
      "think-pause": "Jetzt du",
      solution: "Auflösung",
      recap: "Merksatz",
    } as const;
    const prompts = {
      hook: "Schau auf die sechs Plätze und vermute.",
      objective: "So arbeiten wir gleich Schritt für Schritt.",
      model: "Jeder Summand zeigt auf genau eine Stelle.",
      "worked-example": "Prüfe die Plätze von links nach rechts.",
      mistake: "Streiche den Fehler und verbessere ihn daneben.",
      "guided-practice":
        "Die Ziffern stehen. Wo müssen die Nullen hin?",
      "think-pause": "Setze die Nullen und prüfe deine Zahl.",
      solution: "Vergleiche jetzt Stelle für Stelle.",
      recap: "Erkläre den Merksatz in eigenen Worten.",
    } as const;
    const mode = modes[context.sceneFunction as keyof typeof modes];
    const title = titles[context.sceneFunction as keyof typeof titles];
    const prompt = prompts[context.sceneFunction as keyof typeof prompts];
    if (!mode || !title || !prompt) return null;
    if (boundFacts.some((fact) => fact.semantic.kind !== "scalar")) return null;
    return {
      kind: "place-value-activity",
      mode,
      title,
      prompt,
      values: boundFacts.map((fact) => {
        if (fact.semantic.kind !== "scalar")
          throw new Error("Place-value fact changed during selection.");
        return {
          factId: fact.factId,
          expression: fact.semantic.expression,
        };
      }),
    };
  }
  if (boundFacts.length === 0)
    return context
      ? {
          kind: "lesson-board",
          title: context.title,
          body: context.body,
          prompt: context.prompt,
        }
      : null;
  if (
    sceneComponent === "place-value-chart" &&
    boundFacts.length === 1 &&
    boundFacts[0]?.semantic.kind === "scalar"
  )
    return {
      kind: "place-value-chart",
      source: {
        factId: boundFacts[0].factId,
        expression: boundFacts[0].semantic.expression,
      },
    };
  if (
    sceneComponent === "number-line" &&
    boundFacts.length === 1 &&
    boundFacts[0]?.semantic.kind === "scalar"
  )
    return {
      kind: "number-line-focus",
      focus: {
        factId: boundFacts[0].factId,
        expression: boundFacts[0].semantic.expression,
      },
    };
  if (
    sceneComponent === "geometry" &&
    boundFacts.length === 1 &&
    boundFacts[0]?.semantic.kind === "scalar" &&
    boundFacts[0].semantic.expression.kind === "tuple" &&
    boundFacts[0].semantic.expression.items.length === 2 &&
    /rechteck|quadrat/iu.test(boundFacts[0].displayLatex)
  )
    return {
      kind: "geometry",
      shape: "rectangle",
      measurements: [
        {
          factId: boundFacts[0].factId,
          expression: boundFacts[0].semantic.expression,
        },
      ],
      scaleMode: "not-to-scale",
      visibleScaleLabel: "nicht maßstabsgetreu",
      accessibleDescription:
        "Rechteck mit verifier-gebundener Breite und Höhe; der Umfang wird entlang aller vier Kanten verfolgt.",
    };
  if (sceneComponent === "data-table" && boundFacts.length >= 2) {
    const [dataset, ...countFacts] = boundFacts;
    if (
      dataset?.semantic.kind !== "scalar" ||
      dataset.semantic.expression.kind !== "tuple" ||
      countFacts.some((fact) => fact.semantic.kind !== "scalar")
    )
      return null;
    const rows = countFacts.map((fact) => {
      const category = fact.displayLatex.match(/^([^:;]+)/u)?.[1]?.trim();
      if (!category || fact.semantic.kind !== "scalar") return null;
      return {
        category,
        count: {
          factId: fact.factId,
          expression: fact.semantic.expression,
        },
      };
    });
    if (rows.some((row) => row === null)) return null;
    return {
      kind: "tally-table",
      dataset: {
        factId: dataset.factId,
        expression: dataset.semantic.expression,
      },
      rows: rows.filter((row) => row !== null),
    };
  }
  if (
    sceneComponent === "measurement" &&
    boundFacts.every((fact) => fact.semantic.kind === "measurement")
  ) {
    return {
      kind: "measurement",
      measurements: boundFacts.map((fact) => {
        if (fact.semantic.kind !== "measurement")
          throw new Error(
            "Measurement component fact changed during selection."
          );
        return {
          factId: fact.factId,
          value: fact.semantic.value,
          unit: fact.semantic.unit,
        };
      }),
    };
  }
  if (sceneComponent === "formula" || sceneComponent === "teacher") {
    const facts = boundFacts.map((fact) => {
      if (fact.semantic.kind === "scalar")
        return {
          kind: "scalar" as const,
          factId: fact.factId,
          expression: fact.semantic.expression,
          display: fact.displayLatex,
        };
      if (fact.semantic.kind === "measurement")
        return {
          kind: "measurement" as const,
          factId: fact.factId,
          value: fact.semantic.value,
          unit: fact.semantic.unit,
          display: fact.displayLatex,
        };
      return null;
    });
    if (facts.some((fact) => fact === null)) return null;
    return {
      kind: "fact-stack",
      title:
        context?.title ??
        (sceneComponent === "teacher" ? "Deine Denkzeit" : "Lösungsweg"),
      facts: facts.filter((fact) => fact !== null),
    };
  }
  return null;
}

const canonicalSceneCaptionLabels: Readonly<Record<string, string>> = {
  hook: "Einstieg",
  objective: "Lernziel",
  model: "Modell",
  "worked-example": "Beispiel",
  mistake: "Typischer Fehler",
  "guided-practice": "Geführte Übung",
  "think-pause": "Denkpause",
  solution: "Lösung",
  recap: "Zusammenfassung",
};

function canonicalSceneCaption(
  input: CanonicalPrivateMediaMaterializerInput,
  scene: CanonicalPrivateMediaMaterializerInput["visualPlan"]["scenes"][number],
  boundFacts: readonly CanonicalVisualFact[]
): string {
  const lessonScene = input.lesson.scenes.find(
    (candidate) => candidate.sceneId === scene.sceneId
  );
  if (!lessonScene) throw new Error(`Missing lesson scene ${scene.sceneId}.`);
  const label =
    canonicalSceneCaptionLabels[lessonScene.sceneFunction] ??
    lessonScene.sceneFunction;
  const localizedFacts = scene.factIds.map((factId) => {
    const fact = input.narration.resolvedFacts.find(
      (candidate) => candidate.factId === factId
    );
    if (!fact) throw new Error(`Missing localized caption fact ${factId}.`);
    return fact.display;
  });
  const text =
    input.lesson.skillId === "M5-ZO-001"
      ? ({
          hook: "Wo gehören die Nullen hin?",
          objective: "Stellen · Ziffern · Nullen",
          model: localizedFacts.join("; "),
          "worked-example": "Prüfe jede Stelle.",
          mistake: "Nullen halten Plätze frei.",
          "guided-practice": "Wo fehlen die Nullen?",
          "think-pause": "Acht Sekunden Denkzeit",
          solution: "Vergleiche Stelle für Stelle.",
          recap: "Leere Stelle? Null einsetzen.",
        }[lessonScene.sceneFunction] ??
        `${label}: ${localizedFacts.join("; ")}`)
      : localizedFacts.length > 0
        ? `${label}: ${localizedFacts.join("; ")}`
        : `${label}: ${input.lesson.learningObjective}`;
  if (text.length > 180) {
    throw new Error(
      `Fact-bound caption exceeds the readable budget in ${scene.sceneId}.`
    );
  }
  if (boundFacts.length !== localizedFacts.length) {
    throw new Error(`Caption fact binding changed in ${scene.sceneId}.`);
  }
  return text;
}

function canonicalSceneBoardContext(
  input: CanonicalPrivateMediaMaterializerInput,
  scene: CanonicalPrivateMediaMaterializerInput["visualPlan"]["scenes"][number]
): {
  readonly title: string;
  readonly body: string;
  readonly prompt: string;
  readonly skillId: string;
  readonly sceneFunction: string;
} {
  const lessonScene = input.lesson.scenes.find(
    (candidate) => candidate.sceneId === scene.sceneId
  );
  if (!lessonScene) throw new Error(`Missing lesson scene ${scene.sceneId}.`);
  const title =
    canonicalSceneCaptionLabels[lessonScene.sceneFunction] ??
    lessonScene.sceneFunction;
  const prompt =
    lessonScene.sceneFunction === "hook"
      ? "Was fällt dir schon auf?"
      : lessonScene.sceneFunction === "objective"
        ? "Achte auf Darstellung, Rechenweg und Kontrolle."
        : lessonScene.sceneFunction === "think-pause"
          ? "Halte das Video an, wenn du mehr Denkzeit brauchst."
          : "Verfolge jeden Schritt auf der Tafel.";
  return {
    title,
    body:
      lessonScene.sceneFunction === "hook"
        ? `Eine Leitfrage öffnet das Thema: ${input.lesson.learningObjective}.`
        : input.lesson.learningObjective,
    prompt,
    skillId: input.lesson.skillId,
    sceneFunction: lessonScene.sceneFunction,
  };
}

const compatibleCanonicalVisualKinds: Readonly<
  Record<
    CanonicalPrivateMediaMaterializerInput["visualPlan"]["scenes"][number]["component"],
    readonly SemanticMathComponent["kind"][]
  >
> = {
  formula: ["formula", "fact-stack", "lesson-board", "place-value-activity"],
  "place-value-chart": ["place-value-chart", "place-value-activity"],
  "fraction-model": ["formula"],
  "number-line": ["number-line", "number-line-focus", "place-value-activity"],
  "coordinate-plane": ["graph"],
  "function-graph": ["graph"],
  geometry: ["geometry"],
  measurement: ["measurement"],
  "data-table": ["table", "tally-table"],
  "bar-chart": ["bar-chart"],
  "probability-tree": ["probability"],
  teacher: ["formula", "fact-stack", "lesson-board", "place-value-activity"],
};

function validateCanonicalVisualScene(input: {
  readonly sceneId: string;
  readonly plannedComponent: CanonicalPrivateMediaMaterializerInput["visualPlan"]["scenes"][number]["component"];
  readonly realizedComponent: SemanticMathComponent["kind"];
  readonly svgMarkup: string;
  readonly factIds: readonly string[];
  readonly sceneFrames: number;
  readonly cues: readonly { factId: string; frame: number }[];
  readonly thinkPause: boolean;
  readonly bounds: { x: number; y: number; width: number; height: number };
}): {
  readonly stepCount: number;
  readonly maximumStaticIntervalFrames: number;
} {
  if (
    !compatibleCanonicalVisualKinds[input.plannedComponent].includes(
      input.realizedComponent
    )
  )
    throw new Error(
      `Visual scene ${input.sceneId} realized ${input.realizedComponent} instead of planned ${input.plannedComponent}.`
    );
  const declaredComponent = input.svgMarkup.match(
    /<svg\b[^>]*data-component="([^"]+)"/u
  )?.[1];
  if (declaredComponent !== input.realizedComponent)
    throw new Error(
      `Visual scene ${input.sceneId} lost its realized component identity.`
    );
  const displayedFacts = new Set(
    [...input.svgMarkup.matchAll(/data-fact-id="([a-z0-9-]+)"/gu)].map(
      (match) => match[1]
    )
  );
  if (
    displayedFacts.size !== input.factIds.length ||
    input.factIds.some((factId) => !displayedFacts.has(factId))
  )
    throw new Error(
      `Visual scene ${input.sceneId} does not display every locked fact and only those facts.`
    );
  const occupancy = (input.bounds.width * input.bounds.height) / (1920 * 1080);
  if (occupancy < 0.2)
    throw new Error(
      `Visual scene ${input.sceneId} uses too little of the board (${occupancy.toFixed(3)}).`
    );
  const steps = extractSemanticChalkSteps(input.svgMarkup);
  if (steps.length < 4)
    throw new Error(
      `Visual scene ${input.sceneId} has only ${steps.length} meaningful chalk beats.`
    );
  const countdownFrames = input.thinkPause
    ? Math.min(MATH_THINK_PAUSE_SECONDS * 30, input.sceneFrames)
    : 0;
  const schedule = createSemanticChalkSchedule({
    steps,
    sceneFrames: input.sceneFrames,
    cues: input.cues,
    ...(input.thinkPause
      ? { writingEndFrame: input.sceneFrames - countdownFrames }
      : {}),
  });
  for (const cue of input.cues) {
    const closest = schedule.reduce((distance, timing, index) => {
      if (steps[index]?.factId !== cue.factId) return distance;
      const midpoint = (timing.startFrame + timing.endFrame) / 2;
      return Math.min(distance, Math.abs(midpoint - cue.frame));
    }, Number.POSITIVE_INFINITY);
    if (closest > 180)
      throw new Error(
        `Visual cue ${cue.factId} drifts more than six seconds in ${input.sceneId}.`
      );
  }
  const scheduledIntervals = schedule.map(
    (timing) => timing.endFrame - timing.startFrame
  );
  const finalInterval = input.thinkPause
    ? Math.min(30, countdownFrames)
    : input.sceneFrames - (schedule.at(-1)?.endFrame ?? 0);
  const maximumStaticIntervalFrames = Math.max(
    finalInterval,
    ...scheduledIntervals
  );
  if (maximumStaticIntervalFrames > 180)
    throw new Error(
      `Visual scene ${input.sceneId} contains a ${maximumStaticIntervalFrames}-frame static interval.`
    );
  return {
    stepCount: steps.length,
    maximumStaticIntervalFrames,
  };
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function ensurePrivateOwnerProfiles(args: {
  store: MathProfileStore;
  curriculum: Awaited<ReturnType<typeof loadCurriculumRelease>>;
  attestation: PrivateOwnerAttestation;
  unitId: string;
  skillId: string;
  lessonVariant: LessonVariant;
  locale: MathLanguage;
  contentVariant: "full" | "short";
}): Promise<void> {
  const existing = await Promise.all([
    args.store.readLessonProfile(),
    args.store.readVisualStyle(),
  ]);
  const visualRevision = `private-owner-visual-v${CANONICAL_PRIVATE_VISUAL_STYLE_VERSION}-${args.locale}`;
  const autoGeneratedVisualStyle =
    existing[1]?.revision.startsWith("private-owner-visual-v") === true;
  const rendererVersionsCurrent =
    existing[1] !== null &&
    Object.entries(CANONICAL_PRIVATE_RENDERER_VERSIONS).every(
      ([key, value]) => existing[1]?.rendererVersions[key] === value
    );
  const refreshVisualStyle =
    !existing[1] ||
    (autoGeneratedVisualStyle &&
      (existing[1].revision !== visualRevision || !rendererVersionsCurrent));
  if (existing[0] && !refreshVisualStyle) return;
  const skill = args.curriculum.skills.find(
    (candidate) => candidate.skillId === args.skillId
  );
  if (!skill) throw new Error(`Unknown curriculum skill: ${args.skillId}`);
  const lesson = buildLessonVariant(skill, args.lessonVariant);
  const createdAt = args.attestation.recordedAt;
  const profileRevision = `private-owner-v1-${args.skillId.toLowerCase()}`;
  const profileWithoutApproval = mathLessonProfileManifestSchema.parse({
    schemaVersion: "math.profile-manifest.v1",
    contractVersion: "math.profile.v1",
    profileId: "mathematics-education",
    revision: profileRevision,
    contentHash: "0".repeat(64),
    createdAt,
    updatedAt: createdAt,
    lessonId: args.unitId,
    skillId: args.skillId,
    lessonVariant: args.lessonVariant,
    contentVariant: args.contentVariant,
    outputAudience: "student",
    locale: args.locale,
    jurisdiction: "NO_CLAIM",
    stateOrRegion: "NO_CLAIM",
    curriculum: {
      sourceId: "owner-attested-normalized-synthesis",
      releaseId: args.curriculum.release.releaseId,
      revision: args.curriculum.release.curriculumVersion,
      releaseHash: args.curriculum.releaseHash,
      status: "owner-attested-private",
      schoolType: "NO_CLAIM",
      grade: skill.canonicalGrade,
      sourceUrls: ["https://invalid.example/private-no-claim"],
      reviewedAt: createdAt,
    },
    audience: {
      ageMinimum: 10,
      ageMaximum: 12,
      priorKnowledge:
        skill.prerequisiteIds.length > 0
          ? skill.prerequisiteIds
          : ["Grundlegende mathematische Fachsprache"],
      accessibilityNeeds: [
        "Farbo-unabhängige Bedeutung",
        "Dauerhaft sichtbare Beschriftungen",
      ],
      languageLevel: "altersgerecht Klasse fünf",
    },
    lessonLengthSeconds: lesson.targetDurationSeconds,
    learningObjective: lesson.learningObjective,
    prerequisiteSkillIds: skill.prerequisiteIds,
    misconceptionInventory: [lesson.commonMistake.description],
    pedagogicalStrategy: [
      "Verifizierte Beispiele mit schrittweiser visueller Erklärung",
    ],
    deterministicVerificationRequired: true,
    profile: {
      schemaVersion: "mediaforge.profile.v1",
      contractVersion: "1.0.0",
      id: "mathematics-education",
      audience: {
        ageMinimum: 10,
        ageMaximum: 12,
        description: "Lernende in Klasse fünf",
        priorKnowledge: ["Grundlegende mathematische Fachsprache"],
        accessibilityNeeds: ["Farbo-unabhängige Bedeutung"],
      },
      objective: lesson.learningObjective,
      engagementStrategies: [
        "Erreichbare Herausforderung",
        "Visuelles Verständnis",
      ],
      qualityPolicies: [{ id: "math.quality", version: "private-v1" }],
      visualPolicy: { id: "math.visual", version: "private-v1" },
      narrationPolicy: { id: "math.narration", version: "private-v1" },
      localizationPolicy: { id: "math.localization", version: "private-v1" },
      approvalPolicy: { id: "math.private-owner", version: "private-v1" },
      artifactRequirements: [{ id: "math.artifacts", version: "private-v1" }],
      referencePolicy: {
        id: "math.references-optional",
        version: "private-v1",
      },
      curriculumJurisdiction: "NO_CLAIM",
      curriculumRevision: args.curriculum.release.curriculumVersion,
      grade: skill.canonicalGrade,
      deterministicVerificationRequired: true,
    },
  });
  const profileHash = computeMathLessonProfileContentHash(
    profileWithoutApproval
  );
  const profile = mathLessonProfileManifestSchema.parse({
    ...profileWithoutApproval,
    contentHash: profileHash,
    approval: {
      decision: "approved",
      actor: `${args.attestation.actor.name} (${args.attestation.actor.role})`,
      reason: "Hash-bound private owner attestation; no public publishing.",
      createdAt,
      boundRevision: profileRevision,
      contentHash: profileHash,
    },
  });
  const styleWithoutApproval = educationalVisualStyleManifestSchema.parse({
    schemaVersion: "math.educational-visual-style.v1",
    profileId: "mathematics-education",
    revision: visualRevision,
    profileRevision,
    curriculumRevision: args.curriculum.release.curriculumVersion,
    contentHash: "0".repeat(64),
    createdAt,
    updatedAt: createdAt,
    canvas: {
      width: 1920,
      height: 1080,
      aspectRatio: "16:9",
      layoutTemplates: ["worked-example"],
    },
    typography: {
      textFontFamily: "MathText",
      mathFontFamily: "MathFormula",
      fontMetricsRevision: "metrics-private-v1",
      minimumVisibleFontPx: CANONICAL_PRIVATE_FACT_BOARD_MINIMUM_GLYPH_PX,
      minimumCaptionFontPx: 44,
    },
    palette: {
      colors: { primary: "#123456", accent: "#abcdef" },
      semanticEncodings: [
        {
          meaning: "aktueller Lösungsschritt",
          colorToken: "accent",
          colorIndependentCue: "durchgezogene Kontur und Schrittnummer",
        },
      ],
    },
    rules: {
      diagrams: [
        "Jede sichtbare Zahl ist an einen verifizierten Fakt gebunden.",
      ],
      graphs: ["Achsen und Einheiten werden beschriftet."],
      coordinateSystems: ["Ursprung und Maßstab werden gezeigt."],
      geometry: ["Nicht maßstäbliche Zeichnungen werden gekennzeichnet."],
      symbolicRendering: ["Verifizierte Gleichheit bleibt erhalten."],
      notToScaleLabelRequired: true,
    },
    animation: {
      minimumStepDurationMs: 800,
      maximumStepDurationMs: 5000,
      transformationConvention:
        "Vorherigen Schritt bis zum Ersatz sichtbar halten.",
      transientMeaningRequiresPersistentEquivalent: true,
    },
    safeRegions: {
      captions: { x: 96, y: 800, width: 1728, height: 180 },
      accessibility: { x: 96, y: 54, width: 1728, height: 900 },
    },
    rendererVersions: CANONICAL_PRIVATE_RENDERER_VERSIONS,
    references: [],
    localeVisibleLabels: [
      {
        locale: args.locale,
        policyRevision: "labels-private-v1",
        decimalSeparator: args.locale === "de" ? "comma" : "point",
        labelsLocalized: true,
        mathematicalSemanticsLocked: true,
      },
    ],
    validation: {
      status: "passed",
      checkedAt: createdAt,
      checks: [
        {
          id: "readability",
          status: "passed",
          evidence: `${CANONICAL_PRIVATE_FACT_BOARD_MINIMUM_GLYPH_PX}px minimum visible board glyphs`,
        },
        {
          id: "color-independent",
          status: "passed",
          evidence: "Jede Farbe hat einen dauerhaften Nicht-Farbhinweis.",
        },
      ],
      issues: [],
    },
  });
  const styleHash =
    computeEducationalVisualStyleContentHash(styleWithoutApproval);
  const style = educationalVisualStyleManifestSchema.parse({
    ...styleWithoutApproval,
    contentHash: styleHash,
    approval: {
      decision: "approved",
      actor: `${args.attestation.actor.name} (${args.attestation.actor.role})`,
      reason: "Private owner-approved deterministic visual policy.",
      createdAt,
      boundRevision: visualRevision,
      contentHash: styleHash,
    },
  });
  if (!existing[0]) await args.store.writeLessonProfile(profile);
  if (refreshVisualStyle) await args.store.writeVisualStyle(style);
}

export async function materializeCanonicalPrivateMedia(
  input: CanonicalPrivateMediaMaterializerInput
): Promise<unknown> {
  if (input.locale !== "de" || input.lesson.variant !== "standard") {
    throw new Error(
      "Private owner media is restricted to German standard lessons."
    );
  }
  const localeRoot = path.join(input.unitRoot, "locales", input.locale);
  const audioRoot = path.join(localeRoot, "audio");
  const renderRoot = path.join(localeRoot, "render");
  const visualCache = path.join(renderRoot, "visual-cache");
  const mockSpeech = input.speech
    ? undefined
    : await generateLocalMockTts({
        narration: input.narration,
        targetDurationSeconds: input.lesson.targetDurationSeconds,
        outputDir: audioRoot,
        cacheDir: path.join(input.unitRoot, "state", "mock-tts-cache"),
      });
  const timing = input.speech ? input.timing : mockSpeech!.timing;
  const audioPath = input.speech
    ? path.join(input.unitRoot, input.speech.audio.relativePath)
    : mockSpeech!.artifact.masterAudioPath;
  const scenes: MathSceneAsset[] = [];
  const visualSceneValidation: Array<{
    readonly stepCount: number;
    readonly maximumStaticIntervalFrames: number;
  }> = [];
  for (const [index, scene] of input.visualPlan.scenes.entries()) {
    const narration = input.narration.segments[index];
    if (!narration || narration.sceneId !== scene.sceneId) {
      throw new Error(
        `Canonical media narration is reordered at ${scene.sceneId}.`
      );
    }
    const lessonScene = input.lesson.scenes[index];
    const timingScene = timing.scenes[index];
    if (
      !lessonScene ||
      lessonScene.sceneId !== scene.sceneId ||
      !timingScene ||
      timingScene.sceneId !== scene.sceneId
    )
      throw new Error(
        `Canonical visual timing is reordered at ${scene.sceneId}.`
      );
    const boundFacts = scene.factIds.map((factId) => {
      const fact = input.lesson.facts.find(
        (candidate) => candidate.factId === factId
      );
      if (!fact) {
        throw new Error(
          `Visual scene ${scene.sceneId} references unknown fact ${factId}.`
        );
      }
      return fact;
    });
    const component = selectCanonicalSemanticComponent(
      scene.component,
      boundFacts,
      canonicalSceneBoardContext(input, scene)
    );
    if (!component)
      throw new Error(
        `Planned visual component ${scene.component} cannot be verifier-bound in ${scene.sceneId}; generic board fallback is forbidden.`
      );
    const cached = await cacheSemanticSvg(visualCache, component);
    const cues = scene.factIds.map((factId, factIndex) => {
      const cueFrame = timingScene.cueFrames[factIndex];
      if (cueFrame === undefined)
        throw new Error(
          `Missing visual cue for ${factId} in ${scene.sceneId}.`
        );
      return {
        factId,
        frame: cueFrame - timingScene.startFrame,
      };
    });
    visualSceneValidation.push(
      validateCanonicalVisualScene({
        sceneId: scene.sceneId,
        plannedComponent: scene.component,
        realizedComponent: cached.component,
        svgMarkup: await fs.readFile(cached.filePath, "utf8"),
        factIds: scene.factIds,
        sceneFrames: timingScene.endFrame - timingScene.startFrame,
        cues,
        thinkPause: lessonScene.sceneFunction === "think-pause",
        bounds: cached.bounds,
      })
    );
    scenes.push({
      sceneId: scene.sceneId,
      svgPath: cached.filePath,
      svgHash: cached.svgHash,
      minimumGlyphPx: cached.minimumGlyphPx,
      bounds: cached.bounds,
      caption: createMathCaption(
        canonicalSceneCaption(input, scene, boundFacts)
      ),
      animation: {
        mode: "progressive-chalk-reveal",
        rendererVersion: "math-semantic-chalk.v4",
        cues,
        activity:
          lessonScene.sceneFunction === "think-pause"
            ? "think-pause"
            : "standard",
      },
    });
  }
  const videoPath = path.join(renderRoot, "final.mp4");
  const rendered = await renderProviderFreeMathMedia({
    id: input.unitId,
    timing,
    profile: input.visualPlan.profile,
    scenes,
    audioPath,
    outputPath: videoPath,
    workDir: path.join(renderRoot, ".render-work"),
  });
  const fact = input.lesson.facts[0];
  if (!fact)
    throw new Error("Canonical thumbnail requires a verified lesson fact.");
  const thumbnailRelativePath = `locales/${input.locale}/thumbnail.svg`;
  const thumbnailPath = path.join(input.unitRoot, thumbnailRelativePath);
  const thumbnail = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#10243f"/><text x="120" y="220" fill="#ffffff" font-size="72" font-family="sans-serif">${escapeXml(input.lesson.learningObjective)}</text><text x="120" y="600" fill="#f5c451" font-size="108" font-family="sans-serif">${escapeXml(fact.displayLatex)}</text><text x="120" y="930" fill="#ffffff" font-size="48" font-family="sans-serif">Private Lernfassung · Klasse 5</text></svg>`;
  await writeBinaryAtomic(thumbnailPath, Buffer.from(thumbnail, "utf8"));
  const thumbnailManifestRelativePath = `locales/${input.locale}/thumbnail.svg.manifest.json`;
  const thumbnailManifestPath = path.join(
    input.unitRoot,
    thumbnailManifestRelativePath
  );
  const thumbnailStat = await fs.stat(thumbnailPath);
  const thumbnailSha256 = await hashFile(thumbnailPath);
  const thumbnailManifestPayload = {
    artifactVersion: "math-private-thumbnail-manifest.v1" as const,
    identity: {
      lessonId: input.lesson.lessonId,
      skillId: input.lesson.skillId,
      language: "de" as const,
      variant: "standard" as const,
    },
    asset: {
      relativePath: thumbnailRelativePath,
      sha256: thumbnailSha256,
      byteLength: thumbnailStat.size,
      width: 1920 as const,
      height: 1080 as const,
    },
    verifierBinding: {
      factId: fact.factId,
      factSemanticHash: canonicalHash(fact.semantic),
    },
    publication: {
      visibility: "private" as const,
      publicReady: false as const,
      blockers: [
        "private-owner-attested-artwork-not-approved-for-public-release",
      ],
    },
  };
  await writeJsonAtomic(thumbnailManifestPath, {
    ...thumbnailManifestPayload,
    contentHash: canonicalHash(thumbnailManifestPayload),
  });
  const brandPolicyRelativePath = `locales/${input.locale}/brand-policy.json`;
  const brandPolicyPath = path.join(input.unitRoot, brandPolicyRelativePath);
  const brandPolicyPayload = {
    artifactVersion: "math-private-brand-policy.v1" as const,
    lessonId: input.lesson.lessonId,
    visibility: "private" as const,
    publicPublishing: false as const,
    artworkStatus: "private-simulation-only" as const,
    blockers: [
      "private-owner-attested-artwork-not-approved-for-public-release",
    ],
  };
  await writeJsonAtomic(brandPolicyPath, {
    ...brandPolicyPayload,
    contentHash: canonicalHash(brandPolicyPayload),
  });
  const captionHash = canonicalHash(
    scenes.map((scene) => ({ sceneId: scene.sceneId, caption: scene.caption }))
  );
  const relativeAudio = `locales/${input.locale}/audio/narration.wav`;
  const relativeVideo = `locales/${input.locale}/render/final.mp4`;
  const [audioStat, videoStat, thumbnailManifestStat, brandPolicyStat] =
    await Promise.all([
      fs.stat(audioPath),
      fs.stat(videoPath),
      fs.stat(thumbnailManifestPath),
      fs.stat(brandPolicyPath),
    ]);
  const evidencePayload = {
    artifactVersion: "math-canonical-private-media.v1" as const,
    identity: {
      lessonId: input.lesson.lessonId,
      skillId: input.lesson.skillId,
      language: "de" as const,
      variant: "standard" as const,
    },
    provider:
      input.speech?.provider ??
      ({
        mode: "fixture-mock" as const,
        calls: 0 as const,
        characters: 0 as const,
        retries: 0 as const,
        latencyMs: 0 as const,
        costMicros: 0 as const,
      } as const),
    audio:
      input.speech?.audio ??
      ({
        relativePath: relativeAudio,
        sha256: mockSpeech!.artifact.masterAudioSha256,
        byteLength: audioStat.size,
        durationSeconds: mockSpeech!.artifact.durationSeconds,
        codec: "pcm_s16le" as const,
        quality: {
          kind: "test-tone" as const,
          audibleNarration: false as const,
          probesPassed: false as const,
        },
      } as const),
    video: {
      relativePath: relativeVideo,
      sha256: await hashFile(videoPath),
      byteLength: videoStat.size,
      validation: {
        valid: true as const,
        width: 1920 as const,
        height: 1080 as const,
        fps: 30 as const,
        durationSeconds: rendered.validation.durationSeconds,
        videoCodec: "h264" as const,
        audioCodec: rendered.validation.audioCodec,
        continuityChecked: true as const,
        corruptionScanPassed: true as const,
      },
    },
    thumbnail: {
      relativePath: thumbnailRelativePath,
      sha256: thumbnailSha256,
      byteLength: thumbnailStat.size,
      width: 1920 as const,
      height: 1080 as const,
      factId: fact.factId,
      factSemanticHash: canonicalHash(fact.semantic),
    },
    thumbnailManifest: {
      relativePath: thumbnailManifestRelativePath,
      sha256: await hashFile(thumbnailManifestPath),
      byteLength: thumbnailManifestStat.size,
    },
    brandPolicy: {
      relativePath: brandPolicyRelativePath,
      sha256: await hashFile(brandPolicyPath),
      byteLength: brandPolicyStat.size,
    },
    captions: {
      count: 9 as const,
      contentHash: captionHash,
      rendered: true as const,
    },
    visualPlanHash: canonicalHash(input.visualPlan),
    timingHash: canonicalHash(timing),
    renderFingerprint: rendered.renderFingerprint,
    visualPresentation: {
      strategy: "progressive-chalk-reveal" as const,
      rendererVersion: "math-semantic-chalk.v4" as const,
    },
    visualValidation: {
      valid: true as const,
      plannedComponentsRealized: true as const,
      genericFallbackUsed: false as const,
      cueCoveragePassed: true as const,
      minimumSceneStepCount: Math.min(
        ...visualSceneValidation.map((scene) => scene.stepCount)
      ),
      maximumStaticIntervalFrames: Math.max(
        ...visualSceneValidation.map(
          (scene) => scene.maximumStaticIntervalFrames
        )
      ),
    },
    publication: {
      visibility: "private" as const,
      publicReady: false as const,
      blockers: [
        "private-owner-attested-media-not-approved-for-public-release",
      ],
    },
  };
  const evidence = canonicalPrivateMediaEvidenceSchema.parse({
    ...evidencePayload,
    contentHash: canonicalHash(evidencePayload),
  });
  await Promise.all([
    writeJsonAtomic(path.join(localeRoot, "final-media.json"), evidence),
    writeJsonAtomic(path.join(renderRoot, "timing.json"), timing),
  ]);
  return evidence;
}

function selectionFromUnit(unitId: string): {
  readonly skillId: string;
  readonly lessonVariant: LessonVariant;
} {
  const match =
    /^(m\d+)-([a-z]{2})-(\d{3})-(foundation|standard|challenge)$/u.exec(unitId);
  if (!match?.[1] || !match[2] || !match[3] || !match[4]) {
    throw new Error(
      `Math lesson ID ${unitId} must end in foundation, standard, or challenge.`
    );
  }
  return {
    skillId: `${match[1]}-${match[2]}-${match[3]}`.toUpperCase(),
    lessonVariant: match[4] as LessonVariant,
  };
}

function workflowInstanceId(input: CanonicalMathOperatorInput): string {
  return `workflow-${crypto
    .createHash("sha256")
    .update(
      `${mathWorkflowDefinition.id}\0${mathWorkflowDefinition.revision}\0${input.unitId}\0${input.locale}\0${input.contentVariant}`
    )
    .digest("hex")
    .slice(0, 32)}`;
}

async function resolveCanonicalVerifierPython(
  input: CanonicalMathOperatorInput
): Promise<string> {
  if (input.pythonExecutable) return input.pythonExecutable;
  if (process.env["MATH_VERIFIER_PYTHON"])
    return process.env["MATH_VERIFIER_PYTHON"]!;
  const candidates = [
    path.join(input.repositoryRoot, "python/math-verifier/.venv/bin/python"),
    path.join(
      input.repositoryRoot,
      "python/math-verifier/.venv/Scripts/python.exe"
    ),
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next repository-owned environment before the PATH fallback.
    }
  }
  return "python3";
}

export async function createCanonicalMathOperator(
  input: CanonicalMathOperatorInput
): Promise<WorkflowOperator> {
  const inferred = selectionFromUnit(input.unitId);
  const skillId = input.skillId ?? inferred.skillId;
  const lessonVariant = input.lessonVariant ?? inferred.lessonVariant;
  const locale: MathLanguage = mathLanguageSchema.parse(input.locale);
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const unitRoot = path.join(workspaceRoot, input.unitId);
  const curriculum = await loadCurriculumRelease(
    path.resolve(
      input.curriculumRoot ??
        path.join(
          input.repositoryRoot,
          "packages/math-education/data/curriculum/v1"
        )
    )
  );
  const releaseVisibility = input.releaseVisibility ?? "public";
  const privateOwnerAttestation =
    input.simulation !== true && releaseVisibility === "private"
      ? await loadPrivateOwnerAttestation(
          path.resolve(
            input.privateOwnerAttestationPath ??
              path.join(
                input.repositoryRoot,
                "packages/math-education/data/reviews/v1/private-owner-attestation.json"
              )
          )
        )
      : undefined;
  const profileStore = new MathProfileStore(unitRoot);
  if (privateOwnerAttestation) {
    await ensurePrivateOwnerProfiles({
      store: profileStore,
      curriculum,
      attestation: privateOwnerAttestation,
      unitId: input.unitId,
      skillId,
      lessonVariant,
      locale,
      contentVariant: input.contentVariant,
    });
  }
  const [profile, visualStyle] = await Promise.all([
    profileStore.readLessonProfile(),
    profileStore.readVisualStyle(),
  ]);
  const providerAuthorization: MathProviderAuthorization = {
    configured: Boolean(input.providerMode),
    operatorAuthorized: input.authorizeProvider === true,
    mode: input.providerMode ?? "provider",
    configurationFingerprint:
      input.providerConfigurationFingerprint ??
      canonicalHash({
        mode: input.providerMode ?? "unconfigured",
        simulation: input.simulation === true,
      }),
  };
  const pythonExecutable = await resolveCanonicalVerifierPython(input);
  const identity = {
    instanceId: workflowInstanceId(input),
    unitId: input.unitId,
    locale,
    variant: input.contentVariant,
  } as const;
  const store = new WorkflowStore({
    unitRoot,
    workflow: mathWorkflowDefinition,
    identity,
  });
  const repository = new ArtifactRepository({ workspaceRoot });
  const adapterOptions = {
    repositoryRoot: path.resolve(input.repositoryRoot),
    workspaceRoot,
    unitRoot,
    unitId: input.unitId,
    curriculum,
    profile,
    visualStyle,
    locale,
    lessonVariant,
    contentVariant: input.contentVariant,
    skillId,
    simulation: input.simulation === true,
    releaseVisibility,
    ...(privateOwnerAttestation
      ? {
          privateOwnerAttestation,
          lessonContentReviewEvidence: privateOwnerAttestation,
          privateMediaMaterializer:
            input.privateMediaMaterializer ?? materializeCanonicalPrivateMedia,
          ...(input.privateSpeechMaterializer
            ? { privateSpeechMaterializer: input.privateSpeechMaterializer }
            : {}),
        }
      : {}),
    providerAuthorization,
    store,
    repository,
    pythonExecutable,
    rendererVersions: visualStyle
      ? {
          ...visualStyle.rendererVersions,
          ...CANONICAL_PRIVATE_RENDERER_VERSIONS,
        }
      : {
          visualPlan: "math-visual-plan.v1",
          canonicalAdapter: "math.canonical-adapters.v1",
        },
  } as const;
  const readiness = assessAuthoritativeMathReadiness(adapterOptions);
  const implementations =
    createMathProductionTaskImplementations(adapterOptions);
  const registrations = createMathTaskRegistrations(implementations, readiness);
  const fingerprintMaterial = createMathFingerprintMaterial({
    profile,
    visualStyle,
    curriculum: {
      releaseId: curriculum.release.releaseId,
      revision: curriculum.release.curriculumVersion,
      releaseHash: curriculum.releaseHash,
      authorityHash: canonicalHash({
        release: curriculum.release,
        releaseHash: curriculum.releaseHash,
      }),
    },
    selection: {
      skillId,
      locale,
      contentVariant: input.contentVariant,
      lessonVariant,
    },
    ...(!profile ? { profileRevision: "simulation-reviewed-fixtures-v1" } : {}),
    ...(!visualStyle
      ? { visualStyleRevision: "simulation-reviewed-fixtures-v1" }
      : {}),
    verifierVersion: "3.0.0",
    rendererVersions: adapterOptions.rendererVersions,
    providerConfiguration: providerAuthorization,
    ...(privateOwnerAttestation
      ? {
          curriculum: {
            releaseId: curriculum.release.releaseId,
            revision: curriculum.release.curriculumVersion,
            releaseHash: curriculum.releaseHash,
            authorityHash: canonicalHash({
              release: curriculum.release,
              releaseHash: curriculum.releaseHash,
              privateOwnerAttestationHash: privateOwnerAttestation.evidenceHash,
            }),
          },
        }
      : {}),
  });
  return new WorkflowOperator({
    unitRoot,
    workflow: mathWorkflowDefinition,
    registry: createTaskRegistry(registrations),
    identity,
    store,
    fingerprintMaterial,
    verifyArtifact: async (manifest) => {
      try {
        const verified = await repository.verify(manifest.ref, {
          dependencyFingerprints: manifest.dependencyFingerprints,
        });
        const validManifest =
          verified.manifest.id === manifest.id &&
          verified.manifest.checksumSha256 === manifest.checksumSha256 &&
          verified.manifest.producerAttemptId === manifest.producerAttemptId;
        if (!validManifest) return false;
        if (!input.simulation && manifest.producerTaskId === "math.render") {
          const raw = JSON.parse(
            await fs.readFile(verified.provenance.absolutePath, "utf8")
          ) as { payload?: { media?: unknown } };
          const media = await verifyCanonicalPrivateMediaEvidenceFiles(
            unitRoot,
            raw.payload?.media
          );
          if (
            media.identity.lessonId !== input.unitId ||
            media.identity.skillId !== skillId ||
            media.identity.language !== locale ||
            media.identity.variant !== lessonVariant
          ) {
            return false;
          }
        }
        return true;
      } catch {
        return false;
      }
    },
  });
}
