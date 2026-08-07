import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { episodeBlueprintSchema } from "@mediaforge/domain";
import { loadStrategicReinventionProfile } from "./profile.js";
import { runStrategicSourceAdaptation } from "./source-adaptation-bridge.js";

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("runStrategicSourceAdaptation", () => {
  it("derives a provenance-bound canonical script from episode text sources", async () => {
    const profile = await loadStrategicReinventionProfile();
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "source-adapt-"));
    temporaryRoots.push(workspace);
    const episodeId = "episode-adapt-001";
    const episodeRoot = path.join(workspace, episodeId);
    await fs.mkdir(path.join(episodeRoot, "sources", "content"), { recursive: true });
    const sourceText =
      "Benvenuti. Questo episodio dimostra la reinvenzione strategica con fonti approvate.";
    await fs.writeFile(path.join(episodeRoot, "sources", "content", "source-primary.md"), sourceText);
    const blueprint = episodeBlueprintSchema.parse({
      schemaVersion: "1.1",
      episodeId,
      genreId: "strategic-reinvention",
      creatorProfileId: profile.creatorProfile.id,
      canonicalLocale: "it",
      mode: "story-to-strategy",
      sources: ["source-primary"],
      contentTier: "public",
      thesis: "Reinvention requires deliberate strategy and evidence-backed action.",
      beats: [
        { beatId: "beat-001", type: "hook", purpose: "Open", sourceIds: ["source-primary"] },
        { beatId: "beat-002", type: "situation", purpose: "Context", sourceIds: ["source-primary"] },
        { beatId: "beat-003", type: "story", purpose: "Case", sourceIds: ["source-primary"] },
        { beatId: "beat-004", type: "conventional-view", purpose: "Default", sourceIds: ["source-primary"] },
        { beatId: "beat-005", type: "reframe", purpose: "Shift", sourceIds: ["source-primary"] },
        { beatId: "beat-006", type: "framework", purpose: "Model", sourceIds: ["source-primary"] },
      ],
      cta: { kind: "consultation", destination: "https://example.com", campaignId: "campaign-001" },
      requiredApprovalGates: ["source", "canonical-script", "localization", "voice", "final-render", "publish"],
    });
    const result = await runStrategicSourceAdaptation({
      workspaceRoot: workspace,
      episodeId,
      blueprint,
      profile,
    });
    expect(result.canonicalScript).toContain("Benvenuti.");
    expect(result.adaptation.candidateCanonicalScript.status).toBe("CANDIDATE_UNPUBLISHABLE");
    expect(result.adaptation.provenance.issues).toHaveLength(0);
  });
});
