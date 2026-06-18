import {
  ProviderAuthenticationError,
  ProviderResponseError,
  rewrittenScriptSchema,
  type CleanedTranscript,
  type RewrittenScript,
  type RewrittenScriptSection
} from "@mediaforge/domain";
import { normalizeWhitespace, splitIntoSentences } from "@mediaforge/shared";

export interface ScriptRewriter {
  rewrite(cleanedTranscript: CleanedTranscript): RewrittenScript | Promise<RewrittenScript>;
}

export interface OpenAiCompatibleTextOptions {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
}

const rewrittenScriptResponseSchema = rewrittenScriptSchema.omit({
  sourceId: true
});

function buildSections(sentences: ReadonlyArray<string>, segmentIds: ReadonlyArray<string>): RewrittenScriptSection[] {
  return sentences.map((sentence, index) => ({
    sectionId: `section-${String(index + 1).padStart(3, "0")}`,
    transcriptSegmentIds: segmentIds.slice(index, index + 1) as never,
    text: sentence,
    claims: [sentence]
  }));
}

export class ConservativeScriptRewriter implements ScriptRewriter {
  public rewrite(cleanedTranscript: CleanedTranscript): RewrittenScript {
    const sentences = splitIntoSentences(cleanedTranscript.cleanedText).map((sentence) =>
      normalizeWhitespace(sentence)
    );
    const sectionSegmentIds = cleanedTranscript.segments.map((segment) => segment.id);
    const sections = buildSections(sentences.length > 0 ? sentences : [cleanedTranscript.cleanedText], sectionSegmentIds);
    const text = sections.map((section) => section.text).join(" ");
    return rewrittenScriptSchema.parse({
      sourceId: cleanedTranscript.sourceId,
      audience: "broad audience",
      text,
      sections,
      claims: sections.map((section) => ({
        text: section.text,
        reviewRequired: false
      }))
    });
  }
}

export class OpenAiCompatibleScriptRewriter implements ScriptRewriter {
  public constructor(private readonly options: OpenAiCompatibleTextOptions) {}

  public async rewrite(cleanedTranscript: CleanedTranscript): Promise<RewrittenScript> {
    if (!this.options.apiKey) {
      throw new ProviderAuthenticationError("OpenAI-compatible rewriting requires an API key.");
    }
    const response = await fetch(new URL("/v1/chat/completions", this.options.baseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.options.model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Return JSON only. Rewrite the transcript for broad spoken-audio narration without changing meaning or adding unsupported claims."
          },
          {
            role: "user",
            content: JSON.stringify({
              sourceId: cleanedTranscript.sourceId,
              language: cleanedTranscript.language,
              cleanedText: cleanedTranscript.cleanedText,
              corrections: cleanedTranscript.corrections,
              uncertainTerms: cleanedTranscript.uncertainTerms
            })
          }
        ]
      })
    });
    if (!response.ok) {
      throw new ProviderResponseError(`Rewriting provider returned ${response.status} ${response.statusText}`);
    }
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new ProviderResponseError("Rewriting provider returned an empty response.");
    }
    const parsed = rewrittenScriptResponseSchema.parse(JSON.parse(content) as unknown);
    return rewrittenScriptSchema.parse({
      sourceId: cleanedTranscript.sourceId,
      ...parsed
    });
  }
}
