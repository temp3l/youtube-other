import type { HistoryClaimKindV34 } from "./history-v34-contracts.js";

export type VisualSubjectProvenanceV35 =
  | "entity"
  | "derived-noun-phrase"
  | "unresolved";

export interface VisualSubjectV35 {
  readonly label: string;
  readonly claimId: string;
  readonly provenance: VisualSubjectProvenanceV35;
}

function wordSafeSlice(text: string, maxChars: number): string {
  const trimmed = text.replace(/\s+/gu, " ").trim();
  if (trimmed.length <= maxChars) return trimmed;
  const slice = trimmed.slice(0, maxChars);
  const boundary = slice.lastIndexOf(" ");
  return (boundary > 12 ? slice.slice(0, boundary) : slice).trim();
}

const SENTENCE_LIKE_PATTERN =
  /\b(?:believe|because|although|however|were combined|were recorded|relied on|who wrote|that their)\b/iu;

export function deriveVisualSubjectV35(input: {
  readonly claimText: string;
  readonly claimId: string;
  readonly entityLabels: readonly string[];
  readonly claimKind: HistoryClaimKindV34;
}): VisualSubjectV35 {
  const primaryEntity = input.entityLabels.find((label) => label.trim().length > 0);
  if (primaryEntity) {
    return {
      label: primaryEntity,
      claimId: input.claimId,
      provenance: "entity",
    };
  }

  const stripped = input.claimText
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/^(?:The|A|An|But|Yet|So|And|In|On|By)\s+/iu, "");

  const documentMatch = stripped.match(
    /\b([\p{L}'-]+(?:\s+[\p{L}'-]+){0,3})\s+(?:archive|tablet|inscription|relief|chronicle|register|records?)\b/iu
  );
  if (documentMatch?.[1])
    return {
      label: `${documentMatch[1]} evidence`,
      claimId: input.claimId,
      provenance: "derived-noun-phrase",
    };

  const tradeMatch = stripped.match(
    /\b([\p{L}'-]+(?:\s+[\p{L}'-]+){0,2})\s+(?:trade|network|routes?|exchange)\b/iu
  );
  if (tradeMatch?.[1])
    return {
      label: `${tradeMatch[1]} trade network`,
      claimId: input.claimId,
      provenance: "derived-noun-phrase",
    };

  const productionMatch =
    stripped.match(/\bmake\s+([\p{L}'-]+)/iu) ??
    stripped.match(/\b([\p{L}'-]+)\s+production\b/iu);
  if (productionMatch?.[1])
    return {
      label: `${productionMatch[1]} production`,
      claimId: input.claimId,
      provenance: "derived-noun-phrase",
    };

  const bureaucracyMatch = stripped.match(
    /\b([\p{L}'-]+(?:\s+[\p{L}'-]+){0,2})\s+bureaucrac(?:y|ies)\b/iu
  );
  if (bureaucracyMatch?.[1])
    return {
      label: `${bureaucracyMatch[1]} administration`,
      claimId: input.claimId,
      provenance: "derived-noun-phrase",
    };

  const nounPhraseMatch = stripped.match(
    /^([\p{Lu}][\p{L}'-]+(?:\s+[\p{L}'-]+){0,4})\s+(?:were|was|are|is|had|have|became|collapsed|recorded|relied|crossed|destroyed)/iu
  );
  if (nounPhraseMatch?.[1] && nounPhraseMatch[1].split(/\s+/u).length <= 5)
    return {
      label: nounPhraseMatch[1],
      claimId: input.claimId,
      provenance: "derived-noun-phrase",
    };

  if (
    stripped.length <= 64 &&
    !SENTENCE_LIKE_PATTERN.test(stripped) &&
    !/[.!?].*[.!?]/u.test(stripped)
  )
    return {
      label: stripped,
      claimId: input.claimId,
      provenance: "derived-noun-phrase",
    };

  const shortened = wordSafeSlice(stripped.replace(/[.!?].*$/u, ""), 48);
  if (
    shortened.length >= 8 &&
    shortened.split(/\s+/u).length <= 6 &&
    !SENTENCE_LIKE_PATTERN.test(shortened)
  )
    return {
      label: shortened,
      claimId: input.claimId,
      provenance: "derived-noun-phrase",
    };

  return {
    label: "narrated evidence",
    claimId: input.claimId,
    provenance: "unresolved",
  };
}

export function isSentenceLikeVisualSubjectV35(subject: string): boolean {
  return (
    subject.split(/\s+/u).length > 8 ||
    SENTENCE_LIKE_PATTERN.test(subject) ||
    /^(?:The people who|Cities relied|Palace bureaucracies|Copper from)\b/iu.test(subject)
  );
}
