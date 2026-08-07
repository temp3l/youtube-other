import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createFixturePng, createFixturePptx } from "@mediaforge/veronica-media";
import {
  createStrategicFullTaskRegistry,
  STRATEGIC_FULL_TASK_IDS,
  strategicFullWorkflowDefinition,
} from "./task-registry.js";
import { runStrategicEpisodePipeline } from "./episode-pipeline.js";
import { loadStrategicReinventionProfile } from "./profile.js";

export const STRATEGIC_PILOT_FIXTURE_SCHEMA_VERSION =
  "strategic-reinvention.pilot-fixture.v1" as const;

export interface StrategicPilotFixtureResult {
  readonly schemaVersion: typeof STRATEGIC_PILOT_FIXTURE_SCHEMA_VERSION;
  readonly episodeId: string;
  readonly creatorProfileId: "veronica-benini";
  readonly genreId: "strategic-reinvention";
  readonly locales: readonly ("it" | "en" | "es")[];
  readonly variants: readonly ("full" | "short")[];
  readonly fullTaskIds: readonly string[];
  readonly providerMutations: 0;
  readonly publishStatus: "dry-run-blocked";
  readonly publishBlockers: readonly string[];
  readonly resumedEpisode: boolean;
  readonly sourceInvalidationDetected: boolean;
  readonly completedStageCount: number;
  readonly status: "passed";
}

const blueprint = {
  episodeId: "pilot-episode-001",
  genreId: "strategic-reinvention",
  creatorProfileId: "veronica-benini",
  canonicalLocale: "it",
  mode: "story-to-strategy",
  sources: ["source-primary"],
  contentTier: "public",
  thesis: "Reinvention requires deliberate strategy and evidence-backed action.",
  beats: [
    { beatId: "b1", type: "hook", purpose: "Open with tension", sourceIds: ["source-primary"] },
    { beatId: "b2", type: "situation", purpose: "Describe context", sourceIds: ["source-primary"] },
    { beatId: "b3", type: "story", purpose: "Tell the case", sourceIds: ["source-primary"] },
    { beatId: "b4", type: "conventional-view", purpose: "Name the default", sourceIds: ["source-primary"] },
    { beatId: "b5", type: "reframe", purpose: "Offer the shift", sourceIds: ["source-primary"] },
    { beatId: "b6", type: "framework", purpose: "Give the model", sourceIds: ["source-primary"] },
  ],
  cta: {
    kind: "consultation",
    destination: "https://example.com/consultation",
    campaignId: "pilot-campaign",
    localizedDestinations: {
      en: "https://example.com/consultation-en",
      es: "https://example.com/consultation-es",
    },
  },
  approvals: {
    source: { actor: "reviewer-a", approvedAt: "2026-08-07T10:00:00.000Z" },
    canonicalScript: { actor: "reviewer-a", approvedAt: "2026-08-07T10:05:00.000Z" },
    localization: { actor: "reviewer-b", approvedAt: "2026-08-07T10:10:00.000Z" },
    voice: { actor: "reviewer-a", approvedAt: "2026-08-07T10:15:00.000Z" },
    finalRender: { actor: "reviewer-b", approvedAt: "2026-08-07T10:20:00.000Z" },
    publish: {
      actor: "reviewer-a",
      secondReviewer: "reviewer-b",
      approvedAt: "2026-08-07T10:25:00.000Z",
      highRisk: true,
    },
  },
} as const;

async function writePilotEpisode(workspaceRoot: string): Promise<string> {
  const episodeId = blueprint.episodeId;
  const episodeRoot = path.join(workspaceRoot, episodeId);
  await fs.mkdir(path.join(episodeRoot, "sources", "content"), { recursive: true });
  await fs.mkdir(path.join(episodeRoot, "languages"), { recursive: true });
  await fs.mkdir(path.join(episodeRoot, "languages", "short"), { recursive: true });
  await fs.writeFile(
    path.join(episodeRoot, "blueprint.json"),
    `${JSON.stringify({ ...blueprint, schemaVersion: "1.1", requiredApprovalGates: ["source", "publish"] }, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(episodeRoot, "languages", "script-it.md"),
    "Benvenuti. Questo pilota dimostra il percorso di reinvenzione strategica.",
    "utf8",
  );
  await fs.writeFile(
    path.join(episodeRoot, "languages", "script-en.md"),
    "Welcome. This pilot demonstrates the strategic reinvention workflow.",
    "utf8",
  );
  await fs.writeFile(
    path.join(episodeRoot, "languages", "script-es.md"),
    "Bienvenidos. Este piloto demuestra el flujo de reinvención estratégica.",
    "utf8",
  );
  await fs.writeFile(
    path.join(episodeRoot, "languages", "short", "script-it.md"),
    "Breve: reinvenzione strategica in azione.",
    "utf8",
  );
  await fs.writeFile(
    path.join(episodeRoot, "sources", "content", "deck.pptx"),
    createFixturePptx(2),
  );
  await fs.writeFile(
    path.join(episodeRoot, "sources", "content", "chart.png"),
    createFixturePng("pilot-chart"),
  );
  return episodeId;
}

export async function runStrategicPilotFixture(): Promise<StrategicPilotFixtureResult> {
  const profile = await loadStrategicReinventionProfile();
  if (profile.creatorProfile.id !== "veronica-benini") {
    throw new Error("Pilot fixture requires creator veronica-benini.");
  }
  const registry = createStrategicFullTaskRegistry();
  registry.validateWorkflow(strategicFullWorkflowDefinition);
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "strategic-pilot-"));
  const episodeId = await writePilotEpisode(workspaceRoot);
  const first = await runStrategicEpisodePipeline({ workspaceRoot, episodeId });
  const second = await runStrategicEpisodePipeline({
    workspaceRoot,
    episodeId,
    resume: true,
  });
  const chartPath = path.join(workspaceRoot, episodeId, "sources", "content", "chart.png");
  await fs.writeFile(chartPath, createFixturePng("changed-source"));
  const afterSourceChange = await runStrategicEpisodePipeline({
    workspaceRoot,
    episodeId,
    resume: true,
  });
  return {
    schemaVersion: STRATEGIC_PILOT_FIXTURE_SCHEMA_VERSION,
    episodeId,
    creatorProfileId: "veronica-benini",
    genreId: "strategic-reinvention",
    locales: ["it", "en", "es"],
    variants: ["full", "short"],
    fullTaskIds: [...STRATEGIC_FULL_TASK_IDS],
    providerMutations: 0,
    publishStatus: "dry-run-blocked",
    publishBlockers: first.publishBlockers,
    resumedEpisode: second.supplementalPlanContentHash === first.supplementalPlanContentHash,
    sourceInvalidationDetected:
      afterSourceChange.supplementalPlanContentHash !== first.supplementalPlanContentHash,
    completedStageCount: first.completedStages.length,
    status: "passed",
  };
}
