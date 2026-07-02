import { hashText, normalizeWhitespace } from "@mediaforge/shared";
import {
  evidenceInsertSchema,
  type EvidenceInsert,
  type EvidenceInsertKind,
} from "@mediaforge/domain";

export interface EvidenceSourceFact {
  readonly id: string;
  readonly statement: string;
}

export interface EvidenceInsertValidationIssue {
  readonly code:
    | "SOURCE_FACT_MISSING"
    | "UNSUPPORTED_FACT_TO_INSERT"
    | "CONTENT_NOT_TRACEABLE";
  readonly insertId: string;
  readonly sourceFactId: string;
  readonly message: string;
}

export type EvidenceInsertValidationResult =
  | {
      readonly supported: true;
      readonly insert: EvidenceInsert;
      readonly sourceFact: EvidenceSourceFact;
    }
  | {
      readonly supported: false;
      readonly insert: EvidenceInsert;
      readonly reason:
        | "source-fact-missing"
        | "unsupported-fact-to-insert"
        | "content-not-traceable";
      readonly issues: readonly EvidenceInsertValidationIssue[];
    };

export interface EvidenceInsertCacheIdentity {
  readonly fingerprint: string;
  readonly inputs: EvidenceInsertCacheInputs;
}

export interface EvidenceInsertCacheInputs {
  readonly schemaVersion: 1;
  readonly kind: EvidenceInsertKind;
  readonly sourceFactId: string;
  readonly locale: string;
  readonly content: unknown;
  readonly templateVersion: string;
  readonly dimensions: EvidenceInsert["dimensions"];
  readonly layout: EvidenceInsert["layout"];
}

export interface EvidenceInsertSvgAsset {
  readonly mediaType: "image/svg+xml";
  readonly widthPx: number;
  readonly heightPx: number;
  readonly svg: string;
  readonly sha256: string;
  readonly cacheIdentity: EvidenceInsertCacheIdentity;
}

export function validateEvidenceInsertAgainstFacts(args: {
  readonly insert: EvidenceInsert;
  readonly sourceFacts: readonly EvidenceSourceFact[];
}): EvidenceInsertValidationResult {
  const sourceFact = args.sourceFacts.find(
    (fact) => fact.id === args.insert.sourceFactId,
  );
  if (sourceFact === undefined) {
    return unsupported(args.insert, "source-fact-missing", [
      issue(
        "SOURCE_FACT_MISSING",
        args.insert,
        "Evidence insert source fact does not exist.",
      ),
    ]);
  }

  if (!kindCompatibleWithFact(args.insert.kind, sourceFact.statement)) {
    return unsupported(args.insert, "unsupported-fact-to-insert", [
      issue(
        "UNSUPPORTED_FACT_TO_INSERT",
        args.insert,
        "Evidence insert kind is not supported by the source-fact wording.",
      ),
    ]);
  }

  const missingValues = traceableDisplayValues(args.insert).filter(
    (value) => !factContainsValue(sourceFact.statement, value),
  );
  if (missingValues.length > 0) {
    return unsupported(args.insert, "content-not-traceable", [
      {
        ...issue(
          "CONTENT_NOT_TRACEABLE",
          args.insert,
          "Evidence insert display content is not traceable to the source fact.",
        ),
        message: `Evidence insert display content is not traceable to source fact: ${missingValues.join(", ")}`,
      },
    ]);
  }

  return { supported: true, insert: args.insert, sourceFact };
}

export function validateEvidenceInsertsAgainstFacts(args: {
  readonly inserts: readonly EvidenceInsert[];
  readonly sourceFacts: readonly EvidenceSourceFact[];
}): readonly EvidenceInsertValidationResult[] {
  return [...args.inserts]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((insert) =>
      validateEvidenceInsertAgainstFacts({
        insert,
        sourceFacts: args.sourceFacts,
      }),
    );
}

export function buildEvidenceInsertCacheIdentity(
  insert: EvidenceInsert,
): EvidenceInsertCacheIdentity {
  const parsed = evidenceInsertSchema.parse(insert);
  const inputs: EvidenceInsertCacheInputs = {
    schemaVersion: 1,
    kind: parsed.kind,
    sourceFactId: parsed.sourceFactId,
    locale: parsed.locale,
    content: parsed.content,
    templateVersion: parsed.templateVersion,
    dimensions: parsed.dimensions,
    layout: normalizeLayoutForCache(parsed.layout),
  };
  return {
    fingerprint: hashText(stableSerialize(inputs)),
    inputs,
  };
}

export function renderEvidenceInsertSvg(insert: EvidenceInsert): EvidenceInsertSvgAsset {
  const parsed = evidenceInsertSchema.parse(insert);
  const cacheIdentity = buildEvidenceInsertCacheIdentity(parsed);
  const rows = displayRows(parsed);
  const waveform =
    parsed.kind === "audio-waveform" ? parsed.content.sampleBuckets : undefined;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${parsed.dimensions.widthPx}" height="${parsed.dimensions.heightPx}" viewBox="0 0 ${parsed.dimensions.widthPx} ${parsed.dimensions.heightPx}" role="img">`,
    '<rect width="100%" height="100%" rx="18" fill="#111318"/>',
    '<rect x="12" y="12" width="calc(100% - 24px)" height="calc(100% - 24px)" rx="12" fill="none" stroke="#d8d2bd" stroke-width="2" opacity="0.65"/>',
    ...rows.map((row, index) => {
      const y = 42 + index * 34;
      const size = index === 0 ? 22 : 18;
      const weight = index === 0 ? 700 : 500;
      return `<text x="28" y="${y}" fill="#f4f0df" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}">${escapeSvgText(row)}</text>`;
    }),
    ...(waveform === undefined
      ? []
      : [
          ...waveform.map((bucket, index) => {
            const count = waveform.length;
            const availableWidth = parsed.dimensions.widthPx - 56;
            const barWidth = Math.max(2, availableWidth / count - 2);
            const height = Math.max(4, bucket * 72);
            const x = 28 + index * (availableWidth / count);
            const y = parsed.dimensions.heightPx - 32 - height;
            return `<rect x="${formatNumber(x)}" y="${formatNumber(y)}" width="${formatNumber(barWidth)}" height="${formatNumber(height)}" fill="#8dd8ff" opacity="0.82"/>`;
          }),
        ]),
    "</svg>",
  ].join("");
  return {
    mediaType: "image/svg+xml",
    widthPx: parsed.dimensions.widthPx,
    heightPx: parsed.dimensions.heightPx,
    svg,
    sha256: hashText(svg),
    cacheIdentity,
  };
}

function unsupported(
  insert: EvidenceInsert,
  reason: Exclude<EvidenceInsertValidationResult, { readonly supported: true }>["reason"],
  issues: readonly EvidenceInsertValidationIssue[],
): EvidenceInsertValidationResult {
  return { supported: false, insert, reason, issues };
}

function issue(
  code: EvidenceInsertValidationIssue["code"],
  insert: EvidenceInsert,
  message: string,
): EvidenceInsertValidationIssue {
  return {
    code,
    insertId: insert.id,
    sourceFactId: insert.sourceFactId,
    message,
  };
}

function kindCompatibleWithFact(kind: EvidenceInsertKind, statement: string): boolean {
  const normalized = normalizeForComparison(statement);
  switch (kind) {
    case "clock":
    case "timestamp":
      return /\b\d{1,2}:\d{2}\b/u.test(normalized) || normalized.includes("time");
    case "date":
    case "newspaper-heading":
      return /\b\d{4}\b/u.test(normalized) || /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/u.test(normalized) || normalized.includes("date");
    case "document":
      return ["document", "file", "record", "report", "declassified"].some((token) =>
        normalized.includes(token),
      );
    case "recording":
    case "audio-waveform":
      return ["recording", "tape", "audio", "waveform", "call"].some((token) =>
        normalized.includes(token),
      );
    case "message":
      return ["message", "text", "sms", "note", "wrote"].some((token) =>
        normalized.includes(token),
      );
    case "location-label":
      return ["location", "map", "address", "street", "room", "ward"].some((token) =>
        normalized.includes(token),
      );
    case "room-number":
      return ["room", "suite", "ward", "door"].some((token) =>
        normalized.includes(token),
      );
    case "terminal-log":
      return ["terminal", "log", "command", "system", "experiment"].some((token) =>
        normalized.includes(token),
      );
    case "medical-reading":
      return ["medical", "heart", "pulse", "bpm", "oxygen", "temperature"].some((token) =>
        normalized.includes(token),
      );
    case "handwritten-note":
      return ["handwritten", "note", "wrote", "letter"].some((token) =>
        normalized.includes(token),
      );
  }
}

function traceableDisplayValues(insert: EvidenceInsert): readonly string[] {
  switch (insert.kind) {
    case "clock":
      return [insert.content.timeText, insert.content.label].filter(isTraceableValue);
    case "date":
      return [insert.content.dateText, insert.content.calendar].filter(isTraceableValue);
    case "document":
      return [
        insert.content.heading,
        insert.content.body,
        insert.content.classification,
      ].filter(isTraceableValue);
    case "recording":
      return [insert.content.label, insert.content.timecode].filter(isTraceableValue);
    case "audio-waveform":
      return [insert.content.label];
    case "message":
      return [
        insert.content.sender,
        insert.content.messageText,
        insert.content.timestampText,
      ].filter(isTraceableValue);
    case "timestamp":
      return [insert.content.timestampText, insert.content.label].filter(isTraceableValue);
    case "location-label":
      return [insert.content.label, insert.content.coordinatesText].filter(isTraceableValue);
    case "room-number":
      return [insert.content.roomNumber, insert.content.label].filter(isTraceableValue);
    case "terminal-log":
      return [insert.content.command, insert.content.outputLine].filter(isTraceableValue);
    case "medical-reading":
      return [
        insert.content.metric,
        insert.content.value,
        insert.content.unit,
      ].filter(isTraceableValue);
    case "handwritten-note":
      return [insert.content.noteText, insert.content.attribution].filter(isTraceableValue);
    case "newspaper-heading":
      return [
        insert.content.headline,
        insert.content.publication,
        insert.content.dateText,
      ].filter(isTraceableValue);
  }
}

function displayRows(insert: EvidenceInsert): readonly string[] {
  switch (insert.kind) {
    case "clock":
      return [insert.content.label ?? "TIME", insert.content.timeText];
    case "date":
      return [insert.content.calendar ?? "DATE", insert.content.dateText];
    case "document":
      return [insert.content.classification ?? "DOCUMENT", insert.content.heading, insert.content.body].filter(isTraceableValue);
    case "recording":
      return ["REC", insert.content.label, insert.content.timecode].filter(isTraceableValue);
    case "audio-waveform":
      return ["AUDIO", insert.content.label];
    case "message":
      return [insert.content.sender ?? "MESSAGE", insert.content.messageText, insert.content.timestampText].filter(isTraceableValue);
    case "timestamp":
      return [insert.content.label ?? "TIMESTAMP", insert.content.timestampText];
    case "location-label":
      return ["LOCATION", insert.content.label, insert.content.coordinatesText].filter(isTraceableValue);
    case "room-number":
      return [insert.content.label ?? "ROOM", insert.content.roomNumber];
    case "terminal-log":
      return ["TERMINAL", insert.content.command, insert.content.outputLine].filter(isTraceableValue);
    case "medical-reading":
      return ["MEDICAL", `${insert.content.metric}: ${insert.content.value}${insert.content.unit === undefined ? "" : ` ${insert.content.unit}`}`];
    case "handwritten-note":
      return [insert.content.attribution ?? "NOTE", insert.content.noteText];
    case "newspaper-heading":
      return [insert.content.publication ?? "ARCHIVE", insert.content.headline, insert.content.dateText].filter(isTraceableValue);
  }
}

function factContainsValue(statement: string, value: string): boolean {
  const haystack = normalizeForComparison(statement);
  const needle = normalizeForComparison(value);
  return haystack.includes(needle);
}

function normalizeForComparison(value: string): string {
  return normalizeWhitespace(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[“”]/gu, '"')
    .replace(/[‘’]/gu, "'")
    .replace(/\s+/gu, " ");
}

function normalizeLayoutForCache(
  layout: EvidenceInsert["layout"],
): EvidenceInsert["layout"] {
  return {
    ...layout,
    compatibleAspectRatios: [...layout.compatibleAspectRatios].sort(),
    protectedSubregions: [...layout.protectedSubregions].sort(compareRectangles),
  };
}

function compareRectangles(
  left: EvidenceInsert["layout"]["bounds"],
  right: EvidenceInsert["layout"]["bounds"],
): number {
  return (
    left.x - right.x ||
    left.y - right.y ||
    left.width - right.width ||
    left.height - right.height
  );
}

function stableSerialize(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value.normalize("NFC"));
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Cannot serialize non-finite number.");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(",")}}`;
  }
  throw new Error(`Cannot serialize unsupported evidence cache value: ${typeof value}`);
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function isTraceableValue(value: string | undefined): value is string {
  return value !== undefined && normalizeWhitespace(value).length > 0;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/u, "").replace(/\.$/u, "");
}
