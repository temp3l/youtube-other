import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ARTIFACT_SCHEMA_VERSION, artifactRefSchema } from "@mediaforge/domain";
import { describe, expect, it } from "vitest";

import {
  assertContainedRegularFile,
  assertContainedWritablePath,
  resolveArtifactPathSet,
} from "./artifact-path-resolver.js";
import { createEpisodePathResolver } from "./episode-filesystem.js";

const episodeRef = artifactRefSchema.parse({
  schemaVersion: ARTIFACT_SCHEMA_VERSION,
  unitId: "episode-001",
  profileId: "dark-truth",
  locale: "pt",
  variant: "short",
  kind: "image",
  artifactKey: "scene-001",
  format: "webp",
  artifactRevision: "revision-1",
  workflowRevision: "workflow-1",
  policyRevision: "bible-1",
});

describe("artifact path resolver", () => {
  it("maps episode intent to one canonical path and ordered legacy reads", () => {
    const paths = resolveArtifactPathSet({
      workspaceRoot: "/workspace",
      ref: episodeRef,
    });

    expect(paths.canonical).toBe(
      "/workspace/episode-001/visuals/short/images/scene-001.webp"
    );
    expect(paths.canonicalManifest).toBe(
      `${paths.canonical}.artifact-manifest.json`
    );
    expect(paths.legacyRelativePaths).toEqual([
      "shared/short/images/generated/scene-001.webp",
      "images/generated/scene-001.webp",
    ]);
    expect(
      createEpisodePathResolver("/workspace").artifact(episodeRef)
    ).toEqual(paths);
  });

  it("adapts mathematics lessons without episode layout leakage", () => {
    const paths = resolveArtifactPathSet({
      workspaceRoot: "/math",
      ref: artifactRefSchema.parse({
        ...episodeRef,
        unitId: "lesson-001",
        profileId: "mathematics-education",
        locale: "de",
        variant: "full",
        kind: "math-verification",
        format: "json",
      }),
    });

    expect(paths.canonical).toBe(
      "/math/lesson-001/canonical/verification.json"
    );
    expect(paths.legacyRelativePaths).toEqual([
      "canonical/verification.v2.json",
    ]);
  });

  it("writes strategic source and package artifacts to isolated canonical paths", () => {
    const source = resolveArtifactPathSet({
      workspaceRoot: "/workspace",
      ref: artifactRefSchema.parse({
        ...episodeRef,
        profileId: "strategic-reinvention",
        locale: "it",
        kind: "source",
        artifactKey: "source-001",
        format: "txt",
      }),
    });
    const packageArtifact = resolveArtifactPathSet({
      workspaceRoot: "/workspace",
      ref: artifactRefSchema.parse({
        ...episodeRef,
        profileId: "strategic-reinvention",
        locale: "it",
        kind: "multilingual-package",
        artifactKey: "multilingual-package",
        format: "json",
      }),
    });

    expect(source.canonical).toBe(
      "/workspace/episode-001/sources/content/source-001/source-001.txt"
    );
    expect(packageArtifact.canonical).toBe(
      "/workspace/episode-001/locales/it/short/packages/multilingual-package.json"
    );
    expect(source.canonical).not.toBe(packageArtifact.canonical);
    expect(source.legacyRelativePaths).toEqual([]);
  });

  it("rejects incompatible profile artifacts", () => {
    expect(() =>
      resolveArtifactPathSet({
        workspaceRoot: "/workspace",
        ref: artifactRefSchema.parse({
          ...episodeRef,
          kind: "story-bible",
          profileId: "mathematics-education",
        }),
      })
    ).toThrow("not valid for the mathematics layout");
  });

  it("rejects traversal and symlink targets for reads and writes", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "artifact-paths-"));
    const outside = await fs.mkdtemp(
      path.join(os.tmpdir(), "artifact-outside-")
    );
    await fs.writeFile(path.join(outside, "artifact.json"), "{}", "utf8");
    await fs.symlink(outside, path.join(root, "escaped"));

    expect(() =>
      resolveArtifactPathSet({
        workspaceRoot: root,
        ref: { ...episodeRef, unitId: "../escape" } as typeof episodeRef,
      })
    ).toThrow();
    await expect(
      assertContainedRegularFile(
        root,
        path.join(root, "escaped", "artifact.json")
      )
    ).rejects.toThrow();
    await expect(
      assertContainedWritablePath(root, path.join(root, "escaped", "new.json"))
    ).rejects.toThrow("unsafe ancestor");
  });
});
