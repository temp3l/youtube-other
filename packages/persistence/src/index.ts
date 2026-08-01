import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  episodeManifestSchema,
  type EpisodeManifest,
} from "@mediaforge/domain";
import { ensureDir, writeJsonAtomic } from "@mediaforge/shared";

export * from "./relational-workflow-state.js";
export * from "./postgres-workflow-repository.js";
export * from "./postgres-webhook-repository.js";
export * from "./postgres-usage-audit-repository.js";
export * from "./postgres-principal-directory.js";
export * from "./postgres-pilot-api-key-repository.js";
export * from "./asset-payload-validation.js";
export * from "./tenant-object-storage.js";

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
