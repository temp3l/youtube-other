#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

const baselineRoot = argument("baseline-root");
const currentRoot = argument("current-root");
const outputFile = argument("output");
if (!baselineRoot || !currentRoot) {
  process.stderr.write(
    "usage: node scripts/history-v35-spatial-semantic-delta.mjs --baseline-root=<dir> --current-root=<dir>\n"
  );
  process.exit(64);
}

async function collectPlanDirectories(root) {
  const directories = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(root, entry.name);
    try {
      const plan = JSON.parse(await fs.readFile(path.join(directory, "plan.json"), "utf8"));
      if (plan?.schemaVersion === "history-visual-plan.v3.5") directories.push({ directory, plan });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return directories;
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function mapRecord(plan, state) {
  const claimIds = sortedUnique(
    state.compilerResolution?.owningClaimIds?.length
      ? state.compilerResolution.owningClaimIds
      : state.labels.flatMap((label) => label.linkedClaimIds)
  );
  const propositions = plan.claims
    .filter((claim) => claimIds.includes(claim.id))
    .map((claim) => claim.normalizedProposition);
  const places = state.labels.map((label) => label.placeId).filter(Boolean);
  const routes = state.routes.map((route) => `${route.originPlaceId}->${route.destinationPlaceId}`);
  const type = state.compilerResolution?.resolvedMapType ?? "unknown";
  const semanticKey = JSON.stringify({
    episode: plan.episodeId,
    claimIds,
    type,
    places,
    routes,
    propositions,
  });
  const propositionKey = JSON.stringify({ episode: plan.episodeId, claimIds, propositions });
  return {
    semanticKey,
    propositionKey,
    episode: plan.episodeId,
    claimIds,
    type,
    places,
    routes,
    propositions,
    unresolvedPlaceLabels: state.labels.filter((label) => !label.placeId).map((label) => label.text),
  };
}

function geoFactRecord(plan, fact) {
  const claimIds = sortedUnique(fact.claimIds ?? []);
  const propositions = plan.claims
    .filter((claim) => claimIds.includes(claim.id))
    .map((claim) => claim.normalizedProposition);
  const places = sortedUnique([
    fact.placeId,
    fact.originPlaceId,
    ...(fact.waypointPlaceIds ?? []),
    fact.destinationPlaceId,
  ]);
  return {
    semanticKey: JSON.stringify({ episode: plan.episodeId, claimIds, type: fact.type, places, propositions }),
    propositionKey: JSON.stringify({ episode: plan.episodeId, claimIds, propositions }),
    episode: plan.episodeId,
    claimIds,
    type: fact.type,
    places,
    propositions,
  };
}

async function loadCorpus(root) {
  const maps = [];
  const geoFacts = [];
  for (const { directory, plan } of await collectPlanDirectories(root)) {
    maps.push(...plan.mapStates.map((state) => mapRecord(plan, state)));
    try {
      const facts = JSON.parse(await fs.readFile(path.join(directory, "geo-facts.json"), "utf8"));
      geoFacts.push(...facts.map((fact) => geoFactRecord(plan, fact)));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return { maps, geoFacts };
}

function classifyDelta(baselineRecords, currentRecords) {
  const baselineByIdentity = new Map(baselineRecords.map((record) => [record.semanticKey, record]));
  const currentByIdentity = new Map(currentRecords.map((record) => [record.semanticKey, record]));
  const currentByProposition = new Map(currentRecords.map((record) => [record.propositionKey, record]));
  const baselineByProposition = new Map(baselineRecords.map((record) => [record.propositionKey, record]));
  const changes = [];

  for (const record of baselineRecords) {
    if (currentByIdentity.has(record.semanticKey)) continue;
    const replacement = currentByProposition.get(record.propositionKey);
    if (replacement) {
      changes.push({
        classification: replacement.type === "locator" && record.type === "sequence" ? "type-downgrade" : "type-change",
        before: record,
        after: replacement,
      });
      continue;
    }
    changes.push({
      classification:
        record.type === "sequence" && record.places.length < 2
          ? "legitimate-removed-weak-sequence"
          : "potential-unintended-loss",
      before: record,
    });
  }

  for (const record of currentRecords) {
    if (baselineByIdentity.has(record.semanticKey) || baselineByProposition.has(record.propositionKey))
      continue;
    changes.push({
      classification:
        record.unresolvedPlaceLabels?.length
          ? "unresolved-place-artifact"
          : record.type === "locator" && record.places.length === 1
            ? "legitimate-new-locator"
            : "unclassified-new",
      after: record,
    });
  }
  return changes;
}

const baseline = await loadCorpus(path.resolve(baselineRoot));
const current = await loadCorpus(path.resolve(currentRoot));
const mapChanges = classifyDelta(baseline.maps, current.maps);
const geoFactChanges = classifyDelta(baseline.geoFacts, current.geoFacts);
const counts = (changes) =>
  Object.fromEntries(
    [...new Set(changes.map((change) => change.classification))]
      .sort()
      .map((classification) => [
        classification,
        changes.filter((change) => change.classification === classification).length,
      ])
  );

const report = {
      baselineRoot: path.resolve(baselineRoot),
      currentRoot: path.resolve(currentRoot),
      stableIdentity: ["episode", "claimIds", "relation/map type", "resolved places", "explanatory proposition"],
      baselineCounts: { maps: baseline.maps.length, geoFacts: baseline.geoFacts.length },
      currentCounts: { maps: current.maps.length, geoFacts: current.geoFacts.length },
      mapClassifications: counts(mapChanges),
      geoFactClassifications: counts(geoFactChanges),
      mapChanges,
      geoFactChanges,
    };
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (outputFile) {
  await fs.mkdir(path.dirname(path.resolve(outputFile)), { recursive: true });
  await fs.writeFile(path.resolve(outputFile), serialized, "utf8");
}
process.stdout.write(
  `${JSON.stringify({
    baselineCounts: report.baselineCounts,
    currentCounts: report.currentCounts,
    mapClassifications: report.mapClassifications,
    geoFactClassifications: report.geoFactClassifications,
    ...(outputFile ? { output: path.resolve(outputFile) } : {}),
  }, null, 2)}\n`
);
