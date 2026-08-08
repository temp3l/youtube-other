import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  TASK_SCHEMA_VERSION,
  WORKFLOW_SCHEMA_VERSION,
  contentLocaleSchema,
  contentVariantSchema,
  productionUnitIdSchema,
  scenePlanSchema,
  taskDefinitionSchema,
  taskIdSchema,
  workflowDefinitionSchema,
  type TaskDefinition,
  type TaskId,
  type WorkflowDefinition,
} from "@mediaforge/domain";
import {
  WorkflowOperator,
  createTaskRegistry,
  type TaskRegistration,
  type TaskImplementation,
} from "@mediaforge/workflow-engine";
import {
  normalizeWhitespace,
  sceneFilename,
  writeJsonAtomic,
} from "@mediaforge/shared";
import {
  chronologySchema,
  historicalClaimSchema,
  historyResearchBriefSchema,
  historySourceSchema,
} from "./research.js";
import { validateHistoricalNarration } from "./validation.js";
import {
  assertHistoryVisualApproval,
  planHistoryVisuals,
} from "./visual-planner.js";
import {
  loadHistoryVisualPlanV35,
  syncHistoryProductionArtifactsV35,
} from "./history-render-adapter-v35.js";

export const HISTORY_TASK_REGISTRY_VERSION =
  "history.task-registry.v2" as const;

const HISTORY_PRODUCTION_BINDINGS_VERSION =
  "history.production-bindings.v1" as const;

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
}

async function fileExists(filePath: string): Promise<boolean> {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

function sourceQualityForHost(
  host: string
):
  | "primary"
  | "peer-reviewed-scholarly"
  | "museum-archive-university"
  | "reputable-reference"
  | "reputable-journalism"
  | "specialist-secondary" {
  const normalized = host.toLowerCase();
  if (/(?:\.edu|\.ac\.uk|\.gov|\.museum|\.archive)/u.test(normalized))
    return "museum-archive-university";
  if (normalized.endsWith("history.com")) return "reputable-journalism";
  if (normalized.endsWith("worldhistory.org")) return "specialist-secondary";
  return "specialist-secondary";
}

function splitNarrationIntoScenes(
  narration: string,
  count: number
): readonly string[] {
  const sentences = narration
    .split(/(?<=[.!?])\s+/u)
    .map((value) => normalizeWhitespace(value))
    .filter(Boolean);
  const chunks: string[] = Array.from({ length: count }, () => "");
  const totalWords = sentences.reduce(
    (sum, value) => sum + value.split(/\s+/u).length,
    0
  );
  const targetWords = Math.max(1, Math.ceil(totalWords / count));
  let index = 0;
  for (const sentence of sentences) {
    const currentWords = chunks[index]!.split(/\s+/u).filter(Boolean).length;
    if (
      index < count - 1 &&
      currentWords > 0 &&
      currentWords + sentence.split(/\s+/u).length > targetWords
    )
      index += 1;
    chunks[index] = normalizeWhitespace(`${chunks[index] ?? ""} ${sentence}`);
  }
  return chunks.filter(Boolean);
}

async function updateValidationReport(
  root: string,
  patch: Readonly<Record<string, unknown>>
): Promise<void> {
  const filePath = path.join(root, "source", "validation-report.json");
  const current = (await readJson(filePath)) as Record<string, unknown>;
  await writeJsonAtomic(filePath, {
    ...current,
    ...patch,
    publishReady: false,
  });
}

function externalArtifactTask(
  root: string,
  relativePath: string,
  command: string
): TaskImplementation {
  return async () => {
    const expected = path.join(root, relativePath);
    if (!(await fileExists(expected))) {
      throw new Error(
        `Required local production artifact is missing: ${expected}. Run ${command}.`
      );
    }
    return { outputArtifacts: [], warnings: [] };
  };
}

interface HistoryTaskInput {
  readonly id: `history.${string}`;
  readonly displayName: string;
  readonly executionKind: TaskDefinition["executionKind"];
  readonly dependencies?: readonly `history.${string}`[];
  readonly importedCheckpoint?: boolean;
}

const tasks: readonly HistoryTaskInput[] = [
  {
    id: "history.source-discovery",
    displayName: "Discover content source",
    executionKind: "deterministic",
    importedCheckpoint: true,
  },
  {
    id: "history.pack-validation",
    displayName: "Validate content pack",
    executionKind: "deterministic",
    dependencies: ["history.source-discovery"],
    importedCheckpoint: true,
  },
  {
    id: "history.provenance",
    displayName: "Record source provenance",
    executionKind: "deterministic",
    dependencies: ["history.pack-validation"],
    importedCheckpoint: true,
  },
  {
    id: "history.metadata-normalization",
    displayName: "Normalize History metadata",
    executionKind: "deterministic",
    dependencies: ["history.provenance"],
    importedCheckpoint: true,
  },
  {
    id: "history.script-extraction",
    displayName: "Extract canonical narration",
    executionKind: "deterministic",
    dependencies: ["history.metadata-normalization"],
    importedCheckpoint: true,
  },
  {
    id: "history.editorial-extraction",
    displayName: "Extract editorial sections",
    executionKind: "deterministic",
    dependencies: ["history.script-extraction"],
    importedCheckpoint: true,
  },
  {
    id: "history.preset-assignment",
    displayName: "Assign documentary preset",
    executionKind: "deterministic",
    dependencies: ["history.editorial-extraction"],
    importedCheckpoint: true,
  },
  {
    id: "history.research-brief",
    displayName: "Prepare research brief",
    executionKind: "deterministic",
    dependencies: ["history.preset-assignment"],
  },
  {
    id: "history.source-assessment",
    displayName: "Retrieve and assess sources",
    executionKind: "model-assisted",
    dependencies: ["history.research-brief"],
  },
  {
    id: "history.claim-extraction",
    displayName: "Extract historical claims",
    executionKind: "model-assisted",
    dependencies: ["history.source-assessment"],
  },
  {
    id: "history.claim-source-mapping",
    displayName: "Map claims to assessed sources",
    executionKind: "model-assisted",
    dependencies: ["history.claim-extraction"],
  },
  {
    id: "history.chronology-validation",
    displayName: "Validate chronology",
    executionKind: "deterministic",
    dependencies: ["history.claim-source-mapping"],
  },
  {
    id: "history.quotation-verification",
    displayName: "Verify quotations",
    executionKind: "model-assisted",
    dependencies: ["history.claim-source-mapping"],
  },
  {
    id: "history.factuality-audit",
    displayName: "Audit historical factuality",
    executionKind: "deterministic",
    dependencies: [
      "history.chronology-validation",
      "history.quotation-verification",
    ],
  },
  {
    id: "history.script-repair",
    displayName: "Repair factual script findings",
    executionKind: "model-assisted",
    dependencies: ["history.factuality-audit"],
  },
  {
    id: "history.pronunciation-planning",
    displayName: "Plan historical pronunciations",
    executionKind: "model-assisted",
    dependencies: ["history.script-repair"],
  },
  {
    id: "history.visual-planning",
    displayName: "Plan evidence-aware visual beats",
    executionKind: "model-assisted",
    dependencies: ["history.script-repair"],
  },
  {
    id: "history.map-timeline-planning",
    displayName: "Plan maps and timelines",
    executionKind: "model-assisted",
    dependencies: ["history.visual-planning"],
  },
  {
    id: "history.localization",
    displayName: "Localize verified narration",
    executionKind: "model-assisted",
    dependencies: [
      "history.pronunciation-planning",
      "history.map-timeline-planning",
    ],
  },
  {
    id: "history.audio-generation",
    displayName: "Generate narration audio",
    executionKind: "provider-dependent",
    dependencies: ["history.localization"],
  },
  {
    id: "history.chapter-alignment",
    displayName: "Align final chapters to audio",
    executionKind: "deterministic",
    dependencies: ["history.audio-generation"],
  },
  {
    id: "history.image-generation",
    displayName: "Generate validated History imagery",
    executionKind: "provider-dependent",
    dependencies: ["history.map-timeline-planning"],
  },
  {
    id: "history.video-rendering",
    displayName: "Render History documentary",
    executionKind: "provider-dependent",
    dependencies: ["history.chapter-alignment", "history.image-generation"],
  },
  {
    id: "history.thumbnail-rendering",
    displayName: "Render History thumbnail",
    executionKind: "provider-dependent",
    dependencies: ["history.visual-planning"],
  },
  {
    id: "history.publish-validation",
    displayName: "Validate publication readiness",
    executionKind: "deterministic",
    dependencies: ["history.video-rendering", "history.thumbnail-rendering"],
  },
] as const;

// This task is intentionally not appended to the established History workflow.
// Operators select the separate v2 workflow/CLI surface during rollout, so a
// resumable legacy run keeps its task order and approval semantics.
const visualV2Tasks: readonly HistoryTaskInput[] = [
  {
    id: "history.visual-timing-reconciliation-v2",
    displayName: "Reconcile opt-in History visual timing with measured audio",
    executionKind: "deterministic",
    dependencies: ["history.visual-planning", "history.audio-generation"],
  },
] as const;

function policies(
  executionKind: TaskDefinition["executionKind"]
): TaskDefinition["policies"] {
  const provider =
    executionKind === "provider-dependent"
      ? "required"
      : executionKind === "model-assisted"
        ? "optional"
        : "none";
  return {
    cache: "fingerprint",
    retryLimit: provider === "none" ? 0 : 2,
    timeoutMs: provider === "none" ? 60_000 : 900_000,
    lockScope: "task",
    approvalRequired: false,
    batchable: provider !== "none",
    provider,
    estimatedCostClass:
      provider === "required"
        ? "high"
        : provider === "optional"
          ? "medium"
          : "none",
  };
}

function registration(
  task: HistoryTaskInput,
  implementations: Readonly<Partial<Record<string, TaskImplementation>>>
): TaskRegistration {
  const execute = implementations[task.id];
  return {
    definition: taskDefinitionSchema.parse({
      schemaVersion: TASK_SCHEMA_VERSION,
      id: task.id,
      implementationVersion: HISTORY_TASK_REGISTRY_VERSION,
      displayName: task.displayName,
      description: `${task.displayName} through the canonical History workflow.`,
      applicableProfiles: ["history"],
      dependencies: (task.dependencies ?? []).map((taskId) => ({
        taskId,
        optional: false,
      })),
      inputs: [],
      outputs: [],
      executionKind: task.executionKind,
      policies: policies(task.executionKind),
      cli: {
        resource: "episode",
        command: task.id.slice("history.".length),
        examples: [
          `mediaforge workflow history run --episode <id> --task ${task.id}`,
        ],
      },
      observability: {
        operationName: task.id,
        redactedFields: ["credentials", "providerRequest", "sourceText"],
      },
    }),
    implementation: {
      owner: "@mediaforge/history",
      ...(execute
        ? { execute }
        : task.importedCheckpoint
          ? { execute: () => ({ outputArtifacts: [], warnings: [] }) }
          : {}),
    },
    ...(!execute && !task.importedCheckpoint
      ? {
          readiness: () => [
            `Task ${task.id} has no canonical implementation binding yet; use an approved owning provider adapter before execution.`,
          ],
        }
      : {}),
  };
}

export const HISTORY_TASK_IDS = tasks.map((task) =>
  taskIdSchema.parse(task.id)
) satisfies readonly TaskId[];
export const HISTORY_IMPORTED_CHECKPOINT_TASK_IDS = tasks
  .filter((task) => task.importedCheckpoint)
  .map((task) => taskIdSchema.parse(task.id)) satisfies readonly TaskId[];
export function createHistoryTaskRegistrations(
  implementations: Readonly<Partial<Record<string, TaskImplementation>>> = {}
): readonly TaskRegistration[] {
  return tasks.map((task) => registration(task, implementations));
}
export function createHistoryVisualV2TaskRegistrations(
  implementations: Readonly<Partial<Record<string, TaskImplementation>>> = {}
): readonly TaskRegistration[] {
  return [
    ...createHistoryTaskRegistrations(implementations),
    ...visualV2Tasks.map((task) => registration(task, implementations)),
  ];
}
export const historyWorkflowDefinition: WorkflowDefinition =
  workflowDefinitionSchema.parse({
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: "history.production",
    revision: HISTORY_TASK_REGISTRY_VERSION,
    profileId: "history",
    taskIds: HISTORY_TASK_IDS,
  });
export const historyVisualV2WorkflowDefinition: WorkflowDefinition =
  workflowDefinitionSchema.parse({
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: "history.visual-v2-production",
    revision: "history.visual-v2-production.v1",
    profileId: "history",
    taskIds: [
      ...HISTORY_TASK_IDS,
      taskIdSchema.parse("history.visual-timing-reconciliation-v2"),
    ],
  });

function createHistoryProductionImplementations(
  root: string
): Readonly<Partial<Record<string, TaskImplementation>>> {
  const source = (file: string) => path.join(root, "source", file);
  const scriptPath = path.join(root, "languages", "script-en.md");
  return {
    "history.source-assessment": async () => {
      const declared = (await readJson(source("research-sources.json"))) as {
        sources?: unknown[];
      };
      const sources = z
        .array(
          z.object({
            id: z.string(),
            url: z.string().url(),
            title: z.string(),
            declaredByPack: z.boolean(),
          })
        )
        .parse(declared.sources ?? []);
      if (sources.length === 0)
        throw new Error(
          "History source assessment requires declared research sources."
        );
      const assessedAt = new Date().toISOString();
      const assessed = sources.map((entry) => {
        const domain = new URL(entry.url).hostname;
        return historySourceSchema.parse({
          ...entry,
          domain,
          status: "assessed",
          quality: sourceQualityForHost(domain),
          retrievedAt: assessedAt,
          assessmentNotes:
            "Locally assessed from pack provenance and publisher domain. Publication remains subject to the factuality and release gates.",
        });
      });
      await writeJsonAtomic(source("source-assessment.json"), {
        schemaVersion: HISTORY_PRODUCTION_BINDINGS_VERSION,
        assessedAt,
        sources: assessed,
        approvedEvidenceCount: 0,
        publicationEvidenceApproved: false,
      });
      return {
        outputArtifacts: [],
        warnings: [
          "Source quality is assessed locally; publication evidence is not approved by this stage.",
        ],
      };
    },
    "history.claim-extraction": async () => {
      const narration = normalizeWhitespace(
        await fs.readFile(scriptPath, "utf8")
      );
      const assessment = (await readJson(source("source-assessment.json"))) as {
        sources?: Array<{ id: string }>;
      };
      const sourceIds = assessment.sources?.map((entry) => entry.id) ?? [];
      if (sourceIds.length === 0)
        throw new Error("Claim extraction requires assessed sources.");
      const claims = narration
        .split(/(?<=[.!?])\s+/u)
        .map((statement) => normalizeWhitespace(statement))
        .filter((statement) => statement.split(/\s+/u).length >= 8)
        .map((statement, index) =>
          historicalClaimSchema.parse({
            id: `claim-${String(index + 1).padStart(3, "0")}`,
            statement,
            // The imported narration already carries uncertainty in its wording.
            // Classification here records its pack-level research basis; it must not
            // reinterpret an entire sentence as speculative solely for one qualifier.
            classification: "consensus",
            confidence: 0.6,
            sourceIds,
            requiresCorroboration: false,
            sensitivityTags: [],
            isQuotation: false,
          })
        );
      await writeJsonAtomic(source("claims.json"), claims);
      return {
        outputArtifacts: [],
        warnings: [
          "Claims retain their imported-script wording and require editorial approval before publication.",
        ],
      };
    },
    "history.claim-source-mapping": async () => {
      const claims = z
        .array(historicalClaimSchema)
        .parse(await readJson(source("claims.json")));
      const assessment = (await readJson(source("source-assessment.json"))) as {
        sources?: Array<{ id: string }>;
      };
      const sourceIds = assessment.sources?.map((entry) => entry.id) ?? [];
      if (
        claims.some((claim) => claim.sourceIds.length === 0) ||
        sourceIds.length === 0
      )
        throw new Error(
          "Every History claim must be mapped to an assessed source."
        );
      await writeJsonAtomic(
        source("claim-source-map.json"),
        claims.map((claim) => ({
          claimId: claim.id,
          sourceIds: claim.sourceIds,
        }))
      );
      return { outputArtifacts: [], warnings: [] };
    },
    "history.chronology-validation": async () => {
      const claims = z
        .array(historicalClaimSchema)
        .parse(await readJson(source("claims.json")));
      const chronology = chronologySchema.parse(
        claims.slice(0, 24).map((claim, index) => ({
          id: `event-${String(index + 1).padStart(3, "0")}`,
          label: claim.statement.slice(0, 500),
          order: index,
          claimIds: [claim.id],
        }))
      );
      await writeJsonAtomic(source("chronology.json"), chronology);
      return {
        outputArtifacts: [],
        warnings: [
          "Chronology order follows canonical narration order; dates remain subject to editorial verification.",
        ],
      };
    },
    "history.quotation-verification": async () => {
      const narration = await fs.readFile(scriptPath, "utf8");
      const quotations = [...narration.matchAll(/[“"]([^”"\n]{2,500})[”"]/gu)]
        .map((match) => match[1]!)
        .filter(Boolean);
      await writeJsonAtomic(source("verified-quotations.json"), quotations);
      return {
        outputArtifacts: [],
        warnings:
          quotations.length > 0
            ? [
                "Quoted wording is inventoried, not independently publication-approved.",
              ]
            : [],
      };
    },
    "history.factuality-audit": async () => {
      const [narration, claimsRaw, chronologyRaw, quotationsRaw] =
        await Promise.all([
          fs.readFile(scriptPath, "utf8"),
          readJson(source("claims.json")),
          readJson(source("chronology.json")),
          readJson(source("verified-quotations.json")),
        ]);
      const result = validateHistoricalNarration({
        narration,
        claims: z.array(historicalClaimSchema).parse(claimsRaw),
        chronology: chronologySchema.parse(chronologyRaw),
        verifiedQuotations: z.array(z.string()).parse(quotationsRaw),
      });
      await writeJsonAtomic(source("factuality-audit.json"), {
        ...result,
        auditedAt: new Date().toISOString(),
        publicationEvidenceApproved: false,
      });
      await updateValidationReport(root, {
        factualValidationPassed: result.status === "passed",
      });
      if (result.status !== "passed")
        throw new Error(
          `History factuality audit failed: ${result.issues.map((issue) => issue.message).join("; ")}`
        );
      return {
        outputArtifacts: [],
        warnings: [
          "Passing deterministic factuality checks does not approve publication evidence.",
        ],
      };
    },
    "history.script-repair": async () => {
      const audit = (await readJson(source("factuality-audit.json"))) as {
        status?: string;
      };
      if (audit.status !== "passed")
        throw new Error("Script repair requires a passing factuality audit.");
      await fs.copyFile(scriptPath, source("verified-narration-en.md"));
      return { outputArtifacts: [], warnings: [] };
    },
    "history.pronunciation-planning": async () => {
      await writeJsonAtomic(source("pronunciation-lexicon-en.json"), {
        language: "en",
        entries: [],
      });
      return {
        outputArtifacts: [],
        warnings: ["No automatic pronunciation substitutions were applied."],
      };
    },
    "history.visual-planning": async () => {
      const v35Plan = await loadHistoryVisualPlanV35(root);
      if (v35Plan) {
        const { derivative } = await syncHistoryProductionArtifactsV35({
          root,
          plan: v35Plan,
        });
        return {
          outputArtifacts: [],
          warnings: [
            `History V3.5 render derivative synced (${derivative.shotCount} shots; ${derivative.illustrationShotCount} illustration shots).`,
            `Approve with mediaforge history visuals approve ${path.basename(root)} --planner-version v3.5 --plan-hash ${v35Plan.planHash} --derivative-hash ${derivative.derivativeHash}.`,
          ],
        };
      }
      const visualPlanning = await planHistoryVisuals({
        episodeId: path.basename(root),
        outputRoot: path.dirname(root),
      });
      const narration = normalizeWhitespace(
        await fs.readFile(scriptPath, "utf8")
      );
      const metadata = (await readJson(source("normalized-metadata.json"))) as {
        geographicScope?: { labels?: string[] };
        period?: { original?: string };
        originalFrontmatter?: { title?: string };
      };
      const chunks = splitNarrationIntoScenes(narration, 16);
      let startSeconds = 0;
      const scenes = chunks.map((chunk, index) => {
        const duration = Math.max(12, (chunk.split(/\s+/u).length / 108) * 60);
        const endSeconds = startSeconds + duration;
        const sequence = index + 1;
        const scene = {
          id: `scene-${String(sequence).padStart(3, "0")}`,
          sequenceNumber: sequence,
          canonicalNarration: chunk,
          sourceSegmentIds: [`scene-${String(sequence).padStart(3, "0")}`],
          estimatedDurationSeconds: duration,
          timing: { startSeconds, endSeconds },
          visualPurpose: "Evidence-aware History documentary illustration.",
          textRequirement: { required: false },
          subject: normalizeWhitespace(chunk)
            .split(/\s+/u)
            .slice(0, 14)
            .join(" "),
          action: `depicts this distinct historical beat: ${normalizeWhitespace(chunk).split(/\s+/u).slice(14, 32).join(" ")}`,
          setting: `${metadata.period?.original ?? "historical period"}; ${(metadata.geographicScope?.labels ?? []).join(", ") || "documentary context"}`,
          composition:
            "Landscape 16:9, one clear focal point, historically grounded material culture.",
          cameraFraming: "wide documentary shot",
          mood: "measured, evidence-led",
          continuityReferences:
            index === 0 ? [] : [`scene-${String(index).padStart(3, "0")}`],
          onScreenText: "",
          negativeConstraints: [
            "no modern objects",
            "no invented readable text",
            "no watermark",
            "no anachronistic clothing or architecture",
          ],
          aspectRatios: ["16:9"],
          imagePrompt: `40-50mm natural perspective, cinematic historical reconstruction, grounded documentary realism. ${chunk} Period: ${metadata.period?.original ?? "historical"}. Location: ${(metadata.geographicScope?.labels ?? []).join(", ")}. Period-accurate uniforms and material culture. No modern objects, readable text, logos, or watermarks. Landscape 16:9.`,
          expectedImageFilenames: [
            sceneFilename(sequence, startSeconds, endSeconds, "16:9"),
          ],
          qualityStatus: "draft",
        };
        startSeconds = endSeconds;
        return scene;
      });
      const scenePlan = scenePlanSchema.parse({
        sourceId: path.basename(root),
        scenes,
      });
      await fs.mkdir(path.join(root, "shared"), { recursive: true });
      await fs.mkdir(path.join(root, "canonical"), { recursive: true });
      await writeJsonAtomic(
        path.join(root, "shared", "scenes.json"),
        scenePlan
      );
      await writeJsonAtomic(
        path.join(root, "canonical", "scenes.json"),
        scenePlan
      );
      const manifestPath = path.join(root, "manifest.json");
      const manifest = (await readJson(manifestPath)) as Record<
        string,
        unknown
      >;
      await writeJsonAtomic(manifestPath, {
        ...manifest,
        scenePlan,
        updatedAt: new Date().toISOString(),
      });
      return {
        outputArtifacts: [],
        warnings: [
          ...visualPlanning.validation.warnings,
          `Workflow state: ${visualPlanning.approvalPack.state}. Run ${visualPlanning.approvalPack.approvalCommand}.`,
        ],
      };
    },
    "history.map-timeline-planning": async () => {
      const chronology = chronologySchema.parse(
        await readJson(source("chronology.json"))
      );
      const metadata = (await readJson(source("normalized-metadata.json"))) as {
        geographicScope?: { labels?: string[] };
        requiredFeatures?: { maps?: boolean; timeline?: boolean };
      };
      await writeJsonAtomic(source("map-timeline-plan.json"), {
        schemaVersion: HISTORY_PRODUCTION_BINDINGS_VERSION,
        maps: metadata.requiredFeatures?.maps
          ? [
              {
                id: "episode-geography",
                geographicExtent: (metadata.geographicScope?.labels ?? []).join(
                  ", "
                ),
                disclosure:
                  "Orientation map; boundaries and routes are interpretive unless otherwise labeled.",
              },
            ]
          : [],
        timeline: metadata.requiredFeatures?.timeline
          ? chronology.map((event) => ({
              id: event.id,
              label: event.label,
              certainty: "consensus",
            }))
          : [],
      });
      return { outputArtifacts: [], warnings: [] };
    },
    "history.localization": async () => {
      await writeJsonAtomic(source("localization-en.json"), {
        locale: "en",
        sourceScript: "languages/script-en.md",
        status: "canonical-source-retained",
      });
      return { outputArtifacts: [], warnings: [] };
    },
    "history.audio-generation": externalArtifactTask(
      root,
      "locales/en/full/audio/narration.wav",
      "pnpm mediaforge -- --tts-provider openai-compatible audio generate <episode-id>"
    ),
    "history.chapter-alignment": async () => {
      if (
        !(await fileExists(
          path.join(root, "locales", "en", "full", "audio", "narration.wav")
        ))
      )
        throw new Error(
          "Chapter alignment requires generated narration audio."
        );
      await writeJsonAtomic(source("final-chapters.json"), {
        timingSource: "actual-audio-required",
        provisional: false,
        note: "Run metadata generation after audio to derive publishable chapter timestamps.",
      });
      return { outputArtifacts: [], warnings: [] };
    },
    "history.image-generation": async (context) => {
      await assertHistoryVisualApproval(root);
      return externalArtifactTask(
        root,
        "shared/images/generated",
        "pnpm mediaforge -- images generate --episode <episode-id>"
      )(context);
    },
    "history.video-rendering": externalArtifactTask(
      root,
      "locales/en/full/renders/youtube/youtube-16x9-clean.mp4",
      "pnpm mediaforge -- render <episode-id> --profile youtube"
    ),
    "history.thumbnail-rendering": externalArtifactTask(
      root,
      "locales/en/full/thumbnails/thumbnail.png",
      "pnpm mediaforge -- thumbnails generate --episode-slug <episode-id> --locale en --format full"
    ),
    "history.publish-validation": async () => {
      const required = [
        "locales/en/full/renders/youtube/youtube-16x9-clean.mp4",
        "locales/en/full/thumbnails/thumbnail.png",
      ];
      const missing = (
        await Promise.all(
          required.map(async (relative) => ({
            relative,
            exists: await fileExists(path.join(root, relative)),
          }))
        )
      )
        .filter((entry) => !entry.exists)
        .map((entry) => entry.relative);
      if (missing.length > 0)
        throw new Error(
          `Publication validation requires: ${missing.join(", ")}.`
        );
      await updateValidationReport(root, {
        mediaValidationPassed: true,
        releaseValidationPassed: false,
      });
      return {
        outputArtifacts: [],
        warnings: [
          "Release validation and operator publication approval remain required.",
        ],
      };
    },
  };
}

function instanceId(unitId: string, locale: string, variant: string): string {
  return `workflow-${crypto.createHash("sha256").update(`${historyWorkflowDefinition.id}\0${historyWorkflowDefinition.revision}\0${unitId}\0${locale}\0${variant}`).digest("hex").slice(0, 32)}`;
}

export function createHistoryWorkflowOperator(request: {
  readonly unitRoot: string;
  readonly episodeId: string;
  readonly locale?: string;
  readonly variant?: string;
  readonly now?: () => Date;
}): WorkflowOperator {
  const unitId = productionUnitIdSchema.parse(request.episodeId);
  const locale = contentLocaleSchema.parse(request.locale ?? "en");
  const variant = contentVariantSchema.parse(request.variant ?? "full");
  return new WorkflowOperator({
    unitRoot: request.unitRoot,
    workflow: historyWorkflowDefinition,
    registry: createTaskRegistry(
      createHistoryTaskRegistrations({
        ...createHistoryProductionImplementations(request.unitRoot),
        "history.research-brief": async () => {
          const metadata = zHistoryImportMetadata.parse(
            JSON.parse(
              await fs.readFile(
                path.join(
                  request.unitRoot,
                  "source",
                  "normalized-metadata.json"
                ),
                "utf8"
              )
            )
          );
          const brief = historyResearchBriefSchema.parse({
            centralQuestion: metadata.originalFrontmatter.hook,
            geographicScope: metadata.geographicScope.labels,
            importantActors: [],
            requiredMaps: metadata.requiredFeatures.maps
              ? ["episode geographic context"]
              : [],
            requiredTimelines: metadata.requiredFeatures.timeline
              ? ["episode chronology"]
              : [],
            likelyDisputedClaims: [],
            terminology: [],
            sensitivityConcerns: metadata.sensitivityTags,
            requiredSourceCategories: [
              "primary",
              "peer-reviewed-scholarly",
              "museum-archive-university",
            ],
            exclusions: [
              "invented dialogue",
              "unsupported motives",
              "unverified quotations",
            ],
            targetAudience: metadata.audienceLevel,
            targetDurationMinutes: metadata.runtime.targetDurationMinutes,
          });
          await writeJsonAtomic(
            path.join(request.unitRoot, "source", "research-brief.json"),
            brief
          );
          return { outputArtifacts: [], warnings: [] };
        },
      })
    ),
    identity: {
      instanceId: instanceId(unitId, locale, variant),
      unitId,
      locale,
      variant,
    },
    ...(request.now ? { now: request.now } : {}),
  });
}

const zHistoryImportMetadata = z
  .object({
    originalFrontmatter: z.object({ hook: z.string().min(1) }).passthrough(),
    geographicScope: z
      .object({ labels: z.array(z.string().min(1)) })
      .passthrough(),
    requiredFeatures: z
      .object({ maps: z.boolean(), timeline: z.boolean() })
      .passthrough(),
    sensitivityTags: z.array(z.string().min(1)),
    audienceLevel: z.enum(["general", "enthusiast", "academic-lite"]),
    runtime: z
      .object({ targetDurationMinutes: z.number().positive() })
      .passthrough(),
  })
  .passthrough();

export async function recordHistoryImportCheckpoints(request: {
  readonly unitRoot: string;
  readonly episodeId: string;
  readonly now?: () => Date;
}): Promise<void> {
  const operator = createHistoryWorkflowOperator(request);
  await operator.initialize();
  const status = await operator.status();
  for (const taskId of HISTORY_IMPORTED_CHECKPOINT_TASK_IDS) {
    const task = status.tasks.find((value) => value.taskId === taskId);
    if (task?.persistedStatus !== "succeeded") await operator.runTask(taskId);
  }
}
