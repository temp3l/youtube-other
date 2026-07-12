import fs from "node:fs/promises";
import path from "node:path";
import { hashText } from "@mediaforge/shared";
import { z } from "zod";
import { curriculumSkillSchema, skillIdSchema } from "../domain/index.js";
import { canonicalHash } from "../verification/canonical-json.js";
import { analyzePrerequisiteDag, prerequisitesFileSchema } from "./dag.js";
import {
  sourceRegistrySchema,
  stateOverridesFileSchema,
  validateProvenance,
} from "./source-registry.js";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);

export const curriculumReleaseSchema = z.strictObject({
  releaseId: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/u),
  schemaVersion: z.literal(1),
  curriculumVersion: z.string().min(1),
  registryVersion: z.string().min(1),
  status: z.enum(["draft", "reviewed", "published", "superseded"]),
  sourceSeed: z.string().min(1),
  inputHashes: z.strictObject({
    skills: hashSchema,
    sourceRegistry: hashSchema,
    stateOverrides: hashSchema,
    prerequisites: hashSchema,
    migrations: hashSchema,
  }),
  supersededBy: z.string().min(1).optional(),
  notes: z.string().min(1),
});

export const curriculumSkillsFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  releaseId: z.string().min(1),
  releaseHash: hashSchema,
  skills: z.array(curriculumSkillSchema).length(206),
});

const skillMigrationSchema = z.strictObject({
  migrationId: z.string().regex(/^[a-z0-9-]+$/u),
  kind: z.enum(["replace", "merge", "split", "move"]),
  fromSkillIds: z.array(skillIdSchema).min(1),
  toSkillIds: z.array(skillIdSchema).min(1),
  effectiveRelease: z.string().min(1),
  reason: z.string().min(1),
});

const skillAliasSchema = z.strictObject({
  aliasSkillId: skillIdSchema,
  targetSkillId: skillIdSchema,
  readOnly: z.literal(true),
});

export const curriculumMigrationsFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  policy: z.literal("append-only"),
  migrations: z.array(skillMigrationSchema),
  aliases: z.array(skillAliasSchema),
});

export function validateCurriculumMigrations(
  raw: z.infer<typeof curriculumMigrationsFileSchema>,
  activeSkillIds: ReadonlySet<string>
): void {
  const migrationIds = new Set<string>();
  for (const migration of raw.migrations) {
    if (migrationIds.has(migration.migrationId))
      throw new Error(`Duplicate migration id: ${migration.migrationId}`);
    migrationIds.add(migration.migrationId);
    for (const target of migration.toSkillIds)
      if (!activeSkillIds.has(target))
        throw new Error(`Unknown migration target: ${target}`);
  }
  const aliases = new Set<string>();
  for (const alias of raw.aliases) {
    if (aliases.has(alias.aliasSkillId))
      throw new Error(`Duplicate skill alias: ${alias.aliasSkillId}`);
    if (!activeSkillIds.has(alias.targetSkillId))
      throw new Error(`Unknown skill alias target: ${alias.targetSkillId}`);
    if (activeSkillIds.has(alias.aliasSkillId))
      throw new Error(`Skill alias reuses active id: ${alias.aliasSkillId}`);
    aliases.add(alias.aliasSkillId);
  }
}

export function assertWritableSkillId(
  skillId: string,
  migrations: z.infer<typeof curriculumMigrationsFileSchema>
): void {
  if (migrations.aliases.some((alias) => alias.aliasSkillId === skillId))
    throw new Error(`Read-only skill alias cannot write artifacts: ${skillId}`);
}

export function assertPublishedReleaseImmutable(
  previous: unknown,
  next: unknown
): void {
  const release = curriculumReleaseSchema.parse(previous);
  if (
    release.status === "published" &&
    canonicalHash(previous) !== canonicalHash(next)
  )
    throw new Error(
      `Published curriculum release ${release.releaseId} is immutable.`
    );
}

const requiredJurisdictions = [
  "DE",
  "DE-BW",
  "DE-BB",
  "DE-BE",
  "DE-NI",
  "DE-NW",
  "DE-SH",
  "DE-SL",
] as const;

export async function loadCurriculumRelease(releaseRoot: string) {
  const names = [
    "release.json",
    "skills.json",
    "source-registry.json",
    "state-overrides.json",
    "prerequisites.json",
    "migrations.json",
  ] as const;
  const values = await Promise.all(
    names.map(async (name) =>
      JSON.parse(await fs.readFile(path.join(releaseRoot, name), "utf8"))
    )
  );
  const release = curriculumReleaseSchema.parse(values[0]);
  const skillsFile = curriculumSkillsFileSchema.parse(values[1]);
  const registry = sourceRegistrySchema.parse(values[2]);
  const overrides = stateOverridesFileSchema.parse(values[3]);
  const prerequisites = prerequisitesFileSchema.parse(values[4]);
  const migrations = curriculumMigrationsFileSchema.parse(values[5]);
  if (skillsFile.releaseId !== release.releaseId)
    throw new Error("Curriculum release id mismatch.");
  const releaseHash = hashText(
    JSON.stringify({
      schemaVersion: skillsFile.schemaVersion,
      skills: skillsFile.skills,
    })
  );
  if (releaseHash !== skillsFile.releaseHash)
    throw new Error("Curriculum skills release hash mismatch.");
  const inputs = {
    skills: canonicalHash(skillsFile),
    sourceRegistry: canonicalHash(registry),
    stateOverrides: canonicalHash(overrides),
    prerequisites: canonicalHash(prerequisites),
    migrations: canonicalHash(migrations),
  };
  for (const [name, actual] of Object.entries(inputs))
    if (release.inputHashes[name as keyof typeof inputs] !== actual)
      throw new Error(`Curriculum input hash mismatch: ${name}`);
  const jurisdictions = new Set(
    registry.sources.map((source) => source.jurisdiction)
  );
  for (const jurisdiction of requiredJurisdictions)
    if (!jurisdictions.has(jurisdiction))
      throw new Error(`Missing documented curriculum source: ${jurisdiction}`);
  const activeSkillIds = new Set(
    skillsFile.skills.map((skill) => skill.skillId)
  );
  validateCurriculumMigrations(migrations, activeSkillIds);
  const provenance = validateProvenance(skillsFile.skills, registry, overrides);
  const graph = analyzePrerequisiteDag(skillsFile.skills, prerequisites.edges);
  return {
    release,
    skills: skillsFile.skills,
    releaseHash: skillsFile.releaseHash,
    registry,
    overrides,
    prerequisites,
    migrations,
    provenance,
    graph,
    readyForProduction:
      (release.status === "reviewed" || release.status === "published") &&
      provenance.complete &&
      prerequisites.reviewStatus !== "explicitly-incomplete" &&
      overrides.reviewStatus !== "explicitly-incomplete",
  };
}
