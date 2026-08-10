import fs from "node:fs/promises";
import path from "node:path";

import {
  runDarkTruthProductionHardeningFixture,
} from "../packages/dark-truth/src/production-hardening.js";
import {
  runHistoryProductionHardeningFixture,
} from "../packages/history/src/history-production-hardening.js";
import {
  planHistoryShortVisuals,
  resolveHistoryShortNarration,
} from "../packages/history/src/history-short-workflow.js";
import { hashProductionValue } from "../packages/shared/src/production-hardening.js";

const workspace = process.cwd();
const outputDirectory = path.join(
  workspace,
  "docs",
  "reports",
  "codex-runs",
  "2026-08-10-cross-genre-production-hardening-artifacts",
);
const historyFixturePath = path.join(
  workspace,
  "content-packs",
  "youtube-history-10-video-story-pack",
  "02-napoleons-invasion-of-russia.md",
);
const darkTruthFullFixturePath = path.join(
  workspace,
  "content-ideas",
  "content",
  "dark-truth-episodes",
  "007-ben-drowned-the-game-that-knew-his-name-en-full.md",
);
const darkTruthShortFixturePath = path.join(
  workspace,
  "content-ideas",
  "content",
  "dark-truth-episodes",
  "007-ben-drowned-the-game-that-knew-his-name-en-short.md",
);

const [historyNarration, darkTruthFullNarration, darkTruthShortNarration] =
  await Promise.all([
    fs.readFile(historyFixturePath, "utf8"),
    fs.readFile(darkTruthFullFixturePath, "utf8"),
    fs.readFile(darkTruthShortFixturePath, "utf8"),
  ]);

const historyShortNarration = resolveHistoryShortNarration({
  trustedLongNarration: historyNarration,
});
const historyShortPlan = planHistoryShortVisuals({ narration: historyShortNarration });

const runs = [
  runHistoryProductionHardeningFixture({
    fixtureId: "02-napoleons-invasion-of-russia:full",
    narrationHash: hashProductionValue(historyNarration),
    variant: "full",
    selectedAudioDurationSeconds: 786,
  }),
  runHistoryProductionHardeningFixture({
    fixtureId: "02-napoleons-invasion-of-russia:short",
    narrationHash: historyShortNarration.narrationHash,
    variant: "short",
    selectedAudioDurationSeconds: historyShortNarration.targetDurationSeconds,
  }),
  runDarkTruthProductionHardeningFixture({
    fixtureId: "007-save-file-knew-his-real-name:full",
    narrationHash: hashProductionValue(darkTruthFullNarration),
    variant: "full",
    selectedAudioDurationSeconds: 420,
  }),
  runDarkTruthProductionHardeningFixture({
    fixtureId: "007-save-file-knew-his-real-name:short",
    narrationHash: hashProductionValue(darkTruthShortNarration),
    variant: "short",
    selectedAudioDurationSeconds: 60,
  }),
];

await fs.mkdir(outputDirectory, { recursive: true });
await Promise.all(
  runs.map((run) =>
    fs.writeFile(
      path.join(
        outputDirectory,
        `${run.genre}-${run.variant}-${run.fixtureId.includes("vertical-derivative") ? "vertical-derivative" : "fixture"}.json`,
      ),
      `${JSON.stringify(run, null, 2)}\n`,
      "utf8",
    ),
  ),
);

process.stdout.write(
  `${JSON.stringify(
    {
      outputDirectory,
      runs: runs.map((run) => ({
        fixtureId: run.fixtureId,
        status: run.status,
        providerAllowed: run.providerReadiness.allowed,
        expectedProviderBlockers: run.providerReadiness.blockers,
        liveTtsProviderCalls: run.liveTtsProviderCalls,
        imageProviderCalls: run.imageProviderCalls,
        hardeningFingerprint: run.hardeningFingerprint.fingerprint,
      })),
      historyShort: {
        sourceMode: historyShortNarration.sourceMode,
        sceneCount: historyShortPlan.sceneCount,
        aspectRatio: historyShortPlan.aspectRatio,
      },
    },
    null,
    2,
  )}\n`,
);
