import { describe, expect, it } from "vitest";

import {
  compileEpisodeProductionFromBoundary,
  type AdmittedLocalizedScript,
  type EpisodeBoundaryContract,
  type SemanticStoryQaAdapter,
  type V5CanonAdmissionBundle,
  type V5EpisodeProductionBundle,
} from "@mediaforge/microdrama";

import {
  assertFutureLocaleTarget,
  createGlossaryBoundMockGenerationAdapter,
  importedScriptsRemainImmutable,
  runFutureLocaleAdmissionWorkflow,
  snapshotImportedScripts,
} from "./future-locale-admission.js";
import {
  FUTURE_LOCALE_SCHEMA_VERSION,
  type ImportedV5Locale,
  validateFutureLocaleAdmittedScript,
} from "./future-locale-contracts.js";

const ADMITTED_AT = "2026-08-12T05:00:00.000Z";
const IMPORT_ID = "f".repeat(64);

function boundaryFixture(
  overrides: Partial<EpisodeBoundaryContract> = {}
): EpisodeBoundaryContract {
  return {
    schemaVersion: "mediaforge.microdrama-pack.v1",
    episodeId: "E001",
    episodeNumber: 1,
    arcId: "1",
    arcName: "Pilot",
    title: "Pilot episode",
    newInformation: "Maya receives the first impossible timestamp.",
    openLoop: "Who sent the first packet?",
    hook: "Seven minutes remain before the loop closes forever.",
    cliffhangerBeat: "The countdown resets with a +7 YEARS stamp.",
    characters: ["Maya Vale"],
    location: "relay chamber",
    nextOpeningObligation: "The relay chamber door opens on its own.",
    provenance: {
      sourceKind: "import",
      sourcePackVersion: "v5-remediated",
      sourceRelativePath: "languages/en/episodes/e001-example.md",
      sourceArtifactHash: "b".repeat(64),
      importedAt: ADMITTED_AT,
    },
    ...overrides,
  };
}

function admittedScriptFixture(input: {
  episodeId: string;
  locale: ImportedV5Locale;
  hook: string;
  cliffhangerBeat: string;
  scriptRevisionId: string;
  contentHash: string;
}): AdmittedLocalizedScript {
  const aliasByLocale = {
    "en-US": "en",
    "de-DE": "de",
    "es-ES": "es",
    "pt-BR": "pt-BR",
  } as const;

  return {
    schemaVersion: "mediaforge.microdrama-pack.v1",
    episodeId: input.episodeId,
    locale: input.locale,
    sourceLocaleAlias: aliasByLocale[input.locale],
    scriptRelativePath: `languages/${input.locale}/episodes/${input.episodeId.toLowerCase()}.md`,
    contentHash: input.contentHash,
    manifestEntry: {
      episode: String(Number.parseInt(input.episodeId.slice(1), 10)),
      id: input.episodeId,
      arc: "1",
      arc_name: "Pilot",
      title: "Pilot episode",
      hook: input.hook,
      cliffhanger_beat: input.cliffhangerBeat,
      characters: "Maya Vale",
      location: "relay chamber",
      locale: input.locale,
      wpm: 155,
      word_count: 154,
      estimated_seconds: 59.6,
      timing_gate: "PASS",
      editorial_score: 9.7,
      editorial_gate: "PASS",
      source_authority: "EN-v5",
    },
    provenance: {
      sourceKind: "import",
      sourcePackVersion: "v5-remediated",
      sourceRelativePath: `languages/${input.locale}/episodes/${input.episodeId.toLowerCase()}.md`,
      sourceArtifactHash: input.contentHash,
      importedAt: ADMITTED_AT,
    },
    importStatus: "IMPORTED_APPROVED_LOCALIZED_SCRIPT",
    scriptRevisionId: input.scriptRevisionId,
  };
}

function buildEpisodeFixtures(episodeId: string) {
  const boundary = boundaryFixture({
    episodeId,
    episodeNumber: Number.parseInt(episodeId.slice(1), 10),
  });
  const locales = ["en-US", "de-DE", "es-ES", "pt-BR"] as const;
  const admittedScripts = locales.map((locale, index) =>
    admittedScriptFixture({
      episodeId,
      locale,
      hook: boundary.hook,
      cliffhangerBeat: boundary.cliffhangerBeat,
      scriptRevisionId: `rev.script.${locale.toLowerCase()}.${episodeId.toLowerCase()}`,
      contentHash: `${index + 1}`.padStart(64, "a"),
    })
  );

  const canonBundle = {
    schemaVersion: "mediaforge.microdrama-pack.v1",
    importId: IMPORT_ID,
    seriesImport: {
      schemaVersion: "mediaforge.microdrama-pack.v1",
      seriesId: "seven-minutes-ahead",
      packVersion: "v5-remediated",
      sourceRoot: "content-packs/seven-minutes-ahead-content-pack-v5-remediated",
      manifestHash: "1".repeat(64),
      hashManifestPath: "hash-manifest.json",
      hashManifestDigest: "2".repeat(64),
      locales: [...locales],
      episodeCount: 100,
      localeVariantCount: 400,
      fileCount: 434,
      validationStatus: "PASS",
      provenance: boundary.provenance,
    },
    seriesBibleRevisionId: "rev.series-bible.v5",
    episodeBoundaries: [boundary],
    admittedScripts,
    episodeIdentities: [
      {
        episodeId,
        locales: [...locales],
        scriptRevisionIds: admittedScripts.map((script) => script.scriptRevisionId),
        contentHashes: admittedScripts.map((script) => script.contentHash),
      },
    ],
    admittedAt: ADMITTED_AT,
  } as V5CanonAdmissionBundle;

  const enScript = admittedScripts.find((script) => script.locale === "en-US")!;
  const compiled = compileEpisodeProductionFromBoundary({
    boundary,
    enScript,
  });
  const productionBundle = {
    schemaVersion: "mediaforge.microdrama-pack.v1",
    importId: IMPORT_ID,
    seriesBibleRevisionId: "rev.series-bible.v5",
    compiledAt: ADMITTED_AT,
    records: [
      {
        episodeId,
        episodeSpecRevisionId: compiled.episodeSpecRevisionId,
        beatPlanRevisionId: compiled.beatPlanRevisionId,
        boundaryRevisionId: compiled.boundaryRevisionId,
        enScriptRevisionId: compiled.enScriptRevisionId,
        episodeSpec: compiled.episodeSpec,
        beatPlan: compiled.beatPlan,
      },
    ],
  } as V5EpisodeProductionBundle;

  return { canonBundle, productionBundle, boundary, admittedScripts };
}

function buildGlossaryBinding(targetLocale: string) {
  return {
    schemaVersion: FUTURE_LOCALE_SCHEMA_VERSION,
    glossaryId: "glossary.seven-minutes-ahead.it-it.v1",
    revisionId: "rev.glossary.it-it.v1",
    targetLocale,
    sourceLocale: "en-US" as const,
    terms: [
      {
        termId: "series-title",
        sourceText: "7 MINUTES AHEAD",
        localizedText: "7 MINUTI AVANTI",
        kind: "DO_NOT_TRANSLATE" as const,
      },
      {
        termId: "signal-ui",
        sourceText: "Signal",
        localizedText: "Segnale",
        kind: "FIXED_LOCALIZATION" as const,
      },
    ],
  };
}

function buildDraftRequest(input: {
  episodeId: string;
  targetLocale: string;
  sourceScriptRevisionId: string;
}) {
  return {
    schemaVersion: FUTURE_LOCALE_SCHEMA_VERSION,
    requestId: `future-locale.${input.episodeId.toLowerCase()}.${input.targetLocale.toLowerCase()}`,
    episodeId: input.episodeId,
    targetLocale: input.targetLocale,
    sourceScriptRevisionId: input.sourceScriptRevisionId,
    glossaryBinding: buildGlossaryBinding(input.targetLocale),
    canonicalImportId: IMPORT_ID,
  };
}

describe("future-locale generation and admission workflow", () => {
  it("rejects imported V5 locales as generation targets", () => {
    for (const locale of ["en-US", "de-DE", "es-ES", "pt-BR"] as const) {
      expect(assertFutureLocaleTarget(locale)).toEqual([
        expect.objectContaining({
          code: "imported_locale_forbidden",
          locale,
          blocking: true,
        }),
      ]);
    }
    expect(assertFutureLocaleTarget("it-IT")).toEqual([]);
  });

  it("admits glossary-bound it-IT drafts without mutating imported V5 revisions", async () => {
    const { canonBundle, productionBundle, admittedScripts } = buildEpisodeFixtures("E001");
    const importedBefore = snapshotImportedScripts(canonBundle.admittedScripts);
    const sourceScript = admittedScripts.find((script) => script.locale === "en-US");
    expect(sourceScript).toBeTruthy();

    const request = buildDraftRequest({
      episodeId: "E001",
      targetLocale: "it-IT",
      sourceScriptRevisionId: sourceScript!.scriptRevisionId,
    });

    const result = await runFutureLocaleAdmissionWorkflow({
      request,
      canonBundle,
      productionBundle,
      generationAdapter: createGlossaryBoundMockGenerationAdapter(),
      admittedAt: ADMITTED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.issues.map((issue) => issue.message).join("\n"));
    }

    validateFutureLocaleAdmittedScript(result.admittedScript);
    expect(result.admittedScript.locale).toBe("it-IT");
    expect(result.admittedScript.sourceScriptRevisionId).toBe(
      sourceScript!.scriptRevisionId
    );
    expect(result.importedScriptsUnchanged).toBe(true);
    expect(
      importedScriptsRemainImmutable(
        importedBefore,
        snapshotImportedScripts(canonBundle.admittedScripts)
      )
    ).toBe(true);
    expect(
      canonBundle.admittedScripts.some(
        (script) => script.scriptRevisionId === result.admittedScript.scriptRevisionId
      )
    ).toBe(false);
  });

  it("blocks regeneration of imported de-DE revision ids for future-locale targets", async () => {
    const { canonBundle, productionBundle, admittedScripts } = buildEpisodeFixtures("E024");
    const deScript = admittedScripts.find((script) => script.locale === "de-DE");
    expect(deScript).toBeTruthy();

    const request = buildDraftRequest({
      episodeId: "E024",
      targetLocale: "de-DE",
      sourceScriptRevisionId: deScript!.scriptRevisionId,
    });

    const result = await runFutureLocaleAdmissionWorkflow({
      request,
      canonBundle,
      productionBundle,
      generationAdapter: createGlossaryBoundMockGenerationAdapter(),
      admittedAt: ADMITTED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected imported locale rejection");
    }
    expect(result.issues.some((issue) => issue.code === "imported_locale_forbidden")).toBe(
      true
    );
  });

  it("requires semantic parity when a semantic adapter is supplied", async () => {
    const { canonBundle, productionBundle, admittedScripts } = buildEpisodeFixtures("E038");
    const sourceScript = admittedScripts.find((script) => script.locale === "en-US");
    expect(sourceScript).toBeTruthy();

    const blockingSemanticAdapter: SemanticStoryQaAdapter = () => ({
      status: "BLOCK",
      message: "Localized hook does not preserve cliffhanger semantic parity.",
      episodeId: "E038",
      locale: "it-IT",
    });

    const request = buildDraftRequest({
      episodeId: "E038",
      targetLocale: "it-IT",
      sourceScriptRevisionId: sourceScript!.scriptRevisionId,
    });

    const result = await runFutureLocaleAdmissionWorkflow({
      request,
      canonBundle,
      productionBundle,
      generationAdapter: createGlossaryBoundMockGenerationAdapter(),
      semanticAdapter: blockingSemanticAdapter,
      admittedAt: ADMITTED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected semantic parity rejection");
    }
    expect(result.issues.some((issue) => issue.code === "semantic_parity_failed")).toBe(
      true
    );
  });

  it("does not overwrite an existing imported revision id when generation collides", async () => {
    const { canonBundle, productionBundle, admittedScripts } = buildEpisodeFixtures("E001");
    const sourceScript = admittedScripts.find((script) => script.locale === "en-US");
    expect(sourceScript).toBeTruthy();

    const request = buildDraftRequest({
      episodeId: "E001",
      targetLocale: "it-IT",
      sourceScriptRevisionId: sourceScript!.scriptRevisionId,
    });

    const result = await runFutureLocaleAdmissionWorkflow({
      request,
      canonBundle,
      productionBundle,
      generationAdapter: () => ({
        schemaVersion: FUTURE_LOCALE_SCHEMA_VERSION,
        episodeId: "E001",
        locale: "it-IT",
        scriptRevisionId: sourceScript!.scriptRevisionId,
        sourceScriptRevisionId: sourceScript!.scriptRevisionId,
        glossaryRevisionId: request.glossaryBinding.revisionId,
        contentHash: "d".repeat(64),
        hook: "Hook",
        cliffhangerBeat: "Cliff",
        prose: "7 MINUTI AVANTI Segnale",
        draftGeneratedAt: ADMITTED_AT,
      }),
      admittedAt: ADMITTED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected revision collision rejection");
    }
    expect(result.issues.some((issue) => issue.code === "revision_collision")).toBe(true);
    expect(
      canonBundle.admittedScripts.find(
        (script) => script.scriptRevisionId === sourceScript!.scriptRevisionId
      )?.locale
    ).toBe("en-US");
  });
});
