import type {
  AdmittedLocalizedScript,
  EpisodeBoundaryContract,
  V5CanonAdmissionBundle,
} from "./v5-canon-admission-contracts.js";
import type { V5EpisodeProductionBundle } from "./v5-episode-production-contracts.js";
import { FORBIDDEN_OPEN_LOOP_RESOLUTION } from "./v5-episode-production-compiler.js";
import type {
  CraftEditorialEvidence,
  StoryQaIssue,
  V5StoryDeterministicQaResult,
} from "./v5-story-qa-contracts.js";

const LOCALES = ["en-US", "de-DE", "es-ES", "pt-BR"] as const;

function issue(
  code: StoryQaIssue["code"],
  message: string,
  options: {
    episodeId?: string;
    locale?: string;
    path?: string;
    blocking?: boolean;
  } = {}
): StoryQaIssue {
  return {
    code,
    message,
    episodeId: options.episodeId,
    locale: options.locale,
    path: options.path,
    blocking: options.blocking ?? true,
  };
}

function collectCraftEvidence(
  scripts: readonly AdmittedLocalizedScript[]
): CraftEditorialEvidence[] {
  return scripts.map((script) => ({
    episodeId: script.episodeId,
    locale: script.locale,
    editorialScore: script.manifestEntry.editorial_score,
    editorialGate: script.manifestEntry.editorial_gate,
    timingGate: script.manifestEntry.timing_gate,
  }));
}

function validateProductionBoundaryAlignment(
  boundaries: readonly EpisodeBoundaryContract[],
  production: V5EpisodeProductionBundle
): StoryQaIssue[] {
  const issues: StoryQaIssue[] = [];
  const boundaryByEpisode = new Map(
    boundaries.map((boundary) => [boundary.episodeId, boundary])
  );

  for (const record of production.records) {
    const boundary = boundaryByEpisode.get(record.episodeId);
    if (!boundary) {
      issues.push(
        issue("boundary_production_mismatch", `Missing boundary for ${record.episodeId}`, {
          episodeId: record.episodeId,
        })
      );
      continue;
    }
    if (record.episodeSpec.hook.canonicalIntent !== boundary.hook) {
      issues.push(
        issue(
          "boundary_production_mismatch",
          `EpisodeSpec hook does not match admitted boundary for ${record.episodeId}`,
          { episodeId: record.episodeId, path: "episodeSpec.hook" }
        )
      );
    }
    if (record.episodeSpec.cliffhanger.canonicalIntent !== boundary.cliffhangerBeat) {
      issues.push(
        issue(
          "boundary_production_mismatch",
          `EpisodeSpec cliffhanger does not match admitted boundary for ${record.episodeId}`,
          { episodeId: record.episodeId, path: "episodeSpec.cliffhanger" }
        )
      );
    }
    if (record.episodeSpec.forbiddenEvents.includes(FORBIDDEN_OPEN_LOOP_RESOLUTION)) {
      const cliffhangerBeat = record.beatPlan.beats.at(-1);
      if (cliffhangerBeat?.event !== boundary.cliffhangerBeat) {
        issues.push(
          issue(
            "forbidden_event_present",
            `Cliffhanger beat must preserve open loop for ${record.episodeId}`,
            { episodeId: record.episodeId, path: "beatPlan.cliffhanger" }
          )
        );
      }
    }
  }
  return issues;
}

function validateBoundaryChain(
  boundaries: readonly EpisodeBoundaryContract[]
): StoryQaIssue[] {
  const issues: StoryQaIssue[] = [];
  const byEpisode = new Map(boundaries.map((boundary) => [boundary.episodeId, boundary]));
  const scopedEpisodeIds = new Set(byEpisode.keys());

  for (const episodeId of scopedEpisodeIds) {
    const episodeNumber = Number.parseInt(episodeId.slice(1), 10);
    if (!Number.isFinite(episodeNumber) || episodeNumber >= 100) {
      continue;
    }
    const nextEpisodeId = `E${String(episodeNumber + 1).padStart(3, "0")}`;
    const current = byEpisode.get(episodeId);
    const next = byEpisode.get(nextEpisodeId);
    if (!current || !next) {
      continue;
    }
    if (
      current.nextOpeningObligation &&
      current.nextOpeningObligation !== next.hook
    ) {
      issues.push(
        issue(
          "boundary_chain_break",
          `Boundary chain break between ${episodeId} and ${nextEpisodeId}`,
          { episodeId, path: "nextOpeningObligation" }
        )
      );
    }
  }
  return issues;
}

function validateLocaleParity(
  scripts: readonly AdmittedLocalizedScript[],
  boundaries: readonly EpisodeBoundaryContract[],
  episodeIds?: readonly string[]
): StoryQaIssue[] {
  const issues: StoryQaIssue[] = [];
  const boundaryByEpisode = new Map(
    boundaries.map((boundary) => [boundary.episodeId, boundary])
  );
  const scopedEpisodeIds =
    episodeIds ??
    [...new Set(scripts.map((script) => script.episodeId))].sort((left, right) =>
      left.localeCompare(right)
    );

  for (const episodeId of scopedEpisodeIds) {
    const episodeScripts = scripts.filter((script) => script.episodeId === episodeId);
    if (episodeScripts.length !== LOCALES.length) {
      issues.push(
        issue(
          "locale_parity_mismatch",
          `Expected four locale scripts for ${episodeId}`,
          { episodeId }
        )
      );
      continue;
    }

    const boundary = boundaryByEpisode.get(episodeId);
    if (!boundary) {
      issues.push(
        issue("hook_cliffhanger_missing", `Missing boundary for ${episodeId}`, {
          episodeId,
        })
      );
      continue;
    }

    for (const script of episodeScripts) {
      if (script.manifestEntry.timing_gate !== "PASS") {
        issues.push(
          issue(
            "locale_timing_gate_failed",
            `Timing gate failed for ${episodeId} ${script.locale}`,
            { episodeId, locale: script.locale, blocking: true }
          )
        );
      }
      if (!script.manifestEntry.hook?.trim() || !script.manifestEntry.cliffhanger_beat?.trim()) {
        issues.push(
          issue(
            "hook_cliffhanger_missing",
            `Hook/cliffhanger manifest fields missing for ${episodeId} ${script.locale}`,
            { episodeId, locale: script.locale }
          )
        );
      }
      if (script.manifestEntry.id !== episodeId) {
        issues.push(
          issue(
            "locale_parity_mismatch",
            `Manifest episode id mismatch for ${script.locale}`,
            { episodeId, locale: script.locale }
          )
        );
      }
    }

    const enScript = episodeScripts.find((script) => script.locale === "en-US");
    if (enScript && enScript.manifestEntry.hook !== boundary.hook) {
      issues.push(
        issue(
          "boundary_production_mismatch",
          `EN manifest hook must match canonical boundary for ${episodeId}`,
          { episodeId, locale: "en-US" }
        )
      );
    }
  }
  return issues;
}

function validateSeasonFinale(
  boundaries: readonly EpisodeBoundaryContract[]
): StoryQaIssue[] {
  const issues: StoryQaIssue[] = [];
  const finale = boundaries.find((boundary) => boundary.episodeId === "E100");
  if (!finale) {
    return issues;
  }
  if (!finale.openLoop.toLowerCase().includes("seven")) {
    issues.push(
      issue(
        "season_boundary_violation",
        "E100 open loop must preserve the non-retroactive Season 2 hook",
        { episodeId: "E100", path: "openLoop" }
      )
    );
  }
  if (finale.nextOpeningObligation) {
    issues.push(
      issue(
        "season_boundary_violation",
        "E100 must not impose a Season 1 retroactive opening obligation",
        { episodeId: "E100", path: "nextOpeningObligation" }
      )
    );
  }
  return issues;
}

function validateCraftEvidence(
  craftEvidence: readonly CraftEditorialEvidence[]
): StoryQaIssue[] {
  const issues: StoryQaIssue[] = [];
  for (const evidence of craftEvidence) {
    if (!Number.isFinite(evidence.editorialScore)) {
      issues.push(
        issue("craft_score_invalid", `Invalid editorial score for ${evidence.episodeId}`, {
          episodeId: evidence.episodeId,
          locale: evidence.locale,
          blocking: false,
        })
      );
    }
  }
  return issues;
}

export function validateV5StoryDeterministicQa(input: {
  canonBundle: V5CanonAdmissionBundle;
  productionBundle: V5EpisodeProductionBundle;
  episodeIds?: readonly string[];
}): V5StoryDeterministicQaResult {
  const craftEvidence = collectCraftEvidence(input.canonBundle.admittedScripts);
  const episodeIds =
    input.episodeIds ??
  [...new Set(input.canonBundle.admittedScripts.map((script) => script.episodeId))].sort(
      (left, right) => left.localeCompare(right)
    );
  const issues: StoryQaIssue[] = [
    ...validateProductionBoundaryAlignment(
      input.canonBundle.episodeBoundaries,
      input.productionBundle
    ),
    ...validateBoundaryChain(input.canonBundle.episodeBoundaries),
    ...validateLocaleParity(
      input.canonBundle.admittedScripts,
      input.canonBundle.episodeBoundaries,
      episodeIds
    ),
    ...validateSeasonFinale(input.canonBundle.episodeBoundaries),
    ...validateCraftEvidence(craftEvidence),
  ];

  const blockingIssues = issues.filter((entry) => entry.blocking);
  if (blockingIssues.length > 0) {
    return { ok: false, craftEvidence, issues };
  }
  return { ok: true, craftEvidence, issues };
}

export function validateV5StoryEpisodeDeterministicQa(
  input: {
    canonBundle: V5CanonAdmissionBundle;
    productionBundle: V5EpisodeProductionBundle;
  },
  episodeId: string
): V5StoryDeterministicQaResult {
  const filteredCanon: V5CanonAdmissionBundle = {
    ...input.canonBundle,
    episodeBoundaries: input.canonBundle.episodeBoundaries.filter(
      (boundary) => boundary.episodeId === episodeId
    ),
    admittedScripts: input.canonBundle.admittedScripts.filter(
      (script) => script.episodeId === episodeId
    ),
  };
  const filteredProduction: V5EpisodeProductionBundle = {
    ...input.productionBundle,
    records: input.productionBundle.records.filter(
      (record) => record.episodeId === episodeId
    ),
  };
  return validateV5StoryDeterministicQa({
    canonBundle: filteredCanon,
    productionBundle: filteredProduction,
    episodeIds: [episodeId],
  });
}
