import { describe, expect, it } from "vitest";
import { planHistoryVisualsV35 } from "../../src/history-workflow-v35.js";
import { assessPlanningAcceptanceV35 } from "../../src/history-planning-acceptance-v35.js";
import {
  isCinematicCameraMovementV35,
  isTemplatedArchivalPurposeV35,
  mapRepresentsGeographicLabelV35,
  validateRequiredGeographyCoverageV35,
} from "../../src/history-visual-semantics-v35.js";
import { validatePlanStateEvidenceClosureV35 } from "../../src/history-state-evidence-closure-v35.js";

const EPISODES = [
  "history-youtube-history-10-video-story-pack-01-bronze-age-collapse",
  "history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia",
  "history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire",
  "history-youtube-history-10-video-story-pack-04-black-death",
  "history-youtube-history-10-video-story-pack-05-franklin-expedition",
  "history-youtube-history-10-video-story-pack-06-mongol-war-machine",
  "history-youtube-history-10-video-story-pack-08-cuban-missile-crisis",
  "history-youtube-history-10-video-story-pack-10-titanic-decisions-disaster",
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
      expect(plan.trustApproval.productionHistoricalApprovalEligible).toBe(true);
      const planningAcceptance = assessPlanningAcceptanceV35(plan);
      expect(
        planningAcceptance.unexpectedProductionBlockers,
        `${episodeId} unexpected blockers: ${planningAcceptance.unexpectedProductionBlockers.join(", ")}`
      ).toEqual([]);
      for (const state of plan.diagramStates) {
        if (state.blockerCodes.length) {
          expect(state.semanticStatus, `${episodeId} ${state.id}`).toBe("blocked");
        }
      }
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
          plan.quantitativeQualifiers.some((item) => item.normalizedValue === "129")
        ).toBe(true);
        expect(
          plan.quantitativeQualifiers.some((item) => item.normalizedValue === "134")
        ).toBe(false);
        expect(plan.narration.normalizedText).toMatch(/129 officers and men/iu);
        expect(plan.narration.normalizedText).toMatch(
          /wreck of Terror, with hatches closed and much of its interior preserved/iu
        );
      }

      if (episodeId.includes("roman-empire")) {
        expect(
          plan.approval.production.blockerCodes.includes("TEXT_ONLY_LONG_WITHOUT_JUSTIFICATION")
        ).toBe(false);
        expect(
          plan.entities.some((entity) => entity.normalizedLabel === "Black Death")
        ).toBe(false);
        const inventedRoute = plan.mapStates.flatMap((state) => state.routes).find(
          (route) =>
            route.movingActor === "narrated expedition" &&
            route.origin.label === "Rome" &&
            route.destination.label === "Europe"
        );
        expect(inventedRoute).toBeUndefined();
      }

      if (episodeId.includes("mongol-war-machine")) {
        expect(
          plan.entities.some((entity) => entity.normalizedLabel === "HMS Terror")
        ).toBe(false);
        expect(
          plan.visualConcepts.every((concept) => concept.historicalSubject !== "HMS Terror")
        ).toBe(true);
        expect(
          plan.entities.map((entity) => entity.normalizedLabel)
        ).toEqual(expect.arrayContaining(["Genghis Khan"]));
      }

      if (episodeId.includes("cuban-missile-crisis")) {
        const labels = plan.entities.map((entity) => entity.normalizedLabel);
        expect(labels).toEqual(
          expect.arrayContaining([
            "Fidel Castro",
            "Soviet Union",
            "Nikita Khrushchev",
            "United States",
          ])
        );
      }

      if (episodeId.includes("titanic")) {
        const labels = plan.entities.map((entity) => entity.normalizedLabel);
        expect(labels).toEqual(
          expect.arrayContaining(["RMS Titanic", "RMS Carpathia", "North Atlantic"])
        );
      }

      if (episodeId.includes("black-death")) {
        const evidenceFailures = validatePlanStateEvidenceClosureV35({
          shots: plan.shots,
          diagramStates: plan.diagramStates,
          mapStates: plan.mapStates,
        });
        expect(evidenceFailures, `${episodeId} evidence closure`).toEqual([]);
        for (const state of plan.diagramStates) {
          if (state.blockerCodes.includes("STATE_BOUND_SHOT_UNSUPPORTED_CLAIM")) {
            expect(state.semanticStatus, state.id).toBe("blocked");
          }
        }
      }

      const planEvidenceFailures = validatePlanStateEvidenceClosureV35({
        shots: plan.shots,
        diagramStates: plan.diagramStates,
        mapStates: plan.mapStates,
      });
      expect(planEvidenceFailures, `${episodeId} state evidence closure`).toEqual([]);

      expect(CORPUS_TESTS.length).toBeGreaterThan(0);
    }
  }, 240_000);
});
