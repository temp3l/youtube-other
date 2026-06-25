import {
  ProviderAuthenticationError,
  ProviderResponseError,
  rewrittenScriptSchema,
  type CleanedTranscript,
  type RewrittenScript,
  type RewrittenScriptSection
} from "@mediaforge/domain";
import { collapseRepeatedTokenRuns, normalizeWhitespace, splitIntoSentences } from "@mediaforge/shared";
import { runCurl } from "@mediaforge/process-runner";
import {
  currentExecutionTelemetry,
  estimateTextGenerationCost
} from "@mediaforge/observability";

export interface ScriptRewriter {
  rewrite(cleanedTranscript: CleanedTranscript): RewrittenScript | Promise<RewrittenScript>;
}

export interface OpenAiCompatibleTextOptions {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly organization?: string;
  readonly project?: string;
  readonly model: string;
  readonly transport?: OpenAiCompatibleTextTransport;
}

export interface OpenAiCompatibleTextTransport {
  complete(request: {
    readonly baseUrl: string;
    readonly apiKey: string;
    readonly organization?: string;
    readonly project?: string;
    readonly model: string;
    readonly messages: ReadonlyArray<{ readonly role: "system" | "user"; readonly content: string }>;
    readonly signal: AbortSignal;
  }): Promise<OpenAiChatCompletionResponse>;
}

interface OpenAiChatCompletionResponse {
  readonly choices?: ReadonlyArray<{
    readonly message?: {
      readonly content?: string;
    };
  }>;
}

const rewrittenScriptResponseSchema = rewrittenScriptSchema.omit({
  sourceId: true
});

const languageLeadIn: Record<string, string> = {
  en: "In simple terms, ",
  es: "En palabras simples, ",
  pt: "Em palavras simples, ",
  fr: "En termes simples, ",
  de: "Einfach gesagt, "
};

const paraphraseReplacements: ReadonlyArray<[RegExp, string]> = [
  [/\bthis video\b/giu, "this story"],
  [/\bthe video\b/giu, "the story"],
  [/\bthis section\b/giu, "this part"],
  [/\bexplains\b/giu, "shows"],
  [/\bexplore(s|d)?\b/giu, "look(s) at"],
  [/\blooks at\b/giu, "looks into"],
  [/\bshows\b/giu, "makes clear"],
  [/\bdescribes\b/giu, "sets out"],
  [/\bdetails\b/giu, "lays out"],
  [/\bsays\b/giu, "makes the point that"],
  [/\btherefore\b/giu, "so"],
  [/\bbasically\b/giu, ""],
  [/\bsimply\b/giu, ""],
  [/\bjust\b/giu, ""],
  [/\bbecause\b/giu, "since"],
  [/\bin order to\b/giu, "to"],
  [/\ba lot of\b/giu, "many"],
  [/\bthere are\b/giu, "you can find"],
  [/\bthere is\b/giu, "you can see"],
  [/\bit is\b/giu, "it stays"],
  [/\bwe can see\b/giu, "it becomes clear"],
  [/\bone of the most\b/giu, "one of the clearest"],
  [/\bimportant\b/giu, "key"],
  [/\bthink about\b/giu, "notice"],
  [/\bfor example\b/giu, "for instance"]
];

function leadingPhrase(language: string): string {
  const normalized = language.toLowerCase().trim();
  return languageLeadIn[normalized] ?? "";
}

function paraphraseClause(text: string): string {
  return paraphraseReplacements.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text);
}

function stripLeadingConnectives(text: string): string {
  return normalizeWhitespace(text).replace(/^(?:and|but|or|so|then|because|since|also)\b[\s,]*/giu, "");
}

function removeConnectorAfterIntro(text: string): string {
  return normalizeWhitespace(text).replace(/^([^,]+,\s+)(?:and|but|or|so|then|because|since|also)\s+/iu, "$1");
}

function normalizePunctuationSpacing(text: string): string {
  return normalizeWhitespace(text)
    .replace(/\s+([,.!?;:])/gu, "$1")
    .replace(/([¿¡])\s+/gu, "$1")
    .replace(/\s+([»”])(?=[,.!?;:])/gu, "$1")
    .replace(/([("'«“])\s+/gu, "$1");
}

function normalizeSentenceEnding(text: string): string {
  const trimmed = normalizePunctuationSpacing(text);
  if (trimmed.length === 0) {
    return trimmed;
  }
  if (/[.!?…]["'»”)]*$/u.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}.`;
}

function rewriteSentenceSimple(sentence: string, language: string, index: number): string {
  const normalized = normalizeWhitespace(sentence);
  if (normalized.length === 0) {
    return "";
  }
  const clauses = normalized
    .split(/,(?![^()]*\))/u)
    .map((clause) => normalizeWhitespace(clause))
    .map((clause) => stripLeadingConnectives(clause))
    .filter((clause) => clause.length > 0);
  const paraphrasedClauses = clauses.map((clause) => stripLeadingConnectives(paraphraseClause(clause)));
  const joined = paraphrasedClauses.length > 1 ? paraphrasedClauses.join(", and ") : paraphrasedClauses[0] ?? normalized;
  const prefixed = index === 0 ? `${leadingPhrase(language)}${joined}` : joined;
  return normalizeSentenceEnding(removeConnectorAfterIntro(stripLeadingConnectives(prefixed)));
}

function buildSimpleRewrittenText(text: string, language: string): string {
  const sentences = splitIntoSentences(text);
  const rewritten = (sentences.length > 0 ? sentences : [text])
    .map((sentence, index) => rewriteSentenceSimple(sentence, language, index))
    .filter((sentence) => sentence.length > 0);
  const normalizedSentences = rewritten.map((sentence) => normalizeSentenceEnding(sentence)).filter((sentence) => sentence.length > 0);
  const output = collapseRepeatedTokenRuns(normalizedSentences.join(" "), {
    minWindowTokens: 3,
    maxWindowTokens: 48
  });
  return normalizeSentenceEnding(output);
}

function normalizeRewrittenSections(sections: ReadonlyArray<RewrittenScriptSection>, language: string): RewrittenScriptSection[] {
  return sections.map((section, index) => ({
    ...section,
    text: normalizeSentenceEnding(
      collapseRepeatedTokenRuns(rewriteSentenceSimple(section.text, language, index), {
        minWindowTokens: 3,
        maxWindowTokens: 48
      })
    )
  }));
}

function normalizeRewrittenText(text: string, language: string): string {
  const sentences = splitIntoSentences(text);
  const rewritten = (sentences.length > 0 ? sentences : [text]).map((sentence, index) => rewriteSentenceSimple(sentence, language, index));
  return normalizeSentenceEnding(
    collapseRepeatedTokenRuns(rewritten.map((sentence) => normalizeSentenceEnding(sentence)).join(" "), {
      minWindowTokens: 3,
      maxWindowTokens: 48
    })
  );
}

function buildSections(sentences: ReadonlyArray<string>, segmentIds: ReadonlyArray<string>): RewrittenScriptSection[] {
  return sentences.map((sentence, index) => ({
    sectionId: `section-${String(index + 1).padStart(3, "0")}`,
    transcriptSegmentIds: segmentIds.slice(index, index + 1) as never,
    text: normalizeSentenceEnding(sentence),
    claims: [sentence]
  }));
}

export class ConservativeScriptRewriter implements ScriptRewriter {
  public rewrite(cleanedTranscript: CleanedTranscript): RewrittenScript {
    const sentences = splitIntoSentences(cleanedTranscript.cleanedText).map((sentence) => normalizeWhitespace(sentence));
    const sectionSegmentIds = cleanedTranscript.segments.map((segment) => segment.id);
    const sourceText = sentences.length > 0 ? sentences.join(" ") : cleanedTranscript.cleanedText;
    const rewrittenText = buildSimpleRewrittenText(sourceText, cleanedTranscript.language);
    const rewrittenSentences = splitIntoSentences(rewrittenText);
    const sections = buildSections(
      rewrittenSentences.length > 0 ? rewrittenSentences : [rewrittenText],
      sectionSegmentIds
    );
    const text = sections.map((section) => section.text).join(" ");
    return rewrittenScriptSchema.parse({
      sourceId: cleanedTranscript.sourceId,
      audience: "broad audience",
      text: normalizeRewrittenText(text, cleanedTranscript.language),
      sections,
      claims: sections.map((section) => ({
        text: section.text,
        reviewRequired: false
      }))
    });
  }
}

export class OpenAiCompatibleScriptRewriter implements ScriptRewriter {
  private readonly transport: OpenAiCompatibleTextTransport;

  public constructor(private readonly options: OpenAiCompatibleTextOptions) {
    this.transport = options.transport ?? createCurlTextTransport();
  }

  public async rewrite(cleanedTranscript: CleanedTranscript): Promise<RewrittenScript> {
    if (!this.options.apiKey) {
      throw new ProviderAuthenticationError("OpenAI-compatible rewriting requires an API key.");
    }
    const payload = await this.transport.complete({
      baseUrl: this.options.baseUrl,
      apiKey: this.options.apiKey,
      ...(this.options.organization ? { organization: this.options.organization } : {}),
      ...(this.options.project ? { project: this.options.project } : {}),
      model: this.options.model,
      signal: new AbortController().signal,
      messages: [
        {
          role: "system",
          content:
            "Return JSON only. Rewrite the transcript in easy, natural language that is clearly distinct from the source wording while preserving the same meaning. Keep it suitable for spoken narration. Do not add unsupported claims."
        },
        {
          role: "user",
          content: JSON.stringify({
            sourceId: cleanedTranscript.sourceId,
            language: cleanedTranscript.language,
            cleanedText: cleanedTranscript.cleanedText,
            corrections: cleanedTranscript.corrections,
            uncertainTerms: cleanedTranscript.uncertainTerms,
            requirements: {
              useSimpleLanguage: true,
              keepMeaning: true,
              makeTheWordingDistinctFromTheSource: true,
              preferLongNaturalSentences: true
            }
          })
        }
      ]
    });
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new ProviderResponseError("Rewriting provider returned an empty response.");
    }
    const parsed = rewrittenScriptResponseSchema.parse(JSON.parse(content) as unknown);
    const rewrittenText = buildSimpleRewrittenText(parsed.text, cleanedTranscript.language);
    const rewrittenSections = normalizeRewrittenSections(parsed.sections, cleanedTranscript.language);
    return rewrittenScriptSchema.parse({
      sourceId: cleanedTranscript.sourceId,
      ...parsed,
      text: normalizeRewrittenText(rewrittenText, cleanedTranscript.language),
      sections: rewrittenSections
    });
  }
}

function createCurlTextTransport(): OpenAiCompatibleTextTransport {
  return {
    async complete(request) {
      const url = new URL("/v1/chat/completions", request.baseUrl).toString();
      const result = await runCurl(
        [
          "--fail-with-body",
          "--silent",
          "--show-error",
          "--request",
          "POST",
          "--header",
          `Authorization: Bearer ${request.apiKey}`,
          "--header",
          "Content-Type: application/json",
          ...(request.organization ? ["--header", `OpenAI-Organization: ${request.organization}`] : []),
          ...(request.project ? ["--header", `OpenAI-Project: ${request.project}`] : []),
          "--data-binary",
          JSON.stringify({
            model: request.model,
            temperature: 0,
            messages: request.messages
          }),
          url
        ],
        { signal: request.signal }
      );
      if (result.exitCode !== 0) {
        throw new ProviderResponseError(`Rewriting provider returned ${result.stderr.trim() || result.stdout.trim() || "an HTTP error"}.`);
      }
      try {
        const parsed = JSON.parse(result.stdout) as OpenAiChatCompletionResponse & {
          readonly usage?: {
            readonly prompt_tokens?: number;
            readonly completion_tokens?: number;
            readonly prompt_tokens_details?: { readonly cached_tokens?: number };
          };
        };
        const telemetry = currentExecutionTelemetry();
        const cost = telemetry
          ? estimateTextGenerationCost(telemetry.catalog, {
              provider: "openai",
              model: request.model,
              ...(parsed.usage?.prompt_tokens !== undefined
                ? { inputTokens: parsed.usage.prompt_tokens }
                : {}),
              ...(parsed.usage?.prompt_tokens_details?.cached_tokens !== undefined
                ? {
                    cachedInputTokens:
                      parsed.usage.prompt_tokens_details.cached_tokens,
                  }
                : {}),
              ...(parsed.usage?.completion_tokens !== undefined
                ? { outputTokens: parsed.usage.completion_tokens }
                : {}),
            })
          : { pricingVersion: "unconfigured", costMicros: null, warning: undefined };
        telemetry?.recordCost({
          provider: "openai",
          model: request.model,
          operation: "text-generation",
          costMicros: cost.costMicros,
          warning: cost.warning
        });
        return parsed;
      } catch (error) {
        throw new ProviderResponseError(`Rewriting provider returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };
}
