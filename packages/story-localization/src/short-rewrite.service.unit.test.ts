import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { countSpokenWords } from "@mediaforge/shared";
import { rewriteShortStories } from "./short-rewrite.service.js";
import {
  FULL_STORY_PROVENANCE_MARKER,
  SHORT_REWRITE_PROMPT_VERSION,
} from "./short-rewrite.constants.js";
import { cleanSourceText } from "./source-cleaning.js";
import {
  buildHorrorAffectPlan,
  computeHorrorAffectPlanHash,
} from "./horror-affect-plan.js";
import {
  buildPersistedHorrorAffectPlanArtifact,
  serializePersistedHorrorAffectPlanArtifact,
} from "./horror-affect-plan.persistence.js";
import type { StoryIR } from "./story-artifact-model.js";
import type { CanonicalStoryContract } from "./canonical-story-contract.js";
import type {
  CanonicalStoryBeat,
  StoryMechanicsContract,
} from "./story-mechanics.js";

type MockResponse = {
  readonly id?: string;
  readonly output_text: string;
};

function buildCharacterRenameMapFixture() {
  return {
    version: 1 as const,
    episodeId: "009-the-christmas-doll",
    sourceHash: "a".repeat(64),
    poolId: "character-name-pool-v1",
    entries: [
      {
        characterId: "mara",
        originalName: "Mara",
        fictionalName: "Lena",
        originalAliases: ["Mara"],
        fictionalAliases: ["Lena"],
        role: "main protagonist",
      },
    ],
    hash: "9".repeat(64),
  };
}

function buildNarration(
  wordTarget: number,
  language: "en" | "de" | "es" = "en"
): string {
  const sentences =
    language === "de"
      ? [
          "Lena hörte die Puppe hinter der Dachbodentür atmen.",
          "Als sie die Tür öffnete, saß die Puppe auf dem Kinderstuhl.",
          "Ihre Hände waren nass.",
          "Ihr eigener Name stand im Glas.",
          "Lena riss der Puppe das Kleid herunter.",
          "Sie verbrannte das Kleid im Waschbecken.",
          "Danach verriegelte sie die Truhe.",
          "Für einen Moment wurde das Haus still.",
          "Das letzte Foto auf der Treppe zeigte die Puppe hinter ihrem Bruder.",
        ]
      : language === "es"
        ? [
            "Lena oyó a la muñeca respirar detrás de la puerta del ático.",
            "Cuando abrió la puerta, la muñeca estaba en la silla del cuarto.",
            "Tenía las manos mojadas.",
            "Su propio nombre estaba marcado en el vidrio.",
            "Lena le arrancó el vestido a la muñeca.",
            "Quemó el vestido en el lavabo.",
            "Después cerró el baúl con llave.",
            "Por un momento la casa quedó en silencio.",
            "La última foto en la escalera mostraba a la muñeca detrás de su hermano.",
          ]
        : [
            "Lena heard the doll breathing under the attic door.",
            "When she opened the door, the doll sat on the nursery chair.",
            "Its hands were wet.",
            "Her own name was scratched across the glass.",
            "Lena tore the dress off the doll.",
            "She burned the dress in the sink.",
            "After that, she locked the trunk.",
            "For a moment, the house went quiet.",
            "The final photograph on the stairs showed the doll behind her brother.",
          ];
  let narration = sentences.join(" ");
  let index = 0;
  const filler =
    language === "de" ? "stille" : language === "es" ? "silencio" : "silent";
  while (countSpokenWords(narration) < wordTarget) {
    narration = `${narration} ${filler}${index}`;
    index += 1;
  }
  return narration;
}

function buildAcceptedEnglishNarration(): string {
  return [
    "The haunted doll moved on its own under Lena's attic door as she heard it breathing.",
    "When she opened the door, the doll sat on the nursery chair.",
    "Its hands were wet; her name was scratched across the glass.",
    "Lena locked it in the trunk; each time, it appeared closer.",
    "To protect her brother, Lena burned the doll's dress and locked the trunk.",
    "The final photograph on the stairs showed the doll behind her brother.",
  ].join(" ");
}

function makeMockClient(responses: readonly MockResponse[] = []) {
  const queue = [...responses];
  const responseFn = vi.fn(async () => {
    const next = queue.shift();
    if (!next) {
      throw new Error("No mock response available.");
    }
    return {
      id: next.id ?? "mock-response",
      output_text: next.output_text,
      output_parsed: JSON.parse(next.output_text),
      usage: {
        input_tokens: 120,
        output_tokens: 80,
        total_tokens: 200,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 5 },
      },
    };
  });
  return {
    responses: {
      create: responseFn,
      parse: responseFn,
    },
  };
}

function makeRawResponseClient(responses: readonly unknown[]) {
  const queue = [...responses];
  const responseFn = vi.fn(async () => {
    const next = queue.shift();
    if (!next) {
      throw new Error("No mock raw response available.");
    }
    return next;
  });
  return {
    responses: {
      create: responseFn,
      parse: responseFn,
    },
  };
}

function buildResponseJson(args: {
  readonly title: string;
  readonly wordCount: number;
  readonly thumbnailText: string;
  readonly fullVideoBridge: string;
  readonly narration?: string;
  readonly language?: "en" | "de" | "es";
}): string {
  const narration =
    args.narration ?? buildNarration(args.wordCount, args.language ?? "en");
  return JSON.stringify({ narration }, null, 2);
}

async function createCanonicalEnglishShortParent(
  tempRoot: string
): Promise<void> {
  const shortDir = path.join(tempRoot, "009-the-christmas-doll", "en", "short");
  const narration = buildNarration(72, "en");
  const parentFullHash = "3".repeat(64);
  const sourceSha256 = "a".repeat(64);
  const storyIrHash = "c".repeat(64);
  const extractionHash = "4".repeat(64);
  const contractHash = "5".repeat(64);
  const parent = {
    episodeId: "009-the-christmas-doll",
    episodeSlug: "009-the-christmas-doll",
    language: "en",
    locale: "en-US",
    variant: "full",
    parentFullHash,
    sourceSha256,
  } as const;
  const sourceExtraction = {
    version: "short-source-extraction-v1",
    parentFullHash,
    storyIrHash,
    locale: "en-US",
    targetVariant: "short",
    maximumBeats: 8,
    selectedBeatIds: [],
    removedBeatIds: [],
    beats: [],
    orphanedReferences: [],
    extractionHash,
  } as const;
  await fs.mkdir(shortDir, { recursive: true });
  await fs.writeFile(
    path.join(shortDir, "009-the-christmas-doll-en-short.md"),
    `# The Christmas Doll\n\n# Narration Script\n\n${narration}\n`,
    "utf8"
  );
  await fs.writeFile(
    path.join(shortDir, "009-the-christmas-doll-en-short.json"),
    JSON.stringify(
      {
        schemaVersion: 2,
        episodeId: "009-the-christmas-doll",
        episodeSlug: "009-the-christmas-doll",
        sourceLanguage: "en",
        targetLanguage: "en",
        locale: "en-US",
        variant: "short",
        promptVersion: SHORT_REWRITE_PROMPT_VERSION,
        promptFingerprint: "f".repeat(64),
        model: "gpt-5-mini",
        sourcePath: "source/009-the-christmas-doll-en-full.md",
        sourceSha256,
        parent,
        storyIrHash,
        shortSourceExtraction: sourceExtraction,
        shortAdaptationContract: {
          schemaVersion: "short-adaptation-contract-schema-v1",
          contractVersion: "short-adaptation-contract-v1",
          identity: {
            episodeId: "009-the-christmas-doll",
            episodeSlug: "009-the-christmas-doll",
            language: "en",
            locale: "en-US",
            variant: "short",
          },
          parent,
          storyIrHash,
          immutableFacts: [],
          centralThreat: "The doll moves through the house.",
          centralRuleOrMechanism: "The doll appears after it is locked away.",
          criticalObject: "The doll",
          climaxOrIrreversibleTurn: "Lena burns the doll's dress.",
          finalConsequenceOrSting:
            "The final photograph shows the doll behind her brother.",
          exactWrittenMessages: [],
          allowedCompression: [],
          forbiddenOmissions: [],
          retentionBoundaries: {
            factsMustRemain: [],
            detailsMayCompress: [],
            detailsMayRemove: [],
            dialogueMayShorten: [],
          },
          inventionBoundaries: [],
          constraints: {
            targetDurationSeconds: { min: 28, max: 33 },
            targetNarrationWpm: 144,
            targetWordRange: { min: 65, max: 80 },
            hookDeadlineSeconds: 3,
            maximumBeats: 8,
          },
          sourceExtraction: {
            extractionHash,
            selectedBeatIds: [],
            orphanedReferences: [],
          },
          contractHash,
        },
        canonical: true,
        generatedAt: new Date().toISOString(),
        generation: {
          title: "The Christmas Doll",
          hook: "Lena heard the doll breathing under the attic door.",
          narration,
          wordCount: 72,
          estimatedDurationSecondsAt175Wpm: 25,
          estimatedDurationSecondsAt180Wpm: 24,
          thumbnailText: "Wet Hands",
          fullVideoBridge: "Watch the full episode.",
        },
        usage: {},
        validation: {
          preferredWordRangeSatisfied: true,
          hardWordRangeSatisfied: true,
          hookMatchesNarration: true,
          thumbnailWordCount: 2,
          warnings: [],
        },
      },
      null,
      2
    ),
    "utf8"
  );
}

async function createSourceStory(
  tempRoot: string,
  includeCanonicalEnglishShort = true
): Promise<string> {
  const episodeDir = path.join(tempRoot, "009-the-christmas-doll", "source");
  await fs.mkdir(episodeDir, { recursive: true });
  const sourcePath = path.join(episodeDir, "009-the-christmas-doll-en-full.md");
  const content = [
    "# Episode 009 — The Christmas Doll",
    FULL_STORY_PROVENANCE_MARKER,
    "",
    "## Audio Generation Instructions",
    "- Use a steady narrator.",
    "",
    "## Narration Script",
    "Mara heard the doll breathing under the attic door.",
    "When she opened the door, the doll sat on the nursery chair.",
    "Its hands were wet.",
    "Her own name was scratched across the glass.",
    "Mara tore the dress off the doll.",
    "She burned the dress in the sink.",
    "After that, she locked the trunk.",
    "For a moment, the house went quiet.",
    "The final photograph on the stairs showed the doll behind her brother.",
  ].join("\n");
  await fs.writeFile(sourcePath, content, "utf8");
  const episodeRoot = path.join(tempRoot, "009-the-christmas-doll");
  await fs.mkdir(path.join(episodeRoot, "en", "full"), { recursive: true });
  await fs.writeFile(
    path.join(episodeRoot, "en", "full", "script.md"),
    content,
    "utf8"
  );
  await fs.writeFile(
    path.join(episodeRoot, "en", "full", "canonical-full.json"),
    JSON.stringify(
      {
        schemaVersion: "canonical-english-full-artifact-v1",
        episodeNumber: "009",
        episodeSlug: "009-the-christmas-doll",
        language: "en",
        locale: "en-US",
        variant: "full",
        sourceFile: sourcePath,
        lineage: {
          sourceHash: "a".repeat(64),
          cleanedSourceHash: "b".repeat(64),
          storyIrHash: "c".repeat(64),
          contractHash: "d".repeat(64),
          contractBuildFingerprint: "e".repeat(64),
          characterRenameMapHash: "9".repeat(64),
        },
        prompt: {
          compilerVersion: "story-prompt-compiler-v1",
          promptVersion: SHORT_REWRITE_PROMPT_VERSION,
          promptFingerprint: "f".repeat(64),
          selectedModules: [],
        },
        model: {
          name: "gpt-5-mini",
          reasoningEffort: "low",
          maxOutputTokens: 2000,
        },
        responseSchema: {
          name: "full_narration_story_package",
          version: "full-narration-response-schema-v1",
          fingerprint: "1".repeat(64),
        },
        preflight: {
          policyVersion: "story-preflight-v1",
          requestFingerprint: "2".repeat(64),
          status: "allowed",
          requestedOutputTokens: 2000,
          contextWindowTokens: 400000,
          maxModelOutputTokens: 128000,
          safetyMarginTokens: 4096,
        },
        characterRenameMap: buildCharacterRenameMapFixture(),
        response: {
          language: "en",
          full: {
            narrationParagraphs: [
              "Mara heard the doll breathing under the attic door.",
              "When she opened the door, the doll sat on the nursery chair.",
              "Its hands were wet.",
              "Her own name was scratched across the glass.",
              "Mara tore the dress off the doll.",
              "She burned the dress in the sink.",
              "After that, she locked the trunk.",
              "For a moment, the house went quiet.",
              "The final photograph on the stairs showed the doll behind her brother.",
            ],
          },
          targetNarrationWpm: 178,
          preservedBeatIds: null,
          mechanics: null,
          localizedMetadata: null,
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
        validation: {
          status: "passed",
          issues: [],
        },
        repairHistory: [],
        usage: {
          inputTokens: 100,
          outputTokens: 100,
        },
        estimatedCostUsd: 0.01,
        status: "completed",
        generatedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf8"
  );
  await createLocalizedFullParent(tempRoot, "de");
  await createLocalizedFullParent(tempRoot, "es");
  await createLocalizedFullParent(tempRoot, "fr");
  await createLocalizedFullParent(tempRoot, "pt");
  if (includeCanonicalEnglishShort) {
    await createCanonicalEnglishShortParent(tempRoot);
  }
  return sourcePath;
}

async function createHorrorAffectPlanArtifact(
  tempRoot: string,
  questionSuffix = ""
): Promise<void> {
  const storyIr = {
    genre: "fictional-supernatural",
    fictionality: "fiction",
    centralThreat: { description: "a doll that moves when locked away" },
    centralRuleMechanism: {
      description: "Locking the doll away makes it appear closer.",
    },
    criticalObjects: [{ name: "the doll" }],
    writtenMessages: [],
    immutableFacts: [],
    chronology: [],
    climax: "Lena burned the doll's dress and locked the trunk.",
    endingConsequence:
      "The final photograph on the stairs shows the doll behind her brother.",
  } as unknown as StoryIR;
  const mechanics = {
    centralThreat: "a doll that moves when locked away",
    failedResponses: [
      {
        action: "Lena locks the doll in the trunk.",
        failure: "The doll appears on the nursery chair.",
        informationRevealed: "Locking the doll away makes it appear closer.",
      },
    ],
    ruleEvidence: ["Locking the doll away makes it appear closer."],
    protagonistGoal: "Keep the doll away from Lena's brother.",
    emotionalStake: "Lena must protect her brother.",
    emotionalCost: "Lena burned the doll's dress to protect her brother.",
    climaxAction: "Lena burned the doll's dress and locked the trunk.",
    finalConsequence:
      "The final photograph on the stairs shows the doll behind her brother.",
  } as unknown as StoryMechanicsContract;
  const beats = [
    {
      id: "beat-001",
      type: "HOOK",
      summary: "Lena hears the doll breathing under the attic door.",
      requiredFacts: ["the doll"],
      requiredCharacters: ["Lena"],
      mechanicsReferences: [],
    },
    {
      id: "beat-002",
      type: "RULE_DISCOVERY",
      summary:
        "Lena locks the doll away and sees it appear closer on the nursery chair.",
      requiredFacts: ["the doll"],
      requiredCharacters: ["Lena"],
      mechanicsReferences: ["Locking the doll away makes it appear closer."],
    },
    {
      id: "beat-003",
      type: "FAILED_RESPONSE",
      summary:
        "Lena locks the doll in the trunk, but it appears on the nursery chair.",
      requiredFacts: ["the doll", "trunk"],
      requiredCharacters: ["Lena"],
      mechanicsReferences: [],
    },
    {
      id: "beat-004",
      type: "CLIMAX",
      summary: "Lena burned the doll's dress and locked the trunk.",
      requiredFacts: ["dress", "trunk"],
      requiredCharacters: ["Lena"],
      mechanicsReferences: ["Locking the doll away makes it appear closer."],
    },
    {
      id: "beat-005",
      type: "FINAL_REVERSAL",
      summary:
        "The trunk stays shut, but the final photograph shows the doll behind Lena's brother.",
      requiredFacts: ["photograph"],
      requiredCharacters: ["Lena"],
      mechanicsReferences: [],
    },
  ] satisfies readonly CanonicalStoryBeat[];
  const canonicalContract = {
    characters: [{ name: "Lena" }],
    locations: [{ name: "the attic" }],
    protagonistGoal: mechanics.protagonistGoal,
    finalConsequence: mechanics.finalConsequence,
  } as unknown as CanonicalStoryContract;
  const plan = buildHorrorAffectPlan({
    storyIr,
    canonicalContract,
    mechanics,
    beats,
  });
  const adjustedPlan =
    questionSuffix.length > 0
      ? {
          ...plan,
          primaryAudiencePromise: `${plan.primaryAudiencePromise} ${questionSuffix}`,
        }
      : plan;
  const persistedPlan =
    questionSuffix.length > 0
      ? {
          ...adjustedPlan,
          planHash: computeHorrorAffectPlanHash(
            Object.fromEntries(
              Object.entries(adjustedPlan).filter(([key]) => key !== "planHash")
            ) as Parameters<typeof computeHorrorAffectPlanHash>[0]
          ),
        }
      : plan;
  const artifact = buildPersistedHorrorAffectPlanArtifact({
    episodeNumber: "009",
    episodeSlug: "009-the-christmas-doll",
    sourceHash: "a".repeat(64),
    storyIrHash: persistedPlan.parents.storyIrHash,
    rolloutMode: "shadow",
    eligibility: {
      eligible: true,
      reason: "canonical-english-fiction",
    },
    plan: persistedPlan,
  });
  await fs.writeFile(
    path.join(
      tempRoot,
      "009-the-christmas-doll",
      "en",
      "full",
      "horror-affect-plan.json"
    ),
    serializePersistedHorrorAffectPlanArtifact(artifact),
    "utf8"
  );
}

async function createMinimalSourceStory(tempRoot: string): Promise<string> {
  const episodeDir = path.join(tempRoot, "010-short-source", "source");
  await fs.mkdir(episodeDir, { recursive: true });
  const sourcePath = path.join(episodeDir, "010-short-source-en-full.md");
  const content = [
    "# Episode 010 — Short Source",
    FULL_STORY_PROVENANCE_MARKER,
    "",
    "## Narration Script",
    "A white hat moved above the wall.",
    "Later, Clara heard three low syllables beneath the caller's voice.",
  ].join("\n");
  await fs.writeFile(sourcePath, content, "utf8");
  const episodeRoot = path.join(tempRoot, "010-short-source");
  await fs.mkdir(path.join(episodeRoot, "en", "full"), { recursive: true });
  await fs.writeFile(
    path.join(episodeRoot, "en", "full", "script.md"),
    content,
    "utf8"
  );
  await fs.writeFile(
    path.join(episodeRoot, "en", "full", "canonical-full.json"),
    JSON.stringify(
      {
        schemaVersion: "canonical-english-full-artifact-v1",
        episodeNumber: "010",
        episodeSlug: "010-short-source",
        language: "en",
        locale: "en-US",
        variant: "full",
        sourceFile: sourcePath,
        lineage: {
          sourceHash: "a".repeat(64),
          cleanedSourceHash: "b".repeat(64),
          storyIrHash: "c".repeat(64),
          contractHash: "d".repeat(64),
          contractBuildFingerprint: "e".repeat(64),
          characterRenameMapHash: "9".repeat(64),
        },
        prompt: {
          compilerVersion: "story-prompt-compiler-v1",
          promptVersion: SHORT_REWRITE_PROMPT_VERSION,
          promptFingerprint: "f".repeat(64),
          selectedModules: [],
        },
        model: {
          name: "gpt-5-mini",
          reasoningEffort: "low",
          maxOutputTokens: 2000,
        },
        responseSchema: {
          name: "full_narration_story_package",
          version: "full-narration-response-schema-v1",
          fingerprint: "1".repeat(64),
        },
        preflight: {
          policyVersion: "story-preflight-v1",
          requestFingerprint: "2".repeat(64),
          status: "allowed",
          requestedOutputTokens: 2000,
          contextWindowTokens: 400000,
          maxModelOutputTokens: 128000,
          safetyMarginTokens: 4096,
        },
        characterRenameMap: buildCharacterRenameMapFixture(),
        response: {
          language: "en",
          full: {
            narrationParagraphs: [
              "A white hat moved above the wall.",
              "Later, Clara heard three low syllables beneath the caller's voice.",
            ],
          },
          targetNarrationWpm: 178,
          preservedBeatIds: null,
          mechanics: null,
          localizedMetadata: null,
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
        validation: {
          status: "passed",
          issues: [],
        },
        repairHistory: [],
        usage: {
          inputTokens: 100,
          outputTokens: 100,
        },
        estimatedCostUsd: 0.01,
        status: "completed",
        generatedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf8"
  );
  return sourcePath;
}

async function createLocalizedFullParent(
  tempRoot: string,
  language: "de" | "es" | "fr" | "pt",
  resultLanguage: "de" | "es" | "fr" | "pt" = language
): Promise<void> {
  const productionDir = path.join(
    tempRoot,
    "009-the-christmas-doll",
    ".localization-cache",
    "production",
    "009",
    "009-the-christmas-doll"
  );
  await fs.mkdir(productionDir, { recursive: true });
  await fs.writeFile(
    path.join(productionDir, `${language}-full-narration-result.json`),
    JSON.stringify(
      {
        schemaVersion: "full-narration-response-schema-v1",
        sourceFormat: "narration-only",
        deprecationDiagnostics: [],
        promptFingerprint: "9".repeat(64),
        responseSchemaName: "full_narration_story_package",
        responseSchemaVersion: "full-narration-response-schema-v1",
        responseSchemaFingerprint: "8".repeat(64),
        lineage: {
          kind: "canonical-english-full",
          fingerprint: "7".repeat(64),
          sourceHash: "6".repeat(64),
          language: "en",
          locale: "en-US",
          variant: "full",
          storyIrHash: "c".repeat(64),
          contractHash: "d".repeat(64),
          contractBuildFingerprint: "e".repeat(64),
        },
        validationIssues: [],
        result: {
          language: resultLanguage,
          full: {
            narrationParagraphs: [
              "Mara horte die Puppe unter der Dachbodentur atmen.",
              "Als sie die Tür öffnete, saß die Puppe auf dem Kinderstuhl.",
              "Ihre Hände waren nass.",
              "Ihr eigener Name stand im Glas.",
              "Mara riss der Puppe das Kleid herunter.",
              "Sie verbrannte das Kleid im Waschbecken.",
              "Danach verriegelte sie die Truhe.",
              "Für einen Moment wurde das Haus still.",
              "Das letzte Foto auf der Treppe zeigte die Puppe hinter ihrem Bruder.",
            ],
          },
          targetNarrationWpm: 178,
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
      },
      null,
      2
    ),
    "utf8"
  );
}

async function createRawCompatibilitySource(tempRoot: string): Promise<string> {
  const sourceDir = path.join(tempRoot, "incoming");
  await fs.mkdir(sourceDir, { recursive: true });
  const sourcePath = path.join(sourceDir, "009-the-christmas-doll-en-full.md");
  await fs.writeFile(
    sourcePath,
    [
      "# Episode 009 — The Christmas Doll",
      "",
      "## Narration Script",
      "Mara heard the doll breathing under the attic door.",
      "When she opened the door, the doll sat on the nursery chair.",
      "Its hands were wet.",
      "Her own name was scratched across the glass.",
      "Mara tore the dress off the doll.",
      "She burned the dress in the sink.",
      "After that, she locked the trunk.",
      "For a moment, the house went quiet.",
      "The final photograph on the stairs showed the doll behind her brother.",
    ].join("\n"),
    "utf8"
  );
  return sourcePath;
}

async function rewriteTestShortStories(
  options: Parameters<typeof rewriteShortStories>[0],
  services?: Parameters<typeof rewriteShortStories>[1]
) {
  return rewriteShortStories(
    {
      targetDurationSeconds: 30,
      ...options,
    },
    services
  );
}

describe("short rewrite service", () => {
  it("finishes the English short prerequisite before starting localized shorts", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "short-rewrite-parent-order-")
    );
    const sourcePath = await createSourceStory(tempRoot, false);
    const client = makeMockClient([
      {
        id: "resp-en",
        output_text: buildResponseJson({
          title: "The Doll House",
          wordCount: 66,
          thumbnailText: "Wet Hands",
          fullVideoBridge: "Watch the full episode.",
          language: "en",
        }),
      },
      {
        id: "resp-de",
        output_text: buildResponseJson({
          title: "Das Puppenhaus",
          wordCount: 66,
          thumbnailText: "Nasse Hände",
          fullVideoBridge: "Sieh dir die ganze Episode an.",
          language: "de",
        }),
      },
    ]);

    await expect(
      rewriteTestShortStories(
        {
          inputPath: sourcePath,
          outputRoot: tempRoot,
          languages: ["de", "en"],
          model: "gpt-5-mini",
          dryRun: false,
          resume: false,
          overwrite: false,
          maxRetries: 0,
          maxConcurrency: 2,
        },
        { client }
      )
    ).rejects.toThrow("English short prerequisite failed");

    expect(client.responses.create).toHaveBeenCalledTimes(2);
    await expect(
      fs.access(
        path.join(
          tempRoot,
          "009-the-christmas-doll",
          "debug",
          "stories-rewrite-short-de.request.json"
        )
      )
    ).rejects.toThrow();
  });

  it("writes localized markdown and JSON for a successful generation", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "short-rewrite-success-")
    );
    const sourcePath = await createSourceStory(tempRoot);
    const client = makeMockClient([
      {
        id: "resp-success",
        output_text: buildResponseJson({
          title: "Das Puppenhaus",
          wordCount: 60,
          thumbnailText: "Nasse Hände",
          fullVideoBridge: "Sieh dir die ganze Episode an.",
          language: "de",
        }),
      },
    ]);

    const summary = await rewriteTestShortStories(
      {
        inputPath: sourcePath,
        outputRoot: tempRoot,
        languages: ["de"],
        model: "gpt-5-mini",
        dryRun: false,
        resume: false,
        overwrite: false,
        maxRetries: 0,
      },
      {
        client,
      }
    );
    expect(summary.completed).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.skipped).toBe(0);
    expect(client.responses.create).toHaveBeenCalledTimes(1);
    expect(summary.artifacts[0]?.status).toBe("completed");
    const markdownPath = path.join(
      tempRoot,
      "009-the-christmas-doll",
      "de",
      "short",
      "009-the-christmas-doll-de-short.md"
    );
    const jsonPath = path.join(
      tempRoot,
      "009-the-christmas-doll",
      "de",
      "short",
      "009-the-christmas-doll-de-short.json"
    );
    expect(await fs.readFile(markdownPath, "utf8")).toContain(
      "# Narration Script"
    );
    const sidecar = JSON.parse(await fs.readFile(jsonPath, "utf8")) as {
      readonly generation: { readonly wordCount: number };
    };
    expect(sidecar.generation.wordCount).toBe(66);
  });

  it("repairs a narration that exceeds the hard word limit", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "short-rewrite-repair-")
    );
    const sourcePath = await createSourceStory(tempRoot);
    const client = makeMockClient([
      {
        id: "resp-initial",
        output_text: buildResponseJson({
          title: "Das Puppenhaus",
          wordCount: 80,
          thumbnailText: "Nasse Hände",
          fullVideoBridge: "Sieh dir die ganze Episode an.",
          language: "de",
        }),
      },
      {
        id: "resp-repair",
        output_text: buildResponseJson({
          title: "Das Puppenhaus",
          wordCount: 66,
          thumbnailText: "Nasse Hände",
          fullVideoBridge: "Sieh dir die ganze Episode an.",
          language: "de",
        }),
      },
    ]);

    const summary = await rewriteTestShortStories(
      {
        inputPath: sourcePath,
        outputRoot: tempRoot,
        languages: ["de"],
        model: "gpt-5-mini",
        dryRun: false,
        resume: false,
        overwrite: false,
        maxRetries: 0,
      },
      {
        client,
      }
    );

    expect(summary.completed).toBe(1);
    expect(client.responses.create).toHaveBeenCalledTimes(2);
    const jsonPath = path.join(
      tempRoot,
      "009-the-christmas-doll",
      "de",
      "short",
      "009-the-christmas-doll-de-short.json"
    );
    const sidecar = JSON.parse(await fs.readFile(jsonPath, "utf8")) as {
      readonly generation: { readonly wordCount: number };
    };
    expect(sidecar.generation.wordCount).toBe(66);
  });

  it("repairs a narration that contains editorial commentary", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "short-rewrite-editorial-")
    );
    const sourcePath = await createSourceStory(tempRoot);
    const editorialNarration = buildNarration(126, "de").replace(
      "Als sie öffnete, saß die Puppe mit nassen Händen auf dem Kinderstuhl",
      "Als sie öffnete, die Gefahr wurde persönlich und die Puppe saß mit nassen Händen auf dem Kinderstuhl"
    );
    const client = makeMockClient([
      {
        id: "resp-initial",
        output_text: buildResponseJson({
          title: "Das Puppenhaus",
          wordCount: 66,
          thumbnailText: "Nasse Hände",
          fullVideoBridge: "Sieh dir die ganze Episode an.",
          narration: editorialNarration,
          language: "de",
        }),
      },
      {
        id: "resp-repair",
        output_text: buildResponseJson({
          title: "Das Puppenhaus",
          wordCount: 66,
          thumbnailText: "Nasse Hände",
          fullVideoBridge: "Sieh dir die ganze Episode an.",
          language: "de",
        }),
      },
    ]);

    const summary = await rewriteTestShortStories(
      {
        inputPath: sourcePath,
        outputRoot: tempRoot,
        languages: ["de"],
        model: "gpt-5-mini",
        dryRun: false,
        resume: false,
        overwrite: false,
        maxRetries: 0,
      },
      {
        client,
      }
    );

    expect(summary.completed).toBe(1);
    expect(client.responses.create).toHaveBeenCalledTimes(2);
  });

  it("does not call OpenAI during dry-run", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "short-rewrite-dry-run-")
    );
    const sourcePath = await createSourceStory(tempRoot);
    const client = makeMockClient();

    const summary = await rewriteTestShortStories(
      {
        inputPath: sourcePath,
        outputRoot: tempRoot,
        languages: ["de"],
        model: "gpt-5-mini",
        dryRun: true,
        resume: false,
        overwrite: false,
      },
      {
        client,
      }
    );

    expect(summary.dryRun).toBe(true);
    expect(summary.skipped).toBe(1);
    expect(client.responses.create).not.toHaveBeenCalled();
    const debugDir = path.join(
      tempRoot,
      "009-the-christmas-doll",
      "debug",
      "openai-calls"
    );
    const logFiles = await fs.readdir(debugDir);
    expect(logFiles).toHaveLength(1);
    const log = JSON.parse(
      await fs.readFile(path.join(debugDir, logFiles[0] ?? ""), "utf8")
    ) as {
      readonly mode: string;
      readonly paidProviderCalled: boolean;
      readonly request: {
        readonly input: Array<{
          readonly role: string;
          readonly content: Array<{ readonly text: string }>;
        }>;
      };
    };
    expect(log.mode).toBe("dry-run");
    expect(log.paidProviderCalled).toBe(false);
    expect(log.request.input[0]?.content[0]?.text).toContain("short");
    expect(log.request.input[1]?.content[0]?.text).toContain("Lena");
  });

  it("materializes the canonical source before generating when compatibility mode is enabled", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "short-rewrite-compat-source-")
    );
    const rawSource = await createRawCompatibilitySource(tempRoot);
    const client = makeMockClient([
      {
        id: "resp-compatibility",
        output_text: buildResponseJson({
          title: "Das Puppenhaus",
          wordCount: 66,
          thumbnailText: "Nasse Hände",
          fullVideoBridge: "Sieh dir die ganze Episode an.",
          language: "de",
        }),
      },
      {
        id: "resp-compatibility-repair",
        output_text: buildResponseJson({
          title: "Das Puppenhaus",
          wordCount: 66,
          thumbnailText: "Nasse Hände",
          fullVideoBridge: "Sieh dir die ganze Episode an.",
          language: "de",
        }),
      },
    ]);

    const summary = await rewriteTestShortStories(
      {
        inputPath: rawSource,
        outputRoot: tempRoot,
        episodeSlug: "the-christmas-doll",
        languages: ["de"],
        model: "gpt-5-mini",
        dryRun: false,
        resume: false,
        overwrite: false,
        maxRetries: 0,
        allowSourceInput: true,
      },
      {
        client,
      }
    );

    expect(summary.completed).toBe(1);
    expect(summary.sourcePath).toBe(
      path.join(
        tempRoot,
        "009-the-christmas-doll",
        "source",
        "009-the-christmas-doll-en-full.md"
      )
    );
    expect(
      await fs.readFile(
        path.join(
          tempRoot,
          "009-the-christmas-doll",
          "source",
          "009-the-christmas-doll-en-full.md"
        ),
        "utf8"
      )
    ).toContain("Mara heard the doll breathing under the attic door.");
  });

  it("writes short-story cleaning sidecars without colliding with canonical source sidecars", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "short-rewrite-sidecars-")
    );
    await createSourceStory(tempRoot);
    const episodeRoot = path.join(tempRoot, "009-the-christmas-doll");
    const canonicalSourceDir = path.join(episodeRoot, "source");
    const generatedFullPath = path.join(episodeRoot, "en", "full", "script.md");
    const generatedFullContent = await fs.readFile(generatedFullPath, "utf8");
    const cleanedGeneratedFull = cleanSourceText({
      sourcePath: generatedFullPath,
      text: generatedFullContent,
      sourceRole: "generated-english-full",
      resolvedFrom: "explicit-input",
    }).cleanedText;
    await fs.writeFile(
      path.join(canonicalSourceDir, "009-the-christmas-doll-en-full.md"),
      cleanedGeneratedFull,
      "utf8"
    );
    await fs.writeFile(
      path.join(canonicalSourceDir, "source-cleaned.md"),
      "canonical cleaned source\n",
      "utf8"
    );
    await fs.writeFile(
      path.join(canonicalSourceDir, "source-original.md"),
      "canonical original source\n",
      "utf8"
    );
    await fs.writeFile(
      path.join(canonicalSourceDir, "source-cleaning-report.json"),
      `${JSON.stringify({ preserved: "canonical" }, null, 2)}\n`,
      "utf8"
    );

    const client = makeMockClient([
      {
        id: "resp-sidecars",
        output_text: buildResponseJson({
          title: "Das Puppenhaus",
          wordCount: 66,
          thumbnailText: "Nasse Hände",
          fullVideoBridge: "Sieh dir die ganze Episode an.",
          language: "de",
        }),
      },
    ]);

    const summary = await rewriteTestShortStories(
      {
        inputPath: generatedFullPath,
        outputRoot: tempRoot,
        languages: ["de"],
        model: "gpt-5-mini",
        dryRun: false,
        resume: false,
        overwrite: false,
        maxRetries: 0,
      },
      {
        client,
      }
    );

    expect(summary.completed).toBe(1);
    await expect(
      fs.readFile(path.join(canonicalSourceDir, "source-cleaned.md"), "utf8")
    ).resolves.toBe("canonical cleaned source\n");
    await expect(
      fs.readFile(path.join(canonicalSourceDir, "source-original.md"), "utf8")
    ).resolves.toBe("canonical original source\n");
    await expect(
      fs.readFile(
        path.join(canonicalSourceDir, "source-cleaning-report.json"),
        "utf8"
      )
    ).resolves.toBe(`${JSON.stringify({ preserved: "canonical" }, null, 2)}\n`);
    await expect(
      fs.readFile(
        path.join(canonicalSourceDir, "cleaned-short-story.md"),
        "utf8"
      )
    ).resolves.toContain("Mara heard the doll breathing under the attic door.");
    await expect(
      fs.readFile(
        path.join(canonicalSourceDir, "original-short-story.md"),
        "utf8"
      )
    ).resolves.toContain("# Episode 009");
    await expect(
      fs.readFile(
        path.join(canonicalSourceDir, "short-story-cleaning-report.json"),
        "utf8"
      )
    ).resolves.toContain('"sourceRole": "generated-english-full"');
  });

  it("skips valid artifacts on resume and regenerates stale hashes", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "short-rewrite-resume-")
    );
    const sourcePath = await createSourceStory(tempRoot);
    const initialClient = makeMockClient([
      {
        id: "resp-initial",
        output_text: buildResponseJson({
          title: "Das Puppenhaus",
          wordCount: 66,
          thumbnailText: "Nasse Hände",
          fullVideoBridge: "Sieh dir die ganze Episode an.",
          language: "de",
        }),
      },
    ]);

    const initial = await rewriteTestShortStories(
      {
        inputPath: sourcePath,
        outputRoot: tempRoot,
        languages: ["de"],
        model: "gpt-5-mini",
        dryRun: false,
        resume: false,
        overwrite: false,
        maxRetries: 0,
      },
      {
        client: initialClient,
      }
    );
    expect(initial.completed).toBe(1);

    const jsonPath = path.join(
      tempRoot,
      "009-the-christmas-doll",
      "de",
      "short",
      "009-the-christmas-doll-de-short.json"
    );
    const stale = JSON.parse(await fs.readFile(jsonPath, "utf8")) as Record<
      string,
      unknown
    >;
    stale.sourceSha256 = "0".repeat(64);
    await fs.writeFile(jsonPath, `${JSON.stringify(stale, null, 2)}\n`, "utf8");

    const resumeClient = makeMockClient([
      {
        id: "resp-resume",
        output_text: buildResponseJson({
          title: "Das Puppenhaus",
          wordCount: 66,
          thumbnailText: "Nasse Hände",
          fullVideoBridge: "Sieh dir die ganze Episode an.",
          language: "de",
        }),
      },
      {
        id: "resp-resume-repair",
        output_text: buildResponseJson({
          title: "Das Puppenhaus",
          wordCount: 66,
          thumbnailText: "Nasse Hände",
          fullVideoBridge: "Sieh dir die ganze Episode an.",
          language: "de",
        }),
      },
    ]);
    const regenerated = await rewriteTestShortStories(
      {
        inputPath: sourcePath,
        outputRoot: tempRoot,
        languages: ["de"],
        model: "gpt-5-mini",
        allowSourceInput: true,
        dryRun: false,
        resume: true,
        overwrite: true,
        maxRetries: 0,
      },
      {
        client: resumeClient,
      }
    );
    expect(regenerated.completed).toBe(1);
    expect(regenerated.failed).toBe(0);
  });

  it("keeps completed languages isolated when one request fails", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "short-rewrite-partial-")
    );
    const sourcePath = await createSourceStory(tempRoot);
    const client = {
      responses: {
        create: vi
          .fn()
          .mockResolvedValueOnce({
            id: "resp-success",
            output_text: buildResponseJson({
              title: "Das Puppenhaus",
              wordCount: 66,
              thumbnailText: "Nasse Hände",
              fullVideoBridge: "Sieh dir die ganze Episode an.",
              language: "de",
            }),
            usage: {
              input_tokens: 1,
              output_tokens: 1,
              total_tokens: 2,
            },
          })
          .mockRejectedValueOnce(new Error("rate limited")),
      },
    };

    const summary = await rewriteTestShortStories(
      {
        inputPath: sourcePath,
        outputRoot: tempRoot,
        languages: ["de", "es"],
        model: "gpt-5-mini",
        dryRun: false,
        resume: false,
        overwrite: false,
        maxRetries: 0,
        maxConcurrency: 1,
      },
      {
        client,
      }
    );

    expect(summary.failed).toBeGreaterThan(0);
    expect(summary.artifacts).toHaveLength(2);
    expect(client.responses.create).toHaveBeenCalledTimes(2);
    const debugDir = path.join(tempRoot, "009-the-christmas-doll", "debug");
    expect(
      await fs.readFile(
        path.join(debugDir, "stories-rewrite-short-es.request.json"),
        "utf8"
      )
    ).toContain("short_narration_result");
    expect(summary.failures.some((failure) => failure.language === "es")).toBe(
      true
    );
  });

  it("fails before calling OpenAI when the short source extraction is under-specified", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "short-rewrite-underspecified-")
    );
    const sourcePath = await createMinimalSourceStory(tempRoot);
    const client = makeMockClient([
      {
        output_text: buildResponseJson({
          title: "Short Source",
          wordCount: 150,
          thumbnailText: "White Hat",
          fullVideoBridge: "Watch the full episode.",
        }),
      },
    ]);

    await expect(
      rewriteTestShortStories(
        {
          inputPath: sourcePath,
          outputRoot: tempRoot,
          languages: ["en"],
          model: "gpt-5-mini",
          dryRun: false,
          resume: false,
          overwrite: false,
          maxRetries: 0,
          maxConcurrency: 1,
          allowSourceInput: true,
        },
        {
          client,
        }
      )
    ).rejects.toThrow("Short source extraction retained only 2 beats");
    expect(client.responses.create).not.toHaveBeenCalled();
  });

  it("removes stale debug error files after a successful rewrite", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "short-rewrite-clear-error-")
    );
    const sourcePath = await createSourceStory(tempRoot);
    const episodeRoot = path.join(tempRoot, "009-the-christmas-doll");
    const debugDir = path.join(episodeRoot, "debug");
    await fs.mkdir(debugDir, { recursive: true });
    await fs.writeFile(
      path.join(debugDir, "stories-rewrite-short-de.error.json"),
      JSON.stringify({ stale: true }, null, 2),
      "utf8"
    );

    const client = makeMockClient([
      {
        output_text: buildResponseJson({
          title: "Das Puppenhaus",
          wordCount: 66,
          thumbnailText: "Nasse Hände",
          fullVideoBridge: "Sieh dir die ganze Episode an.",
          language: "de",
        }),
      },
    ]);

    const summary = await rewriteTestShortStories(
      {
        inputPath: sourcePath,
        outputRoot: tempRoot,
        languages: ["de"],
        model: "gpt-5-mini",
        dryRun: false,
        resume: false,
        overwrite: false,
        maxRetries: 0,
        maxConcurrency: 1,
      },
      {
        client,
      }
    );

    expect(summary.failed).toBe(0);
    await expect(
      fs.access(path.join(debugDir, "stories-rewrite-short-de.error.json"))
    ).rejects.toThrow();
  });

  it("regenerates short narration after max_output_tokens exhaustion and persists failed usage metadata", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "short-rewrite-max-output-")
    );
    const sourcePath = await createSourceStory(tempRoot);
    const client = makeRawResponseClient([
      {
        id: "resp-incomplete",
        output_parsed: null,
        output_text: "",
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        usage: {
          input_tokens: 90,
          output_tokens: 40,
          total_tokens: 130,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 4 },
        },
      },
      {
        id: "resp-regenerated",
        output_text: buildResponseJson({
          title: "Das Puppenhaus",
          wordCount: 66,
          thumbnailText: "Nasse Hände",
          fullVideoBridge: "Sieh dir die ganze Episode an.",
          language: "de",
        }),
        output_parsed: JSON.parse(
          buildResponseJson({
            title: "Das Puppenhaus",
            wordCount: 66,
            thumbnailText: "Nasse Hände",
            fullVideoBridge: "Sieh dir die ganze Episode an.",
            language: "de",
          })
        ),
        usage: {
          input_tokens: 120,
          output_tokens: 80,
          total_tokens: 200,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 5 },
        },
      },
    ]);

    const summary = await rewriteTestShortStories(
      {
        inputPath: sourcePath,
        outputRoot: tempRoot,
        languages: ["de"],
        model: "gpt-5-mini",
        dryRun: false,
        resume: false,
        overwrite: false,
        maxRetries: 0,
        maxOutputTokens: 700,
        retryMaxOutputTokens: 900,
      },
      {
        client,
      }
    );

    expect(summary.completed).toBe(1);
    expect(client.responses.create).toHaveBeenCalledTimes(2);
    const firstRequest = client.responses.create.mock.calls[0]?.[0] as {
      readonly input: readonly {
        readonly content: readonly { readonly text: string }[];
      }[];
    };
    const secondRequest = client.responses.create.mock.calls[1]?.[0] as {
      readonly input: readonly {
        readonly content: readonly { readonly text: string }[];
      }[];
      readonly max_output_tokens: number;
    };
    expect(firstRequest.input[1]?.content[0]?.text).not.toContain(
      "Validation errors:"
    );
    expect(secondRequest.input[1]?.content[0]?.text).not.toContain(
      "Validation errors:"
    );
    expect(secondRequest.max_output_tokens).toBe(900);
    expect(summary.artifacts[0]?.repairHistory?.[0]?.stage).toBe("regenerate");
    expect(summary.artifacts[0]?.failedRequest).toMatchObject({
      incompleteReason: "max_output_tokens",
      outputCap: 700,
      attemptNumber: 1,
      usage: {
        inputTokens: 90,
        outputTokens: 40,
      },
    });
  });

  it("blocks deterministic non-repairable validation failures without retrying", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "short-rewrite-deterministic-block-")
    );
    const sourcePath = await createSourceStory(tempRoot);
    const client = makeMockClient([
      {
        id: "resp-invalid",
        output_text: JSON.stringify({
          narration:
            "This story follows Mara through a strange night and summarizes the attic mystery without preserving the threat, the notebook warning, or the final consequence.",
        }),
      },
    ]);

    const summary = await rewriteTestShortStories(
      {
        inputPath: sourcePath,
        outputRoot: tempRoot,
        languages: ["de"],
        model: "gpt-5-mini",
        dryRun: false,
        resume: false,
        overwrite: false,
        maxRetries: 0,
      },
      {
        client,
      }
    );

    expect(summary.failed).toBe(1);
    expect(client.responses.create).toHaveBeenCalledTimes(1);
    expect(summary.artifacts[0]?.status).toBe("failed");
  });

  it("passes validator feedback and the invalid result into the short follow-up attempt", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "short-rewrite-targeted-repair-")
    );
    const sourcePath = await createSourceStory(tempRoot, false);
    const invalidNarration = [
      "Mara heard the doll breathing under the attic door.",
      "Eight seconds later, her phone rang in the nursery.",
      "When she opened it, the doll sat on the nursery chair with wet hands and her own name scratched across the glass.",
      "She burned the dress, locked the trunk, and thought the house had gone quiet, but the final photograph on the stairs showed the doll behind her brother.",
    ].join(" ");
    const client = makeMockClient([
      {
        id: "resp-invalid",
        output_text: JSON.stringify({ narration: invalidNarration }),
      },
      {
        id: "resp-repaired",
        output_text: buildResponseJson({
          title: "The Christmas Doll",
          wordCount: 72,
        }),
      },
      {
        id: "resp-regenerated",
        output_text: buildResponseJson({
          title: "The Christmas Doll",
          wordCount: 72,
        }),
      },
    ]);

    const summary = await rewriteTestShortStories(
      {
        inputPath: sourcePath,
        outputRoot: tempRoot,
        languages: ["en"],
        model: "gpt-5-mini",
        dryRun: false,
        resume: false,
        overwrite: false,
        maxRetries: 0,
      },
      {
        client,
      }
    );

    expect(summary.completed + summary.failed).toBe(1);
    expect(client.responses.create.mock.calls.length).toBeGreaterThanOrEqual(2);
    const followUpRequest = client.responses.create.mock.calls[1]?.[0] as {
      readonly input: readonly {
        readonly content: readonly { readonly text: string }[];
      }[];
    };
    const followUpPrompt = followUpRequest.input[1]?.content[0]?.text ?? "";
    expect(followUpPrompt).toContain("Fix these issues in the new result:");
    expect(followUpPrompt).toContain("Previous invalid short result:");
    expect(followUpPrompt).toContain(
      "Eight seconds later, her phone rang in the nursery."
    );
  });

  it("requires a validated canonical full parent for English shorts", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "short-rewrite-parent-required-")
    );
    const sourcePath = await createSourceStory(tempRoot, false);
    await fs.rm(
      path.join(
        tempRoot,
        "009-the-christmas-doll",
        "en",
        "full",
        "canonical-full.json"
      )
    );
    await expect(
      rewriteTestShortStories(
        {
          inputPath: sourcePath,
          outputRoot: tempRoot,
          languages: ["en"],
          model: "gpt-5-mini",
          dryRun: false,
          resume: false,
          overwrite: false,
          maxRetries: 0,
        },
        {
          client: makeMockClient(),
        }
      )
    ).rejects.toThrow("validated canonical English full parent artifact");
  });

  it("rejects a localized short when the canonical English Short has the wrong locale", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "short-rewrite-wrong-parent-locale-")
    );
    const sourcePath = await createSourceStory(tempRoot);
    const canonicalShortPath = path.join(
      tempRoot,
      "009-the-christmas-doll",
      "en",
      "short",
      "009-the-christmas-doll-en-short.json"
    );
    const canonicalShort = JSON.parse(
      await fs.readFile(canonicalShortPath, "utf8")
    ) as Record<string, unknown>;
    canonicalShort.locale = "es-ES";
    await fs.writeFile(
      canonicalShortPath,
      `${JSON.stringify(canonicalShort, null, 2)}\n`,
      "utf8"
    );
    await expect(
      rewriteTestShortStories(
        {
          inputPath: sourcePath,
          outputRoot: tempRoot,
          languages: ["de"],
          model: "gpt-5-mini",
          dryRun: false,
          resume: false,
          overwrite: false,
          maxRetries: 0,
        },
        {
          client: makeMockClient(),
        }
      )
    ).rejects.toThrow("canonical English Short locale es-ES");
  });

  it("persists the matching parent full hash in the short sidecar", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "short-rewrite-parent-hash-")
    );
    const sourcePath = await createSourceStory(tempRoot);
    const client = makeMockClient([
      {
        id: "resp-parent-hash",
        output_text: buildResponseJson({
          title: "Das Puppenhaus",
          wordCount: 66,
          thumbnailText: "Nasse Hände",
          fullVideoBridge: "Sieh dir die ganze Episode an.",
          language: "de",
        }),
      },
    ]);
    await rewriteTestShortStories(
      {
        inputPath: sourcePath,
        outputRoot: tempRoot,
        languages: ["de"],
        model: "gpt-5-mini",
        dryRun: false,
        resume: false,
        overwrite: false,
        maxRetries: 0,
      },
      {
        client,
      }
    );
    const sidecar = JSON.parse(
      await fs.readFile(
        path.join(
          tempRoot,
          "009-the-christmas-doll",
          "de",
          "short",
          "009-the-christmas-doll-de-short.json"
        ),
        "utf8"
      )
    ) as {
      readonly parent: { readonly parentFullHash: string };
      readonly shortAdaptationContract: { readonly contractHash: string };
    };
    expect(sidecar.parent.parentFullHash).toHaveLength(64);
    expect(sidecar.shortAdaptationContract.contractHash).toHaveLength(64);
  });

  it("keeps off and shadow provider requests and accepted Short identity byte-stable", async () => {
    const offRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "short-affect-off-")
    );
    const shadowRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "short-affect-shadow-")
    );
    const offSource = await createSourceStory(offRoot, false);
    const shadowSource = await createSourceStory(shadowRoot, false);
    await createHorrorAffectPlanArtifact(shadowRoot);
    const response = {
      output_text: buildResponseJson({
        title: "The Doll House",
        wordCount: 66,
        thumbnailText: "Wet Hands",
        fullVideoBridge: "Watch the full episode.",
        language: "en",
        narration: buildAcceptedEnglishNarration(),
      }),
    };
    const offClient = makeMockClient([response]);
    const shadowClient = makeMockClient([response]);

    const off = await rewriteTestShortStories(
      {
        inputPath: offSource,
        outputRoot: offRoot,
        languages: ["en"],
        model: "gpt-5-mini",
        dryRun: false,
        resume: false,
        overwrite: false,
        maxRetries: 0,
        horrorAffectRolloutMode: "off",
      },
      { client: offClient }
    );
    const shadow = await rewriteTestShortStories(
      {
        inputPath: shadowSource,
        outputRoot: shadowRoot,
        languages: ["en"],
        model: "gpt-5-mini",
        dryRun: false,
        resume: false,
        overwrite: false,
        maxRetries: 0,
        horrorAffectRolloutMode: "shadow",
      },
      { client: shadowClient }
    );

    expect(offClient.responses.create.mock.calls[0]?.[0]).toEqual(
      shadowClient.responses.create.mock.calls[0]?.[0]
    );
    expect(off.artifacts[0]?.promptFingerprint).toBe(
      shadow.artifacts[0]?.promptFingerprint
    );
    expect(off.artifacts[0]?.shortContractHash).toBe(
      shadow.artifacts[0]?.shortContractHash
    );
    expect(shadow.artifacts[0]?.shortContractVersion).toBe(
      "short-adaptation-contract-v1"
    );
  });

  it("enforces and persists one Short-owned affect chain without changing final-line or rename-map ownership", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "short-affect-enforce-")
    );
    const sourcePath = await createSourceStory(tempRoot, false);
    await createHorrorAffectPlanArtifact(tempRoot);
    const client = makeMockClient([
      {
        id: "resp-affect-enforce",
        output_text: buildResponseJson({
          title: "The Doll House",
          wordCount: 66,
          thumbnailText: "Wet Hands",
          fullVideoBridge: "Watch the full episode.",
          language: "en",
          narration: buildAcceptedEnglishNarration(),
        }),
      },
    ]);

    const summary = await rewriteTestShortStories(
      {
        inputPath: sourcePath,
        outputRoot: tempRoot,
        languages: ["en"],
        model: "gpt-5-mini",
        dryRun: false,
        resume: false,
        overwrite: false,
        maxRetries: 0,
        horrorAffectRolloutMode: "enforce",
      },
      { client }
    );

    expect(summary.completed).toBe(1);
    const request = client.responses.create.mock.calls[0]?.[0] as {
      readonly input: readonly {
        readonly content: readonly { readonly text: string }[];
      }[];
    };
    const userPrompt = request.input[1]?.content[0]?.text ?? "";
    expect(
      userPrompt.match(/## Short Horror Affect Projection/gu)
    ).toHaveLength(1);
    expect(userPrompt).toContain(
      "The final photograph on the stairs shows the doll behind her brother."
    );
    expect(userPrompt).toContain("Mara -> Lena");
    expect(userPrompt).toContain(
      "Do not replace, bridge, or reselect any question, rule, proof/response, cost, or payoff."
    );
    const sidecar = JSON.parse(
      await fs.readFile(
        path.join(
          tempRoot,
          "009-the-christmas-doll",
          "en",
          "short",
          "009-the-christmas-doll-en-short.json"
        ),
        "utf8"
      )
    ) as {
      readonly shortAdaptationContract: {
        readonly horrorAffectProjection: {
          readonly parent: { readonly planHash: string };
          readonly selectedIdsHash: string;
          readonly projectionHash: string;
        };
      };
    };
    expect(
      sidecar.shortAdaptationContract.horrorAffectProjection.parent.planHash
    ).toHaveLength(64);
    expect(
      sidecar.shortAdaptationContract.horrorAffectProjection.selectedIdsHash
    ).toHaveLength(64);
    expect(
      sidecar.shortAdaptationContract.horrorAffectProjection.projectionHash
    ).toHaveLength(64);
  });

  it("blocks an incomplete enforced projection before a provider call", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "short-affect-block-")
    );
    const sourcePath = await createSourceStory(tempRoot, false);
    const client = makeMockClient();

    await expect(
      rewriteTestShortStories(
        {
          inputPath: sourcePath,
          outputRoot: tempRoot,
          languages: ["en"],
          model: "gpt-5-mini",
          dryRun: false,
          resume: false,
          overwrite: false,
          maxRetries: 0,
          horrorAffectRolloutMode: "enforce",
        },
        { client }
      )
    ).rejects.toThrow("current accepted full-story horror affect plan");
    expect(client.responses.create).not.toHaveBeenCalled();
  });

  it("invalidates resume identity when the parent affect plan changes", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "short-affect-resume-")
    );
    await createSourceStory(tempRoot, false);
    const sourcePath = path.join(
      tempRoot,
      "009-the-christmas-doll",
      "en",
      "full",
      "script.md"
    );
    await createHorrorAffectPlanArtifact(tempRoot);
    const firstClient = makeMockClient([
      {
        output_text: buildResponseJson({
          title: "The Doll House",
          wordCount: 66,
          thumbnailText: "Wet Hands",
          fullVideoBridge: "Watch the full episode.",
          language: "en",
          narration: buildAcceptedEnglishNarration(),
        }),
      },
    ]);
    await rewriteTestShortStories(
      {
        inputPath: sourcePath,
        outputRoot: tempRoot,
        languages: ["en"],
        model: "gpt-5-mini",
        dryRun: false,
        resume: false,
        overwrite: true,
        maxRetries: 0,
        horrorAffectRolloutMode: "enforce",
      },
      { client: firstClient }
    );
    await createHorrorAffectPlanArtifact(tempRoot, "revised");
    const resumedClient = makeMockClient([
      {
        output_text: buildResponseJson({
          title: "The Doll House",
          wordCount: 66,
          thumbnailText: "Wet Hands",
          fullVideoBridge: "Watch the full episode.",
          language: "en",
          narration: buildAcceptedEnglishNarration(),
        }),
      },
    ]);

    const resumed = await rewriteTestShortStories(
      {
        inputPath: sourcePath,
        outputRoot: tempRoot,
        languages: ["en"],
        model: "gpt-5-mini",
        dryRun: false,
        resume: true,
        overwrite: true,
        maxRetries: 0,
        horrorAffectRolloutMode: "enforce",
      },
      { client: resumedClient }
    );

    expect(resumed.completed).toBe(1);
    expect(resumedClient.responses.create).toHaveBeenCalledTimes(1);
  });

  it("Task 07 fully revalidates one bounded Short repair and preserves the selected affect projection", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "short-affect-repair-validation-")
    );
    const sourcePath = await createSourceStory(tempRoot, false);
    await createHorrorAffectPlanArtifact(tempRoot);
    const invalidInitial = `${buildAcceptedEnglishNarration()} ${Array.from(
      { length: 220 },
      (_, index) => `detail${index}`
    ).join(" ")}`;
    const invalidRepair = buildNarration(165).replace(
      "The final photograph on the stairs showed the doll behind her brother.",
      "The final photograph showed an empty staircase."
    );
    const client = makeMockClient([
      {
        id: "resp-affect-invalid",
        output_text: buildResponseJson({
          language: "en",
          narration: invalidInitial,
        }),
      },
      {
        id: "resp-affect-repair-invalid",
        output_text: buildResponseJson({
          language: "en",
          narration: invalidRepair,
        }),
      },
    ]);

    const summary = await rewriteTestShortStories(
      {
        inputPath: sourcePath,
        outputRoot: tempRoot,
        languages: ["en"],
        model: "gpt-5-mini",
        dryRun: false,
        resume: false,
        overwrite: false,
        maxRetries: 0,
        horrorAffectRolloutMode: "enforce",
      },
      { client }
    );

    expect(summary.failed).toBe(1);
    expect(client.responses.create).toHaveBeenCalledTimes(2);
    const repairRequest = client.responses.create.mock.calls[1]?.[0] as {
      readonly input: readonly {
        readonly content: readonly { readonly text: string }[];
      }[];
    };
    const repairPrompt = repairRequest.input[1]?.content[0]?.text ?? "";
    expect(repairPrompt).toContain("## Short Horror Affect Projection");
    expect(repairPrompt).toContain(
      "Do not replace, bridge, or reselect any question, rule, proof/response, cost, or payoff."
    );
    expect(summary.failures[0]?.message).toMatch(
      /final consequence|payoff|ending/iu
    );
  });
});
