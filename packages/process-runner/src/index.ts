import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProcessExecutionError } from "@mediaforge/domain";
import { currentExecutionTelemetry } from "@mediaforge/observability";

export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly responseHeaders?: Record<string, string>;
  readonly requestUrl?: string;
}

export interface SpawnOptions {
  readonly cwd?: string;
  readonly env?: Record<string, string | undefined>;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly allowNonZeroExit?: boolean;
}

const allowlist = new Set(["curl", "ffmpeg", "ffprobe", "yt-dlp", "node", "whisper", "whisper-cli", "whisper.cpp"]);
const redactedValue = "[redacted]";
const sensitiveFlagPattern = /(?:api[-_]?key|access[-_]?token|refresh[-_]?token|auth[-_]?token|bearer[-_]?token|token|secret|password|passwd|credential|client[-_]?secret)/iu;
const sensitiveEnvPattern = /^[A-Z_][A-Z0-9_]*(?:API[-_]?KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)[A-Z0-9_]*=/iu;

function isHeaderFlag(value: string): boolean {
  return value === "-H" || value === "--header" || value === "--proxy-header";
}

function isSensitiveValueFlag(value: string): boolean {
  const flagName = value.replace(/^--?/u, "").split("=", 1)[0] ?? value;
  return sensitiveFlagPattern.test(flagName);
}

function redactHeaderValue(value: string): string {
  return value.replace(
    /\b(authorization\s*:\s*bearer\s+)(\S+)/giu,
    `$1${redactedValue}`
  );
}

function redactInlineSecret(value: string): string {
  if (sensitiveEnvPattern.test(value)) {
    const separatorIndex = value.indexOf("=");
    return `${value.slice(0, separatorIndex + 1)}${redactedValue}`;
  }
  if (/^--?[^=]+=/.test(value) && isSensitiveValueFlag(value)) {
    const separatorIndex = value.indexOf("=");
    return `${value.slice(0, separatorIndex + 1)}${redactedValue}`;
  }
  return redactHeaderValue(value);
}

export function redactProcessArgs(args: ReadonlyArray<string>): readonly string[] {
  const redacted: string[] = [];
  let redactNextValue = false;
  let redactNextHeader = false;
  for (const arg of args) {
    if (redactNextValue) {
      redacted.push(redactedValue);
      redactNextValue = false;
      continue;
    }
    if (redactNextHeader) {
      redacted.push(redactHeaderValue(arg));
      redactNextHeader = false;
      continue;
    }
    const nextArg = redactInlineSecret(arg);
    redacted.push(nextArg);
    if (isHeaderFlag(arg)) {
      redactNextHeader = true;
      continue;
    }
    if (!arg.includes("=") && isSensitiveValueFlag(arg)) {
      redactNextValue = true;
    }
  }
  return redacted;
}

function parseHeaderBlock(text: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of text.split(/\r?\n/u)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }
    const name = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    if (name.length > 0 && value.length > 0) {
      headers[name] = value;
    }
  }
  return headers;
}

function extractCurlUrl(args: ReadonlyArray<string>): string | undefined {
  for (let index = args.length - 1; index >= 0; index -= 1) {
    const value = args[index];
    if (value && /^https?:\/\//iu.test(value)) {
      return value;
    }
  }
  return undefined;
}

export async function runCommand(executable: string, args: ReadonlyArray<string>, options: SpawnOptions = {}): Promise<CommandResult> {
  if (!allowlist.has(path.basename(executable))) {
    throw new ProcessExecutionError(`Executable is not allowlisted: ${executable}`);
  }
  const telemetry = currentExecutionTelemetry();
  const startedAt = Date.now();
  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timeout = options.timeoutMs
      ? setTimeout(() => {
          child.kill("SIGKILL");
          reject(new ProcessExecutionError(`Command timed out: ${executable}`));
        }, options.timeoutMs)
      : null;
    const abortHandler = (): void => {
      child.kill("SIGKILL");
      reject(new ProcessExecutionError(`Command aborted: ${executable}`));
    };
    options.signal?.addEventListener("abort", abortHandler, { once: true });
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (timeout !== null) {
        clearTimeout(timeout);
      }
      options.signal?.removeEventListener("abort", abortHandler);
      reject(new ProcessExecutionError(`Failed to start ${executable}: ${(error as Error).message}`));
    });
    child.on("close", (exitCode) => {
      if (timeout !== null) {
        clearTimeout(timeout);
      }
      options.signal?.removeEventListener("abort", abortHandler);
      telemetry?.recordProcessExecution({
        executable,
        args: redactProcessArgs(args),
        startedAt: new Date(startedAt).toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        exitCode: exitCode ?? 0,
        success: (exitCode ?? 0) === 0,
        stdoutBytes: Buffer.byteLength(stdout),
        stderrBytes: Buffer.byteLength(stderr)
      });
      if (exitCode !== 0 && !options.allowNonZeroExit) {
        const stderrPreview = stderr.trim();
        reject(
          new ProcessExecutionError(
            `Command exited with code ${String(exitCode)}: ${executable}${
              stderrPreview.length > 0
                ? `\nStderr:\n${stderrPreview.slice(0, 4000)}`
                : ""
            }`
          )
        );
        return;
      }
      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? 0
      });
    });
  });
}

export async function runCommandJson<T>(executable: string, args: ReadonlyArray<string>, options: SpawnOptions = {}, parser: (value: unknown) => T): Promise<T> {
  const result = await runCommand(executable, args, options);
  return parser(JSON.parse(result.stdout) as unknown);
}

export async function runCurl(args: ReadonlyArray<string>, options: SpawnOptions = {}): Promise<CommandResult> {
  const headerDir = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-curl-"));
  const headerPath = path.join(headerDir, "response-headers.txt");
  const requestUrl = extractCurlUrl(args);
  const curlArgs = [...args, "--dump-header", headerPath];
  const startedAt = Date.now();
  try {
    const result = await runCommand("curl", curlArgs, { ...options, allowNonZeroExit: true });
    const responseHeaders = await fs
      .readFile(headerPath, "utf8")
      .then((raw) => parseHeaderBlock(raw))
      .catch(() => ({} as Record<string, string>));
    const requestId = responseHeaders["x-request-id"] ?? responseHeaders["openai-request-id"];
    currentExecutionTelemetry()?.recordApiCall({
      provider: "curl",
      operation: "other-api",
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      attempt: 1,
      success: result.exitCode === 0,
      statusCode: result.exitCode,
      ...(requestId !== undefined ? { requestId } : {}),
      details: {
        url: requestUrl,
        responseHeaders
      }
    });
    return {
      ...result,
      responseHeaders,
      ...(requestUrl !== undefined ? { requestUrl } : {})
    };
  } finally {
    await fs.rm(headerDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function runCurlJson<T>(args: ReadonlyArray<string>, options: SpawnOptions = {}, parser: (value: unknown) => T): Promise<T> {
  const result = await runCurl(args, options);
  return parser(JSON.parse(result.stdout) as unknown);
}
