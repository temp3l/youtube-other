import type { HistoryTemporalBoundsV35, HistoryTemporalPrecisionV35 } from "./history-v35-contracts.js";

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function monthFromText(text: string): number | null {
  const match = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/iu
  );
  return match ? (MONTHS[match[1]!.toLocaleLowerCase()] ?? null) : null;
}

function dayFromText(text: string): number {
  const match = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/u);
  return match ? Number(match[1]) : 15;
}

export function normalizeTemporalBoundsV35(input: {
  readonly normalizedValue: string;
  readonly verbatimText?: string;
  readonly kind?: string;
}): HistoryTemporalBoundsV35 {
  const label = input.normalizedValue.replace(/\s+/gu, " ").trim();
  const lower = label.toLocaleLowerCase();
  const unresolved = /\b(?:unknown|uncertain|approximate|around|about|between|early|late|mid)\b/iu.test(
    lower
  );

  const yearMatches = [...label.matchAll(/\b(\d{3,4})\b/gu)].map((match) => Number(match[1]));
  const rangeMatch = lower.match(/\bbetween\s+(\d{3,4})\s+and\s+(\d{3,4})\b/iu);
  const centuryMatch = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)\s+century\b/iu);

  let precision: HistoryTemporalPrecisionV35 = "unresolved";
  let earliestYear: number | null = null;
  let latestYear: number | null = null;
  let month = 6;
  let day = 15;

  if (rangeMatch) {
    earliestYear = Number(rangeMatch[1]);
    latestYear = Number(rangeMatch[2]);
    precision = "year-range";
  } else if (centuryMatch) {
    const century = Number(centuryMatch[1]);
    earliestYear = (century - 1) * 100 + 1;
    latestYear = century * 100;
    precision = "approximate-period";
  } else if (yearMatches.length >= 2 && /\b(?:between|and|–|-)\b/iu.test(lower)) {
    earliestYear = Math.min(...yearMatches);
    latestYear = Math.max(...yearMatches);
    precision = "year-range";
  } else if (yearMatches.length === 1) {
    earliestYear = yearMatches[0]!;
    latestYear = yearMatches[0]!;
    const parsedMonth = monthFromText(lower);
    if (parsedMonth) {
      month = parsedMonth;
      precision = /\b\d{1,2}\b/u.test(lower) ? "exact-date" : "month-year";
      day = dayFromText(lower);
    } else if (/\bearly\b/iu.test(lower)) {
      month = 3;
      precision = "approximate-period";
    } else if (/\blate\b/iu.test(lower)) {
      month = 10;
      precision = "approximate-period";
    } else {
      precision = "year";
      month = 6;
      day = 15;
    }
  } else if (/\brelative\b/iu.test(lower) || input.kind === "relative-time") {
    precision = "relative";
  }

  const sortYearStart = earliestYear ?? 9_999;
  const sortYearEnd = latestYear ?? earliestYear ?? 9_999;
  const sortKey: readonly [number, number, number] = [sortYearStart, month, day];

  return {
    precision,
    earliestYear,
    latestYear: latestYear ?? earliestYear,
    sortKey,
    label,
    unresolved: unresolved || earliestYear === null,
  };
}

export function compareTemporalBoundsV35(
  left: HistoryTemporalBoundsV35,
  right: HistoryTemporalBoundsV35
): number {
  for (let index = 0; index < 3; index += 1) {
    const delta = left.sortKey[index]! - right.sortKey[index]!;
    if (delta !== 0) return delta;
  }
  return left.label.localeCompare(right.label);
}

export function isChronologicallyOrderedV35(
  bounds: readonly HistoryTemporalBoundsV35[]
): { readonly status: "valid" | "ambiguous" | "invalid"; readonly reason?: string } {
  if (bounds.length < 2) return { status: "valid" };
  const unresolvedCount = bounds.filter((item) => item.unresolved).length;
  if (unresolvedCount > 0 && unresolvedCount < bounds.length)
    return { status: "ambiguous", reason: "mixed-resolved-and-unresolved" };
  for (let index = 1; index < bounds.length; index += 1) {
    if (compareTemporalBoundsV35(bounds[index - 1]!, bounds[index]!) > 0)
      return { status: "invalid", reason: "out-of-order" };
  }
  return { status: "valid" };
}

export function sortEventsByTemporalBoundsV35<T extends { readonly temporalBounds: HistoryTemporalBoundsV35; readonly id: string }>(
  events: readonly T[]
): T[] {
  return [...events].sort(
    (left, right) =>
      compareTemporalBoundsV35(left.temporalBounds, right.temporalBounds) ||
      left.id.localeCompare(right.id)
  );
}
