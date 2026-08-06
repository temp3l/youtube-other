import { describe, expect, it } from "vitest";
import { buildHistoryEditorialPlanV31 } from "./history-editorial-v31.js";

describe("history editorial v3.1 helper", () => {
  it("creates semantic beats, evidence-aware decisions, diverse anchor shots, and real ratio adaptations", () => {
    const plan = buildHistoryEditorialPlanV31({
      narrationUnits: [
        {
          id: "u1",
          text: "The army crossed the river and advanced toward the capital.",
        },
        {
          id: "u2",
          text: "Because supply wagons failed to arrive, the campaign lost momentum.",
        },
        { id: "u3", text: "The king's decree recorded the new tax burden." },
      ],
      claims: [
        {
          id: "c1",
          text: "The decree recorded the tax.",
          narrationUnitIds: ["u3"],
          sourceStatus: "resolved",
          evidenceReferenceIds: ["archive-1"],
        },
      ],
      beats: [
        { id: "b1", narrationUnitIds: ["u1"], importance: 5 },
        { id: "b2", narrationUnitIds: ["u2"], importance: 4 },
        { id: "b3", narrationUnitIds: ["u3"], claimIds: ["c1"] },
      ],
    });
    expect(
      plan.beats.every(
        (beat) =>
          beat.viewerUnderstanding &&
          beat.visualPurpose &&
          beat.editorialRole &&
          beat.narrationOverlap <= 0.35 &&
          beat.purposeConfidence > 0
      )
    ).toBe(true);
    expect(
      plan.diagnostics.some(
        (diagnostic) => diagnostic.code === "genericPurposeTemplate"
      )
    ).toBe(false);
    expect(
      plan.mediaDecisions.map((decision) => decision.selectedMediaType)
    ).toEqual(["animated-map", "diagram", "document"]);
    expect(
      new Set(plan.mediaDecisions.map((decision) => decision.confidence)).size
    ).toBeGreaterThan(1);
    expect(
      plan.mediaDecisions.every(
        (decision) =>
          decision.adaptations.length === 2 &&
          decision.adaptations.every(
            (adaptation) =>
              adaptation.focalRegion.length > 8 &&
              adaptation.protectedSubjects.every(
                (subject) => !/primary|claim-bearing/iu.test(subject)
              ) &&
              adaptation.textSafeZones.length > 0 &&
              adaptation.reason.length > 20
          )
      )
    ).toBe(true);
    const anchor = plan.shots.filter(
      (shot) => shot.sequenceId === "sequence-b1"
    );
    expect(anchor).toHaveLength(2);
    expect(
      new Set(
        anchor.map(
          (shot) =>
            `${shot.editorialFunction}/${shot.compositionIntent}/${shot.cameraOrMotionIntent}`
        )
      ).size
    ).toBe(2);
  });

  it("reports repeated editorial-role clusters for review", () => {
    const plan = buildHistoryEditorialPlanV31({
      narrationUnits: ["u1", "u2", "u3", "u4", "u5", "u6"].map((id) => ({
        id,
        text: "Because rain delayed the army.",
      })),
    });
    expect(
      plan.diagnostics.some(
        (diagnostic) => diagnostic.code === "purposeCluster"
      )
    ).toBe(true);
  });

  it("uses media-specific portrait and document ratio plans without generic focal placeholders", () => {
    const plan = buildHistoryEditorialPlanV31({
      narrationUnits: [
        { id: "u1", text: "The queen addressed the council from the palace." },
        { id: "u2", text: "A decree recorded the revised tax." },
      ],
      claims: [
        {
          id: "c1",
          text: "The decree recorded the revised tax.",
          narrationUnitIds: ["u2"],
          sourceStatus: "resolved",
        },
      ],
      beats: [
        { id: "portrait", narrationUnitIds: ["u1"], editorialRole: "context" },
        {
          id: "document",
          narrationUnitIds: ["u2"],
          claimIds: ["c1"],
          editorialRole: "evidence",
        },
      ],
    });
    const portrait = plan.mediaDecisions[0]!.adaptations.find(
      (adaptation) => adaptation.ratio === "9:16"
    )!;
    const document = plan.mediaDecisions[1]!.adaptations.find(
      (adaptation) => adaptation.ratio === "9:16"
    )!;
    expect(portrait.strategy).toBe("face-safe portrait crop");
    expect(portrait.protectedSubjects).toContain("face");
    expect(document.strategy).toBe("vertical evidence close-up");
    expect(document.labelPriority).toContain("source attribution");
    expect(
      plan.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "genericPurposeRate" ||
          diagnostic.code === "narrationPurposeOverlap"
      )
    ).toBe(false);
  });
});
