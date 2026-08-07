#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeDiagramRenderSignatureV35,
  evaluateShotEffectiveChangeV35,
} from "../packages/history/src/history-effective-change-v35.js";
import { assessVisualSemanticCoverageV35 } from "../packages/history/src/history-visual-semantics-v35.js";
import { isCredibleGeographicCandidateV35 } from "../packages/history/src/history-claims-v34.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packRoot = path.join(
  repoRoot,
  "artifacts/chatgpt-review/history-approval-packs-v3.5"
);

const EPISODES = [
  { num: "01", slug: "history-youtube-history-10-video-story-pack-01-bronze-age-collapse", short: "Bronze Age" },
  { num: "02", slug: "history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia", short: "Napoleon" },
  { num: "03", slug: "history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire", short: "Roman Empire" },
  { num: "04", slug: "history-youtube-history-10-video-story-pack-04-black-death", short: "Black Death" },
  { num: "05", slug: "history-youtube-history-10-video-story-pack-05-franklin-expedition", short: "Franklin" },
];

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function independentRepetitionSanity(plan) {
  const keys = new Map();
  for (const concept of plan.visualConcepts) {
    const purpose = plan.visualPurposes.find((item) => item.id === concept.visualPurposeId);
    const beat = plan.beats.find((item) => item.visualPurposeId === concept.visualPurposeId);
    const key = [
      concept.primarySubject?.toLocaleLowerCase() ?? "",
      concept.setting?.toLocaleLowerCase() ?? "",
      concept.compositionArchetype?.toLocaleLowerCase() ?? "",
      purpose?.visualFunction ?? "",
      beat?.modality ?? "",
    ].join("|");
    keys.set(key, (keys.get(key) ?? 0) + 1);
  }
  const total = plan.visualConcepts.length;
  const duplicateExcess = [...keys.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  return total ? duplicateExcess / total : 0;
}

function buildGeographyReport(plan) {
  const geographicEntities = plan.entities.filter((entity) =>
    ["place", "region", "water-body", "state", "island"].includes(entity.entityType)
  );
  const credibleRejectedGeographic = plan.rejectedEntities.filter((item) =>
    isCredibleGeographicCandidateV35({ text: item.text })
  );
  const nonGeographicRejectedSurfaces = plan.rejectedEntities.filter(
    (item) => !isCredibleGeographicCandidateV35({ text: item.text })
  );
  const credibleGeographicCandidates =
    geographicEntities.length + credibleRejectedGeographic.length;
  const coverageRate =
    credibleGeographicCandidates > 0
      ? geographicEntities.length / credibleGeographicCandidates
      : 1;
  return {
    credibleGeographicCandidates,
    resolvedGeographicCandidates: geographicEntities.length,
    unresolvedGeographicCandidates: credibleRejectedGeographic.map((item) => item.text),
    ambiguousCandidates: 0,
    nonGeographicRejectedSurfaces: nonGeographicRejectedSurfaces.length,
    coverageRate,
    coverageDiagnostics: assessVisualSemanticCoverageV35({
      entities: plan.entities,
      rejectedEntities: plan.rejectedEntities,
      beats: plan.beats,
      mapStates: plan.mapStates,
      diagramStates: plan.diagramStates,
      visualOpportunitySummary: plan.visualOpportunitySummary,
    }).map((item) => item.code),
  };
}

function countNonGeographicInDenominator(plan) {
  return buildGeographyReport(plan).nonGeographicRejectedSurfaces;
}

function auditNapoleonMaps(mapStates) {
  const defects = [];
  for (const state of mapStates) {
    for (const route of state.routes ?? []) {
      const origin = route.origin?.label ?? "";
      const destination = route.destination?.label ?? "";
      if (origin === "Smolensk" && destination === "Russia") {
        defects.push(`${state.id}: Smolensk -> Russia centroid route`);
      }
      if (origin === "Niemen River" && destination === "Russia" && route.routeType !== "overland") {
        defects.push(`${state.id}: Niemen -> Russia generic journey`);
      }
      if (origin && destination && origin !== destination && route.movingActor === "narrated expedition") {
        defects.push(`${state.id}: unsupported narrated expedition movement ${origin} -> ${destination}`);
      }
    }
  }
  return defects;
}

function auditBlackDeathDiagrams(plan) {
  const states = plan.diagramStates ?? [];
  const stateById = new Map(states.map((item) => [item.id, item]));
  const diagramShots = plan.shots.filter((shot) => {
    const beat = plan.beats.find((item) => item.id === shot.beatId);
    return beat?.modality === "diagram";
  });
  const signatures = states.map((state) => ({
    stateId: state.id,
    masterId: state.masterId,
    signature: computeDiagramRenderSignatureV35(state),
    nodes: state.nodes.map((node) => node.label).join(" | "),
    edges: state.edges
      .map((edge) => {
        const from = state.nodes.find((node) => node.id === edge.fromNodeId)?.label ?? edge.fromNodeId;
        const to = state.nodes.find((node) => node.id === edge.toNodeId)?.label ?? edge.toNodeId;
        return `${from}->${to}:${edge.relationship}`;
      })
      .join(" | "),
  }));
  let provenanceOnly = 0;
  for (let index = 1; index < diagramShots.length; index += 1) {
    const priorShot = diagramShots[index - 1];
    const shot = diagramShots[index];
    const priorState = priorShot.modalityStateReference
      ? stateById.get(priorShot.modalityStateReference)
      : null;
    const nextState = shot.modalityStateReference
      ? stateById.get(shot.modalityStateReference)
      : null;
    if (!priorState || !nextState) continue;
    const priorSignature = computeDiagramRenderSignatureV35(priorState);
    const nextSignature = computeDiagramRenderSignatureV35(nextState);
    const change = evaluateShotEffectiveChangeV35({
      shot,
      priorShot,
      modality: "diagram",
      priorModality: "diagram",
      diagramState: nextState,
      priorDiagramState: priorState,
    });
    if (priorSignature === nextSignature && change.resetsVisualClock) provenanceOnly += 1;
  }
  const duplicatePairs = [];
  for (let left = 0; left < signatures.length; left += 1) {
    for (let right = left + 1; right < signatures.length; right += 1) {
      if (signatures[left].signature === signatures[right].signature) {
        duplicatePairs.push([signatures[left].stateId, signatures[right].stateId]);
      }
    }
  }
  return { signatures, provenanceOnly, duplicatePairs };
}

async function verifyChecksums(dir) {
  const checksumFile = path.join(dir, "checksums.sha256");
  const text = await fs.readFile(checksumFile, "utf8");
  const lines = text.trim().split("\n").filter(Boolean);
  for (const line of lines) {
    const [expected, relative] = line.split(/\s{2,}/u);
    const file = path.join(dir, relative);
    const content = await fs.readFile(file);
    const crypto = await import("node:crypto");
    const actual = crypto.createHash("sha256").update(content).digest("hex");
    if (actual !== expected) return false;
  }
  return true;
}

const report = { episodes: [], assertions: {}, paths: {} };

for (const episode of EPISODES) {
  const dir = path.join(packRoot, `${episode.slug}-v3.5`);
  const plan = await readJson(path.join(dir, "plan.json"));
  const quality = await readJson(path.join(dir, "quality-metrics.json"));
  const geography = buildGeographyReport(plan);
  const ratioPlans = plan.aspectRatioPlans ?? [];
  const ratio169Conflicts = ratioPlans.filter(
    (item) => item.ratio === "16:9" && item.conflictDiagnostics?.length
  ).length;
  const ratio916Conflicts = ratioPlans.filter(
    (item) => item.ratio === "9:16" && item.conflictDiagnostics?.length
  ).length;
  const textDensityFailures = ratioPlans.filter((item) => item.textDensityResult === "fail").length;
  const runtimeMs = plan.narration?.durationEstimateMs ?? plan.durationEstimateMs ?? 0;
  const shots = plan.shots.length;
  const beats = plan.beats.length;
  const maps = plan.mapStates.length;
  const diagrams = plan.diagramStates.length;
  const shotsPerMinute = runtimeMs ? shots / (runtimeMs / 60000) : 0;
  const avgShotDuration = shots ? runtimeMs / shots : 0;
  const longStaticShare = quality.longStaticRuntimeShare ?? quality.strongLongStaticRuntimeShare ?? 0;
  const topClusters = quality.duplicateClusters
    .filter((cluster) => cluster.kind === "viewer-concept")
    .slice(0, 3)
    .map((cluster) => ({
      signature: cluster.signature,
      beats: cluster.beatIds,
      count: cluster.occurrenceCount,
    }));

  const episodeReport = {
    episode: episode.short,
    episodeId: episode.slug,
    zipPath: path.join(packRoot, `${episode.slug}-v3.5.zip`),
    runtimeMin: (runtimeMs / 60000).toFixed(1),
    beats,
    shots,
    maps,
    diagrams,
    repetition: {
      viewerConceptRepetitionRate: quality.viewerConceptRepetitionRate,
      templateRepetitionRate: quality.templateRepetitionRate,
      threshold: quality.thresholds.maxViewerConceptDuplicateRate,
      topClusters,
      editorialResult: plan.approval.editorial.state,
      independentSanityRate: independentRepetitionSanity(plan),
    },
    geography,
    bronzeAge:
      episode.num === "01"
        ? {
            acceptedEntities: plan.entities.length,
            rejectedEntities: plan.rejectedEntities.length,
            mapsGenerated: maps,
            diagramOpportunities: plan.visualOpportunitySummary?.diagramOpportunities ?? null,
            selectedDiagramOpportunities:
              plan.visualOpportunitySummary?.selectedDiagramOpportunities ?? null,
            diagramsGenerated: diagrams,
            keyEntities: ["Aegean", "Anatolia", "Cyprus", "Egypt", "Hattusa", "Hittite Empire", "Mycenae", "Pylos", "Levant"].map(
              (label) => ({
                label,
                accepted: plan.entities.some(
                  (entity) => entity.normalizedLabel.toLocaleLowerCase() === label.toLocaleLowerCase()
                ),
              })
            ),
          }
        : undefined,
    historical: {
      historicalContentState: plan.trustApproval?.historicalApprovalState,
      attestationActor: plan.trustApproval?.attestationActor,
      attestationTimestamp: plan.trustApproval?.attestationTimestamp,
      attestationBound: plan.trustApproval?.attestationBound,
      productionHistoricalApprovalEligible:
        plan.trustApproval?.productionHistoricalApprovalEligible,
      productionApprovalEligible: plan.approval.productionApprovalEligible,
      productionBlockerCodes: plan.approval.production.blockerCodes,
    },
    aspectRatio: {
      conflicts16x9: ratio169Conflicts,
      conflicts9x16: ratio916Conflicts,
      textDensityFailures,
    },
    pacing: {
      shotsPerMinute: Number(shotsPerMinute.toFixed(2)),
      avgShotDurationSec: Number((avgShotDuration / 1000).toFixed(1)),
      longStaticShare: Number(longStaticShare.toFixed(3)),
    },
    packIntegrity: await verifyChecksums(dir),
    blockers: plan.approval.production.blockerCodes,
  };

  if (episode.num === "02") {
    episodeReport.napoleonMapDefects = auditNapoleonMaps(plan.mapStates);
  }
  if (episode.num === "04") {
    episodeReport.blackDeathDiagramAudit = auditBlackDeathDiagrams(plan);
  }

  report.episodes.push(episodeReport);
  report.paths[`episode${episode.num}Zip`] = episodeReport.zipPath;
}

report.paths.aggregateZip = path.join(packRoot, "..", "history-approval-packs-v3.5.zip");
report.paths.comparisonReport = path.join(packRoot, "comparison-quality-report.json");

const viewerRates = report.episodes.map((item) => item.repetition.viewerConceptRepetitionRate);
const templateRates = report.episodes.map((item) => item.repetition.templateRepetitionRate);
const nonGeoTotal = report.episodes.reduce(
  (sum, item) => sum + item.geography.nonGeographicRejectedSurfaces,
  0
);
const provenanceOnlyTotal = report.episodes
  .map((item) => item.blackDeathDiagramAudit?.provenanceOnly ?? 0)
  .reduce((a, b) => a + b, 0);
const napoleonDefects = report.episodes.find((item) => item.napoleonMapDefects)?.napoleonMapDefects ?? [];

let sentinel1980 = 0;
for (const episode of EPISODES) {
  const dir = path.join(packRoot, `${episode.slug}-v3.5`);
  for (const file of await fs.readdir(dir)) {
    const content = await fs.readFile(path.join(dir, file), "utf8");
    sentinel1980 += (content.match(/1980-01-01/g) ?? []).length;
  }
}

report.assertions = {
  repetitionMetricPlausiblyCalibrated:
    viewerRates.every((rate) => rate < 0.35) &&
    !viewerRates.every((rate) => rate >= 0.6 && rate <= 0.7),
  napoleonFalseNegativeRepetitionRegressionEliminated:
    report.episodes.find((item) => item.episode === "Napoleon")?.repetition.viewerConceptRepetitionRate <
    0.35,
  corpusWide6070FalsePositiveRepetitionEliminated: !viewerRates.every(
    (rate) => rate >= 0.6 && rate <= 0.7
  ),
  nonGeographicNounsInGeographicDenominator: nonGeoTotal,
  bronzeAgeResolverStarvationFixed:
    report.episodes[0]?.bronzeAge?.keyEntities?.filter((item) => item.accepted).length >= 7,
  bronzeAgeHighConfidenceDiagramOpportunitiesHandled:
    (report.episodes[0]?.bronzeAge?.diagramsGenerated ?? 0) > 0 ||
    (report.episodes[0]?.bronzeAge?.selectedDiagramOpportunities ?? 0) > 0,
  blackDeathProvenanceOnlyDiagramChangesCounted: provenanceOnlyTotal,
  historicalGateCompositionCorrect: report.episodes.every(
    (item) =>
      !item.historical.productionHistoricalApprovalEligible ||
      item.historical.productionApprovalEligible ===
        item.historical.productionHistoricalApprovalEligible
  ),
  sentinel1980OccurrencesInGeneratedPacks: sentinel1980,
  oldNapoleonFalseValidMapRoutesPresent: napoleonDefects.length > 0,
  packIntegrityValid: report.episodes.every((item) => item.packIntegrity),
  templateRatesForDiagnostics: templateRates.map(pct),
  viewerRatesForDiagnostics: viewerRates.map(pct),
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
