import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractCanonicalStoryFacts } from "./canonical-facts.service.js";
import {
  buildPersistedHorrorAffectPlanArtifact,
  inspectHorrorAffectPlanArtifact,
  persistHorrorAffectPlanArtifact,
  resolveAndPersistHorrorAffectPlanArtifact,
  resolveHorrorAffectPlanArtifactPaths,
  serializePersistedHorrorAffectPlanArtifact,
} from "./horror-affect-plan.persistence.js";
import { parseCanonicalSourceStory } from "./source-story-parser.js";
import { compileFullStoryPrompt } from "./story-prompt-compiler.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const sourceFile = path.join(
  repoRoot,
  "content-ideas",
  "content",
  "dark-truth-episodes-multilingual-production-pack",
  "002-even-killers-can-lick",
  "en",
  "002-even-killers-can-lick-en-full.md"
);

async function makeFixture() {
  const parsed = await parseCanonicalSourceStory(sourceFile);
  const compiled = compileFullStoryPrompt({
    language: "en",
    adaptationMode: "retention-optimized",
    sourceStory: parsed,
    canonicalFacts: extractCanonicalStoryFacts(parsed),
    horrorAffectRolloutMode: "shadow",
  });
  if (!compiled.horrorAffectPlan || !compiled.horrorAffectDiagnostics) {
    throw new Error("Expected the fixture to produce a horror affect plan.");
  }
  const artifact = buildPersistedHorrorAffectPlanArtifact({
    episodeNumber: parsed.episodeNumber,
    episodeSlug: parsed.slug,
    sourceHash: parsed.sourceHash,
    storyIrHash: compiled.horrorAffectPlan.parents.storyIrHash,
    rolloutMode: compiled.horrorAffectDiagnostics.mode,
    eligibility: {
      eligible: compiled.horrorAffectDiagnostics.eligible,
      reason: compiled.horrorAffectDiagnostics.eligibilityReason,
    },
    plan: compiled.horrorAffectPlan,
  });
  return { parsed, compiled, artifact };
}

async function makePaths(episodeSlug: string) {
  const outputDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "horror-affect-persistence-")
  );
  return resolveHorrorAffectPlanArtifactPaths({
    outputDirectory,
    episodeSlug,
  });
}

describe("horror affect plan persistence", () => {
  it("writes byte-stable canonical JSON and reuses a current artifact", async () => {
    const { parsed, artifact } = await makeFixture();
    const paths = await makePaths(parsed.slug);

    const first = await resolveAndPersistHorrorAffectPlanArtifact({
      paths,
      expectedArtifact: artifact,
    });
    const firstBytes = await fs.readFile(paths.artifactPath, "utf8");
    const second = await resolveAndPersistHorrorAffectPlanArtifact({
      paths,
      expectedArtifact: artifact,
    });
    const secondBytes = await fs.readFile(paths.artifactPath, "utf8");

    expect(first.previousState).toBe("missing");
    expect(first.refreshed).toBe(true);
    expect(second.reused).toBe(true);
    expect(second.refreshed).toBe(false);
    expect(firstBytes).toBe(serializePersistedHorrorAffectPlanArtifact(artifact));
    expect(secondBytes).toBe(firstBytes);
    expect(firstBytes.startsWith('{"creation":')).toBe(true);
  });

  it("atomically replaces stale content and leaves no temporary file", async () => {
    const { parsed, artifact } = await makeFixture();
    const paths = await makePaths(parsed.slug);
    await persistHorrorAffectPlanArtifact({ paths, artifact });
    const changed = {
      ...artifact,
      rolloutMode: "enforce" as const,
    };

    const result = await resolveAndPersistHorrorAffectPlanArtifact({
      paths,
      expectedArtifact: changed,
    });

    expect(result.previousState).toBe("stale");
    expect(result.refreshed).toBe(true);
    expect(
      (await fs.readdir(paths.canonicalFullDir)).filter((entry) =>
        entry.endsWith(".tmp")
      )
    ).toEqual([]);
    expect(await fs.readFile(paths.artifactPath, "utf8")).toBe(
      serializePersistedHorrorAffectPlanArtifact(changed)
    );
  });

  it("classifies malformed JSON and mismatched episode identity as invalid", async () => {
    const { parsed, artifact } = await makeFixture();
    const paths = await makePaths(parsed.slug);
    await fs.mkdir(paths.canonicalFullDir, { recursive: true });
    await fs.writeFile(paths.artifactPath, "{not-json", "utf8");
    expect((await inspectHorrorAffectPlanArtifact({ paths })).status).toMatchObject({
      state: "invalid",
      reasons: [{ code: "malformed-json" }],
    });

    await fs.writeFile(
      paths.artifactPath,
      serializePersistedHorrorAffectPlanArtifact({
        ...artifact,
        source: {
          ...artifact.source,
          episodeNumber: "999",
          episodeSlug: "999-another-story",
        },
      }),
      "utf8"
    );
    expect((await inspectHorrorAffectPlanArtifact({ paths })).status).toMatchObject({
      state: "invalid",
      reasons: [{ code: "episode-identity-mismatch" }],
    });
  });

  it("explains stale versions and lineage hashes", async () => {
    const { parsed, artifact } = await makeFixture();
    const paths = await makePaths(parsed.slug);
    await fs.mkdir(paths.canonicalFullDir, { recursive: true });
    await fs.writeFile(
      paths.artifactPath,
      `${JSON.stringify({ ...artifact, schemaVersion: "horror-affect-plan-artifact-v0" })}\n`,
      "utf8"
    );
    expect((await inspectHorrorAffectPlanArtifact({ paths })).status).toMatchObject({
      state: "stale",
      reasons: [{ code: "artifact-schema-version-changed" }],
    });

    const oldLineage = {
      ...artifact,
      source: {
        ...artifact.source,
        sourceHash: "b".repeat(64),
      },
    };
    await fs.writeFile(
      paths.artifactPath,
      serializePersistedHorrorAffectPlanArtifact(oldLineage),
      "utf8"
    );
    const lineageStatus = await inspectHorrorAffectPlanArtifact({
      paths,
      expectedArtifact: artifact,
    });
    expect(lineageStatus.status).toMatchObject({
      state: "stale",
      reasons: expect.arrayContaining([
        expect.objectContaining({ code: "source-hash-changed" }),
      ]),
    });
  });

  it("treats legacy absence as readable missing state and rejects traversal", async () => {
    const paths = await makePaths("002-even-killers-can-lick");
    expect((await inspectHorrorAffectPlanArtifact({ paths })).status).toMatchObject({
      state: "missing",
      artifactPresent: false,
      reasons: [{ code: "artifact-missing" }],
    });
    expect(() =>
      resolveHorrorAffectPlanArtifactPaths({
        outputDirectory: paths.episodeDir,
        episodeSlug: "../escape",
      })
    ).toThrow("Invalid episode id");
  });

  it("builds byte-equivalent semantic artifacts for identical sync and batch inputs", async () => {
    const { artifact, compiled, parsed } = await makeFixture();
    const diagnostics = compiled.horrorAffectDiagnostics!;
    const batchArtifact = buildPersistedHorrorAffectPlanArtifact({
      episodeNumber: parsed.episodeNumber,
      episodeSlug: parsed.slug,
      sourceHash: parsed.sourceHash,
      storyIrHash: artifact.source.storyIrHash,
      rolloutMode: diagnostics.mode,
      eligibility: {
        eligible: diagnostics.eligible,
        reason: diagnostics.eligibilityReason,
      },
      plan: compiled.horrorAffectPlan,
    });

    expect(serializePersistedHorrorAffectPlanArtifact(batchArtifact)).toBe(
      serializePersistedHorrorAffectPlanArtifact(artifact)
    );
  });
});
