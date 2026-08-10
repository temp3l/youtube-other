import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assessDiagramProvenanceForPlanV35 } from "./history-diagram-provenance-v35.js";
import { assessPlanningAcceptanceV35 } from "./history-planning-acceptance-v35.js";
import { planHistoryVisualsV35 } from "./history-workflow-v35.js";

const NAPOLEON_EPISODE =
  "history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const episodesDirectory = path.join(repoRoot, "episodes");

describe("Napoleon diagram entailment", () => {
  it("keeps full-episode logistics diagrams semantically valid", async () => {
    const { plan } = await planHistoryVisualsV35({
      episodeId: NAPOLEON_EPISODE,
      outputRoot: episodesDirectory,
      force: true,
    });
    const planningAcceptance = assessPlanningAcceptanceV35(plan);
    expect(planningAcceptance.unexpectedProductionBlockers).toEqual([]);
  }, 30_000);
});
