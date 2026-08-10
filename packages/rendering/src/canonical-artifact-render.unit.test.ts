import {
  ARTIFACT_SCHEMA_VERSION,
  artifactRefSchema,
  type ArtifactKind,
} from "@mediaforge/domain";
import { resolveArtifactPathSet } from "@mediaforge/shared";
import { describe, expect, it } from "vitest";

import { buildFinalAudioMuxFfmpegArguments } from "./index.js";

function artifactRef(kind: ArtifactKind, variant: "full" | "short" = "full") {
  return artifactRefSchema.parse({
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    unitId: "022-the-whistler-in-the-woods",
    profileId: "dark-truth",
    locale: "en",
    variant,
    kind,
    ...(kind === "render"
      ? { format: "mp4" as const, renderProfile: "youtube" as const }
      : { format: "wav" as const }),
    artifactRevision: "render-regression-v1",
    workflowRevision: "render-regression-v1",
    policyRevision: "render-regression-v1",
  });
}

describe("canonical artifact render wiring", () => {
  it("muxes only resolver-selected locale and variant paths", () => {
    const workspaceRoot = "/workspace/episodes";
    const fullNarration = resolveArtifactPathSet({
      workspaceRoot,
      ref: artifactRef("narration"),
    });
    const fullRender = resolveArtifactPathSet({
      workspaceRoot,
      ref: artifactRef("render"),
    });
    const shortRender = resolveArtifactPathSet({
      workspaceRoot,
      ref: artifactRef("render", "short"),
    });

    const args = buildFinalAudioMuxFfmpegArguments({
      visualPath: "/tmp/visual.mp4",
      narrationAudioPath: fullNarration.canonical,
      outputPath: fullRender.canonical,
    });

    expect(args).toContain(
      "/workspace/episodes/022-the-whistler-in-the-woods/locales/en/full/audio/narration.wav"
    );
    expect(args.at(-1)).toBe(
      "/workspace/episodes/022-the-whistler-in-the-woods/locales/en/full/renders/youtube/youtube-final.mp4"
    );
    expect(shortRender.canonical).toContain("/locales/en/short/renders/");
    expect(shortRender.canonical).not.toBe(fullRender.canonical);
    expect(fullRender.legacyCandidates).toEqual([]);
  });
});
