import path from "node:path";
import { episodeBlueprintSchema } from "@mediaforge/domain";
import { writeBinaryAtomic, writeJsonAtomic, writeTextAtomic, type EpisodePathResolver } from "@mediaforge/shared";
import { hasCurrentStrategicApproval, reviewStrategicItalianPackage, stableJson, strategicItalianSha256, strategicItalianQaPolicyHash, type StrategicItalianEvidenceWorkflow, type StrategicItalianQaPolicy } from "./strategic-italian-qa.js";

export interface StrategicItalianMediaPayload {
  readonly workflow: StrategicItalianEvidenceWorkflow;
  readonly script: string;
  readonly captionsVtt: string;
  /** Supplied audio only. This boundary deliberately has no provider/generation input. */
  readonly suppliedAudio: Buffer;
  readonly audioTrackManifest: Readonly<Record<string, unknown>>;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly capabilityReport: Readonly<Record<string, unknown>>;
  readonly qaPolicy: StrategicItalianQaPolicy;
  readonly now?: string;
  /** Explicit strategic release coordinate; omitted only by the Italian/full compatibility entry point. */
  readonly locale?: "it" | "en" | "es";
  readonly variant?: "full" | "short";
  readonly contentProfileId?: "strategic-reinvention";
  readonly creatorProfileId?: string;
  /** Exact artifacts whose fingerprints establish the release lineage. */
  readonly artifact?: { readonly fingerprint: string; readonly locale: "it" | "en" | "es"; readonly variant: "full" | "short"; readonly parents: readonly { readonly fingerprint: string; readonly locale: "it" | "en" | "es"; readonly variant: "full" | "short" }[] };
}

function assertContained(root: string, paths: readonly string[]): void {
  if (paths.some((entry) => { const relative = path.relative(root, entry); return relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative); })) throw new Error("Strategic Italian media resolver escaped its locale root.");
}
function isWaveAudio(value: Buffer): boolean { return value.length >= 12 && value.subarray(0, 4).toString("ascii") === "RIFF" && value.subarray(8, 12).toString("ascii") === "WAVE"; }
function hasTimedVttCue(value: string): boolean { return /^WEBVTT(?:\r?\n|$)/u.test(value) && /\d{2}:\d{2}(?:\.\d{3})?\s+-->\s+\d{2}:\d{2}(?:\.\d{3})?/u.test(value); }

/** Persists only a fully evidenced, locally reviewed Italian supplied-media package. */
export async function persistStrategicItalianMedia(args: { readonly resolver: EpisodePathResolver; readonly episodeId: string; readonly payload: StrategicItalianMediaPayload; }): Promise<void> {
  const { payload } = args;
  const locale = payload.locale ?? "it"; const variant = payload.variant ?? "full";
  const context = { episodeId: args.episodeId as never, locale: locale as never, variant: variant as never };
  const blueprint = episodeBlueprintSchema.safeParse(payload.workflow.episodeBlueprint);
  if (payload.workflow.route !== "strategic-italian" || !blueprint.success || args.episodeId !== payload.workflow.unitId || args.episodeId !== blueprint.data.episodeId || blueprint.data.canonicalLocale !== "it" || payload.contentProfileId !== "strategic-reinvention" || !payload.creatorProfileId || payload.creatorProfileId !== blueprint.data.creatorProfileId) throw new Error("Strategic Italian media requires the accepted exact Italian route.");
  if (payload.artifact && (payload.artifact.locale !== locale || payload.artifact.variant !== variant || !/^[a-f0-9]{64}$/u.test(payload.artifact.fingerprint))) throw new Error("Strategic release artifact coordinate is invalid.");
  if (!isWaveAudio(payload.suppliedAudio)) throw new Error("Strategic Italian media requires supplied RIFF/WAVE audio bytes.");
  if (!hasTimedVttCue(payload.captionsVtt)) throw new Error("Strategic Italian media requires a valid WEBVTT timed cue.");
  const timing = payload.now ? { now: payload.now } : {};
  const scriptHash = strategicItalianSha256(payload.script);
  if (!payload.artifact || payload.artifact.fingerprint !== scriptHash) throw new Error("Strategic release script bytes must equal the selected artifact fingerprint.");
  const qa = reviewStrategicItalianPackage({ workflow: { ...payload.workflow, selectedParentFingerprints: payload.artifact.parents.map((parent) => parent.fingerprint) }, script: payload.script, captionsVtt: payload.captionsVtt, metadata: payload.metadata, policy: payload.qaPolicy, locale, variant, ...timing });
  if (qa.status !== "READY") throw new Error(`Strategic Italian media QA is not READY: ${qa.reasonCodes.join(",")}`);
  const audioHash = strategicItalianSha256(payload.suppliedAudio);
  const captionHash = strategicItalianSha256(payload.captionsVtt);
  const metadataBytes = `${JSON.stringify(JSON.parse(stableJson(payload.metadata)), null, 2)}\n`;
  const metadataHash = strategicItalianSha256(metadataBytes);
  const policyHash = strategicItalianQaPolicyHash(payload.qaPolicy);
  const requiredParents = locale === "it" && variant === "full" ? payload.workflow.canonicalInputHashes : locale === "it" ? [payload.workflow.canonicalFingerprint] : variant === "full" ? [payload.workflow.canonicalFingerprint] : [payload.workflow.canonicalFingerprint, payload.artifact.parents.find((parent) => parent.locale === locale && parent.variant === "full")?.fingerprint ?? ""];
  if (requiredParents.some((hash) => !/^[a-f0-9]{64}$/u.test(hash))) throw new Error("Strategic release artifact parents are incomplete.");
  if (!hasCurrentStrategicApproval({ workflow: payload.workflow, gate: locale === "it" && variant === "full" ? "canonical-script" : locale === "it" ? "canonical-script" : "localization", inputHashes: requiredParents, outputHash: scriptHash, minimumActors: 1, locale, variant, ...timing })) throw new Error("Strategic script release requires current exact scoped approval evidence.");
  if (!hasCurrentStrategicApproval({ workflow: payload.workflow, gate: "voice", inputHashes: [scriptHash], outputHash: audioHash, minimumActors: 2, locale, variant, ...timing })) throw new Error("Strategic creator voice requires two current scoped approval records.");
  if (!hasCurrentStrategicApproval({ workflow: payload.workflow, gate: "metadata", inputHashes: [scriptHash, policyHash], outputHash: metadataHash, minimumActors: 1, locale, variant, ...timing })) throw new Error("Strategic metadata requires a current scoped approval record.");
  const paths = [args.resolver.narrationScript(context), args.resolver.captionsFile(context, "vtt"), args.resolver.audioNarration(context), args.resolver.audioTrackManifest(context), args.resolver.metadataFile(context), args.resolver.capabilityReport(context, "italian-media")];
  assertContained(args.resolver.localeVariantRoot(context), paths);
  await writeTextAtomic(paths[0]!, payload.script);
  await writeTextAtomic(paths[1]!, payload.captionsVtt);
  await writeBinaryAtomic(paths[2]!, payload.suppliedAudio);
  await writeJsonAtomic(paths[3]!, { ...payload.audioTrackManifest, sha256: audioHash, source: "supplied", captionSha256: captionHash });
  await writeTextAtomic(paths[4]!, metadataBytes);
  await writeJsonAtomic(paths[5]!, { ...payload.capabilityReport, qa, hashes: { script: scriptHash, captions: captionHash, audio: audioHash, metadata: metadataHash, qaPolicy: policyHash }, statuses: { qa: "READY", captions: "READY", metadata: "READY" } });
}

/** Evidence-bound release API for the six strategic locale/variant coordinates. */
export const persistStrategicLocaleMedia = persistStrategicItalianMedia;
