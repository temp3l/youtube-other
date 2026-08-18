import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { sceneIdSchema, type VoiceProfile } from "@mediaforge/domain";
import {
  assessVeronicaSpeechRate,
  getVeronicaSpeechRatePolicy,
  veronicaSyntheticNarrationAuthorizationSchema,
  type SpeechProvider,
} from "@mediaforge/speech";
import {
  assertCanonicalVeronicaProductionSource,
  canonicalSourceEpisodeSchema,
  canonicalSourcePlannerInputSchema,
} from "@mediaforge/strategic-reinvention";
import { fileExists, writeJsonAtomic } from "@mediaforge/shared";
import { z } from "zod";

export const VERONICA_NARRATION_CANARY_SCHEMA_VERSION =
  "veronica-narration-canary.v1" as const;
export const VERONICA_NARRATION_RESERVATION_SCHEMA_VERSION =
  "veronica-narration-cost-reservation.v1" as const;
export const VERONICA_NARRATION_SELECTION_SCHEMA_VERSION =
  "veronica-selected-narration.v1" as const;
export const VERONICA_PRODUCTION_INPUT_TIMING_VERSION =
  "veronica-production-input-timing.v1" as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

const reservationEpisodeSchema = z
  .object({
    episodeId: z.string().min(1),
    sourceSha256: sha256Schema,
    authorizationPath: z.string().min(1),
    authorizationSha256: sha256Schema,
    conservativeCostUsd: z.number().nonnegative(),
    conservativeCostEur: z.number().nonnegative(),
    preDispatchSpeechCalls: z.number().int().nonnegative(),
    preDispatchSpeechCostUsd: z.number().nonnegative(),
  })
  .strict();

export const veronicaNarrationReservationSchema = z
  .object({
    schemaVersion: z.literal(VERONICA_NARRATION_RESERVATION_SCHEMA_VERSION),
    reservationId: z.string().min(1),
    status: z.enum(["HELD", "CONSUMED_PASS", "CONSUMED_FAIL"]),
    createdAt: z.string().min(1),
    authorizationReference: z.string().min(1),
    locale: z.literal("en"),
    variant: z.literal("short"),
    provider: z.literal("openai"),
    model: z.literal("gpt-4o-mini-tts"),
    voice: z.string().min(1),
    episodes: z.array(reservationEpisodeSchema).min(1).max(3),
    limits: z
      .object({
        maxProviderCalls: z.number().int().positive().max(3),
        providerCeilingUsd: z.number().positive(),
        canonicalCeilingEur: z.number().positive(),
      })
      .strict(),
    budgetBeforeReservation: z
      .object({
        canonicalCurrency: z.literal("EUR"),
        portfolioCeilingEur: z.number().positive(),
        cumulativeSpendEur: z.number().nonnegative(),
        remainingEur: z.number().nonnegative(),
      })
      .strict(),
    conversionPolicy: z
      .object({
        observationDate: z.string().min(1),
        source: z.string().min(1),
        observedUsdPerEur: z.number().positive(),
        safetyMultiplier: z.number().min(1),
        conservativeEurPerUsd: z.number().positive(),
      })
      .strict(),
    activity: z
      .object({
        providerCalls: z.number().int().nonnegative(),
        cacheHits: z.number().int().nonnegative(),
        completedEpisodes: z.array(z.string().min(1)),
        failedEpisode: z.string().min(1).nullable(),
      })
      .strict(),
    actualCost: z
      .object({
        knownEstimatedCostUsd: z.number().nonnegative(),
        unpricedProviderCalls: z.number().int().nonnegative(),
        conservativeChargedUsd: z.number().nonnegative(),
        conservativeChargedEur: z.number().nonnegative(),
      })
      .strict(),
    reservationReconciliation: z
      .object({
        reservedEur: z.number().nonnegative(),
        consumedEur: z.number().nonnegative(),
        releasedEur: z.number().nonnegative(),
        stillHeldEur: z.number().nonnegative(),
      })
      .strict(),
    result: z.unknown().nullable(),
  })
  .strict();

type NarrationReservation = z.infer<
  typeof veronicaNarrationReservationSchema
>;

interface SpeechCostState {
  readonly calls: number;
  readonly knownCostUsd: number;
  readonly unpricedCalls: number;
}

export interface VeronicaNarrationCanaryResult {
  readonly schemaVersion: typeof VERONICA_NARRATION_CANARY_SCHEMA_VERSION;
  readonly status: "PASS";
  readonly providerCalls: number;
  readonly cacheHits: number;
  readonly episodes: readonly {
    readonly episodeId: string;
    readonly sourceSha256: string;
    readonly selectedAudioSha256: string;
    readonly timingSha256: string;
    readonly durationSeconds: number;
    readonly observedWpm: number;
    readonly speechRateStatus: string;
    readonly providerCall: boolean;
  }[];
}

function stableSha256(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function fileSha256(filePath: string): Promise<string> {
  return crypto
    .createHash("sha256")
    .update(await fs.readFile(filePath))
    .digest("hex");
}

async function speechCostState(episodeDir: string): Promise<SpeechCostState> {
  const summaryPath = path.join(episodeDir, "openai-cost-summary.json");
  if (!(await fileExists(summaryPath))) {
    return { calls: 0, knownCostUsd: 0, unpricedCalls: 0 };
  }
  const summary = z
    .object({
      byOperation: z.record(
        z.string(),
        z
          .object({
            providerCalls: z.number().int().nonnegative(),
            unpricedProviderCalls: z.number().int().nonnegative(),
            knownEstimatedCostUsd: z.number().nonnegative(),
          })
          .passthrough(),
      ),
    })
    .passthrough()
    .parse(JSON.parse(await fs.readFile(summaryPath, "utf8")) as unknown);
  const speech = summary.byOperation["speech-generation"];
  return {
    calls: speech?.providerCalls ?? 0,
    knownCostUsd: speech?.knownEstimatedCostUsd ?? 0,
    unpricedCalls: speech?.unpricedProviderCalls ?? 0,
  };
}

async function currentReservationUsage(input: {
  readonly workspaceRoot: string;
  readonly reservation: NarrationReservation;
}): Promise<{
  readonly providerCalls: number;
  readonly knownCostUsd: number;
  readonly unpricedCalls: number;
  readonly conservativeChargedUsd: number;
}> {
  let providerCalls = 0;
  let knownCostUsd = 0;
  let unpricedCalls = 0;
  let conservativeUnpricedUsd = 0;
  for (const episode of input.reservation.episodes) {
    const current = await speechCostState(
      path.join(input.workspaceRoot, episode.episodeId),
    );
    const callDelta = current.calls - episode.preDispatchSpeechCalls;
    const costDelta = current.knownCostUsd - episode.preDispatchSpeechCostUsd;
    if (callDelta < 0 || costDelta < -0.000001) {
      throw new Error(`NARRATION_COST_LEDGER_REGRESSION:${episode.episodeId}`);
    }
    providerCalls += callDelta;
    knownCostUsd += Math.max(0, costDelta);
    const episodeUnpriced = Math.min(
      Math.max(0, current.unpricedCalls),
      Math.max(0, callDelta),
    );
    unpricedCalls += episodeUnpriced;
    if (episodeUnpriced > 0) {
      conservativeUnpricedUsd += episode.conservativeCostUsd;
    }
  }
  return {
    providerCalls,
    knownCostUsd,
    unpricedCalls,
    conservativeChargedUsd: knownCostUsd + conservativeUnpricedUsd,
  };
}

async function writeReservationState(input: {
  readonly workspaceRoot: string;
  readonly reservationPath: string;
  readonly reservation: NarrationReservation;
  readonly status: NarrationReservation["status"];
  readonly completedEpisodes: readonly string[];
  readonly cacheHits: number;
  readonly failedEpisode: string | null;
  readonly result: unknown;
}): Promise<NarrationReservation> {
  const usage = await currentReservationUsage({
    workspaceRoot: input.workspaceRoot,
    reservation: input.reservation,
  });
  const consumedEur = Number(
    (
      usage.conservativeChargedUsd *
      input.reservation.conversionPolicy.conservativeEurPerUsd
    ).toFixed(6),
  );
  const reservedEur = input.reservation.limits.canonicalCeilingEur;
  const next = veronicaNarrationReservationSchema.parse({
    ...input.reservation,
    status: input.status,
    activity: {
      providerCalls: usage.providerCalls,
      cacheHits: input.cacheHits,
      completedEpisodes: [...input.completedEpisodes],
      failedEpisode: input.failedEpisode,
    },
    actualCost: {
      knownEstimatedCostUsd: Number(usage.knownCostUsd.toFixed(6)),
      unpricedProviderCalls: usage.unpricedCalls,
      conservativeChargedUsd: Number(
        usage.conservativeChargedUsd.toFixed(6),
      ),
      conservativeChargedEur: consumedEur,
    },
    reservationReconciliation: {
      reservedEur,
      consumedEur,
      releasedEur:
        input.status === "HELD"
          ? 0
          : Number(Math.max(0, reservedEur - consumedEur).toFixed(6)),
      stillHeldEur: input.status === "HELD" ? reservedEur : 0,
    },
    result: input.result,
  });
  await writeJsonAtomic(input.reservationPath, next);
  return next;
}

export async function runVeronicaNarrationCanary(input: {
  readonly workspaceRoot: string;
  readonly reservationPath: string;
  readonly provider: SpeechProvider;
  readonly voiceProfile: VoiceProfile;
  readonly instructions: string;
  readonly speed: number;
  readonly probeDuration: (filePath: string) => Promise<number>;
}): Promise<VeronicaNarrationCanaryResult> {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const reservationPath = path.resolve(input.reservationPath);
  let reservation = veronicaNarrationReservationSchema.parse(
    JSON.parse(await fs.readFile(reservationPath, "utf8")) as unknown,
  );
  if (reservation.status !== "HELD") {
    throw new Error(`NARRATION_RESERVATION_NOT_HELD:${reservation.status}`);
  }
  if (
    reservation.episodes.length > reservation.limits.maxProviderCalls ||
    reservation.budgetBeforeReservation.remainingEur <
      reservation.limits.canonicalCeilingEur
  ) {
    throw new Error("NARRATION_RESERVATION_LIMIT_INVALID");
  }
  const reservedUsd = reservation.episodes.reduce(
    (sum, episode) => sum + episode.conservativeCostUsd,
    0,
  );
  const reservedEur = reservation.episodes.reduce(
    (sum, episode) => sum + episode.conservativeCostEur,
    0,
  );
  if (
    reservedUsd > reservation.limits.providerCeilingUsd + 0.000001 ||
    reservedEur > reservation.limits.canonicalCeilingEur + 0.000001
  ) {
    throw new Error("NARRATION_RESERVATION_EPISODE_SUM_EXCEEDS_CEILING");
  }

  const completedEpisodes: string[] = [];
  const results: VeronicaNarrationCanaryResult["episodes"][number][] = [];
  let cacheHits = 0;
  let activeEpisode: string | null = null;
  try {
    for (const reservedEpisode of reservation.episodes) {
      activeEpisode = reservedEpisode.episodeId;
      const episodeDir = path.join(workspaceRoot, reservedEpisode.episodeId);
      const descriptorPath = path.join(
        episodeDir,
        "source",
        "canonical-source-episode.v1.json",
      );
      const plannerInputPath = path.join(
        episodeDir,
        "source",
        "visual-planner-input.v1.json",
      );
      const [descriptor, plannerInput] = await Promise.all([
        fs
          .readFile(descriptorPath, "utf8")
          .then((raw) => canonicalSourceEpisodeSchema.parse(JSON.parse(raw))),
        fs
          .readFile(plannerInputPath, "utf8")
          .then((raw) => canonicalSourcePlannerInputSchema.parse(JSON.parse(raw))),
      ]);
      assertCanonicalVeronicaProductionSource(descriptor);
      assertCanonicalVeronicaProductionSource(plannerInput.sourceEpisode);
      if (
        descriptor.episodeId !== reservedEpisode.episodeId ||
        descriptor.format !== "short" ||
        plannerInput.locale !== "en" ||
        plannerInput.narration.sourceSha256 !== reservedEpisode.sourceSha256
      ) {
        throw new Error(
          `NARRATION_CANARY_SOURCE_COORDINATE_MISMATCH:${reservedEpisode.episodeId}`,
        );
      }
      const narration = plannerInput.narration.narration;
      const scriptPath = path.join(
        episodeDir,
        "languages",
        "short",
        "script-en.md",
      );
      if ((await fileSha256(scriptPath)) !== reservedEpisode.sourceSha256) {
        throw new Error(
          `NARRATION_CANARY_WORKSPACE_SOURCE_STALE:${reservedEpisode.episodeId}`,
        );
      }
      const authorizationPath = path.resolve(
        path.dirname(reservationPath),
        reservedEpisode.authorizationPath,
      );
      const authorizationBytes = await fs.readFile(authorizationPath);
      const authorizationSha256 = crypto
        .createHash("sha256")
        .update(authorizationBytes)
        .digest("hex");
      if (authorizationSha256 !== reservedEpisode.authorizationSha256) {
        throw new Error(
          `NARRATION_CANARY_AUTHORIZATION_HASH_MISMATCH:${reservedEpisode.episodeId}`,
        );
      }
      const authorization = veronicaSyntheticNarrationAuthorizationSchema.parse(
        JSON.parse(authorizationBytes.toString("utf8")) as unknown,
      );
      if (
        authorization.unitId !== reservedEpisode.episodeId ||
        authorization.locale !== "en" ||
        authorization.variant !== "short" ||
        authorization.provider !== "openai-compatible" ||
        authorization.voiceId !== reservation.voice
      ) {
        throw new Error(
          `NARRATION_CANARY_AUTHORIZATION_COORDINATE_MISMATCH:${reservedEpisode.episodeId}`,
        );
      }

      const fingerprint = stableSha256({
        sourceSha256: reservedEpisode.sourceSha256,
        authorizationSha256,
        model: reservation.model,
        voice: reservation.voice,
        instructionsSha256: stableSha256(input.instructions),
        speed: input.speed,
      });
      const narrationRoot = path.join(
        episodeDir,
        "locales",
        "en",
        "short",
        "audio",
        "narration",
      );
      const candidatePath = path.join(
        narrationRoot,
        "bounded-canary",
        `${fingerprint}.wav`,
      );
      const selectedPath = path.join(narrationRoot, "selected-narration.wav");
      const canonicalAudioPath = path.join(
        episodeDir,
        "locales",
        "en",
        "short",
        "audio",
        "narration.wav",
      );
      const selectionPath = path.join(
        narrationRoot,
        "selected-narration.v1.json",
      );
      const existingSelection = await fs
        .readFile(selectionPath, "utf8")
        .then((raw) => JSON.parse(raw) as { sourceSha256?: unknown; requestFingerprint?: unknown; selectedAudioSha256?: unknown })
        .catch(() => null);
      if (
        (await fileExists(canonicalAudioPath)) &&
        (!existingSelection ||
          existingSelection.sourceSha256 !== reservedEpisode.sourceSha256 ||
          existingSelection.requestFingerprint !== fingerprint ||
          existingSelection.selectedAudioSha256 !==
            (await fileSha256(canonicalAudioPath)))
      ) {
        throw new Error(
          `NARRATION_CANARY_EXISTING_AUDIO_PROVENANCE_AMBIGUOUS:${reservedEpisode.episodeId}`,
        );
      }

      const before = await currentReservationUsage({ workspaceRoot, reservation });
      if (before.providerCalls > reservation.limits.maxProviderCalls) {
        throw new Error("NARRATION_PROVIDER_CALL_CEILING_EXCEEDED");
      }
      let providerCall = false;
      let durationSeconds: number;
      if (await fileExists(candidatePath)) {
        cacheHits += 1;
        durationSeconds = await input.probeDuration(candidatePath);
      } else if (
        existingSelection?.requestFingerprint === fingerprint &&
        (await fileExists(canonicalAudioPath))
      ) {
        cacheHits += 1;
        durationSeconds = await input.probeDuration(canonicalAudioPath);
        await fs.mkdir(path.dirname(candidatePath), { recursive: true });
        await fs.copyFile(canonicalAudioPath, candidatePath);
      } else {
        if (before.providerCalls + 1 > reservation.limits.maxProviderCalls) {
          throw new Error("NARRATION_PROVIDER_CALL_CEILING_EXCEEDED");
        }
        const episodeCallDelta =
          (await speechCostState(episodeDir)).calls -
          reservedEpisode.preDispatchSpeechCalls;
        if (episodeCallDelta > 0) {
          throw new Error(
            `NARRATION_RETRY_NOT_AUTHORIZED:${reservedEpisode.episodeId}`,
          );
        }
        await fs.mkdir(path.dirname(candidatePath), { recursive: true });
        const response = await input.provider.synthesize(
          {
            contentProfileId: "veronicabenini",
            sceneId: sceneIdSchema.parse("scene-001"),
            text: narration,
            voiceProfile: {
              ...input.voiceProfile,
              providerVoiceId: reservation.voice,
            },
            outputPath: candidatePath,
            instructions: input.instructions,
            speed: input.speed,
            requestFingerprint: fingerprint,
            dispatchContext: {
              kind: "creator-authorized-synthetic",
              profileId: "veronicabenini",
              unitId: reservedEpisode.episodeId,
              locale: "en",
              variant: "short",
              provider: "openai-compatible",
              voiceId: reservation.voice,
              authorizationSha256,
              authorization,
            },
          },
          new AbortController().signal,
        );
        providerCall = true;
        durationSeconds = response.durationSeconds;
      }
      if (!(durationSeconds > 0) || durationSeconds > 180) {
        throw new Error(
          `NARRATION_CANARY_DURATION_INVALID:${reservedEpisode.episodeId}:${durationSeconds}`,
        );
      }
      const wordCount =
        narration.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)?/gu)?.length ?? 0;
      const rate = assessVeronicaSpeechRate({
        spokenWordCount: wordCount,
        audioDurationSeconds: durationSeconds,
        policy: getVeronicaSpeechRatePolicy({ locale: "en", variant: "short" }),
      });
      if (rate.status === "hard-low" || rate.status === "hard-high") {
        throw new Error(
          `NARRATION_CANARY_SPEECH_RATE_HARD_FAIL:${reservedEpisode.episodeId}:${rate.status}`,
        );
      }
      const selectedAudioSha256 = await fileSha256(candidatePath);
      await fs.mkdir(path.dirname(canonicalAudioPath), { recursive: true });
      await Promise.all([
        fs.copyFile(candidatePath, selectedPath),
        fs.copyFile(candidatePath, canonicalAudioPath),
        fs.copyFile(candidatePath, path.join(narrationRoot, "clean-narration.wav")),
        fs.copyFile(candidatePath, path.join(narrationRoot, "mastered-narration.wav")),
        fs.mkdir(path.join(episodeDir, "locales", "en", "short"), {
          recursive: true,
        }),
      ]);
      await fs.writeFile(
        path.join(episodeDir, "locales", "en", "short", "script.md"),
        narration,
        "utf8",
      );
      const selection = {
        schemaVersion: VERONICA_NARRATION_SELECTION_SCHEMA_VERSION,
        episodeId: reservedEpisode.episodeId,
        locale: "en",
        variant: "short",
        sourceSha256: reservedEpisode.sourceSha256,
        requestFingerprint: fingerprint,
        selectedAudioSha256,
        durationSeconds,
        wordCount,
        observedWpm: rate.observedWpm,
        speechRateStatus: rate.status,
        provider: "openai",
        model: reservation.model,
        voice: reservation.voice,
        speed: input.speed,
        authorizationSha256,
      };
      await writeJsonAtomic(selectionPath, selection);
      const timingUnsealed = {
        schemaVersion: "veronica-canonical-locale-timing.v3" as const,
        locale: "en" as const,
        variant: "short" as const,
        timingAlgorithmVersion: VERONICA_PRODUCTION_INPUT_TIMING_VERSION,
        timingPhase: "post-tts-reconciled" as const,
        timingSource: "selected-audio-total-duration" as const,
        timingConfidence: "actual-total-duration" as const,
        narrationHash: reservedEpisode.sourceSha256,
        selectedAudioHash: selectedAudioSha256,
        narrationDurationSeconds: durationSeconds,
        scenes: [
          {
            sceneId: "production-input-001",
            plannedDurationSeconds:
              (wordCount / getVeronicaSpeechRatePolicy({ locale: "en", variant: "short" }).targetWpm) * 60,
            reconciledDurationSeconds: durationSeconds,
            startSeconds: 0,
            endSeconds: durationSeconds,
          },
        ],
      };
      const timing = {
        ...timingUnsealed,
        timingFingerprint: stableSha256(timingUnsealed),
      };
      const timingPath = path.join(
        episodeDir,
        "locales",
        "en",
        "short",
        "canonical-timing.v1.json",
      );
      await writeJsonAtomic(timingPath, timing);
      completedEpisodes.push(reservedEpisode.episodeId);
      results.push({
        episodeId: reservedEpisode.episodeId,
        sourceSha256: reservedEpisode.sourceSha256,
        selectedAudioSha256,
        timingSha256: await fileSha256(timingPath),
        durationSeconds,
        observedWpm: rate.observedWpm ?? 0,
        speechRateStatus: rate.status,
        providerCall,
      });
      reservation = await writeReservationState({
        workspaceRoot,
        reservationPath,
        reservation,
        status: "HELD",
        completedEpisodes,
        cacheHits,
        failedEpisode: null,
        result: { status: "IN_PROGRESS", episodes: results },
      });
    }
    const result: VeronicaNarrationCanaryResult = {
      schemaVersion: VERONICA_NARRATION_CANARY_SCHEMA_VERSION,
      status: "PASS",
      providerCalls: (await currentReservationUsage({ workspaceRoot, reservation })).providerCalls,
      cacheHits,
      episodes: results,
    };
    await writeReservationState({
      workspaceRoot,
      reservationPath,
      reservation,
      status: "CONSUMED_PASS",
      completedEpisodes,
      cacheHits,
      failedEpisode: null,
      result,
    });
    return result;
  } catch (error) {
    await writeReservationState({
      workspaceRoot,
      reservationPath,
      reservation,
      status: "CONSUMED_FAIL",
      completedEpisodes,
      cacheHits,
      failedEpisode: activeEpisode,
      result: {
        status: "FAIL",
        message: error instanceof Error ? error.message : String(error),
        episodes: results,
      },
    }).catch(() => undefined);
    throw error;
  }
}
