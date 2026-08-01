import type { SpeechChunkingConfiguration } from "./contracts.js";

export interface SpeechChunk {
  readonly index: number;
  readonly text: string;
  readonly previousContext?: string;
  readonly nextContext?: string;
}
const sentenceBoundary = /(?<=[.!?…]["'”’)]*)\s+/gu;
const clauseBoundary = /(?<=[,;:])\s+/gu;
const paragraphBoundary = /\n{2,}/gu;

function pieces(text: string, boundary: RegExp): readonly string[] {
  const result: string[] = [];
  let start = 0;
  boundary.lastIndex = 0;
  for (let match = boundary.exec(text); match; match = boundary.exec(text)) {
    const end = match.index + match[0].length;
    result.push(text.slice(start, end));
    start = end;
  }
  if (start < text.length) result.push(text.slice(start));
  return result.filter((piece) => piece.length > 0);
}
function takeContext(
  text: string,
  maximum: number,
  fromEnd: boolean
): string | undefined {
  if (maximum === 0 || text.length === 0) return undefined;
  return fromEnd
    ? text.slice(Math.max(0, text.length - maximum))
    : text.slice(0, maximum);
}
function splitOversize(value: string, hardMaximum: number): readonly string[] {
  const byClause = pieces(value, clauseBoundary);
  const output: string[] = [];
  for (const clause of byClause) {
    if (clause.length <= hardMaximum) {
      output.push(clause);
      continue;
    }
    let offset = 0;
    while (offset < clause.length) {
      let end = Math.min(clause.length, offset + hardMaximum);
      // Never place the two UTF-16 code units of a supplementary code point in separate requests.
      if (
        end < clause.length &&
        /[\uD800-\uDBFF]/u.test(clause.charAt(end - 1)) &&
        /[\uDC00-\uDFFF]/u.test(clause.charAt(end))
      )
        end -= 1;
      if (end === offset) end = Math.min(clause.length, offset + 2);
      output.push(clause.slice(offset, end));
      offset = end;
    }
  }
  return output;
}

export function splitSpeechText(
  text: string,
  configuration: SpeechChunkingConfiguration
): readonly SpeechChunk[] {
  if (text.length === 0) return [];
  const paragraphs = pieces(text, paragraphBoundary);
  const units = paragraphs.flatMap((paragraph) =>
    paragraph.length <= configuration.targetCharacters
      ? [paragraph]
      : pieces(paragraph, sentenceBoundary).flatMap((sentence) =>
          sentence.length <= configuration.hardMaximumCharacters
            ? [sentence]
            : splitOversize(sentence, configuration.hardMaximumCharacters)
        )
  );
  const values: string[] = [];
  let current = "";
  for (const unit of units) {
    if (
      current.length > 0 &&
      current.length + unit.length > configuration.targetCharacters
    ) {
      values.push(current);
      current = "";
    }
    if (unit.length > configuration.hardMaximumCharacters)
      throw new Error("Unable to enforce speech hard maximum");
    current += unit;
  }
  if (current.length > 0) values.push(current);
  const rebuilt = values.join("");
  if (rebuilt !== text)
    throw new Error("Speech chunking lost or duplicated text");
  return values.map((value, index) => {
    const previousContext =
      index > 0
        ? takeContext(
            values[index - 1] ?? "",
            configuration.previousContextCharacters,
            true
          )
        : undefined;
    const nextContext =
      index < values.length - 1
        ? takeContext(
            values[index + 1] ?? "",
            configuration.nextContextCharacters,
            false
          )
        : undefined;
    return {
      index,
      text: value,
      ...(previousContext === undefined ? {} : { previousContext }),
      ...(nextContext === undefined ? {} : { nextContext }),
    };
  });
}
