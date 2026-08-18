import fs from "node:fs/promises";
import path from "node:path";
import {
  isVeronicaVisualReviewApproved,
  veronicaPostGenerationVisualReviewSchema,
  type SceneGenerationManifest,
} from "@mediaforge/image-generation";
import { fileExists, hashFile, hashText, writeJsonAtomic } from "@mediaforge/shared";

export type VeronicaImageMismatchClassification =
  | "CURRENT"
  | "A"
  | "B"
  | "C"
  | "D"
  | "E";

export interface VeronicaImageReconciliationInventoryEntry {
  readonly assetId: string;
  readonly sceneId: string;
  readonly currentProviderPromptHash: string;
  readonly currentSemanticInputHash: string;
  readonly currentCanonicalFinalPromptHash: string;
  readonly imagePath: string;
  readonly currentImageSha256: string;
  readonly manifestImageSha256: string | null;
  readonly manifestPromptHash: string;
  readonly postImageQaInputHash: string | null;
  readonly postImageQaResult: {
    readonly verdict: "PASS" | "BLOCK";
    readonly semanticBriefHash: string;
    readonly finalPromptHash: string;
    readonly evaluatorModel: string;
    readonly evaluatorConfigHash: string;
    readonly schemaVersion: string;
  } | null;
  readonly generationRequestId: string | null;
  readonly generationAttempt: number | null;
  readonly generationRevision: string | null;
  readonly generationDebugLogPath: string | null;
  readonly generationDebugLogSha256: string | null;
  readonly generationDebugTimestamp: string | null;
  readonly bytesActuallyChanged: boolean;
  readonly semanticPromptMateriallyChanged: boolean;
  readonly classification: VeronicaImageMismatchClassification;
  readonly safeReuse: "yes" | "manifest-repair" | "qa-rerun-then-rebind" | "qa-rerun-then-decide" | "no";
  readonly retry: {
    readonly providerRequests: number;
    readonly successfulRequests: number;
    readonly providerFailures: number;
    readonly semanticQaFailures: number;
    readonly technicalFailures: number;
    readonly duplicatePromptRequests: number;
    readonly acceptedAttemptNumber: number | null;
    readonly acceptedImageHashes: readonly string[];
    readonly acceptedPixelsLaterInvalidated: boolean;
  };
}

export interface VeronicaImageReconciliationInventory {
  readonly schemaVersion: "veronica-image-reconciliation-inventory.v1";
  readonly episodeId: string;
  readonly generatedAt: string;
  readonly requiredAssetCount: number;
  readonly entries: readonly VeronicaImageReconciliationInventoryEntry[];
  readonly summary: {
    readonly manifestFileMatches: number;
    readonly manifestFileMismatches: number;
    readonly currentPassPixels: number;
    readonly classifications: Readonly<Record<VeronicaImageMismatchClassification, number>>;
    readonly historicalProviderRequests: number;
    readonly duplicatePromptRequests: number;
  };
}

interface ProviderPromptEntry {
  readonly assetId: string;
  readonly imagePrompt: string;
  readonly promptHash: string;
  readonly compilationInputHash: string;
}

interface DebugRecord {
  readonly fileName: string;
  readonly absolutePath: string;
  readonly value: Record<string, unknown>;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringAt(value: unknown, key: string): string | null {
  const object = record(value);
  return object && typeof object[key] === "string" ? object[key] : null;
}

function nestedString(value: unknown, keys: readonly string[]): string | null {
  let current: unknown = value;
  for (const key of keys) current = record(current)?.[key];
  return typeof current === "string" ? current : null;
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
}

async function readDebugRecords(directory: string): Promise<readonly DebugRecord[]> {
  const names = await fs.readdir(directory).catch(() => []);
  const records: DebugRecord[] = [];
  for (const fileName of names.sort()) {
    if (!fileName.endsWith(".json")) continue;
    const absolutePath = path.join(directory, fileName);
    try {
      const value = record(await readJson(absolutePath));
      if (value) records.push({ fileName, absolutePath, value });
    } catch {
      // Malformed debug records cannot support provenance reconciliation.
    }
  }
  return records;
}

function timestamp(recordValue: Record<string, unknown>): string {
  return typeof recordValue["timestamp"] === "string"
    ? recordValue["timestamp"]
    : "";
}

function isTerminalImageRequest(value: Record<string, unknown>): boolean {
  return value["operation"] === "image-generation" &&
    (value["status"] === "success" || value["status"] === "error");
}

function callerStage(value: Record<string, unknown>): string | null {
  return nestedString(value, ["caller", "stage"]);
}

function requestPrompt(value: Record<string, unknown>): string | null {
  return nestedString(value, ["request", "prompt"]);
}

function requestId(value: Record<string, unknown>): string | null {
  return nestedString(value, ["response", "request_id"])
    ?? nestedString(value, ["response", "data", "request_id"])
    ?? nestedString(value, ["response", "id"]);
}

function debugContainsImageSha(value: Record<string, unknown>, imageSha256: string): boolean {
  return JSON.stringify(value).includes(imageSha256);
}

function outputFileMatchesAsset(outputPath: string, assetId: string): boolean {
  return path.basename(outputPath).startsWith(`${assetId}-`);
}

export function resolveVeronicaImageReconciliationInventoryPath(episodeDir: string): string {
  return path.join(
    episodeDir,
    "state",
    "image-generation",
    "reconciliation",
    "inventory.v1.json",
  );
}

export async function buildVeronicaImageReconciliationInventory(input: {
  readonly episodeDir: string;
  readonly language: string;
  readonly variant: "short" | "full";
}): Promise<VeronicaImageReconciliationInventory> {
  const promptArtifact = record(await readJson(path.join(
    input.episodeDir,
    "locales",
    input.language,
    input.variant,
    "image-prompts",
    "provider-image-prompts.v1.json",
  )));
  const prompts = Array.isArray(promptArtifact?.["prompts"])
    ? promptArtifact["prompts"].map((value) => record(value)).filter((value): value is Record<string, unknown> => value !== null)
    : [];
  const providerPrompts: ProviderPromptEntry[] = prompts.map((value) => ({
    assetId: String(value["assetId"] ?? ""),
    imagePrompt: String(value["imagePrompt"] ?? ""),
    promptHash: String(value["promptHash"] ?? ""),
    compilationInputHash: String(value["compilationInputHash"] ?? ""),
  }));
  const manifestsDir = path.join(input.episodeDir, "state", "image-generation", "manifests");
  const manifestNames = (await fs.readdir(manifestsDir)).filter((name) => name.endsWith(".json")).sort();
  const manifests = await Promise.all(manifestNames.map(async (fileName) => ({
    fileName,
    value: await readJson(path.join(manifestsDir, fileName)) as SceneGenerationManifest,
  })));
  const qaDir = path.join(input.episodeDir, "state", "image-generation", "veronica-post-generation-visual-qa");
  const qaNames = (await fs.readdir(qaDir).catch(() => [])).filter((name) => name.endsWith(".json"));
  const debugDir = path.join(input.episodeDir, "debug", "openai-calls");
  const debugRecords = await readDebugRecords(debugDir);
  const entries: VeronicaImageReconciliationInventoryEntry[] = [];

  for (const providerPrompt of providerPrompts) {
    const manifestRecord = manifests.find(({ value }) =>
      outputFileMatchesAsset(value.outputPath, providerPrompt.assetId));
    if (!manifestRecord) throw new Error(`VERONICA_RECONCILIATION_MANIFEST_MISSING:${providerPrompt.assetId}`);
    const manifest = manifestRecord.value;
    if (!(await fileExists(manifest.outputPath))) {
      throw new Error(`VERONICA_RECONCILIATION_IMAGE_MISSING:${providerPrompt.assetId}`);
    }
    const currentImageSha256 = await hashFile(manifest.outputPath);
    const reviews = (await Promise.all(
      qaNames.filter((name) => name.startsWith(`${manifest.sceneId}.`)).map(async (fileName) => {
        try {
          return {
            fileName,
            review: veronicaPostGenerationVisualReviewSchema.parse(await readJson(path.join(qaDir, fileName))),
            mtimeMs: (await fs.stat(path.join(qaDir, fileName))).mtimeMs,
          };
        } catch {
          return null;
        }
      }),
    )).filter((value): value is NonNullable<typeof value> => value !== null);
    const matchingReviews = reviews
      .filter(({ review }) => review.imageFingerprint === currentImageSha256)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    const currentReview = matchingReviews[0] ?? null;
    const qaDebug = debugRecords
      .filter(({ value }) => value["operation"] === "veronica-post-generation-visual-qa" && debugContainsImageSha(value, currentImageSha256))
      .sort((a, b) => timestamp(a.value).localeCompare(timestamp(b.value)))
      .at(-1);
    const sceneRequests = debugRecords
      .filter(({ value }) => isTerminalImageRequest(value) && callerStage(value) === manifest.sceneId)
      .sort((a, b) => timestamp(a.value).localeCompare(timestamp(b.value)));
    const generationCandidates = currentReview
      ? sceneRequests.filter(({ value }) => {
          const prompt = requestPrompt(value);
          return value["status"] === "success" &&
            prompt !== null &&
            hashText(prompt) === currentReview.review.finalPromptHash &&
            (!qaDebug || timestamp(value) <= timestamp(qaDebug.value));
        })
      : [];
    const generation = generationCandidates.at(-1) ?? null;
    const successfulRequests = sceneRequests.filter(({ value }) => value["status"] === "success");
    const failedRequests = sceneRequests.filter(({ value }) => value["status"] === "error");
    const successfulPromptHashes = successfulRequests.map(({ value }) => hashText(requestPrompt(value) ?? ""));
    const passingReviews = reviews.filter(({ review }) => isVeronicaVisualReviewApproved(review));
    const bytesActuallyChanged = manifest.outputSha256 !== currentImageSha256;
    const semanticPromptMateriallyChanged = !manifest.finalPrompt.includes(providerPrompt.imagePrompt);
    const exactQaBinding = currentReview !== null &&
      currentReview.review.semanticBriefHash === providerPrompt.compilationInputHash &&
      currentReview.review.finalPromptHash === hashText(manifest.finalPrompt);
    let classification: VeronicaImageMismatchClassification = "CURRENT";
    let safeReuse: VeronicaImageReconciliationInventoryEntry["safeReuse"] = "yes";
    if (bytesActuallyChanged) {
      if (semanticPromptMateriallyChanged) {
        classification = "C";
        safeReuse = "no";
      } else if (!currentReview || !generation) {
        classification = "D";
        safeReuse = "no";
      } else if (isVeronicaVisualReviewApproved(currentReview.review) && exactQaBinding) {
        classification = "A";
        safeReuse = "manifest-repair";
      } else if (isVeronicaVisualReviewApproved(currentReview.review)) {
        classification = "B";
        safeReuse = "qa-rerun-then-rebind";
      } else {
        classification = "E";
        safeReuse = "qa-rerun-then-decide";
      }
    }
    const generationDebugLogPath = generation
      ? path.relative(input.episodeDir, generation.absolutePath)
      : null;
    entries.push({
      assetId: providerPrompt.assetId,
      sceneId: manifest.sceneId,
      currentProviderPromptHash: providerPrompt.promptHash,
      currentSemanticInputHash: providerPrompt.compilationInputHash,
      currentCanonicalFinalPromptHash: hashText(manifest.finalPrompt),
      imagePath: manifest.outputPath,
      currentImageSha256,
      manifestImageSha256: manifest.outputSha256 ?? null,
      manifestPromptHash: manifest.promptHash,
      postImageQaInputHash: currentReview
        ? currentReview.fileName.slice(`${manifest.sceneId}.`.length, -5)
        : null,
      postImageQaResult: currentReview
        ? {
            verdict: isVeronicaVisualReviewApproved(currentReview.review) ? "PASS" : "BLOCK",
            semanticBriefHash: currentReview.review.semanticBriefHash,
            finalPromptHash: currentReview.review.finalPromptHash,
            evaluatorModel: currentReview.review.evaluatorModel,
            evaluatorConfigHash: currentReview.review.evaluatorConfigHash,
            schemaVersion: currentReview.review.schemaVersion,
          }
        : null,
      generationRequestId: generation ? requestId(generation.value) : null,
      generationAttempt: generation
        ? successfulRequests.findIndex(({ fileName }) => fileName === generation.fileName) + 1
        : null,
      generationRevision: manifest.generatedAt ?? null,
      generationDebugLogPath,
      generationDebugLogSha256: generation ? await hashFile(generation.absolutePath) : null,
      generationDebugTimestamp: generation ? timestamp(generation.value) : null,
      bytesActuallyChanged,
      semanticPromptMateriallyChanged,
      classification,
      safeReuse,
      retry: {
        providerRequests: sceneRequests.length,
        successfulRequests: successfulRequests.length,
        providerFailures: failedRequests.length,
        semanticQaFailures: reviews.length - passingReviews.length,
        technicalFailures: 0,
        duplicatePromptRequests: successfulPromptHashes.length - new Set(successfulPromptHashes).size,
        acceptedAttemptNumber: currentReview && isVeronicaVisualReviewApproved(currentReview.review) && generation
          ? successfulRequests.findIndex(({ fileName }) => fileName === generation.fileName) + 1
          : null,
        acceptedImageHashes: passingReviews.map(({ review }) => review.imageFingerprint),
        acceptedPixelsLaterInvalidated: passingReviews.some(({ review }) => review.imageFingerprint !== currentImageSha256),
      },
    });
  }
  const classifications: Record<VeronicaImageMismatchClassification, number> = {
    CURRENT: 0, A: 0, B: 0, C: 0, D: 0, E: 0,
  };
  for (const entry of entries) classifications[entry.classification] += 1;
  return {
    schemaVersion: "veronica-image-reconciliation-inventory.v1",
    episodeId: path.basename(input.episodeDir),
    generatedAt: new Date().toISOString(),
    requiredAssetCount: entries.length,
    entries,
    summary: {
      manifestFileMatches: entries.filter((entry) => !entry.bytesActuallyChanged).length,
      manifestFileMismatches: entries.filter((entry) => entry.bytesActuallyChanged).length,
      currentPassPixels: entries.filter((entry) => entry.postImageQaResult?.verdict === "PASS").length,
      classifications,
      historicalProviderRequests: entries.reduce((total, entry) => total + entry.retry.providerRequests, 0),
      duplicatePromptRequests: entries.reduce((total, entry) => total + entry.retry.duplicatePromptRequests, 0),
    },
  };
}

export async function loadVeronicaImageReconciliationInventory(
  inventoryPath: string,
): Promise<VeronicaImageReconciliationInventory> {
  const value = await readJson(inventoryPath) as VeronicaImageReconciliationInventory;
  if (
    value.schemaVersion !== "veronica-image-reconciliation-inventory.v1" ||
    !Array.isArray(value.entries) ||
    value.entries.length === 0
  ) {
    throw new Error(`VERONICA_RECONCILIATION_INVENTORY_INVALID:${inventoryPath}`);
  }
  return value;
}

export async function persistVeronicaImageReconciliationInventory(input: {
  readonly episodeDir: string;
  readonly language: string;
  readonly variant: "short" | "full";
}): Promise<{ readonly path: string; readonly inventory: VeronicaImageReconciliationInventory }> {
  const inventory = await buildVeronicaImageReconciliationInventory(input);
  const inventoryPath = resolveVeronicaImageReconciliationInventoryPath(input.episodeDir);
  await writeJsonAtomic(inventoryPath, inventory);
  return { path: inventoryPath, inventory };
}
