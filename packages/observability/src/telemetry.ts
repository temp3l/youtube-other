import fs from "node:fs/promises";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { ensureDir, hashText, writeJsonAtomic } from "@mediaforge/shared";
import type pino from "pino";
import {
  defaultPricingCatalog,
  estimateDurationCostMicros,
  estimateFixedRequestCostMicros,
  estimateImageCostMicros,
  estimateTokenCostMicros,
  type CostComputation,
  type MoneyMicros,
  type PricingCatalog,
} from "./pricing.js";

export interface ExecutionContext {
  readonly executionId: string;
  readonly command: string;
  readonly npmScript?: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly startedAt: string;
  episodeId?: string;
}

export type ApiOperation =
  | "text-generation"
  | "metadata-generation"
  | "transcription"
  | "speech-generation"
  | "image-generation"
  | "image-edit"
  | "embedding"
  | "moderation"
  | "youtube-upload"
  | "other-api";

export interface UsageData {
  readonly inputTokens?: number;
  readonly cachedInputTokens?: number;
  readonly outputTokens?: number;
  readonly audioInputTokens?: number;
  readonly audioOutputTokens?: number;
  readonly durationSeconds?: number;
  readonly imageCount?: number;
}

export interface ApiCallEvent {
  readonly provider: string;
  readonly model?: string;
  readonly operation: ApiOperation;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly attempt: number;
  readonly success: boolean;
  readonly episodeId?: string;
  readonly requestId?: string;
  readonly statusCode?: number;
  readonly retryable?: boolean;
  readonly usage?: UsageData;
  readonly details?: Record<string, unknown>;
  readonly error?: { readonly code?: string; readonly message: string };
}

export interface ProcessExecutionEvent {
  readonly executable: string;
  readonly args: readonly string[];
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly exitCode: number;
  readonly success: boolean;
  readonly stdoutBytes?: number;
  readonly stderrBytes?: number;
  readonly requestUrl?: string;
}

export interface ExecutionReport {
  readonly executionId: string;
  readonly command: string;
  readonly npmScript?: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly success: boolean;
  readonly exitCode?: number;
  readonly signal?: string;
  readonly episodeId?: string;
  readonly pricingVersion: string;
  readonly warnings: readonly string[];
  readonly apiCalls: readonly ApiCallEvent[];
  readonly processExecutions: readonly ProcessExecutionEvent[];
  readonly generatedImages: ReadonlyArray<{
    readonly sceneId?: string;
    readonly outputPath: string;
    readonly model?: string;
    readonly generationMode?: string;
    readonly attempts?: number;
    readonly requestId?: string;
    readonly promptHash?: string;
    readonly outputSha256?: string;
    readonly costMicros?: MoneyMicros | null;
  }>;
  readonly events: ReadonlyArray<{
    readonly name: string;
    readonly at: string;
    readonly details?: Record<string, unknown>;
  }>;
  readonly totals: {
    readonly apiCalls: number;
    readonly retries: number;
    readonly generatedImages: number;
    readonly estimatedCostMicros: MoneyMicros | null;
    readonly imageCostMicros: MoneyMicros | null;
    readonly transcriptCostMicros: MoneyMicros | null;
    readonly metadataCostMicros: MoneyMicros | null;
    readonly speechCostMicros: MoneyMicros | null;
  };
  readonly aggregates: {
    readonly byProvider: Record<string, { readonly calls: number; readonly estimatedCostMicros: MoneyMicros | null }>;
    readonly byModel: Record<string, { readonly calls: number; readonly estimatedCostMicros: MoneyMicros | null }>;
    readonly byOperation: Record<string, { readonly calls: number; readonly estimatedCostMicros: MoneyMicros | null }>;
  };
}

interface RecordedImage {
  readonly sceneId?: string;
  readonly outputPath: string;
  readonly model?: string;
  readonly generationMode?: string;
  readonly attempts?: number;
  readonly requestId?: string;
  readonly promptHash?: string;
  readonly outputSha256?: string;
  readonly costMicros?: MoneyMicros | null;
}

interface RecordedEvent {
  readonly name: string;
  readonly at: string;
  readonly details?: Record<string, unknown>;
}

interface RecordedCostEntry {
  readonly provider: string;
  readonly model?: string;
  readonly operation: ApiOperation;
  readonly costMicros: MoneyMicros | null;
  readonly warning: string | undefined;
}

const telemetryStore = new AsyncLocalStorage<ExecutionTelemetry>();
const REDACTED_CONTENT = "[redacted content]";
const REDACTED_PATH = "[redacted path]";
const REDACTED_VALUE = "[redacted]";
const sensitiveKeyPattern = /(?:authorization|cookie|api[-_]?key|token|secret|password|credential)/iu;
const contentKeyPattern = /(?:content|prompt|source|transcript|input|output_text|message|body)/iu;

function redactTelemetryString(value: string, key?: string): string {
  if (key && sensitiveKeyPattern.test(key)) return REDACTED_VALUE;
  if (key && contentKeyPattern.test(key)) return REDACTED_CONTENT;
  if (/^(?:[a-z]+:\/\/|\/|[A-Za-z]:[\\/])/u.test(value)) {
    try {
      const url = new URL(value);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return `${url.protocol}//${url.host}${url.pathname}`;
      }
    } catch {
      return REDACTED_PATH;
    }
  }
  return value;
}

export function redactTelemetryValue(value: unknown, key?: string): unknown {
  if (key && sensitiveKeyPattern.test(key)) return REDACTED_VALUE;
  if (key && contentKeyPattern.test(key)) return REDACTED_CONTENT;
  if (typeof value === "string") return redactTelemetryString(value, key);
  if (Array.isArray(value)) return value.map((item) => redactTelemetryValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redactTelemetryValue(entryValue, entryKey)]));
  }
  return value;
}

function redactExecutionArgv(argv: readonly string[]): readonly string[] {
  const sensitiveFlag = /^(?:--?(?:api[-_]?key|access[-_]?token|refresh[-_]?token|auth[-_]?token|bearer[-_]?token|token|secret|password|credential|client[-_]?secret))(?:=|$)/iu;
  let redactNext = false;
  return argv.map((arg) => {
    if (redactNext) {
      redactNext = false;
      return REDACTED_VALUE;
    }
    if (sensitiveFlag.test(arg)) {
      if (!arg.includes("=")) redactNext = true;
      const equals = arg.indexOf("=");
      return equals === -1 ? arg : `${arg.slice(0, equals + 1)}${REDACTED_VALUE}`;
    }
    return redactTelemetryString(arg);
  });
}

function safeSum(values: ReadonlyArray<number | null | undefined>): number | null {
  let total = 0;
  let seen = false;
  for (const value of values) {
    if (value === null || value === undefined) {
      continue;
    }
    seen = true;
    total += value;
    if (!Number.isSafeInteger(total)) {
      return null;
    }
  }
  return seen ? total : null;
}

function aggregateCostsBy(
  entries: ReadonlyArray<RecordedCostEntry>,
  keySelector: (entry: RecordedCostEntry) => string
): Record<string, { readonly calls: number; readonly estimatedCostMicros: MoneyMicros | null }> {
  const output: Record<string, { calls: number; estimatedCostMicros: MoneyMicros | null }> = {};
  for (const entry of entries) {
    const key = keySelector(entry);
    const current = output[key] ?? { calls: 0, estimatedCostMicros: null };
    current.calls += 1;
    current.estimatedCostMicros = safeSum([current.estimatedCostMicros, entry.costMicros]);
    output[key] = current;
  }
  return output;
}

function recordWarningSet(warnings: Set<string>, warning?: string): void {
  if (warning) {
    warnings.add(warning);
  }
}

export class ExecutionTelemetry {
  private readonly apiCallsInternal: ApiCallEvent[] = [];
  private readonly processExecutionsInternal: ProcessExecutionEvent[] = [];
  private readonly imagesInternal: RecordedImage[] = [];
  private readonly eventsInternal: RecordedEvent[] = [];
  private readonly costEntriesInternal: RecordedCostEntry[] = [];
  private readonly warningsInternal = new Set<string>();
  private success = true;
  private exitCode: number | undefined;
  private signal: string | undefined;
  private endedAt: string | undefined;

  public constructor(
    public readonly context: ExecutionContext,
    private readonly logger: pino.Logger,
    private readonly reportDir: string,
    private readonly pricingCatalog: PricingCatalog = defaultPricingCatalog
  ) {}

  public get catalog(): PricingCatalog {
    return this.pricingCatalog;
  }

  public setEpisodeId(episodeId: string): void {
    this.context.episodeId = episodeId;
  }

  public recordApiCall(event: ApiCallEvent): void {
    const redactedEvent = redactTelemetryValue(event) as ApiCallEvent;
    this.apiCallsInternal.push(redactedEvent);
    recordWarningSet(this.warningsInternal, redactedEvent.error?.message);
    this.logger.info(
      {
        executionId: this.context.executionId,
        episodeId: event.episodeId ?? this.context.episodeId,
        provider: event.provider,
        model: event.model,
        operation: event.operation,
        requestId: event.requestId,
        attempt: event.attempt,
        durationMs: event.durationMs,
        success: event.success,
      },
      "api_call"
    );
  }

  public recordProcessExecution(event: ProcessExecutionEvent): void {
    const redactedEvent = redactTelemetryValue(event) as ProcessExecutionEvent;
    this.processExecutionsInternal.push(redactedEvent);
    this.logger.info(
      {
        executionId: this.context.executionId,
        executable: event.executable,
        exitCode: event.exitCode,
        durationMs: event.durationMs,
        requestUrl: redactedEvent.requestUrl,
        success: redactedEvent.success,
      },
      "process_execution"
    );
  }

  public recordImage(image: RecordedImage): void {
    this.imagesInternal.push(redactTelemetryValue(image) as RecordedImage);
  }

  public recordEvent(event: RecordedEvent): void {
    const redactedEvent = redactTelemetryValue(event) as RecordedEvent;
    this.eventsInternal.push(redactedEvent);
    this.logger.info(
      {
        executionId: this.context.executionId,
        event: redactedEvent.name,
        at: redactedEvent.at,
        details: redactedEvent.details,
      },
      "execution_event"
    );
  }

  public recordCost(entry: RecordedCostEntry): void {
    const redactedEntry = {
      ...(redactTelemetryValue(entry) as RecordedCostEntry),
      ...(entry.warning === undefined ? {} : { warning: redactTelemetryString(entry.warning, "message") }),
    } as RecordedCostEntry;
    this.costEntriesInternal.push(redactedEntry);
    recordWarningSet(this.warningsInternal, redactedEntry.warning);
  }

  public recordWarning(message: string): void {
    const redactedMessage = redactTelemetryString(message, "message");
    this.warningsInternal.add(redactedMessage);
    this.logger.warn({ executionId: this.context.executionId, message: redactedMessage }, "execution_warning");
  }

  public async finalize(result: {
    readonly success: boolean;
    readonly exitCode?: number;
    readonly signal?: string;
    readonly endedAt?: string;
  }): Promise<ExecutionReport> {
    this.success = result.success;
    this.exitCode = result.exitCode;
    this.signal = result.signal;
    this.endedAt = result.endedAt ?? new Date().toISOString();
    const metadataCosts = this.costEntriesInternal.filter((entry) => entry.operation === "metadata-generation").map((entry) => entry.costMicros);
    const transcriptCosts = this.costEntriesInternal.filter((entry) => entry.operation === "transcription").map((entry) => entry.costMicros);
    const speechCosts = this.costEntriesInternal.filter((entry) => entry.operation === "speech-generation").map((entry) => entry.costMicros);
    const imageCosts = this.costEntriesInternal
      .filter((entry) => entry.operation === "image-generation" || entry.operation === "image-edit")
      .map((entry) => entry.costMicros);
    const totalCostMicros = safeSum(this.costEntriesInternal.map((entry) => entry.costMicros));
    const report: ExecutionReport = {
      executionId: this.context.executionId,
      command: this.context.command,
      argv: redactExecutionArgv(this.context.argv),
      cwd: REDACTED_PATH,
      startedAt: this.context.startedAt,
      endedAt: this.endedAt,
      durationMs: Math.max(0, Date.parse(this.endedAt) - Date.parse(this.context.startedAt)),
      success: this.success,
      pricingVersion: this.pricingCatalog.version,
      warnings: [...this.warningsInternal],
      apiCalls: this.apiCallsInternal,
      processExecutions: this.processExecutionsInternal,
      generatedImages: this.imagesInternal.map((item) => ({ ...item })),
      events: this.eventsInternal.map((event) => ({ ...event })),
      totals: {
        apiCalls: this.apiCallsInternal.length,
        retries: this.apiCallsInternal.filter((item) => item.attempt > 1).length,
        generatedImages: this.imagesInternal.length,
        estimatedCostMicros: totalCostMicros,
        imageCostMicros: safeSum(imageCosts),
        transcriptCostMicros: safeSum(transcriptCosts),
        metadataCostMicros: safeSum(metadataCosts),
        speechCostMicros: safeSum(speechCosts),
      },
      aggregates: {
        byProvider: aggregateCostsBy(this.costEntriesInternal, (entry) => entry.provider),
        byModel: aggregateCostsBy(this.costEntriesInternal, (entry) => entry.model ?? "unknown"),
        byOperation: aggregateCostsBy(this.costEntriesInternal, (entry) => entry.operation),
      },
      ...(this.context.npmScript !== undefined ? { npmScript: this.context.npmScript } : {}),
      ...(this.exitCode !== undefined ? { exitCode: this.exitCode } : {}),
      ...(this.signal !== undefined ? { signal: this.signal } : {}),
      ...(this.context.episodeId !== undefined ? { episodeId: this.context.episodeId } : {}),
    };
    await this.writeReport(report);
    this.logger.info(
      {
        executionId: this.context.executionId,
        episodeId: this.context.episodeId,
        success: report.success,
        exitCode: report.exitCode,
        pricingVersion: report.pricingVersion,
        estimatedCostMicros: report.totals.estimatedCostMicros,
        warnings: report.warnings,
      },
      "execution_report"
    );
    return report;
  }

  public async writeReport(report: ExecutionReport): Promise<void> {
    await ensureDir(this.reportDir);
    await writeJsonAtomic(path.join(this.reportDir, `${this.context.executionId}.json`), report);
  }
}

export function createExecutionTelemetry(options: {
  readonly context: ExecutionContext;
  readonly logger: pino.Logger;
  readonly reportDir: string;
  readonly pricingCatalog?: PricingCatalog;
}): ExecutionTelemetry {
  return new ExecutionTelemetry(
    options.context,
    options.logger,
    options.reportDir,
    options.pricingCatalog ?? defaultPricingCatalog
  );
}

export function withExecutionTelemetry<T>(
  telemetry: ExecutionTelemetry,
  fn: () => Promise<T>
): Promise<T> {
  return telemetryStore.run(telemetry, fn);
}

export function currentExecutionTelemetry(): ExecutionTelemetry | undefined {
  return telemetryStore.getStore();
}

export function estimateImageGenerationCost(
  catalog: PricingCatalog,
  event: {
    readonly provider: string;
    readonly model: string;
    readonly operation: "generate" | "edit";
    readonly size: string;
    readonly quality: string;
  }
): CostComputation {
  const provider = catalog.providers[event.provider];
  const model = provider?.models[event.model];
  return estimateImageCostMicros(model?.image, {
    operation: event.operation,
    size: event.size,
    quality: event.quality,
  });
}

export function estimateTextGenerationCost(
  catalog: PricingCatalog,
  event: {
    readonly provider: string;
    readonly model: string;
    readonly inputTokens?: number;
    readonly cachedInputTokens?: number;
    readonly outputTokens?: number;
  }
): CostComputation {
  const provider = catalog.providers[event.provider];
  const model = provider?.models[event.model];
  return estimateTokenCostMicros(model?.token, event);
}

export function estimateDurationPricing(
  catalog: PricingCatalog,
  event: {
    readonly provider: string;
    readonly model: string;
    readonly operation: "transcription" | "speech";
    readonly durationSeconds?: number;
  }
): CostComputation {
  const provider = catalog.providers[event.provider];
  const model = provider?.models[event.model];
  return event.operation === "transcription"
    ? estimateDurationCostMicros(model?.transcription, event.durationSeconds)
    : estimateDurationCostMicros(model?.speech, event.durationSeconds);
}

export function estimateFixedPricing(
  catalog: PricingCatalog,
  event: { readonly provider: string; readonly model: string; readonly operation: ApiOperation }
): CostComputation {
  const provider = catalog.providers[event.provider];
  const model = provider?.models[event.model];
  return estimateFixedRequestCostMicros(model?.fixedRequestMicros);
}

export function hashExecutionContext(context: ExecutionContext): string {
  return hashText(JSON.stringify(context));
}
