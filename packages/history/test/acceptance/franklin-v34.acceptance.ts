import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRejectedEntityTextV34 } from "../../src/history-claims-v34.js";
import {
  type HistoryEntityMentionV34,
  type HistoryMapStateV34,
  type HistoryVisualPlanV34,
} from "../../src/history-v34-contracts.js";
import { isGenericVisualPurposeText } from "../../src/history-visual-semantics-v34.js";
import { buildHistoryValidationSnapshotV34 } from "../../src/visual-planner-v34.js";
import { createHistoryApprovalPackV34 } from "../../src/history-workflow-v34.js";

const FRANKLIN_EPISODE =
  "history-youtube-history-10-video-story-pack-05-franklin-expedition";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");
const EPISODES_ROOT = path.join(REPO_ROOT, "episodes");

const PLACEHOLDER_COORDINATES = new Set([
  "[0,0]",
  "[1,1]",
  "[0, 0]",
  "[1, 1]",
]);

const REQUIRED_ENTITY_TYPES: ReadonlyArray<{
  readonly label: string;
  readonly types: readonly string[];
}> = [
  { label: "Royal Navy", types: ["organization"] },
  { label: "Sir John Franklin", types: ["person"] },
  { label: "Francis Crozier", types: ["person"] },
  { label: "James Fitzjames", types: ["person"] },
  { label: "HMS Erebus", types: ["ship"] },
  { label: "HMS Terror", types: ["ship"] },
  { label: "Britain", types: ["state", "place"] },
  { label: "Baffin Bay", types: ["water-body"] },
  { label: "Beechey Island", types: ["place", "island"] },
  { label: "King William Island", types: ["place", "island"] },
  { label: "Back River", types: ["water-body", "place", "river"] },
  { label: "Northwest Passage", types: ["region", "water-body", "place"] },
];

const roots: string[] = [];

afterAll(async () => {
  await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })));
});

function coordinatesKey(
  coordinates: readonly [number, number] | null | undefined
): string | null {
  if (!coordinates) return null;
  return JSON.stringify(coordinates);
}

function assertNoPlaceholderCoordinates(mapStates: readonly HistoryMapStateV34[]): void {
  for (const state of mapStates) {
    for (const route of state.routes) {
      for (const endpoint of [route.origin, route.destination]) {
        const key = coordinatesKey(endpoint.coordinates);
        expect(
          key,
          `placeholder coordinates on ${state.id} route ${route.id} endpoint ${endpoint.label}`
        ).not.toBeNull();
        expect(PLACEHOLDER_COORDINATES.has(key!)).toBe(false);
      }
    }
  }
}

function assertMapActorQuality(mapStates: readonly HistoryMapStateV34[]): void {
  for (const state of mapStates) {
    for (const route of state.routes) {
      expect(isRejectedEntityTextV34(route.movingActor).reject).toBe(false);
      expect(route.movingActor.trim().length).toBeGreaterThan(0);
      for (const leader of route.leaders) {
        expect(isRejectedEntityTextV34(leader).reject).toBe(false);
      }
      for (const endpoint of [route.origin.label, route.destination.label]) {
        expect(isRejectedEntityTextV34(endpoint).reject).toBe(false);
      }
    }
  }
}

function entityTypeForLabel(
  entities: readonly HistoryEntityMentionV34[],
  label: string
): string | undefined {
  return entities.find((entity) => entity.normalizedLabel === label)?.entityType;
}

function assertFranklinEntityTyping(entities: readonly HistoryEntityMentionV34[]): void {
  for (const requirement of REQUIRED_ENTITY_TYPES) {
    const entityType = entityTypeForLabel(entities, requirement.label);
    expect(entityType, `missing entity ${requirement.label}`).toBeTruthy();
    expect(
      requirement.types,
      `unexpected type for ${requirement.label}: ${entityType}`
    ).toContain(entityType!);
  }
}

function assertFranklinQualifierBehavior(plan: HistoryVisualPlanV34): void {
  const temporalValues = plan.temporalQualifiers.map((item) => item.normalizedValue);
  expect(temporalValues.some((value) => /May 1845/iu.test(value))).toBe(true);
  expect(temporalValues.some((value) => /June 11, 1847/iu.test(value))).toBe(true);
  expect(temporalValues.some((value) => /April 22, 1848/iu.test(value))).toBe(true);

  const counts = plan.quantitativeQualifiers.filter((item) => item.kind === "count");
  expect(counts.some((item) => item.normalizedValue === "105")).toBe(true);
  expect(counts.some((item) => item.normalizedValue === "129")).toBe(true);
  expect(
    counts.some((item) => /^(11|22)$/u.test(item.normalizedValue)),
    "day components must not become standalone counts"
  ).toBe(false);

  expect(plan.temporalQualifiers.some((item) => /2014|2016/u.test(item.normalizedValue))).toBe(
    true
  );
}

function assertFranklinMapSemantics(plan: HistoryVisualPlanV34): void {
  const routes = plan.mapStates.flatMap((state) => state.routes);
  expect(routes.some((route) => route.routeType === "maritime")).toBe(true);
  expect(routes.every((route) => route.originPlaceId !== route.destinationPlaceId)).toBe(true);
  expect(
    routes.some(
      (route) =>
        route.routeType === "overland" &&
        route.origin.label === "King William Island" &&
        route.destination.label === "Back River" &&
        route.movingActor === "surviving expedition members" &&
        route.leaders.includes("Francis Crozier") &&
        route.leaders.includes("James Fitzjames")
    )
  ).toBe(true);

  const discoveryMaps = plan.mapStates.filter(
    (state) => state.mapPurpose === "discovery-location"
  );
  expect(discoveryMaps.length).toBeGreaterThanOrEqual(1);
  expect(discoveryMaps.some((state) => state.labels.some((label) => /Terror Bay/iu.test(label.text)))).toBe(true);
  expect(discoveryMaps.some((state) => state.labels.some((label) => /King William Island/iu.test(label.text)) && state.routes.length === 0)).toBe(false);

  const evidenceDiagram = plan.diagramStates.find(
    (state) => state.diagramType === "evidence-set"
  );
  expect(evidenceDiagram).toBeTruthy();
  expect(evidenceDiagram?.edges ?? []).toEqual([]);

  const labels = new Set(
    plan.mapStates.flatMap((state) => [
      ...state.labels.map((label) => label.text),
      ...state.routes.flatMap((route) => [route.origin.label, route.destination.label]),
    ])
  );
  for (const place of ["Britain", "Baffin Bay", "Beechey Island", "King William Island"]) {
    expect(labels.has(place), `expected map coverage for ${place}`).toBe(true);
  }

  const wreckYears = plan.temporalQualifiers
    .map((item) => item.normalizedValue)
    .filter((value) => /2014|2016/u.test(value));
  expect(wreckYears.length).toBeGreaterThanOrEqual(2);
}

function assertPacingThresholds(plan: HistoryVisualPlanV34): void {
  const sceneCount = plan.beats.length;
  const visualUpdates = plan.shots.length;
  const totalSeconds = plan.timing.totalDurationMs / 1000;
  const averageUpdateInterval = totalSeconds / visualUpdates;
  const openingUpdates = plan.shots.filter((shot) => shot.startMs < 30_000).length;

  expect(sceneCount).toBeGreaterThanOrEqual(45);
  expect(sceneCount).toBeLessThanOrEqual(75);
  expect(visualUpdates).toBeGreaterThanOrEqual(70);
  expect(visualUpdates).toBeLessThanOrEqual(95);
  expect(averageUpdateInterval).toBeGreaterThanOrEqual(6.5);
  expect(averageUpdateInterval).toBeLessThanOrEqual(9.5);
  expect(openingUpdates).toBeGreaterThanOrEqual(4);
}

function assertPlanContract(plan: HistoryVisualPlanV34): void {
  expect(plan.sourceAuthorityMode).toBe("trusted-script");
  expect(plan.schemaVersion).toBe("history-visual-plan.v3.4");

  expect(plan.mapStates.length).toBeGreaterThanOrEqual(4);
  expect(plan.diagramStates.length).toBeGreaterThanOrEqual(1);

  assertNoPlaceholderCoordinates(plan.mapStates);
  assertMapActorQuality(plan.mapStates);
  assertFranklinEntityTyping(plan.entities);
  assertFranklinQualifierBehavior(plan);
  assertFranklinMapSemantics(plan);
  assertPacingThresholds(plan);

  for (const beat of plan.beats) {
    if (beat.modality === "map") {
      expect(beat.mapStateId, `${beat.id} missing map state`).toBeTruthy();
      expect(
        plan.mapStates.some((state) => state.id === beat.mapStateId),
        `${beat.id} dangling map state`
      ).toBe(true);
    }
    if (beat.modality === "diagram") {
      expect(beat.diagramStateId, `${beat.id} missing diagram state`).toBeTruthy();
      expect(
        plan.diagramStates.some((state) => state.id === beat.diagramStateId),
        `${beat.id} dangling diagram state`
      ).toBe(true);
    }
    if (beat.modality === "timeline") {
      const timelineState = plan.timelineStates.find((state) => state.id === beat.timelineStateId);
      expect(timelineState, `${beat.id} missing timeline state`).toBeTruthy();
      expect((timelineState?.eventIds.length ?? 0)).toBeGreaterThanOrEqual(2);
    }

    const ratios = plan.aspectRatioPlans.filter((ratio) => ratio.beatId === beat.id);
    expect(ratios.some((ratio) => ratio.ratio === "16:9"), `${beat.id} missing 16:9`).toBe(true);
    expect(ratios.some((ratio) => ratio.ratio === "9:16"), `${beat.id} missing 9:16`).toBe(true);
    for (const ratio of ratios) {
      expect(ratio.evaluated, `${ratio.id} not evaluated`).toBe(true);
    }
  }

  expect(plan.qualityMetrics.passes).toBe(true);
  expect(plan.approval.editoriallyReviewable).toBe(true);
  expect(plan.approval.contentApprovalEligible).toBe(true);
  expect(plan.approval.structurallyValid).toBe(true);
  expect(plan.claims.every((claim) => claim.independentlyVerified === false)).toBe(true);
  expect(
    plan.visualPurposes.every((purpose) => !isGenericVisualPurposeText(purpose.visualPurpose))
  ).toBe(true);
  const reconstructionPolicies = new Set(plan.shots.map((shot) => shot.reconstructionPolicy));
  expect(
    reconstructionPolicies.has("documented-archival") || reconstructionPolicies.has("map-or-diagram")
  ).toBe(true);
  expect(reconstructionPolicies.has("not-applicable")).toBe(true);
  expect(plan.approval.productionApprovalEligible).toBe(false);
  expect(plan.approval.production.blockerCodes).toEqual(
    expect.arrayContaining(["TIMING_MEASUREMENT_REQUIRED"])
  );
  expect(plan.approval.production.blockerCodes).not.toContain(
    "TEXT_ONLY_LONG_WITHOUT_JUSTIFICATION"
  );

  const longTextOnly = plan.beats.filter(
    (beat) =>
      beat.modality === "text-only transition" && beat.endMs - beat.startMs > 12_000
  );
  expect(longTextOnly).toEqual([]);
}

async function loadJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, "utf8")) as T;
}

describe("Franklin Expedition V3.4 generated-artifact acceptance", () => {
  it(
    "generates a trusted-script approval pack that satisfies Franklin fixture contracts and determinism",
    async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "franklin-v34-acceptance-"));
      roots.push(root);
      const output = path.join(root, "approval", FRANKLIN_EPISODE);

      const first = await createHistoryApprovalPackV34({
        episodeId: FRANKLIN_EPISODE,
        output,
        outputRoot: EPISODES_ROOT,
        regenerate: true,
        testSummary: {
          status: "franklin-v34-acceptance",
          testFile: "packages/history/test/acceptance/franklin-v34.acceptance.ts",
        },
      });

      const second = await createHistoryApprovalPackV34({
        episodeId: FRANKLIN_EPISODE,
        output,
        outputRoot: EPISODES_ROOT,
        regenerate: true,
        testSummary: {
          status: "franklin-v34-acceptance",
          testFile: "packages/history/test/acceptance/franklin-v34.acceptance.ts",
        },
      });
      expect(second.planHash).toBe(first.planHash);

      const plan = await loadJson<HistoryVisualPlanV34>(path.join(output, "plan.json"));
      const authoringMode = await loadJson<{
        readonly sourceAuthorityMode: string;
        readonly research: {
          readonly providerCalls: number;
          readonly webSearchCalls: number;
        };
      }>(path.join(output, "authoring-mode.json"));
      const plannerConfig = await loadJson<{
        readonly semanticStructuringDefault: boolean;
        readonly sourceAuthorityMode: string;
      }>(path.join(output, "planner-config.json"));

      expect(authoringMode.sourceAuthorityMode).toBe("trusted-script");
      expect(authoringMode.research.providerCalls).toBe(0);
      expect(authoringMode.research.webSearchCalls).toBe(0);
      expect(plannerConfig.semanticStructuringDefault).toBe(false);
      expect(plannerConfig.sourceAuthorityMode).toBe("trusted-script");

      assertPlanContract(plan);

      const exportedValidation = await loadJson<{
        readonly productionApprovalEligible: boolean;
        readonly productionBlockerCodes: readonly string[];
        readonly diagnostics: readonly { readonly code: string }[];
      }>(path.join(output, "validation.json"));
      const validationSnapshot = buildHistoryValidationSnapshotV34(plan);
      expect(exportedValidation.productionApprovalEligible).toBe(
        validationSnapshot.productionApprovalEligible
      );
      expect(exportedValidation.productionBlockerCodes).toEqual(plan.approval.production.blockerCodes);
      expect(
        exportedValidation.diagnostics.map((item) => item.code).sort()
      ).toEqual(plan.diagnostics.map((item) => item.code).sort());

      const expeditionMap = plan.mapStates.find((state) => state.mapPurpose === "expedition-route");
      const baffinLabel = expeditionMap?.labels.find((label) => label.text === "Baffin Bay");
      expect(baffinLabel?.provenance).toBe("episode-context");
      expect(baffinLabel?.linkedClaimIds).toEqual([]);

      const checksumLines = (await fs.readFile(path.join(output, "checksums.sha256"), "utf8"))
        .trim()
        .split("\n");
      for (const line of checksumLines) {
        const [expected, file] = line.split(/\s{2}/u);
        const bytes = await fs.readFile(path.join(output, file!));
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(expected);
      }

      const determinism = await loadJson<{
        readonly byteEqualityResult: boolean;
        readonly contentDeterminismResult: boolean;
        readonly firstRunHashes: { readonly planHash: string; readonly contentHash: string };
        readonly secondRunHashes: { readonly planHash: string; readonly contentHash: string };
      }>(path.join(output, "determinism-report.json"));
      expect(determinism.byteEqualityResult).toBe(false);
      expect(determinism.contentDeterminismResult).toBe(true);
      expect(determinism.firstRunHashes.planHash).toBe(determinism.secondRunHashes.planHash);
      expect(determinism.firstRunHashes.contentHash).toBe(determinism.secondRunHashes.contentHash);
      expect(determinism.firstRunHashes.planHash).toBe(first.planHash);
    },
    120_000
  );
});
