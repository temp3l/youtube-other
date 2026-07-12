import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { CacheInspectionResult, CacheStatus, CleanCacheRequest, CleanCacheResult, InspectCacheRequest } from "../contracts.js";
import { fileSize, hashFile, pathExists, writeJsonAtomic } from "../infrastructure/files.js";

const manifestSchema = z.strictObject({ version: z.literal("1"), cacheKey: z.string(), sceneId: z.string(), sha256: z.string(), bytes: z.number().int().nonnegative(), createdAt: z.string(), renderer: z.string(), representation: z.literal("static-segment") });
export type SceneCacheManifest = z.infer<typeof manifestSchema>;
export interface CacheLookup { readonly status: CacheStatus; readonly videoPath: string; readonly manifest?: SceneCacheManifest; readonly reason: string; }

export class SceneCache {
  public constructor(private readonly root: string) {}
  private directory(key: string): string { return path.join(this.root, "scenes", key.slice(0, 2), key); }
  public paths(key: string): { directory: string; video: string; manifest: string; lock: string } { const directory = this.directory(key); return { directory, video: path.join(directory, "scene.mp4"), manifest: path.join(directory, "manifest.json"), lock: path.join(directory, ".lock") }; }
  public async lookup(key: string): Promise<CacheLookup> {
    const paths = this.paths(key); if (!(await pathExists(paths.manifest))) return { status: "miss", videoPath: paths.video, reason: "manifest-missing" };
    let manifest: SceneCacheManifest; try { manifest = manifestSchema.parse(JSON.parse(await fs.readFile(paths.manifest, "utf8"))); } catch { return { status: "corrupt", videoPath: paths.video, reason: "manifest-invalid" }; }
    if (manifest.cacheKey !== key || !(await pathExists(paths.video))) return { status: "stale", videoPath: paths.video, manifest, reason: "output-missing" };
    if (await hashFile(paths.video) !== manifest.sha256) return { status: "corrupt", videoPath: paths.video, manifest, reason: "hash-mismatch" };
    return { status: "hit", videoPath: paths.video, manifest, reason: "verified" };
  }
  public async acquire(key: string): Promise<() => Promise<void>> {
    const { directory, lock } = this.paths(key); await fs.mkdir(directory, { recursive: true });
    const attempt = async (): Promise<fs.FileHandle> => fs.open(lock, "wx");
    let handle: fs.FileHandle; try { handle = await attempt(); } catch (error) {
      const age = await fs.stat(lock).then((stat) => Date.now() - stat.mtimeMs, () => 0); if (age <= 5 * 60_000) throw error;
      await fs.rm(lock, { force: true }); handle = await attempt();
    }
    await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })); await handle.close();
    return async () => fs.rm(lock, { force: true });
  }
  public async promote(key: string, temporaryVideo: string, sceneId: string, sha256: string, bytes: number): Promise<SceneCacheManifest> {
    const paths = this.paths(key); await fs.mkdir(paths.directory, { recursive: true }); await fs.rm(paths.video, { force: true }); await fs.rename(temporaryVideo, paths.video);
    const manifest = { version: "1", cacheKey: key, sceneId, sha256, bytes, createdAt: new Date().toISOString(), renderer: "svg-static.v1", representation: "static-segment" } as const; await writeJsonAtomic(paths.manifest, manifest); return manifest;
  }
  public async inspect(request: InspectCacheRequest = {}): Promise<CacheInspectionResult> {
    const sceneRoot = path.join(this.root, "scenes"); const manifests: string[] = [];
    const walk = async (dir: string): Promise<void> => { for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) { const item = path.join(dir, entry.name); if (entry.isDirectory()) await walk(item); else if (entry.name === "manifest.json") manifests.push(item); } }; await walk(sceneRoot);
    const entries = []; for (const manifestPath of manifests) { let raw: SceneCacheManifest | undefined; try { raw = manifestSchema.parse(JSON.parse(await fs.readFile(manifestPath, "utf8"))); } catch { /* classified below */ }
      const key = raw?.cacheKey ?? path.basename(path.dirname(manifestPath)); if (request.cacheKey && request.cacheKey !== key) continue; const lookup = await this.lookup(key); const bytes = lookup.manifest?.bytes ?? await fileSize(lookup.videoPath).catch(() => 0); entries.push({ cacheKey: key, status: lookup.status, bytes, ...(lookup.manifest ? { sceneId: lookup.manifest.sceneId } : {}) }); }
    return { resultVersion: "1", entries, totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0) };
  }
  public async clean(request: CleanCacheRequest = {}): Promise<CleanCacheResult> {
    const inspection = await this.inspect(request.cacheKey ? { cacheKey: request.cacheKey } : {}); let removedBytes = 0; let removedEntries = 0;
    for (const entry of inspection.entries) { if (request.corruptOnly && entry.status !== "corrupt" && entry.status !== "stale") continue; await fs.rm(this.directory(entry.cacheKey), { recursive: true, force: true }); removedBytes += entry.bytes; removedEntries += 1; }
    return { resultVersion: "1", removedEntries, removedBytes };
  }
}
