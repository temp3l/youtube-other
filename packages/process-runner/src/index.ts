import { spawn } from "node:child_process";
import path from "node:path";
import { ProcessExecutionError } from "@mediaforge/domain";

export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export interface SpawnOptions {
  readonly cwd?: string;
  readonly env?: Record<string, string | undefined>;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly allowNonZeroExit?: boolean;
}

const allowlist = new Set(["curl", "ffmpeg", "ffprobe", "yt-dlp", "node", "whisper", "whisper-cli", "whisper.cpp"]);

export async function runCommand(executable: string, args: ReadonlyArray<string>, options: SpawnOptions = {}): Promise<CommandResult> {
  if (!allowlist.has(path.basename(executable))) {
    throw new ProcessExecutionError(`Executable is not allowlisted: ${executable}`);
  }
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
      if (exitCode !== 0 && !options.allowNonZeroExit) {
        reject(new ProcessExecutionError(`Command exited with code ${String(exitCode)}: ${executable}`));
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
  return runCommand("curl", args, { ...options, allowNonZeroExit: true });
}

export async function runCurlJson<T>(args: ReadonlyArray<string>, options: SpawnOptions = {}, parser: (value: unknown) => T): Promise<T> {
  const result = await runCurl(args, options);
  return parser(JSON.parse(result.stdout) as unknown);
}
