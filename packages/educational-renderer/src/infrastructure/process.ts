import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { RendererError } from "../errors.js";

export interface ProcessResult { readonly executable: string; readonly args: readonly string[]; readonly startedAt: string; readonly completedAt: string; readonly durationMs: number; readonly exitCode: number; readonly stdout: string; readonly stderr: string; readonly timedOut: boolean; readonly peakRssBytes?: number; }
export interface ProcessOptions { readonly timeoutMs?: number; readonly signal?: AbortSignal; readonly allowFailure?: boolean; readonly cwd?: string; readonly measureRss?: boolean; }
const MAX_CAPTURE = 64 * 1024;

/** Linux-only process-tree RSS sampler. It sums the active child and descendants, so FFmpeg wrapper children are included. */
export async function linuxProcessTreeRssBytes(rootPid: number, procRoot = "/proc"): Promise<number | undefined> {
  if (process.platform !== "linux") return undefined;
  try {
    const entries = await fs.readdir(procRoot, { withFileTypes: true });
    const parents = new Map<number, number[]>();
    for (const entry of entries) {
      if (!entry.isDirectory() || !/^\d+$/u.test(entry.name)) continue;
      const pid = Number(entry.name);
      const stat = await fs.readFile(path.join(procRoot, entry.name, "stat"), "utf8").catch(() => undefined);
      if (!stat) continue;
      const closing = stat.lastIndexOf(") "); const fields = closing < 0 ? [] : stat.slice(closing + 2).split(" ");
      const parent = Number(fields[1]); if (Number.isInteger(parent)) parents.set(parent, [...(parents.get(parent) ?? []), pid]);
    }
    const pids = [rootPid]; for (let index = 0; index < pids.length; index += 1) pids.push(...(parents.get(pids[index]!) ?? []));
    let total = 0;
    for (const pid of pids) {
      const status = await fs.readFile(path.join(procRoot, String(pid), "status"), "utf8").catch(() => undefined);
      const match = status?.match(/^VmRSS:\s+(\d+)\s+kB$/mu); if (match) total += Number(match[1]) * 1024;
    }
    return total;
  } catch { return undefined; }
}

export async function runProcess(executable: string, args: readonly string[], options: ProcessOptions = {}): Promise<ProcessResult> {
  if (options.signal?.aborted) throw new RendererError({ code: "PROCESS_INTERRUPTED", message: `Process interrupted: ${executable}` });
  const started = Date.now(); const startedAt = new Date(started).toISOString();
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: options.cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, TZ: "UTC", LC_ALL: "C" } });
    let stdout = ""; let stderr = ""; let timedOut = false; let interrupted = false; let settled = false; let killTimer: ReturnType<typeof setTimeout> | undefined; let peakRssBytes: number | undefined;
    const append = (current: string, chunk: Buffer): string => `${current}${chunk.toString("utf8")}`.slice(-MAX_CAPTURE);
    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); }); child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    const finishError = (error: RendererError): void => { if (!settled) { settled = true; reject(error); } };
    const timeout = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, options.timeoutMs ?? 600_000);
    const rssTimer = options.measureRss && child.pid ? setInterval(() => { void linuxProcessTreeRssBytes(child.pid!).then((bytes) => { if (bytes !== undefined) peakRssBytes = Math.max(peakRssBytes ?? 0, bytes); }); }, 25) : undefined;
    const abort = (): void => { interrupted = true; child.kill("SIGTERM"); killTimer = setTimeout(() => child.kill("SIGKILL"), 2_000); };
    options.signal?.addEventListener("abort", abort, { once: true });
    child.on("error", (cause) => { clearTimeout(timeout); if (rssTimer) clearInterval(rssTimer); finishError(new RendererError({ code: "MISSING_TOOL", message: `Unable to start ${executable}: ${cause.message}` }, { cause })); });
    child.on("close", (code) => {
      clearTimeout(timeout); if (rssTimer) clearInterval(rssTimer); if (killTimer) clearTimeout(killTimer); options.signal?.removeEventListener("abort", abort); if (settled) return;
      const completedAt = new Date().toISOString(); const result = { executable, args: [...args], startedAt, completedAt, durationMs: Date.now() - started, exitCode: code ?? -1, stdout, stderr, timedOut, ...(peakRssBytes === undefined ? {} : { peakRssBytes }) };
      if (interrupted) { finishError(new RendererError({ code: "PROCESS_INTERRUPTED", message: `Process interrupted: ${executable}` })); return; }
      if (timedOut) { finishError(new RendererError({ code: "PROCESS_TIMEOUT", message: `Process timed out: ${executable}` })); return; }
      if (result.exitCode !== 0 && !options.allowFailure) { const codeName = /ENOSPC|no space left on device/iu.test(stderr) ? "INSUFFICIENT_DISK_SPACE" : executable.includes("ffprobe") ? "FFPROBE_FAILED" : executable.includes("ffmpeg") ? "FFMPEG_FAILED" : "INTERNAL_ERROR"; finishError(new RendererError({ code: codeName, message: `${executable} exited ${result.exitCode}: ${stderr.slice(-2_000)}` })); return; }
      settled = true; resolve(result);
    });
  });
}
