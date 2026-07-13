import fs from "node:fs/promises";
import path from "node:path";
import { hashText, writeJsonAtomic } from "@mediaforge/shared";
import { loadCurriculumRelease } from "../curriculum/release.js";
import { canonicalHash } from "../verification/canonical-json.js";

/** Test-only reviewed release material. Production never upgrades editorial status. */
export async function createReviewedCurriculumFixture(
  root: string,
  sourceRoot = path.resolve("packages/math-education/data/curriculum/v1")
) {
  await fs.mkdir(root, { recursive: true });
  const read = async (name: string) =>
    JSON.parse(await fs.readFile(path.join(sourceRoot, name), "utf8")) as Record<string, unknown>;
  const [release, skillsFile, registry, overrides, prerequisites, migrations] =
    await Promise.all([
      read("release.json"),
      read("skills.json"),
      read("source-registry.json"),
      read("state-overrides.json"),
      read("prerequisites.json"),
      read("migrations.json"),
    ]);
  const skills = (skillsFile["skills"] as Array<Record<string, unknown>>).map(
    (skill) => ({
      ...skill,
      editorialStatus: "reviewed",
      sourceMappings: (skill["sourceMappings"] as Array<Record<string, unknown>>).map(
        (mapping) => ({ ...mapping, reviewStatus: "reviewed" })
      ),
    })
  );
  const reviewedSkills = {
    ...skillsFile,
    skills,
    releaseHash: hashText(
      JSON.stringify({ schemaVersion: skillsFile["schemaVersion"], skills })
    ),
  };
  const { incompleteReason: _overrideIncompleteReason, ...overridePayload } =
    overrides;
  const reviewedOverrides = {
    ...overridePayload,
    reviewStatus: "reviewed",
  };
  const {
    incompleteReason: _prerequisiteIncompleteReason,
    ...prerequisitePayload
  } = prerequisites;
  const reviewedPrerequisites = {
    ...prerequisitePayload,
    reviewStatus: "reviewed",
  };
  const inputs = {
    skills: canonicalHash(reviewedSkills),
    sourceRegistry: canonicalHash(registry),
    stateOverrides: canonicalHash(reviewedOverrides),
    prerequisites: canonicalHash(reviewedPrerequisites),
    migrations: canonicalHash(migrations),
  };
  const reviewedRelease = {
    ...release,
    status: "reviewed",
    curriculumVersion: "1.0.0-test-reviewed",
    inputHashes: inputs,
    notes: "Test-only reviewed curriculum fixture; never a production release.",
  };
  await Promise.all([
    writeJsonAtomic(path.join(root, "release.json"), reviewedRelease),
    writeJsonAtomic(path.join(root, "skills.json"), reviewedSkills),
    writeJsonAtomic(path.join(root, "source-registry.json"), registry),
    writeJsonAtomic(path.join(root, "state-overrides.json"), reviewedOverrides),
    writeJsonAtomic(path.join(root, "prerequisites.json"), reviewedPrerequisites),
    writeJsonAtomic(path.join(root, "migrations.json"), migrations),
  ]);
  return loadCurriculumRelease(root);
}
