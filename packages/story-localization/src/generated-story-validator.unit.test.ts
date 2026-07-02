import { describe, expect, it } from "vitest";
import { getLanguageProfile } from "./language-profiles.js";
import {
  GENERATED_STORY_VALIDATION_ISSUE_CODES,
  formatValidationIssues,
  validateFullNarrationArtifact,
  validateNarrationOnlyFullRewritePackage,
  validateShortNarrationArtifact,
} from "./generated-story-validator.js";
import type {
  ShortStoryOutputConstraints,
  StoryIR,
} from "./story-artifact-model.js";
import type { CharacterRenameMap } from "./character-rename.service.js";
import type { CanonicalStoryFacts } from "./story-localization.types.js";
import type {
  ShortRewriteAdaptationContract,
  ShortRewriteResolvedParent,
} from "./short-rewrite.types.js";

type SupportedLanguage = "en" | "es" | "de" | "pt" | "fr";

function padToWordRange(text: string, minWords: number, filler: string): string {
  let value = text;
  while (value.trim().split(/\s+/u).length < minWords) {
    value = `${value} ${filler}`;
  }
  return value;
}

function languageTerms(language: SupportedLanguage) {
  switch (language) {
    case "en":
      return {
        localeFiller: "the house and the warning stayed in the dark room",
        chronology: ["Lena entered the house", "the mirror wrote the warning", "the attic door opened"],
        entity: "Lena",
        location: "the house",
        object: "the mirror",
        rule: "never answer the whisper",
        threat: "the whispering thing in the attic",
        fact: "HUMANS CAN LICK TOO stayed on the mirror",
        climax: "the attic door opened and the whisper called Lena by name",
        ending: "Lena fled into the rain and left the house unlocked",
        shortOpen:
          "Lena heard the whispering thing in the attic before the mirror changed.",
      };
    case "es":
      return {
        localeFiller:
          "la casa y la advertencia quedaron en la habitación de la noche",
        chronology: [
          "Lena entró en la casa",
          "el espejo escribió la advertencia",
          "la puerta del ático se abrió",
        ],
        entity: "Lena",
        location: "la casa",
        object: "el espejo",
        rule: "nunca respondas al susurro",
        threat: "la cosa que susurra en el ático",
        fact: "HUMANS CAN LICK TOO quedó en el espejo",
        climax:
          "la puerta del ático se abrió y el susurro llamó a Lena por su nombre",
        ending:
          "Lena huyó bajo la lluvia y dejó la casa abierta",
        shortOpen:
          "Lena oyó a la cosa que susurra en el ático antes de que cambiara el espejo.",
      };
    case "de":
      return {
        localeFiller:
          "der raum und die warnung blieben in dem haus und der nacht",
        chronology: [
          "Lena betrat das Haus",
          "der Spiegel schrieb die Warnung",
          "die Dachbodentür öffnete sich",
        ],
        entity: "Lena",
        location: "das Haus",
        object: "der Spiegel",
        rule: "antworte nie auf das Flüstern",
        threat: "das flüsternde Wesen auf dem Dachboden",
        fact: "HUMANS CAN LICK TOO blieb auf dem Spiegel",
        climax:
          "die Dachbodentür öffnete sich und das Flüstern rief Lena beim Namen",
        ending:
          "Lena floh in den Regen und ließ das Haus offen",
        shortOpen:
          "Lena hörte das flüsternde Wesen auf dem Dachboden, bevor der Spiegel sich veränderte.",
      };
    case "pt":
      return {
        localeFiller:
          "a casa e o aviso ficaram na sala e na noite sem som",
        chronology: [
          "Lena entrou na casa",
          "o espelho escreveu o aviso",
          "a porta do sótão abriu",
        ],
        entity: "Lena",
        location: "a casa",
        object: "o espelho",
        rule: "nunca responda ao sussurro",
        threat: "a coisa que sussurra no sótão",
        fact: "HUMANS CAN LICK TOO ficou no espelho",
        climax:
          "a porta do sótão abriu e o sussurro chamou Lena pelo nome",
        ending:
          "Lena fugiu para a chuva e deixou a casa aberta",
        shortOpen:
          "Lena ouviu a coisa que sussurra no sótão antes de o espelho mudar.",
      };
    case "fr":
      return {
        localeFiller:
          "la maison et l avertissement restaient dans la pièce et la nuit",
        chronology: [
          "Lena entra dans la maison",
          "le miroir écrivit l avertissement",
          "la porte du grenier s ouvrit",
        ],
        entity: "Lena",
        location: "la maison",
        object: "le miroir",
        rule: "ne réponds jamais au murmure",
        threat: "la chose qui murmure dans le grenier",
        fact: "HUMANS CAN LICK TOO resta sur le miroir",
        climax:
          "la porte du grenier s ouvrit et le murmure appela Lena par son nom",
        ending:
          "Lena s enfuit sous la pluie et laissa la maison ouverte",
        shortOpen:
          "Lena entendit la chose qui murmure dans le grenier avant que le miroir change.",
      };
  }
}

function buildStoryIr(language: SupportedLanguage): StoryIR {
  const terms = languageTerms(language);
  return {
    genre: "fictional-supernatural",
    fictionality: "fiction",
    narrativeMode: "character-led",
    entities: [
      { id: "e1", name: terms.entity, type: "person" },
      { id: "e2", name: terms.location, type: "location" },
      { id: "e3", name: terms.object, type: "object" },
      { id: "e4", name: terms.rule, type: "rule" },
    ],
    immutableFacts: [{ id: "f1", statement: terms.fact, confidence: "confirmed", immutable: true }],
    chronology: terms.chronology,
    centralThreat: { type: "supernatural", description: terms.threat, intelligent: true },
    centralRuleMechanism: { description: terms.rule, supernatural: true },
    criticalObjects: [{ id: "o1", name: terms.object, narrativeFunction: "warning surface" }],
    writtenMessages: [{ text: "HUMANS CAN LICK TOO", preserveVerbatim: true }],
    climax: terms.climax,
    endingConsequence: terms.ending,
    allowedInventionBoundaries: {
      dialogue: true,
      internalThoughts: true,
      connectiveDetails: true,
      motives: false,
      undocumentedActions: false,
    },
  };
}

function buildShortParent(language: SupportedLanguage): ShortRewriteResolvedParent {
  const terms = languageTerms(language);
  const narration = [
    terms.chronology[0],
    `${terms.chronology[1]}. ${terms.fact}.`,
    `${terms.climax}. ${terms.ending}.`,
  ];
  return {
    identity: {
      episodeId: "001",
      episodeSlug: "001-demo",
      language,
      locale: getLanguageProfile(language).locale,
      variant: "full",
    },
    title: "Demo",
    sourcePath: "/tmp/demo.md",
    sourceSha256: "a".repeat(64),
    parentFullHash: "b".repeat(64),
    storyIrHash: "c".repeat(64),
    contractHash: "d".repeat(64),
    narrationParagraphs: narration,
    characterRenameMap: buildRenameMap("Morgan Reed"),
    canonical: language === "en",
    provenance:
      language === "en" ? "canonical-full-artifact" : "localized-full-artifact",
  };
}

function buildRenameMap(originalName: string): CharacterRenameMap {
  const originalFirst = originalName.split(" ")[0] ?? originalName;
  return {
    version: 1,
    episodeId: "001",
    sourceHash: "a".repeat(64),
    poolId: "test-pool",
    hash: "b".repeat(64),
    entries: [
      {
        characterId: "character-1",
        originalName,
        fictionalName: "Petra Vale",
        originalAliases: [originalName, originalFirst],
        fictionalAliases: ["Petra Vale", "Petra"],
      },
    ],
  };
}

function buildShortContract(language: SupportedLanguage): ShortRewriteAdaptationContract {
  const terms = languageTerms(language);
  const parent = buildShortParent(language);
  return {
    schemaVersion: "short-adaptation-contract-schema-v1",
    contractVersion: "short-adaptation-contract-v1",
    identity: {
      episodeId: "001",
      episodeSlug: "001-demo",
      language,
      locale: getLanguageProfile(language).locale,
      variant: "short",
    },
    parent: {
      ...parent.identity,
      parentFullHash: parent.parentFullHash,
      sourceSha256: parent.sourceSha256,
    },
    storyIrHash: parent.storyIrHash,
    immutableFacts: [{ id: "f1", statement: terms.fact }],
    centralThreat: terms.threat,
    centralRuleOrMechanism: terms.rule,
    criticalObject: terms.object,
    climaxOrIrreversibleTurn: terms.climax,
    finalConsequenceOrSting: terms.ending,
    exactWrittenMessages: ["HUMANS CAN LICK TOO"],
    allowedCompression: ["Shorten setup."],
    forbiddenOmissions: [terms.climax, terms.ending],
    retentionBoundaries: {
      factsMustRemain: [terms.fact],
      detailsMayCompress: ["background weather"],
      detailsMayRemove: ["minor room details"],
      dialogueMayShorten: [],
    },
    inventionBoundaries: ["Do not add new characters."],
    constraints: {
      targetDurationSeconds: { min: 55, max: 65 },
      targetNarrationWpm: getLanguageProfile(language).shortNarrationWpm,
      targetWordRange: {
        min: getLanguageProfile(language).shortWordRange.min,
        max: getLanguageProfile(language).shortWordRange.max,
      },
      hookDeadlineSeconds: 8,
      maximumBeats: 6,
    },
    sourceExtraction: {
      extractionHash: "e".repeat(64),
      selectedBeatIds: ["b01", "b02"],
      orphanedReferences: [],
    },
    contractHash: "f".repeat(64),
  };
}

function buildShortConstraints(language: SupportedLanguage): ShortStoryOutputConstraints {
  const profile = getLanguageProfile(language);
  return {
    variant: "short",
    targetWordRange: {
      min: profile.shortWordRange.min,
      max: profile.shortWordRange.max,
    },
    targetNarrationWpm: profile.shortNarrationWpm,
    targetDuration: { minSeconds: 55, maxSeconds: 65 },
    hookDeadlineSeconds: 8,
    fullVideoBridgeRequired: true,
  };
}

function minimumPassingShortWords(language: SupportedLanguage): number {
  const constraints = buildShortConstraints(language);
  return Math.max(
    constraints.targetWordRange.min,
    Math.ceil(
      (constraints.targetDuration.minSeconds / 60) *
        constraints.targetNarrationWpm
    )
  );
}

describe("generated story validator", () => {
  it("passes the full validation matrix for supported languages", () => {
    for (const language of ["en", "es", "de", "pt", "fr"] as const) {
      const terms = languageTerms(language);
      const profile = getLanguageProfile(language);
      const storyIr = buildStoryIr(language);
      const narration = [
        padToWordRange(
          `${terms.chronology[0]}. ${terms.threat}. ${terms.rule}. ${terms.fact}.`,
          28,
          terms.localeFiller
        ),
        padToWordRange(
          `${terms.chronology[1]}. ${terms.chronology[2]}. ${terms.climax}. ${terms.ending}.`,
          38,
          terms.localeFiller
        ),
      ];
      const result = validateFullNarrationArtifact({
        language,
        profile,
        storyIr,
        characterRenameMap: buildRenameMap("Morgan Reed"),
        outputConstraints: {
          variant: "full",
          targetWordRange: { min: 60, max: 220 },
          targetNarrationWpm: profile.fullNarrationWpm,
          targetDuration: { minSeconds: 20, maxSeconds: 120 },
        },
        narrationParagraphs: narration,
      });
      if (result.status !== "passed") {
        throw new Error(`${language}: ${result.messages.join(" | ")}`);
      }
    }
  });

  it("passes the short validation matrix for supported languages", () => {
    for (const language of ["en", "es", "de", "pt", "fr"] as const) {
      const terms = languageTerms(language);
      const contract = buildShortContract(language);
      const parent = buildShortParent(language);
      const profile = getLanguageProfile(language);
      const narration = padToWordRange(
        `${terms.shortOpen} ${terms.rule}. ${terms.fact}. ${terms.climax}. ${terms.ending}.`,
        minimumPassingShortWords(language),
        terms.localeFiller
      );
      const result = validateShortNarrationArtifact({
        language,
        profile,
        narration,
        parent: {
          ...parent,
          validated: true,
        },
        adaptationContract: contract,
        outputConstraints: buildShortConstraints(language),
        characterRenameMap: parent.characterRenameMap,
      });
      if (result.status !== "passed") {
        throw new Error(`${language}: ${result.messages.join(" | ")}`);
      }
    }
  });

  it("flags a parent hash mismatch", () => {
    const contract = buildShortContract("en");
    const result = validateShortNarrationArtifact({
      language: "en",
      profile: getLanguageProfile("en"),
      narration: padToWordRange(
        `${languageTerms("en").shortOpen} ${languageTerms("en").rule}. ${languageTerms("en").fact}. ${languageTerms("en").climax}. ${languageTerms("en").ending}.`,
        160,
        languageTerms("en").localeFiller
      ),
      parent: {
        ...buildShortParent("en"),
        validated: true,
        parentFullHash: "z".repeat(64),
      },
      adaptationContract: contract,
      outputConstraints: buildShortConstraints("en"),
    });
    expect(result.issues.map((entry) => entry.code)).toContain(
      GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_PARENT_HASH_MISMATCH
    );
  });

  it("flags a late hook", () => {
    const terms = languageTerms("en");
    const narration = padToWordRange(
      `Static rain covered the porch while the boards groaned, the rain kept falling, the windows stayed black, and the hallway remained silent until much later. ${terms.shortOpen} ${terms.rule}. ${terms.fact}. ${terms.climax}. ${terms.ending}.`,
      minimumPassingShortWords("en"),
      terms.localeFiller
    );
    const result = validateShortNarrationArtifact({
      language: "en",
      profile: getLanguageProfile("en"),
      narration,
      parent: { ...buildShortParent("en"), validated: true },
      adaptationContract: buildShortContract("en"),
      outputConstraints: buildShortConstraints("en"),
    });
    expect(result.issues.map((entry) => entry.code)).toContain(
      GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_HOOK_TOO_LATE
    );
  });

  it("flags missing central threat, rule, climax, and final consequence", () => {
    const result = validateShortNarrationArtifact({
      language: "en",
      profile: getLanguageProfile("en"),
      narration: padToWordRange(
        "Lena reached the stairs and stared at the wet mirror while the hallway darkened around her.",
        160,
        languageTerms("en").localeFiller
      ),
      parent: { ...buildShortParent("en"), validated: true },
      adaptationContract: buildShortContract("en"),
      outputConstraints: buildShortConstraints("en"),
    });
    const codes = result.issues.map((entry) => entry.code);
    expect(codes).toContain(
      GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_MISSING_CENTRAL_THREAT
    );
    expect(codes).toContain(
      GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_MISSING_CENTRAL_RULE
    );
    expect(codes).toContain(
      GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_MISSING_CLIMAX
    );
    expect(codes).toContain(
      GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_MISSING_FINAL_CONSEQUENCE
    );
  });

  it("flags contradiction with the full story", () => {
    const terms = languageTerms("en");
    const narration = padToWordRange(
      `${terms.shortOpen} ${terms.rule}. HUMANS CAN LICK TOO stayed on the mirror. Lena never heard the attic door opened and Lena was not called by name. Lena never fled into the rain and left the house unlocked.`,
      160,
      terms.localeFiller
    );
    const result = validateShortNarrationArtifact({
      language: "en",
      profile: getLanguageProfile("en"),
      narration,
      parent: { ...buildShortParent("en"), validated: true },
      adaptationContract: buildShortContract("en"),
      outputConstraints: buildShortConstraints("en"),
    });
    expect(result.issues.map((entry) => entry.code)).toContain(
      GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_CONTRADICTS_FULL_STORY
    );
  });

  it("flags orphaned references and synopsis-like language", () => {
    const contract = buildShortContract("en");
    const withOrphan = {
      ...contract,
      sourceExtraction: {
        ...contract.sourceExtraction,
        orphanedReferences: [
          {
            reference: "brother",
            introducedByBeatId: "b01",
            firstRetainedBeatId: "b02",
          },
        ],
      },
    };
    const narration = padToWordRange(
      "This story follows Lena as the protagonist explains the threat to her brother before the ending arrives.",
      160,
      languageTerms("en").localeFiller
    );
    const result = validateShortNarrationArtifact({
      language: "en",
      profile: getLanguageProfile("en"),
      narration,
      parent: { ...buildShortParent("en"), validated: true },
      adaptationContract: withOrphan,
      outputConstraints: buildShortConstraints("en"),
    });
    const codes = result.issues.map((entry) => entry.code);
    expect(codes).toContain(
      GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_ORPHANED_REFERENCE
    );
    expect(codes).toContain(
      GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_READS_AS_SYNOPSIS
    );
  });

  it("flags routing mistakes for full and short variants", () => {
    const fullResult = validateFullNarrationArtifact({
      language: "en",
      profile: getLanguageProfile("en"),
      storyIr: buildStoryIr("en"),
      outputConstraints: {
        variant: "full",
        targetWordRange: { min: 60, max: 220 },
        targetNarrationWpm: 178,
      },
      narrationParagraphs: [
        padToWordRange(
          `${languageTerms("en").chronology[0]}. ${languageTerms("en").fact}. ${languageTerms("en").climax}. ${languageTerms("en").ending}.`,
          70,
          languageTerms("en").localeFiller
        ),
      ],
      generatorVariant: "short",
    });
    expect(fullResult.issues.map((entry) => entry.code)).toContain(
      GENERATED_STORY_VALIDATION_ISSUE_CODES.FULL_STORY_ROUTED_TO_SHORT_GENERATOR
    );

    const shortResult = validateShortNarrationArtifact({
      language: "en",
      profile: getLanguageProfile("en"),
      narration: padToWordRange(
        `${languageTerms("en").shortOpen} ${languageTerms("en").rule}. ${languageTerms("en").fact}. ${languageTerms("en").climax}. ${languageTerms("en").ending}.`,
        160,
        languageTerms("en").localeFiller
      ),
      parent: { ...buildShortParent("en"), validated: true },
      adaptationContract: buildShortContract("en"),
      outputConstraints: buildShortConstraints("en"),
      generatorVariant: "full",
    });
    expect(shortResult.issues.map((entry) => entry.code)).toContain(
      GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_STORY_ROUTED_TO_FULL_REGENERATION
    );
  });

  it("keeps full validation free of short-only rules", () => {
    const result = validateFullNarrationArtifact({
      language: "en",
      profile: getLanguageProfile("en"),
      storyIr: buildStoryIr("en"),
      outputConstraints: {
        variant: "full",
        targetWordRange: { min: 60, max: 220 },
        targetNarrationWpm: 178,
      },
      narrationParagraphs: [
        padToWordRange(
          `${languageTerms("en").chronology[0]}. ${languageTerms("en").fact}. ${languageTerms("en").climax}. ${languageTerms("en").ending}.`,
          70,
          languageTerms("en").localeFiller
        ),
      ],
    });
    expect(
      result.issues.every((entry) => !entry.code.startsWith("SHORT_"))
    ).toBe(true);
  });

  it("preserves compatibility string formatting", () => {
    const result = validateShortNarrationArtifact({
      language: "en",
      profile: getLanguageProfile("en"),
      narration: "Too short.",
      parent: { ...buildShortParent("en"), validated: true },
      adaptationContract: buildShortContract("en"),
      outputConstraints: buildShortConstraints("en"),
      characterRenameMap: buildShortParent("en").characterRenameMap,
    });
    expect(
      formatValidationIssues(result.issues).some((message) =>
        message.startsWith("Narration word count 2 is outside the allowed short range")
      )
    ).toBe(true);
  });

  it("accepts fictionalized character names when a rename map is supplied", () => {
    const facts: CanonicalStoryFacts = {
      episodeNumber: "021",
      primaryTitle: "Something at the Window",
      characters: [{ name: "Paul Mercer", role: "main protagonist" }],
      setting: "remote farmhouse",
      criticalObjects: [],
      criticalEvents: ["Paul Mercer heard tapping at the bedroom window."],
      writtenMessages: [],
      threat: "A pale figure tapped on the bedroom window.",
      primaryReveal:
        "Behind him, something pale was wearing Petra Marlow's expression.",
      finalConsequence:
        "The upstairs window sometimes shows a man tapping from inside.",
    };
    const renameMap: CharacterRenameMap = {
      version: 1,
      episodeId: "021",
      sourceHash: "a".repeat(64),
      poolId: "test-pool",
      hash: "b".repeat(64),
      entries: [
        {
          characterId: "character-1",
          originalName: "Paul Mercer",
          fictionalName: "Petra Marlow",
          originalAliases: ["Paul Mercer", "Paul", "Mercer"],
          fictionalAliases: ["Petra Marlow", "Petra", "Marlow"],
          role: "main protagonist",
        },
      ],
    };
    const issues = validateNarrationOnlyFullRewritePackage(
      {
        language: "en",
        full: {
          narrationParagraphs: [
            "Petra Marlow heard tapping at the bedroom window in the remote farmhouse.",
            "Petra Marlow found the pale figure waiting behind the glass.",
            "Behind him, something pale was wearing Petra Marlow's expression. The upstairs window sometimes shows a man tapping from inside.",
          ],
        },
        preservationChecklist: {
          charactersPreserved: true,
          relationshipsPreserved: true,
          chronologyPreserved: true,
          criticalObjectsPreserved: true,
          cluesPreserved: true,
          writtenMessagesPreserved: true,
          primaryRevealPreserved: true,
          endingPreserved: true,
          noNewPlotElementsAdded: true,
        },
        diagnostics: {
          removedGenericFiller: [],
          adaptationNotes: [],
        },
      },
      facts,
      getLanguageProfile("en"),
      "en",
      renameMap
    );
    expect(issues).not.toContain("Character names are missing.");
  });
});
