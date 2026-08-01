import crypto from "node:crypto";
import path from "node:path";
import { ApplicationError } from "@mediaforge/application";
import {
  PostgresSpeechApplicationRepository,
  PostgresSpeechRepository,
  SpeechFencingError,
  SpeechIdempotencyConflictError,
  SpeechOptimisticConcurrencyError,
  SpeechQuotaLimitError,
  type PersistedSpeechGeneration,
  type PersistedSpeechProfileVersion,
  type PersistedSpeechState,
  type PostgresPool,
} from "@mediaforge/persistence";
import {
  ElevenLabsSpeechProvider,
  ExecutionSpeechInstrumentation,
  FileSystemSpeechArtifactService,
  LegacyOpenAiSpeechTransport,
  OpenAiCompatibleSpeechProvider,
  OpenAiSpeechProviderAdapter,
  SpeechDomainError,
  SpeechGenerationService,
  SpeechProfileAdministrationService,
  SpeechProviderRegistry,
  assertSpeechConsent,
  createSpeechCacheKey,
  resolvedSpeechProfileSchema,
  speechProviderConfigurationSchema,
  type ResolvedSpeechProfile,
  type SpeechArtifactService,
  type SpeechGenerationCommand,
  type SpeechGenerationResult,
  type SpeechGenerationStore,
  type SpeechProfileResolver,
  type SpeechQuotaGuard,
  type SpeechUsageLedger,
  type VoiceConsentRecord,
} from "@mediaforge/speech";
import type { ApiRequestContext, SpeechApiUseCases } from "./http-server.js";
import type {
  SpeechGenerationResponse,
  SpeechProfileVersionResponse,
} from "./speech-contract.js";

const SYSTEM_OPENAI_PROFILE_ID = "system-openai";
const SYSTEM_OPENAI_VERSION_ID = "system-openai-v1";
const LEASE_SECONDS = 30;

export interface SpeechProductionConfiguration {
  readonly workspaceDirectory: string;
  readonly openAiApiKey?: string;
  readonly openAiBaseUrl?: string;
  readonly openAiOrganization?: string;
  readonly openAiProject?: string;
  readonly openAiModel: string;
  readonly openAiVoice: string;
  readonly elevenLabsFeatureEnabled: boolean;
  readonly elevenLabsApiKey?: string;
  readonly elevenLabsBaseUrl?: string;
  readonly elevenLabsRequestTimeoutMs: number;
  readonly channel: string;
}

function id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function hash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function expectedRevision(value: string | undefined): number {
  const match = value?.match(/^"(0|[1-9][0-9]*)"$/u);
  if (!match)
    throw new ApplicationError(
      "precondition_failed",
      "If-Match must contain one strong numeric ETag.",
      false
    );
  return Number(match[1]);
}

function profile(
  record: PersistedSpeechProfileVersion,
  language = record.language
): ResolvedSpeechProfile {
  return resolvedSpeechProfileSchema.parse({
    profileId: record.profileId,
    profileVersionId: record.profileVersionId,
    language,
    configuration: record.configuration,
  });
}

function versionResponse(
  record: PersistedSpeechProfileVersion
): SpeechProfileVersionResponse {
  return {
    profileId: record.profileId,
    profileVersionId: record.profileVersionId,
    version: record.version,
    language: record.language,
    provider: record.provider,
    status: record.status,
    revision: record.revision,
  };
}

const publicStates: Readonly<
  Record<PersistedSpeechState, SpeechGenerationResponse["state"]>
> = {
  queued: "QUEUED",
  preflight: "PREFLIGHT",
  generating: "GENERATING",
  post_processing: "POST_PROCESSING",
  succeeded: "SUCCEEDED",
  retryable_failure: "RETRYABLE_FAILURE",
  blocked_quota: "BLOCKED_QUOTA",
  blocked_configuration: "BLOCKED_CONFIGURATION",
  blocked_consent: "BLOCKED_CONSENT",
  failed_permanent: "FAILED_PERMANENT",
  cancelled: "CANCELLED",
};

function generationResponse(
  record: PersistedSpeechGeneration
): SpeechGenerationResponse {
  const state = publicStates[record.state];
  return {
    generationId: record.generationId,
    revision: record.revision,
    state,
    profileVersionId: record.profile.profileVersionId,
    provider: record.profile.provider,
    cacheHit: record.cacheHit,
    ...(record.masterArtifact
      ? { masterArtifactId: record.masterArtifact.artifactId }
      : {}),
    ...(record.failureCode
      ? {
          failure: {
            code: record.failureCode,
            retryable: record.state === "retryable_failure",
            message:
              "Speech generation did not complete. Use the stable code for operator diagnostics.",
          },
        }
      : {}),
  };
}

function serviceResult(
  record: PersistedSpeechGeneration
): SpeechGenerationResult {
  if (record.state !== "succeeded" || !record.masterArtifact)
    throw new SpeechDomainError(
      "SPEECH_CACHE_CLAIM_CONFLICT",
      "The authoritative speech generation is not complete."
    );
  return {
    generationId: record.generationId,
    state: "SUCCEEDED",
    profile: profile(record.profile),
    cacheKey: record.cacheKey,
    cacheHit: record.cacheHit,
    rawArtifacts: record.rawArtifacts,
    masterArtifact: record.masterArtifact,
    estimate: {
      billableCharacters: record.estimateCharacters,
      ...(record.estimateCredits === undefined
        ? {}
        : { estimatedCredits: record.estimateCredits }),
    },
    actualBillableCharacters: record.actualCharacters,
    ...(record.actualCredits === undefined
      ? {}
      : { actualCredits: record.actualCredits }),
  };
}

function persistedState(
  value: Parameters<SpeechGenerationStore["transition"]>[0]["from"]
): PersistedSpeechState {
  return value.toLowerCase() as PersistedSpeechState;
}

class WorkspaceProfileResolver implements SpeechProfileResolver {
  public constructor(
    private readonly repository: PostgresSpeechApplicationRepository,
    private readonly workspaceId: string
  ) {}
  public async resolve(
    input: Parameters<SpeechProfileResolver["resolve"]>[0]
  ): Promise<ResolvedSpeechProfile> {
    if (input.workspaceId !== this.workspaceId)
      throw new Error("Speech workspace scope mismatch.");
    const result = await this.repository.resolveProfile({
      ...input,
      systemProfileVersionId: SYSTEM_OPENAI_VERSION_ID,
      ...(input.allowInactivePinnedProfile
        ? { allowInactiveReplacement: true }
        : {}),
    });
    if (!result)
      throw new SpeechDomainError(
        "SPEECH_PROFILE_NOT_FOUND",
        "No active speech profile resolved for this request."
      );
    return profile(result, input.language);
  }
  public async consentFor(
    value: ResolvedSpeechProfile
  ): Promise<VoiceConsentRecord | undefined> {
    const record = await this.repository.getConsentForVersion(
      this.workspaceId,
      value.profileVersionId
    );
    return record
      ? {
          id: record.consentRecordId,
          subjectName: record.subjectName,
          evidenceArtifactId: record.evidenceArtifactId,
          evidenceSha256: record.evidenceSha256,
          syntheticSpeechAllowed: record.syntheticSpeechAllowed,
          commercialUseAllowed: record.commercialUseAllowed,
          multilingualUseAllowed: record.multilingualUseAllowed,
          permittedChannels: [...record.permittedChannels],
          validFrom: new Date(record.validFrom),
          ...(record.validUntil
            ? { validUntil: new Date(record.validUntil) }
            : {}),
          ...(record.revokedAt
            ? { revokedAt: new Date(record.revokedAt) }
            : {}),
        }
      : undefined;
  }
}

class PostgresGenerationStore implements SpeechGenerationStore {
  public constructor(
    private readonly repository: PostgresSpeechApplicationRepository,
    private readonly workspaceId: string,
    private readonly now: () => Date,
    private readonly wait: (
      milliseconds: number,
      signal?: AbortSignal
    ) => Promise<void>
  ) {}
  public queueDepth(workspaceId: string): Promise<number> {
    if (workspaceId !== this.workspaceId)
      throw new Error("Speech workspace scope mismatch.");
    return this.repository.queueDepth(workspaceId);
  }
  public reusableChunk(
    input: Parameters<NonNullable<SpeechGenerationStore["reusableChunk"]>>[0]
  ) {
    return this.repository.reusableChunk({
      workspaceId: this.workspaceId,
      generationId: input.generationId,
      chunkIndex: input.chunk.index,
      textSha256: hash(input.chunk.text),
    });
  }
  public async claim(input: Parameters<SpeechGenerationStore["claim"]>[0]) {
    const command = input.command;
    const workerId = `speech-worker-${command.generationId}`;
    const result = await this.repository.claimGeneration({
      workspaceId: this.workspaceId,
      generationId: command.generationId,
      profileVersionId: input.profile.profileVersionId,
      cacheKey: input.cacheKey,
      cacheInputVersion: input.cacheInputVersion,
      requestFingerprint: hash({
        videoId: command.videoId,
        genreId: command.genreId,
        language: command.language,
        textHash: hash(command.text),
        profileVersionId: command.replacementProfileVersionId,
        forceRegeneration: command.forceRegeneration,
        supersedesGenerationId: command.supersedesGenerationId,
      }),
      textSha256: hash(command.text.normalize("NFC")),
      channel: command.channel,
      language: command.language,
      workerId,
      leaseSeconds: LEASE_SECONDS,
      forceRegeneration: command.forceRegeneration,
      now: this.now().toISOString(),
      ...(command.videoId ? { videoId: command.videoId } : {}),
      ...(command.genreId ? { genreId: command.genreId } : {}),
      ...(command.idempotencyKey
        ? { idempotencyKey: command.idempotencyKey }
        : {}),
      ...(command.supersedesGenerationId
        ? { supersedesGenerationId: command.supersedesGenerationId }
        : {}),
    });
    if (result.kind === "owner") return result;
    if (result.kind === "hit")
      return {
        kind: "hit" as const,
        result: serviceResult(await this.required(result.sourceGenerationId)),
      };
    if (result.kind === "replay")
      return {
        kind: "replay" as const,
        result: serviceResult(
          await this.waitForGeneration(result.generationId, command.abortSignal)
        ),
      };
    for (;;) {
      command.abortSignal?.throwIfAborted();
      const status = await this.repository.cacheStatus({
        workspaceId: this.workspaceId,
        cacheKey: input.cacheKey,
      });
      if (status?.authoritativeGenerationId)
        return {
          kind: "hit" as const,
          result: serviceResult(
            await this.required(status.authoritativeGenerationId)
          ),
        };
      if (
        status?.leaseExpiresAt &&
        Date.parse(status.leaseExpiresAt) <= this.now().getTime()
      ) {
        const reclaimed = await this.repository.reclaimWaitingGeneration({
          workspaceId: this.workspaceId,
          generationId: command.generationId,
          cacheKey: input.cacheKey,
          workerId,
          leaseSeconds: LEASE_SECONDS,
          now: this.now().toISOString(),
        });
        if (reclaimed) return { kind: "owner" as const };
      }
      await this.wait(100, command.abortSignal);
    }
  }
  public async waitFor(
    cacheKey: string,
    abortSignal?: AbortSignal
  ): Promise<SpeechGenerationResult> {
    for (;;) {
      const status = await this.repository.cacheStatus({
        workspaceId: this.workspaceId,
        cacheKey,
      });
      if (status?.authoritativeGenerationId)
        return serviceResult(
          await this.required(status.authoritativeGenerationId)
        );
      await this.wait(100, abortSignal);
    }
  }
  public renewLease(generationId: string): Promise<void> {
    return this.repository.renewLease({
      workspaceId: this.workspaceId,
      generationId,
      leaseSeconds: LEASE_SECONDS,
      now: this.now().toISOString(),
    });
  }
  public transition(
    input: Parameters<SpeechGenerationStore["transition"]>[0]
  ): Promise<void> {
    return this.repository.transition({
      workspaceId: this.workspaceId,
      generationId: input.generationId,
      from: persistedState(input.from),
      to: persistedState(input.to),
      now: this.now().toISOString(),
      ...(input.failureCode ? { failureCode: input.failureCode } : {}),
    });
  }
  public recordChunk(
    input: Parameters<SpeechGenerationStore["recordChunk"]>[0]
  ): Promise<void> {
    return this.repository.recordChunk({
      workspaceId: this.workspaceId,
      generationId: input.generationId,
      chunkIndex: input.chunk.index,
      attempt: input.attempt,
      textSha256: hash(input.chunk.text),
      ...(input.providerRequestId
        ? { providerRequestId: input.providerRequestId }
        : {}),
      ...(input.artifact ? { artifact: input.artifact } : {}),
      ...(input.errorCode ? { failureCode: input.errorCode } : {}),
      now: this.now().toISOString(),
    });
  }
  public complete(result: SpeechGenerationResult): Promise<void> {
    return this.repository.completeGeneration({
      workspaceId: this.workspaceId,
      generationId: result.generationId,
      artifacts: result.rawArtifacts.map((artifact, chunkIndex) => ({
        ...artifact,
        chunkIndex,
      })),
      master: result.masterArtifact,
      estimateCharacters: result.estimate.billableCharacters,
      ...(result.estimate.estimatedCredits === undefined
        ? {}
        : { estimateCredits: result.estimate.estimatedCredits }),
      actualCharacters: result.actualBillableCharacters,
      ...(result.actualCredits === undefined
        ? {}
        : { actualCredits: result.actualCredits }),
      now: this.now().toISOString(),
    });
  }
  public async recordCacheHit(
    input: Parameters<SpeechGenerationStore["recordCacheHit"]>[0]
  ): Promise<SpeechGenerationResult> {
    await this.repository.recordCacheHit({
      workspaceId: this.workspaceId,
      generationId: input.generationId,
      sourceGenerationId: input.source.generationId,
      now: this.now().toISOString(),
    });
    return {
      ...input.source,
      generationId: input.generationId,
      cacheHit: true,
      actualBillableCharacters: 0,
      actualCredits: 0,
    };
  }
  private async required(
    generationId: string
  ): Promise<PersistedSpeechGeneration> {
    const value = await this.repository.getGeneration(
      this.workspaceId,
      generationId
    );
    if (!value)
      throw new SpeechDomainError(
        "SPEECH_CACHE_CLAIM_CONFLICT",
        "Speech generation was not found."
      );
    return value;
  }
  private async waitForGeneration(
    generationId: string,
    signal?: AbortSignal
  ): Promise<PersistedSpeechGeneration> {
    for (;;) {
      const value = await this.required(generationId);
      if (value.state === "succeeded") return value;
      if (
        [
          "retryable_failure",
          "blocked_quota",
          "blocked_configuration",
          "blocked_consent",
          "failed_permanent",
          "cancelled",
        ].includes(value.state)
      )
        throw new SpeechDomainError(
          "SPEECH_CACHE_CLAIM_CONFLICT",
          "The original idempotent speech generation did not succeed."
        );
      await this.wait(100, signal);
    }
  }
}

class PostgresQuotaGuard implements SpeechQuotaGuard {
  public constructor(
    private readonly repository: PostgresSpeechApplicationRepository,
    private readonly workspaceId: string,
    private readonly now: () => Date
  ) {}
  public async reserve(input: Parameters<SpeechQuotaGuard["reserve"]>[0]) {
    const reservationId = id("speech-reservation");
    try {
      const remainingCharacters = await this.repository.reserveQuota({
        workspaceId: this.workspaceId,
        reservationId,
        generationId: input.generationId,
        provider: input.provider,
        ...(input.genreId ? { genreId: input.genreId } : {}),
        characters: input.estimate.billableCharacters,
        now: this.now().toISOString(),
      });
      return {
        reservationId,
        ...(remainingCharacters === undefined ? {} : { remainingCharacters }),
      };
    } catch (error) {
      if (error instanceof SpeechQuotaLimitError)
        throw new SpeechDomainError("SPEECH_QUOTA_EXCEEDED", error.message);
      throw error;
    }
  }
  public reconcile(input: Parameters<SpeechQuotaGuard["reconcile"]>[0]) {
    return this.repository.settleQuota({
      workspaceId: this.workspaceId,
      reservationId: input.reservationId,
      actualCharacters: input.actualBillableCharacters,
      now: this.now().toISOString(),
    });
  }
  public release(reservationId: string) {
    return this.repository.releaseQuota({
      workspaceId: this.workspaceId,
      reservationId,
      now: this.now().toISOString(),
    });
  }
}

class PostgresUsageLedger implements SpeechUsageLedger {
  public constructor(
    private readonly repository: PostgresSpeechApplicationRepository,
    private readonly workspaceId: string,
    private readonly now: () => Date
  ) {}
  public record(input: Parameters<SpeechUsageLedger["record"]>[0]) {
    return this.repository.recordUsage({
      workspaceId: this.workspaceId,
      usageId: id("speech-usage"),
      generationId: input.command.generationId,
      provider: input.profile.configuration.provider,
      ...(input.command.genreId ? { genreId: input.command.genreId } : {}),
      ...(input.command.videoId ? { videoId: input.command.videoId } : {}),
      inputCharacters: [...input.command.text].length,
      billableCharacters: input.actualBillableCharacters,
      ...(input.estimate.estimatedCredits === undefined
        ? {}
        : { estimatedCredits: input.estimate.estimatedCredits }),
      ...(input.actualCredits === undefined
        ? {}
        : { actualCredits: input.actualCredits }),
      cacheHit: input.cacheHit,
      ...(input.providerRequestIds[0]
        ? { providerRequestId: input.providerRequestIds[0] }
        : {}),
      now: this.now().toISOString(),
    });
  }
}

function translate(error: unknown): never {
  if (error instanceof SpeechIdempotencyConflictError)
    throw new ApplicationError("conflict", error.message, false);
  if (error instanceof SpeechOptimisticConcurrencyError)
    throw new ApplicationError("precondition_failed", error.message, false);
  if (error instanceof SpeechFencingError)
    throw new SpeechDomainError("SPEECH_CACHE_CLAIM_CONFLICT", error.message);
  throw error;
}

export function createPostgresSpeechApiUseCases(input: {
  readonly pool: PostgresPool;
  readonly config: SpeechProductionConfiguration;
  readonly now?: () => Date;
  readonly wait?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  readonly providerRegistry?: SpeechProviderRegistry;
  readonly artifactsForWorkspace?: (
    workspaceId: string
  ) => SpeechArtifactService;
}): SpeechApiUseCases {
  const repository = new PostgresSpeechApplicationRepository(input.pool);
  const now = input.now ?? (() => new Date());
  const foundation = new PostgresSpeechRepository(input.pool);
  const wait =
    input.wait ??
    ((milliseconds, signal) =>
      new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
          reject(signal.reason);
          return;
        }
        const timer = setTimeout(resolve, milliseconds);
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(signal.reason);
          },
          { once: true }
        );
      }));
  const openAiLegacyFactory = {
    create: (configuration: {
      readonly model: string;
      readonly voice: string;
      readonly instructions?: string;
      readonly outputFormat: string;
      readonly speed: number;
    }) =>
      new OpenAiCompatibleSpeechProvider({
        apiKey: input.config.openAiApiKey ?? "",
        model: configuration.model,
        voice: configuration.voice,
        ...(configuration.instructions
          ? { instructions: configuration.instructions }
          : {}),
        speed: configuration.speed,
        responseFormat: configuration.outputFormat as
          | "mp3"
          | "opus"
          | "aac"
          | "flac"
          | "wav"
          | "pcm",
        ...(input.config.openAiBaseUrl
          ? { baseUrl: input.config.openAiBaseUrl }
          : {}),
        ...(input.config.openAiOrganization
          ? { organization: input.config.openAiOrganization }
          : {}),
        ...(input.config.openAiProject
          ? { project: input.config.openAiProject }
          : {}),
      }),
  };
  const providers =
    input.providerRegistry ??
    new SpeechProviderRegistry([
      new OpenAiSpeechProviderAdapter(
        new LegacyOpenAiSpeechTransport(openAiLegacyFactory)
      ),
      new ElevenLabsSpeechProvider({
        featureEnabled: input.config.elevenLabsFeatureEnabled,
        ...(input.config.elevenLabsApiKey
          ? { apiKey: input.config.elevenLabsApiKey }
          : {}),
        ...(input.config.elevenLabsBaseUrl
          ? {
              baseUrl: input.config.elevenLabsBaseUrl,
              allowedBaseUrlHosts: [
                new URL(input.config.elevenLabsBaseUrl).hostname,
              ],
            }
          : {}),
        requestTimeoutMs: input.config.elevenLabsRequestTimeoutMs,
      }),
    ]);
  const serviceFor = (workspaceId: string): SpeechGenerationService => {
    const artifacts: SpeechArtifactService =
      input.artifactsForWorkspace?.(workspaceId) ??
      new FileSystemSpeechArtifactService({
        rootDirectory: path.join(
          input.config.workspaceDirectory,
          ".mediaforge",
          "speech",
          workspaceId
        ),
      });
    return new SpeechGenerationService({
      providers,
      profiles: new WorkspaceProfileResolver(repository, workspaceId),
      generations: new PostgresGenerationStore(
        repository,
        workspaceId,
        now,
        wait
      ),
      quotas: new PostgresQuotaGuard(repository, workspaceId, now),
      artifacts,
      usage: new PostgresUsageLedger(repository, workspaceId, now),
      instrumentation: new ExecutionSpeechInstrumentation(),
    });
  };
  const ensureSystemProfile = (workspaceId: string) =>
    foundation.backfillOpenAiDefault({
      workspaceId,
      profileId: SYSTEM_OPENAI_PROFILE_ID,
      profileVersionId: SYSTEM_OPENAI_VERSION_ID,
      profileKey: "system-openai",
      configuration: speechProviderConfigurationSchema.parse({
        provider: "openai",
        model: input.config.openAiModel,
        voice: input.config.openAiVoice,
        speed: 1,
        outputFormat: "wav",
      }),
      now: now().toISOString(),
    });
  const narration = (request: {
    readonly text?: string | undefined;
    readonly language?: string | undefined;
  }) => {
    if (!request.text || !request.language)
      throw new ApplicationError(
        "invalid_request",
        "text and language are required until a canonical video narration has been persisted.",
        false
      );
    return { text: request.text, language: request.language };
  };
  return {
    estimate: async (request, context) => {
      await ensureSystemProfile(context.workspaceId);
      const resolved = narration(request);
      const result = await serviceFor(context.workspaceId).estimate({
        workspaceId: context.workspaceId,
        videoId: request.videoId,
        ...(request.genreId ? { genreId: request.genreId } : {}),
        language: resolved.language,
        text: resolved.text,
        channel: input.config.channel,
        ...(request.profileVersionId
          ? { replacementProfileVersionId: request.profileVersionId }
          : {}),
      });
      const cache = createSpeechCacheKey({
        text: resolved.text,
        profile: result.profile,
      });
      const cacheStatus = await repository.cacheStatus({
        workspaceId: context.workspaceId,
        cacheKey: cache.cacheKey,
      });
      const quota = await repository.quotaImpact({
        workspaceId: context.workspaceId,
        provider: result.profile.configuration.provider,
        ...(request.genreId ? { genreId: request.genreId } : {}),
        characters: result.estimate.billableCharacters,
        now: now().toISOString(),
      });
      return {
        profileVersionId: result.profile.profileVersionId,
        provider: result.profile.configuration.provider,
        ...result.estimate,
        cacheHitExpected: Boolean(cacheStatus?.authoritativeGenerationId),
        quotaImpact: quota,
      };
    },
    generate: async (request, context) => {
      if (!(await repository.dispatchEnabled(context.workspaceId)))
        throw new SpeechDomainError(
          "SPEECH_PROVIDER_DISABLED",
          "Speech dispatch is disabled for this workspace."
        );
      await ensureSystemProfile(context.workspaceId);
      const resolved = narration(request);
      const generationId = id("speech-generation");
      try {
        const result = await serviceFor(context.workspaceId).generate({
          generationId,
          workspaceId: context.workspaceId,
          videoId: request.videoId,
          ...(request.genreId ? { genreId: request.genreId } : {}),
          language: resolved.language,
          text: resolved.text,
          channel: input.config.channel,
          forceRegeneration: request.forceRegeneration,
          ...(request.profileVersionId
            ? { replacementProfileVersionId: request.profileVersionId }
            : {}),
          ...(request.supersedesGenerationId
            ? { supersedesGenerationId: request.supersedesGenerationId }
            : {}),
          idempotencyKey: context.idempotencyKey,
        });
        return generationResponse(
          (await repository.getGeneration(
            context.workspaceId,
            result.generationId
          ))!
        );
      } catch (error) {
        return translate(error);
      }
    },
    getGeneration: async (generationId, context) => {
      const value = await repository.getGeneration(
        context.workspaceId,
        generationId
      );
      return value ? generationResponse(value) : null;
    },
    retryGeneration: async (generationId, retry, context) => {
      const prior = await repository.getGeneration(
        context.workspaceId,
        generationId
      );
      if (!prior)
        throw new ApplicationError(
          "not_found",
          "Speech generation was not found.",
          false
        );
      if (prior.state !== "retryable_failure")
        throw new SpeechDomainError(
          "SPEECH_GENERATION_NOT_RETRYABLE",
          "Only retryable speech failures may be retried."
        );
      if (
        prior.language !== retry.language ||
        prior.textSha256 !== hash(retry.text.normalize("NFC"))
      )
        throw new ApplicationError(
          "conflict",
          "Retry narration does not match the failed generation.",
          false
        );
      await repository.auditAction({
        workspaceId: context.workspaceId,
        action: "generation.retry",
        subjectId: generationId,
        actorId: context.principal.principalId,
        requestId: context.requestId,
        now: now().toISOString(),
      });
      try {
        const result = await serviceFor(context.workspaceId).generate({
          generationId: id("speech-generation"),
          workspaceId: context.workspaceId,
          ...(prior.videoId ? { videoId: prior.videoId } : {}),
          ...(prior.genreId ? { genreId: prior.genreId } : {}),
          language: retry.language,
          text: retry.text,
          channel: prior.channel,
          replacementProfileVersionId: prior.profile.profileVersionId,
          allowInactivePinnedProfile: true,
          forceRegeneration: true,
          supersedesGenerationId: generationId,
          reuseSuccessfulChunksFromGenerationId: generationId,
          idempotencyKey: context.idempotencyKey,
        });
        return generationResponse(
          (await repository.getGeneration(
            context.workspaceId,
            result.generationId
          ))!
        );
      } catch (error) {
        return translate(error);
      }
    },
    cancelGeneration: async (generationId, context) => {
      const value = await repository.cancelGeneration({
        workspaceId: context.workspaceId,
        generationId,
        actorId: context.principal.principalId,
        requestId: context.requestId,
        now: now().toISOString(),
      });
      if (!value)
        throw new ApplicationError(
          "conflict",
          "Speech generation could not be cancelled from its current state.",
          false
        );
      return generationResponse(value);
    },
    listProfiles: async (context) =>
      repository.listProfiles(context.workspaceId),
    createProfile: async (request, context) =>
      repository.createProfile({
        workspaceId: context.workspaceId,
        profileId: id("speech-profile"),
        key: request.key,
        displayName: request.displayName,
        ...(request.consentRecordId
          ? { consentRecordId: request.consentRecordId }
          : {}),
        now: now().toISOString(),
      }),
    createProfileVersion: async (profileId, request, context) =>
      versionResponse(
        await repository.createProfileVersion({
          workspaceId: context.workspaceId,
          profileId,
          profileVersionId: id("speech-profile-version"),
          language: request.language,
          provider: request.configuration.provider,
          configuration: request.configuration,
          now: now().toISOString(),
        })
      ),
    validateProfileVersion: async (versionId, context) => {
      const record = await repository.getProfileVersion(
        context.workspaceId,
        versionId
      );
      if (!record)
        throw new ApplicationError(
          "not_found",
          "Speech profile version was not found.",
          false
        );
      await providers.get(record.provider).validateProfile(profile(record));
      return versionResponse(record);
    },
    activateProfileVersion: async (versionId, context) => {
      const administration = new SpeechProfileAdministrationService({
        providers,
        channel: input.config.channel,
        profiles: {
          getVersion: async (workspaceId, idValue) => {
            const record = await repository.getProfileVersion(
              workspaceId,
              idValue
            );
            if (!record) return null;
            const consent = await new WorkspaceProfileResolver(
              repository,
              workspaceId
            ).consentFor(profile(record));
            return {
              profile: profile(record),
              status: record.status,
              ...(consent ? { consent } : {}),
            };
          },
          activateVersion: async (command) =>
            repository.activateProfileVersion({
              workspaceId: command.workspaceId,
              versionId: command.profileVersionId,
              expectedRevision: command.expectedRevision,
              actorId: command.actorId,
              requestId: context.requestId,
              now: command.activatedAt,
            }),
          setGenreDefault: async () => undefined,
        },
        listeningTests: {
          approved: (workspaceId, idValue) =>
            repository.listeningTestApproved(workspaceId, idValue),
        },
        now,
      });
      try {
        await administration.activateVersion({
          workspaceId: context.workspaceId,
          profileVersionId: versionId,
          expectedRevision: expectedRevision(context.ifMatch),
          actorId: context.principal.principalId,
        });
      } catch (error) {
        return translate(error);
      }
      return versionResponse(
        (await repository.getProfileVersion(context.workspaceId, versionId))!
      );
    },
    deprecateProfileVersion: async (versionId, context) => {
      try {
        await repository.deprecateProfileVersion({
          workspaceId: context.workspaceId,
          versionId,
          expectedRevision: expectedRevision(context.ifMatch),
          actorId: context.principal.principalId,
          requestId: context.requestId,
          now: now().toISOString(),
        });
      } catch (error) {
        return translate(error);
      }
      return versionResponse(
        (await repository.getProfileVersion(context.workspaceId, versionId))!
      );
    },
    setGenreSpeechPolicy: async (genreId, request, context) => {
      let revision = 0;
      const administration = new SpeechProfileAdministrationService({
        providers,
        channel: input.config.channel,
        profiles: {
          getVersion: async (workspaceId, idValue) => {
            const record = await repository.getProfileVersion(
              workspaceId,
              idValue
            );
            if (!record) return null;
            const consent = await new WorkspaceProfileResolver(
              repository,
              workspaceId
            ).consentFor(profile(record));
            return {
              profile: profile(record),
              status: record.status,
              ...(consent ? { consent } : {}),
            };
          },
          activateVersion: async () => undefined,
          setGenreDefault: async (command) => {
            revision = await repository.setGenrePolicy({
              workspaceId: command.workspaceId,
              genreId: command.genreId,
              profileVersionId: command.profileVersionId,
              expectedRevision: command.expectedRevision,
              actorId: command.actorId,
              requestId: context.requestId,
              now: now().toISOString(),
            });
          },
        },
        listeningTests: {
          approved: (workspaceId, idValue) =>
            repository.listeningTestApproved(workspaceId, idValue),
        },
        now,
      });
      try {
        await administration.setGenreDefault({
          workspaceId: context.workspaceId,
          genreId,
          profileVersionId: request.profileVersionId,
          expectedRevision: expectedRevision(context.ifMatch),
          actorId: context.principal.principalId,
        });
        return { profileVersionId: request.profileVersionId, revision };
      } catch (error) {
        return translate(error);
      }
    },
    setVideoSpeechOverride: async (videoId, request, context) => {
      try {
        if (!request.useGenreDefault) {
          const record = await repository.getProfileVersion(
            context.workspaceId,
            request.profileVersionId
          );
          if (!record)
            throw new SpeechDomainError(
              "SPEECH_PROFILE_NOT_FOUND",
              "Speech profile version was not found."
            );
          if (record.status !== "ACTIVE")
            throw new SpeechDomainError(
              "SPEECH_PROFILE_VERSION_INACTIVE",
              "A video override must reference an active profile version."
            );
          await providers.get(record.provider).validateProfile(profile(record));
          const consent = await new WorkspaceProfileResolver(
            repository,
            context.workspaceId
          ).consentFor(profile(record));
          assertSpeechConsent({
            profile: profile(record),
            ...(consent ? { consent } : {}),
            channel: input.config.channel,
            now: now(),
          });
        }
        return {
          profileVersionId: request.useGenreDefault
            ? null
            : request.profileVersionId,
          revision: await repository.setVideoOverride({
            workspaceId: context.workspaceId,
            videoId,
            ...(request.useGenreDefault
              ? {}
              : { profileVersionId: request.profileVersionId }),
            expectedRevision: expectedRevision(context.ifMatch),
            actorId: context.principal.principalId,
            requestId: context.requestId,
            now: now().toISOString(),
          }),
        };
      } catch (error) {
        return translate(error);
      }
    },
  };
}
