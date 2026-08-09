import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { stableJsonV33 } from "../history-research-v33.js";

export interface RelationProposalCacheKeyInputV36 {
  readonly episodeId: string;
  readonly orderedSupportClaimIds: readonly string[];
  readonly normalizedStructuredClaimContent: unknown;
  readonly resolvedParticipantBindings: unknown;
  readonly relationSchemaVersion: string;
  readonly promptVersion: string;
  readonly model: string;
  readonly providerIdentity: string;
}

export interface RelationProposalCacheRecordV36<T> {
  readonly cacheKey: string;
  readonly episodeId: string;
  readonly orderedSupportClaimIds: readonly string[];
  readonly normalizedClaimContentHash: string;
  readonly resolvedParticipantBindingsHash: string;
  readonly relationSchemaVersion: string;
  readonly promptVersion: string;
  readonly model: string;
  readonly providerIdentity: string;
  readonly output: T;
}

export interface RelationProposalCacheV36<T> {
  get(cacheKey: string): Promise<RelationProposalCacheRecordV36<T> | null>;
  set(record: RelationProposalCacheRecordV36<T>): Promise<void>;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function buildRelationProposalCacheRecordV36<T>(
  input: RelationProposalCacheKeyInputV36,
  output: T
): RelationProposalCacheRecordV36<T> {
  const normalizedClaimContentHash = sha256(stableJsonV33(input.normalizedStructuredClaimContent));
  const resolvedParticipantBindingsHash = sha256(stableJsonV33(input.resolvedParticipantBindings));
  const identity = {
    episodeId: input.episodeId,
    orderedSupportClaimIds: input.orderedSupportClaimIds,
    normalizedClaimContentHash,
    resolvedParticipantBindingsHash,
    relationSchemaVersion: input.relationSchemaVersion,
    promptVersion: input.promptVersion,
    model: input.model,
    providerIdentity: input.providerIdentity,
  };
  return { cacheKey: sha256(stableJsonV33(identity)), ...identity, output };
}

export function buildRelationProposalCacheKeyV36(
  input: RelationProposalCacheKeyInputV36
): string {
  return buildRelationProposalCacheRecordV36(input, null).cacheKey;
}

export class MemoryRelationProposalCacheV36<T> implements RelationProposalCacheV36<T> {
  readonly #records = new Map<string, RelationProposalCacheRecordV36<T>>();

  async get(cacheKey: string): Promise<RelationProposalCacheRecordV36<T> | null> {
    return this.#records.get(cacheKey) ?? null;
  }

  async set(record: RelationProposalCacheRecordV36<T>): Promise<void> {
    this.#records.set(record.cacheKey, record);
  }
}

/** One immutable semantic response per file; timestamps never affect identity. */
export class FileRelationProposalCacheV36<T> implements RelationProposalCacheV36<T> {
  constructor(private readonly root: string) {}

  async get(cacheKey: string): Promise<RelationProposalCacheRecordV36<T> | null> {
    try {
      return JSON.parse(await fs.readFile(path.join(this.root, `${cacheKey}.json`), "utf8")) as RelationProposalCacheRecordV36<T>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async set(record: RelationProposalCacheRecordV36<T>): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
    await fs.writeFile(path.join(this.root, `${record.cacheKey}.json`), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  }
}
