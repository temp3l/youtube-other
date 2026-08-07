import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { episodeBlueprintSchema } from "@mediaforge/domain";
import { loadStrategicReinventionProfile } from "./profile.js";
import { runStrategicSourceAdaptation } from "./source-adaptation-bridge.js";
import { hashCanonicalSourceBytes } from "./provenance-validation.js";

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

  it("loads a checked-in source manifest when hash matches source bytes", async () => {
    const profile = await loadStrategicReinventionProfile();
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "source-adapt-"));
    temporaryRoots.push(workspace);
    const episodeId = "episode-adapt-manifest";
    const episodeRoot = path.join(workspace, episodeId);
    const sourceText = "Manifest-bound source text for strategic adaptation.";
    const sourceBytes = new TextEncoder().encode(sourceText);
    await fs.mkdir(path.join(episodeRoot, "sources", "content"), { recursive: true });
    await fs.mkdir(path.join(episodeRoot, "sources", "manifests"), { recursive: true });
    await fs.writeFile(path.join(episodeRoot, "sources", "content", "source-primary.md"), sourceText);
    await fs.writeFile(
      path.join(episodeRoot, "sources", "manifests", "source-primary.json"),
      `${JSON.stringify(
        {
          schemaVersion: "1.1",
          sourceId: "source-primary",
          title: "Checked-in manifest",
          owner: "veronica-benini",
          sourceType: "creator-written-note",
          provenance: {
            kind: "file",
            location: "sources/content/source-primary.md",
            originalLanguage: "it",
          },
          accessLevel: "public",
          rights: {
            status: "creator-owned",
            allowedUses: ["adapt", "translate"],
            permittedLocales: ["it", "en", "es"],
            commercialUse: true,
          },
          aiTransformations: {
            structure: true,
            summarize: true,
            adapt: true,
            translate: true,
            syntheticVoice: false,
            syntheticLikeness: false,
          },
          sensitivity: {
            classification: "normal",
            tags: ["none"],
            manualReviewRequired: false,
          },
          sourceHash: hashCanonicalSourceBytes(sourceBytes),
          createdAt: "2026-08-07T10:00:00.000Z",
          approvedAt: "2026-08-07T10:00:00.000Z",
          approvedBy: "reviewer-a",
        },
        null,
        2,
      )}\n`,
    );
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
    expect(result.canonicalScript).toContain("Manifest-bound source text");
    expect(result.adaptation.provenance.issues).toHaveLength(0);
  });

  it("rejects a manifest whose sourceHash does not match source bytes", async () => {
    const profile = await loadStrategicReinventionProfile();
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "source-adapt-"));
    temporaryRoots.push(workspace);
    const episodeId = "episode-adapt-mismatch";
    const episodeRoot = path.join(workspace, episodeId);
    await fs.mkdir(path.join(episodeRoot, "sources", "content"), { recursive: true });
    await fs.mkdir(path.join(episodeRoot, "sources", "manifests"), { recursive: true });
    await fs.writeFile(
      path.join(episodeRoot, "sources", "content", "source-primary.md"),
      "Current source bytes.",
    );
    await fs.writeFile(
      path.join(episodeRoot, "sources", "manifests", "source-primary.json"),
      `${JSON.stringify(
        {
          schemaVersion: "1.1",
          sourceId: "source-primary",
          title: "Stale manifest",
          owner: "veronica-benini",
          sourceType: "creator-written-note",
          provenance: {
            kind: "file",
            location: "sources/content/source-primary.md",
            originalLanguage: "it",
          },
          accessLevel: "public",
          rights: {
            status: "creator-owned",
            allowedUses: ["adapt"],
            permittedLocales: ["it"],
            commercialUse: true,
          },
          aiTransformations: {
            structure: true,
            summarize: true,
            adapt: true,
            translate: false,
            syntheticVoice: false,
            syntheticLikeness: false,
          },
          sensitivity: {
            classification: "normal",
            tags: ["none"],
            manualReviewRequired: false,
          },
          sourceHash: "0".repeat(64),
          createdAt: "2026-08-07T10:00:00.000Z",
          approvedAt: "2026-08-07T10:00:00.000Z",
          approvedBy: "reviewer-a",
        },
        null,
        2,
      )}\n`,
    );
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
      requiredApprovalGates: ["source", "publish"],
    });
    await expect(
      runStrategicSourceAdaptation({
        workspaceRoot: workspace,
        episodeId,
        blueprint,
        profile,
      }),
    ).rejects.toThrow(/sourceHash mismatch/i);
  });
});
