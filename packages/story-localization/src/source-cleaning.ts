import { hashText, normalizeWhitespace } from "@mediaforge/shared";
import { z } from "zod";
import { type StoryArtifactIdentity } from "./story-artifact-model.js";

export const SOURCE_CLEANING_SCHEMA_VERSION = "source-cleaning-report-v1";
export const SOURCE_CLEANER_VERSION = "source-cleaner-v1";
export const SOURCE_CLEANING_RULE_VERSION = "source-cleaning-rules-v1";

export const sourceSegmentKindSchema = z.enum([
  "narration",
  "heading",
  "frontmatter",
  "metadata",
  "audio-instruction",
  "visual-direction",
  "thumbnail",
  "seo",
  "production-note",
  "structural-commentary",
  "internal-marker",
  "prompt-fragment",
  "diagnostic",
  "unknown",
]);
export type SourceSegmentKind = z.infer<typeof sourceSegmentKindSchema>;

export const sourceCleaningActionSchema = z.enum([
  "preserved",
  "normalized",
  "removed",
  "flagged",
]);
export type SourceCleaningAction = z.infer<typeof sourceCleaningActionSchema>;

export const sourceCleaningReasonCodeSchema = z.enum([
  "NORMALIZED_UTF8_BOM",
  "NORMALIZED_LINE_ENDINGS",
  "NORMALIZED_TRAILING_WHITESPACE",
  "NORMALIZED_REPEATED_BLANK_LINES",
  "REMOVED_INTERNAL_MARKER",
  "REMOVED_HTML_COMMENT",
  "REMOVED_FRONTMATTER",
  "REMOVED_PRODUCTION_HEADING",
  "REMOVED_METADATA_SECTION",
  "REMOVED_AUDIO_INSTRUCTION",
  "REMOVED_VISUAL_DIRECTION",
  "REMOVED_THUMBNAIL_CONTENT",
  "REMOVED_SEO_CONTENT",
  "REMOVED_PROMPT_FRAGMENT",
  "REMOVED_DIAGNOSTIC_SECTION",
  "FLAGGED_STRUCTURAL_COMMENTARY",
  "FLAGGED_AMBIGUOUS_SECTION",
  "FLAGGED_PRODUCTION_LIKE_NARRATION",
  "FLAGGED_MALFORMED_FRONTMATTER",
]);
export type SourceCleaningReasonCode = z.infer<typeof sourceCleaningReasonCodeSchema>;

export const sourceRoleSchema = z.enum([
  "raw-author-source",
  "canonical-source-copy",
  "generated-english-full",
  "localized-full",
  "short-source",
  "compatibility-input",
  "unknown",
]);
export type SourceRole = z.infer<typeof sourceRoleSchema>;

export const sourceResolvedFromSchema = z.enum([
  "explicit-input",
  "canonical-search",
  "deterministic-search",
  "canonical-path",
  "batch-manifest",
  "legacy-episode",
  "unknown",
]);
export type SourceResolvedFrom = z.infer<typeof sourceResolvedFromSchema>;

const partialArtifactIdentitySchema = z.object({
  episodeNumber: z.string().min(1).optional(),
  episodeSlug: z.string().min(1).optional(),
  language: z.enum(["en", "de", "es", "fr", "pt"]).optional(),
  locale: z.string().min(1).optional(),
  variant: z.enum(["full", "short"]).optional(),
}).strict();

export const sourceTextRangeSchema = z.object({
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
}).strict();

export const sourceLineRangeSchema = z.object({
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
}).strict();

export const sourceSegmentSchema = z.object({
  id: z.string().min(1),
  kind: sourceSegmentKindSchema,
  action: sourceCleaningActionSchema,
  reasonCodes: z.array(sourceCleaningReasonCodeSchema),
  originalText: z.string(),
  cleanedText: z.string().optional(),
  originalRange: sourceTextRangeSchema,
  lineRange: sourceLineRangeSchema,
  confidence: z.enum(["exact", "structural", "heuristic", "ambiguous"]),
  preserveForNarration: z.boolean(),
}).strict();
export type SourceSegment = z.infer<typeof sourceSegmentSchema>;

export const sourceCleaningWarningSchema = z.object({
  code: sourceCleaningReasonCodeSchema,
  message: z.string().min(1),
  segmentId: z.string().min(1).optional(),
}).strict();
export type SourceCleaningWarning = z.infer<typeof sourceCleaningWarningSchema>;

export const sourceCleaningFatalSchema = z.object({
  code: z.enum([
    "EMPTY_SOURCE",
    "EMPTY_CLEANED_SOURCE",
    "ONLY_REMOVABLE_CONTAMINATION",
    "UNSUPPORTED_ENCODING",
    "OVERLAPPING_SEGMENTS",
  ]),
  message: z.string().min(1),
}).strict();
export type SourceCleaningFatal = z.infer<typeof sourceCleaningFatalSchema>;

export const sourceCleaningReportSchema = z.object({
  schemaVersion: z.literal(SOURCE_CLEANING_SCHEMA_VERSION),
  cleanerVersion: z.literal(SOURCE_CLEANER_VERSION),
  ruleVersion: z.literal(SOURCE_CLEANING_RULE_VERSION),
  deterministic: z.literal(true),
  sourcePath: z.string().min(1),
  sourceRole: sourceRoleSchema,
  resolvedFrom: sourceResolvedFromSchema,
  artifactIdentity: partialArtifactIdentitySchema.optional(),
  originalByteLength: z.number().int().nonnegative(),
  originalTextHash: z.string().regex(/^[a-f0-9]{64}$/u),
  normalizedTextHash: z.string().regex(/^[a-f0-9]{64}$/u),
  cleanedTextHash: z.string().regex(/^[a-f0-9]{64}$/u),
  cleaningFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  normalizationStats: z.object({
    removedBom: z.boolean(),
    normalizedLineEndings: z.number().int().nonnegative(),
    trimmedTrailingWhitespaceLines: z.number().int().nonnegative(),
    collapsedBlankLineRuns: z.number().int().nonnegative(),
  }).strict(),
  segments: z.array(sourceSegmentSchema),
  removedSegments: z.array(sourceSegmentSchema),
  flaggedSegments: z.array(sourceSegmentSchema),
  warnings: z.array(sourceCleaningWarningSchema),
  fatal: sourceCleaningFatalSchema.optional(),
}).strict();
export type SourceCleaningReport = z.infer<typeof sourceCleaningReportSchema>;

export const sourceCleaningResultSchema = z.object({
  cleanedText: z.string(),
  report: sourceCleaningReportSchema,
}).strict();
export type SourceCleaningResult = z.infer<typeof sourceCleaningResultSchema>;

export interface SourceCleaningInput {
  readonly sourcePath: string;
  readonly text: string;
  readonly sourceRole: SourceRole;
  readonly resolvedFrom: SourceResolvedFrom;
  readonly artifactIdentity?: Partial<StoryArtifactIdentity> | undefined;
}

type SectionClassification = {
  readonly kind: SourceSegmentKind;
  readonly reasonCode: SourceCleaningReasonCode;
};

type Block = {
  readonly text: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly startLine: number;
  readonly endLine: number;
};

const sectionHeadingPattern = /^(#{1,6})\s+(.+?)\s*$/u;
const htmlCommentPattern = /^\s*<!--([\s\S]*?)-->\s*$/u;

const productionHeadings = new Map<string, SectionClassification>([
  ["episode metadata", { kind: "metadata", reasonCode: "REMOVED_METADATA_SECTION" }],
  ["short metadata", { kind: "metadata", reasonCode: "REMOVED_METADATA_SECTION" }],
  ["metadaten des episodes", { kind: "metadata", reasonCode: "REMOVED_METADATA_SECTION" }],
  ["episoden-metadaten", { kind: "metadata", reasonCode: "REMOVED_METADATA_SECTION" }],
  ["metadatos del episodio", { kind: "metadata", reasonCode: "REMOVED_METADATA_SECTION" }],
  ["metadatos del corto", { kind: "metadata", reasonCode: "REMOVED_METADATA_SECTION" }],
  ["métadonnées de l'épisode", { kind: "metadata", reasonCode: "REMOVED_METADATA_SECTION" }],
  ["métadonnées de l’episode", { kind: "metadata", reasonCode: "REMOVED_METADATA_SECTION" }],
  ["métadonnées de l’épisode", { kind: "metadata", reasonCode: "REMOVED_METADATA_SECTION" }],
  ["metadados do episódio", { kind: "metadata", reasonCode: "REMOVED_METADATA_SECTION" }],
  ["metadados do short", { kind: "metadata", reasonCode: "REMOVED_METADATA_SECTION" }],
  ["audio generation instructions", { kind: "audio-instruction", reasonCode: "REMOVED_AUDIO_INSTRUCTION" }],
  ["audio instructions", { kind: "audio-instruction", reasonCode: "REMOVED_AUDIO_INSTRUCTION" }],
  ["narration instructions", { kind: "audio-instruction", reasonCode: "REMOVED_AUDIO_INSTRUCTION" }],
  ["anweisungen zur audiogenerierung", { kind: "audio-instruction", reasonCode: "REMOVED_AUDIO_INSTRUCTION" }],
  ["instrucciones para generar el audio", { kind: "audio-instruction", reasonCode: "REMOVED_AUDIO_INSTRUCTION" }],
  ["instructions de génération audio", { kind: "audio-instruction", reasonCode: "REMOVED_AUDIO_INSTRUCTION" }],
  ["instruções de geração de áudio", { kind: "audio-instruction", reasonCode: "REMOVED_AUDIO_INSTRUCTION" }],
  ["visual direction", { kind: "visual-direction", reasonCode: "REMOVED_VISUAL_DIRECTION" }],
  ["scene plan", { kind: "visual-direction", reasonCode: "REMOVED_VISUAL_DIRECTION" }],
  ["image prompts", { kind: "visual-direction", reasonCode: "REMOVED_VISUAL_DIRECTION" }],
  ["thumbnail", { kind: "thumbnail", reasonCode: "REMOVED_THUMBNAIL_CONTENT" }],
  ["thumbnail text", { kind: "thumbnail", reasonCode: "REMOVED_THUMBNAIL_CONTENT" }],
  ["seo", { kind: "seo", reasonCode: "REMOVED_SEO_CONTENT" }],
  ["youtube metadata", { kind: "seo", reasonCode: "REMOVED_SEO_CONTENT" }],
  ["production notes", { kind: "production-note", reasonCode: "REMOVED_PRODUCTION_HEADING" }],
  ["production directions", { kind: "production-note", reasonCode: "REMOVED_PRODUCTION_HEADING" }],
  ["diagnostics", { kind: "diagnostic", reasonCode: "REMOVED_DIAGNOSTIC_SECTION" }],
  ["validation notes", { kind: "diagnostic", reasonCode: "REMOVED_DIAGNOSTIC_SECTION" }],
  ["repair history", { kind: "diagnostic", reasonCode: "REMOVED_DIAGNOSTIC_SECTION" }],
  ["response schema", { kind: "prompt-fragment", reasonCode: "REMOVED_PROMPT_FRAGMENT" }],
  ["prompt", { kind: "prompt-fragment", reasonCode: "REMOVED_PROMPT_FRAGMENT" }],
]);

const productionFieldPatterns: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly kind: SourceSegmentKind;
  readonly reasonCode: SourceCleaningReasonCode;
}> = [
  { pattern: /^\s*(?:\*\*)?(?:suggested\s+)?thumbnail(?:\s+text)?(?:\*\*)?\s*:/iu, kind: "thumbnail", reasonCode: "REMOVED_THUMBNAIL_CONTENT" },
  { pattern: /^\s*(?:\*\*)?seo\s+description(?:\*\*)?\s*:/iu, kind: "seo", reasonCode: "REMOVED_SEO_CONTENT" },
  { pattern: /^\s*(?:\*\*)?(?:suggested\s+)?tags(?:\*\*)?\s*:/iu, kind: "seo", reasonCode: "REMOVED_SEO_CONTENT" },
  { pattern: /^\s*(?:\*\*)?hashtags(?:\*\*)?\s*:/iu, kind: "seo", reasonCode: "REMOVED_SEO_CONTENT" },
  { pattern: /^\s*(?:\*\*)?visual\s+direction(?:\*\*)?\s*:/iu, kind: "visual-direction", reasonCode: "REMOVED_VISUAL_DIRECTION" },
  { pattern: /^\s*(?:\*\*)?sound\s+motif(?:\*\*)?\s*:/iu, kind: "audio-instruction", reasonCode: "REMOVED_AUDIO_INSTRUCTION" },
  { pattern: /^\s*(?:\*\*)?target\s+(?:narration\s+)?pace(?:\*\*)?\s*:/iu, kind: "metadata", reasonCode: "REMOVED_METADATA_SECTION" },
  { pattern: /^\s*(?:\*\*)?target\s+duration(?:\*\*)?\s*:/iu, kind: "metadata", reasonCode: "REMOVED_METADATA_SECTION" },
  { pattern: /^\s*(?:\*\*)?content\s+disclosure(?:\*\*)?\s*:/iu, kind: "metadata", reasonCode: "REMOVED_METADATA_SECTION" },
];

const structuralCommentaryPatterns: readonly RegExp[] = [
  /\bthe repeated detail mattered\b/iu,
  /\bthis was the point at which observation replaced disbelief\b/iu,
  /\bthe danger became personal\b/iu,
  /\bthe plan appeared to work\b/iu,
  /\bthe temporary silence created the most dangerous moment\b/iu,
  /\bthe false calm allowed the next change\b/iu,
  /\bthe final piece of evidence arrived later\b/iu,
  /\bthe evidence created a worse problem than disbelief\b/iu,
  /\bthe threat had learned\b/iu,
  /\bthe incident had responded\b/iu,
  /\bthe (?:character|protagonist|survivor)\b/iu,
];

function normalizeHeading(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[’]/gu, "'")
    .replace(/\s+/gu, " ");
}

function makeSegmentId(args: {
  readonly kind: SourceSegmentKind;
  readonly action: SourceCleaningAction;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly originalText: string;
}): string {
  return `srcseg_${hashText([
    args.kind,
    args.action,
    String(args.startOffset),
    String(args.endOffset),
    args.originalText,
  ].join("\u0000")).slice(0, 16)}`;
}

function makeSegment(args: {
  readonly kind: SourceSegmentKind;
  readonly action: SourceCleaningAction;
  readonly reasonCodes: readonly SourceCleaningReasonCode[];
  readonly originalText: string;
  readonly cleanedText?: string | undefined;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly startLine: number;
  readonly endLine: number;
  readonly confidence: SourceSegment["confidence"];
  readonly preserveForNarration: boolean;
}): SourceSegment {
  return sourceSegmentSchema.parse({
    id: makeSegmentId({
      kind: args.kind,
      action: args.action,
      startOffset: args.startOffset,
      endOffset: args.endOffset,
      originalText: args.originalText,
    }),
    kind: args.kind,
    action: args.action,
    reasonCodes: [...args.reasonCodes],
    originalText: args.originalText,
    ...(args.cleanedText !== undefined ? { cleanedText: args.cleanedText } : {}),
    originalRange: {
      startOffset: args.startOffset,
      endOffset: args.endOffset,
    },
    lineRange: {
      startLine: args.startLine,
      endLine: args.endLine,
    },
    confidence: args.confidence,
    preserveForNarration: args.preserveForNarration,
  });
}

function normalizeText(text: string): {
  readonly text: string;
  readonly stats: SourceCleaningReport["normalizationStats"];
  readonly segments: readonly SourceSegment[];
} {
  let next = text;
  const segments: SourceSegment[] = [];
  const removedBom = next.startsWith("\uFEFF");
  if (removedBom) {
    segments.push(makeSegment({
      kind: "unknown",
      action: "normalized",
      reasonCodes: ["NORMALIZED_UTF8_BOM"],
      originalText: "\uFEFF",
      cleanedText: "",
      startOffset: 0,
      endOffset: 1,
      startLine: 1,
      endLine: 1,
      confidence: "exact",
      preserveForNarration: false,
    }));
    next = next.slice(1);
  }
  const normalizedLineEndings = (next.match(/\r\n|\r/gu) ?? []).length;
  next = next.replace(/\r\n?/gu, "\n");
  const lines = next.split("\n");
  let trimmedTrailingWhitespaceLines = 0;
  const trimmed = lines.map((line) => {
    const value = line.replace(/[ \t]+$/u, "");
    if (value !== line) {
      trimmedTrailingWhitespaceLines += 1;
    }
    return value;
  }).join("\n");
  let collapsedBlankLineRuns = 0;
  const collapsed = trimmed.replace(/\n{4,}/gu, (match) => {
    collapsedBlankLineRuns += 1;
    return "\n\n\n";
  });
  return {
    text: collapsed,
    stats: {
      removedBom,
      normalizedLineEndings,
      trimmedTrailingWhitespaceLines,
      collapsedBlankLineRuns,
    },
    segments,
  };
}

function splitBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let offset = 0;
  let line = 1;
  for (const match of text.matchAll(/[^\n]*(?:\n|$)/gu)) {
    const value = match[0] ?? "";
    if (value.length === 0) {
      continue;
    }
    const startOffset = offset;
    const endOffset = offset + value.length;
    blocks.push({
      text: value.endsWith("\n") ? value.slice(0, -1) : value,
      startOffset,
      endOffset,
      startLine: line,
      endLine: line,
    });
    offset = endOffset;
    line += 1;
  }
  return blocks;
}

function classifyHeading(line: string): SectionClassification | null {
  const heading = sectionHeadingPattern.exec(line);
  if (!heading?.[2]) {
    return null;
  }
  return productionHeadings.get(normalizeHeading(heading[2])) ?? null;
}

function classifyField(line: string): SectionClassification | null {
  for (const candidate of productionFieldPatterns) {
    if (candidate.pattern.test(line)) {
      return {
        kind: candidate.kind,
        reasonCode: candidate.reasonCode,
      };
    }
  }
  return null;
}

function isNarrationHeading(line: string): boolean {
  const heading = sectionHeadingPattern.exec(line);
  if (!heading?.[2]) {
    return false;
  }
  const normalized = normalizeHeading(heading[2]);
  return normalized === "narration script" ||
    normalized === "narration" ||
    normalized === "script";
}

function isInternalComment(line: string): boolean {
  const comment = htmlCommentPattern.exec(line);
  if (!comment?.[1]) {
    return false;
  }
  return /\b(mediaforge|source-sha256|generated-full-story|debug|repair|validation)\b/iu.test(comment[1]);
}

function isWrittenMessageContext(line: string): boolean {
  return /\b(letter|email|e-mail|text message|message|sign|note|diary|journal|warning|label|recorded instruction|evidence)\b/iu.test(line) ||
    /["“”'`].{3,}["“”'`]/u.test(line);
}

function isStructuralCommentary(line: string): boolean {
  if (isWrittenMessageContext(line)) {
    return false;
  }
  return structuralCommentaryPatterns.some((pattern) => pattern.test(line));
}

function buildCleaningFingerprint(cleanedTextHash: string): string {
  return hashText([
    cleanedTextHash,
    SOURCE_CLEANER_VERSION,
    SOURCE_CLEANING_SCHEMA_VERSION,
    SOURCE_CLEANING_RULE_VERSION,
  ].join("\u0000"));
}

export function cleanSourceText(input: SourceCleaningInput): SourceCleaningResult {
  if (input.text.length === 0) {
    const normalized = normalizeText(input.text);
    const emptyHash = hashText("");
    return sourceCleaningResultSchema.parse({
      cleanedText: "",
      report: buildReport({
        input,
        normalizedText: normalized.text,
        cleanedText: "",
        normalizationStats: normalized.stats,
        segments: normalized.segments,
        fatal: {
          code: "EMPTY_SOURCE",
          message: "Source is empty.",
        },
      }),
    });
  }

  const normalized = normalizeText(input.text);
  const blocks = splitBlocks(normalized.text);
  const segments: SourceSegment[] = [...normalized.segments];
  const warnings: SourceCleaningWarning[] = [];
  const output: string[] = [];
  let activeRemoval: SectionClassification | null = null;
  let removedLineCount = 0;

  for (const block of blocks) {
    const headingClassification = classifyHeading(block.text);
    if (headingClassification) {
      activeRemoval = headingClassification;
      removedLineCount += 1;
      segments.push(makeSegment({
        kind: headingClassification.kind,
        action: "removed",
        reasonCodes: [headingClassification.reasonCode],
        originalText: block.text,
        cleanedText: "",
        startOffset: block.startOffset,
        endOffset: block.endOffset,
        startLine: block.startLine,
        endLine: block.endLine,
        confidence: "structural",
        preserveForNarration: false,
      }));
      continue;
    }

    if (isNarrationHeading(block.text) || /^#{1,6}\s+/u.test(block.text)) {
      activeRemoval = null;
    }

    if (activeRemoval && !/^#{1,6}\s+/u.test(block.text)) {
      removedLineCount += 1;
      segments.push(makeSegment({
        kind: activeRemoval.kind,
        action: "removed",
        reasonCodes: [activeRemoval.reasonCode],
        originalText: block.text,
        cleanedText: "",
        startOffset: block.startOffset,
        endOffset: block.endOffset,
        startLine: block.startLine,
        endLine: block.endLine,
        confidence: "structural",
        preserveForNarration: false,
      }));
      continue;
    }

    if (isInternalComment(block.text)) {
      removedLineCount += 1;
      segments.push(makeSegment({
        kind: "internal-marker",
        action: "removed",
        reasonCodes: ["REMOVED_INTERNAL_MARKER"],
        originalText: block.text,
        cleanedText: "",
        startOffset: block.startOffset,
        endOffset: block.endOffset,
        startLine: block.startLine,
        endLine: block.endLine,
        confidence: "exact",
        preserveForNarration: false,
      }));
      continue;
    }

    const fieldClassification = classifyField(block.text);
    if (fieldClassification) {
      removedLineCount += 1;
      segments.push(makeSegment({
        kind: fieldClassification.kind,
        action: "removed",
        reasonCodes: [fieldClassification.reasonCode],
        originalText: block.text,
        cleanedText: "",
        startOffset: block.startOffset,
        endOffset: block.endOffset,
        startLine: block.startLine,
        endLine: block.endLine,
        confidence: "structural",
        preserveForNarration: false,
      }));
      continue;
    }

    if (isStructuralCommentary(block.text)) {
      const segment = makeSegment({
        kind: "structural-commentary",
        action: "flagged",
        reasonCodes: ["FLAGGED_STRUCTURAL_COMMENTARY"],
        originalText: block.text,
        cleanedText: block.text,
        startOffset: block.startOffset,
        endOffset: block.endOffset,
        startLine: block.startLine,
        endLine: block.endLine,
        confidence: "heuristic",
        preserveForNarration: true,
      });
      segments.push(segment);
      warnings.push({
        code: "FLAGGED_STRUCTURAL_COMMENTARY",
        message: "Possible structural commentary was retained for downstream validation.",
        segmentId: segment.id,
      });
    }

    output.push(block.text);
  }

  const cleanedText = output.join("\n").replace(/\n{4,}/gu, "\n\n\n").trimEnd();
  const fatal = normalizeWhitespace(cleanedText).length === 0
    ? {
        code: removedLineCount > 0 ? "ONLY_REMOVABLE_CONTAMINATION" : "EMPTY_CLEANED_SOURCE",
        message: removedLineCount > 0
          ? "Cleaning removed all source content as production-only contamination."
          : "Cleaning produced an empty source.",
      } as const
    : undefined;

  return sourceCleaningResultSchema.parse({
    cleanedText,
    report: buildReport({
      input,
      normalizedText: normalized.text,
      cleanedText,
      normalizationStats: normalized.stats,
      segments,
      warnings,
      fatal,
    }),
  });
}

function buildReport(args: {
  readonly input: SourceCleaningInput;
  readonly normalizedText: string;
  readonly cleanedText: string;
  readonly normalizationStats: SourceCleaningReport["normalizationStats"];
  readonly segments: readonly SourceSegment[];
  readonly warnings?: readonly SourceCleaningWarning[];
  readonly fatal?: SourceCleaningFatal | undefined;
}): SourceCleaningReport {
  const sortedSegments = [...args.segments].sort((left, right) =>
    left.originalRange.startOffset === right.originalRange.startOffset
      ? left.id.localeCompare(right.id)
      : left.originalRange.startOffset - right.originalRange.startOffset
  );
  const cleanedTextHash = hashText(args.cleanedText);
  return sourceCleaningReportSchema.parse({
    schemaVersion: SOURCE_CLEANING_SCHEMA_VERSION,
    cleanerVersion: SOURCE_CLEANER_VERSION,
    ruleVersion: SOURCE_CLEANING_RULE_VERSION,
    deterministic: true,
    sourcePath: args.input.sourcePath,
    sourceRole: args.input.sourceRole,
    resolvedFrom: args.input.resolvedFrom,
    ...(args.input.artifactIdentity ? { artifactIdentity: args.input.artifactIdentity } : {}),
    originalByteLength: Buffer.byteLength(args.input.text, "utf8"),
    originalTextHash: hashText(args.input.text),
    normalizedTextHash: hashText(args.normalizedText),
    cleanedTextHash,
    cleaningFingerprint: buildCleaningFingerprint(cleanedTextHash),
    normalizationStats: args.normalizationStats,
    segments: sortedSegments,
    removedSegments: sortedSegments.filter((segment) => segment.action === "removed"),
    flaggedSegments: sortedSegments.filter((segment) => segment.action === "flagged"),
    warnings: [...(args.warnings ?? [])].sort((left, right) =>
      (left.segmentId ?? "").localeCompare(right.segmentId ?? "") || left.code.localeCompare(right.code)
    ),
    ...(args.fatal ? { fatal: args.fatal } : {}),
  });
}
