import { hashText } from "@mediaforge/shared";
import {
  applyCharacterRenameMapToCanonicalFacts,
  applyCharacterRenameMapToParsedSource,
  applyCharacterRenameMapToStoryIr,
  buildCharacterRenameMap,
  type CharacterRenameMap,
} from "./character-rename.service.js";
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
import {
  DEFAULT_FULL_DURATION_WINDOW,
  DEFAULT_SHORT_DURATION_WINDOW,
  resolveFullNarrationWordRange,
  resolveShortNarrationWordRange,
} from "./narration-constraints.js";
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
import {
  buildCanonicalStoryBeats,
  buildStoryMechanicsContract,
} from "./story-mechanics.js";
import { estimateStoryTokens } from "./story-generation-preflight.js";
import {
  validateCompiledPromptContract,
  validateStoryContractPreflight,
} from "./story-contract-preflight.js";
import { adaptLegacyStoryToCanonicalContract } from "./canonical-story-contract.js";
import { type SourceCleaningReport } from "./source-cleaning.js";
import {
  type ShortRewriteAdaptationContract,
  type ShortBeatPlanBeat,
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
  readonly metrics: StoryPromptMetrics;
}

export interface StoryPromptBudgets {
  readonly maxPromptCharacters: number;
  readonly maxEstimatedInputTokens: number;
  readonly maxCanonicalEvents: number;
  readonly maxSceneBeats: number;
}

export interface StoryPromptMetrics {
  readonly promptCharacters: number;
  readonly estimatedInputTokens: number;
  readonly selectedEventCount: number;
  readonly expandedDependencyCount: number;
  readonly emittedEventCount: number;
  readonly sceneBeatCount: number;
  readonly promptSectionCount: number;
  readonly duplicateSectionCount: number;
  readonly sectionSizes: readonly { readonly heading: string; readonly characters: number }[];
}

const EMPTY_PROMPT_METRICS: StoryPromptMetrics = {
  promptCharacters: 0,
  estimatedInputTokens: 0,
  selectedEventCount: 0,
  expandedDependencyCount: 0,
  emittedEventCount: 0,
  sceneBeatCount: 0,
  promptSectionCount: 0,
  duplicateSectionCount: 0,
  sectionSizes: [],
};

const DEFAULT_FULL_PROMPT_BUDGETS: StoryPromptBudgets = {
  maxPromptCharacters: 48_000,
  maxEstimatedInputTokens: 14_000,
  maxCanonicalEvents: 20,
  maxSceneBeats: 20,
};
const DEFAULT_SHORT_PROMPT_BUDGETS: StoryPromptBudgets = {
  maxPromptCharacters: 24_000,
  maxEstimatedInputTokens: 8_000,
  maxCanonicalEvents: 6,
  maxSceneBeats: 6,
};

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
  readonly characterRenameMap?: CharacterRenameMap;
  readonly promptBudgets?: Partial<StoryPromptBudgets>;
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
  readonly characterRenameMap?: CharacterRenameMap;
  readonly promptBudgets?: Partial<StoryPromptBudgets>;
}

function resolvePromptBudgets(variant: "full" | "short", override?: Partial<StoryPromptBudgets>): StoryPromptBudgets {
  return { ...(variant === "full" ? DEFAULT_FULL_PROMPT_BUDGETS : DEFAULT_SHORT_PROMPT_BUDGETS), ...override };
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
  _sourceStory: ParsedSourceStory
): FullStoryOutputConstraints {
  const targetWordRange = resolveFullNarrationWordRange({
    language: profile.code,
    pace: profile.defaultNarrationPace,
  });
  return fullStoryOutputConstraintsSchema.parse({
    variant: "full",
    targetWordRange: {
      min: targetWordRange.min,
      max: targetWordRange.max,
    },
    targetNarrationWpm: profile.fullNarrationWpm,
    targetDuration: {
      minSeconds: DEFAULT_FULL_DURATION_WINDOW.minSeconds,
      maxSeconds: DEFAULT_FULL_DURATION_WINDOW.maxSeconds,
    },
  });
}

function defaultShortOutputConstraints(
  profile: LanguageProfile
): ShortStoryOutputConstraints {
  const range = resolveShortNarrationWordRange({
    language: profile.code,
    pace: profile.defaultNarrationPace,
    duration: DEFAULT_SHORT_DURATION_WINDOW,
  });
  return shortStoryOutputConstraintsSchema.parse({
    variant: "short",
    targetWordRange: {
      min: Math.max(1, range.min),
      max: Math.max(1, range.max),
    },
    targetNarrationWpm: profile.shortNarrationWpm,
    targetDuration: {
      minSeconds: DEFAULT_SHORT_DURATION_WINDOW.minSeconds,
      maxSeconds: DEFAULT_SHORT_DURATION_WINDOW.maxSeconds,
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
  context: StoryPromptModuleContext,
  budgets: StoryPromptBudgets
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
      metrics: EMPTY_PROMPT_METRICS,
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
  const systemHeadings = new Set<string>();
  const userHeadings = new Set<string>();
  for (const entry of ordered) {
    if (entry.system) {
      const headingKey = entry.system.heading.trim().toLocaleLowerCase();
      if (systemHeadings.has(headingKey)) {
        diagnostics.push({ code: "DUPLICATED_PROMPT_SECTION", severity: "error", message: `System section ${entry.system.heading} is duplicated.`, moduleId: entry.module.id, blocking: true });
        continue;
      }
      systemHeadings.add(headingKey);
      const newRules: string[] = [];
      for (const rule of entry.system.rules ?? []) {
        if (!systemRuleMap.has(rule.id)) {
          systemRuleMap.set(rule.id, rule.text);
          newRules.push(rule.text);
        }
      }
      const renderedRules = newRules
        .map((line) => `- ${line}`)
        .join("\n");
      const body =
        entry.system.rules && entry.system.rules.length > 0
          ? [renderedRules, entry.system.body].filter(Boolean).join("\n")
          : entry.system.body;
      systemSections.push(`## ${entry.system.heading}\n${body}`);
    }
    if (entry.user) {
      const headingKey = entry.user.heading.trim().toLocaleLowerCase();
      if (userHeadings.has(headingKey)) {
        diagnostics.push({ code: "DUPLICATED_PROMPT_SECTION", severity: "error", message: `User section ${entry.user.heading} is duplicated.`, moduleId: entry.module.id, blocking: true });
        continue;
      }
      userHeadings.add(headingKey);
      const newRules: string[] = [];
      for (const rule of entry.user.rules ?? []) {
        if (!userRuleMap.has(rule.id)) {
          userRuleMap.set(rule.id, rule.text);
          newRules.push(rule.text);
        }
      }
      const renderedRules = newRules
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
  const selectedEventIds = context.variant === "short" ? new Set(context.sourceExtraction.selectedEventIds ?? []) : new Set<string>();
  const emittedEvents = context.variant === "short"
    ? (context.sourceExtraction.events ?? []).filter((event) => selectedEventIds.has(event.id))
    : [];
  const emittedBeats: readonly ShortBeatPlanBeat[] = context.variant === "short"
    ? (context.sourceExtraction.beatPlan?.beats ?? []).filter((beat) => beat.eventIds.every((id) => selectedEventIds.has(id)))
    : [];
  const user = [
    userSections.join("\n\n"),
        context.variant === "short"
          ? [
          "## Short Adaptation Contract",
          `- Preserve the core identity in ${context.adaptationContract.identity.locale}.`,
          `- Reuse the same fictional character names exactly: ${context.characterRenameMap.entries.map((entry) => entry.fictionalName).join(", ") || "none"}`,
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
          `- Selected event IDs: ${context.sourceExtraction.selectedEventIds?.join(", ") || "none"}`,
          `- Beat plan ending strategy: ${context.sourceExtraction.beatPlan?.endingStrategy ?? "unspecified"}`,
          "- Narrative functions to cover naturally: early hook, setup, evidence, escalation, reversal, reveal, consequence, and sting when the beat plan requires them.",
          `- Preserve canonical protagonist names exactly: ${context.canonicalFacts.protagonistNames?.join(", ") || "none"}`,
          `- Preserve canonical locations and anchors exactly: ${context.canonicalFacts.locationAnchors?.join(" | ") || "none"}`,
          `- Preserve concrete locations: ${context.canonicalFacts.concreteLocations?.join(" | ") || "none"}`,
          `- Preserve key objects: ${(context.canonicalFacts.keyObjects ?? context.canonicalFacts.criticalObjects).join(" | ") || "none"}`,
          `- Preserve core motifs and devices exactly: ${context.canonicalFacts.threatMotifs?.join(" | ") || "none"}`,
          `- One central rule must be explicit: ${context.canonicalFacts.supernaturalRule ?? context.canonicalFacts.keyRules?.[0] ?? context.adaptationContract.centralRuleOrMechanism}`,
          `- Protagonist attachment before climax: ${context.canonicalFacts.protagonistAttachment ?? "must be concrete and story-specific"}`,
          `- Threat temptation: ${context.canonicalFacts.threatTemptation ?? "must exploit that attachment"}`,
          `- Emotionally costly final decision: ${context.canonicalFacts.emotionalCost ?? "must visibly cost the protagonist something meaningful"}`,
          `- Required final reveal: ${context.canonicalFacts.requiredFinalReveal ?? context.adaptationContract.finalConsequenceOrSting}`,
          `- Required final sting line: ${context.canonicalFacts.requiredFinalLine ?? context.adaptationContract.finalConsequenceOrSting}`,
          `- Forbidden inventions: ${context.canonicalFacts.forbiddenInventions?.join(" | ") || "none"}`,
          "",
          "<SHORT_ADAPTATION_EVENTS>",
          ...emittedEvents
            .map((event) => {
              const roles = event.narrativeRoles.join(", ");
              const dependencies = event.causalDependencyIds.join(", ") || "none";
              const sourceBeats = event.sourceBeatIds.join(", ") || "none";
              return [
                `- [${event.id}] #${event.chronologyIndex} ${event.statement}`,
                `  roles: ${roles || "none"}`,
                `  depends-on: ${dependencies}`,
                `  source-beats: ${sourceBeats}`,
                `  facts: ${event.mandatoryFacts.join(" | ") || "none"}`,
              ].join("\n");
            }),
          "</SHORT_ADAPTATION_EVENTS>",
          "",
          "<SHORT_ADAPTATION_BEAT_PLAN>",
          ...emittedBeats.map((beat) =>
            [
              `- [${beat.id}] ${beat.role} ${beat.targetStartSecond}-${beat.targetEndSecond}s`,
              `  event-ids: ${beat.eventIds.join(", ") || "none"}`,
              `  purpose: ${beat.purpose}`,
            ].join("\n")
          ),
          "</SHORT_ADAPTATION_BEAT_PLAN>",
          "",
          "Before returning the result, silently verify:",
          "- Return a complete narrated micro-story, not an outline or summary.",
          "- Put the first impossible detail in sentence one.",
          "- Keep setup before escalation and final consequence last.",
          "- State one central rule or mechanism inside the narration.",
          "- Make the protagonist's final decision emotionally costly, not only clever, lucky, observant, or puzzle-solving.",
          "- Answer in-scene what the protagonist wants emotionally, what the threat offers or imitates, and what the protagonist must refuse, abandon, destroy, betray, or accept to survive.",
          "- End on one final sting that preserves the canonical reveal or last line.",
          "- Keep canonical names, devices, and locations unchanged.",
          "- Do not add structural commentary, headings, labels, or provenance notes.",
          "- Use only the supplied events, beat plan, immutable facts, and forbidden omissions.",
          "- Preserve event chronology and keep every sentence advancing the story.",
          "- Prefer physical action, observable evidence, sensory detail, decisions, rules, reversals, and consequences over commentary.",
          "- Do not repeat a location or event unless its meaning changes.",
          "- Do not invent unsupported mechanics, extra reveal logic, or a bridge to the full video.",
        ].join("\n")
      : `<SOURCE_NARRATION>\n${context.sourceStory.narrationParagraphs.join("\n\n")}\n</SOURCE_NARRATION>`,
  ].join("\n\n");
  const allSections = [...systemSections, ...userSections];
  const headings = allSections.map((section) => /^##\s+(.+)$/mu.exec(section)?.[1]?.trim() ?? "unnamed");
  const normalizedHeadings = headings.map((heading) => heading.toLocaleLowerCase());
  const duplicateSectionCount = normalizedHeadings.length - new Set(normalizedHeadings).size;
  const promptCharacters = system.length + user.length;
  const estimatedInputTokens = estimateStoryTokens(`${system}\n${user}`, "openai-compatible-local-estimate");
  const metrics: StoryPromptMetrics = {
    promptCharacters,
    estimatedInputTokens,
    selectedEventCount: selectedEventIds.size,
    expandedDependencyCount: context.variant === "short"
      ? Math.max(0, selectedEventIds.size - new Set(emittedEvents.flatMap((event) => event.sourceBeatIds)).size)
      : 0,
    emittedEventCount: emittedEvents.length,
    sceneBeatCount: context.variant === "short" ? emittedBeats.length : Math.min(context.canonicalBeats.length, budgets.maxSceneBeats),
    promptSectionCount: headings.length + (context.variant === "short" ? 2 : 1),
    duplicateSectionCount,
    sectionSizes: allSections.map((section, index) => ({ heading: headings[index] ?? "unnamed", characters: section.length })).sort((left, right) => right.characters - left.characters),
  };
  const promptContractIssues = validateCompiledPromptContract({
    system,
    user,
    responseSchemaName: context.responseSchema.name,
    selectedEventCount: metrics.selectedEventCount,
    emittedEventCount: metrics.emittedEventCount,
    sceneBeatCount: metrics.sceneBeatCount,
    maxCanonicalEvents: budgets.maxCanonicalEvents,
    maxSceneBeats: budgets.maxSceneBeats,
  });
  diagnostics.push(...promptContractIssues.map((issue) => ({ code: issue.code, severity: "error" as const, message: issue.message, blocking: true })));
  if (promptCharacters > budgets.maxPromptCharacters || estimatedInputTokens > budgets.maxEstimatedInputTokens) {
    diagnostics.push({
      code: "PROMPT_BUDGET_EXCEEDED",
      severity: "error",
      message: `Prompt requires ${promptCharacters} characters / ${estimatedInputTokens} estimated tokens; limits are ${budgets.maxPromptCharacters} / ${budgets.maxEstimatedInputTokens}. Largest sections: ${metrics.sectionSizes.slice(0, 3).map((entry) => `${entry.heading}=${entry.characters}`).join(", ")}.`,
      blocking: true,
    });
  }
  if (diagnostics.some((entry) => entry.blocking)) {
    return {
      compilerVersion: STORY_PROMPT_COMPILER_VERSION,
      variant: context.variant,
      system: "",
      user: "",
      responseSchema: context.responseSchema,
      promptFingerprint: "",
      selectedModules: ordered.map((entry) => ({ id: entry.module.id, version: entry.module.semanticVersion })),
      diagnostics,
      metrics,
    };
  }
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
    characterRenameMapHash: context.characterRenameMap.hash,
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
    metrics,
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
  const originalStoryIr = buildStoryIr(input);
  const characterRenameMap =
    input.characterRenameMap ??
    buildCharacterRenameMap({
      episodeId: input.sourceStory.episodeNumber,
      sourceHash: input.sourceStory.sourceHash,
      canonicalFacts: input.canonicalFacts,
      storyIr: originalStoryIr,
    });
  const sourceStory = applyCharacterRenameMapToParsedSource(
    input.sourceStory,
    characterRenameMap
  );
  const canonicalFacts = applyCharacterRenameMapToCanonicalFacts(
    input.canonicalFacts,
    characterRenameMap
  );
  const storyIr = applyCharacterRenameMapToStoryIr(
    originalStoryIr,
    characterRenameMap
  );
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
      metrics: EMPTY_PROMPT_METRICS,
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
      metrics: EMPTY_PROMPT_METRICS,
    };
  }
  const outputConstraints =
    input.outputConstraints ??
    defaultFullOutputConstraints(profile, sourceStory);
  const contractResult = buildFullStoryContract({
    storyIr,
    artifactIdentity: {
      episodeNumber: sourceStory.episodeNumber,
      episodeSlug: sourceStory.slug,
      language: input.language,
      locale: profile.locale,
      variant: "full",
    },
    outputConstraints,
    characterRenameMap,
    lineage: input.sourceCleaningReport
      ? {
          kind: "cleaned-source",
          originalSourceHash: sourceStory.sourceHash,
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
      metrics: EMPTY_PROMPT_METRICS,
    };
  }
  const mechanicsContract = buildStoryMechanicsContract({ facts: canonicalFacts, storyIr });
  const canonicalBeats = buildCanonicalStoryBeats({ story: sourceStory, facts: canonicalFacts });
  const contractPreflightIssues = validateStoryContractPreflight({ storyIr, facts: canonicalFacts, mechanics: mechanicsContract });
  diagnostics.push(...contractPreflightIssues.map((issue) => ({ code: issue.code, severity: "error" as const, message: issue.message, blocking: true })));
  if (contractPreflightIssues.length > 0) {
    return { compilerVersion: STORY_PROMPT_COMPILER_VERSION, variant: "full", system: "", user: "", responseSchema: fullNarrationResponseSchemaDescriptor, promptFingerprint: "", selectedModules: [], diagnostics, metrics: EMPTY_PROMPT_METRICS };
  }
  const context: FullStoryPromptInput = {
    variant: "full",
    language: input.language,
    languageProfile: profile,
    adaptationMode: input.adaptationMode,
    sourceStory,
    canonicalFacts,
    storyIr,
    genrePolicy: policyResolution.policy,
    classificationOutcome,
    contract: contractResult.contract as FullStoryContract,
    contractEnvelope: contractResult.envelope as FullStoryContractEnvelope,
    outputConstraints,
    mechanicsContract,
    canonicalBeats,
    canonicalStoryContract: adaptLegacyStoryToCanonicalContract({ storyIr, facts: canonicalFacts, mechanics: mechanicsContract, beats: canonicalBeats }),
    responseSchema: fullNarrationResponseSchemaDescriptor,
    localeModuleVersion: STORY_PROMPT_LOCALE_MODULE_VERSION,
    selectedLocale: profile.locale,
    characterRenameMap,
    ...(input.productionContext
      ? { productionContext: input.productionContext }
      : {}),
    ...(input.sourceCleaningReport
      ? { sourceCleaningReport: input.sourceCleaningReport }
      : {}),
  };
  const compiled = compileFromContext(context, resolvePromptBudgets("full", input.promptBudgets));
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
  const originalStoryIr = buildStoryIr(input);
  const characterRenameMap =
    input.characterRenameMap ??
    buildCharacterRenameMap({
      episodeId: input.sourceStory.episodeNumber,
      sourceHash: input.sourceStory.sourceHash,
      canonicalFacts: input.canonicalFacts,
      storyIr: originalStoryIr,
    });
  const sourceStory = applyCharacterRenameMapToParsedSource(
    input.sourceStory,
    characterRenameMap
  );
  const canonicalFacts = applyCharacterRenameMapToCanonicalFacts(
    input.canonicalFacts,
    characterRenameMap
  );
  const storyIr = applyCharacterRenameMapToStoryIr(
    originalStoryIr,
    characterRenameMap
  );
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
      metrics: EMPTY_PROMPT_METRICS,
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
    sourceStory,
    canonicalFacts,
    storyIr,
    genrePolicy: policyResolution.policy as GenrePolicy,
    classificationOutcome,
    outputConstraints,
    responseSchema: shortNarrationResponseSchemaDescriptor,
    sourceExtraction: input.sourceExtraction,
    adaptationContract: input.adaptationContract,
    localeModuleVersion: STORY_PROMPT_LOCALE_MODULE_VERSION,
    selectedLocale: profile.locale,
    characterRenameMap,
    ...(input.productionContext
      ? { productionContext: input.productionContext }
      : {}),
    ...(input.sourceCleaningReport
      ? { sourceCleaningReport: input.sourceCleaningReport }
      : {}),
  };
  const compiled = compileFromContext(context, resolvePromptBudgets("short", input.promptBudgets));
  return {
    ...compiled,
    diagnostics: [...diagnostics, ...compiled.diagnostics],
  };
}
