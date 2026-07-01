import { countSpokenWords, hashText } from "@mediaforge/shared";
import {
  adaptStoryProductionArtifactsToStoryIR,
  fullStoryOutputConstraintsSchema,
  shortStoryOutputConstraintsSchema,
  type FullStoryOutputConstraints,
  type ShortStoryOutputConstraints,
  type StoryIR,
} from "./story-artifact-model.js";
import {
  DEFAULT_GENRE_POLICY_REGISTRY,
  resolveGenrePolicy,
  type GenrePolicy,
} from "./genre-policy.js";
import {
  buildFullStoryContract,
  getContractBuildBlockingIssues,
  type FullStoryContract,
  type FullStoryContractEnvelope,
} from "./full-story-contract.js";
import { getLanguageProfile, LANGUAGE_PROFILES } from "./language-profiles.js";
import { stableSerialize } from "./stable-json.js";
import {
  STORY_PROMPT_COMPILER_VERSION,
  type FullStoryPromptInput,
  isNarrationOwner,
  type SelectedStoryPromptModule,
  type ShortStoryPromptInput,
  type StoryPromptClassificationOutcome,
  type StoryPromptDiagnostic,
  type StoryPromptModuleContext,
  type StoryPromptModuleDescriptor,
  type StoryPromptModuleId,
  validationIssuesToDiagnostics,
} from "./story-prompt-modules.js";
import {
  STORY_PROMPT_LOCALE_MODULE_VERSION,
  STORY_PROMPT_MODULE_REGISTRY,
} from "./story-prompt-module-registry.js";
import {
  fullNarrationResponseSchemaDescriptor,
  shortNarrationResponseSchemaDescriptor,
  type NarrationOnlyFullRewriteResponse,
} from "./story-prompt-response-schemas.js";
import {
  type AdaptationMode,
  type CanonicalStoryFacts,
  type LanguageCode,
  type LanguageProfile,
  type ParsedSourceStory,
} from "./story-localization.types.js";
import {
  type OriginalityReview,
  type RetentionBeat,
  type StoryBible,
  type StorySourceAnalysis,
} from "./story-production.js";
import { type SourceCleaningReport } from "./source-cleaning.js";
import {
  type ShortRewriteAdaptationContract,
  type ShortRewriteSourceExtraction,
} from "./short-rewrite.types.js";

export interface CompiledStoryPrompt {
  readonly compilerVersion: string;
  readonly variant: "full" | "short";
  readonly system: string;
  readonly user: string;
  readonly responseSchema:
    | typeof fullNarrationResponseSchemaDescriptor
    | typeof shortNarrationResponseSchemaDescriptor;
  readonly promptFingerprint: string;
  readonly selectedModules: readonly {
    readonly id: StoryPromptModuleId;
    readonly version: string;
  }[];
  readonly diagnostics: readonly StoryPromptDiagnostic[];
}

export interface CompileFullStoryPromptInput {
  readonly language: LanguageCode;
  readonly adaptationMode: AdaptationMode;
  readonly sourceStory: ParsedSourceStory;
  readonly canonicalFacts: CanonicalStoryFacts;
  readonly productionContext?: {
    readonly analysis?: StorySourceAnalysis;
    readonly bible?: StoryBible;
    readonly originalityReview?: OriginalityReview;
    readonly retentionPlan?: ReadonlyArray<RetentionBeat>;
  };
  readonly outputConstraints?: FullStoryOutputConstraints;
  readonly sourceCleaningReport?: SourceCleaningReport;
  readonly storyIr?: StoryIR;
}

export interface CompileShortStoryPromptInput {
  readonly language: LanguageCode;
  readonly adaptationMode: AdaptationMode;
  readonly sourceStory: ParsedSourceStory;
  readonly canonicalFacts: CanonicalStoryFacts;
  readonly sourceExtraction: ShortRewriteSourceExtraction;
  readonly adaptationContract: ShortRewriteAdaptationContract;
  readonly productionContext?: {
    readonly analysis?: StorySourceAnalysis;
    readonly bible?: StoryBible;
    readonly originalityReview?: OriginalityReview;
    readonly retentionPlan?: ReadonlyArray<RetentionBeat>;
  };
  readonly outputConstraints?: ShortStoryOutputConstraints;
  readonly sourceCleaningReport?: SourceCleaningReport;
  readonly storyIr?: StoryIR;
}

function resolveClassificationOutcome(
  storyIr: StoryIR
): StoryPromptClassificationOutcome {
  if (storyIr.genre !== "unknown") {
    return "confident";
  }
  const semanticallySafe =
    storyIr.fictionality !== "unknown" ||
    (!storyIr.centralRuleMechanism.supernatural &&
      storyIr.centralThreat.type !== "supernatural");
  return semanticallySafe ? "unknown-safe" : "unknown-unsafe";
}

function defaultFullOutputConstraints(
  profile: LanguageProfile,
  sourceStory: ParsedSourceStory
): FullStoryOutputConstraints {
  const sourceWordCount = countSpokenWords(
    sourceStory.narrationParagraphs.join(" ")
  );
  return fullStoryOutputConstraintsSchema.parse({
    variant: "full",
    targetWordRange: {
      min: Math.max(1, Math.round(sourceWordCount * 0.92)),
      max: Math.max(1, Math.round(sourceWordCount * 1.08)),
    },
    targetNarrationWpm: profile.fullNarrationWpm,
  });
}

function defaultShortOutputConstraints(
  profile: LanguageProfile
): ShortStoryOutputConstraints {
  return shortStoryOutputConstraintsSchema.parse({
    variant: "short",
    targetWordRange: {
      min: Math.max(1, profile.shortWordRange.min),
      max: Math.max(1, profile.shortWordRange.max),
    },
    targetNarrationWpm: profile.shortNarrationWpm,
    targetDuration: {
      minSeconds: 55,
      maxSeconds: 65,
    },
    hookDeadlineSeconds: 8,
    fullVideoBridgeRequired: true,
  });
}

function supportedLocaleForLanguage(language: LanguageCode): string {
  const profile = LANGUAGE_PROFILES[language];
  return profile.locale;
}

function buildStoryIr(args: {
  readonly sourceStory: ParsedSourceStory;
  readonly canonicalFacts: CanonicalStoryFacts;
  readonly productionContext?: CompileFullStoryPromptInput["productionContext"];
  readonly storyIr?: StoryIR;
}): StoryIR {
  if (args.storyIr) {
    return args.storyIr;
  }
  return adaptStoryProductionArtifactsToStoryIR({
    parsed: args.sourceStory,
    facts: args.canonicalFacts,
    ...(args.productionContext?.analysis
      ? { analysis: args.productionContext.analysis }
      : {}),
    ...(args.productionContext?.bible
      ? { bible: args.productionContext.bible }
      : {}),
    ...(args.productionContext?.originalityReview
      ? { originalityReview: args.productionContext.originalityReview }
      : {}),
    ...(args.productionContext?.retentionPlan
      ? { retentionPlan: args.productionContext.retentionPlan }
      : {}),
  });
}

function compileFromContext(
  context: StoryPromptModuleContext
): CompiledStoryPrompt {
  const diagnostics: StoryPromptDiagnostic[] = [];
  const selected: SelectedStoryPromptModule[] = [];
  const selectedIds = new Set<StoryPromptModuleId>();
  const ownershipDiagnostics = validateNarrationPromptModuleOwnership(
    STORY_PROMPT_MODULE_REGISTRY
  );
  diagnostics.push(...ownershipDiagnostics);
  for (const module of STORY_PROMPT_MODULE_REGISTRY) {
    if (!module.variants.includes(context.variant)) {
      diagnostics.push({
        code: "MODULE_SKIPPED_VARIANT",
        severity: "info",
        message: `${module.id} does not apply to ${context.variant}.`,
        moduleId: module.id,
        blocking: false,
      });
      continue;
    }
    const applicability = module.applies(context);
    if (applicability.kind === "skip") {
      diagnostics.push({
        code: "MODULE_SKIPPED",
        severity: "info",
        message: `${module.id} skipped: ${applicability.reason}`,
        moduleId: module.id,
        blocking: false,
      });
      continue;
    }
    if (applicability.kind === "reject") {
      diagnostics.push(applicability.diagnostic);
      continue;
    }
    if (!isNarrationOwner(module.owner)) {
      diagnostics.push({
        code: "CROSS_OWNER_MODULE_REJECTED",
        severity: "error",
        message: `Module ${module.id} is owned by ${module.owner} and cannot be compiled into the narration stage.`,
        moduleId: module.id,
        blocking: true,
      });
      continue;
    }
    selected.push({
      module,
      ...module.render(context),
    });
    selectedIds.add(module.id);
  }
  for (const entry of selected) {
    for (const dependency of entry.module.dependencies) {
      if (!selectedIds.has(dependency)) {
        diagnostics.push({
          code: "MODULE_DEPENDENCY_MISSING",
          severity: "error",
          message: `Module ${entry.module.id} requires ${dependency}.`,
          moduleId: entry.module.id,
          blocking: true,
        });
      }
    }
    for (const conflict of entry.module.conflicts) {
      if (selectedIds.has(conflict)) {
        diagnostics.push({
          code: "MODULE_CONFLICT",
          severity: "error",
          message: `Module ${entry.module.id} conflicts with ${conflict}.`,
          moduleId: entry.module.id,
          blocking: true,
        });
      }
    }
  }
  const blocking = diagnostics.some((entry) => entry.blocking);
  if (blocking) {
    return {
      compilerVersion: STORY_PROMPT_COMPILER_VERSION,
      variant: context.variant,
      system: "",
      user: "",
      responseSchema: context.responseSchema,
      promptFingerprint: "",
      selectedModules: selected.map((entry) => ({
        id: entry.module.id,
        version: entry.module.semanticVersion,
      })),
      diagnostics,
    };
  }
  const ordered = [...selected].sort((left, right) => {
    if (left.module.order !== right.module.order) {
      return left.module.order - right.module.order;
    }
    if (left.module.id !== right.module.id) {
      return left.module.id.localeCompare(right.module.id);
    }
    return left.module.semanticVersion.localeCompare(
      right.module.semanticVersion
    );
  });
  const systemRuleMap = new Map<string, string>();
  const userRuleMap = new Map<string, string>();
  const systemSections: string[] = [];
  const userSections: string[] = [];
  for (const entry of ordered) {
    if (entry.system) {
      for (const rule of entry.system.rules ?? []) {
        if (!systemRuleMap.has(rule.id)) {
          systemRuleMap.set(rule.id, rule.text);
        }
      }
      const renderedRules = [...systemRuleMap.values()]
        .map((line) => `- ${line}`)
        .join("\n");
      const body =
        entry.system.rules && entry.system.rules.length > 0
          ? [renderedRules, entry.system.body].filter(Boolean).join("\n")
          : entry.system.body;
      systemSections.push(`## ${entry.system.heading}\n${body}`);
    }
    if (entry.user) {
      for (const rule of entry.user.rules ?? []) {
        if (!userRuleMap.has(rule.id)) {
          userRuleMap.set(rule.id, rule.text);
        }
      }
      const renderedRules = [...userRuleMap.values()]
        .map((line) => `- ${line}`)
        .join("\n");
      const body =
        entry.user.rules && entry.user.rules.length > 0
          ? [renderedRules, entry.user.body].filter(Boolean).join("\n")
          : entry.user.body;
      userSections.push(`## ${entry.user.heading}\n${body}`);
    }
  }
  const system = systemSections.join("\n\n");
  const user = [
    userSections.join("\n\n"),
    context.variant === "short"
      ? [
          "## Short Adaptation Contract",
          `- Preserve the core identity in ${context.adaptationContract.identity.locale}.`,
          `- Central threat: ${context.adaptationContract.centralThreat}`,
          `- Rule or mechanism: ${context.adaptationContract.centralRuleOrMechanism}`,
          `- Critical object: ${context.adaptationContract.criticalObject}`,
          `- Climax or irreversible turn: ${context.adaptationContract.climaxOrIrreversibleTurn}`,
          `- Final consequence or sting: ${context.adaptationContract.finalConsequenceOrSting}`,
          `- Immutable facts that remain grounded: ${
            context.adaptationContract.immutableFacts.length > 0
              ? context.adaptationContract.immutableFacts
                  .map((fact) => fact.statement)
                  .join(" | ")
              : "none"
          }`,
          `- Invention boundaries: ${context.adaptationContract.inventionBoundaries.join(" | ")}`,
          `- Hook deadline: ${context.adaptationContract.constraints.hookDeadlineSeconds} seconds`,
          `- Target word range: ${context.adaptationContract.constraints.targetWordRange.min}-${context.adaptationContract.constraints.targetWordRange.max}`,
          `- Target narration pace: ${context.adaptationContract.constraints.targetNarrationWpm} WPM`,
          `- Maximum beats: ${context.adaptationContract.constraints.maximumBeats}`,
          `- Forbidden omissions: ${context.adaptationContract.forbiddenOmissions.join(" | ")}`,
          "",
          "<SHORT_ADAPTATION_SOURCE>",
          ...context.sourceExtraction.beats
            .filter((beat) => beat.retained)
            .map((beat) => `- [${beat.id}] ${beat.text}`),
          "</SHORT_ADAPTATION_SOURCE>",
          "",
          "Before returning the result, silently verify:",
          "- Every concrete action, object, timing detail, reveal, and relationship is supported by the retained source beats or the immutable facts listed above.",
          "- Remove any unsupported object, place, call, note, injury, motive, or reveal that is not grounded in the source package above.",
          "- Keep the same ending consequence without inventing a bridge event or a new reveal.",
        ].join("\n")
      : `<SOURCE_NARRATION>\n${context.sourceStory.narrationParagraphs.join("\n\n")}\n</SOURCE_NARRATION>`,
  ].join("\n\n");
  const fingerprintPayload = {
    compilerVersion: STORY_PROMPT_COMPILER_VERSION,
    variant: context.variant,
    locale: context.selectedLocale,
    localeModuleVersion: context.localeModuleVersion,
    responseSchema: {
      name: context.responseSchema.name,
      version: context.responseSchema.version,
      fingerprint: context.responseSchema.fingerprint,
    },
    modules: ordered.map((entry) => ({
      id: entry.module.id,
      version: entry.module.semanticVersion,
      fingerprint: entry.module.fingerprint(context),
    })),
    genrePolicy: {
      id: context.genrePolicy.id,
      version: context.genrePolicy.version,
      classificationOutcome: context.classificationOutcome,
      registryVersion: DEFAULT_GENRE_POLICY_REGISTRY.registryVersion,
    },
    sourceHash: context.sourceStory.sourceHash,
    adaptationMode: context.adaptationMode,
    ...(context.variant === "full"
      ? {
          contractFingerprint: context.contractEnvelope.buildFingerprint,
          outputConstraints: context.outputConstraints,
        }
      : {
          parentFullHash: context.adaptationContract.parent.parentFullHash,
          shortContractHash: context.adaptationContract.contractHash,
          shortSourceExtractionHash: context.sourceExtraction.extractionHash,
          outputConstraints: context.outputConstraints,
        }),
    ...(context.sourceCleaningReport
      ? {
          sourceCleaningFingerprint:
            context.sourceCleaningReport.cleaningFingerprint,
        }
      : {}),
  };
  const promptFingerprint = hashText(stableSerialize(fingerprintPayload));
  diagnostics.push({
    code: "PROMPT_COMPILED",
    severity: "info",
    message: `Compiled ${context.variant} prompt fingerprint ${promptFingerprint}.`,
    blocking: false,
  });
  return {
    compilerVersion: STORY_PROMPT_COMPILER_VERSION,
    variant: context.variant,
    system,
    user,
    responseSchema: context.responseSchema,
    promptFingerprint,
    selectedModules: ordered.map((entry) => ({
      id: entry.module.id,
      version: entry.module.semanticVersion,
    })),
    diagnostics,
  };
}

export function validateNarrationPromptModuleOwnership(
  modules: readonly StoryPromptModuleDescriptor[]
): readonly StoryPromptDiagnostic[] {
  return modules.flatMap((module) =>
    isNarrationOwner(module.owner)
      ? []
      : [
          {
            code: "CROSS_OWNER_MODULE_REJECTED",
            severity: "error" as const,
            message: `Module ${module.id} is owned by ${module.owner} and cannot be compiled into the narration stage.`,
            moduleId: module.id,
            blocking: true,
          },
        ]
  );
}

export function compileFullStoryPrompt(
  input: CompileFullStoryPromptInput
): CompiledStoryPrompt {
  const diagnostics: StoryPromptDiagnostic[] = [];
  const profile = getLanguageProfile(input.language);
  if (profile.locale !== supportedLocaleForLanguage(input.language)) {
    throw new Error(
      `Unsupported locale resolution for language ${input.language}.`
    );
  }
  const storyIr = buildStoryIr(input);
  const classificationOutcome = resolveClassificationOutcome(storyIr);
  const policyResolution = resolveGenrePolicy({
    genre: storyIr.genre,
    registry: DEFAULT_GENRE_POLICY_REGISTRY,
  });
  diagnostics.push(...validationIssuesToDiagnostics(policyResolution.issues));
  if (!policyResolution.ok) {
    return {
      compilerVersion: STORY_PROMPT_COMPILER_VERSION,
      variant: "full",
      system: "",
      user: "",
      responseSchema: fullNarrationResponseSchemaDescriptor,
      promptFingerprint: "",
      selectedModules: [],
      diagnostics,
    };
  }
  if (classificationOutcome === "unknown-unsafe") {
    diagnostics.push({
      code: "UNKNOWN_GENRE_UNSAFE",
      severity: "error",
      message:
        "Unknown genre cannot be compiled because the source requires genre-specific semantics.",
      blocking: true,
    });
    return {
      compilerVersion: STORY_PROMPT_COMPILER_VERSION,
      variant: "full",
      system: "",
      user: "",
      responseSchema: fullNarrationResponseSchemaDescriptor,
      promptFingerprint: "",
      selectedModules: [],
      diagnostics,
    };
  }
  const outputConstraints =
    input.outputConstraints ??
    defaultFullOutputConstraints(profile, input.sourceStory);
  const contractResult = buildFullStoryContract({
    storyIr,
    artifactIdentity: {
      episodeNumber: input.sourceStory.episodeNumber,
      episodeSlug: input.sourceStory.slug,
      language: input.language,
      locale: profile.locale,
      variant: "full",
    },
    outputConstraints,
    lineage: input.sourceCleaningReport
      ? {
          kind: "cleaned-source",
          originalSourceHash: input.sourceStory.sourceHash,
          cleanedSourceHash: input.sourceCleaningReport.cleanedTextHash,
          cleanerVersion: input.sourceCleaningReport.cleanerVersion,
          cleaningReportVersion: input.sourceCleaningReport.schemaVersion,
          storyIrHash: "0".repeat(64),
        }
      : {
          kind: "story-ir-only",
          storyIrHash: "0".repeat(64),
          reason: "lineage-unavailable",
        },
  });
  diagnostics.push(...validationIssuesToDiagnostics(contractResult.issues));
  if (
    !contractResult.ok ||
    getContractBuildBlockingIssues(contractResult).length > 0
  ) {
    return {
      compilerVersion: STORY_PROMPT_COMPILER_VERSION,
      variant: "full",
      system: "",
      user: "",
      responseSchema: fullNarrationResponseSchemaDescriptor,
      promptFingerprint: "",
      selectedModules: [],
      diagnostics,
    };
  }
  const context: FullStoryPromptInput = {
    variant: "full",
    language: input.language,
    languageProfile: profile,
    adaptationMode: input.adaptationMode,
    sourceStory: input.sourceStory,
    canonicalFacts: input.canonicalFacts,
    storyIr,
    genrePolicy: policyResolution.policy,
    classificationOutcome,
    contract: contractResult.contract as FullStoryContract,
    contractEnvelope: contractResult.envelope as FullStoryContractEnvelope,
    outputConstraints,
    responseSchema: fullNarrationResponseSchemaDescriptor,
    localeModuleVersion: STORY_PROMPT_LOCALE_MODULE_VERSION,
    selectedLocale: profile.locale,
    ...(input.productionContext
      ? { productionContext: input.productionContext }
      : {}),
    ...(input.sourceCleaningReport
      ? { sourceCleaningReport: input.sourceCleaningReport }
      : {}),
  };
  const compiled = compileFromContext(context);
  return {
    ...compiled,
    diagnostics: [...diagnostics, ...compiled.diagnostics],
  };
}

export function compileShortStoryPrompt(
  input: CompileShortStoryPromptInput
): CompiledStoryPrompt {
  const diagnostics: StoryPromptDiagnostic[] = [];
  const profile = getLanguageProfile(input.language);
  const storyIr = buildStoryIr(input);
  const initialClassificationOutcome = resolveClassificationOutcome(storyIr);
  const classificationOutcome =
    initialClassificationOutcome === "unknown-unsafe"
      ? "unknown-safe"
      : initialClassificationOutcome;
  const policyResolution = resolveGenrePolicy({
    genre: storyIr.genre,
    registry: DEFAULT_GENRE_POLICY_REGISTRY,
  });
  diagnostics.push(...validationIssuesToDiagnostics(policyResolution.issues));
  if (!policyResolution.ok) {
    return {
      compilerVersion: STORY_PROMPT_COMPILER_VERSION,
      variant: "short",
      system: "",
      user: "",
      responseSchema: shortNarrationResponseSchemaDescriptor,
      promptFingerprint: "",
      selectedModules: [],
      diagnostics,
    };
  }
  if (initialClassificationOutcome === "unknown-unsafe") {
    diagnostics.push({
      code: "UNKNOWN_GENRE_SHORT_FALLBACK",
      severity: "warning",
      message:
        "Short rewrite compilation fell back to the conservative unknown-safe policy because genre-specific short semantics are not required.",
      blocking: false,
    });
  }
  const outputConstraints =
    input.outputConstraints ?? defaultShortOutputConstraints(profile);
  const context: ShortStoryPromptInput = {
    variant: "short",
    language: input.language,
    languageProfile: profile,
    adaptationMode: input.adaptationMode,
    sourceStory: input.sourceStory,
    canonicalFacts: input.canonicalFacts,
    storyIr,
    genrePolicy: policyResolution.policy as GenrePolicy,
    classificationOutcome,
    outputConstraints,
    responseSchema: shortNarrationResponseSchemaDescriptor,
    sourceExtraction: input.sourceExtraction,
    adaptationContract: input.adaptationContract,
    localeModuleVersion: STORY_PROMPT_LOCALE_MODULE_VERSION,
    selectedLocale: profile.locale,
    ...(input.productionContext
      ? { productionContext: input.productionContext }
      : {}),
    ...(input.sourceCleaningReport
      ? { sourceCleaningReport: input.sourceCleaningReport }
      : {}),
  };
  const compiled = compileFromContext(context);
  return {
    ...compiled,
    diagnostics: [...diagnostics, ...compiled.diagnostics],
  };
}
