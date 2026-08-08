#!/usr/bin/env node

import { planHistoryVisualsV35 } from "../packages/history/src/history-workflow-v35.js";

const episodes = [
  "history-youtube-history-10-video-story-pack-09-cleopatra-beyond-legend",
  "history-youtube-history-30-video-story-pack-12-year-536-when-the-sun-disappeared",
  "history-youtube-history-30-video-story-pack-15-spartacus-slave-army",
  "history-youtube-history-30-video-story-pack-16-hannibal-at-cannae",
  "history-youtube-history-30-video-story-pack-18-peloponnesian-war-athens-destroys-itself",
  "history-youtube-history-10-video-story-pack-06-mongol-war-machine",
  "history-youtube-history-10-video-story-pack-08-cuban-missile-crisis",
  "history-youtube-history-10-video-story-pack-10-titanic-decisions-disaster",
  "history-youtube-history-30-video-story-pack-13-caesar-in-gaul",
];

const results = [];
for (const episodeId of episodes) {
  const { plan } = await planHistoryVisualsV35({ episodeId, outputRoot: "episodes", force: true });
  results.push({
    episodeId,
    coreSubjects: plan.entities
      .filter((entity) =>
        ["Cleopatra", "Spartacus", "Hannibal Barca", "Julius Caesar", "Cannae", "Pompeii"].includes(
          entity.normalizedLabel
        )
      )
      .map((entity) => entity.normalizedLabel),
    entityCount: plan.entities.length,
    rejectedCount: plan.rejectedEntities.length,
    contentApprovalEligible: plan.approval.contentApprovalEligible,
    editoriallyReviewable: plan.approval.editoriallyReviewable,
    contentBlockers: plan.approval.content.blockerCodes,
    productionBlockers: plan.approval.production.blockerCodes,
    diagramCount: plan.diagramStates.filter((state) => state.nodes.length >= 2).length,
    mapCount: plan.mapStates.filter((state) => state.semanticStatus === "valid").length,
    coreDiagnostics: plan.diagnostics
      .filter((item) => item.code.startsWith("CORE_ENTITY"))
      .map((item) => item.code),
  });
}

process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
