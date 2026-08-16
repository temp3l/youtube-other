import { describe, expect, it } from "vitest";

import {
  buildEpisodeVisualContextFromBoundary,
  parseSceneOrderFromSemanticId,
  visualMomentForBoundaryBeat,
} from "./microdrama-visual-lexicon.js";
import type { EpisodeBoundaryContract } from "./v5-canon-admission-contracts.js";

const boundary: EpisodeBoundaryContract = {
  schemaVersion: "mediaforge.microdrama-pack.v1",
  episodeId: "E001",
  episodeNumber: 1,
  arcId: "1",
  arcName: "The Impossible Phone",
  title: "Seven Minutes",
  newInformation:
    "Maya proves the first future video is real—and that the outcome can be changed.",
  openLoop:
    "The next future video shows Ethan kneeling over a bloodied stranger at 8:14.",
  hook: "Maya watches her boyfriend die on her phone—seven minutes before it happens.",
  cliffhangerBeat:
    "Beside him lies a woman Maya has never seen. And the timestamp says 8:14.",
  characters: ["Maya Vale", "Ethan Cole"],
  location: "apartment/street",
  provenance: {
    sourceKind: "import",
    sourcePackVersion: "v5-remediated",
    sourceRelativePath: "languages/en/episodes/e001-seven-minutes.md",
    sourceArtifactHash: "a".repeat(64),
    importedAt: "2026-08-12T04:00:00.000Z",
  },
};

describe("microdrama episode visual beat context", () => {
  it("maps hook beat to narration hook moment", () => {
    expect(visualMomentForBoundaryBeat("HOOK", boundary)).toContain(
      "seven minutes before it happens"
    );
    expect(visualMomentForBoundaryBeat("CLIFFHANGER", boundary)).toContain(
      "woman Maya has never seen"
    );
  });

  it("indexes beats by scene order for prompt expansion", () => {
    const context = buildEpisodeVisualContextFromBoundary(boundary);
    expect(parseSceneOrderFromSemanticId("scene.sem.e001.001")).toBe(1);
    expect(context.beatsByOrder[1]?.category).toBe("HOOK");
    expect(context.beatsByOrder[1]?.visualMoment).toContain("boyfriend die");
  });
});
