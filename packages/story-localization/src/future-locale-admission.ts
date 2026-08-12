import { createHash } from "node:crypto";

import type {
  AdmittedLocalizedScript,
  EpisodeBoundaryContract,
  V5CanonAdmissionBundle,
} from "@mediaforge/microdrama";
import {
  evaluateOptionalSemanticStoryQa,
  validateV5StoryEpisodeDeterministicQa,
  type SemanticStoryQaAdapter,
  type V5EpisodeProductionBundle,
  type V5EpisodeProductionRecord,
} from "@mediaforge/microdrama";

import {
  FUTURE_LOCALE_SCHEMA_VERSION,
  IMPORTED_V5_LOCALES,
  type FutureLocaleAdmissionIssue,
  type FutureLocaleAdmissionResult,
  type FutureLocaleDraftRequest,
  type FutureLocaleDraftScript,
  type FutureLocaleGlossaryBinding,
  type FutureLocaleGlossaryTerm,
  type ImportedV5Locale,
} from "./future-locale-contracts.js";

export type FutureLocaleGenerationAdapter = (
  input: {
    request: FutureLocaleDraftRequest;
    sourceScript: AdmittedLocalizedScript;
    boundary: EpisodeBoundaryContract;
  }
) => FutureLocaleDraftScript | Promise<FutureLocaleDraftScript>;

export type FutureLocaleAdmissionWorkflowInput = {
  readonly request: FutureLocaleDraftRequest;
  readonly canonBundle: V5CanonAdmissionBundle;
  readonly productionBundle: V5EpisodeProductionBundle;
  readonly generationAdapter: FutureLocaleGenerationAdapter;
  readonly semanticAdapter?: SemanticStoryQaAdapter;
  readonly admittedAt: string;
};

type ImportedScriptSnapshot = {
  readonly episodeId: string;
  readonly locale: string;
  readonly scriptRevisionId: string;
  readonly contentHash: string;
};

function issue(
  code: FutureLocaleAdmissionIssue["code"],
  message: string,
  options: {
    episodeId?: string;
    locale?: string;
    path?: string;
    blocking?: boolean;
  } = {}
): FutureLocaleAdmissionIssue {
  return {
    code,
    message,
    episodeId: options.episodeId,
    locale: options.locale,
    path: options.path,
    blocking: options.blocking ?? true,
  };
}

export function isImportedV5Locale(locale: string): locale is ImportedV5Locale {
  return (IMPORTED_V5_LOCALES as readonly string[]).includes(locale);
}

export function assertFutureLocaleTarget(locale: string): FutureLocaleAdmissionIssue[] {
  if (isImportedV5Locale(locale)) {
    return [
      issue(
        "imported_locale_forbidden",
        `Locale ${locale} is an imported V5 revision and cannot be a future-locale generation target`,
        { locale }
      ),
    ];
  }
  return [];
}

export function snapshotImportedScripts(
  scripts: readonly AdmittedLocalizedScript[]
): ImportedScriptSnapshot[] {
  return scripts.map((script) => ({
    episodeId: script.episodeId,
    locale: script.locale,
    scriptRevisionId: script.scriptRevisionId,
    contentHash: script.contentHash,
  }));
}

export function importedScriptsRemainImmutable(
  before: readonly ImportedScriptSnapshot[],
  after: readonly ImportedScriptSnapshot[]
): boolean {
  if (before.length !== after.length) {
    return false;
  }
  for (let index = 0; index < before.length; index += 1) {
    const left = before[index]!;
    const right = after[index]!;
    if (
      left.episodeId !== right.episodeId ||
      left.locale !== right.locale ||
      left.scriptRevisionId !== right.scriptRevisionId ||
      left.contentHash !== right.contentHash
    ) {
      return false;
    }
  }
  return true;
}

export function validateGlossaryBinding(
  request: FutureLocaleDraftRequest
): FutureLocaleAdmissionIssue[] {
  const issues: FutureLocaleAdmissionIssue[] = [];
  const binding = request.glossaryBinding;

  if (binding.targetLocale !== request.targetLocale) {
    issues.push(
      issue(
        "glossary_binding_mismatch",
        "Glossary binding target locale does not match draft request",
        { locale: request.targetLocale, path: "glossaryBinding.targetLocale" }
      )
    );
  }
  if (binding.revisionId.trim().length === 0) {
    issues.push(
      issue(
        "glossary_binding_mismatch",
        "Glossary binding revision id is required",
        { path: "glossaryBinding.revisionId" }
      )
    );
  }
  return issues;
}

function requiredGlossaryTerms(
  terms: readonly FutureLocaleGlossaryTerm[]
): FutureLocaleGlossaryTerm[] {
  return terms.filter(
    (term) => term.kind === "DO_NOT_TRANSLATE" || term.kind === "FIXED_LOCALIZATION"
  );
}

export function validateFutureLocaleGlossaryCompliance(
  draft: FutureLocaleDraftScript,
  binding: FutureLocaleGlossaryBinding
): FutureLocaleAdmissionIssue[] {
  const issues: FutureLocaleAdmissionIssue[] = [];
  if (draft.glossaryRevisionId !== binding.revisionId) {
    issues.push(
      issue(
        "glossary_binding_mismatch",
        "Draft glossary revision id does not match binding",
        {
          episodeId: draft.episodeId,
          locale: draft.locale,
          path: "glossaryRevisionId",
        }
      )
    );
  }

  for (const term of requiredGlossaryTerms(binding.terms)) {
    if (!draft.prose.includes(term.localizedText)) {
      issues.push(
        issue(
          "glossary_term_missing",
          `Required glossary term ${term.termId} is missing from draft prose`,
          {
            episodeId: draft.episodeId,
            locale: draft.locale,
            path: `glossary.${term.termId}`,
          }
        )
      );
    }
  }
  return issues;
}

export function validateFutureLocaleDraftBoundaryParity(
  draft: FutureLocaleDraftScript,
  boundary: EpisodeBoundaryContract
): FutureLocaleAdmissionIssue[] {
  const issues: FutureLocaleAdmissionIssue[] = [];
  if (!draft.hook.trim() || !draft.cliffhangerBeat.trim()) {
    issues.push(
      issue(
        "hook_cliffhanger_missing",
        "Future locale draft must include hook and cliffhanger beat metadata",
        { episodeId: draft.episodeId, locale: draft.locale }
      )
    );
  }
  if (draft.episodeId !== boundary.episodeId) {
    issues.push(
      issue(
        "deterministic_qa_failed",
        "Draft episode id does not match admitted boundary",
        { episodeId: draft.episodeId, path: "episodeId" }
      )
    );
  }
  return issues;
}

export function validateFutureLocaleRevisionSafety(
  draft: FutureLocaleDraftScript,
  canonBundle: V5CanonAdmissionBundle
): FutureLocaleAdmissionIssue[] {
  const issues: FutureLocaleAdmissionIssue[] = [];
  const collision = canonBundle.admittedScripts.find(
    (script) => script.scriptRevisionId === draft.scriptRevisionId
  );
  if (collision) {
    issues.push(
      issue(
        "revision_collision",
        `Draft revision id collides with imported V5 script for ${collision.locale}`,
        {
          episodeId: collision.episodeId,
          locale: collision.locale,
          path: "scriptRevisionId",
        }
      )
    );
  }

  const importedTarget = canonBundle.admittedScripts.find(
    (script) =>
      script.episodeId === draft.episodeId && script.locale === draft.locale
  );
  if (importedTarget) {
    issues.push(
      issue(
        "imported_revision_immutable",
        `Imported V5 script revision for ${draft.locale} cannot be regenerated`,
        {
          episodeId: draft.episodeId,
          locale: draft.locale,
          path: "locale",
        }
      )
    );
  }

  const sourceScript = canonBundle.admittedScripts.find(
    (script) => script.scriptRevisionId === draft.sourceScriptRevisionId
  );
  if (!sourceScript) {
    issues.push(
      issue(
        "source_revision_not_found",
        "Draft source script revision is not present in admitted canon",
        {
          episodeId: draft.episodeId,
          locale: draft.locale,
          path: "sourceScriptRevisionId",
        }
      )
    );
  } else if (sourceScript.importStatus !== "IMPORTED_APPROVED_LOCALIZED_SCRIPT") {
    issues.push(
      issue(
        "imported_revision_immutable",
        "Future locale drafts must bind to imported approved source revisions only",
        {
          episodeId: draft.episodeId,
          locale: sourceScript.locale,
          path: "sourceScriptRevisionId",
        }
      )
    );
  }

  return issues;
}

export function validateFutureLocaleDraftDeterministicQa(input: {
  draft: FutureLocaleDraftScript;
  boundary: EpisodeBoundaryContract;
  glossaryBinding: FutureLocaleGlossaryBinding;
  canonBundle: V5CanonAdmissionBundle;
  productionBundle: V5EpisodeProductionBundle;
}): FutureLocaleAdmissionIssue[] {
  const episodeQa = validateV5StoryEpisodeDeterministicQa(
    {
      canonBundle: input.canonBundle,
      productionBundle: input.productionBundle,
    },
    input.draft.episodeId
  );
  const issues: FutureLocaleAdmissionIssue[] = [];
  if (!episodeQa.ok) {
    issues.push(
      ...episodeQa.issues
        .filter((entry) => entry.blocking)
        .map((entry) =>
          issue("deterministic_qa_failed", entry.message, {
            episodeId: entry.episodeId,
            locale: entry.locale,
            path: entry.path,
          })
        )
    );
  }

  return [
    ...issues,
    ...validateFutureLocaleDraftBoundaryParity(input.draft, input.boundary),
    ...validateFutureLocaleGlossaryCompliance(input.draft, input.glossaryBinding),
    ...validateFutureLocaleRevisionSafety(input.draft, input.canonBundle),
  ];
}

export function createGlossaryBoundMockGenerationAdapter(): FutureLocaleGenerationAdapter {
  return ({ request, sourceScript, boundary }) => {
    let prose = [
      `Future locale draft for ${request.targetLocale}.`,
      `Source revision ${sourceScript.scriptRevisionId}.`,
      boundary.hook,
      boundary.cliffhangerBeat,
      "7 MINUTES AHEAD",
      "Signal",
    ].join(" ");

    for (const term of request.glossaryBinding.terms) {
      if (term.kind === "DO_NOT_TRANSLATE" || term.kind === "FIXED_LOCALIZATION") {
        prose = prose.split(term.sourceText).join(term.localizedText);
      }
    }

    const scriptRevisionId = `rev.script.${request.targetLocale.toLowerCase()}.${request.episodeId.toLowerCase()}.draft.v1`;
    const contentHash = createHash("sha256").update(prose).digest("hex");

    return {
      schemaVersion: FUTURE_LOCALE_SCHEMA_VERSION,
      episodeId: request.episodeId,
      locale: request.targetLocale,
      scriptRevisionId,
      sourceScriptRevisionId: sourceScript.scriptRevisionId,
      glossaryRevisionId: request.glossaryBinding.revisionId,
      contentHash,
      hook: boundary.hook,
      cliffhangerBeat: boundary.cliffhangerBeat,
      prose,
      draftGeneratedAt: new Date().toISOString(),
    };
  };
}

export async function runFutureLocaleAdmissionWorkflow(
  input: FutureLocaleAdmissionWorkflowInput
): Promise<FutureLocaleAdmissionResult> {
  const issues: FutureLocaleAdmissionIssue[] = [
    ...assertFutureLocaleTarget(input.request.targetLocale),
    ...validateGlossaryBinding(input.request),
  ];
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  if (input.request.canonicalImportId !== input.canonBundle.importId) {
    return {
      ok: false,
      issues: [
        issue(
          "source_revision_mismatch",
          "Draft request import id does not match admitted canon bundle",
          { episodeId: input.request.episodeId }
        ),
      ],
    };
  }

  const importedBefore = snapshotImportedScripts(input.canonBundle.admittedScripts);
  const sourceScript = input.canonBundle.admittedScripts.find(
    (script) => script.scriptRevisionId === input.request.sourceScriptRevisionId
  );
  if (!sourceScript) {
    return {
      ok: false,
      issues: [
        issue(
          "source_revision_not_found",
          "Requested source script revision is not admitted in canon",
          {
            episodeId: input.request.episodeId,
            path: "sourceScriptRevisionId",
          }
        ),
      ],
    };
  }
  if (sourceScript.episodeId !== input.request.episodeId) {
    return {
      ok: false,
      issues: [
        issue(
          "source_revision_mismatch",
          "Source script revision episode does not match draft request",
          { episodeId: input.request.episodeId, path: "sourceScriptRevisionId" }
        ),
      ],
    };
  }

  const boundary = input.canonBundle.episodeBoundaries.find(
    (entry) => entry.episodeId === input.request.episodeId
  );
  if (!boundary) {
    return {
      ok: false,
      issues: [
        issue(
          "deterministic_qa_failed",
          `Missing admitted boundary for ${input.request.episodeId}`,
          { episodeId: input.request.episodeId }
        ),
      ],
    };
  }

  const draft = await input.generationAdapter({
    request: input.request,
    sourceScript,
    boundary,
  });

  const deterministicIssues = validateFutureLocaleDraftDeterministicQa({
    draft,
    boundary,
    glossaryBinding: input.request.glossaryBinding,
    canonBundle: input.canonBundle,
    productionBundle: input.productionBundle,
  });
  if (deterministicIssues.some((entry) => entry.blocking)) {
    return { ok: false, issues: deterministicIssues };
  }

  const productionRecord = input.productionBundle.records.find(
    (record) => record.episodeId === input.request.episodeId
  );
  if (!productionRecord) {
    return {
      ok: false,
      issues: [
        issue(
          "deterministic_qa_failed",
          `Missing production record for ${input.request.episodeId}`,
          { episodeId: input.request.episodeId }
        ),
      ],
    };
  }

  const semantic = await evaluateOptionalSemanticStoryQa(input.semanticAdapter, {
    episodeId: productionRecord.episodeId,
    locale: input.request.targetLocale,
    hookSemanticId: productionRecord.episodeSpec.hook.semanticId,
    cliffhangerSemanticId: productionRecord.episodeSpec.cliffhanger.semanticId,
    mandatory: Boolean(input.semanticAdapter),
  });
  const semanticBlocking = semantic.issues.filter((entry) => entry.blocking);
  if (semanticBlocking.length > 0) {
    return {
      ok: false,
      issues: semanticBlocking.map((entry) =>
        issue("semantic_parity_failed", entry.message, {
          episodeId: entry.episodeId,
          locale: entry.locale,
        })
      ),
    };
  }

  const importedAfter = snapshotImportedScripts(input.canonBundle.admittedScripts);
  if (!importedScriptsRemainImmutable(importedBefore, importedAfter)) {
    return {
      ok: false,
      issues: [
        issue(
          "imported_revision_immutable",
          "Imported V5 locale revisions must remain unchanged during future-locale admission",
          { episodeId: input.request.episodeId }
        ),
      ],
    };
  }

  return {
    ok: true,
    admittedScript: {
      schemaVersion: FUTURE_LOCALE_SCHEMA_VERSION,
      episodeId: draft.episodeId,
      locale: draft.locale,
      scriptRevisionId: draft.scriptRevisionId,
      sourceScriptRevisionId: draft.sourceScriptRevisionId,
      glossaryRevisionId: draft.glossaryRevisionId,
      contentHash: draft.contentHash,
      hook: draft.hook,
      cliffhangerBeat: draft.cliffhangerBeat,
      admissionStatus: "FUTURE_LOCALE_ADMITTED_SCRIPT",
      admittedAt: input.admittedAt,
    },
    importedScriptsUnchanged: true,
    deterministicQaPassed: true,
  };
}
