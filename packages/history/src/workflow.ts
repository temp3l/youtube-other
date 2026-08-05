import fs from "node:fs/promises";
import path from "node:path";
import { normalizeEpisodeId, writeJsonAtomic } from "@mediaforge/shared";
import { z } from "zod";
import { chronologySchema, historicalClaimSchema } from "./research.js";
import { validateHistoricalNarration } from "./validation.js";
import { createHistoryWorkflowOperator } from "./task-registry.js";

function episodeRoot(episodeId: string, outputRoot?: string): string {
  return path.join(path.resolve(outputRoot ?? path.join(process.cwd(), "episodes")), normalizeEpisodeId(episodeId));
}

export async function inspectHistoryWorkflow(request: { readonly episodeId: string; readonly outputRoot?: string }): Promise<{ readonly workflow: Awaited<ReturnType<ReturnType<typeof createHistoryWorkflowOperator>["status"]>>; readonly episodeId: string; readonly publishReady: boolean; readonly publishBlockers: readonly string[] }> {
  const root = episodeRoot(request.episodeId, request.outputRoot);
  const operator = createHistoryWorkflowOperator({ unitRoot: root, episodeId: request.episodeId });
  const workflow = await operator.status();
  const validation = z.object({
    factualValidationPassed: z.boolean(),
    mediaValidationPassed: z.boolean(),
    releaseValidationPassed: z.boolean(),
  }).passthrough().parse(JSON.parse(await fs.readFile(path.join(root, "source", "validation-report.json"), "utf8")));
  const publishBlockers = [
    ...(!validation.factualValidationPassed ? ["factual-validation"] : []),
    ...(!validation.mediaValidationPassed ? ["media-validation"] : []),
    ...(!validation.releaseValidationPassed ? ["release-validation"] : []),
    ...workflow.tasks.filter((task) => task.persistedStatus !== "succeeded" && task.persistedStatus !== "skipped").map((task) => task.taskId),
  ];
  return { workflow, episodeId: request.episodeId, publishReady: publishBlockers.length === 0 && workflow.complete, publishBlockers };
}

export async function getHistoryNextStep(request: { readonly episodeId: string; readonly outputRoot?: string }): Promise<{ readonly episodeId: string; readonly nextTask: string | null; readonly command: string | null; readonly publishReady: boolean }> {
  const status = await inspectHistoryWorkflow(request);
  const commandByTask: Readonly<Record<string, string>> = {
    "history.research-brief": `mediaforge workflow history run-next --episode ${status.episodeId}`,
  };
  const nextTask = status.workflow.nextTaskId;
  return { episodeId: status.episodeId, nextTask, command: nextTask ? commandByTask[nextTask] ?? null : null, publishReady: status.publishReady };
}

export async function validateHistoryEpisodeFactuality(request: { readonly episodeId: string; readonly outputRoot?: string; readonly write?: boolean }): Promise<{ readonly status: "blocked" | "passed" | "failed"; readonly publishReady: false; readonly missingArtifacts: readonly string[]; readonly issues: readonly unknown[] }> {
  const root = episodeRoot(request.episodeId, request.outputRoot);
  const files = {
    narration: path.join(root, "languages", "script-en.md"),
    claims: path.join(root, "source", "claims.json"),
    chronology: path.join(root, "source", "chronology.json"),
    quotations: path.join(root, "source", "verified-quotations.json"),
  };
  const missingArtifacts: string[] = [];
  for (const [name, file] of Object.entries(files)) {
    try { await fs.access(file); } catch { missingArtifacts.push(name); }
  }
  if (missingArtifacts.length > 0) return { status: "blocked", publishReady: false, missingArtifacts, issues: [] };
  const [narration, claimsValue, chronologyValue, quotationsValue] = await Promise.all([
    fs.readFile(files.narration, "utf8"),
    fs.readFile(files.claims, "utf8").then(JSON.parse),
    fs.readFile(files.chronology, "utf8").then(JSON.parse),
    fs.readFile(files.quotations, "utf8").then(JSON.parse),
  ]);
  const claims = z.array(historicalClaimSchema).parse(claimsValue);
  const chronology = chronologySchema.parse(chronologyValue);
  const quotations = z.array(z.string().min(1)).parse(quotationsValue);
  const result = validateHistoricalNarration({ narration, claims, chronology, verifiedQuotations: quotations });
  if (request.write) {
    await writeJsonAtomic(path.join(root, "source", "factuality-audit.json"), { ...result, publishReady: false, validatedAt: new Date().toISOString() });
  }
  return { status: result.status, publishReady: false, missingArtifacts: [], issues: result.issues };
}
