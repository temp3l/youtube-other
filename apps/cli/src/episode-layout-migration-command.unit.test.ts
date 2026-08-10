import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ARTIFACT_SCHEMA_VERSION, artifactRefSchema } from "@mediaforge/domain";
import { LEGACY_ARTIFACT_LAYOUT_VERSION } from "@mediaforge/shared";
import { ArtifactRepository } from "@mediaforge/workflow-engine";
import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";

import {
  EPISODE_LAYOUT_MIGRATION_VERSION,
  normalizeEpisodeScriptContent,
  planEpisodeLayoutMigration,
  registerEpisodeLayoutMigrationCommand,
} from "./episode-layout-migration-command.js";

async function createEpisodesRoot(): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "episode-layout-"));
  const episodesRoot = path.join(tempDir, "episodes");
  await fs.mkdir(episodesRoot, { recursive: true });
  return episodesRoot;
}

async function writeEpisodeFile(
  episodesRoot: string,
  relativePath: string,
  content: string
): Promise<void> {
  const filePath = path.join(episodesRoot, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

describe("episode layout migration command", () => {
  it("normalizes script content with the documented policy", () => {
    expect(
      normalizeEpisodeScriptContent(
        Buffer.from("\uFEFFLine 1  \r\nLine 2\t\r\n\r\n")
      )
    ).toBe("Line 1\nLine 2\n");
  });

  it("characterizes canonical, equivalent, and divergent representative layouts", async () => {
    const episodesRoot = await createEpisodesRoot();
    const canonicalEpisode = "022-the-whistler-in-the-woods";
    await writeEpisodeFile(
      episodesRoot,
      `${canonicalEpisode}/languages/script-en.md`,
      "English\n"
    );
    await writeEpisodeFile(
      episodesRoot,
      `${canonicalEpisode}/script.md`,
      "English  \r\n"
    );
    const divergentEpisode = "009-mary-gloria-the-christmas-doll";
    await writeEpisodeFile(
      episodesRoot,
      `${divergentEpisode}/script.md`,
      "English root\n"
    );
    await writeEpisodeFile(
      episodesRoot,
      `${divergentEpisode}/en/full/script.md`,
      "Generated but different\n"
    );

    const report = await planEpisodeLayoutMigration({
      episodesRoot,
      now: new Date("2026-08-10T00:00:00.000Z"),
    });

    expect(report.schemaVersion).toBe(EPISODE_LAYOUT_MIGRATION_VERSION);
    expect(report.dryRun).toBe(true);
    expect(report.summary["write-manifest"]).toBe(1);
    expect(report.summary.block).toBe(1);
    expect(
      report.plans.find((plan) => plan.ref.unitId === canonicalEpisode)
    ).toMatchObject({
      operation: "write-manifest",
      classification: "canonical_manifest_missing",
      destination: { relativePath: "languages/script-en.md" },
    });
    expect(
      report.candidates.find(
        (candidate) =>
          candidate.episodeSlug === canonicalEpisode &&
          candidate.relativePath === "script.md"
      )
    ).toMatchObject({
      source: "legacy",
      classification: "equivalent_legacy",
      legacyLayoutVersion: LEGACY_ARTIFACT_LAYOUT_VERSION,
      legacyProvenance: "authored-root-compatibility",
      readOnly: true,
    });
    expect(
      report.plans.find((plan) => plan.ref.unitId === divergentEpisode)
    ).toMatchObject({
      operation: "block",
      classification: "ambiguous_candidates",
    });
  });

  it("dry-runs a legacy copy without filesystem writes", async () => {
    const episodesRoot = await createEpisodesRoot();
    const episode = "010-safe";
    await writeEpisodeFile(
      episodesRoot,
      `${episode}/source/${episode}-en-full.md`,
      "Move me\n"
    );

    const report = await planEpisodeLayoutMigration({ episodesRoot });
    const plan = report.plans[0];

    expect(plan).toMatchObject({
      operation: "copy",
      classification: "legacy_copy",
      source: {
        relativePath: `source/${episode}-en-full.md`,
        legacyProvenance: "source-lineage",
        readOnly: true,
      },
      destination: {
        relativePath: "languages/script-en.md",
        expectedState: "absent",
      },
      performed: false,
    });
    await expect(
      fs.access(path.join(episodesRoot, episode, "languages", "script-en.md"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fs.access(path.join(episodesRoot, episode, "state"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("blocks a generated runtime script from becoming authored source", async () => {
    const episodesRoot = await createEpisodesRoot();
    await writeEpisodeFile(
      episodesRoot,
      "010-runtime-only/locales/en/full/script.md",
      "Generated runtime\n"
    );

    const report = await planEpisodeLayoutMigration({ episodesRoot });

    expect(report.plans[0]).toMatchObject({
      operation: "block",
      classification: "compatibility_only",
      source: null,
    });
  });

  it("copies atomically, writes a manifest and rollback metadata, and preserves the legacy source", async () => {
    const episodesRoot = await createEpisodesRoot();
    const episode = "010-safe";
    const sourcePath = path.join(
      episodesRoot,
      episode,
      "source",
      `${episode}-en-full.md`
    );
    await writeEpisodeFile(
      episodesRoot,
      `${episode}/source/${episode}-en-full.md`,
      "Copy me\n"
    );
    const dryRun = await planEpisodeLayoutMigration({ episodesRoot });

    const report = await planEpisodeLayoutMigration({
      episodesRoot,
      write: true,
      confirmed: true,
      confirmationMigrationId: dryRun.migrationId,
      now: new Date("2026-08-10T00:00:00.000Z"),
    });
    const plan = report.plans[0];
    const canonical = path.join(
      episodesRoot,
      episode,
      "languages",
      "script-en.md"
    );

    expect(plan).toMatchObject({ operation: "copy", performed: true });
    await expect(fs.readFile(canonical, "utf8")).resolves.toBe("Copy me\n");
    await expect(fs.readFile(sourcePath, "utf8")).resolves.toBe("Copy me\n");
    await expect(
      fs.readFile(`${canonical}.artifact-manifest.json`, "utf8")
    ).resolves.toContain("artifact.layout-migration");
    await expect(
      fs.readFile(plan?.rollbackMetadataPath as string, "utf8")
    ).resolves.toContain("delete-canonical-artifact-and-manifest");
  });

  it("adopts an unmanifested canonical script and never overwrites a conflicting target", async () => {
    const episodesRoot = await createEpisodesRoot();
    await writeEpisodeFile(
      episodesRoot,
      "012-adopt/languages/script-en.md",
      "Canonical\n"
    );
    await writeEpisodeFile(
      episodesRoot,
      "013-conflict/en/full/script.md",
      "Legacy\n"
    );
    await fs.mkdir(
      path.join(episodesRoot, "013-conflict", "languages", "script-en.md"),
      { recursive: true }
    );

    const dryRun = await planEpisodeLayoutMigration({ episodesRoot });
    expect(
      dryRun.plans.find((plan) => plan.ref.unitId === "012-adopt")
    ).toMatchObject({ operation: "write-manifest" });
    expect(
      dryRun.plans.find((plan) => plan.ref.unitId === "013-conflict")
    ).toMatchObject({ operation: "block", classification: "target_conflict" });
    await expect(
      planEpisodeLayoutMigration({
        episodesRoot,
        write: true,
        confirmed: true,
        confirmationMigrationId: dryRun.migrationId,
      })
    ).rejects.toMatchObject({ code: "ARTIFACT_CONFLICT" });
    await expect(
      fs.access(
        path.join(
          episodesRoot,
          "012-adopt",
          "languages",
          "script-en.md.artifact-manifest.json"
        )
      )
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fs.stat(
        path.join(episodesRoot, "013-conflict", "languages", "script-en.md")
      )
    ).resolves.toMatchObject({ isDirectory: expect.any(Function) });
  });

  it("recognizes a valid producer manifest with non-migration revisions", async () => {
    const episodesRoot = await createEpisodesRoot();
    const repository = new ArtifactRepository({ workspaceRoot: episodesRoot });
    const ref = artifactRefSchema.parse({
      schemaVersion: ARTIFACT_SCHEMA_VERSION,
      unitId: "014-produced",
      profileId: "dark-truth",
      locale: "en",
      variant: "full",
      kind: "full-script",
      format: "md",
      artifactRevision: "production-revision-42",
      workflowRevision: "darktruth-story-v7",
      policyRevision: "editorial-v3",
    });
    await repository.promote({
      ref,
      content: "Produced canonical\n",
      mediaType: "text/markdown",
      producerTaskId: "darktruth.rewrite-full",
      producerTaskVersion: "7.0.0",
      producerAttemptId: "attempt-production-42",
      validatorId: "darktruth.story-validator",
      validatorVersion: "3.0.0",
      dependencyFingerprints: ["a".repeat(64)],
      validate: () => undefined,
    });

    const report = await planEpisodeLayoutMigration({ episodesRoot });

    expect(report.plans).toHaveLength(1);
    expect(report.plans[0]).toMatchObject({
      operation: "skip",
      classification: "canonical_verified",
    });
  });

  it("requires the exact dry-run migration ID and explicit confirmation", async () => {
    const episodesRoot = await createEpisodesRoot();
    await writeEpisodeFile(episodesRoot, "010-safe/script.md", "Legacy\n");

    await expect(
      planEpisodeLayoutMigration({
        episodesRoot,
        write: true,
        confirmationMigrationId: "wrong",
      })
    ).rejects.toMatchObject({ code: "MIGRATION_CONFIRMATION_REQUIRED" });
  });

  it("registers a dry-run JSON CLI command", async () => {
    const episodesRoot = await createEpisodesRoot();
    await writeEpisodeFile(episodesRoot, "010-safe/script.md", "Legacy\n");
    const program = new Command();
    const episode = program.command("episode");
    registerEpisodeLayoutMigrationCommand(episode);
    const output = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    let stdout = "";
    try {
      await program.parseAsync([
        "node",
        "cli",
        "episode",
        "migrate-layout",
        "--episodes-root",
        episodesRoot,
        "--dry-run",
        "--json",
      ]);
      stdout = String(output.mock.calls[0]?.[0] ?? "{}");
    } finally {
      output.mockRestore();
    }
    const payload = JSON.parse(stdout) as {
      readonly dryRun: boolean;
      readonly migrationId: string;
      readonly plans: readonly unknown[];
    };
    expect(payload.dryRun).toBe(true);
    expect(payload.migrationId).toMatch(/^episode-layout-migration-/u);
    expect(payload.plans).toHaveLength(1);
  });
});
