#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverHistoryStoryPackEpisodeIds } from "../packages/history/src/history-episode-discovery.js";
import { planHistoryVisualsV35 } from "../packages/history/src/history-workflow-v35.js";
import { assessPlanningAcceptanceV35 } from "../packages/history/src/history-planning-acceptance-v35.js";
import { assessVisualSemanticCoverageV35 } from "../packages/history/src/history-visual-semantics-v35.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const episodesDirectory = path.join(repoRoot, "episodes");

const REPRESENTATIVE = [
  "history-youtube-history-30-video-story-pack-31-d-day-normandy-invasion",
  "history-youtube-history-30-video-story-pack-20-1066-battle-that-changed-england",
  "history-youtube-history-30-video-story-pack-22-first-crusade-jerusalem",
  "history-youtube-history-30-video-story-pack-24-fall-of-tenochtitlan",
  "history-youtube-history-30-video-story-pack-36-spanish-armada-why-it-failed",
  "history-youtube-history-10-video-story-pack-10-titanic-decisions-disaster",
  "history-youtube-history-30-video-story-pack-35-chernobyl-night-reactor-exploded",
  "history-youtube-history-10-video-story-pack-04-black-death",
  "history-youtube-history-10-video-story-pack-01-bronze-age-collapse",
  "history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire",
];

function summarizePlan(plan) {
  const mapTypes = { locator: 0, sequence: 0, movement: 0, other: 0 };
  for (const state of plan.mapStates) {
    const type = state.compilerResolution?.resolvedMapType ?? "other";
    if (type in mapTypes) mapTypes[type] += 1;
    else mapTypes.other += 1;
  }
  const diagramTypes = {};
  for (const state of plan.diagramStates) {
    const key = state.diagramType ?? "unknown";
    diagramTypes[key] = (diagramTypes[key] ?? 0) + 1;
  }
  const archivalIntents = plan.assetIntents.filter(
    (intent) => intent.modality === "archival image" || intent.modality === "reconstruction"
  ).length;
  const coverage = assessVisualSemanticCoverageV35({
    entities: plan.entities,
    rejectedEntities: plan.rejectedEntities,
    beats: plan.beats,
    mapStates: plan.mapStates,
    diagramStates: plan.diagramStates,
    visualOpportunitySummary: plan.visualOpportunitySummary,
  });
  const acceptance = assessPlanningAcceptanceV35(plan);
  return {
    episodeId: plan.episodeId,
    beats: plan.beats.length,
    shots: plan.shots.length,
    maps: plan.mapStates.filter((s) => s.semanticStatus === "valid").length,
    mapTypes,
    diagrams: plan.diagramStates.filter((s) => s.semanticStatus === "valid").length,
    diagramTypes,
    archivalIntents,
    geographicQualifiers: plan.geographicQualifiers.length,
    viewerRepetition: plan.qualityMetrics.viewerConceptRepetitionRate,
    longStaticMs: plan.qualityMetrics.longStaticRuntimeMs,
    contentApprovalEligible: plan.approval.contentApprovalEligible,
    editoriallyReviewable: plan.approval.editoriallyReviewable,
    unexpectedBlockers: acceptance.unexpectedProductionBlockers,
    coverageWarnings: coverage.map((item) => item.code),
  };
}

function aggregate(rows) {
  const totals = {
    episodes: rows.length,
    beats: 0,
    shots: 0,
    maps: 0,
    diagrams: 0,
    archivalIntents: 0,
    geographicQualifiers: 0,
    longStaticMs: 0,
    mapTypes: { locator: 0, sequence: 0, movement: 0, other: 0 },
    diagramTypes: {},
    contentEligible: 0,
    editoriallyReviewable: 0,
    geoCoverageSuspicious: 0,
    diagramCoverageSuspicious: 0,
  };
  let viewerRepSum = 0;
  for (const row of rows) {
    totals.beats += row.beats;
    totals.shots += row.shots;
    totals.maps += row.maps;
    totals.diagrams += row.diagrams;
    totals.archivalIntents += row.archivalIntents;
    totals.geographicQualifiers += row.geographicQualifiers;
    totals.longStaticMs += row.longStaticMs;
    viewerRepSum += row.viewerRepetition;
    if (row.contentApprovalEligible) totals.contentEligible += 1;
    if (row.editoriallyReviewable) totals.editoriallyReviewable += 1;
    for (const [key, value] of Object.entries(row.mapTypes)) {
      totals.mapTypes[key] = (totals.mapTypes[key] ?? 0) + value;
    }
    for (const [key, value] of Object.entries(row.diagramTypes)) {
      totals.diagramTypes[key] = (totals.diagramTypes[key] ?? 0) + value;
    }
    if (row.coverageWarnings.includes("GEOGRAPHIC_VISUAL_COVERAGE_SUSPICIOUS"))
      totals.geoCoverageSuspicious += 1;
    if (row.coverageWarnings.includes("DIAGRAM_VISUAL_COVERAGE_SUSPICIOUS"))
      totals.diagramCoverageSuspicious += 1;
  }
  totals.viewerRepetitionAvg = rows.length ? viewerRepSum / rows.length : 0;
  return totals;
}

async function loadOrPlan(episodeId, regenerate) {
  if (regenerate) {
    const { plan } = await planHistoryVisualsV35({
      episodeId,
      outputRoot: episodesDirectory,
      force: true,
    });
    return plan;
  }
  const planPath = path.join(
    episodesDirectory,
    episodeId,
    "source/history-v3.5/plan.json"
  );
  return JSON.parse(await fs.readFile(planPath, "utf8"));
}

const regenerate = process.argv.includes("--regenerate");
const representativeOnly = process.argv.includes("--representative");
const from = Number.parseInt(
  process.argv.find((a) => a.startsWith("--from="))?.split("=")[1] ?? "1",
  10
);
const to = Number.parseInt(
  process.argv.find((a) => a.startsWith("--to="))?.split("=")[1] ?? "40",
  10
);

const episodeIds = representativeOnly
  ? REPRESENTATIVE
  : discoverHistoryStoryPackEpisodeIds({ episodesDirectory, from, to });

const rows = [];
for (const episodeId of episodeIds) {
  process.stderr.write(`metrics ${episodeId}\n`);
  rows.push(summarizePlan(await loadOrPlan(episodeId, regenerate)));
}

const output = {
  regenerate,
  representativeOnly,
  from,
  to,
  episodes: rows,
  aggregate: aggregate(rows),
};
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
