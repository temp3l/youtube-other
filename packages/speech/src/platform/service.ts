import { createHash } from "node:crypto";
import type { Readable } from "node:stream";
import { createSpeechCacheKey } from "./cache-key.js";
import { splitSpeechText, type SpeechChunk } from "./chunking.js";
import { assertSpeechConsent, type VoiceConsentRecord } from "./consent.js";
import type {
  ResolvedSpeechProfile,
  SpeechCostEstimate,
  SpeechProviderId,
  SpeechSynthesisRequest,
} from "./contracts.js";
import {
  SpeechDomainError,
  speechRetryClassFor,
  type SpeechErrorCode,
} from "./errors.js";
import { SpeechProviderRegistry } from "./registry.js";
import {
  failureStateForRetryClass,
  type SpeechGenerationState,
} from "./state-machine.js";

export interface SpeechGenerationCommand {
  readonly generationId: string;
  readonly workspaceId: string;
  readonly videoId?: string;
  readonly genreId?: string;
  readonly language: string;
  readonly text: string;
  readonly channel: string;
  readonly replacementProfileVersionId?: string;
  readonly allowInactivePinnedProfile?: boolean;
  readonly forceRegeneration: boolean;
  readonly supersedesGenerationId?: string;
  readonly reuseSuccessfulChunksFromGenerationId?: string;
  readonly idempotencyKey?: string;
  readonly abortSignal?: AbortSignal;
}

export interface StoredSpeechArtifact {
  readonly artifactId: string;
  readonly sha256: string;
  readonly contentType: string;
}

export interface SpeechGenerationResult {
  readonly generationId: string;
  readonly state: "SUCCEEDED";
  readonly profile: ResolvedSpeechProfile;
  readonly cacheKey: string;
  readonly cacheHit: boolean;
  readonly rawArtifacts: readonly StoredSpeechArtifact[];
  readonly masterArtifact: StoredSpeechArtifact;
  readonly estimate: SpeechCostEstimate;
  readonly actualBillableCharacters: number;
  readonly actualCredits?: number;
}

export interface SpeechProfileResolver {
  resolve(input: {
    readonly workspaceId: string;
    readonly videoId?: string;
    readonly genreId?: string;
    readonly language: string;
    readonly replacementProfileVersionId?: string;
    readonly allowInactivePinnedProfile?: boolean;
  }): Promise<ResolvedSpeechProfile>;
  consentFor(
    profile: ResolvedSpeechProfile
  ): Promise<VoiceConsentRecord | undefined>;
}

export type SpeechCacheClaim =
  | { readonly kind: "owner" }
  | { readonly kind: "wait" }
  | { readonly kind: "hit"; readonly result: SpeechGenerationResult }
  | { readonly kind: "replay"; readonly result: SpeechGenerationResult };

export interface SpeechGenerationStore {
  queueDepth?(workspaceId: string): Promise<number>;
  reusableChunk?(input: {
    readonly generationId: string;
    readonly chunk: SpeechChunk;
  }): Promise<StoredSpeechArtifact | null>;
  claim(input: {
    readonly command: SpeechGenerationCommand;
    readonly profile: ResolvedSpeechProfile;
    readonly cacheKey: string;
    readonly cacheInputVersion: string;
  }): Promise<SpeechCacheClaim>;
  waitFor(
    cacheKey: string,
    abortSignal?: AbortSignal
  ): Promise<SpeechGenerationResult>;
  renewLease(generationId: string): Promise<void>;
  transition(input: {
    readonly generationId: string;
    readonly from: SpeechGenerationState;
    readonly to: SpeechGenerationState;
    readonly failureCode?: SpeechErrorCode;
  }): Promise<void>;
  recordChunk(input: {
    readonly generationId: string;
    readonly chunk: SpeechChunk;
    readonly attempt: number;
    readonly providerRequestId?: string;
    readonly artifact?: StoredSpeechArtifact;
    readonly errorCode?: SpeechErrorCode;
  }): Promise<void>;
  complete(result: SpeechGenerationResult): Promise<void>;
  recordCacheHit(input: {
    readonly generationId: string;
    readonly source: SpeechGenerationResult;
  }): Promise<SpeechGenerationResult>;
}

export interface SpeechQuotaGuard {
  reserve(input: {
    readonly generationId: string;
    readonly workspaceId: string;
    readonly genreId?: string;
    readonly provider: SpeechProviderId;
    readonly estimate: SpeechCostEstimate;
  }): Promise<{
    readonly reservationId: string;
    readonly remainingCharacters?: number;
  }>;
  reconcile(input: {
    readonly reservationId: string;
    readonly actualBillableCharacters: number;
    readonly actualCredits?: number;
  }): Promise<void>;
  release(reservationId: string): Promise<void>;
}

export interface SpeechArtifactService {
  persistRaw(input: {
    readonly generationId: string;
    readonly chunkIndex: number;
    readonly contentType: string;
    readonly audio: Readable;
  }): Promise<StoredSpeechArtifact>;
  createCanonicalMaster(input: {
    readonly generationId: string;
    readonly rawArtifacts: readonly StoredSpeechArtifact[];
  }): Promise<StoredSpeechArtifact>;
}

export interface SpeechUsageLedger {
  record(input: {
    readonly command: SpeechGenerationCommand;
    readonly profile: ResolvedSpeechProfile;
    readonly estimate: SpeechCostEstimate;
    readonly actualBillableCharacters: number;
    readonly actualCredits?: number;
    readonly cacheHit: boolean;
    readonly providerRequestIds: readonly string[];
  }): Promise<void>;
}

export interface SpeechInstrumentation {
  log(event: Record<string, unknown>, message: string): void;
  metric(
    name: string,
    value: number,
    labels: Readonly<Record<string, string>>
  ): void;
  span<T>(
    name: string,
    attributes: Readonly<Record<string, string | number | boolean>>,
    work: () => Promise<T>
  ): Promise<T>;
}

const silentInstrumentation: SpeechInstrumentation = {
  log: () => undefined,
  metric: () => undefined,
  span: (_name, _attributes, work) => work(),
};

export interface SpeechGenerationServiceOptions {
  readonly providers: SpeechProviderRegistry;
  readonly profiles: SpeechProfileResolver;
  readonly generations: SpeechGenerationStore;
  readonly quotas: SpeechQuotaGuard;
  readonly artifacts: SpeechArtifactService;
  readonly usage: SpeechUsageLedger;
  readonly instrumentation?: SpeechInstrumentation;
  readonly maximumAttempts?: number;
  readonly retryBaseDelayMs?: number;
  readonly sleep?: (
    milliseconds: number,
    signal?: AbortSignal
  ) => Promise<void>;
  readonly random?: () => number;
}

function defaultSleep(
  milliseconds: number,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(
        new SpeechDomainError(
          "SPEECH_GENERATION_CANCELLED",
          "Speech generation was cancelled."
        )
      );
      return;
    }
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(
          new SpeechDomainError(
            "SPEECH_GENERATION_CANCELLED",
            "Speech generation was cancelled."
          )
        );
      },
      { once: true }
    );
  });
}

function configurationFailureState(
  error: SpeechDomainError
): SpeechGenerationState {
  if (error.code === "SPEECH_QUOTA_EXCEEDED") return "BLOCKED_QUOTA";
  if (error.code.startsWith("SPEECH_CONSENT_")) return "BLOCKED_CONSENT";
  if (error.retryClass === "blocked") return "BLOCKED_CONFIGURATION";
  return failureStateForRetryClass(error.retryClass);
}

function safeError(error: unknown): SpeechDomainError {
  if (error instanceof SpeechDomainError) return error;
  return new SpeechDomainError(
    "SPEECH_PROVIDER_INVALID_RESPONSE",
    "Speech generation failed with an unclassified permanent error.",
    { cause: error, retryClass: "permanent" }
  );
}

export class SpeechGenerationService {
  private readonly instrumentation: SpeechInstrumentation;
  private readonly maximumAttempts: number;
  private readonly retryBaseDelayMs: number;
  private readonly sleep: (
    milliseconds: number,
    signal?: AbortSignal
  ) => Promise<void>;
  private readonly random: () => number;

  public constructor(private readonly options: SpeechGenerationServiceOptions) {
    this.instrumentation = options.instrumentation ?? silentInstrumentation;
    this.maximumAttempts = options.maximumAttempts ?? 3;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 500;
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
    if (
      !Number.isSafeInteger(this.maximumAttempts) ||
      this.maximumAttempts < 1 ||
      this.maximumAttempts > 8
    ) {
      throw new Error("Speech maximumAttempts must be between one and eight.");
    }
  }

  public async estimate(
    command: Omit<SpeechGenerationCommand, "generationId" | "forceRegeneration">
  ): Promise<{
    readonly profile: ResolvedSpeechProfile;
    readonly estimate: SpeechCostEstimate;
    readonly cacheHitExpected: boolean | undefined;
  }> {
    const profile = await this.resolveAndValidate(command);
    const provider = this.options.providers.get(profile.configuration.provider);
    const estimate = await provider.estimate({
      generationId: "estimate-only",
      text: command.text,
      profile,
      forceRegeneration: false,
      ...(command.abortSignal ? { abortSignal: command.abortSignal } : {}),
    });
    return { profile, estimate, cacheHitExpected: undefined };
  }

  public async generate(
    command: SpeechGenerationCommand
  ): Promise<SpeechGenerationResult> {
    const startedAt = Date.now();
    const profile = await this.resolveProfile(command);
    const queueDepth = await this.options.generations.queueDepth?.(
      command.workspaceId
    );
    if (queueDepth !== undefined)
      this.instrumentation.metric("speech_queue_depth", queueDepth, {
        provider: profile.configuration.provider,
      });
    const textHash = createHash("sha256")
      .update(command.text.normalize("NFC"), "utf8")
      .digest("hex");
    const cache = createSpeechCacheKey({ text: command.text, profile });
    const claim = await this.instrumentation.span(
      "speech.cache_claim",
      { provider: profile.configuration.provider },
      () =>
        this.options.generations.claim({
          command,
          profile,
          cacheKey: cache.cacheKey,
          cacheInputVersion: cache.schemaVersion,
        })
    );
    if (claim.kind === "replay") return claim.result;
    let state: SpeechGenerationState = "QUEUED";
    let reservationId: string | undefined;
    let reservationSettled = false;
    let attemptedEstimate: SpeechCostEstimate | undefined;
    const providerRequestIds: string[] = [];
    let actualBillableCharacters = 0;
    let actualCredits = 0;
    let creditsReported = false;
    try {
      await this.options.generations.transition({
        generationId: command.generationId,
        from: state,
        to: "PREFLIGHT",
      });
      state = "PREFLIGHT";
      await this.validateResolvedProfile(profile, command.channel);
      if (claim.kind === "hit" || claim.kind === "wait") {
        const source =
          claim.kind === "hit"
            ? claim.result
            : await this.options.generations.waitFor(
                cache.cacheKey,
                command.abortSignal
              );
        await this.options.generations.transition({
          generationId: command.generationId,
          from: state,
          to: "GENERATING",
        });
        state = "GENERATING";
        await this.options.generations.transition({
          generationId: command.generationId,
          from: state,
          to: "POST_PROCESSING",
        });
        state = "POST_PROCESSING";
        const reused = await this.completeCacheHit(command, source, startedAt);
        await this.options.generations.transition({
          generationId: command.generationId,
          from: state,
          to: "SUCCEEDED",
        });
        return reused;
      }
      const provider = this.options.providers.get(
        profile.configuration.provider
      );
      const estimate = await this.instrumentation.span(
        "speech.cost_estimation",
        { provider: provider.id },
        () =>
          provider.estimate({
            generationId: command.generationId,
            text: command.text,
            profile,
            forceRegeneration: command.forceRegeneration,
            ...(command.abortSignal
              ? { abortSignal: command.abortSignal }
              : {}),
          })
      );
      attemptedEstimate = estimate;
      const reservation = await this.instrumentation.span(
        "speech.quota_reservation",
        { provider: provider.id },
        () =>
          this.options.quotas.reserve({
            generationId: command.generationId,
            workspaceId: command.workspaceId,
            ...(command.genreId ? { genreId: command.genreId } : {}),
            provider: provider.id,
            estimate,
          })
      );
      reservationId = reservation.reservationId;
      if (reservation.remainingCharacters !== undefined)
        this.instrumentation.metric(
          "speech_quota_remaining_characters",
          reservation.remainingCharacters,
          { provider: provider.id, scope: "effective" }
        );
      await this.options.generations.transition({
        generationId: command.generationId,
        from: state,
        to: "GENERATING",
      });
      state = "GENERATING";

      const chunks = splitSpeechText(
        command.text,
        profile.configuration.chunking ?? {
          targetCharacters: 4_000,
          hardMaximumCharacters: 8_000,
          previousContextCharacters: 0,
          nextContextCharacters: 0,
        }
      );
      const rawArtifacts: StoredSpeechArtifact[] = [];
      for (const chunk of chunks) {
        await this.options.generations.renewLease(command.generationId);
        const reusable = command.reuseSuccessfulChunksFromGenerationId
          ? await this.options.generations.reusableChunk?.({
              generationId: command.reuseSuccessfulChunksFromGenerationId,
              chunk,
            })
          : undefined;
        if (reusable) {
          rawArtifacts.push(reusable);
          await this.options.generations.recordChunk({
            generationId: command.generationId,
            chunk,
            attempt: 1,
            artifact: reusable,
          });
          continue;
        }
        const generated = await this.generateChunk({ command, profile, chunk });
        rawArtifacts.push(generated.artifact);
        actualBillableCharacters += generated.actualBillableCharacters;
        if (generated.actualCredits !== undefined) {
          actualCredits += generated.actualCredits;
          creditsReported = true;
        }
        if (generated.providerRequestId)
          providerRequestIds.push(generated.providerRequestId);
      }
      await this.options.generations.transition({
        generationId: command.generationId,
        from: state,
        to: "POST_PROCESSING",
      });
      state = "POST_PROCESSING";
      await this.options.generations.renewLease(command.generationId);
      const masterArtifact = await this.instrumentation.span(
        "speech.audio_mastering",
        { provider: provider.id },
        () =>
          this.options.artifacts.createCanonicalMaster({
            generationId: command.generationId,
            rawArtifacts,
          })
      );
      await this.options.quotas.reconcile({
        reservationId,
        actualBillableCharacters,
        ...(creditsReported ? { actualCredits } : {}),
      });
      reservationSettled = true;
      const result: SpeechGenerationResult = {
        generationId: command.generationId,
        state: "SUCCEEDED",
        profile,
        cacheKey: cache.cacheKey,
        cacheHit: false,
        rawArtifacts,
        masterArtifact,
        estimate,
        actualBillableCharacters,
        ...(creditsReported ? { actualCredits } : {}),
      };
      await this.options.usage.record({
        command,
        profile,
        estimate,
        actualBillableCharacters,
        ...(creditsReported ? { actualCredits } : {}),
        cacheHit: false,
        providerRequestIds,
      });
      await this.options.generations.complete(result);
      await this.options.generations.transition({
        generationId: command.generationId,
        from: state,
        to: "SUCCEEDED",
      });
      this.instrumentation.metric(
        "speech_generation_characters_total",
        actualBillableCharacters,
        { provider: provider.id }
      );
      if (creditsReported)
        this.instrumentation.metric(
          "speech_generation_credits_total",
          actualCredits,
          { provider: provider.id }
        );
      this.recordOutcome(
        command,
        profile,
        textHash,
        false,
        "SUCCEEDED",
        startedAt
      );
      return result;
    } catch (caught: unknown) {
      const error = safeError(caught);
      if (reservationId && !reservationSettled) {
        if (attemptedEstimate && actualBillableCharacters > 0) {
          await this.options.quotas
            .reconcile({
              reservationId,
              actualBillableCharacters,
              ...(creditsReported ? { actualCredits } : {}),
            })
            .catch(() => undefined);
          await this.options.usage
            .record({
              command,
              profile,
              estimate: attemptedEstimate,
              actualBillableCharacters,
              ...(creditsReported ? { actualCredits } : {}),
              cacheHit: false,
              providerRequestIds,
            })
            .catch(() => undefined);
        } else {
          await this.options.quotas
            .release(reservationId)
            .catch(() => undefined);
        }
      }
      const failureState = configurationFailureState(error);
      await this.options.generations
        .transition({
          generationId: command.generationId,
          from: state,
          to: failureState,
          failureCode: error.code,
        })
        .catch(() => undefined);
      this.recordOutcome(
        command,
        profile,
        textHash,
        false,
        failureState,
        startedAt,
        error.code
      );
      throw error;
    }
  }

  private async resolveProfile(
    command: Pick<
      SpeechGenerationCommand,
      | "workspaceId"
      | "videoId"
      | "genreId"
      | "language"
      | "replacementProfileVersionId"
      | "allowInactivePinnedProfile"
    >
  ): Promise<ResolvedSpeechProfile> {
    return this.instrumentation.span("speech.profile_resolution", {}, () =>
      this.options.profiles.resolve({
        workspaceId: command.workspaceId,
        ...(command.videoId ? { videoId: command.videoId } : {}),
        ...(command.genreId ? { genreId: command.genreId } : {}),
        language: command.language,
        ...(command.replacementProfileVersionId
          ? { replacementProfileVersionId: command.replacementProfileVersionId }
          : {}),
        ...(command.allowInactivePinnedProfile
          ? { allowInactivePinnedProfile: true }
          : {}),
      })
    );
  }

  private async resolveAndValidate(
    command: Pick<
      SpeechGenerationCommand,
      | "workspaceId"
      | "videoId"
      | "genreId"
      | "language"
      | "replacementProfileVersionId"
      | "allowInactivePinnedProfile"
      | "channel"
      | "text"
      | "abortSignal"
    >
  ): Promise<ResolvedSpeechProfile> {
    const profile = await this.resolveProfile(command);
    await this.validateResolvedProfile(profile, command.channel);
    return profile;
  }

  private async validateResolvedProfile(
    profile: ResolvedSpeechProfile,
    channel: string
  ): Promise<void> {
    const provider = this.options.providers.get(profile.configuration.provider);
    await provider.validateProfile(profile);
    const consent = await this.options.profiles.consentFor(profile);
    await this.instrumentation.span(
      "speech.consent_validation",
      { provider: provider.id },
      async () => {
        assertSpeechConsent({
          profile,
          ...(consent ? { consent } : {}),
          channel,
        });
      }
    );
  }

  private async generateChunk(input: {
    readonly command: SpeechGenerationCommand;
    readonly profile: ResolvedSpeechProfile;
    readonly chunk: SpeechChunk;
  }): Promise<{
    readonly artifact: StoredSpeechArtifact;
    readonly actualBillableCharacters: number;
    readonly actualCredits?: number;
    readonly providerRequestId?: string;
  }> {
    const provider = this.options.providers.get(
      input.profile.configuration.provider
    );
    for (let attempt = 1; attempt <= this.maximumAttempts; attempt += 1) {
      input.command.abortSignal?.throwIfAborted();
      try {
        const request: SpeechSynthesisRequest = {
          generationId: input.command.generationId,
          text: input.chunk.text,
          profile: input.profile,
          forceRegeneration: input.command.forceRegeneration,
          chunk: {
            index: input.chunk.index,
            ...(input.chunk.previousContext
              ? { previousContext: input.chunk.previousContext }
              : {}),
            ...(input.chunk.nextContext
              ? { nextContext: input.chunk.nextContext }
              : {}),
          },
          ...(input.command.abortSignal
            ? { abortSignal: input.command.abortSignal }
            : {}),
        };
        const response = await this.instrumentation.span(
          "speech.provider_chunk",
          { provider: provider.id, chunk_index: input.chunk.index },
          () => provider.synthesize(request)
        );
        const artifact = await this.instrumentation.span(
          "speech.artifact_persistence",
          { provider: provider.id, chunk_index: input.chunk.index },
          () =>
            this.options.artifacts.persistRaw({
              generationId: input.command.generationId,
              chunkIndex: input.chunk.index,
              contentType: response.rawContentType,
              audio: response.rawAudio,
            })
        );
        await this.options.generations.recordChunk({
          generationId: input.command.generationId,
          chunk: input.chunk,
          attempt,
          ...(response.providerRequestId
            ? { providerRequestId: response.providerRequestId }
            : {}),
          artifact,
        });
        this.instrumentation.metric("speech_chunk_generation_total", 1, {
          provider: provider.id,
          status: "succeeded",
        });
        return {
          artifact,
          actualBillableCharacters:
            response.actualBillableCharacters ?? [...input.chunk.text].length,
          ...(response.actualCredits === undefined
            ? {}
            : { actualCredits: response.actualCredits }),
          ...(response.providerRequestId
            ? { providerRequestId: response.providerRequestId }
            : {}),
        };
      } catch (caught: unknown) {
        const error =
          caught instanceof SpeechDomainError
            ? caught
            : input.command.abortSignal?.aborted
              ? new SpeechDomainError(
                  "SPEECH_GENERATION_CANCELLED",
                  "Speech generation was cancelled."
                )
              : safeError(caught);
        await this.options.generations.recordChunk({
          generationId: input.command.generationId,
          chunk: input.chunk,
          attempt,
          errorCode: error.code,
        });
        if (
          speechRetryClassFor(error) !== "retryable" ||
          attempt === this.maximumAttempts
        )
          throw error;
        const exponential = this.retryBaseDelayMs * 2 ** (attempt - 1);
        const jittered = Math.round(exponential * (0.75 + this.random() * 0.5));
        await this.sleep(jittered, input.command.abortSignal);
      }
    }
    throw new SpeechDomainError(
      "SPEECH_PROVIDER_UNAVAILABLE",
      "Speech provider attempts were exhausted."
    );
  }

  private async completeCacheHit(
    command: SpeechGenerationCommand,
    source: SpeechGenerationResult,
    startedAt: number
  ): Promise<SpeechGenerationResult> {
    const result = await this.options.generations.recordCacheHit({
      generationId: command.generationId,
      source,
    });
    await this.options.usage.record({
      command,
      profile: result.profile,
      estimate: {
        billableCharacters: 0,
        estimatedCredits: 0,
        estimatedCurrencyAmount: 0,
        ...(source.estimate.currency
          ? { currency: source.estimate.currency }
          : {}),
      },
      actualBillableCharacters: 0,
      actualCredits: 0,
      cacheHit: true,
      providerRequestIds: [],
    });
    this.recordOutcome(
      command,
      result.profile,
      result.cacheKey,
      true,
      "SUCCEEDED",
      startedAt
    );
    return result;
  }

  private recordOutcome(
    command: SpeechGenerationCommand,
    profile: ResolvedSpeechProfile,
    textHash: string,
    cacheHit: boolean,
    status: string,
    startedAt: number,
    errorCode?: SpeechErrorCode
  ): void {
    const labels = {
      provider: profile.configuration.provider,
      genre: command.genreId ?? "unassigned",
      status,
      cache_hit: String(cacheHit),
    };
    this.instrumentation.metric("speech_generation_total", 1, labels);
    this.instrumentation.metric(
      "speech_generation_duration_seconds",
      (Date.now() - startedAt) / 1_000,
      labels
    );
    if (cacheHit)
      this.instrumentation.metric("speech_cache_hits_total", 1, {
        provider: profile.configuration.provider,
      });
    if (status !== "SUCCEEDED")
      this.instrumentation.metric("speech_generation_failures_total", 1, {
        provider: profile.configuration.provider,
        status,
        error_class: errorCode ?? "unknown",
      });
    if (errorCode === "SPEECH_PROVIDER_RATE_LIMITED") {
      this.instrumentation.metric("speech_provider_rate_limit_total", 1, {
        provider: profile.configuration.provider,
      });
    }
    this.instrumentation.log(
      {
        generationId: command.generationId,
        videoId: command.videoId,
        genreId: command.genreId,
        provider: profile.configuration.provider,
        profileVersionId: profile.profileVersionId,
        textHash,
        characterCount: command.text.length,
        durationMs: Date.now() - startedAt,
        cacheHit,
        status,
        errorCode,
      },
      "Speech generation completed."
    );
  }
}
