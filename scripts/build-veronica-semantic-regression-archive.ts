import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const [workspaceArgument, outputArgument] = process.argv.slice(2);
if (!workspaceArgument || !outputArgument) throw new Error("Usage: build-veronica-semantic-regression-archive <workspace> <output-dir>");
const workspaceRoot = path.resolve(workspaceArgument);
const outputDir = path.resolve(outputArgument);
await fs.mkdir(outputDir, { recursive: false });

async function sha256(filePath: string): Promise<string> {
  return createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

const episodeNames = (await fs.readdir(workspaceRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const packs = [];
for (const episodeId of episodeNames) {
  const episodeDir = path.join(workspaceRoot, episodeId);
  const variant = await fs.access(path.join(episodeDir, "languages", "short")).then(() => "short" as const).catch(() => "full" as const);
  const packRoot = path.join(episodeDir, "review-packs", "pre-image", `en-${variant}`);
  const latest = JSON.parse(await fs.readFile(path.join(packRoot, "latest.json"), "utf8")) as { readonly packDir: string };
  const sourceDir = path.join(packRoot, latest.packDir);
  const reviewManifest = JSON.parse(await fs.readFile(path.join(sourceDir, "review-manifest.json"), "utf8")) as {
    readonly narrationDurationSeconds: number;
    readonly selectedAudioHash: string;
    readonly providerRequestsAllowed: boolean;
    readonly packHashValidation: "PASS";
    readonly packCrossArtifactIntegrity: { readonly status: "PASS" | "FAIL" };
    readonly semanticIntegrity: { readonly blockerCount: number };
    readonly providerProjectionIntegrity: { readonly status: "PASS" | "FAIL"; readonly missingThesisCount: number; readonly malformedThesisCount: number; readonly blockedProjectionCount: number };
    readonly providerPromptQuality: { readonly status: "PASS" | "FAIL"; readonly blockedMarkerCount: number; readonly internalLanguageIssueCount: number; readonly lexicalCorruptionCount: number };
    readonly semanticCoherenceIntegrity: { readonly status: "PASS" | "FAIL"; readonly incompleteClaimCount: number; readonly polarityMismatchCount: number; readonly propositionContradictionCount: number; readonly treatmentIncompatibilityCount: number; readonly projectionMismatchCount: number; readonly motifLeakageCount: number; readonly harmfulRepetitionCount: number };
    readonly semanticQuality: { readonly status: "PASS" | "FAIL"; readonly remediationTemplateReuseRate: number; readonly genericFallbackSceneRate: number; readonly repeatedActionFamilyRate: number; readonly repeatedEnvironmentFamilyRate: number; readonly intentionalMotifReuseRate: number; readonly accidentalRepetitionRate: number };
    readonly overallPackValidity: boolean;
    readonly narrationDiagnostic: { readonly approximateWordsPerMinute: number };
    readonly sources: readonly { readonly name: string; readonly sha256: string }[];
    readonly packFileHashes: Readonly<Record<string, string>>;
  };
  const semantic = JSON.parse(await fs.readFile(path.join(sourceDir, "pre-image-semantic-reviews.v1.json"), "utf8")) as {
    readonly initialReviews?: readonly { readonly findings: readonly { readonly severity: string }[] }[];
    readonly reviews: readonly { readonly findings: readonly { readonly severity: string }[] }[];
    readonly remediationRounds?: number;
  };
  for (const source of reviewManifest.sources) {
    if (await sha256(path.join(sourceDir, source.name)) !== source.sha256) throw new Error(`Source hash mismatch: ${episodeId}/${source.name}`);
  }
  for (const [name, expected] of Object.entries(reviewManifest.packFileHashes)) {
    if (await sha256(path.join(sourceDir, name)) !== expected) throw new Error(`Pack hash mismatch: ${episodeId}/${name}`);
  }
  const visualPlan = JSON.parse(await fs.readFile(path.join(sourceDir, "visual-plan.json"), "utf8")) as { readonly contentId: string };
  const packId = `${visualPlan.contentId}-${variant}`;
  await fs.cp(sourceDir, path.join(outputDir, packId), { recursive: true, errorOnExist: true });
  const finalFindings = semantic.reviews.flatMap((review) => review.findings);
  packs.push({
    packId,
    contentId: visualPlan.contentId,
    variant,
    durationSeconds: reviewManifest.narrationDurationSeconds,
    approximateWordsPerMinute: reviewManifest.narrationDiagnostic.approximateWordsPerMinute,
    initialBlockerCount: (semantic.initialReviews ?? semantic.reviews).flatMap((review) => review.findings).filter((finding) => finding.severity === "blocker" || finding.severity === "error").length,
    blockerCount: reviewManifest.semanticIntegrity.blockerCount,
    warningCount: finalFindings.filter((finding) => finding.severity === "warning" || finding.severity === "info").length,
    remediationRounds: semantic.remediationRounds ?? 0,
    selectedAudioHash: reviewManifest.selectedAudioHash,
    timingIntegrityStatus: reviewManifest.packCrossArtifactIntegrity.status,
    providerProjectionStatus: reviewManifest.providerProjectionIntegrity.status,
    providerPromptQualityStatus: reviewManifest.providerPromptQuality.status,
    missingThesisCount: reviewManifest.providerProjectionIntegrity.missingThesisCount,
    malformedThesisCount: reviewManifest.providerProjectionIntegrity.malformedThesisCount,
    projectionBlockedCount: reviewManifest.providerProjectionIntegrity.blockedProjectionCount,
    blockedMarkerCount: reviewManifest.providerPromptQuality.blockedMarkerCount,
    lexicalCorruptionCount: reviewManifest.providerPromptQuality.lexicalCorruptionCount,
    semanticCoherenceIntegrity: reviewManifest.semanticCoherenceIntegrity,
    semanticQuality: reviewManifest.semanticQuality,
    overallPackValidity: reviewManifest.overallPackValidity,
    providerReadiness: reviewManifest.providerRequestsAllowed ? "ALLOWED" : "BLOCKED_PENDING_HUMAN_PRE_IMAGE_APPROVAL",
    hashStatus: reviewManifest.packHashValidation,
  });
}
if (packs.length !== 8) throw new Error(`Expected 8 packs, found ${packs.length}.`);
const aggregate = {
  schemaVersion: "veronica-l02-l03-semantic-regression-archive.v1",
  generatedAt: new Date().toISOString(),
  newLiveTtsProviderCallCount: 0,
  imageProviderCallCount: 0,
  status: packs.every((pack) => pack.blockerCount === 0 && pack.timingIntegrityStatus === "PASS" && pack.hashStatus === "PASS" && pack.providerProjectionStatus === "PASS" && pack.providerPromptQualityStatus === "PASS" && pack.semanticCoherenceIntegrity.status === "PASS" && pack.semanticQuality.status === "PASS" && pack.overallPackValidity && pack.providerReadiness === "BLOCKED_PENDING_HUMAN_PRE_IMAGE_APPROVAL") ? "READY_FOR_HUMAN_PRE_IMAGE_REVIEW" : "NOT_READY",
  packs,
};
await fs.writeFile(path.join(outputDir, "aggregate-manifest.json"), `${JSON.stringify(aggregate, null, 2)}\n`, "utf8");
const zipPath = `${outputDir}.zip`;
await execFileAsync("zip", ["-X", "-q", "-r", zipPath, path.basename(outputDir)], { cwd: path.dirname(outputDir) });
await execFileAsync("unzip", ["-t", zipPath]);
process.stdout.write(`${JSON.stringify({ outputDir, zipPath, zipSha256: await sha256(zipPath), status: aggregate.status, packCount: packs.length }, null, 2)}\n`);
