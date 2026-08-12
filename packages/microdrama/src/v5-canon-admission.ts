import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  computePayloadHash,
  NARRATIVE_SCHEMA_VERSION,
  narrativeRevisionEnvelopeSchema,
  narrativeRevisionIdSchema,
  seriesBiblePayloadSchema,
  seriesIdSchema,
  type SeriesBiblePayload,
} from "@mediaforge/narrative-core";

import type {
  AdmittedLocalizedScript,
  EpisodeBoundaryContract,
  EpisodeIdentityRecord,
  V5CanonAdmissionBundle,
  V5CanonAdmissionIssue,
  V5CanonAdmissionResult,
} from "./v5-canon-admission-contracts.js";
import {
  canonicalEpisodeIds,
  MICRODRAMA_PACK_SCHEMA_VERSION,
  SEVEN_MINUTES_AHEAD_SERIES_ID,
  V5_REMEDIATED_PACK_VERSION,
} from "./v5-pack-constants.js";
import type { LocalizedScriptImport, V5PackImportResult } from "./v5-pack-contracts.js";
import { readSeriesStateForAdmission } from "./v5-canon-admission-io.js";
import { validateAndImportV5Pack } from "./v5-pack-parser.js";

type EpisodeStateLine = {
  episode: string;
  arc: number | string;
  new_information: string;
  open_loop: string;
};

type SeriesState = {
  series: {
    premise: string;
    genre: string[] | string;
    core_promise: string;
    editorial_version: string;
  };
  characters: Record<string, string>;
  global_truth: Record<string, string>;
};

function readEpisodeStateLines(packRoot: string): EpisodeStateLine[] {
  const filePath = path.join(packRoot, "shared/episode-state.jsonl");
  const lines = fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.map((line) => JSON.parse(line) as EpisodeStateLine);
}

function fail(issues: V5CanonAdmissionIssue[]): V5CanonAdmissionResult {
  return { ok: false, issues };
}

function buildProvenance(
  sourceRelativePath: string,
  sourceArtifactHash: string,
  importedAt: string
) {
  return {
    sourceKind: "import" as const,
    sourcePackVersion: V5_REMEDIATED_PACK_VERSION,
    sourceRelativePath,
    sourceArtifactHash,
    importedAt,
  };
}

type AdmissionStep<T> =
  | { ok: true; value: T }
  | { ok: false; issues: V5CanonAdmissionIssue[] };

function buildSeriesBiblePayload(seriesState: SeriesState): SeriesBiblePayload {
  const genreValue = Array.isArray(seriesState.series.genre)
    ? seriesState.series.genre.join(", ")
    : seriesState.series.genre;
  return seriesBiblePayloadSchema.parse({
    schemaVersion: NARRATIVE_SCHEMA_VERSION,
    seriesId: seriesIdSchema.parse(SEVEN_MINUTES_AHEAD_SERIES_ID),
    premise: seriesState.series.premise,
    genre: genreValue,
    subgenre: "vertical microdrama",
    audience: "Adults seeking serialized suspense",
    emotionalPromise: seriesState.series.core_promise,
    centralConflict: "Prediction versus agency inside the AHEAD loop",
    centralMystery: seriesState.global_truth["signal"] ?? "Temporal return packets",
    tone: "Tense and intimate",
    themes: ["identity", "trust", "prediction"],
    storytellingRules: [
      "Every episode ends on a cliffhanger",
      "Character knowledge cannot advance before EN-v5 authority",
    ],
    prohibitedPatterns: ["Fourth-wall breaks"],
  });
}

function scriptRevisionId(script: LocalizedScriptImport): string {
  return `rev.script.${script.locale.toLowerCase()}.${script.episodeId.toLowerCase()}`;
}

function boundaryRevisionId(episodeId: string): string {
  return `rev.boundary.${episodeId.toLowerCase()}`;
}

function compileEpisodeBoundaries(
  packRoot: string,
  packImport: V5PackImportResult,
  episodeStateLines: EpisodeStateLine[],
  importedAt: string
): AdmissionStep<EpisodeBoundaryContract[]> {
  const enScripts = packImport.localizedScriptImports.filter(
    (script) => script.locale === "en-US"
  );
  const stateByEpisode = new Map(
    episodeStateLines.map((line) => [line.episode, line])
  );
  const boundaries: EpisodeBoundaryContract[] = [];

  for (const episodeImport of packImport.episodeImports) {
    const state = stateByEpisode.get(episodeImport.episodeId);
    if (!state) {
      return {
        ok: false,
        issues: [
          {
            code: "episode_state_invalid",
            message: `Missing episode state for ${episodeImport.episodeId}`,
            path: "shared/episode-state.jsonl",
          },
        ],
      };
    }
    const enScript = enScripts.find((script) => script.episodeId === episodeImport.episodeId);
    if (!enScript) {
      return {
        ok: false,
        issues: [
          {
            code: "boundary_manifest_mismatch",
            message: `Missing EN script for ${episodeImport.episodeId}`,
          },
        ],
      };
    }
    const nextEpisodeNumber = episodeImport.episodeNumber + 1;
    const nextEpisodeId =
      nextEpisodeNumber <= 100
        ? `E${String(nextEpisodeNumber).padStart(3, "0")}`
        : undefined;
    const nextEnScript = nextEpisodeId
      ? enScripts.find((script) => script.episodeId === nextEpisodeId)
      : undefined;

    boundaries.push({
      schemaVersion: MICRODRAMA_PACK_SCHEMA_VERSION,
      episodeId: episodeImport.episodeId,
      episodeNumber: episodeImport.episodeNumber,
      arcId: String(state.arc),
      arcName: episodeImport.arcName,
      title: episodeImport.title,
      newInformation: state.new_information,
      openLoop: state.open_loop,
      hook: enScript.manifestEntry.hook,
      cliffhangerBeat: enScript.manifestEntry.cliffhanger_beat,
      characters: enScript.manifestEntry.characters.split("|").map((item) => item.trim()),
      location: enScript.manifestEntry.location,
      ...(nextEnScript ? { nextOpeningObligation: nextEnScript.manifestEntry.hook } : {}),
      provenance: buildProvenance(
        enScript.scriptRelativePath,
        enScript.contentHash,
        importedAt
      ),
    });
  }

  return { ok: true, value: boundaries };
}

function buildEpisodeIdentities(
  admittedScripts: AdmittedLocalizedScript[]
): AdmissionStep<EpisodeIdentityRecord[]> {
  const identities: EpisodeIdentityRecord[] = [];
  for (const episodeId of canonicalEpisodeIds()) {
    const scripts = admittedScripts.filter((script) => script.episodeId === episodeId);
    if (scripts.length !== 4) {
      return {
        ok: false,
        issues: [
          {
            code: "episode_identity_mismatch",
            message: `Expected four locale scripts for ${episodeId}, found ${scripts.length}`,
          },
        ],
      };
    }
    const locales = scripts.map((script) => script.locale);
    const uniqueLocales = new Set(locales);
    if (uniqueLocales.size !== 4) {
      return {
        ok: false,
        issues: [
          {
            code: "episode_identity_mismatch",
            message: `Duplicate or missing locales for ${episodeId}`,
          },
        ],
      };
    }
    identities.push({
      episodeId,
      locales: locales as EpisodeIdentityRecord["locales"],
      scriptRevisionIds: scripts.map((script) => script.scriptRevisionId),
      contentHashes: scripts.map((script) => script.contentHash),
    });
  }
  return { ok: true, value: identities };
}

export function compileV5CanonAdmission(
  packRoot: string,
  importedAt = new Date().toISOString()
): V5CanonAdmissionResult {
  const resolvedRoot = path.resolve(packRoot);
  const auditPath = path.join(resolvedRoot, "shared/canonical-continuity-audit-en-v5.md");
  if (!fs.existsSync(auditPath)) {
    return fail([
      {
        code: "continuity_audit_missing",
        message: "Missing canonical continuity audit artifact",
        path: "shared/canonical-continuity-audit-en-v5.md",
      },
    ]);
  }

  const packValidation = validateAndImportV5Pack(resolvedRoot, importedAt);
  if (!packValidation.ok) {
    return fail(
      packValidation.issues.map((issue) => ({
        code: "pack_invalid" as const,
        message: issue.message,
        ...(issue.path ? { path: issue.path } : {}),
      }))
    );
  }

  const packImport = packValidation.result!;
  const episodeStateLines = readEpisodeStateLines(resolvedRoot);
  if (episodeStateLines.length !== 100) {
    return fail([
      {
        code: "episode_state_invalid",
        message: `Expected 100 episode-state lines, found ${episodeStateLines.length}`,
        path: "shared/episode-state.jsonl",
      },
    ]);
  }

  const seriesState = readSeriesStateForAdmission(resolvedRoot);
  const seriesBiblePayload = buildSeriesBiblePayload(seriesState);
  const seriesBibleRevisionId = `rev.series-bible.${V5_REMEDIATED_PACK_VERSION}`;

  const boundaryResult = compileEpisodeBoundaries(
    resolvedRoot,
    packImport,
    episodeStateLines,
    importedAt
  );
  if (!boundaryResult.ok) {
    return fail(boundaryResult.issues);
  }

  const admittedScripts: AdmittedLocalizedScript[] =
    packImport.localizedScriptImports.map((script) => ({
      ...script,
      importStatus: "IMPORTED_APPROVED_LOCALIZED_SCRIPT",
      scriptRevisionId: scriptRevisionId(script),
    }));

  const identityResult = buildEpisodeIdentities(admittedScripts);
  if (!identityResult.ok) {
    return fail(identityResult.issues);
  }

  const importId = createHash("sha256")
    .update(
      `${packImport.seriesImport.manifestHash}:${packImport.seriesImport.hashManifestDigest}:${importedAt}`,
      "utf8"
    )
    .digest("hex");

  const bundle: V5CanonAdmissionBundle = {
    schemaVersion: MICRODRAMA_PACK_SCHEMA_VERSION,
    importId,
    seriesImport: packImport.seriesImport,
    seriesBibleRevisionId,
    episodeBoundaries: boundaryResult.value,
    admittedScripts,
    episodeIdentities: identityResult.value,
    admittedAt: importedAt,
  };

  return { ok: true, bundle };
}

export function buildSeriesBibleRevisionEnvelope(
  bundle: V5CanonAdmissionBundle,
  seriesState: SeriesState
) {
  const payload = buildSeriesBiblePayload(seriesState);
  const contentHash = computePayloadHash(payload);
  return narrativeRevisionEnvelopeSchema.parse({
    schemaVersion: NARRATIVE_SCHEMA_VERSION,
    revisionId: narrativeRevisionIdSchema.parse(bundle.seriesBibleRevisionId),
    aggregateId: SEVEN_MINUTES_AHEAD_SERIES_ID,
    aggregateKind: "series_bible",
    revisionNumber: 1,
    payload,
    contentHash,
    parentRevisionIds: [],
    status: "ACCEPTED",
    provenance: {
      sourceKind: "import",
      sourceRevisionIds: [],
      notes: "V5 remediated pack admission",
    },
    createdAt: bundle.admittedAt,
  });
}

export function buildCanonAdmissionProjection(
  bundle: V5CanonAdmissionBundle
): import("./v5-canon-admission-contracts.js").V5CanonAdmissionProjection {
  return {
    schemaVersion: MICRODRAMA_PACK_SCHEMA_VERSION,
    importId: bundle.importId,
    seriesBibleRevisionId: bundle.seriesBibleRevisionId,
    episodeBoundaryRevisionIds: bundle.episodeBoundaries.map((boundary) =>
      boundaryRevisionId(boundary.episodeId)
    ),
    scriptRevisionIds: bundle.admittedScripts.map((script) => script.scriptRevisionId),
    episodeIdentities: bundle.episodeIdentities,
    manifestHash: bundle.seriesImport.manifestHash,
    hashManifestDigest: bundle.seriesImport.hashManifestDigest,
    admittedAt: bundle.admittedAt,
  };
}
