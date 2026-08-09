import fs from "node:fs/promises";
import path from "node:path";
import { contentSourceManifestSchema, type ContentSourceManifest, type EpisodeBlueprint } from "@mediaforge/domain";
import { writeJsonAtomic } from "@mediaforge/shared";
import {
  createSourceLedAdaptation,
  type SourceLedAdaptationResult,
} from "./source-adaptation.js";
import type { AdaptationCandidate, SourceEvidenceSpan } from "./adaptation-schema.js";
import {
  hashCanonicalSourceBytes,
  type EvidenceApprovalContext,
} from "./provenance-validation.js";
import type { StrategicReinventionProfile } from "./profile.js";

const STRATEGIC_SOURCE_ADAPTATION_WORKFLOW_REVISION =
  "veronicabenini.source-adaptation.v1" as const;

const sourceTextExtensions = [".md", ".txt"] as const;

export interface StrategicSourceAdaptationInput {
  readonly workspaceRoot: string;
  readonly episodeId: string;
  readonly blueprint: EpisodeBlueprint;
  readonly profile: StrategicReinventionProfile;
}

export interface StrategicSourceAdaptationResult {
  readonly schemaVersion: "veronicabenini.source-led-narration.v1";
  readonly canonicalScript: string;
  readonly shortScript: string;
  /** Structural data and provenance stay outside the clean spoken payload. */
  readonly editorialOutline: readonly {
    readonly beatId: string;
    readonly lineId: string;
    readonly evidenceSpanIds: readonly string[];
  }[];
  readonly narrationRevision: {
    readonly revisionId: string;
    readonly contentProfileId: "veronicabenini";
    readonly effectiveConfigurationHash: string;
    readonly dependencyIdentity: Readonly<Record<string, string>>;
    readonly reuseOrRegenerationRationale: "new-source-led-revision";
  };
  readonly adaptation: SourceLedAdaptationResult;
  readonly sourceId: string;
}

function adaptationStatePath(workspaceRoot: string, episodeId: string): string {
  return path.join(
    workspaceRoot,
    episodeId,
    "state",
    "veronicabenini",
    "source-adaptation.json",
  );
}

async function loadSourceBytes(
  workspaceRoot: string,
  episodeId: string,
  sourceId: string,
): Promise<Uint8Array | null> {
  const episodeRoot = path.join(workspaceRoot, episodeId);
  const candidates = sourceTextExtensions.flatMap((extension) => [
    path.join(episodeRoot, "sources", "content", sourceId, `${sourceId}${extension}`),
    path.join(episodeRoot, "sources", "content", `${sourceId}${extension}`),
    path.join(episodeRoot, "sources", `${sourceId}${extension}`),
  ]);
  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate);
    } catch {
      continue;
    }
  }
  return null;
}

async function loadSourceManifest(input: {
  readonly workspaceRoot: string;
  readonly episodeId: string;
  readonly sourceId: string;
  readonly bytes: Uint8Array;
}): Promise<ContentSourceManifest> {
  const episodeRoot = path.join(input.workspaceRoot, input.episodeId);
  const manifestPaths = [
    path.join(episodeRoot, "sources", "manifests", `${input.sourceId}.json`),
    path.join(episodeRoot, "sources", `${input.sourceId}.manifest.json`),
  ];
  for (const manifestPath of manifestPaths) {
    try {
      const raw = JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown;
      const manifest = contentSourceManifestSchema.parse(raw);
      if (manifest.sourceId !== input.sourceId) {
        throw new Error(`Manifest sourceId mismatch for ${input.sourceId}.`);
      }
      if (manifest.sourceHash !== hashCanonicalSourceBytes(input.bytes)) {
        throw new Error(`Manifest sourceHash mismatch for ${input.sourceId}.`);
      }
      return manifest;
    } catch (error) {
      if (error instanceof Error && error.message.includes("mismatch")) {
        throw error;
      }
      continue;
    }
  }
  throw new Error(
    `No valid approved source manifest found for ${input.sourceId}. ` +
      "Production source adaptation requires sources/manifests/<sourceId>.json.",
  );
}

function splitSentences(text: string): string[] {
  const normalized = text.replace(/\s+/gu, " ").trim();
  if (!normalized) return [];
  const parts = normalized.split(/(?<=[.!?])\s+/u).map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [normalized];
}

function buildCandidateFromSource(input: {
  readonly blueprint: EpisodeBlueprint;
  readonly sourceId: string;
  readonly bytes: Uint8Array;
}): {
  readonly candidate: AdaptationCandidate;
  readonly evidenceSpans: readonly SourceEvidenceSpan[];
} {
  const text = new TextDecoder("utf8").decode(input.bytes);
  const sentences = splitSentences(text);
  const encoder = new TextEncoder();
  const encoded = encoder.encode(text);
  const evidenceSpans: SourceEvidenceSpan[] = [];
  const lines: AdaptationCandidate["lines"] = [];
  let searchFrom = 0;
  sentences.forEach((sentence, index) => {
    const start = text.indexOf(sentence, searchFrom);
    if (start < 0) {
      throw new Error(`Unable to locate sentence ${index + 1} in source bytes.`);
    }
    const end = start + sentence.length;
    searchFrom = end;
    const byteStart = encoder.encode(text.slice(0, start)).length;
    const byteEnd = encoder.encode(text.slice(0, end)).length;
    if (byteEnd > encoded.length) {
      throw new Error(`Evidence span ${index + 1} exceeds source byte length.`);
    }
    const spanId = `span-${String(index + 1).padStart(3, "0")}`;
    evidenceSpans.push({
      spanId,
      sourceId: input.sourceId,
      byteStart,
      byteEnd,
    });
    const beat = input.blueprint.beats[index % input.blueprint.beats.length];
    if (!beat) {
      throw new Error("Blueprint beats are required for source-led adaptation.");
    }
    lines.push({
      lineId: `line-${String(index + 1).padStart(3, "0")}`,
      beatId: beat.beatId,
      text: sentence,
      evidenceSpanIds: [spanId],
      kind: "adaptation",
    });
  });
  return {
    candidate: {
      revision: `source-led-${hashCanonicalSourceBytes(input.bytes).slice(0, 12)}`,
      lines,
      unsupportedInferenceIds: [],
      invented: [],
    },
    evidenceSpans,
  };
}

async function loadEvidenceApprovals(input: {
  readonly episodeId: string;
  readonly manifest: ContentSourceManifest;
  readonly workspaceRoot: string;
}): Promise<EvidenceApprovalContext> {
  const ledgerPath = path.join(
    input.workspaceRoot,
    input.episodeId,
    "sources",
    "approvals",
    "source-evidence.json",
  );
  let ledger: unknown;
  try {
    ledger = JSON.parse(await fs.readFile(ledgerPath, "utf8")) as unknown;
  } catch {
    throw new Error(
      "No source evidence approval ledger found. Production source adaptation requires sources/approvals/source-evidence.json.",
    );
  }
  if (!Array.isArray(ledger)) {
    throw new Error("Source evidence approval ledger must be a JSON array.");
  }
  const identity = {
    workflowInstanceId: `episode-${input.episodeId}`,
    taskId: "strategic.source-evidence",
    unitId: input.episodeId,
    profileId: "veronicabenini" as const,
    locale: "it" as const,
    variant: "full" as const,
    workflowRevision: STRATEGIC_SOURCE_ADAPTATION_WORKFLOW_REVISION,
  };
  return {
    ledger,
    identity,
    requiredDistinctActors: 1,
  };
}

export async function runStrategicSourceAdaptation(
  input: StrategicSourceAdaptationInput,
): Promise<StrategicSourceAdaptationResult> {
  const sourceId = input.blueprint.sources[0];
  if (!sourceId) {
    throw new Error("Blueprint must declare at least one source id.");
  }
  const bytes = await loadSourceBytes(input.workspaceRoot, input.episodeId, sourceId);
  if (!bytes) {
    throw new Error(
      `No text source found for ${sourceId}. Add sources/content/${sourceId}.md.`,
    );
  }
  const manifest = await loadSourceManifest({
    workspaceRoot: input.workspaceRoot,
    episodeId: input.episodeId,
    sourceId,
    bytes,
  });
  const { candidate, evidenceSpans } = buildCandidateFromSource({
    blueprint: input.blueprint,
    sourceId,
    bytes,
  });
  const adaptation = createSourceLedAdaptation({
    manifests: [manifest],
    sourceBytes: { [sourceId]: bytes },
    evidenceSpans,
    evidenceApprovals: await loadEvidenceApprovals({
      episodeId: input.episodeId,
      manifest,
      workspaceRoot: input.workspaceRoot,
    }),
    candidate,
    genre: input.profile.genre,
    creator: input.profile.creatorProfile,
    blueprint: input.blueprint,
    effectivePolicy: input.profile.effectivePolicy,
    now: new Date(),
  });
  const canonicalScript = adaptation.candidateCanonicalScript.lines.join(" ");
  const shortBody = adaptation.candidateCanonicalScript.lines
    .slice(0, 2)
    .join(" ")
    .trim();
  const shortScript = /[.!?]$/u.test(shortBody) ? shortBody : `${shortBody}.`;
  const result: StrategicSourceAdaptationResult = {
    schemaVersion: "veronicabenini.source-led-narration.v1",
    canonicalScript,
    shortScript,
    editorialOutline: candidate.lines.map((line) => ({
      beatId: line.beatId,
      lineId: line.lineId,
      evidenceSpanIds: line.evidenceSpanIds,
    })),
    narrationRevision: {
      revisionId: candidate.revision,
      contentProfileId: "veronicabenini",
      effectiveConfigurationHash: adaptation.candidateCanonicalScript.fingerprint,
      dependencyIdentity: {
        [sourceId]: manifest.sourceHash,
      },
      reuseOrRegenerationRationale: "new-source-led-revision",
    },
    adaptation,
    sourceId,
  };
  await writeJsonAtomic(adaptationStatePath(input.workspaceRoot, input.episodeId), result);
  return result;
}
