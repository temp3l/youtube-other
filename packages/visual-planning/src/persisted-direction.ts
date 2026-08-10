import { hashText } from "@mediaforge/shared";

export const PERSISTED_VISUAL_DIRECTION_SCHEMA_V1 =
  "persisted-visual-direction.v1" as const;
export const PERSISTED_VISUAL_DIRECTION_RESOLVER_V1 =
  "persisted-visual-direction-resolver.v1.0.0" as const;

export type VisualDirectionOperation =
  | "episode"
  | "scene"
  | "render"
  | "locale";

export interface VisualDirectionScene {
  readonly sceneId: string;
  readonly entityIds?: readonly string[];
  readonly topics?: readonly string[];
}

export interface VisualDirectionReferenceCandidate {
  readonly referenceId: string;
  readonly entityId?: string;
  readonly sceneIds?: readonly string[];
  readonly topics?: readonly string[];
  readonly sourceContextIds?: readonly string[];
  readonly purpose: "identity" | "entity" | "scene" | "source-context";
  readonly provenanceId: string;
}

export interface PersistedVisualDirectionInput {
  readonly contentProfileId: string;
  readonly episodeId: string;
  readonly narrationRevisionId: string;
  readonly effectiveConfigurationHash: string;
  readonly dependencyIdentity: Readonly<Record<string, string>>;
  readonly timePeriod: { readonly label: string; readonly year?: number };
  readonly geography: readonly string[];
  readonly topics: readonly string[];
  readonly sourceContextIds: readonly string[];
  readonly genreVisualPolicy: string;
  readonly scenes: readonly VisualDirectionScene[];
  readonly referenceCandidates: readonly VisualDirectionReferenceCandidate[];
  /** Deliberately excluded from identity: visual direction is language independent. */
  readonly locale?: string;
  /** Deliberately excluded from identity: all operations resolve the same artifact. */
  readonly operation?: VisualDirectionOperation;
}

export interface PersistedVisualDirectionArtifact {
  readonly schemaVersion: typeof PERSISTED_VISUAL_DIRECTION_SCHEMA_V1;
  readonly resolverVersion: typeof PERSISTED_VISUAL_DIRECTION_RESOLVER_V1;
  readonly contentProfileId: string;
  readonly episodeId: string;
  readonly narrationRevisionId: string;
  readonly semanticFingerprint: string;
  readonly effectiveConfigurationHash: string;
  readonly dependencyIdentity: Readonly<Record<string, string>>;
  readonly cameraDirection: {
    readonly instruction: string;
    readonly rationale: string;
  };
  readonly attachedReferences: readonly (VisualDirectionReferenceCandidate & {
    readonly matchedBy: "entity" | "scene" | "topic" | "source-context";
  })[];
  readonly provenance: {
    readonly inputRevisionId: string;
    readonly effectiveConfigurationHash: string;
    readonly dependencyIdentity: Readonly<Record<string, string>>;
    readonly generatedBy: typeof PERSISTED_VISUAL_DIRECTION_RESOLVER_V1;
  };
}

export interface PersistedVisualDirectionStore {
  load(semanticFingerprint: string): Promise<PersistedVisualDirectionArtifact | null>;
  save(artifact: PersistedVisualDirectionArtifact): Promise<void>;
}

export interface PersistedVisualDirectionResolution {
  readonly artifact: PersistedVisualDirectionArtifact;
  readonly reused: boolean;
  readonly rationale: "cache-compatible" | "new-semantic-input";
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Maps legacy profile spelling before any durable identity is constructed. */
export function canonicalVisualDirectionProfileId(value: string): string {
  const normalized = value.trim().toLocaleLowerCase();
  return normalized === "strategic-reinvention" ||
    normalized === "veronica-benini" ||
    normalized === "veronicabenini"
    ? "veronicabenini"
    : normalized;
}

function sorted(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

export function buildPersistedVisualDirectionFingerprint(
  input: PersistedVisualDirectionInput,
): string {
  return hashText(stable({
    schemaVersion: PERSISTED_VISUAL_DIRECTION_SCHEMA_V1,
    resolverVersion: PERSISTED_VISUAL_DIRECTION_RESOLVER_V1,
    contentProfileId: canonicalVisualDirectionProfileId(input.contentProfileId),
    episodeId: input.episodeId,
    narrationRevisionId: input.narrationRevisionId,
    effectiveConfigurationHash: input.effectiveConfigurationHash,
    dependencyIdentity: input.dependencyIdentity,
    timePeriod: input.timePeriod,
    geography: sorted(input.geography),
    topics: sorted(input.topics),
    sourceContextIds: sorted(input.sourceContextIds),
    genreVisualPolicy: input.genreVisualPolicy,
    scenes: input.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      entityIds: sorted(scene.entityIds ?? []),
      topics: sorted(scene.topics ?? []),
    })).sort((left, right) => left.sceneId.localeCompare(right.sceneId)),
    referenceCandidates: input.referenceCandidates.map((candidate) => ({
      referenceId: candidate.referenceId,
      entityId: candidate.entityId ?? null,
      sceneIds: sorted(candidate.sceneIds ?? []),
      topics: sorted(candidate.topics ?? []),
      sourceContextIds: sorted(candidate.sourceContextIds ?? []),
      purpose: candidate.purpose,
      provenanceId: candidate.provenanceId,
    })).sort((left, right) => left.referenceId.localeCompare(right.referenceId)),
  }));
}

function overlaps(left: readonly string[], right: readonly string[]): boolean {
  const values = new Set(left);
  return right.some((value) => values.has(value));
}

export function selectRelevantVisualDirectionReferences(
  input: Pick<PersistedVisualDirectionInput, "scenes" | "topics" | "sourceContextIds" | "referenceCandidates">,
): PersistedVisualDirectionArtifact["attachedReferences"] {
  const sceneIds = input.scenes.map((scene) => scene.sceneId);
  const entityIds = input.scenes.flatMap((scene) => scene.entityIds ?? []);
  const topics = [...input.topics, ...input.scenes.flatMap((scene) => scene.topics ?? [])];
  return input.referenceCandidates
    .map((candidate) => {
      const matchedBy = candidate.entityId && entityIds.includes(candidate.entityId)
        ? "entity" as const
        : overlaps(candidate.sceneIds ?? [], sceneIds)
          ? "scene" as const
          : overlaps(candidate.topics ?? [], topics)
            ? "topic" as const
            : overlaps(candidate.sourceContextIds ?? [], input.sourceContextIds)
              ? "source-context" as const
              : null;
      return matchedBy ? { ...candidate, matchedBy } : null;
    })
    .filter((candidate): candidate is PersistedVisualDirectionArtifact["attachedReferences"][number] => candidate !== null)
    .sort((left, right) => left.referenceId.localeCompare(right.referenceId));
}

export function derivePersistedVisualDirection(
  input: PersistedVisualDirectionInput,
): PersistedVisualDirectionArtifact {
  const contentProfileId = canonicalVisualDirectionProfileId(input.contentProfileId);
  const semanticFingerprint = buildPersistedVisualDirectionFingerprint(input);
  const period = input.timePeriod.year === undefined
    ? input.timePeriod.label
    : `${input.timePeriod.label} (${input.timePeriod.year})`;
  const geography = sorted(input.geography).join(", ") || "the stated geography";
  const topics = sorted(input.topics).join(", ") || "the episode topic";
  const sourceContext = sorted(input.sourceContextIds).join(", ") || "the approved source context";
  return {
    schemaVersion: PERSISTED_VISUAL_DIRECTION_SCHEMA_V1,
    resolverVersion: PERSISTED_VISUAL_DIRECTION_RESOLVER_V1,
    contentProfileId,
    episodeId: input.episodeId,
    narrationRevisionId: input.narrationRevisionId,
    semanticFingerprint,
    effectiveConfigurationHash: input.effectiveConfigurationHash,
    dependencyIdentity: { ...input.dependencyIdentity },
    cameraDirection: {
      instruction: `${input.genreVisualPolicy}; frame ${topics} in ${geography} with a ${period} context, grounded in ${sourceContext}.`,
      rationale: `Derived from period, geography, topic, source context, and genre visual policy for ${contentProfileId}.`,
    },
    attachedReferences: selectRelevantVisualDirectionReferences(input),
    provenance: {
      inputRevisionId: input.narrationRevisionId,
      effectiveConfigurationHash: input.effectiveConfigurationHash,
      dependencyIdentity: { ...input.dependencyIdentity },
      generatedBy: PERSISTED_VISUAL_DIRECTION_RESOLVER_V1,
    },
  };
}

export async function resolvePersistedVisualDirection(input: {
  readonly direction: PersistedVisualDirectionInput;
  readonly store: PersistedVisualDirectionStore;
}): Promise<PersistedVisualDirectionResolution> {
  const semanticFingerprint = buildPersistedVisualDirectionFingerprint(input.direction);
  const existing = await input.store.load(semanticFingerprint);
  if (existing && existing.semanticFingerprint === semanticFingerprint && existing.schemaVersion === PERSISTED_VISUAL_DIRECTION_SCHEMA_V1 && existing.resolverVersion === PERSISTED_VISUAL_DIRECTION_RESOLVER_V1) {
    return { artifact: existing, reused: true, rationale: "cache-compatible" };
  }
  const artifact = derivePersistedVisualDirection(input.direction);
  await input.store.save(artifact);
  return { artifact, reused: false, rationale: "new-semantic-input" };
}

export function createInMemoryPersistedVisualDirectionStore(): PersistedVisualDirectionStore {
  const artifacts = new Map<string, PersistedVisualDirectionArtifact>();
  return {
    async load(semanticFingerprint) {
      return artifacts.get(semanticFingerprint) ?? null;
    },
    async save(artifact) {
      artifacts.set(artifact.semanticFingerprint, artifact);
    },
  };
}
