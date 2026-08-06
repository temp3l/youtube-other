import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildHistoryVisualPlanV31,
  decideHistoryVisualApprovalV31,
  planHistoryVisualsV31,
  renderHistoryVisualApprovalPackV31,
  validateHistoryVisualPlanV31,
} from "./visual-planner-v31.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});

const campaign = `On June 24, 1812, the Grande Armée crossed the Niemen River into the Russian Empire. Napoleon expected to defeat Tsar Alexander the First. Supply distance reduced operational reach because wagons and depots failed. Napoleon advanced from Smolensk toward Moscow. At Borodino the Russian army survived despite a tactical French victory. Napoleon retreated from Moscow toward the Berezina River. Exact losses remain disputed.`;
const roman = `In 476 Odoacer removed Romulus Augustulus in Italy, while Julius Nepos retained a claim and the Eastern Roman Empire survived in Constantinople. Goths crossed the Danube into the Roman Empire. Vandals moved from Spain into North Africa and captured Carthage in 439. Losing tax revenue weakened the Western Roman Empire because armies depended on taxation. Attila and the Huns increased frontier pressure. Roman law and the Roman Senate survived the western court.`;
const disease = `In October 1347 ships arrived at Messina in Sicily from the Black Sea. The Black Death spread through trade routes across Europe, the Middle East, and North Africa. Yersinia pestis caused plague, although transmission ecology remains debated. Jewish communities suffered persecution. Ragusa developed isolation rules. In England the Statute of Labourers attempted to restrict wages after mortality reduced labour supply. Effects differed in Eastern Europe through 1351.`;

describe("History visual planner V3.1", () => {
  it.each([
    ["campaign golden", campaign],
    ["political and territorial golden", roman],
    ["disease-spread golden", disease],
  ])("builds a semantically lintable %s", (_name, narration) => {
    const plan = buildHistoryVisualPlanV31({
      episodeId: "history-golden",
      narration,
      targetDurationMs: 60_000,
    });
    const validation = validateHistoryVisualPlanV31(plan);
    expect(validation.reviewable).toBe(true);
    expect(validation.approvalEligible).toBe(false);
    expect(validation.artifactLint.valid).toBe(true);
    expect(plan.beats.flatMap((beat) => beat.coveredNarrationUnitIds)).toEqual(
      plan.narration.units.map((unit) => unit.id)
    );
    expect(validation.counts.renderVariants).toBe(plan.shots.length * 2);
    expect(
      plan.beats.every((beat) => beat.viewerUnderstanding.length > 20)
    ).toBe(true);
    expect(
      plan.beats.every(
        (beat) =>
          !/historical significance|narrated outcome|complete narration unit/iu.test(
            beat.visualPurpose
          )
      )
    ).toBe(true);
    expect(
      plan.mediaDecisions.every(
        (decision) =>
          decision.adaptations.length === 2 &&
          decision.adaptations.some((adaptation) => adaptation.ratio === "9:16")
      )
    ).toBe(true);
  });

  it("uses accepted entities, typed claims, routes, and domain diagrams", () => {
    const campaignPlan = buildHistoryVisualPlanV31({
      episodeId: "campaign",
      narration: campaign,
    });
    expect(campaignPlan.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalName: "Napoleon Bonaparte",
          type: "person",
        }),
        expect.objectContaining({
          canonicalName: "Grande Armée",
          type: "army-or-formation",
        }),
        expect.objectContaining({
          canonicalName: "Niemen River",
          type: "place",
        }),
      ])
    );
    expect(
      campaignPlan.mapStates.flatMap((state) => state.routes).length
    ).toBeGreaterThan(0);
    expect(
      campaignPlan.diagramStates.some((state) => state.domain === "logistics")
    ).toBe(true);

    const diseasePlan = buildHistoryVisualPlanV31({
      episodeId: "disease",
      narration: disease,
    });
    expect(diseasePlan.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalName: "Yersinia pestis",
          type: "disease-or-pathogen",
        }),
        expect.objectContaining({
          canonicalName: "Statute of Labourers",
          type: "law-or-policy",
        }),
      ])
    );
    expect(
      diseasePlan.mapStates
        .flatMap((state) => state.routes)
        .some((route) => route.type === "disease-transmission")
    ).toBe(true);
  });

  it("keeps hashes deterministic and sensitive to semantic input", () => {
    const first = buildHistoryVisualPlanV31({
      episodeId: "hash",
      narration: roman,
    });
    const second = buildHistoryVisualPlanV31({
      episodeId: "hash",
      narration: roman,
    });
    const changed = buildHistoryVisualPlanV31({
      episodeId: "hash",
      narration: `${roman} Recovery remained uneven.`,
    });
    expect(second.planHash).toBe(first.planHash);
    expect(changed.planHash).not.toBe(first.planHash);
  });

  it("preserves graph, timing, coverage, and semantic-reference invariants", () => {
    for (const narration of [campaign, roman, disease]) {
      const plan = buildHistoryVisualPlanV31({
        episodeId: "property-invariants",
        narration,
      });
      const unitIds = new Set(plan.narration.units.map((unit) => unit.id));
      const entityTypes = new Map(
        plan.entities.map((entity) => [entity.id, entity.type])
      );
      const isGeographicEntity = (entityId: string): boolean =>
        ["place", "state-or-polity", "trade-route"].includes(
          entityTypes.get(entityId) ?? ""
        );
      const entityNames = new Map(
        plan.entities.map((entity) => [
          entity.id,
          entity.canonicalName.toLocaleLowerCase(),
        ])
      );
      const rejectedNames = new Set(
        plan.rejectedEntityCandidates.map((candidate) =>
          candidate.value.toLocaleLowerCase()
        )
      );
      const claimIds = new Set(plan.claims.map((claim) => claim.id));
      const beatIds = new Set(plan.beats.map((beat) => beat.id));
      const assetIds = new Set(plan.assetIntents.map((asset) => asset.id));
      const mapMasterIds = new Set(plan.mapMasters.map((master) => master.id));
      const diagramMasterIds = new Set(
        plan.diagramMasters.map((master) => master.id)
      );

      expect(
        plan.entities.every((entity) =>
          entity.sourceUnitIds.every((unitId) => unitIds.has(unitId))
        )
      ).toBe(true);
      expect(
        plan.mapStates.every(
          (state) =>
            mapMasterIds.has(state.masterId) &&
            state.locationEntityIds.every(
              (entityId) =>
                isGeographicEntity(entityId) &&
                !rejectedNames.has(entityNames.get(entityId) ?? "")
            ) &&
            state.routes.every(
              (route) =>
                isGeographicEntity(route.fromEntityId) &&
                isGeographicEntity(route.toEntityId) &&
                route.claimIds.every((claimId) => claimIds.has(claimId))
            )
        )
      ).toBe(true);
      expect(
        plan.diagramStates.every((state) => {
          const nodeIds = new Set(state.nodes.map((node) => node.id));
          return (
            diagramMasterIds.has(state.masterId) &&
            state.edges.every(
              (edge) =>
                nodeIds.has(edge.fromNodeId) &&
                nodeIds.has(edge.toNodeId) &&
                edge.claimIds.every((claimId) => claimIds.has(claimId))
            )
          );
        })
      ).toBe(true);
      expect(
        plan.shots.every(
          (shot, index) =>
            beatIds.has(shot.beatId) &&
            assetIds.has(shot.assetIntentId) &&
            shot.startMs < shot.endMs &&
            (index === 0 || plan.shots[index - 1]!.endMs <= shot.startMs)
        )
      ).toBe(true);
      expect(
        plan.beats.flatMap((beat) => beat.coveredNarrationUnitIds).sort()
      ).toEqual([...unitIds].sort());
      expect(
        plan.beats.every((beat) =>
          beat.claimIds.every((claimId) => claimIds.has(claimId))
        )
      ).toBe(true);
      expect(
        plan.mediaDecisions.every(
          (decision) =>
            decision.adaptations.length === 2 &&
            decision.adaptations.some(
              (adaptation) => adaptation.ratio === "16:9"
            ) &&
            decision.adaptations.some(
              (adaptation) => adaptation.ratio === "9:16"
            )
        )
      ).toBe(true);
    }
  });

  it("rejects time-only duplicate anchors and known placeholders", () => {
    const plan = buildHistoryVisualPlanV31({
      episodeId: "invalid",
      narration: campaign,
    });
    const firstSequence = plan.shots.find((shot) =>
      plan.shots.some(
        (other) => other.sequenceId === shot.sequenceId && other.id !== shot.id
      )
    )!;
    const sequence = plan.shots.filter(
      (shot) => shot.sequenceId === firstSequence.sequenceId
    );
    const broken = {
      ...plan,
      beats: plan.beats.map((beat, index) =>
        index === 0
          ? {
              ...beat,
              visualPurpose:
                "Show the viewer the historical significance of this without extending its claim.",
            }
          : beat
      ),
      shots: plan.shots.map((shot) =>
        sequence.includes(shot)
          ? {
              ...shot,
              editorialFunction: firstSequence.editorialFunction,
              assetIntentId: firstSequence.assetIntentId,
              compositionIntent: firstSequence.compositionIntent,
              cameraOrMotionIntent: firstSequence.cameraOrMotionIntent,
            }
          : shot
      ),
    };
    const lint = validateHistoryVisualPlanV31(broken).artifactLint;
    expect(lint.valid).toBe(false);
    expect(lint.duplicateAnchorShotCount).toBeGreaterThan(0);
    expect(lint.genericPurposeRate).toBeGreaterThan(0);
  });

  it("keeps a timing-conflict pack reviewable and omits approval commands", async () => {
    const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "history-v31-"));
    roots.push(outputRoot);
    const episodeId = "history-v31-blocked";
    const episode = path.join(outputRoot, episodeId);
    await fs.mkdir(path.join(episode, "languages"), { recursive: true });
    await fs.mkdir(path.join(episode, "source"), { recursive: true });
    await fs.writeFile(
      path.join(episode, "languages", "script-en.md"),
      campaign
    );
    await fs.writeFile(
      path.join(episode, "source", "normalized-metadata.json"),
      JSON.stringify({ runtime: { targetDurationMinutes: 1 } })
    );
    const result = await planHistoryVisualsV31({ episodeId, outputRoot });
    const pack = renderHistoryVisualApprovalPackV31(
      result.plan,
      result.validation
    );
    expect(pack).toContain("Semantic quality diagnostics and red flags");
    expect(pack).not.toContain(`visuals approve ${episodeId}`);
    await expect(
      decideHistoryVisualApprovalV31({
        episodeId,
        outputRoot,
        decision: "APPROVED",
        planHash: result.plan.planHash,
      })
    ).rejects.toThrow("blocked");
  });
});
