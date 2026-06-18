import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  episodeManifestSchema,
  type EpisodeManifest,
  pipelineRunSchema,
  type PipelineRun,
  pipelineStepRunSchema,
  type PipelineStepRun
} from "@mediaforge/domain";
import { ensureDir, writeJsonAtomic } from "@mediaforge/shared";

export interface PersistenceConfig {
  readonly dbPath: string;
}

export class SQLitePersistence {
  public readonly database: DatabaseSync;

  public constructor(public readonly config: PersistenceConfig) {
    this.database = new DatabaseSync(config.dbPath);
  }

  public migrate(): void {
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS episodes (
        episode_id TEXT PRIMARY KEY,
        manifest_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pipeline_runs (
        pipeline_run_id TEXT PRIMARY KEY,
        episode_id TEXT NOT NULL,
        run_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS step_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pipeline_run_id TEXT NOT NULL,
        episode_id TEXT NOT NULL,
        step_name TEXT NOT NULL,
        cache_key TEXT NOT NULL,
        step_run_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_step_runs_episode_step ON step_runs(episode_id, step_name);
    `);
  }

  public saveEpisodeManifest(manifest: EpisodeManifest): void {
    const validated = episodeManifestSchema.parse(manifest);
    const now = new Date().toISOString();
    const statement = this.database.prepare(
      `INSERT INTO episodes (episode_id, manifest_json, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(episode_id) DO UPDATE SET manifest_json = excluded.manifest_json, updated_at = excluded.updated_at`
    );
    statement.run(validated.episodeId, JSON.stringify(validated), validated.createdAt ?? now, now);
  }

  public loadEpisodeManifest(episodeId: string): EpisodeManifest | null {
    const row = this.database.prepare("SELECT manifest_json FROM episodes WHERE episode_id = ?").get(episodeId) as
      | { manifest_json: string }
      | undefined;
    if (!row) {
      return null;
    }
    return episodeManifestSchema.parse(JSON.parse(row.manifest_json) as unknown);
  }

  public savePipelineRun(run: PipelineRun): void {
    const validated = pipelineRunSchema.parse(run);
    const statement = this.database.prepare(
      `INSERT INTO pipeline_runs (pipeline_run_id, episode_id, run_json, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(pipeline_run_id) DO UPDATE SET run_json = excluded.run_json`
    );
    statement.run(validated.id, validated.episodeId, JSON.stringify(validated), validated.startedAt);
  }

  public loadPipelineRun(pipelineRunId: string): PipelineRun | null {
    const row = this.database.prepare("SELECT run_json FROM pipeline_runs WHERE pipeline_run_id = ?").get(pipelineRunId) as
      | { run_json: string }
      | undefined;
    if (!row) {
      return null;
    }
    return pipelineRunSchema.parse(JSON.parse(row.run_json) as unknown);
  }

  public saveStepRun(pipelineRunId: string, episodeId: string, stepRun: PipelineStepRun): void {
    const validated = pipelineStepRunSchema.parse(stepRun);
    const statement = this.database.prepare(
      `INSERT INTO step_runs (pipeline_run_id, episode_id, step_name, cache_key, step_run_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    statement.run(pipelineRunId, episodeId, validated.name, validated.cacheKey, JSON.stringify(validated), validated.startedAt);
  }

  public listStepRuns(episodeId: string): PipelineStepRun[] {
    const rows = this.database
      .prepare("SELECT step_run_json FROM step_runs WHERE episode_id = ? ORDER BY id ASC")
      .all(episodeId) as Array<{ step_run_json: string }>;
    return rows.map((row) => pipelineStepRunSchema.parse(JSON.parse(row.step_run_json) as unknown));
  }

  public async exportEpisodeManifestToFile(episodeDir: string, manifest: EpisodeManifest): Promise<void> {
    await ensureDir(episodeDir);
    await writeJsonAtomic(path.join(episodeDir, "manifest.json"), manifest);
  }
}

export function createPersistence(dbPath: string): SQLitePersistence {
  return new SQLitePersistence({ dbPath });
}

export async function ensureDatabaseFile(dbPath: string): Promise<void> {
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  await fs.writeFile(dbPath, await fs.readFile(dbPath).catch(() => Buffer.from(""))).catch(() => undefined);
}

