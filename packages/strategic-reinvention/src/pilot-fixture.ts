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
import {
  hashCanonicalSourceBytes,
  hashEvidenceSpan,
} from "./provenance-validation.js";
import {
  createVeronicaAcceptanceEvidence,
  type VeronicaAcceptanceEvidence,
} from "./acceptance-fixture.js";
import { immutablePlanHash } from "@mediaforge/domain";
import { writeJsonAtomic } from "@mediaforge/shared";

export const STRATEGIC_PILOT_FIXTURE_SCHEMA_VERSION =
  "veronicabenini.pilot-fixture.v2" as const;

export interface StrategicPilotFixtureResult {
  readonly schemaVersion: typeof STRATEGIC_PILOT_FIXTURE_SCHEMA_VERSION;
  readonly episodeId: string;
  readonly contentProfileId: "veronicabenini";
  readonly creatorProfileId: "veronica-benini";
  readonly compatibilityAlias: "strategic-reinvention";
  readonly locales: readonly ("it" | "en" | "es")[];
  readonly variants: readonly ("full" | "short")[];
  readonly fullTaskIds: readonly string[];
  readonly providerMutations: 0;
  readonly publishStatus: "dry-run-blocked";
  readonly publishBlockers: readonly string[];
  readonly resumedEpisode: boolean;
  readonly sourceInvalidationDetected: boolean;
  readonly completedStageCount: number;
  readonly acceptanceEvidence: VeronicaAcceptanceEvidence;
  readonly status: "passed";
}

const blueprint = {
  episodeId: "pilot-episode-001",
  genreId: "veronicabenini",
  creatorProfileId: "veronica-benini",
  canonicalLocale: "it",
  mode: "story-to-strategy",
  sources: ["source-primary"],
  contentTier: "public",
  thesis: "Reinvention requires deliberate strategy and evidence-backed action.",
  beats: [
    { beatId: "beat-001", type: "hook", purpose: "Open with tension", sourceIds: ["source-primary"] },
    { beatId: "beat-002", type: "situation", purpose: "Describe context", sourceIds: ["source-primary"] },
    { beatId: "beat-003", type: "story", purpose: "Tell the case", sourceIds: ["source-primary"] },
    { beatId: "beat-004", type: "conventional-view", purpose: "Name the default", sourceIds: ["source-primary"] },
    { beatId: "beat-005", type: "reframe", purpose: "Offer the shift", sourceIds: ["source-primary"] },
    { beatId: "beat-006", type: "framework", purpose: "Give the model", sourceIds: ["source-primary"] },
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
} as const;

const pilotApprovalFixtures = {
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
} as const;

async function writePilotEpisode(workspaceRoot: string): Promise<{
  readonly episodeId: string;
  readonly sourceProvenanceSha256: string;
  readonly approvalHistoryPath: string;
}> {
  const episodeId = blueprint.episodeId;
  const episodeRoot = path.join(workspaceRoot, episodeId);
  const sourceText =
    "Benvenuti. Questo pilota dimostra il percorso di reinvenzione strategica.";
  await fs.mkdir(path.join(episodeRoot, "sources", "content"), { recursive: true });
  await fs.mkdir(path.join(episodeRoot, "sources", "manifests"), { recursive: true });
  await fs.mkdir(path.join(episodeRoot, "sources", "approvals"), { recursive: true });
  await fs.mkdir(path.join(episodeRoot, "languages"), { recursive: true });
  await fs.mkdir(path.join(episodeRoot, "languages", "short"), { recursive: true });
  await fs.mkdir(path.join(episodeRoot, "state", "veronicabenini"), { recursive: true });
  await fs.writeFile(
    path.join(episodeRoot, "blueprint.json"),
    `${JSON.stringify({
      ...blueprint,
      schemaVersion: "1.1",
      requiredApprovalGates: [
        "source",
        "canonical-script",
        "localization",
        "voice",
        "final-render",
        "publish",
      ],
    }, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(episodeRoot, "state", "veronicabenini", "approval-fixtures.json"),
    `${JSON.stringify(pilotApprovalFixtures, null, 2)}\n`,
  );
  await fs.writeFile(path.join(episodeRoot, "sources", "content", "source-primary.md"), sourceText);
  const sourceBytes = new TextEncoder().encode(sourceText);
  await fs.writeFile(
    path.join(episodeRoot, "sources", "manifests", "source-primary.json"),
    `${JSON.stringify(
      {
        schemaVersion: "1.1",
        sourceId: "source-primary",
        title: "Pilot primary source",
        owner: "veronica-benini",
        sourceType: "creator-written-note",
        provenance: {
          kind: "file",
          location: "sources/content/source-primary.md",
          originalLanguage: "it",
        },
        accessLevel: "public",
        rights: {
          status: "creator-owned",
          allowedUses: ["adapt", "translate"],
          permittedLocales: ["it", "en", "es"],
          commercialUse: true,
        },
        aiTransformations: {
          structure: true,
          summarize: true,
          adapt: true,
          translate: true,
          syntheticVoice: false,
          syntheticLikeness: false,
        },
        sensitivity: {
          classification: "normal",
          tags: ["none"],
          manualReviewRequired: false,
        },
        sourceHash: hashCanonicalSourceBytes(sourceBytes),
        createdAt: "2026-08-07T10:00:00.000Z",
        approvedAt: "2026-08-07T10:00:00.000Z",
        approvedBy: "reviewer-a",
      },
      null,
      2,
    )}\n`,
  );
  const evidenceHashes = [
    hashEvidenceSpan(new TextEncoder().encode("Benvenuti.")),
    hashEvidenceSpan(new TextEncoder().encode("Questo pilota dimostra il percorso di reinvenzione strategica.")),
  ];
  await fs.writeFile(
    path.join(episodeRoot, "sources", "approvals", "source-evidence.json"),
    `${JSON.stringify([{
      schemaVersion: "mediaforge.approval.v1",
      id: "approval-source-evidence-pilot",
      workflowInstanceId: `episode-${episodeId}`,
      taskId: "strategic.source-evidence",
      profileId: "veronicabenini",
      unitId: episodeId,
      locale: "it",
      variant: "full",
      decision: "approved",
      actor: "reviewer-a",
      reason: "Reviewed exact pilot source evidence.",
      boundRevision: "veronicabenini.source-adaptation.v1",
      artifactHashes: evidenceHashes,
      createdAt: "2026-08-09T10:00:00.000Z",
      scope: {
        gate: "source",
        locale: "it",
        variant: "full",
        inputArtifactHashes: [hashCanonicalSourceBytes(sourceBytes)],
        outputArtifactHashes: evidenceHashes,
        highRisk: false,
      },
    }], null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(episodeRoot, "languages", "script-it.md"),
    sourceText,
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
  return {
    episodeId,
    sourceProvenanceSha256: hashCanonicalSourceBytes(sourceBytes),
    approvalHistoryPath: path.join(
      episodeRoot,
      "state",
      "veronicabenini",
      "approval-fixtures.json",
    ),
  };
}

export async function runStrategicPilotFixture(): Promise<StrategicPilotFixtureResult> {
  const profile = await loadStrategicReinventionProfile();
  if (profile.creatorProfile.id !== "veronica-benini") {
    throw new Error("Pilot fixture requires creator veronica-benini.");
  }
  const registry = createStrategicFullTaskRegistry();
  registry.validateWorkflow(strategicFullWorkflowDefinition);
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "strategic-pilot-"));
  const fixture = await writePilotEpisode(workspaceRoot);
  const { episodeId } = fixture;
  const approvalHistoryHashBefore = immutablePlanHash(
    JSON.parse(await fs.readFile(fixture.approvalHistoryPath, "utf8")),
  );
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
  const approvalHistoryHashAfter = immutablePlanHash(
    JSON.parse(await fs.readFile(fixture.approvalHistoryPath, "utf8")),
  );
  const acceptanceEvidence = createVeronicaAcceptanceEvidence({
    first,
    resumed: second,
    sourceChanged: afterSourceChange,
    effectiveConfiguration: profile.effectivePolicy,
    sourceProvenanceSha256: fixture.sourceProvenanceSha256,
    approvalHistoryHashBefore,
    approvalHistoryHashAfter,
  });
  await writeJsonAtomic(
    path.join(workspaceRoot, episodeId, acceptanceEvidence.artifactPath),
    acceptanceEvidence,
  );
  return {
    schemaVersion: STRATEGIC_PILOT_FIXTURE_SCHEMA_VERSION,
    episodeId,
    contentProfileId: "veronicabenini",
    creatorProfileId: "veronica-benini",
    compatibilityAlias: "strategic-reinvention",
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
    acceptanceEvidence,
    status: "passed",
  };
}
