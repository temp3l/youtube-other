import fs from "node:fs/promises";
import path from "node:path";

import {
  ensureDir,
  readJsonIfExists,
  writeJsonAtomic,
} from "@mediaforge/shared";
import { z } from "zod";

import {
  creativeBriefSchema,
  DYNAMIC_GENRE_ARTIFACT_NAMES,
  dynamicGenreProfileSchema,
  dynamicGenreProvenanceSchema,
  resolvedProductionConfigSchema,
  type CreativeBrief,
  type DynamicGenreProfile,
  type DynamicGenreProvenance,
  type ResolvedProductionConfig,
} from "./contracts.js";
import { DynamicGenreError } from "./errors.js";
import { hashResolvedProductionConfig } from "./provenance.js";

const workflowLogSchema = z.strictObject({
  schemaVersion: z.literal("1.0"),
  status: z.literal("resolved"),
  cacheKey: z.string().regex(/^[a-f0-9]{64}$/u),
  analysisTimestamp: z.string().datetime(),
  fallbackApplied: z.boolean(),
  resolvedProductionConfigHash: z.string().regex(/^[a-f0-9]{64}$/u),
});
export interface PersistedDynamicGenreArtifacts {
  readonly creativeBrief: CreativeBrief;
  readonly dynamicProfile: DynamicGenreProfile;
  readonly resolvedProductionConfig: ResolvedProductionConfig;
  readonly provenance: DynamicGenreProvenance;
}
const writes = new Map<string, Promise<void>>();
const bundleSchema = z.strictObject({
  schemaVersion: z.literal("1.0"),
  creativeBrief: creativeBriefSchema,
  dynamicProfile: dynamicGenreProfileSchema,
  resolvedProductionConfig: resolvedProductionConfigSchema,
  provenance: dynamicGenreProvenanceSchema,
});

export interface LockedDynamicGenreArtifactStore {
  read(): Promise<PersistedDynamicGenreArtifacts | null>;
  persist(artifacts: PersistedDynamicGenreArtifacts): Promise<void>;
}

export class DynamicGenreArtifactStore {
  constructor(private readonly artifactDirectory: string) {}
  private artifactPath(name: string): string {
    return path.join(this.artifactDirectory, name);
  }

  read(): Promise<PersistedDynamicGenreArtifacts | null> {
    return this.withExclusiveLock((store) => store.read());
  }

  private async readUnlocked(): Promise<PersistedDynamicGenreArtifacts | null> {
    try {
      const bundle = await readJsonIfExists(
        this.artifactPath(DYNAMIC_GENRE_ARTIFACT_NAMES.bundle),
        (value) => bundleSchema.parse(value)
      );
      if (bundle !== null) {
        if (
          hashResolvedProductionConfig(bundle.resolvedProductionConfig) !==
          bundle.provenance.resolvedProductionConfigHash
        ) {
          throw new DynamicGenreError(
            "stale_profile",
            "Persisted dynamic genre bundle does not match its provenance."
          );
        }
        return bundle;
      }
      const provenance = await readJsonIfExists(
        this.artifactPath(DYNAMIC_GENRE_ARTIFACT_NAMES.provenance),
        (value) => dynamicGenreProvenanceSchema.parse(value)
      );
      if (provenance === null) return null;
      const [creativeBrief, dynamicProfile, resolvedProductionConfig] =
        await Promise.all([
          readJsonIfExists(
            this.artifactPath(DYNAMIC_GENRE_ARTIFACT_NAMES.creativeBrief),
            (value) => creativeBriefSchema.parse(value)
          ),
          readJsonIfExists(
            this.artifactPath(DYNAMIC_GENRE_ARTIFACT_NAMES.dynamicProfile),
            (value) => dynamicGenreProfileSchema.parse(value)
          ),
          readJsonIfExists(
            this.artifactPath(
              DYNAMIC_GENRE_ARTIFACT_NAMES.resolvedProductionConfig
            ),
            (value) => resolvedProductionConfigSchema.parse(value)
          ),
        ]);
      if (
        creativeBrief === null ||
        dynamicProfile === null ||
        resolvedProductionConfig === null
      )
        return null;
      if (
        hashResolvedProductionConfig(resolvedProductionConfig) !==
        provenance.resolvedProductionConfigHash
      ) {
        throw new DynamicGenreError(
          "stale_profile",
          "Persisted dynamic genre configuration does not match its provenance."
        );
      }
      return {
        creativeBrief,
        dynamicProfile,
        resolvedProductionConfig,
        provenance,
      };
    } catch (error) {
      if (error instanceof DynamicGenreError) throw error;
      throw new DynamicGenreError(
        "stale_profile",
        "Persisted dynamic genre artifacts are invalid or incomplete."
      );
    }
  }

  /** Writers are serialized per artifact directory; provenance is the final commit marker. */
  persist(artifacts: PersistedDynamicGenreArtifacts): Promise<void> {
    return this.withExclusiveLock((store) => store.persist(artifacts));
  }

  private persistUnlocked(
    artifacts: PersistedDynamicGenreArtifacts
  ): Promise<void> {
    const normalized: PersistedDynamicGenreArtifacts = {
      creativeBrief: creativeBriefSchema.parse(artifacts.creativeBrief),
      dynamicProfile: dynamicGenreProfileSchema.parse(artifacts.dynamicProfile),
      resolvedProductionConfig: resolvedProductionConfigSchema.parse(
        artifacts.resolvedProductionConfig
      ),
      provenance: dynamicGenreProvenanceSchema.parse(artifacts.provenance),
    };
    if (
      hashResolvedProductionConfig(normalized.resolvedProductionConfig) !==
      normalized.provenance.resolvedProductionConfigHash
    ) {
      return Promise.reject(
        new DynamicGenreError(
          "profile_persistence_conflict",
          "Refusing to persist configuration with mismatched provenance."
        )
      );
    }
    const previous = writes.get(this.artifactDirectory) ?? Promise.resolve();
    const write = previous
      .catch(() => undefined)
      .then(async () => {
        await writeJsonAtomic(
          this.artifactPath(DYNAMIC_GENRE_ARTIFACT_NAMES.creativeBrief),
          normalized.creativeBrief
        );
        await writeJsonAtomic(
          this.artifactPath(DYNAMIC_GENRE_ARTIFACT_NAMES.dynamicProfile),
          normalized.dynamicProfile
        );
        await writeJsonAtomic(
          this.artifactPath(
            DYNAMIC_GENRE_ARTIFACT_NAMES.resolvedProductionConfig
          ),
          normalized.resolvedProductionConfig
        );
        await writeJsonAtomic(
          this.artifactPath(DYNAMIC_GENRE_ARTIFACT_NAMES.workflowLog),
          workflowLogSchema.parse({
            schemaVersion: "1.0",
            status: "resolved",
            cacheKey: normalized.provenance.cacheKey,
            analysisTimestamp: normalized.provenance.analysisTimestamp,
            fallbackApplied: normalized.provenance.fallbackApplied,
            resolvedProductionConfigHash:
              normalized.provenance.resolvedProductionConfigHash,
          })
        );
        await writeJsonAtomic(
          this.artifactPath(DYNAMIC_GENRE_ARTIFACT_NAMES.provenance),
          normalized.provenance
        );
        // This single atomic document is the authoritative commit marker. The
        // individual files remain compatibility/discovery artifacts.
        await writeJsonAtomic(
          this.artifactPath(DYNAMIC_GENRE_ARTIFACT_NAMES.bundle),
          bundleSchema.parse({
            schemaVersion: "1.0",
            ...normalized,
          })
        );
      });
    writes.set(this.artifactDirectory, write);
    return write.finally(() => {
      if (writes.get(this.artifactDirectory) === write)
        writes.delete(this.artifactDirectory);
    });
  }

  async withExclusiveLock<T>(
    operation: (store: LockedDynamicGenreArtifactStore) => Promise<T>
  ): Promise<T> {
    await ensureDir(this.artifactDirectory);
    const lockPath = this.artifactPath("dynamic-genre.lock");
    let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
    for (let attempt = 0; attempt < 300; attempt += 1) {
      try {
        handle = await fs.open(lockPath, "wx");
        await handle.writeFile(
          JSON.stringify({
            pid: process.pid,
            acquiredAt: new Date().toISOString(),
          })
        );
        break;
      } catch (error) {
        const code =
          error && typeof error === "object"
            ? Reflect.get(error, "code")
            : undefined;
        if (code !== "EEXIST") throw error;
        const stat = await fs.stat(lockPath).catch(() => null);
        if (stat && Date.now() - stat.mtimeMs > 300_000) {
          await fs.unlink(lockPath).catch(() => undefined);
          continue;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    if (!handle) {
      throw new DynamicGenreError(
        "profile_persistence_conflict",
        "Timed out waiting for the dynamic genre profile lock.",
        true
      );
    }
    const locked: LockedDynamicGenreArtifactStore = {
      read: () => this.readUnlocked(),
      persist: (artifacts) => this.persistUnlocked(artifacts),
    };
    try {
      return await operation(locked);
    } finally {
      await handle.close().catch(() => undefined);
      await fs.unlink(lockPath).catch(() => undefined);
    }
  }
}
