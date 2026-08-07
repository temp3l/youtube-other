import { describe, expect, it } from "vitest";
import { planHistoryVisualsV35 } from "../../src/history-workflow-v35.js";
import {
  isCinematicCameraMovementV35,
  isTemplatedArchivalPurposeV35,
  mapRepresentsGeographicLabelV35,
  validateRequiredGeographyCoverageV35,
} from "../../src/history-visual-semantics-v35.js";

const EPISODES = [
  "history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia",
  "history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire",
  "history-youtube-history-10-video-story-pack-04-black-death",
  "history-youtube-history-10-video-story-pack-05-franklin-expedition",
] as const;

const CORPUS_TESTS = [
  "packages/history/src/history-v35-semantics.unit.test.ts",
  "packages/history/test/acceptance/history-v35-corpus.acceptance.ts",
] as const;

describe("History V3.5 corpus acceptance", () => {
  it("satisfies cross-episode semantic invariants", async () => {
    for (const episodeId of EPISODES) {
      const { plan } = await planHistoryVisualsV35({
        episodeId,
        outputRoot: "episodes",
        force: true,
      });
      expect(plan.schemaVersion).toBe("history-visual-plan.v3.5");
      expect(plan.plannerVersion).toBe("history-visual-planner.v3.5.0");
      expect(plan.trustApproval.productionHistoricalApprovalEligible).toBe(false);
      expect(
        plan.mediaDecisions.every(
          (decision) => !decision.justification.includes("Do not export dangling timeline references.")
        )
      ).toBe(true);

      const templatedPurposes = plan.visualPurposes.filter((purpose) =>
        isTemplatedArchivalPurposeV35(purpose.visualPurpose)
      );
      expect(templatedPurposes.length).toBe(0);

      const cameras = plan.shots
        .map((shot) => shot.cameraMovement)
        .filter((camera) => isCinematicCameraMovementV35(camera));
      expect(cameras.some((camera) => /portrait|reframe/i.test(camera))).toBe(false);

      for (const beat of plan.beats) {
        if (beat.modality !== "map" || !beat.mapStateId) continue;
        const purpose = plan.visualPurposes.find((item) => item.id === beat.visualPurposeId);
        const mapState = plan.mapStates.find((state) => state.id === beat.mapStateId);
        if (!purpose || !mapState) continue;
        const failures = validateRequiredGeographyCoverageV35({
          mapState,
          requiredGeographicQualifierIds: purpose.requiredGeographicQualifierIds,
          geographicQualifiers: plan.geographicQualifiers,
          entities: plan.entities,
        });
        expect(failures, `${episodeId} ${beat.id}`).toEqual([]);
        for (const qualifierId of purpose.requiredGeographicQualifierIds) {
          const qualifier = plan.geographicQualifiers.find((item) => item.id === qualifierId);
          const entity = plan.entities.find((item) => item.id === qualifier?.entityMentionId);
          if (!entity) continue;
          expect(
            mapRepresentsGeographicLabelV35(mapState, entity.normalizedLabel),
            `${episodeId} ${beat.id} missing ${entity.normalizedLabel}`
          ).toBe(true);
        }
      }

      for (const state of plan.timelineStates) {
        if (state.orderingStatus === "valid") {
          const events = plan.timelineEvents.filter((event) =>
            state.eventIds.includes(event.id)
          );
          for (let index = 1; index < events.length; index += 1) {
            const prev = events[index - 1]!.temporalBounds.sortKey.join("-");
            const next = events[index]!.temporalBounds.sortKey.join("-");
            expect(prev <= next, `${episodeId} ${state.id}`).toBe(true);
          }
        }
      }

      for (const doc of plan.documentStates) {
        if (doc.kind === "quotation-card") expect(doc.quotationText).toBeTruthy();
        if (doc.kind === "document-card") expect(doc.sourceDocumentId).toBeTruthy();
        if (doc.kind === "narration-emphasis-card")
          expect(doc.title.toLocaleLowerCase()).toContain("emphasis");
      }

      if (episodeId.includes("franklin")) {
        expect(
          plan.quantitativeQualifiers.some((item) => item.normalizedValue === "134")
        ).toBe(true);
        expect(
          plan.quantitativeQualifiers.some((item) => item.normalizedValue === "129")
        ).toBe(true);
        expect(plan.narration.normalizedText).toMatch(/five men had returned from Greenland/iu);
      }

      if (episodeId.includes("roman-empire")) {
        expect(
          plan.approval.production.blockerCodes.includes("TEXT_ONLY_LONG_WITHOUT_JUSTIFICATION")
        ).toBe(false);
        const inventedRoute = plan.mapStates.flatMap((state) => state.routes).find(
          (route) =>
            route.movingActor === "narrated expedition" &&
            route.origin.label === "Rome" &&
            route.destination.label === "Europe"
        );
        expect(inventedRoute).toBeUndefined();
      }

      expect(CORPUS_TESTS.length).toBeGreaterThan(0);
    }
  }, 240_000);
});
