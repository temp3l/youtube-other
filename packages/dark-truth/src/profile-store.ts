import fs from "node:fs/promises";
import path from "node:path";

import { fileExists, hashFile, writeJsonAtomic } from "@mediaforge/shared";
import sharp from "sharp";

import {
  darkTruthReferenceOverrideSchema,
  diffStoryBibles,
  hashDarkTruthContract,
  referenceImageManifestSchema,
  storyBibleManifestSchema,
  type DarkTruthReferenceOverride,
  type ReferenceImageManifest,
  type StoryBibleDiff,
  type StoryBibleManifest,
} from "./profile-contracts.js";
import { createDarkTruthTaskRegistry } from "./task-registry.js";

export const DARK_TRUTH_PROFILE_STORE_VERSION =
  "darktruth.profile-store.v1" as const;

export interface DarkTruthProfilePaths {
  readonly root: string;
  readonly storyBible: string;
  readonly references: string;
  readonly referenceOverrides: string;
  readonly migrationStatus: string;
}

export function darkTruthProfilePaths(unitRoot: string): DarkTruthProfilePaths {
  const root = path.join(unitRoot, "state", "dark-truth-profile");
  return {
    root,
    storyBible: path.join(root, "story-bible.json"),
    references: path.join(root, "reference-images.json"),
    referenceOverrides: path.join(root, "reference-overrides.json"),
    migrationStatus: path.join(root, "migration-status.json"),
  };
}

export interface BibleWriteResult {
  readonly manifest: StoryBibleManifest;
  readonly diff: StoryBibleDiff | null;
  readonly invalidatedTaskIds: readonly string[];
}

export interface ReferenceWriteResult {
  readonly manifest: ReferenceImageManifest;
  readonly replacedReferenceIds: readonly string[];
  readonly invalidatedTaskIds: readonly string[];
}

function downstream(
  taskIds: readonly string[],
  includeRoots = false
): readonly string[] {
  const registry = createDarkTruthTaskRegistry();
  const ids = new Set<string>(includeRoots ? taskIds : []);
  for (const taskId of taskIds) {
    const explanation = registry.explain(taskId);
    for (const dependent of explanation.directDependents) ids.add(dependent);
    for (const candidate of registry.list("dark-truth")) {
      if (registry.explain(candidate.id).transitiveDependencies.includes(explanation.definition.id)) {
        ids.add(candidate.id);
      }
    }
  }
  return [...ids].sort();
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
}

export class DarkTruthProfileStore {
  public readonly paths: DarkTruthProfilePaths;

  public constructor(public readonly unitRoot: string) {
    this.paths = darkTruthProfilePaths(path.resolve(unitRoot));
  }

  public async readStoryBible(): Promise<StoryBibleManifest | null> {
    if (!(await fileExists(this.paths.storyBible))) return null;
    return storyBibleManifestSchema.parse(await readJson(this.paths.storyBible));
  }

  public async writeStoryBible(input: unknown): Promise<BibleWriteResult> {
    const manifest = storyBibleManifestSchema.parse(input);
    const previous = await this.readStoryBible();
    if (
      previous &&
      previous.revision === manifest.revision &&
      previous.contentHash !== manifest.contentHash
    ) {
      throw new Error(
        `Story bible revision ${manifest.revision} cannot be reused with a different hash.`
      );
    }
    const diff = previous ? diffStoryBibles(previous, manifest) : null;
    const changed =
      !previous ||
      previous.revision !== manifest.revision ||
      previous.contentHash !== manifest.contentHash;
    await writeJsonAtomic(this.paths.storyBible, manifest);
    return {
      manifest,
      diff,
      invalidatedTaskIds: changed
        ? downstream(["darktruth.episode-bible"])
        : [],
    };
  }

  public async readReferences(): Promise<ReferenceImageManifest | null> {
    if (!(await fileExists(this.paths.references))) return null;
    return referenceImageManifestSchema.parse(
      await readJson(this.paths.references)
    );
  }

  public async writeReferences(input: unknown): Promise<ReferenceWriteResult> {
    const manifest = referenceImageManifestSchema.parse(input);
    const previous = await this.readReferences();
    if (
      previous &&
      previous.revision === manifest.revision &&
      JSON.stringify(previous) !== JSON.stringify(manifest)
    ) {
      throw new Error(
        `Reference-set revision ${manifest.revision} cannot be reused for changed content.`
      );
    }
    const replacedReferenceIds = manifest.entries
      .flatMap((entry) => entry.replacesReferenceId ?? [])
      .filter((id, index, values) => values.indexOf(id) === index);
    const boundTasks = previous
      ? previous.usageBindings
          .filter((binding) =>
            binding.referenceIds.some((id) => replacedReferenceIds.includes(id))
          )
          .map((binding) => binding.taskId)
      : [];
    await writeJsonAtomic(this.paths.references, manifest);
    return {
      manifest,
      replacedReferenceIds,
      invalidatedTaskIds: downstream(boundTasks, true),
    };
  }

  public async appendReferenceOverride(
    input: unknown
  ): Promise<DarkTruthReferenceOverride> {
    const override = darkTruthReferenceOverrideSchema.parse(input);
    const existing = (await fileExists(this.paths.referenceOverrides))
      ? darkTruthReferenceOverrideSchema.array().parse(
          await readJson(this.paths.referenceOverrides)
        )
      : [];
    await writeJsonAtomic(this.paths.referenceOverrides, [
      ...existing,
      override,
    ]);
    return override;
  }
}

const legacyRegistrySchema = {
  parse(value: unknown): { readonly characters: readonly Record<string, unknown>[] } {
    if (!value || typeof value !== "object") return { characters: [] };
    const characters = Reflect.get(value, "characters");
    return {
      characters: Array.isArray(characters)
        ? characters.filter(
            (item): item is Record<string, unknown> =>
              Boolean(item) && typeof item === "object"
          )
        : [],
    };
  },
};

export interface DarkTruthMigrationStatus {
  readonly schemaVersion: typeof DARK_TRUTH_PROFILE_STORE_VERSION;
  readonly status: "ready" | "migration-required";
  readonly storyBiblePresent: boolean;
  readonly referenceManifestPresent: boolean;
  readonly legacyCharacterCount: number;
  readonly legacyApprovedReferenceCount: number;
  readonly blockers: readonly string[];
  readonly actions: readonly string[];
  readonly inspectedAt: string;
}

export async function inspectDarkTruthMigrationStatus(
  unitRoot: string,
  now: () => Date = () => new Date()
): Promise<DarkTruthMigrationStatus> {
  const store = new DarkTruthProfileStore(unitRoot);
  const storyBiblePresent = await fileExists(store.paths.storyBible);
  const referenceManifestPresent = await fileExists(store.paths.references);
  const legacyPath = path.join(unitRoot, "shared", "characters.json");
  const legacy = (await fileExists(legacyPath))
    ? legacyRegistrySchema.parse(await readJson(legacyPath))
    : { characters: [] };
  const approved = legacy.characters.filter(
    (character) => Reflect.get(character, "referenceStatus") === "approved"
  ).length;
  const blockers: string[] = [];
  const actions: string[] = [];
  if (!storyBiblePresent) {
    blockers.push("DARKTRUTH_STORY_BIBLE_MISSING");
    actions.push(
      "Create and explicitly approve a complete story-bible manifest; legacy character data is evidence only."
    );
  }
  if (!referenceManifestPresent) {
    blockers.push("DARKTRUTH_REFERENCE_SET_MISSING");
    actions.push(
      approved > 0
        ? `Import ${approved} approved legacy character reference(s), then complete coverage and approve the new reference-set revision.`
        : "Create, validate, and approve the required full and Short reference sets."
    );
  }
  const result: DarkTruthMigrationStatus = {
    schemaVersion: DARK_TRUTH_PROFILE_STORE_VERSION,
    status: blockers.length === 0 ? "ready" : "migration-required",
    storyBiblePresent,
    referenceManifestPresent,
    legacyCharacterCount: legacy.characters.length,
    legacyApprovedReferenceCount: approved,
    blockers,
    actions,
    inspectedAt: now().toISOString(),
  };
  await writeJsonAtomic(store.paths.migrationStatus, result);
  return result;
}

function safeLegacyId(value: unknown, index: number): string {
  const normalized = String(value ?? `character-${index + 1}`)
    .toLowerCase()
    .replaceAll(/[^a-z0-9._-]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "");
  return normalized || `character-${index + 1}`;
}

function gcd(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

/**
 * Convert legacy character references into an unapproved canonical draft.
 * Legacy approval is retained as origin evidence only and is never promoted to
 * a current revision-bound approval.
 */
export async function importLegacyCharacterReferenceDraft(input: {
  readonly unitRoot: string;
  readonly bible: StoryBibleManifest;
  readonly now?: Date;
}): Promise<ReferenceImageManifest> {
  const unitRoot = path.resolve(input.unitRoot);
  const legacyPath = path.join(unitRoot, "shared", "characters.json");
  const legacy = (await fileExists(legacyPath))
    ? legacyRegistrySchema.parse(await readJson(legacyPath))
    : { characters: [] };
  const entries = [];
  for (const [index, character] of legacy.characters.entries()) {
    const referencePath = Reflect.get(character, "referenceImagePath");
    if (typeof referencePath !== "string" || referencePath.trim() === "") {
      continue;
    }
    const absolutePath = path.resolve(unitRoot, referencePath);
    if (
      absolutePath !== unitRoot &&
      !absolutePath.startsWith(`${unitRoot}${path.sep}`)
    ) {
      throw new Error(`Legacy reference path escapes the episode root: ${referencePath}`);
    }
    if (!(await fileExists(absolutePath))) continue;
    const metadata = await sharp(absolutePath).metadata();
    if (!metadata.width || !metadata.height) continue;
    const divisor = gcd(metadata.width, metadata.height);
    const legacyId = safeLegacyId(Reflect.get(character, "id"), index);
    const referenceId = `ref-${legacyId}`;
    const continuityTraits = Reflect.get(character, "continuityTraits");
    entries.push({
      id: referenceId,
      role:
        legacyId === input.bible.episode.protagonist.id
          ? ("protagonist" as const)
          : ("supporting-character" as const),
      classification: "canonical" as const,
      relativePath: path.relative(unitRoot, absolutePath).split(path.sep).join("/"),
      checksumSha256: await hashFile(absolutePath),
      width: metadata.width,
      height: metadata.height,
      aspectRatio: `${metadata.width / divisor}:${metadata.height / divisor}`,
      subjectIdentity: String(
        Reflect.get(character, "name") ?? Reflect.get(character, "id") ?? referenceId
      ),
      continuityIdentity:
        Array.isArray(continuityTraits) && continuityTraits.length > 0
          ? continuityTraits.map(String).join("; ")
          : "Legacy continuity identity requires operator review.",
      promptVersion: "legacy-unknown.v1",
      promptHash: hashDarkTruthContract({ referencePath, legacyId }),
      importedOrigin: `Legacy character registry ${path.relative(unitRoot, legacyPath)}; prior status ${String(Reflect.get(character, "referenceStatus") ?? "unknown")}.`,
    });
  }
  const revisionHash = hashDarkTruthContract(
    entries.map((entry) => ({ id: entry.id, checksum: entry.checksumSha256 }))
  );
  const revision = `legacy-import-${revisionHash.slice(0, 12)}`;
  const now = (input.now ?? new Date()).toISOString();
  return referenceImageManifestSchema.parse({
    schemaVersion: "darktruth.reference-manifest.v1",
    id: revision,
    episodeId: input.bible.episodeId,
    profileId: "dark-truth",
    revision,
    bibleRevision: input.bible.revision,
    workflowRevision: input.bible.workflowRevision,
    requiredCoverage: {
      full: ["protagonist", "threat-entity", "hero-location"],
      short: ["protagonist", "short-specific-set"],
    },
    entries,
    usageBindings: [],
    validation: {
      status: "pending",
      issues: ["Imported references require current validation and approval."],
    },
    continuity: {
      status: "pending",
      issues: ["Imported continuity requires comparison with the episode bible."],
    },
    createdAt: now,
    updatedAt: now,
  });
}
