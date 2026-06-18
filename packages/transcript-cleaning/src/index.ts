import {
  cleanedTranscriptSchema,
  ProviderAuthenticationError,
  ProviderResponseError,
  transcriptSchema,
  type CleanedTranscript,
  type Transcript,
  type TranscriptCorrection,
  type UncertainTerm
} from "@mediaforge/domain";
import { normalizeWhitespace, splitIntoSentences } from "@mediaforge/shared";

export interface TranscriptCleaner {
  clean(transcript: Transcript): CleanedTranscript | Promise<CleanedTranscript>;
}

export interface OpenAiCompatibleTextOptions {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
}

const cleanedTranscriptResponseSchema = cleanedTranscriptSchema.omit({
  sourceId: true
});

function removeCommonFillers(text: string): { text: string; corrections: TranscriptCorrection[] } {
  const fillerWords = ["um", "uh", "erm", "you know", "like"];
  let cleaned = text;
  const corrections: TranscriptCorrection[] = [];
  for (const filler of fillerWords) {
    const pattern = new RegExp(`\\b${filler.replace(/\s+/g, "\\s+")}\\b`, "giu");
    if (pattern.test(cleaned)) {
      cleaned = cleaned.replace(pattern, "");
      corrections.push({
        originalText: filler,
        correctedText: "",
        confidence: 0.65,
        category: "filler-word",
        reason: "Removed a common filler word for cleaner narration.",
        humanReviewRecommended: false
      });
    }
  }
  return { text: normalizeWhitespace(cleaned), corrections };
}

function collapseImmediateRepetitions(text: string): { text: string; corrections: TranscriptCorrection[] } {
  const corrections: TranscriptCorrection[] = [];
  const repeated = text.replace(/\b(\w+)(\s+\1\b)+/giu, (match, word: string) => {
    corrections.push({
      originalText: match,
      correctedText: word,
      confidence: 0.7,
      category: "repetition",
      reason: "Collapsed an obvious immediate repetition.",
      humanReviewRecommended: false
    });
    return word;
  });
  return { text: normalizeWhitespace(repeated), corrections };
}

export class ConservativeTranscriptCleaner implements TranscriptCleaner {
  public clean(transcript: Transcript): CleanedTranscript {
    const parsed = transcriptSchema.parse(transcript);
    const originalText = parsed.text;
    const filler = removeCommonFillers(originalText);
    const repetition = collapseImmediateRepetitions(filler.text);
    const cleanedText = normalizeWhitespace(repetition.text.replace(/\s+([,.!?;:])/gu, "$1"));
    const corrections = [...filler.corrections, ...repetition.corrections];
    const uncertainTerms: UncertainTerm[] = [];
    const sentenceCount = splitIntoSentences(cleanedText).length;
    if (sentenceCount === 0 && cleanedText.length > 0) {
      uncertainTerms.push({
        originalText: cleanedText,
        reason: "Could not confidently segment the transcript into sentences."
      });
    }
    return cleanedTranscriptSchema.parse({
      sourceId: parsed.sourceId,
      language: parsed.language,
      originalText,
      cleanedText,
      segments: parsed.segments,
      corrections,
      uncertainTerms
    });
  }
}

export class OpenAiCompatibleTranscriptCleaner implements TranscriptCleaner {
  public constructor(private readonly options: OpenAiCompatibleTextOptions) {}

  public async clean(transcript: Transcript): Promise<CleanedTranscript> {
    transcriptSchema.parse(transcript);
    if (!this.options.apiKey) {
      throw new ProviderAuthenticationError("OpenAI-compatible cleaning requires an API key.");
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
              "Return JSON only. Conservatively clean the transcript without adding facts. Preserve names, dates, numbers, and claims."
          },
          {
            role: "user",
            content: JSON.stringify({
              sourceId: transcript.sourceId,
              language: transcript.language,
              originalText: transcript.text,
              segments: transcript.segments
            })
          }
        ]
      })
    });
    if (!response.ok) {
      throw new ProviderResponseError(`Cleaning provider returned ${response.status} ${response.statusText}`);
    }
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new ProviderResponseError("Cleaning provider returned an empty response.");
    }
    const parsed = cleanedTranscriptResponseSchema.parse(JSON.parse(content) as unknown);
    return cleanedTranscriptSchema.parse({
      sourceId: transcript.sourceId,
      ...parsed
    });
  }
}
