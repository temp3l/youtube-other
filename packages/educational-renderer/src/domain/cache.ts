import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { CacheInspectionResult, CacheStatus, CleanCacheResult } from "../contracts.js";
import { RendererError } from "../errors.js";
import { assertSafeMutationTarget, copyFileAtomic, createWritableRoot, ensureSafeDirectory, fileSize, hashFile, pathExists, removeSafe, writeAtomic, writeJsonAtomic } from "../infrastructure/files.js";

const CACHE_RENDERER = "svg-static.v3";
const LOCK_STALE_MS = 5 * 60_000;
export const cacheKeySchema = z.string().regex(/^[a-f0-9]{64}$/u, "Cache key must be a lowercase SHA-256 hash");
const manifestSchema = z.strictObject({ version: z.literal("1"), cacheKey: cacheKeySchema, sceneId: z.string(), sha256: cacheKeySchema, bytes: z.number().int().nonnegative(), createdAt: z.iso.datetime(), renderer: z.literal(CACHE_RENDERER), representation: z.literal("static-segment") });
const lockSchema = z.strictObject({ version: z.literal("1"), pid: z.number().int().positive(), token: z.uuid(), createdAt: z.iso.datetime() });
export type SceneCacheManifest = z.infer<typeof manifestSchema>;
export interface CacheLookup { readonly status: CacheStatus; readonly videoPath: string; readonly manifest?: SceneCacheManifest; readonly reason: string; }
interface InspectOptions { readonly cacheKey?: string; }
interface CleanOptions extends InspectOptions { readonly corruptOnly?: boolean; }
export type PromotionStep = "staging-created" | "video-staged" | "manifest-staged" | "previous-snapshotted" | "commit-started" | "video-installed" | "manifest-installed";
export interface SceneCacheTestHooks { readonly promotionStep?: (step: PromotionStep) => void | Promise<void>; readonly leaveInterruptedTransaction?: boolean; readonly processIsAlive?: (pid: number) => boolean; readonly now?: () => number; }

interface CachePaths { readonly directory: string; readonly video: string; readonly manifest: string; readonly lock: string; readonly transaction: string; readonly stagedVideo: string; readonly stagedManifest: string; readonly previousVideo: string; readonly previousManifest: string; readonly previousReady: string; readonly commitStarted: string; }

function isNoSpace(error: unknown): boolean { return error instanceof Error && "code" in error && error.code === "ENOSPC"; }
function diskError(error: unknown): never { if (isNoSpace(error)) throw new RendererError({ code: "INSUFFICIENT_DISK_SPACE", message: error instanceof Error ? error.message : "Insufficient disk space." }, { cause: error }); throw error; }

export class SceneCache {
  public constructor(private readonly root: string, private readonly hooks: SceneCacheTestHooks = {}) {}
  private key(value: string): string { const result = cacheKeySchema.safeParse(value); if (!result.success) throw new RendererError({ code: "INVALID_REQUEST", message: "Invalid cache key." }); return result.data; }
  private directory(keyInput: string): string { const key = this.key(keyInput); return path.join(this.root, "scenes", key.slice(0, 2), key); }
  public paths(key: string): CachePaths { const directory = this.directory(key); const transaction = path.join(directory, ".promotion"); return { directory, video: path.join(directory, "scene.mp4"), manifest: path.join(directory, "manifest.json"), lock: path.join(directory, ".lock"), transaction, stagedVideo: path.join(transaction, "next.scene.mp4"), stagedManifest: path.join(transaction, "next.manifest.json"), previousVideo: path.join(transaction, "previous.scene.mp4"), previousManifest: path.join(transaction, "previous.manifest.json"), previousReady: path.join(transaction, "previous.ready"), commitStarted: path.join(transaction, "commit.started") }; }
  private async mutation(filePath: string): Promise<string> { await createWritableRoot(this.root); return assertSafeMutationTarget(this.root, filePath); }
  private async pair(key: string, video: string, manifestPath: string): Promise<SceneCacheManifest | undefined> {
    await this.mutation(path.dirname(video));
    let manifest: SceneCacheManifest; try { manifest = manifestSchema.parse(JSON.parse(await fs.readFile(manifestPath, "utf8"))); } catch { return undefined; }
    if (manifest.cacheKey !== key) return undefined;
    const stat = await fs.lstat(video).catch(() => undefined); if (!stat?.isFile() || stat.isSymbolicLink() || stat.size !== manifest.bytes) return undefined;
    if (await hashFile(video).catch(() => "") !== manifest.sha256) return undefined;
    return manifest;
  }
  private async removeTransaction(paths: CachePaths): Promise<void> { if (!(await pathExists(paths.transaction))) return; await this.mutation(paths.transaction); await removeSafe(this.root, paths.transaction, true); }
  private async restorePrevious(key: string, paths: CachePaths): Promise<SceneCacheManifest | undefined> {
    if (!(await pathExists(paths.previousReady))) return undefined; const previous = await this.pair(key, paths.previousVideo, paths.previousManifest); if (!previous) return undefined;
    await copyFileAtomic(this.root, paths.previousVideo, paths.video); await copyFileAtomic(this.root, paths.previousManifest, paths.manifest); return this.pair(key, paths.video, paths.manifest);
  }
  private async recover(key: string, paths: CachePaths): Promise<"clean" | "recovered" | "corrupt"> {
    if (!(await pathExists(paths.transaction))) return "clean";
    const transactionStat = await fs.lstat(paths.transaction).catch(() => undefined); if (!transactionStat?.isDirectory() || transactionStat.isSymbolicLink()) return "corrupt";
    const current = await this.pair(key, paths.video, paths.manifest); if (current) { await this.removeTransaction(paths); return "clean"; }
    const previous = await this.restorePrevious(key, paths); if (previous) { await this.removeTransaction(paths); return "recovered"; }
    for (const target of [paths.video, paths.manifest]) { await this.mutation(target); await removeSafe(this.root, target); }
    await this.removeTransaction(paths); return "corrupt";
  }
  public async lookup(keyInput: string): Promise<CacheLookup> {
    const key = this.key(keyInput); const paths = this.paths(key); await this.mutation(paths.directory); if (await pathExists(paths.transaction) && (await this.lockState(paths.lock)).live) return { status: "stale", videoPath: paths.video, reason: "promotion-in-progress" }; const recovery = await this.recover(key, paths); if (recovery === "corrupt") return { status: "corrupt", videoPath: paths.video, reason: "interrupted-promotion" };
    if (!(await pathExists(paths.manifest))) return { status: "miss", videoPath: paths.video, reason: "manifest-missing" };
    let raw: unknown; try { raw = JSON.parse(await fs.readFile(paths.manifest, "utf8")); } catch { return { status: "corrupt", videoPath: paths.video, reason: "manifest-invalid" }; }
    const parsed = manifestSchema.safeParse(raw); if (!parsed.success) return { status: "corrupt", videoPath: paths.video, reason: "manifest-invalid" };
    const manifest = await this.pair(key, paths.video, paths.manifest); if (!manifest) return { status: "corrupt", videoPath: paths.video, manifest: parsed.data, reason: "pair-invalid" };
    return { status: "hit", videoPath: paths.video, manifest, reason: recovery === "recovered" ? "recovered-previous" : "verified" };
  }
  public async acquire(keyInput: string): Promise<() => Promise<void>> {
    const key = this.key(keyInput); const { directory, lock } = this.paths(key); await this.mutation(directory); await ensureSafeDirectory(this.root, directory); await this.mutation(lock);
    const attempt = async (): Promise<fs.FileHandle> => fs.open(lock, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW, 0o600); let handle: fs.FileHandle;
    try { handle = await attempt(); } catch (error) { const state = await this.lockState(lock); if (state.live || state.ageMs <= LOCK_STALE_MS) throw new RendererError({ code: "LOCK_ACQUISITION_FAILED", message: `Scene cache entry is locked: ${key}` }, { cause: error }); await this.mutation(lock); await removeSafe(this.root, lock); handle = await attempt(); }
    const token = randomUUID(); await handle.writeFile(JSON.stringify({ version: "1", pid: process.pid, token, createdAt: new Date(this.now()).toISOString() })); await handle.close();
    return async () => { const parsed = lockSchema.safeParse(await fs.readFile(lock, "utf8").then((value) => JSON.parse(value) as unknown, () => undefined)); if (parsed.success && parsed.data.token === token) { await this.mutation(lock); await removeSafe(this.root, lock); } };
  }
  public async promote(keyInput: string, temporaryVideo: string, sceneId: string, sha256: string, bytes: number): Promise<SceneCacheManifest> {
    const key = this.key(keyInput); const paths = this.paths(key); const manifest = manifestSchema.parse({ version: "1", cacheKey: key, sceneId, sha256, bytes, createdAt: new Date(this.now()).toISOString(), renderer: CACHE_RENDERER, representation: "static-segment" });
    try {
      await this.mutation(paths.directory); await ensureSafeDirectory(this.root, paths.directory); await this.recover(key, paths); await this.mutation(paths.transaction); await fs.mkdir(paths.transaction); await this.mutation(paths.transaction); await this.step("staging-created");
      await copyFileAtomic(this.root, temporaryVideo, paths.stagedVideo); await this.step("video-staged");
      await writeJsonAtomic(this.root, paths.stagedManifest, manifest); if (!(await this.pair(key, paths.stagedVideo, paths.stagedManifest))) throw new RendererError({ code: "CACHE_CORRUPTED", message: `Staged cache pair failed verification: ${key}` }); await this.step("manifest-staged");
      const current = await this.pair(key, paths.video, paths.manifest); if (current) { await copyFileAtomic(this.root, paths.video, paths.previousVideo); await copyFileAtomic(this.root, paths.manifest, paths.previousManifest); if (!(await this.pair(key, paths.previousVideo, paths.previousManifest))) throw new RendererError({ code: "CACHE_CORRUPTED", message: `Prior cache pair snapshot failed: ${key}` }); await writeAtomic(this.root, paths.previousReady, "ready\n"); }
      await this.step("previous-snapshotted"); await writeAtomic(this.root, paths.commitStarted, "commit\n"); await this.step("commit-started");
      await copyFileAtomic(this.root, paths.stagedVideo, paths.video); await this.step("video-installed");
      await copyFileAtomic(this.root, paths.stagedManifest, paths.manifest); await this.step("manifest-installed");
      const installed = await this.pair(key, paths.video, paths.manifest); if (!installed) throw new RendererError({ code: "CACHE_CORRUPTED", message: `Installed cache pair failed verification: ${key}` }); await this.removeTransaction(paths); return installed;
    } catch (error) { if (!this.hooks.leaveInterruptedTransaction) await this.recover(key, paths).catch(() => undefined); diskError(error); }
  }
  public async inspect(request: InspectOptions = {}): Promise<CacheInspectionResult> {
    const filter = request.cacheKey === undefined ? undefined : this.key(request.cacheKey); const discovered = await this.discover(); const entries = [];
    for (const item of discovered) { if (filter && filter !== item.key) continue; if (item.layoutInvalid) { entries.push({ cacheKey: item.key, status: "corrupt" as const, bytes: 0 }); continue; } const lookup = await this.lookup(item.key); const bytes = lookup.manifest?.bytes ?? await fileSize(lookup.videoPath).catch(() => 0); entries.push({ cacheKey: item.key, status: lookup.status, bytes, ...(lookup.manifest ? { sceneId: lookup.manifest.sceneId } : {}) }); }
    return { resultVersion: "1", entries, totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0) };
  }
  public async clean(request: CleanOptions = {}): Promise<CleanCacheResult> {
    const filter = request.cacheKey === undefined ? undefined : this.key(request.cacheKey); const inspection = await this.inspect(filter ? { cacheKey: filter } : {}); const discovered = await this.discover(); let removedBytes = 0; let removedEntries = 0;
    for (const item of discovered) { if (filter && item.key !== filter) continue; const entry = inspection.entries.find((candidate) => candidate.cacheKey === item.key); if (!entry || (request.corruptOnly && entry.status !== "corrupt" && entry.status !== "stale")) continue; if ((await this.lockState(path.join(item.directory, ".lock"))).live) continue; await this.mutation(item.directory); await removeSafe(this.root, item.directory, true); removedBytes += entry.bytes; removedEntries += 1; }
    return { resultVersion: "1", removedEntries, removedBytes };
  }
  private async discover(): Promise<Array<{ key: string; directory: string; layoutInvalid: boolean }>> {
    const sceneRoot = path.join(this.root, "scenes"); const found: Array<{ key: string; directory: string; layoutInvalid: boolean }> = [];
    for (const prefix of await fs.readdir(sceneRoot, { withFileTypes: true }).catch(() => [])) { if (!prefix.isDirectory() || prefix.isSymbolicLink()) continue; const prefixPath = path.join(sceneRoot, prefix.name); for (const entry of await fs.readdir(prefixPath, { withFileTypes: true }).catch(() => [])) { if (!entry.isDirectory() || entry.isSymbolicLink()) continue; const directory = path.join(prefixPath, entry.name); const parsed = cacheKeySchema.safeParse(entry.name); found.push({ key: parsed.success ? parsed.data : entry.name, directory, layoutInvalid: !parsed.success || prefix.name !== entry.name.slice(0, 2) }); } }
    return found;
  }
  private now(): number { return this.hooks.now?.() ?? Date.now(); }
  private async step(step: PromotionStep): Promise<void> { await this.hooks.promotionStep?.(step); }
  private async lockState(lock: string): Promise<{ live: boolean; ageMs: number }> {
    const stat = await fs.stat(lock).catch(() => undefined); if (!stat) return { live: false, ageMs: 0 }; const value = await fs.readFile(lock, "utf8").then((raw) => JSON.parse(raw) as unknown, () => undefined); const parsed = lockSchema.safeParse(value); if (!parsed.success) return { live: false, ageMs: Math.max(0, this.now() - stat.mtimeMs) };
    const createdAge = Math.max(0, this.now() - Date.parse(parsed.data.createdAt)); const ageMs = Math.min(Math.max(0, this.now() - stat.mtimeMs), createdAge); let live: boolean; if (this.hooks.processIsAlive) live = this.hooks.processIsAlive(parsed.data.pid); else { try { process.kill(parsed.data.pid, 0); live = true; } catch (error) { live = error instanceof Error && "code" in error && error.code === "EPERM"; } } return { live, ageMs };
  }
}
