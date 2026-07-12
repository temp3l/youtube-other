import { spawn } from "node:child_process";
import { RendererError } from "../errors.js";

export interface ProcessResult { readonly executable: string; readonly args: readonly string[]; readonly startedAt: string; readonly completedAt: string; readonly durationMs: number; readonly exitCode: number; readonly stdout: string; readonly stderr: string; readonly timedOut: boolean; }
export interface ProcessOptions { readonly timeoutMs?: number; readonly signal?: AbortSignal; readonly allowFailure?: boolean; readonly cwd?: string; }
const MAX_CAPTURE = 64 * 1024;
export async function runProcess(executable: string, args: readonly string[], options: ProcessOptions = {}): Promise<ProcessResult> {
  const started = Date.now(); const startedAt = new Date(started).toISOString();
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: options.cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, TZ: "UTC", LC_ALL: "C" } });
    let stdout = ""; let stderr = ""; let timedOut = false; let settled = false;
    const append = (current: string, chunk: Buffer): string => `${current}${chunk.toString("utf8")}`.slice(-MAX_CAPTURE);
    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); }); child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    const finishError = (error: RendererError): void => { if (!settled) { settled = true; reject(error); } };
    const timeout = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, options.timeoutMs ?? 600_000);
    const abort = (): void => { child.kill("SIGTERM"); finishError(new RendererError({ code: "PROCESS_INTERRUPTED", message: `Process interrupted: ${executable}` })); };
    options.signal?.addEventListener("abort", abort, { once: true });
    child.on("error", (cause) => { clearTimeout(timeout); finishError(new RendererError({ code: "MISSING_TOOL", message: `Unable to start ${executable}: ${cause.message}` }, { cause })); });
    child.on("close", (code) => {
      clearTimeout(timeout); options.signal?.removeEventListener("abort", abort); if (settled) return;
      const completedAt = new Date().toISOString(); const result = { executable, args: [...args], startedAt, completedAt, durationMs: Date.now() - started, exitCode: code ?? -1, stdout, stderr, timedOut };
      if (timedOut) { finishError(new RendererError({ code: "PROCESS_TIMEOUT", message: `Process timed out: ${executable}` })); return; }
      if (result.exitCode !== 0 && !options.allowFailure) { const codeName = executable.includes("ffprobe") ? "FFPROBE_FAILED" : executable.includes("ffmpeg") ? "FFMPEG_FAILED" : "INTERNAL_ERROR"; finishError(new RendererError({ code: codeName, message: `${executable} exited ${result.exitCode}: ${stderr.slice(-2_000)}` })); return; }
      settled = true; resolve(result);
    });
  });
}
