import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createVeronicaPreImageReviewPack, reviewPackModeSchema } from "../apps/cli/src/veronica-pre-image-review-pack.js";

const execFileAsync = promisify(execFile);
const [workspaceArgument, outputArgument, reviewPackModeArgument = "compact"] = process.argv.slice(2);
if (!workspaceArgument || !outputArgument) throw new Error("Usage: build-veronica-semantic-regression-archive <workspace> <output-dir>");
const workspaceRoot = path.resolve(workspaceArgument);
const outputDir = path.resolve(outputArgument);
const reviewPackMode = reviewPackModeSchema.parse(reviewPackModeArgument);
const historicalCompactSourceRoot = path.resolve("artifacts/review/veronica-l02-l03-chatgpt-review-final-coherent-20260810T2119Z");
await fs.mkdir(outputDir, { recursive: false });

async function sha256(filePath: string): Promise<string> {
  return createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

async function directoryBytes(directory: string): Promise<number> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const sizes = await Promise.all(entries.map(async (entry) => entry.isDirectory() ? directoryBytes(path.join(directory, entry.name)) : (await fs.stat(path.join(directory, entry.name))).size));
  return sizes.reduce((total, size) => total + size, 0);
}

function wavMetadata(bytes: Buffer): { readonly durationSeconds: number; readonly sampleRateHz: number; readonly channels: number; readonly codec: "pcm" | "ieee-float" } {
  if (bytes.subarray(0, 4).toString("ascii") !== "RIFF" || bytes.subarray(8, 12).toString("ascii") !== "WAVE") throw new Error("Expected canonical WAV audio.");
  let offset = 12; let byteRate = 0; let dataSize = -1; let sampleRateHz = 0; let channels = 0; let formatTag = 0;
  while (offset + 8 <= bytes.length) {
    const id = bytes.subarray(offset, offset + 4).toString("ascii"); const size = bytes.readUInt32LE(offset + 4);
    if (id === "fmt " && offset + 24 <= bytes.length) { formatTag = bytes.readUInt16LE(offset + 8); channels = bytes.readUInt16LE(offset + 10); sampleRateHz = bytes.readUInt32LE(offset + 12); byteRate = bytes.readUInt32LE(offset + 16); }
    if (id === "data") { dataSize = size; break; }
    offset += 8 + size + (size % 2);
  }
  if ((formatTag !== 1 && formatTag !== 3) || byteRate <= 0 || dataSize < 0 || sampleRateHz <= 0 || channels <= 0) throw new Error("Canonical WAV metadata is incomplete.");
  return { durationSeconds: dataSize / byteRate, sampleRateHz, channels, codec: formatTag === 1 ? "pcm" : "ieee-float" };
}

async function compactHistoricalPack(input: { readonly episodeDir: string; readonly variant: "full" | "short"; readonly sourceDir: string; readonly destinationDir: string }): Promise<{ readonly sourceDir: string; readonly zipBytes: number }> {
  const sourceManifest = JSON.parse(await fs.readFile(path.join(input.sourceDir, "review-manifest.json"), "utf8")) as Record<string, unknown> & { readonly selectedAudioHash: string; readonly narrationDurationSeconds: number; readonly narrationDiagnostic: { readonly wordCount: number; readonly approximateWordsPerMinute: number; readonly pacingStatus: string; readonly pacingPolicyVersion?: string; readonly calibrationStatus?: string }; readonly packCrossArtifactIntegrity: { readonly status: "PASS" | "FAIL"; readonly checks: Readonly<Record<string, number>> }; readonly packFileHashes: Readonly<Record<string, string>>; readonly artifactHashes: Readonly<Record<string, string>> };
  const narrationPath = path.join(input.episodeDir, "locales", "en", input.variant, "audio", "narration.wav");
  const narrationBytes = await fs.readFile(narrationPath).catch(() => { throw new Error(`CANONICAL_AUDIO_UNAVAILABLE_FOR_PREPACKAGE_VALIDATION: ${narrationPath}`); });
  const canonicalAudioSha256 = createHash("sha256").update(narrationBytes).digest("hex");
  const metadata = wavMetadata(narrationBytes);
  if (canonicalAudioSha256 !== sourceManifest.selectedAudioHash || Math.abs(metadata.durationSeconds - sourceManifest.narrationDurationSeconds) > 0.02 || sourceManifest.packCrossArtifactIntegrity.status !== "PASS") throw new Error(`CANONICAL_AUDIO_PREPACKAGE_VALIDATION_FAILED: ${path.basename(input.episodeDir)}`);
  await fs.cp(input.sourceDir, input.destinationDir, { recursive: true, errorOnExist: true, filter: (source) => path.basename(source) !== "narration.wav" });
  const audioIntegrity = {
    schemaVersion: "veronica-review-audio-integrity.v1", canonicalAudioEmbedded: false, canonicalAudioPath: `locales/en/${input.variant}/audio/narration.wav`, canonicalAudioSha256, selectedAudioSha256: canonicalAudioSha256,
    decodedDurationSeconds: metadata.durationSeconds, sampleRateHz: metadata.sampleRateHz, channels: metadata.channels, codec: metadata.codec, container: "WAV", wordCount: sourceManifest.narrationDiagnostic.wordCount, effectiveWpm: sourceManifest.narrationDiagnostic.approximateWordsPerMinute,
    ...(sourceManifest.narrationDiagnostic.pacingPolicyVersion ? { pacingPolicyVersion: sourceManifest.narrationDiagnostic.pacingPolicyVersion, pacingProfile: "short-adaptive", calibrationStatus: sourceManifest.narrationDiagnostic.calibrationStatus } : { pacingProfile: "full-current-policy" }),
    pacingStatus: sourceManifest.narrationDiagnostic.pacingStatus, canonicalTimingDurationSeconds: sourceManifest.packCrossArtifactIntegrity.checks.canonicalTiming, finalSceneEndSeconds: sourceManifest.packCrossArtifactIntegrity.checks.episodeManifestFinalSceneEnd, finalEventEndSeconds: sourceManifest.packCrossArtifactIntegrity.checks.retimedVisualEventsFinalEnd,
    timingIntegrityStatus: "PASS", audioPrepackageValidationStatus: "PASS", reviewAudioPreview: { embedded: false, canonical: false },
  };
  const promptPath = path.join(input.destinationDir, "chatgpt-pre-image-review-request.md");
  const readmePath = path.join(input.destinationDir, "README.md");
  await Promise.all([
    fs.writeFile(path.join(input.destinationDir, "audio-integrity.json"), `${JSON.stringify(audioIntegrity, null, 2)}\n`, "utf8"),
    fs.writeFile(promptPath, `Review-pack mode: **compact**. Canonical production audio was validated before packaging, but its bytes are intentionally omitted. Use included hash/duration/timing metadata; audio-quality judgment is out of scope.\n\n${await fs.readFile(promptPath, "utf8")}`, "utf8"),
    fs.writeFile(readmePath, `${await fs.readFile(readmePath, "utf8")}\n- Review-pack mode: \`compact\`\n- Canonical production audio validated before packaging; WAV intentionally omitted from this review archive.\n- CANONICAL_AUDIO_EMBEDDED: **false**.\n- CANONICAL_AUDIO_PREPACKAGE_VALIDATION: **PASS**.\n`, "utf8"),
  ]);
  const packFileHashes = Object.fromEntries(await Promise.all([...Object.keys(sourceManifest.packFileHashes).filter((name) => name !== "narration.wav"), "audio-integrity.json"].map(async (name) => [name, await sha256(path.join(input.destinationDir, name))] as const)));
  const artifactHashes = { ...sourceManifest.artifactHashes, "chatgpt-pre-image-review-request.md": await sha256(promptPath), "audio-integrity.json": await sha256(path.join(input.destinationDir, "audio-integrity.json")) };
  const reviewManifest = { ...sourceManifest, schemaVersion: "veronica-pre-image-review-pack.v8", reviewPackMode: "compact", canonicalAudioEmbedded: false, reviewAudioPreviewEmbedded: false, packagingFingerprint: createHash("sha256").update(JSON.stringify({ schemaVersion: "veronica-pre-image-review-pack.v8", reviewPackMode: "compact", previewCodec: null, previewBitrateKbps: null })).digest("hex"), canonicalAudioSha256, canonicalAudioDurationSeconds: metadata.durationSeconds, audioPrepackageValidation: { status: "PASS", sourceExists: true, sourceHashValidated: true, sourceDurationMeasured: true }, artifactHashes, packFileHashes, packHashValidation: "PASS" };
  await fs.writeFile(path.join(input.destinationDir, "review-manifest.json"), `${JSON.stringify(reviewManifest, null, 2)}\n`, "utf8");
  return { sourceDir: input.sourceDir, zipBytes: 0 };
}

const episodeNames = (await fs.readdir(workspaceRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && /^(?:l02|l03)-/u.test(entry.name))
  .map((entry) => entry.name)
  .sort();
const packs = [];
for (const episodeId of episodeNames) {
  const episodeDir = path.join(workspaceRoot, episodeId);
  const variant = await fs.access(path.join(episodeDir, "locales", "en", "short", "audio", "narration.wav")).then(() => "short" as const).catch(() => "full" as const);
  const visualPlan = JSON.parse(await fs.readFile(path.join(episodeDir, "source", "pre-image-semantic-plan.v1.json"), "utf8")) as { readonly contentId: string };
  const packId = `${visualPlan.contentId}-${variant}`;
  const destinationDir = path.join(outputDir, packId);
  const createdPack = reviewPackMode === "compact" ? undefined : await createVeronicaPreImageReviewPack({ episodeDir, language: "en", variant, reviewPackMode });
  const sourceDir = createdPack?.packDir ?? destinationDir;
  const compactResult = reviewPackMode === "compact" ? await compactHistoricalPack({ episodeDir, variant, sourceDir: path.join(historicalCompactSourceRoot, packId), destinationDir }) : undefined;
  const reviewManifest = JSON.parse(await fs.readFile(path.join(sourceDir, "review-manifest.json"), "utf8")) as {
    readonly narrationDurationSeconds: number;
    readonly selectedAudioHash: string;
    readonly reviewPackMode: "compact" | "listening" | "forensic";
    readonly canonicalAudioEmbedded: boolean;
    readonly reviewAudioPreviewEmbedded: boolean;
    readonly canonicalAudioSha256: string;
    readonly canonicalAudioDurationSeconds: number;
    readonly audioPrepackageValidation: { readonly status: "PASS" };
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
    readonly packFileHashes: Readonly<Record<string, string>>;
  };
  if (reviewManifest.reviewPackMode !== reviewPackMode) throw new Error(`Review-pack mode mismatch for ${episodeId}.`);
  const semantic = JSON.parse(await fs.readFile(path.join(sourceDir, "pre-image-semantic-reviews.v1.json"), "utf8")) as {
    readonly initialReviews?: readonly { readonly findings: readonly { readonly severity: string }[] }[];
    readonly reviews: readonly { readonly findings: readonly { readonly severity: string }[] }[];
    readonly remediationRounds?: number;
  };
  for (const [name, expected] of Object.entries(reviewManifest.packFileHashes)) {
    if (await sha256(path.join(sourceDir, name)) !== expected) throw new Error(`Pack hash mismatch: ${episodeId}/${name}`);
  }
  if (reviewPackMode !== "compact") await fs.cp(sourceDir, destinationDir, { recursive: true, errorOnExist: true });
  const audioIntegrity = JSON.parse(await fs.readFile(path.join(sourceDir, "audio-integrity.json"), "utf8")) as {
    readonly canonicalAudioSha256: string;
    readonly decodedDurationSeconds: number;
    readonly reviewAudioPreview: { readonly embedded: boolean };
  };
  const packSizeBytes = createdPack ? (await fs.stat(createdPack.zipPath)).size : await directoryBytes(destinationDir);
  const embeddedAudioBytes = await Promise.all(["narration.wav", "narration-review.opus"].map(async (name) => fs.stat(path.join(sourceDir, name)).then((stat) => stat.size).catch(() => 0))).then((sizes) => sizes.reduce((sum, size) => sum + size, 0));
  const finalFindings = semantic.reviews.flatMap((review) => review.findings);
  packs.push({
    packId,
    contentId: visualPlan.contentId,
    variant,
    durationSeconds: reviewManifest.narrationDurationSeconds,
    reviewMode: reviewManifest.reviewPackMode,
    canonicalAudioEmbedded: reviewManifest.canonicalAudioEmbedded,
    previewEmbedded: reviewManifest.reviewAudioPreviewEmbedded,
    canonicalAudioHash: audioIntegrity.canonicalAudioSha256,
    canonicalDurationSeconds: audioIntegrity.decodedDurationSeconds,
    packSizeBytes,
    audioSizeBytes: embeddedAudioBytes,
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
  schemaVersion: "veronica-l02-l03-semantic-regression-archive.v2",
  reviewPackMode,
  generatedAt: new Date().toISOString(),
  newLiveTtsProviderCallCount: 0,
  imageProviderCallCount: 0,
  status: packs.every((pack) => pack.reviewMode === reviewPackMode && pack.blockerCount === 0 && pack.timingIntegrityStatus === "PASS" && pack.hashStatus === "PASS" && pack.providerProjectionStatus === "PASS" && pack.providerPromptQualityStatus === "PASS" && pack.semanticCoherenceIntegrity.status === "PASS" && pack.semanticQuality.status === "PASS" && pack.overallPackValidity && pack.providerReadiness === "BLOCKED_PENDING_HUMAN_PRE_IMAGE_APPROVAL") ? "READY_FOR_HUMAN_PRE_IMAGE_REVIEW" : "NOT_READY",
  packs,
};
await fs.writeFile(path.join(outputDir, "aggregate-manifest.json"), `${JSON.stringify(aggregate, null, 2)}\n`, "utf8");
const zipPath = `${outputDir}.zip`;
await execFileAsync("zip", ["-X", "-q", "-r", zipPath, path.basename(outputDir)], { cwd: path.dirname(outputDir) });
await execFileAsync("unzip", ["-t", zipPath]);
process.stdout.write(`${JSON.stringify({ outputDir, zipPath, zipSha256: await sha256(zipPath), status: aggregate.status, packCount: packs.length }, null, 2)}\n`);
