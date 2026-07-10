import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const REDACTED_SECRET = "[REDACTED_SECRET]";
const REDACTED_BASE64_IMAGE_RESPONSE = "[REDACTED_BASE64_IMAGE_RESPONSE]";
const LARGE_STRING_THRESHOLD = 4096;
const BASE64_LIKE_THRESHOLD = 512;

export type OpenAIDebugMode =
  | "real"
  | "simulation"
  | "dry-run"
  | "mock"
  | "fixture"
  | "local-only"
  | "no-paid-provider";

export interface OpenAIDebugLogEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly episodeRoot?: string;
  readonly operation?: string;
  readonly provider: "openai";
  readonly mode?: OpenAIDebugMode;
  readonly paidProviderCalled: boolean;
  readonly model?: string;
  readonly endpoint?: string;
  readonly request: unknown;
  readonly response?: unknown;
  readonly simulatedResponse?: unknown;
  readonly skippedReason?: string;
  readonly error?: {
    readonly name?: string;
    readonly message?: string;
    readonly status?: number;
    readonly code?: string;
    readonly type?: string;
    readonly stack?: string;
    readonly raw?: unknown;
  };
  readonly usage?: unknown;
  readonly durationMs: number;
  readonly attempt?: number;
  readonly caller?: {
    readonly file?: string;
    readonly function?: string;
    readonly stage?: string;
  };
}

export interface WriteOpenAIDebugLogInput
  extends Omit<OpenAIDebugLogEntry, "id" | "timestamp" | "provider"> {
  readonly id?: string;
  readonly timestamp?: string;
  readonly status?: "success" | "error" | "simulation" | "skipped" | "pre-dispatch";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSecretKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return [
    "authorization",
    "apikey",
    "api_key",
    "openai_api_key",
    "cookie",
    "set-cookie",
  ].includes(normalized);
}

function isImageBase64Key(key: string): boolean {
  return ["b64_json", "image_base64", "base64"].includes(key);
}

function looksLikeBase64(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < BASE64_LIKE_THRESHOLD) {
    return false;
  }
  if (trimmed.startsWith("data:image/")) {
    return true;
  }
  if (trimmed.length < LARGE_STRING_THRESHOLD && !/^[A-Za-z0-9+/=\r\n]+$/u.test(trimmed)) {
    return false;
  }
  const compact = trimmed.replace(/\s+/gu, "");
  if (compact.length < BASE64_LIKE_THRESHOLD || compact.length % 4 !== 0) {
    return false;
  }
  const base64Chars = compact.match(/[A-Za-z0-9+/=]/gu)?.length ?? 0;
  return base64Chars / compact.length > 0.98;
}

function sanitizeString(value: string, key?: string): string {
  if (key && isImageBase64Key(key)) {
    return REDACTED_BASE64_IMAGE_RESPONSE;
  }
  if (value.trim().startsWith("data:image/") || looksLikeBase64(value)) {
    return REDACTED_BASE64_IMAGE_RESPONSE;
  }
  if (/^Bearer\s+\S+/iu.test(value)) {
    return "Bearer [REDACTED_SECRET]";
  }
  return value;
}

export function redactOpenAIDebugValue(value: unknown, key?: string): unknown {
  if (key && isSecretKey(key)) {
    return REDACTED_SECRET;
  }
  if (typeof value === "string") {
    return sanitizeString(value, key);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactOpenAIDebugValue(entry));
  }
  if (!isPlainRecord(value)) {
    return value;
  }
  const redacted: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    redacted[entryKey] = redactOpenAIDebugValue(entryValue, entryKey);
  }
  return redacted;
}

export function serializeOpenAIError(
  error: unknown
): NonNullable<OpenAIDebugLogEntry["error"]> {
  if (!error || typeof error !== "object") {
    return { message: String(error) };
  }
  const record = error as {
    readonly name?: unknown;
    readonly message?: unknown;
    readonly status?: unknown;
    readonly code?: unknown;
    readonly type?: unknown;
    readonly stack?: unknown;
    readonly error?: unknown;
  };
  return {
    ...(typeof record.name === "string" ? { name: record.name } : {}),
    ...(typeof record.message === "string" ? { message: record.message } : {}),
    ...(typeof record.status === "number" ? { status: record.status } : {}),
    ...(typeof record.code === "string" ? { code: record.code } : {}),
    ...(typeof record.type === "string" ? { type: record.type } : {}),
    ...(typeof record.stack === "string" ? { stack: record.stack } : {}),
    raw: redactOpenAIDebugValue(record.error ?? error),
  };
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

function filesystemSafeToken(value: string): string {
  return value
    .replace(/[:.]/gu, "-")
    .replace(/[^a-zA-Z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 120);
}

function resolveOpenAIDebugDirectory(episodeRoot?: string): string {
  if (episodeRoot && episodeRoot.trim().length > 0) {
    // Episode-local logs are preferred; callers should pass the typed episode root
    // instead of relying on brittle path guessing from output filenames.
    return path.join(episodeRoot, "debug", "openai-calls");
  }
  return path.join(process.cwd(), "debug", "openai-calls", "unscoped");
}

export async function writeOpenAIDebugLog(
  input: WriteOpenAIDebugLogInput
): Promise<{ readonly id: string; readonly filePath: string }> {
  const id = input.id ?? crypto.randomUUID();
  const timestamp = input.timestamp ?? new Date().toISOString();
  const redactedError =
    input.error === undefined
      ? undefined
      : (redactOpenAIDebugValue(input.error) as OpenAIDebugLogEntry["error"]);
  const entry: OpenAIDebugLogEntry = {
    id,
    timestamp,
    ...(input.episodeRoot ? { episodeRoot: input.episodeRoot } : {}),
    ...(input.operation ? { operation: input.operation } : {}),
    provider: "openai",
    ...(input.mode ? { mode: input.mode } : {}),
    paidProviderCalled: input.paidProviderCalled,
    ...(input.model ? { model: input.model } : {}),
    ...(input.endpoint ? { endpoint: input.endpoint } : {}),
    request: redactOpenAIDebugValue(input.request),
    ...(input.response !== undefined
      ? { response: redactOpenAIDebugValue(input.response) }
      : {}),
    ...(input.simulatedResponse !== undefined
      ? { simulatedResponse: redactOpenAIDebugValue(input.simulatedResponse) }
      : {}),
    ...(input.skippedReason ? { skippedReason: input.skippedReason } : {}),
    ...(redactedError !== undefined ? { error: redactedError } : {}),
    ...(input.usage !== undefined ? { usage: redactOpenAIDebugValue(input.usage) } : {}),
    durationMs: input.durationMs,
    ...(input.attempt !== undefined ? { attempt: input.attempt } : {}),
    ...(input.caller ? { caller: input.caller } : {}),
  };
  const directory = resolveOpenAIDebugDirectory(input.episodeRoot);
  await ensureDir(directory);
  const filename = [
    filesystemSafeToken(timestamp),
    filesystemSafeToken(input.operation ?? "openai-call"),
    filesystemSafeToken(input.model ?? "unknown-model"),
    filesystemSafeToken(input.status ?? (input.error ? "error" : "success")),
    id.slice(0, 8),
  ].join("_");
  const filePath = path.join(directory, `${filename}.json`);
  await fs.writeFile(filePath, `${JSON.stringify(entry, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return { id, filePath };
}
