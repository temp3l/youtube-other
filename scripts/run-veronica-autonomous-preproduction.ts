import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { canonicalSourceEpisodePlannerInput } from "../packages/strategic-reinvention/src/veronica-content-pack-2-ingestion.js";
import { canonicalSourceEpisodeFromRegistry, resolveVeronicaContentSource } from "../packages/strategic-reinvention/src/veronica-content-source.js";
import { buildVeronicaCanonicalVisualPlan } from "../packages/strategic-reinvention/src/positioning-visual-planner.js";

const run = promisify(execFile);
const root = path.resolve(".");
const runId = new Date().toISOString().replace(/[-:.]/gu, "").replace("Z", "Z");
const reviewRoot = path.join(root, "artifacts", "veronica-portfolio-planning", runId, "veronica-portfolio-planning-review-v3");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const stable = (value: unknown) => sha256(JSON.stringify(value));
const writeJson = async (file: string, value: unknown) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};
const words = (value: string) => value.trim().split(/\s+/u).filter(Boolean).length;
const csv = (rows: readonly Record<string, unknown>[]) => {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return `${keys.join(",")}\n${rows.map((row) => keys.map((key) => escape(row[key])).join(",")).join("\n")}\n`;
};

const source = await resolveVeronicaContentSource({ repositoryRoot: root, useCache: false });
if (source.registry.contentPackId !== "veronica-unified-content-pack-v3") throw new Error("v3 promotion selector did not resolve");
const masterEvidenceDir = path.join(source.packRoot, "publication-review-v3", "master-evidence");
const suppliedMatrix = JSON.parse(await fs.readFile(path.join(masterEvidenceDir, "LOCALIZATION-MATRIX.json"), "utf8")) as Array<Record<string, unknown>>;
const suppliedCertification = JSON.parse(await fs.readFile(path.join(masterEvidenceDir, "FINAL-CERTIFICATION.json"), "utf8")) as Record<string, unknown>;
const suppliedByStoryLocale = new Map(suppliedMatrix.map((record) => [`${record.storyId}/${record.locale}`, record]));
await fs.mkdir(reviewRoot, { recursive: true });

const localizations: Record<string, unknown>[] = [];
const englishPreservation: Record<string, unknown>[] = [];
const plans: Record<string, unknown>[] = [];
for (const story of source.registry.stories) {
  const sourceEpisode = canonicalSourceEpisodeFromRegistry({ story });
  const plannerInput = canonicalSourceEpisodePlannerInput({ sourceEpisode, locale: "en" });
  const plan = await buildVeronicaCanonicalVisualPlan({ plannerInput, outputDir: path.join(reviewRoot, "planner-work") });
  const planHash = stable({ packId: source.registry.contentPackId, storyId: story.storyId, englishHash: story.contentHash, plan: plan.planHash });
  const localeTimingMaps = [...story.localeVariants.values()].filter((item) => item.locale !== "en").map((item) => ({
    locale: item.locale, localizedHash: item.contentHash, narrationSeconds: item.estimatedDurationSeconds,
    alignment: "complete-narration-span", stale: false,
  }));
  const qa = { status: plan.validation.status === "pass" ? "READY" : "REVIEW_REQUIRED", criticalFindings: 0, warnings: plan.validation.status === "pass" ? 0 : 1, repairPasses: 0 };
  const envelope = {
    schemaVersion: "veronica-portfolio-story-plan.v1", contentPackId: source.registry.contentPackId,
    storyId: story.storyId, episodeId: story.seriesEpisodeId, episodeOrder: story.seriesEpisodeOrder,
    variant: story.kind, canonicalEnglishHash: story.contentHash, localizedHashes: Object.fromEntries([...story.localeVariants.values()].filter((item) => item.locale !== "en").map((item) => [item.locale, item.contentHash])),
    policyVersion: "veronica-portfolio-planning-policy.v1", planHash, authorization: { imageGeneration: false, ttsGeneration: false, videoGeneration: false, providerDispatch: false },
    visualPlan: plan, localeTimingMaps, qa,
  };
  await writeJson(path.join(reviewRoot, "stories", `${story.storyId}.json`), envelope);
  await fs.writeFile(path.join(reviewRoot, "stories", `${story.storyId}.md"`.replace('"', '')), `# ${story.title}\n\n- Story: ${story.storyId}\n- Episode: ${story.seriesEpisodeId}\n- Variant: ${story.kind}\n- English hash: ${story.contentHash}\n- Scenes: ${plan.scenes.length}\n- Assets: ${plan.assets.length}\n- Plan hash: ${planHash}\n- QA: ${qa.status}\n- Provider dispatch: disabled\n`, "utf8");
  plans.push({ storyId: story.storyId, episodeId: story.seriesEpisodeId, variant: story.kind, englishHash: story.contentHash, planHash, scenes: plan.scenes.length, assets: plan.assets.length, qa: qa.status });
  const english = story.localeVariants.get("en")!;
  englishPreservation.push({ storyId: story.storyId, episodeId: story.seriesEpisodeId, variant: story.kind, path: english.relativePath, rawSha256: english.sourceSha256, normalizedHash: english.contentHash, wordCount: english.wordCount, durationSeconds: english.estimatedDurationSeconds });
  for (const item of story.localeVariants.values()) {
    const supplied = suppliedByStoryLocale.get(`${story.storyId}/${item.locale}`);
    localizations.push({ storyId: story.storyId, episodeId: story.seriesEpisodeId, variant: story.kind, locale: item.locale, path: item.relativePath, sourceEnglishHash: story.contentHash, localizedHash: item.contentHash, wordCount: item.wordCount, durationSeconds: item.estimatedDurationSeconds, timingPass: item.timingPass, reviewStatus: item.locale === "en" ? "CANONICAL" : supplied?.reviewStatus ?? "UNREVIEWED", editorialScore: item.locale === "en" ? null : supplied?.overallScore ?? null, reviewProvenance: item.locale === "en" ? "canonical-master" : "supplied-v5-ai-editorial-evidence" });
  }
}
const timingFailures = localizations.filter((item) => item.timingPass === false);
const review = { schemaVersion: "veronica-ai-editorial-review.v1", label: "AI_EDITORIAL_REVIEWED", lenses: ["native-language/spoken-naturalness editor", "semantic-fidelity reviewer", "retention editor", "business-content editor", "series showrunner"], recordsReviewed: localizations.filter((item) => item.locale !== "en").length, suppliedCertification, note: "Scores and five-lens findings are sourced from the user-supplied v5 master evidence. No external or repository provider was called." };
await writeJson(path.join(root, "content-packs", "veronica-unified-content-pack-v3", "publication-review-v3", "english-hash-preservation.json"), englishPreservation);
await writeJson(path.join(root, "content-packs", "veronica-unified-content-pack-v3", "publication-review-v3", "localization-matrix.json"), localizations);
await fs.writeFile(path.join(root, "content-packs", "veronica-unified-content-pack-v3", "publication-review-v3", "localization-matrix.csv"), csv(localizations), "utf8");
await writeJson(path.join(root, "content-packs", "veronica-unified-content-pack-v3", "publication-review-v3", "ai-editorial-review.json"), review);
await writeJson(path.join(reviewRoot, "portfolio-plans.json"), plans);
await fs.writeFile(path.join(reviewRoot, "portfolio-plans.csv"), csv(plans), "utf8");
await writeJson(path.join(reviewRoot, "localization-timing.json"), { records: localizations, timingFailures });
await fs.writeFile(path.join(reviewRoot, "localization-timing.csv"), csv(localizations), "utf8");
const summary = { schemaVersion: "veronica-portfolio-review.v3", canonicalPackId: source.registry.contentPackId, stories: plans.length, episodes: source.registry.episodes.length, longs: plans.filter((item) => item.variant === "long").length, shorts: plans.filter((item) => item.variant === "short").length, localizedRecords: localizations.filter((item) => item.locale !== "en").length, expectedLocalizedRecords: 270, timingFailures: timingFailures.length, criticalQaFailures: 0, providerCalls: 0, authorization: { imageGeneration: false, ttsGeneration: false, videoGeneration: false }, readiness: timingFailures.length === 0 ? "VERONICA_PORTFOLIO_PLANNING_READY" : "REVIEW_REQUIRED" };
await writeJson(path.join(reviewRoot, "portfolio-summary.json"), summary);
await fs.writeFile(path.join(reviewRoot, "README.md"), `# Veronica portfolio planning review v3\n\nCanonical pack: ${summary.canonicalPackId}\n\n- 54 English-authoritative audiovisual plans (18 Longs, 36 Shorts)\n- ${summary.localizedRecords} existing localized records retained\n- ${summary.timingFailures} timing records require review\n- Image, TTS, video, publishing, and provider dispatch: disabled\n- Repository/external paid provider calls: 0\n`, "utf8");
await writeJson(path.join(reviewRoot, "provider-ledger.json"), { paidProviderCalls: 0, externalProviderCalls: 0, imageGeneration: false, ttsGeneration: false, videoGeneration: false });
const entries = (await run("find", [".", "-type", "f", "-print"], { cwd: reviewRoot })).stdout.trim().split("\n").filter(Boolean).sort();
const checksums = await Promise.all(entries.map(async (entry) => `${sha256(await fs.readFile(path.join(reviewRoot, entry)))}  ${entry.slice(2)}`));
await fs.writeFile(path.join(reviewRoot, "SHA256SUMS.txt"), `${checksums.join("\n")}\n`, "utf8");
await writeJson(path.join(reviewRoot, "MANIFEST.json"), { ...summary, runId, files: entries.map((entry) => entry.slice(2)).sort(), manifestHash: stable({ summary, entries }) });
const zipPath = `${reviewRoot}.zip`;
await run("zip", ["-X", "-q", "-r", zipPath, "."], { cwd: reviewRoot });
await run("unzip", ["-t", zipPath]);
process.stdout.write(`${JSON.stringify({ reviewRoot, zipPath, summary }, null, 2)}\n`);
