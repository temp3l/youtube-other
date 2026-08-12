import {
  MICRODRAMA_BUDGET_SCHEMA_VERSION,
  type MicrodramaBudgetPreflight,
} from "@mediaforge/domain";

import {
  assertVideoGenerationApproval,
  type VideoGenerationDispatchContext,
} from "./approval-policy.js";
import { buildVideoGenerationCacheKey } from "./cache-key.js";
import {
  assertVideoGenerationBudget,
  buildVideoPreflightWorkItem,
  recordVideoGenerationCost,
  type VideoGenerationBudgetPort,
} from "./cost-policy.js";
import {
  VIDEO_GENERATION_SCHEMA_VERSION,
  type VideoGenerationEffect,
  type VideoGenerationRequest,
  type VideoGenerationResult,
  type VideoProviderAdapter,
} from "./contracts.js";
import { reconcileVideoGenerationEffect } from "./effect-reconciliation.js";

export type VideoGenerationCacheClaim =
  | { readonly kind: "hit"; readonly result: VideoGenerationResult }
  | { readonly kind: "owner" };

export interface VideoGenerationCacheStore {
  get(cacheKey: string): Promise<VideoGenerationResult | null>;
  claim(input: {
    readonly request: VideoGenerationRequest;
    readonly cacheKey: string;
  }): Promise<VideoGenerationCacheClaim>;
  complete(result: VideoGenerationResult): Promise<void>;
}

export type VideoGenerationPortOutcome =
  | { readonly kind: "cache-hit"; readonly result: VideoGenerationResult }
  | { readonly kind: "generated"; readonly result: VideoGenerationResult }
  | { readonly kind: "pending"; readonly effect: VideoGenerationEffect }
  | {
      readonly kind: "ambiguous";
      readonly effect: VideoGenerationEffect;
    }
  | { readonly kind: "failed"; readonly effect: VideoGenerationEffect };

export class VideoGenerationDispatchError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "VideoGenerationDispatchError";
  }
}

export class MicrodramaVideoGenerationPort {
  public constructor(
    private readonly options: {
      readonly adapter: VideoProviderAdapter;
      readonly cache: VideoGenerationCacheStore;
      readonly budget: VideoGenerationBudgetPort;
      readonly providerId: string;
      readonly taskId: string;
    }
  ) {}

  public async generate(input: {
    readonly request: VideoGenerationRequest;
    readonly dispatchContext: VideoGenerationDispatchContext;
    readonly correlationId: string;
    readonly evaluatedAt: string;
    readonly inputArtifactHashes: readonly string[];
  }): Promise<VideoGenerationPortOutcome> {
    assertVideoGenerationApproval({
      request: input.request,
      dispatchContext: input.dispatchContext,
      inputArtifactHashes: input.inputArtifactHashes,
    });

    const cacheKey = buildVideoGenerationCacheKey(input.request);
    const claim = await this.options.cache.claim({
      request: input.request,
      cacheKey,
    });
    if (claim.kind === "hit") {
      return { kind: "cache-hit", result: claim.result };
    }

    const estimate = await this.options.adapter.estimate(input.request);
    const workItem = buildVideoPreflightWorkItem({
      request: input.request,
      estimate,
      provider: this.options.providerId,
      taskId: this.options.taskId,
    });
    const preflight = assertVideoGenerationBudget({
      port: this.options.budget,
      correlationId: input.correlationId,
      evaluatedAt: input.evaluatedAt,
      workItem,
    });

    const providerResult = await this.options.adapter.submit(input.request, {
      cacheKey,
    });
    const effect = this.buildEffect({
      request: input.request,
      cacheKey,
      providerResult,
      evaluatedAt: input.evaluatedAt,
    });

    if (providerResult.kind === "completed") {
      const result = this.buildResult({
        request: input.request,
        cacheKey,
        cacheStatus: "miss",
        estimate,
        providerResult,
        completedAt: input.evaluatedAt,
      });
      await this.options.cache.complete(result);
      recordVideoGenerationCost({
        port: this.options.budget,
        request: input.request,
        result,
        provider: this.options.providerId,
        taskId: this.options.taskId,
        correlationId: input.correlationId,
        reservationId: preflight.reservations[0]?.reservationId ?? "unreserved",
        recordedAt: input.evaluatedAt,
      });
      return { kind: "generated", result };
    }

    if (providerResult.kind === "pending") {
      return { kind: "pending", effect };
    }
    if (providerResult.kind === "ambiguous") {
      return { kind: "ambiguous", effect };
    }
    return { kind: "failed", effect };
  }

  public async reconcileAmbiguousEffect(input: {
    readonly effect: VideoGenerationEffect;
    readonly request: VideoGenerationRequest;
    readonly providerEvidence: unknown;
    readonly correlationId: string;
    readonly evaluatedAt: string;
  }): Promise<VideoGenerationPortOutcome> {
    if (!this.options.adapter.reconcile) {
      throw new VideoGenerationDispatchError(
        "Selected video provider adapter does not support reconciliation."
      );
    }
    const providerResult = await this.options.adapter.reconcile({
      effect: input.effect,
      providerEvidence: input.providerEvidence,
    });
    const decision = reconcileVideoGenerationEffect({
      effect: input.effect,
      providerResult,
    });
    if (decision.kind === "still-ambiguous") {
      return {
        kind: "ambiguous",
        effect: {
          ...input.effect,
          updatedAt: input.evaluatedAt,
          message: decision.message,
          reconciliationRequired: true,
        },
      };
    }

    if (decision.nextStatus === "failed") {
      return {
        kind: "failed",
        effect: {
          ...input.effect,
          status: "failed",
          updatedAt: input.evaluatedAt,
          reconciliationRequired: false,
          message:
            providerResult.kind === "failed"
              ? providerResult.message
              : "Reconciliation failed.",
        },
      };
    }

    const estimate = await this.options.adapter.estimate(input.request);
    const result = this.buildResult({
      request: input.request,
      cacheKey: input.effect.cacheKey,
      cacheStatus: "miss",
      estimate,
      providerResult,
      completedAt: input.evaluatedAt,
    });
    await this.options.cache.complete(result);
    recordVideoGenerationCost({
      port: this.options.budget,
      request: input.request,
      result,
      provider: this.options.providerId,
      taskId: this.options.taskId,
      correlationId: input.correlationId,
      reservationId: `reconcile.${input.effect.effectId}`,
      recordedAt: input.evaluatedAt,
    });
    return { kind: "generated", result };
  }

  private buildEffect(input: {
    readonly request: VideoGenerationRequest;
    readonly cacheKey: string;
    readonly providerResult: Awaited<ReturnType<VideoProviderAdapter["submit"]>>;
    readonly evaluatedAt: string;
  }): VideoGenerationEffect {
    const status =
      input.providerResult.kind === "completed"
        ? "succeeded"
        : input.providerResult.kind === "pending"
          ? "pending"
          : input.providerResult.kind === "ambiguous"
            ? "ambiguous"
            : "failed";
    return {
      schemaVersion: VIDEO_GENERATION_SCHEMA_VERSION,
      effectId: `effect.${input.request.generationId}`,
      generationId: input.request.generationId,
      providerRequestId:
        "providerRequestId" in input.providerResult
          ? input.providerResult.providerRequestId
          : undefined,
      status,
      cacheKey: input.cacheKey,
      submittedAt: input.evaluatedAt,
      updatedAt: input.evaluatedAt,
      reconciliationRequired: status === "ambiguous",
      message:
        input.providerResult.kind === "failed" ||
        input.providerResult.kind === "ambiguous"
          ? input.providerResult.message
          : undefined,
    };
  }

  private buildResult(input: {
    readonly request: VideoGenerationRequest;
    readonly cacheKey: string;
    readonly cacheStatus: VideoGenerationResult["cacheStatus"];
    readonly estimate: Awaited<ReturnType<VideoProviderAdapter["estimate"]>>;
    readonly providerResult: Extract<
      Awaited<ReturnType<VideoProviderAdapter["submit"]>>,
      { kind: "completed" }
    >;
    readonly completedAt: string;
  }): VideoGenerationResult {
    return {
      schemaVersion: VIDEO_GENERATION_SCHEMA_VERSION,
      generationId: input.request.generationId,
      cacheKey: input.cacheKey,
      cacheStatus: input.cacheStatus,
      artifactHash: input.providerResult.artifactHash,
      durationMs: input.providerResult.durationMs,
      providerRequestId: input.providerResult.providerRequestId,
      estimate: input.estimate,
      actualCostMinor: input.providerResult.actualCostMinor,
      completedAt: input.completedAt,
    };
  }
}

export class InMemoryVideoGenerationCache implements VideoGenerationCacheStore {
  private readonly entries = new Map<string, VideoGenerationResult>();

  public async get(cacheKey: string): Promise<VideoGenerationResult | null> {
    return this.entries.get(cacheKey) ?? null;
  }

  public async claim(input: {
    readonly request: VideoGenerationRequest;
    readonly cacheKey: string;
  }): Promise<VideoGenerationCacheClaim> {
    if (!input.request.forceRegeneration) {
      const cached = await this.get(input.cacheKey);
      if (cached) {
        return {
          kind: "hit",
          result: {
            ...cached,
            cacheStatus: "hit",
          },
        };
      }
    }
    return { kind: "owner" };
  }

  public async complete(result: VideoGenerationResult): Promise<void> {
    this.entries.set(result.cacheKey, result);
  }
}

export class InMemoryVideoGenerationBudgetPort
  implements VideoGenerationBudgetPort
{
  public readonly attributions: Array<{
    readonly attribution: unknown;
    readonly evidence: unknown;
  }> = [];

  public runBudgetPreflight(input: {
    readonly correlationId: string;
    readonly workItems: Parameters<
      VideoGenerationBudgetPort["runBudgetPreflight"]
    >[0]["workItems"];
    readonly evaluatedAt: string;
  }): MicrodramaBudgetPreflight {
    const total = input.workItems.reduce(
      (sum, item) => sum + item.estimatedCostMinor,
      0
    );
    const allowed = total <= 500;
    return {
      schemaVersion: MICRODRAMA_BUDGET_SCHEMA_VERSION,
      correlationId: input.correlationId,
      allowed,
      ...(allowed
        ? {}
        : {
            blockReason: "budget_exceeded" as const,
            message: "Video generation estimate exceeds the test budget.",
          }),
      reservations: allowed
        ? input.workItems.map((item, index) => ({
            schemaVersion: MICRODRAMA_BUDGET_SCHEMA_VERSION,
            reservationId: `reservation-${index + 1}`,
            profileId: "video-test",
            revisionId: item.revisionId,
            episodeId: item.episodeId,
            provider: item.provider,
            taskId: item.taskId,
            reservedMinor: item.estimatedCostMinor,
            state: "reserved" as const,
            correlationId: input.correlationId,
            createdAt: input.evaluatedAt,
            updatedAt: input.evaluatedAt,
          }))
        : [],
      evaluatedAt: input.evaluatedAt,
    };
  }

  public recordCostAttribution(input: {
    readonly attribution: Parameters<
      VideoGenerationBudgetPort["recordCostAttribution"]
    >[0]["attribution"];
    readonly evidence: unknown;
  }) {
    this.attributions.push(input);
    return input.attribution;
  }
}
