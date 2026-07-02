import fs from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { loadRuntimeConfig } from "@mediaforge/config";
import { normalizeLocaleCode, normalizeWhitespace } from "@mediaforge/shared";
import {
  buildCanonicalEpisodeSlug,
  assessShortNarrationQuality,
  shortRewriteArtifactSchema,
  type ShortRewriteArtifact,
  type ShortNarrationQualitySummary,
  type StoryLanguage,
} from "@mediaforge/story-localization";

interface StoryShortEvaluateCliOptions {
  readonly episode?: string;
  readonly episodeSlug?: string;
  readonly language?: string;
  readonly duration?: 30 | 45 | 60 | 75;
  readonly outputRoot?: string;
  readonly json?: boolean;
}

interface StoryShortEvaluateReport {
  readonly episodeId: string;
  readonly episodeSlug: string;
  readonly language: StoryLanguage;
  readonly locale: string;
  readonly sourceArtifactPath: string;
  readonly metadataPath: string;
  readonly selectedEventCount: number;
  readonly selectedEventIds: readonly string[];
  readonly selectedEventStatements: readonly string[];
  readonly beatPlan: ShortRewriteArtifact["shortSourceExtraction"]["beatPlan"];
  readonly eventDensity: number;
  readonly abstractCommentaryRatio: number;
  readonly visualizabilityRatio: number;
  readonly storyStateCount: number;
  readonly causalFailures: readonly string[];
  readonly localizationIssues: readonly string[];
  readonly quality: ShortNarrationQualitySummary | undefined;
  readonly validationIssues: readonly string[];
  readonly metadataIssues: readonly string[];
  readonly finalPass: boolean;
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function parseEpisodeInput(value: string | undefined): {
  readonly episodeId: string;
  readonly episodeSlug: string;
} {
  const normalized = normalizeWhitespace(value ?? "");
  if (!normalized) {
    throw new Error("An episode or episode slug is required.");
  }
  const match = /^(\d{3})(?:[-_](.+))?$/u.exec(normalized);
  if (match) {
    const episodeId = match[1] ?? normalized;
    const episodeSlug = match[2] ? `${episodeId}-${match[2]}` : episodeId;
    return { episodeId, episodeSlug };
  }
  return {
    episodeId: normalized.split("-", 1)[0] ?? normalized,
    episodeSlug: normalized,
  };
}

function resolveArtifactPath(args: {
  readonly outputRoot: string;
  readonly episodeSlug: string;
  readonly episodeId: string;
  readonly language: StoryLanguage;
}): string {
  const canonicalSlug = buildCanonicalEpisodeSlug({
    episodeNumber: args.episodeId,
    episodeSlug: args.episodeSlug,
  });
  const baseName = `${canonicalSlug}-${args.language}-short`;
  return path.join(args.outputRoot, canonicalSlug, args.language, "short", `${baseName}.json`);
}

function getLocaleHints(locale: string): {
  readonly requiredAny: readonly string[];
  readonly forbidden: readonly string[];
} {
  const normalized = locale.toLowerCase();
  if (normalized.startsWith("de")) {
    return {
      requiredAny: [" der ", " die ", " das ", " und ", " nicht ", " mit "],
      forbidden: [" the ", " and ", " because ", " here is "],
    };
  }
  if (normalized.startsWith("es")) {
    return {
      requiredAny: [" el ", " la ", " que ", " de ", " y "],
      forbidden: [" the ", " and ", " because ", " here is "],
    };
  }
  if (normalized.startsWith("fr")) {
    return {
      requiredAny: [" le ", " la ", " les ", " et ", " dans "],
      forbidden: [" the ", " and ", " because ", " here is "],
    };
  }
  if (normalized.startsWith("pt")) {
    return {
      requiredAny: [" o ", " a ", " que ", " e ", " não "],
      forbidden: [" the ", " and ", " because ", " here is "],
    };
  }
  return {
    requiredAny: [" the ", " and ", " of ", " to ", " in "],
    forbidden: [],
  };
}

function detectLocaleIssues(locale: string, values: readonly string[]): string[] {
  const combined = values.map((value) => ` ${normalizeWhitespace(value).toLowerCase()} `).join(" ");
  const hints = getLocaleHints(locale);
  const issues: string[] = [];
  if (!hints.requiredAny.some((entry) => combined.includes(entry))) {
    issues.push(`Metadata fields do not appear localized for ${locale}.`);
  }
  const forbidden = hints.forbidden.find((entry) => combined.includes(entry));
  if (forbidden) {
    issues.push(`Metadata contains likely source-language leakage: ${forbidden.trim()}.`);
  }
  return issues;
}

function normalizeExpectedDuration(
  value: number | undefined
): 30 | 45 | 60 | 75 | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === 30 || value === 45 || value === 60 || value === 75) {
    return value;
  }
  throw new Error(
    `Unsupported short duration ${String(value)}. Supported values: 30, 45, 60, 75.`
  );
}

function buildReport(args: {
  readonly artifact: ShortRewriteArtifact;
  readonly sourceArtifactPath: string;
  readonly metadataPath: string;
  readonly language: StoryLanguage;
  readonly expectedDurationSeconds?: 30 | 45 | 60 | 75 | undefined;
}): StoryShortEvaluateReport {
  const beatPlan = args.artifact.shortSourceExtraction.beatPlan ?? null;
  const selectedEventIds =
    args.artifact.shortSourceExtraction.selectedEventIds ??
    beatPlan?.selectedEventIds ??
    [];
  const selectedEvents =
    args.artifact.shortSourceExtraction.events?.filter((event) =>
      selectedEventIds.includes(event.id)
    ) ?? [];
  const quality =
    args.artifact.validation.quality ??
    (beatPlan
      ? assessShortNarrationQuality({
          narrationText: args.artifact.generation.narration,
          selectedEvents,
          beatPlan,
          causalValidation:
            args.artifact.shortSourceExtraction.causalValidation ?? {
              status: "failed",
              issues: ["Missing short causal validation."],
            },
          language: args.language,
          targetDurationSeconds: beatPlan.targetDurationSeconds,
          ...(args.artifact.shortSourceExtraction.events !== undefined
            ? {
                totalEventCount:
                  args.artifact.shortSourceExtraction.events.length,
              }
            : {}),
        })
      : undefined);
  const metadataIssues = detectLocaleIssues(args.artifact.locale, [
    args.artifact.generation.title,
    args.artifact.generation.thumbnailText,
    args.artifact.generation.fullVideoBridge,
  ]);
  if (
    args.expectedDurationSeconds !== undefined &&
    beatPlan?.targetDurationSeconds !== args.expectedDurationSeconds
  ) {
    metadataIssues.push(
      `Beat plan duration ${String(beatPlan?.targetDurationSeconds ?? "missing")} does not match expected ${args.expectedDurationSeconds}.`
    );
  }
  const localizationIssues =
    quality?.issues
      .filter((issue) => /LOCALE|LANGUAGE/u.test(issue.code))
      .map((issue) => issue.message) ?? [];
  return {
    episodeId: args.artifact.episodeId,
    episodeSlug: args.artifact.episodeSlug,
    language: args.language,
    locale: args.artifact.locale,
    sourceArtifactPath: args.sourceArtifactPath,
    metadataPath: args.metadataPath,
    selectedEventCount: selectedEventIds.length,
    selectedEventIds,
    selectedEventStatements: selectedEvents.map((event) => event.statement),
    beatPlan,
    eventDensity: quality?.eventDensity ?? selectedEventIds.length,
    abstractCommentaryRatio: quality?.abstractCommentaryRatio ?? 0,
    visualizabilityRatio: quality?.visualizabilityRatio ?? 0,
    storyStateCount: quality?.storyStateCount ?? 0,
    causalFailures: quality?.causalDependencyFailures ?? [],
    localizationIssues,
    quality,
    validationIssues:
      quality?.issues.map((issue) => issue.message) ??
      args.artifact.validation.warnings,
    metadataIssues,
    finalPass:
      beatPlan !== null &&
      quality !== undefined &&
      args.artifact.validation.hardWordRangeSatisfied &&
      args.artifact.validation.hookMatchesNarration &&
      metadataIssues.length === 0 &&
      quality.issues.every((issue) => issue.severity !== "error"),
  };
}

export function registerStoryShortEvaluateCommand(program: Command): void {
  program
    .command("story-short-evaluate")
    .description("Evaluate an existing localized short without regenerating assets")
    .option("--episode <id-or-slug>", "episode id or slug")
    .option("--episode-slug <slug>", "explicit canonical episode slug")
    .option("--language <code>", "target language", "de")
    .option("--duration <seconds>", "expected short duration in seconds (30, 45, 60, 75)", (value) => Number(value))
    .option("--output-root <path>", "workspace output root")
    .option("--json", "print machine-readable output")
    .action(async (opts: StoryShortEvaluateCliOptions) => {
      const runtimeConfig = await loadRuntimeConfig();
      const outputRoot = path.resolve(opts.outputRoot ?? runtimeConfig.workspaceDir);
      const { episodeId, episodeSlug } = parseEpisodeInput(opts.episodeSlug ?? opts.episode);
      const language = (normalizeLocaleCode(opts.language ?? "de") as StoryLanguage) ?? "de";
      const artifactPath = resolveArtifactPath({
        outputRoot,
        episodeSlug,
        episodeId,
        language,
      });
      const metadataPath = path.join(
        outputRoot,
        buildCanonicalEpisodeSlug({ episodeNumber: episodeId, episodeSlug }),
        language,
        "short",
        "metadata.json"
      );
      const artifactRaw = await fs.readFile(artifactPath, "utf8");
      const artifact = shortRewriteArtifactSchema.parse(JSON.parse(artifactRaw) as unknown);
      const report = buildReport({
        artifact,
        sourceArtifactPath: artifactPath,
        metadataPath,
        language,
        expectedDurationSeconds: normalizeExpectedDuration(opts.duration),
      });
      if (opts.json) {
        printJson(report);
      } else {
        process.stdout.write(
          [
            `Episode: ${report.episodeId} — ${report.episodeSlug}`,
            `Selected events: ${report.selectedEventIds.join(", ") || "none"}`,
            `Event statements: ${report.selectedEventStatements.join(" | ") || "none"}`,
            `Beat plan: ${report.beatPlan?.endingStrategy ?? "missing"} / ${report.beatPlan?.targetDurationSeconds ?? "unknown"}s`,
            `Event density: ${report.eventDensity}`,
            `Abstract ratio: ${report.abstractCommentaryRatio.toFixed(2)}`,
            `Visualizability: ${report.visualizabilityRatio.toFixed(2)}`,
            `Story states: ${report.storyStateCount}`,
            `Causal failures: ${report.causalFailures.length}`,
            `Localization issues: ${report.localizationIssues.length}`,
            `Metadata issues: ${report.metadataIssues.length}`,
            `Final: ${report.finalPass ? "pass" : "fail"}`,
          ].join("\n") + "\n"
        );
      }
      if (!report.finalPass) {
        process.exitCode = 1;
      }
    });
}
