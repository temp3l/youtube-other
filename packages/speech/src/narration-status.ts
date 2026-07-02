import { z } from "zod";
import {
  narrationPipelineExitCode,
  type NarrationPipelineMode,
  type NarrationPipelineResult,
} from "./narration-pipeline.js";
import { type NarrationVariant } from "./narration-paths.js";

const secretValuePattern =
  /\b(?:sk-[a-zA-Z0-9_-]+|Bearer\s+[a-zA-Z0-9._-]+|(?:api[_-]?key|authorization|token|secret|password|credential)\s*[:=]\s*[^,\s;]+)/giu;
const textBearingPattern =
  /\b(?:full\s+)?(?:narration|script|prompt|input)\s+text\b[^.;\n]*/giu;

export const narrationFailureClassSchema = z.enum([
  "configuration",
  "provider",
  "validation",
  "assembly",
  "unknown",
]);
export type NarrationFailureClass = z.infer<typeof narrationFailureClassSchema>;

export const narrationTargetOutcomeSchema = z.enum([
  "success",
  "warning",
  "blocked",
  "failed",
]);
export type NarrationTargetOutcome = z.infer<typeof narrationTargetOutcomeSchema>;

export interface NarrationTargetDescriptor {
  readonly episodeId: string;
  readonly language: string;
  readonly locale: string;
  readonly variant: NarrationVariant;
  readonly rolloutMode: NarrationPipelineMode;
}

export interface NarrationTargetStatus extends NarrationTargetDescriptor {
  readonly outcome: NarrationTargetOutcome;
  readonly latestStage?: string;
  readonly latestStageStatus?: string;
  readonly failureClass?: NarrationFailureClass;
  readonly message?: string;
  readonly durationMs: number;
  readonly outputPathCount: number;
}

export interface NarrationBatchSummary {
  readonly success: number;
  readonly warning: number;
  readonly blocked: number;
  readonly failed: number;
  readonly total: number;
}

export interface NarrationBatchStatus {
  readonly generatedAt: string;
  readonly strictMode: boolean;
  readonly summary: NarrationBatchSummary;
  readonly exitCode: number;
  readonly targets: readonly NarrationTargetStatus[];
}

function compactMessage(message: string | undefined): string | undefined {
  const normalized = message
    ?.replace(secretValuePattern, "[redacted]")
    .replace(textBearingPattern, "[redacted text]")
    .replace(/\s+/gu, " ")
    .trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized;
}

function latestStage(result: NarrationPipelineResult) {
  return result.stages[result.stages.length - 1];
}

function resultHasWarnings(result: NarrationPipelineResult): boolean {
  return result.stages.some((stage) => stage.message === "READY_WITH_WARNINGS");
}

function classifyStageFailure(result: NarrationPipelineResult): NarrationFailureClass | undefined {
  const failingStage = result.stages.find(
    (stage) => stage.status === "failed" || stage.status === "blocked"
  );
  if (!failingStage) {
    return undefined;
  }
  if (failingStage.stage === "generate") {
    return "provider";
  }
  if (failingStage.stage === "assemble") {
    return "assembly";
  }
  if (failingStage.stage === "validate") {
    return "validation";
  }
  if (failingStage.message?.includes("narrationPipelineMode")) {
    return "configuration";
  }
  return failingStage.status === "blocked" ? "validation" : "unknown";
}

export function classifyNarrationError(error: unknown): NarrationFailureClass {
  if (error instanceof z.ZodError) {
    return "validation";
  }
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  if (/Configuration|config|invalid .*mode|invalid .*variant|invalid .*language/iu.test(`${name} ${message}`)) {
    return "configuration";
  }
  if (/Provider|OpenAI|speech provider|api key|rate limit|quota|timeout/iu.test(`${name} ${message}`)) {
    return "provider";
  }
  if (/validation|schema|invalid|missing|blocked/iu.test(`${name} ${message}`)) {
    return "validation";
  }
  if (/assembly|assemble|ffmpeg|concat/iu.test(`${name} ${message}`)) {
    return "assembly";
  }
  return "unknown";
}

export function buildNarrationTargetStatusFromResult(
  result: NarrationPipelineResult,
  durationMs: number
): NarrationTargetStatus {
  const latest = latestStage(result);
  const failureClass = classifyStageFailure(result);
  const message = compactMessage(latest?.message);
  const outcome: NarrationTargetOutcome =
    result.stages.some((stage) => stage.status === "failed")
      ? "failed"
      : result.stages.some((stage) => stage.status === "blocked")
        ? "blocked"
        : resultHasWarnings(result)
          ? "warning"
          : "success";
  return {
    episodeId: result.episodeId,
    language: result.language,
    locale: result.locale,
    variant: result.variant,
    rolloutMode: result.rolloutMode,
    outcome,
    ...(latest ? { latestStage: latest.stage, latestStageStatus: latest.status } : {}),
    ...(failureClass ? { failureClass } : {}),
    ...(message ? { message } : {}),
    durationMs,
    outputPathCount: result.stages.reduce(
      (count, stage) => count + stage.outputPaths.length,
      0
    ),
  };
}

export function buildNarrationTargetStatusFromError(input: {
  readonly target: NarrationTargetDescriptor;
  readonly error: unknown;
  readonly durationMs: number;
}): NarrationTargetStatus {
  const failureClass = classifyNarrationError(input.error);
  const message = compactMessage(input.error instanceof Error ? input.error.message : String(input.error));
  return {
    ...input.target,
    outcome: failureClass === "assembly" || failureClass === "validation" ? "blocked" : "failed",
    failureClass,
    ...(message ? { message } : {}),
    durationMs: input.durationMs,
    outputPathCount: 0,
  };
}

export function buildNarrationTargetStatus(input: {
  readonly target: NarrationTargetDescriptor;
  readonly outcome: NarrationTargetOutcome;
  readonly durationMs: number;
  readonly message?: string;
  readonly failureClass?: NarrationFailureClass;
  readonly outputPathCount?: number;
}): NarrationTargetStatus {
  const message = compactMessage(input.message);
  return {
    ...input.target,
    outcome: input.outcome,
    ...(input.failureClass ? { failureClass: input.failureClass } : {}),
    ...(message ? { message } : {}),
    durationMs: input.durationMs,
    outputPathCount: input.outputPathCount ?? 0,
  };
}

export function summarizeNarrationTargets(
  targets: readonly NarrationTargetStatus[]
): NarrationBatchSummary {
  return {
    success: targets.filter((target) => target.outcome === "success").length,
    warning: targets.filter((target) => target.outcome === "warning").length,
    blocked: targets.filter((target) => target.outcome === "blocked").length,
    failed: targets.filter((target) => target.outcome === "failed").length,
    total: targets.length,
  };
}

export function narrationBatchExitCode(
  summary: NarrationBatchSummary,
  strictMode: boolean
): number {
  if (summary.failed > 0) {
    return narrationPipelineExitCode.generationFailed;
  }
  if (summary.blocked > 0) {
    return narrationPipelineExitCode.validationBlocked;
  }
  if (strictMode && summary.warning > 0) {
    return narrationPipelineExitCode.partialWarning;
  }
  return narrationPipelineExitCode.ok;
}

export function buildNarrationBatchStatus(input: {
  readonly targets: readonly NarrationTargetStatus[];
  readonly strictMode?: boolean;
  readonly generatedAt?: string;
}): NarrationBatchStatus {
  const strictMode = input.strictMode ?? false;
  const summary = summarizeNarrationTargets(input.targets);
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    strictMode,
    summary,
    exitCode: narrationBatchExitCode(summary, strictMode),
    targets: input.targets,
  };
}
