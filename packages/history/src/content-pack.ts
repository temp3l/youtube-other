import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { episodeManifestSchema, type EpisodeId, type EpisodeManifest } from "@mediaforge/domain";
import { ensureDir, normalizeEpisodeId, writeJsonAtomic, writeTextAtomic } from "@mediaforge/shared";
import { load as loadYaml, JSON_SCHEMA, YAMLException } from "js-yaml";
import { Lexer, type Token, type Tokens } from "marked";
import { z } from "zod";
import { historicalPeriodSchema, type HistoricalPeriod, type HistoryDocumentaryPresetId } from "./contracts.js";
import { historySourceSchema, type HistorySource } from "./research.js";
import { createHistoryWorkflowOperator, recordHistoryImportCheckpoints } from "./task-registry.js";
import {
  resolveHistoryPackCompatibility,
  type HistoryContentPackCompatibility,
  type HistoryContentPackEpisodeOverlay,
} from "./content-pack-overlay.js";

export const HISTORY_CONTENT_PACK_IMPORT_CONTRACT_VERSION = "history-content-pack.v1" as const;
export const HISTORY_CONTENT_PACK_IMPORTER_VERSION = "mediaforge-history-importer.v1" as const;
export const HISTORY_CONTENT_PACK_REQUIRED_SECTIONS = [
  "Core hook",
  "Chapter plan",
  "Documentary story / narration",
  "Visual direction",
  "Thumbnail direction",
  "Fact-check and editorial notes",
  "Research sources",
] as const;

const manifestVideoSchema = z.strictObject({
  file: z.string().trim().min(1),
  title: z.string().trim().min(1),
  word_count: z.number().int().positive(),
  estimated_minutes_at_108_wpm: z.number().finite().positive(),
});
const packManifestSchema = z.object({
  persona: z.string().trim().min(1),
  videos: z.array(manifestVideoSchema).min(1).max(500),
}).passthrough();

const frontmatterSchema = z.object({
  title: z.string().trim().min(1),
  slug: z.string().trim().min(1).regex(/^[a-z0-9][a-z0-9-]*$/u),
  genre: z.string().trim().min(1),
  format: z.string().trim().min(1),
  language: z.string().trim().min(1),
  status: z.string().trim().min(1),
  writer_persona: z.string().trim().min(1),
  target_duration_minutes: z.number().finite().positive(),
  estimated_duration_minutes_at_108_wpm: z.number().finite().positive(),
  script_word_count: z.number().int().positive(),
  narration_pace: z.string().trim().min(1),
  audience: z.string().trim().min(1),
  tone: z.string().trim().min(1),
  period: z.string().trim().min(1),
  regions: z.array(z.string().trim().min(1)).min(1),
  hook: z.string().trim().min(1),
  seo_title: z.string().trim().min(1),
  seo_description: z.string().trim().min(1),
  keywords: z.array(z.string().trim().min(1)),
  tags: z.array(z.string().trim().min(1)),
  thumbnail_text: z.string().trim().min(1),
  content_warnings: z.array(z.string().trim().min(1)),
  fact_check_status: z.string().trim().min(1),
}).passthrough();

export type HistoryContentPackMode = "strict" | "lenient";
export type HistoryBatchFailureMode = "fail-fast" | "collect-errors";
export type HistoryImportDiagnosticSeverity = "warning" | "error";
export interface HistoryImportDiagnostic {
  readonly code: string;
  readonly severity: HistoryImportDiagnosticSeverity;
  readonly message: string;
  readonly sourceFile?: string;
  readonly line?: number;
}

export interface ParsedMarkdownSection {
  readonly heading: string;
  readonly markdown: string;
  readonly order: number;
  readonly line: number;
}
export interface ProvisionalChapter {
  readonly timestampSeconds: number;
  readonly title: string;
  readonly originalMarkdown: string;
  readonly timingSource: "editorial-estimate";
  readonly provisional: true;
}
export interface ImportedResearchSource extends HistorySource {
  readonly episodeAssociation: string;
}
export interface ImportedContentProvenance {
  readonly packId: string;
  readonly packContractVersion: string;
  readonly sourceRelativePath: string;
  readonly sourceSha256: string;
  readonly manifestSha256: string;
  readonly readmeSha256: string;
  readonly importedAt: string;
  readonly importerVersion: string;
  readonly importContractVersion: string;
  readonly originalGenre: string;
  readonly originalFormat: string;
  readonly originalStatus: string;
  readonly revision: number;
}

const importedContentProvenanceSchema = z.strictObject({
  packId: z.string().trim().min(1),
  packContractVersion: z.string().trim().min(1),
  sourceRelativePath: z.string().trim().min(1),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  manifestSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  readmeSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  importedAt: z.string().datetime({ offset: true }),
  importerVersion: z.string().trim().min(1),
  importContractVersion: z.string().trim().min(1),
  originalGenre: z.string().trim().min(1),
  originalFormat: z.string().trim().min(1),
  originalStatus: z.string().trim().min(1),
  revision: z.number().int().positive(),
});
export interface NormalizedHistoryMetadata {
  readonly canonicalGenre: "history";
  readonly originalGenre: string;
  readonly canonicalFormat: "short" | "standard" | "long";
  readonly originalFormat: string;
  readonly formatNormalizationReason: string;
  readonly audienceLevel: "general";
  readonly originalAudience: string;
  readonly locale: "en";
  readonly originalLanguage: string;
  readonly canonicalStatus: "draft";
  readonly originalStatus: string;
  readonly validationStatus: "pending";
  readonly publishReady: false;
  readonly period: { readonly original: string; readonly taxonomy: HistoricalPeriod; readonly parsingConfidence: number };
  readonly geographicScope: { readonly kind: "regional"; readonly labels: readonly string[]; readonly originalLabels: readonly string[] };
  readonly runtime: {
    readonly targetDurationMinutes: number;
    readonly sourceDurationEstimateMinutes: number;
    readonly canonicalDurationEstimateMinutes: number;
    readonly narrationPace: string;
    readonly declaredFrontmatterWordCount: number;
    readonly declaredManifestWordCount: number;
    readonly calculatedNarrationWordCount: number;
    readonly actualDurationSeconds?: number;
  };
  readonly factCheck: {
    readonly researchProvenancePresent: true;
    readonly finalFactualValidationRequired: true;
    readonly claimExtraction: "pending";
    readonly sourceAssessment: "pending";
    readonly quotationVerification: "pending";
    readonly chronologyValidation: "pending";
  };
  readonly presetId: HistoryDocumentaryPresetId;
  readonly requiredFeatures: HistoryContentPackEpisodeOverlay["requiredFeatures"];
  readonly sensitivityTags: readonly string[];
  readonly originalFrontmatter: Readonly<Record<string, unknown>>;
  readonly extensionFrontmatter: Readonly<Record<string, unknown>>;
}
export interface ValidatedHistoryPackEpisode {
  readonly sourceFile: string;
  readonly sourceRelativePath: string;
  readonly sourceSha256: string;
  readonly episodeId: string;
  readonly publicSlug: string;
  readonly title: string;
  readonly narrationMarkdown: string;
  readonly hook: string;
  readonly chapters: readonly ProvisionalChapter[];
  readonly researchSources: readonly ImportedResearchSource[];
  readonly sections: readonly ParsedMarkdownSection[];
  readonly normalizedMetadata: NormalizedHistoryMetadata;
  readonly diagnostics: readonly HistoryImportDiagnostic[];
}
export interface HistoryContentPackValidationResult {
  readonly valid: boolean;
  readonly packId: string;
  readonly packRoot: string;
  readonly mode: HistoryContentPackMode;
  readonly manifestSha256: string;
  readonly readmeSha256: string;
  readonly discoveredFiles: readonly string[];
  readonly validatedFiles: readonly string[];
  readonly rejectedFiles: readonly string[];
  readonly episodes: readonly ValidatedHistoryPackEpisode[];
  readonly diagnostics: readonly HistoryImportDiagnostic[];
}
export interface HistoryContentPackImportRequest {
  readonly packPath: string;
  readonly genre: "history";
  readonly mode: HistoryContentPackMode;
  readonly dryRun: boolean;
  readonly failureMode: HistoryBatchFailureMode;
  readonly outputRoot?: string;
  readonly now?: () => Date;
}
export interface HistoryContentPackImportResult extends HistoryContentPackValidationResult {
  readonly dryRun: boolean;
  readonly importedEpisodes: readonly string[];
  readonly noOpEpisodes: readonly string[];
  readonly revisedEpisodes: readonly string[];
  readonly artifactLocations: Readonly<Record<string, readonly string[]>>;
  readonly pendingValidationStages: readonly string[];
  readonly nextCommands: readonly string[];
}

const knownFrontmatterKeys = new Set(Object.keys(frontmatterSchema.shape));
const hashBytes = (value: Uint8Array | string): string => crypto.createHash("sha256").update(value).digest("hex");
const diagnostic = (code: string, severity: HistoryImportDiagnosticSeverity, message: string, sourceFile?: string, line?: number): HistoryImportDiagnostic => ({
  code, severity, message, ...(sourceFile ? { sourceFile } : {}), ...(line === undefined ? {} : { line }),
});

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeRelativeFile(value: string): string | undefined {
  if (path.isAbsolute(value) || value.includes("\0")) return undefined;
  const normalized = path.posix.normalize(value.replaceAll("\\", "/"));
  if (normalized === "." || normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) return undefined;
  return normalized;
}

async function assertContainedRegularFile(rootRealPath: string, relativeFile: string): Promise<string> {
  const candidate = path.resolve(rootRealPath, relativeFile);
  const relative = path.relative(rootRealPath, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Path escapes content-pack root.");
  const real = await fs.realpath(candidate);
  const realRelative = path.relative(rootRealPath, real);
  if (!realRelative || realRelative.startsWith("..") || path.isAbsolute(realRelative)) throw new Error("Symlink escapes content-pack root.");
  const stat = await fs.stat(real);
  if (!stat.isFile()) throw new Error("Manifest entry is not a regular file.");
  return real;
}

function splitFrontmatter(source: string, sourceFile: string): { frontmatter: Readonly<Record<string, unknown>>; markdown: string; lineOffset: number } {
  const lines = source.split(/\r?\n/u);
  if (lines[0]?.trim() !== "---") throw new Error(`${sourceFile}:1: missing YAML frontmatter opening delimiter.`);
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end < 0) throw new Error(`${sourceFile}: missing YAML frontmatter closing delimiter.`);
  const yaml = lines.slice(1, end).join("\n");
  let loaded: unknown;
  try {
    loaded = loadYaml(yaml, { schema: JSON_SCHEMA, json: false, filename: sourceFile });
  } catch (error) {
    if (error instanceof YAMLException) {
      const line = (error.mark?.line ?? 0) + 2;
      throw new Error(`${sourceFile}:${line}: malformed YAML: ${error.reason ?? error.message}`);
    }
    throw error;
  }
  if (!loaded || typeof loaded !== "object" || Array.isArray(loaded)) throw new Error(`${sourceFile}: frontmatter must be a mapping.`);
  return { frontmatter: loaded as Readonly<Record<string, unknown>>, markdown: lines.slice(end + 1).join("\n"), lineOffset: end + 1 };
}

function tokenText(token: Token): string {
  if ("tokens" in token && Array.isArray(token.tokens)) return token.tokens.map(tokenText).join("");
  if (token.type === "text" || token.type === "codespan" || token.type === "escape") return token.text;
  if (token.type === "link") return token.text;
  if (token.type === "image") return token.text;
  if (token.type === "br") return " ";
  return "text" in token && typeof token.text === "string" ? token.text : "";
}

function sectionTokens(section: ParsedMarkdownSection): Token[] {
  return Lexer.lex(section.markdown);
}

function parseSections(markdown: string, lineOffset: number): { sections: ParsedMarkdownSection[]; diagnostics: HistoryImportDiagnostic[] } {
  const tokens = Lexer.lex(markdown);
  const sections: ParsedMarkdownSection[] = [];
  const diagnostics: HistoryImportDiagnostic[] = [];
  let current: { heading: string; markdown: string[]; line: number } | undefined;
  let consumedLines = lineOffset;
  for (const token of tokens) {
    const raw = token.raw ?? "";
    if (token.type === "heading" && token.depth === 2) {
      if (current) sections.push({ heading: current.heading, markdown: current.markdown.join("").trim(), order: sections.length, line: current.line });
      current = { heading: tokenText(token).trim(), markdown: [], line: consumedLines + 1 };
    } else if (current) {
      current.markdown.push(raw);
    }
    consumedLines += raw.split("\n").length - 1;
  }
  if (current) sections.push({ heading: current.heading, markdown: current.markdown.join("").trim(), order: sections.length, line: current.line });
  for (const required of HISTORY_CONTENT_PACK_REQUIRED_SECTIONS) {
    const matches = sections.filter((section) => section.heading === required);
    if (matches.length === 0) diagnostics.push(diagnostic("missing-required-section", "error", `Missing required section: ${required}.`));
    if (matches.length > 1) diagnostics.push(diagnostic("duplicate-required-section", "error", `Duplicate required section: ${required}.`));
  }
  return { sections, diagnostics };
}

function flattenTokens(tokens: readonly Token[]): Token[] {
  const output: Token[] = [];
  for (const token of tokens) {
    output.push(token);
    if ("tokens" in token && Array.isArray(token.tokens)) output.push(...flattenTokens(token.tokens));
    if (token.type === "list") for (const item of token.items) output.push(...flattenTokens(item.tokens));
  }
  return output;
}

export function countNarrationWords(markdown: string): number {
  const text = Lexer.lex(markdown).map(tokenText).join(" ").normalize("NFC");
  const segmenter = new Intl.Segmenter("en", { granularity: "word" });
  return [...segmenter.segment(text)].filter((part) => part.isWordLike).length;
}

function parseTimestamp(value: string): number | undefined {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/u.exec(value.trim());
  if (!match) return undefined;
  const first = Number(match[1]);
  const second = Number(match[2]);
  const third = match[3] === undefined ? undefined : Number(match[3]);
  if (second >= 60 || (third !== undefined && third >= 60)) return undefined;
  return third === undefined ? first * 60 + second : first * 3600 + second * 60 + third;
}

function parseChapters(section: ParsedMarkdownSection, estimatedMinutes: number): { chapters: ProvisionalChapter[]; diagnostics: HistoryImportDiagnostic[] } {
  const list = sectionTokens(section).find((token): token is Tokens.List => token.type === "list");
  if (!list) return { chapters: [], diagnostics: [diagnostic("chapter-list-missing", "error", "Chapter plan must contain a Markdown list.")] };
  const chapters: ProvisionalChapter[] = [];
  const diagnostics: HistoryImportDiagnostic[] = [];
  for (const item of list.items) {
    const rawText = tokenText({ type: "text", raw: item.raw, text: item.text, tokens: item.tokens } as Tokens.Text).trim();
    const match = /^(\d{1,2}:\d{2}(?::\d{2})?)\s*[—–-]\s*(.+)$/u.exec(rawText);
    const seconds = match?.[1] ? parseTimestamp(match[1]) : undefined;
    const title = match?.[2]?.trim();
    if (seconds === undefined || !title) {
      diagnostics.push(diagnostic("invalid-chapter", "error", `Invalid chapter entry: ${item.raw.trim()}`));
      continue;
    }
    chapters.push({ timestampSeconds: seconds, title, originalMarkdown: item.raw.trim(), timingSource: "editorial-estimate", provisional: true });
  }
  for (let index = 0; index < chapters.length; index += 1) {
    const chapter = chapters[index]!;
    if (index === 0 && chapter.timestampSeconds > 10) diagnostics.push(diagnostic("chapter-start", "error", "First chapter must begin at or near zero."));
    if (index > 0 && chapter.timestampSeconds <= chapters[index - 1]!.timestampSeconds) diagnostics.push(diagnostic("chapter-order", "error", "Chapter timestamps must be unique and strictly increasing."));
    if (chapter.timestampSeconds > estimatedMinutes * 60 + 60) diagnostics.push(diagnostic("chapter-duration", "error", "Chapter timestamp materially exceeds estimated duration."));
  }
  return { chapters, diagnostics };
}

function parseResearchSources(section: ParsedMarkdownSection, episodeAssociation: string): { sources: ImportedResearchSource[]; diagnostics: HistoryImportDiagnostic[] } {
  const tokens = flattenTokens(sectionTokens(section));
  const links = tokens.filter((token): token is Tokens.Link => token.type === "link");
  const sources: ImportedResearchSource[] = [];
  const diagnostics: HistoryImportDiagnostic[] = [];
  const urls = new Set<string>();
  for (const [index, link] of links.entries()) {
    try {
      const url = new URL(link.href);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error("unsupported protocol");
      if (urls.has(url.href)) diagnostics.push(diagnostic("duplicate-research-url", "warning", `Duplicate research URL: ${url.href}`));
      urls.add(url.href);
      const value = historySourceSchema.parse({
        id: `declared:${episodeAssociation}:${index + 1}`,
        title: tokenText(link).trim(),
        url: url.href,
        domain: url.hostname.toLowerCase(),
        status: "declared-by-pack",
        declaredByPack: true,
        originalMarkdown: link.raw,
        sourcePosition: index,
      });
      sources.push({ ...value, episodeAssociation });
    } catch (error) {
      diagnostics.push(diagnostic("malformed-research-url", "error", `Malformed research URL ${link.href}: ${asErrorMessage(error)}`));
    }
  }
  return { sources, diagnostics };
}

function normalizeSemanticText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replaceAll(/[\p{P}\p{S}\s]+/gu, " ").trim();
}

function plainSectionText(section: ParsedMarkdownSection): string {
  return sectionTokens(section).map(tokenText).join(" ").trim();
}

function classifyPeriod(source: string): { taxonomy: HistoricalPeriod; parsingConfidence: number } {
  const normalized = source.toLocaleLowerCase();
  if (/bce|bronze age|ancient|roman|ptolemaic/u.test(normalized)) return { taxonomy: "ancient", parsingConfidence: 0.9 };
  if (/medieval|middle ages|5th–15th|5th-15th/u.test(normalized)) return { taxonomy: "medieval", parsingConfidence: 0.95 };
  if (/napoleon|18th|19th|victorian|industrial/u.test(normalized)) return { taxonomy: "industrial age", parsingConfidence: 0.85 };
  if (/20th century|world war|cold war|1912/u.test(normalized)) return { taxonomy: "modern", parsingConfidence: 0.85 };
  return { taxonomy: historicalPeriodSchema.parse("cross-period"), parsingConfidence: 0.25 };
}

function matchesRule(rule: HistoryContentPackCompatibility["formatRules"][number], format: string, targetDuration: number, wordCount: number): boolean {
  if (rule.sourceFormat !== format) return false;
  const duration = rule.appliesWhen.targetDurationMinutes;
  const words = rule.appliesWhen.wordCount;
  return (!duration || (targetDuration >= duration.minInclusive && targetDuration <= duration.maxInclusive))
    && (!words || (wordCount >= words.minInclusive && wordCount <= words.maxInclusive));
}

function stableEpisodeId(packId: string, slug: string): string {
  return normalizeEpisodeId(`history-${packId}-${slug}`);
}

async function parseEpisode(args: {
  rootRealPath: string;
  relativeFile: string;
  manifestEntry: z.infer<typeof manifestVideoSchema>;
  compatibility: HistoryContentPackCompatibility;
  mode: HistoryContentPackMode;
}): Promise<ValidatedHistoryPackEpisode> {
  const sourcePath = await assertContainedRegularFile(args.rootRealPath, args.relativeFile);
  const bytes = await fs.readFile(sourcePath);
  const source = bytes.toString("utf8");
  const parsed = splitFrontmatter(source, args.relativeFile);
  const validatedFrontmatter = frontmatterSchema.safeParse(parsed.frontmatter);
  if (!validatedFrontmatter.success) throw new Error(`${args.relativeFile}: invalid frontmatter: ${validatedFrontmatter.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  const frontmatter = validatedFrontmatter.data;
  const { sections, diagnostics: sectionDiagnostics } = parseSections(parsed.markdown, parsed.lineOffset);
  const diagnostics: HistoryImportDiagnostic[] = sectionDiagnostics.map((value) => ({ ...value, sourceFile: args.relativeFile }));
  const narrationSections = sections.filter((section) => section.heading === "Documentary story / narration");
  if (narrationSections.length !== 1) throw new Error(`${args.relativeFile}: expected exactly one narration section.`);
  const narrationMarkdown = narrationSections[0]!.markdown.trim();
  if (!narrationMarkdown) throw new Error(`${args.relativeFile}: narration is empty.`);
  const wordCount = countNarrationWords(narrationMarkdown);
  const tolerance = Math.max(10, Math.ceil(wordCount * 0.02));
  if (Math.abs(frontmatter.script_word_count - wordCount) > tolerance) diagnostics.push(diagnostic("frontmatter-word-count-mismatch", args.mode === "strict" ? "error" : "warning", `Frontmatter word count ${frontmatter.script_word_count} differs from calculated narration count ${wordCount}.`, args.relativeFile));
  if (Math.abs(args.manifestEntry.word_count - wordCount) > tolerance) diagnostics.push(diagnostic("manifest-word-count-mismatch", args.mode === "strict" ? "error" : "warning", `Manifest word count ${args.manifestEntry.word_count} differs from calculated narration count ${wordCount}.`, args.relativeFile));
  const expectedDuration = Math.round((args.manifestEntry.word_count / 108) * 10) / 10;
  if (Math.abs(expectedDuration - args.manifestEntry.estimated_minutes_at_108_wpm) > 0.11) diagnostics.push(diagnostic("manifest-duration-mismatch", args.mode === "strict" ? "error" : "warning", "Manifest duration is inconsistent with its declared 108 WPM.", args.relativeFile));
  if (args.manifestEntry.title !== frontmatter.title) diagnostics.push(diagnostic("title-mismatch", args.mode === "strict" ? "error" : "warning", "Manifest and Markdown titles differ.", args.relativeFile));
  const canonicalGenre = args.compatibility.genreAliases[frontmatter.genre];
  if (!canonicalGenre) throw new Error(`${args.relativeFile}: unsupported genre alias ${frontmatter.genre}.`);
  if (frontmatter.language !== "en") throw new Error(`${args.relativeFile}: pack contract requires canonical English source language.`);
  if (frontmatter.status !== "production-ready-draft") diagnostics.push(diagnostic("status-compatibility", args.mode === "strict" ? "error" : "warning", `Unsupported source status: ${frontmatter.status}.`, args.relativeFile));
  const formatRule = args.compatibility.formatRules.find((rule) => matchesRule(rule, frontmatter.format, frontmatter.target_duration_minutes, wordCount));
  if (!formatRule) throw new Error(`${args.relativeFile}: no explicit format compatibility rule applies.`);
  const overlay = args.compatibility.episodeOverlays.find((value) => value.sourceFile === args.relativeFile);
  if (!overlay) throw new Error(`${args.relativeFile}: pack compatibility overlay is missing.`);
  const chapterSection = sections.find((section) => section.heading === "Chapter plan");
  const researchSection = sections.find((section) => section.heading === "Research sources");
  const coreHookSection = sections.find((section) => section.heading === "Core hook");
  if (!chapterSection || !researchSection || !coreHookSection) throw new Error(`${args.relativeFile}: required editorial sections are unavailable.`);
  const chapters = parseChapters(chapterSection, frontmatter.estimated_duration_minutes_at_108_wpm);
  diagnostics.push(...chapters.diagnostics.map((value) => ({ ...value, sourceFile: args.relativeFile })));
  const sources = parseResearchSources(researchSection, frontmatter.slug);
  diagnostics.push(...sources.diagnostics.map((value) => ({ ...value, sourceFile: args.relativeFile })));
  const sectionHook = plainSectionText(coreHookSection).replace(/^>\s*/u, "").trim();
  const yamlHook = normalizeSemanticText(frontmatter.hook);
  const markdownHook = normalizeSemanticText(sectionHook);
  if (yamlHook !== markdownHook) {
    const yamlWords = new Set(yamlHook.split(" "));
    const overlap = markdownHook.split(" ").filter((word) => yamlWords.has(word)).length / Math.max(1, yamlWords.size);
    diagnostics.push(diagnostic("hook-mismatch", overlap < 0.45 && args.mode === "strict" ? "error" : "warning", overlap < 0.45 ? "YAML and section hooks materially contradict or diverge." : "YAML and section hooks differ textually.", args.relativeFile));
  }
  const extensionFrontmatter = Object.fromEntries(Object.entries(parsed.frontmatter).filter(([key]) => !knownFrontmatterKeys.has(key)));
  const period = classifyPeriod(frontmatter.period);
  return {
    sourceFile: args.relativeFile,
    sourceRelativePath: args.relativeFile,
    sourceSha256: hashBytes(bytes),
    episodeId: stableEpisodeId(args.compatibility.packId, frontmatter.slug),
    publicSlug: frontmatter.slug,
    title: frontmatter.title,
    narrationMarkdown,
    hook: frontmatter.hook,
    chapters: chapters.chapters,
    researchSources: sources.sources,
    sections,
    normalizedMetadata: {
      canonicalGenre,
      originalGenre: frontmatter.genre,
      canonicalFormat: formatRule.canonicalFormat,
      originalFormat: frontmatter.format,
      formatNormalizationReason: formatRule.reason,
      audienceLevel: "general",
      originalAudience: frontmatter.audience,
      locale: "en",
      originalLanguage: frontmatter.language,
      canonicalStatus: "draft",
      originalStatus: frontmatter.status,
      validationStatus: "pending",
      publishReady: false,
      period: { original: frontmatter.period, ...period },
      geographicScope: { kind: "regional", labels: [...frontmatter.regions], originalLabels: [...frontmatter.regions] },
      runtime: {
        targetDurationMinutes: frontmatter.target_duration_minutes,
        sourceDurationEstimateMinutes: frontmatter.estimated_duration_minutes_at_108_wpm,
        canonicalDurationEstimateMinutes: Math.round((wordCount / 108) * 100) / 100,
        narrationPace: frontmatter.narration_pace,
        declaredFrontmatterWordCount: frontmatter.script_word_count,
        declaredManifestWordCount: args.manifestEntry.word_count,
        calculatedNarrationWordCount: wordCount,
      },
      factCheck: {
        researchProvenancePresent: true,
        finalFactualValidationRequired: true,
        claimExtraction: "pending",
        sourceAssessment: "pending",
        quotationVerification: "pending",
        chronologyValidation: "pending",
      },
      presetId: overlay.presetId,
      requiredFeatures: overlay.requiredFeatures,
      sensitivityTags: overlay.sensitivityTags,
      originalFrontmatter: parsed.frontmatter,
      extensionFrontmatter,
    },
    diagnostics,
  };
}

export async function inspectHistoryContentPack(packPath: string): Promise<{ packId: string; packRoot: string; manifestPresent: boolean; readmePresent: boolean; storyFiles: readonly string[] }> {
  const packRoot = await fs.realpath(path.resolve(packPath));
  const entries = await fs.readdir(packRoot, { withFileTypes: true });
  return {
    packId: path.basename(packRoot),
    packRoot,
    manifestPresent: entries.some((entry) => entry.isFile() && entry.name === "manifest.json"),
    readmePresent: entries.some((entry) => entry.isFile() && entry.name === "README.md"),
    storyFiles: entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md").map((entry) => entry.name).sort(),
  };
}

export async function validateHistoryContentPack(request: { readonly packPath: string; readonly genre: "history"; readonly mode: HistoryContentPackMode }): Promise<HistoryContentPackValidationResult> {
  if (request.genre !== "history") throw new Error("History importer requires canonical genre history.");
  const inspected = await inspectHistoryContentPack(request.packPath);
  const compatibility = resolveHistoryPackCompatibility(inspected.packId);
  if (!compatibility) throw new Error(`No versioned History compatibility contract is registered for pack ${inspected.packId}.`);
  const diagnostics: HistoryImportDiagnostic[] = [];
  if (!inspected.manifestPresent) throw new Error("Content pack is missing manifest.json.");
  if (!inspected.readmePresent) throw new Error("Content pack is missing README.md editorial contract.");
  const manifestPath = await assertContainedRegularFile(inspected.packRoot, "manifest.json");
  const readmePath = await assertContainedRegularFile(inspected.packRoot, "README.md");
  const [manifestBytes, readmeBytes] = await Promise.all([fs.readFile(manifestPath), fs.readFile(readmePath)]);
  let manifestJson: unknown;
  try { manifestJson = JSON.parse(manifestBytes.toString("utf8")); } catch (error) { throw new Error(`manifest.json is malformed: ${asErrorMessage(error)}`); }
  const manifest = packManifestSchema.parse(manifestJson);
  const manifestNames = new Set<string>();
  const normalizedEntries: Array<{ relative: string; entry: z.infer<typeof manifestVideoSchema> }> = [];
  for (const entry of manifest.videos) {
    const relative = safeRelativeFile(entry.file);
    if (!relative) throw new Error(`Unsafe manifest path: ${entry.file}`);
    if (manifestNames.has(relative)) throw new Error(`Duplicate manifest entry: ${relative}`);
    manifestNames.add(relative);
    normalizedEntries.push({ relative, entry });
  }
  const unlisted = inspected.storyFiles.filter((file) => !manifestNames.has(file));
  for (const file of unlisted) diagnostics.push(diagnostic("unlisted-story-file", request.mode === "strict" ? "error" : "warning", `Story file is not listed in manifest: ${file}`, file));
  for (const file of inspected.storyFiles) {
    if (file === "README.md") throw new Error("README.md must not be treated as an episode.");
  }
  const episodes: ValidatedHistoryPackEpisode[] = [];
  const rejectedFiles: string[] = [];
  for (const { relative, entry } of normalizedEntries.sort((left, right) => left.relative.localeCompare(right.relative, "en"))) {
    try {
      const episode = await parseEpisode({ rootRealPath: inspected.packRoot, relativeFile: relative, manifestEntry: entry, compatibility, mode: request.mode });
      episodes.push(episode);
      diagnostics.push(...episode.diagnostics);
      if (episode.diagnostics.some((value) => value.severity === "error")) rejectedFiles.push(relative);
    } catch (error) {
      rejectedFiles.push(relative);
      diagnostics.push(diagnostic("episode-invalid", "error", asErrorMessage(error), relative));
    }
  }
  const slugs = new Set<string>();
  for (const episode of episodes) {
    if (slugs.has(episode.publicSlug)) diagnostics.push(diagnostic("duplicate-slug", "error", `Duplicate episode slug: ${episode.publicSlug}`, episode.sourceFile));
    slugs.add(episode.publicSlug);
  }
  const errorFiles = new Set(diagnostics.filter((value) => value.severity === "error").map((value) => value.sourceFile).filter((value): value is string => Boolean(value)));
  return {
    valid: !diagnostics.some((value) => value.severity === "error"),
    packId: compatibility.packId,
    packRoot: inspected.packRoot,
    mode: request.mode,
    manifestSha256: hashBytes(manifestBytes),
    readmeSha256: hashBytes(readmeBytes),
    discoveredFiles: inspected.storyFiles,
    validatedFiles: episodes.filter((episode) => !errorFiles.has(episode.sourceFile)).map((episode) => episode.sourceFile),
    rejectedFiles: [...new Set(rejectedFiles)].sort(),
    episodes,
    diagnostics,
  };
}

export const HISTORY_PENDING_WORKFLOW_TASKS = [
  "source-retrieval-assessment", "claim-extraction", "claim-to-source-mapping", "chronology-validation", "quotation-verification", "historical-factuality-audit", "script-repair-if-required", "pronunciation-planning", "visual-beat-planning", "map-timeline-planning", "localization", "audio-generation", "final-chapter-alignment", "image-generation", "video-rendering", "thumbnail-rendering", "publish-validation",
] as const;

async function findPublicSlugCollision(outputRoot: string, episode: ValidatedHistoryPackEpisode): Promise<string | undefined> {
  let entries: string[] = [];
  try { entries = await fs.readdir(outputRoot); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  for (const entry of entries.sort()) {
    if (entry === episode.episodeId) continue;
    const manifestPath = path.join(outputRoot, entry, "manifest.json");
    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as { slug?: unknown };
      if (manifest.slug === episode.publicSlug) return entry;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    }
  }
  return undefined;
}

async function readExistingProvenance(episodeRoot: string): Promise<ImportedContentProvenance | undefined> {
  try {
    return importedContentProvenanceSchema.parse(
      JSON.parse(await fs.readFile(path.join(episodeRoot, "source", "import-provenance.json"), "utf8"))
    );
  }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

async function readExistingManifest(episodeRoot: string): Promise<EpisodeManifest | undefined> {
  try {
    return episodeManifestSchema.parse(
      JSON.parse(await fs.readFile(path.join(episodeRoot, "manifest.json"), "utf8"))
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function importEpisode(args: {
  episode: ValidatedHistoryPackEpisode;
  validation: HistoryContentPackValidationResult;
  outputRoot: string;
  importedAt: string;
}): Promise<{ status: "imported" | "no-op" | "revised"; paths: readonly string[] }> {
  const episodeRoot = path.join(args.outputRoot, args.episode.episodeId);
  const transactionPath = path.join(episodeRoot, "source", ".import-in-progress.json");
  const existingProvenance = await readExistingProvenance(episodeRoot);
  let recoverableTransaction = false;
  try {
    const transaction = z.object({ packId: z.string(), sourceSha256: z.string() }).passthrough().parse(JSON.parse(await fs.readFile(transactionPath, "utf8")));
    recoverableTransaction = transaction.packId === args.validation.packId && transaction.sourceSha256 === args.episode.sourceSha256;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (!existingProvenance) {
    try {
      const stat = await fs.stat(episodeRoot);
      if (stat.isDirectory() && !recoverableTransaction) throw new Error(`Refusing to overwrite manually authored episode directory ${args.episode.episodeId}.`);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  if (existingProvenance?.packId !== undefined && existingProvenance.packId !== args.validation.packId) throw new Error(`Episode ${args.episode.episodeId} belongs to another content pack.`);
  if (
    existingProvenance?.sourceSha256 === args.episode.sourceSha256
    && existingProvenance.manifestSha256 === args.validation.manifestSha256
    && existingProvenance.readmeSha256 === args.validation.readmeSha256
  ) {
    try {
      await fs.access(path.join(episodeRoot, "state", "workflow", "history.production", "state.json"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await recordHistoryImportCheckpoints({ unitRoot: episodeRoot, episodeId: args.episode.episodeId });
    }
    await fs.unlink(transactionPath).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    });
    return { status: "no-op", paths: [] };
  }
  const revision = existingProvenance ? existingProvenance.revision + 1 : 1;
  const status = existingProvenance ? "revised" : "imported";
  const existingManifest = existingProvenance ? await readExistingManifest(episodeRoot) : undefined;
  if (existingProvenance && !existingManifest) {
    throw new Error(`Imported episode ${args.episode.episodeId} is missing its canonical manifest; refusing an unsafe revision.`);
  }
  if (existingProvenance) {
    const operator = createHistoryWorkflowOperator({ unitRoot: episodeRoot, episodeId: args.episode.episodeId });
    await operator.invalidate(
      "history.source-discovery",
      `Content-pack source revision ${revision} invalidated all derived History workflow tasks.`
    );
  }
  const provenance: ImportedContentProvenance = {
    packId: args.validation.packId,
    packContractVersion: resolveHistoryPackCompatibility(args.validation.packId)!.contractVersion,
    sourceRelativePath: args.episode.sourceRelativePath,
    sourceSha256: args.episode.sourceSha256,
    manifestSha256: args.validation.manifestSha256,
    readmeSha256: args.validation.readmeSha256,
    importedAt: args.importedAt,
    importerVersion: HISTORY_CONTENT_PACK_IMPORTER_VERSION,
    importContractVersion: HISTORY_CONTENT_PACK_IMPORT_CONTRACT_VERSION,
    originalGenre: args.episode.normalizedMetadata.originalGenre,
    originalFormat: args.episode.normalizedMetadata.originalFormat,
    originalStatus: args.episode.normalizedMetadata.originalStatus,
    revision,
  };
  const paths = {
    manifest: path.join(episodeRoot, "manifest.json"),
    provenance: path.join(episodeRoot, "source", "import-provenance.json"),
    revision: path.join(episodeRoot, "source", "revisions", `${String(revision).padStart(4, "0")}-${args.episode.sourceSha256}.json`),
    metadata: path.join(episodeRoot, "source", "normalized-metadata.json"),
    editorial: path.join(episodeRoot, "source", "editorial-sections.json"),
    research: path.join(episodeRoot, "source", "research-sources.json"),
    chapters: path.join(episodeRoot, "source", "provisional-chapters.json"),
    validation: path.join(episodeRoot, "source", "validation-report.json"),
    script: path.join(episodeRoot, "languages", "script-en.md"),
  };
  const now = args.importedAt;
  const manifest = episodeManifestSchema.parse({
    ...existingManifest,
    episodeId: args.episode.episodeId as EpisodeId,
    slug: args.episode.publicSlug,
    source: { platform: "local-file", filePath: path.join(args.validation.packRoot, args.episode.sourceRelativePath) },
    sourceMetadata: {
      genre: "history",
      history: {
        ...args.episode.normalizedMetadata,
        derivedArtifactsStale: status === "revised",
      },
      provenance,
    },
    images: existingManifest?.images ?? [],
    artifacts: existingManifest?.artifacts ?? [],
    pipelineRuns: existingManifest?.pipelineRuns ?? [],
    createdAt: existingManifest?.createdAt ?? existingProvenance?.importedAt ?? now,
    updatedAt: now,
  });
  await Promise.all(Object.values(paths).map((file) => ensureDir(path.dirname(file))));
  await writeJsonAtomic(transactionPath, { packId: args.validation.packId, sourceSha256: args.episode.sourceSha256, manifestSha256: args.validation.manifestSha256, revision, startedAt: now });
  await writeJsonAtomic(paths.revision, provenance);
  await writeJsonAtomic(paths.metadata, args.episode.normalizedMetadata);
  await writeJsonAtomic(paths.editorial, { sections: args.episode.sections.filter((section) => section.heading !== "Documentary story / narration"), visualDirection: args.episode.sections.find((section) => section.heading === "Visual direction"), thumbnailDirection: args.episode.sections.find((section) => section.heading === "Thumbnail direction"), factCheckAndEditorialNotes: args.episode.sections.find((section) => section.heading === "Fact-check and editorial notes") });
  await writeJsonAtomic(paths.research, { status: "declared-by-pack", approvedEvidenceCount: 0, sources: args.episode.researchSources });
  await writeJsonAtomic(paths.chapters, { editorial: args.episode.chapters, final: null, publishingTimingSource: null });
  await writeJsonAtomic(paths.validation, {
    status: "pending",
    publishReady: false,
    structuralImportPassed: true,
    factualValidationPassed: false,
    mediaValidationPassed: false,
    releaseValidationPassed: false,
    derivedArtifactsStale: status === "revised",
    retainedArtifactCount: existingManifest?.artifacts.length ?? 0,
    retainedPipelineRunCount: existingManifest?.pipelineRuns.length ?? 0,
    diagnostics: args.episode.diagnostics,
  });
  await writeTextAtomic(paths.script, `${args.episode.narrationMarkdown.trim()}\n`);
  await writeJsonAtomic(paths.manifest, manifest);
  await recordHistoryImportCheckpoints({ unitRoot: episodeRoot, episodeId: args.episode.episodeId, now: () => new Date(args.importedAt) });
  await writeJsonAtomic(paths.provenance, provenance);
  await fs.unlink(transactionPath);
  return { status, paths: Object.values(paths) };
}

export async function importHistoryContentPack(request: HistoryContentPackImportRequest): Promise<HistoryContentPackImportResult> {
  const validation = await validateHistoryContentPack(request);
  if (!validation.valid) throw new Error(`Content pack validation failed: ${validation.diagnostics.filter((value) => value.severity === "error").map((value) => `${value.sourceFile ?? "pack"}: ${value.message}`).join("; ")}`);
  const outputRoot = path.resolve(request.outputRoot ?? path.join(process.cwd(), "episodes"));
  const importedEpisodes: string[] = [];
  const noOpEpisodes: string[] = [];
  const revisedEpisodes: string[] = [];
  const artifactLocations: Record<string, readonly string[]> = {};
  const runtimeDiagnostics = [...validation.diagnostics];
  const importedAt = (request.now?.() ?? new Date()).toISOString();
  if (!request.dryRun) await ensureDir(outputRoot);
  for (const episode of validation.episodes) {
    try {
      const collision = await findPublicSlugCollision(outputRoot, episode);
      if (collision) throw new Error(`Public slug ${episode.publicSlug} already belongs to episode ${collision}; refusing silent overwrite.`);
      if (request.dryRun) {
        importedEpisodes.push(episode.episodeId);
        artifactLocations[episode.episodeId] = [];
        continue;
      }
      const result = await importEpisode({ episode, validation, outputRoot, importedAt });
      artifactLocations[episode.episodeId] = result.paths;
      if (result.status === "no-op") noOpEpisodes.push(episode.episodeId);
      else if (result.status === "revised") revisedEpisodes.push(episode.episodeId);
      else importedEpisodes.push(episode.episodeId);
    } catch (error) {
      runtimeDiagnostics.push(diagnostic("episode-import-failed", "error", asErrorMessage(error), episode.sourceFile));
      if (request.failureMode === "fail-fast") break;
    }
  }
  return {
    ...validation,
    valid: !runtimeDiagnostics.some((value) => value.severity === "error"),
    diagnostics: runtimeDiagnostics,
    dryRun: request.dryRun,
    importedEpisodes,
    noOpEpisodes,
    revisedEpisodes,
    artifactLocations,
    pendingValidationStages: HISTORY_PENDING_WORKFLOW_TASKS,
    nextCommands: validation.episodes.map((episode) => `mediaforge workflow history status --episode ${episode.episodeId}`),
  };
}

export function alignFinalHistoryChapters(editorial: readonly ProvisionalChapter[], actualAudioDurationSeconds: number, sectionStarts: readonly number[]): { editorial: readonly ProvisionalChapter[]; final: readonly { timestampSeconds: number; title: string; timingSource: "actual-audio"; provisional: false }[]; publishingTimingSource: "actual-audio" } {
  if (!Number.isFinite(actualAudioDurationSeconds) || actualAudioDurationSeconds <= 0) throw new Error("Actual audio duration must be positive.");
  if (sectionStarts.length !== editorial.length) throw new Error("Final section timing count must match editorial chapters.");
  let previous = -1;
  const final = editorial.map((chapter, index) => {
    const timestampSeconds = sectionStarts[index]!;
    if (!Number.isFinite(timestampSeconds) || timestampSeconds < 0 || timestampSeconds <= previous || timestampSeconds > actualAudioDurationSeconds) throw new Error("Final chapter timings must be monotonic and within actual audio duration.");
    previous = timestampSeconds;
    return { timestampSeconds, title: chapter.title, timingSource: "actual-audio" as const, provisional: false as const };
  });
  return { editorial, final, publishingTimingSource: "actual-audio" };
}
