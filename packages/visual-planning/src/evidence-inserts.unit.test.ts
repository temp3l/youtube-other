import { describe, expect, it } from "vitest";
import {
  evidenceInsertArtifactSchema,
  evidenceInsertSchema,
  episodeIdSchema,
  type EvidenceInsert,
  type EvidenceInsertKind,
} from "@mediaforge/domain";
import {
  buildEvidenceInsertCacheIdentity,
  renderEvidenceInsertSvg,
  validateEvidenceInsertAgainstFacts,
  validateEvidenceInsertsAgainstFacts,
  type EvidenceSourceFact,
} from "./evidence-inserts.js";

const sourceFacts: readonly EvidenceSourceFact[] = [
  {
    id: "fact-clock",
    statement: "The clock stopped at 03:17 above the document file.",
  },
  {
    id: "fact-document",
    statement: "The declassified file heading read INCIDENT REPORT 17.",
  },
  {
    id: "fact-recording",
    statement: "The tape recording labeled BASEMENT CALL included audio waveform evidence.",
  },
  {
    id: "fact-message",
    statement: "The text message from Mara said SHE OPENED THE DOOR at 03:17.",
  },
  {
    id: "fact-room",
    statement: "The door marked room 237 was the final location.",
  },
  {
    id: "fact-medical",
    statement: "The medical monitor showed pulse 42 bpm.",
  },
  {
    id: "fact-note",
    statement: "The handwritten note said DON'T LOOK BACK.",
  },
  {
    id: "fact-date",
    statement: "The archive newspaper heading from October 12 1998 named the ward.",
  },
  {
    id: "fact-terminal",
    statement: "The terminal log printed EXPERIMENT FAILED.",
  },
  {
    id: "fact-location",
    statement: "The map location label read Ward C.",
  },
];

function insert(
  kind: EvidenceInsertKind,
  content: EvidenceInsert["content"],
  sourceFactId = `fact-${kind.replace("-waveform", "").replace("-label", "").replace("-number", "").replace("-reading", "").replace("-note", "").replace("-heading", "").replace("timestamp", "clock")}`,
): EvidenceInsert {
  return evidenceInsertSchema.parse({
    id: `evidence-insert-${kind.replace(/[^a-z0-9]+/gu, "-")}`,
    kind,
    sourceFactId,
    locale: "en-US",
    sourceSceneId: "source-scene-001",
    shotId: "scene-001-shot-001",
    startMs: 1000,
    endMs: 3000,
    templateVersion: "evidence-template-v1",
    dimensions: { widthPx: 640, heightPx: 360, aspectRatio: "16:9" },
    layout: {
      bounds: { x: 0.08, y: 0.14, width: 0.58, height: 0.28 },
      preferredAnchor: "center",
      captionSafeExclusion: { x: 0.06, y: 0.12, width: 0.62, height: 0.32 },
      textSafePadding: 0.05,
      minReadableHeight: 0.16,
      protectedSubregions: [
        { x: 0.12, y: 0.18, width: 0.48, height: 0.16 },
      ],
      compatibleAspectRatios: ["16:9", "9:16"],
    },
    content,
  });
}

describe("evidence inserts", () => {
  it("accepts typed fact-provenanced inserts and stable artifacts", () => {
    const inserts: readonly EvidenceInsert[] = [
      insert("clock", { timeText: "03:17", label: "clock" }, "fact-clock"),
      insert("timestamp", { timestampText: "03:17", label: "clock" }, "fact-clock"),
      insert("document", { heading: "INCIDENT REPORT 17", classification: "declassified file" }, "fact-document"),
      insert("recording", { label: "BASEMENT CALL" }, "fact-recording"),
      insert("audio-waveform", { label: "audio waveform", sampleBuckets: [0.1, 0.4, 0.8, 0.2] }, "fact-recording"),
      insert("message", { sender: "Mara", messageText: "SHE OPENED THE DOOR", timestampText: "03:17" }, "fact-message"),
      insert("room-number", { roomNumber: "237", label: "room" }, "fact-room"),
      insert("medical-reading", { metric: "pulse", value: "42", unit: "bpm" }, "fact-medical"),
      insert("handwritten-note", { noteText: "DON'T LOOK BACK", attribution: "handwritten note" }, "fact-note"),
      insert("date", { dateText: "October 12 1998" }, "fact-date"),
      insert("newspaper-heading", { headline: "archive newspaper heading", dateText: "October 12 1998" }, "fact-date"),
      insert("terminal-log", { outputLine: "EXPERIMENT FAILED" }, "fact-terminal"),
      insert("location-label", { label: "Ward C" }, "fact-location"),
    ];

    const artifact = evidenceInsertArtifactSchema.parse({
      schemaVersion: 1,
      sourceId: episodeIdSchema.parse("episode-fixture"),
      locale: "en-US",
      variant: "short",
      inserts,
    });
    const results = validateEvidenceInsertsAgainstFacts({
      inserts: artifact.inserts,
      sourceFacts,
    });

    expect(results.every((result) => result.supported)).toBe(true);
    expect(JSON.stringify(artifact)).toBe(JSON.stringify(evidenceInsertArtifactSchema.parse(artifact)));
  });

  it("rejects malformed insert schema inputs", () => {
    const valid = insert("clock", { timeText: "03:17" }, "fact-clock");
    expect(evidenceInsertSchema.safeParse({ ...valid, sourceFactId: undefined }).success).toBe(false);
    expect(evidenceInsertSchema.safeParse({ ...valid, locale: "not a locale" }).success).toBe(false);
    expect(evidenceInsertSchema.safeParse({ ...valid, id: "../unsafe" }).success).toBe(false);
    expect(evidenceInsertSchema.safeParse({ ...valid, kind: "unknown" }).success).toBe(false);
    expect(
      evidenceInsertSchema.safeParse({
        ...valid,
        layout: { ...valid.layout, bounds: { x: 0.9, y: 0, width: 0.2, height: 0.2 } },
      }).success,
    ).toBe(false);
    expect(
      evidenceInsertSchema.safeParse({
        ...valid,
        dimensions: { ...valid.dimensions, widthPx: 0 },
      }).success,
    ).toBe(false);
  });

  it("returns typed unsupported results instead of inventing evidence", () => {
    const missing = validateEvidenceInsertAgainstFacts({
      insert: insert("clock", { timeText: "03:17" }, "fact-missing"),
      sourceFacts,
    });
    const incompatible = validateEvidenceInsertAgainstFacts({
      insert: insert("medical-reading", { metric: "pulse", value: "42", unit: "bpm" }, "fact-clock"),
      sourceFacts,
    });
    const untraced = validateEvidenceInsertAgainstFacts({
      insert: insert("message", { messageText: "THIS WAS NEVER SAID" }, "fact-message"),
      sourceFacts,
    });

    expect(missing).toMatchObject({ supported: false, reason: "source-fact-missing" });
    expect(incompatible).toMatchObject({ supported: false, reason: "unsupported-fact-to-insert" });
    expect(untraced).toMatchObject({ supported: false, reason: "content-not-traceable" });
  });

  it("builds deterministic cache identities from stable render inputs", () => {
    const original = insert("message", { sender: "Mara", messageText: "SHE OPENED THE DOOR", timestampText: "03:17" }, "fact-message");
    const reorderedLayout = evidenceInsertSchema.parse({
      ...original,
      layout: {
        ...original.layout,
        compatibleAspectRatios: ["9:16", "16:9"],
        protectedSubregions: [...original.layout.protectedSubregions].reverse(),
      },
    });
    const localized = evidenceInsertSchema.parse({
      ...original,
      locale: "de-DE",
      content: { sender: "Mara", messageText: "SIE OEFFNETE DIE TUER", timestampText: "03:17" },
    });

    expect(buildEvidenceInsertCacheIdentity(reorderedLayout)).toEqual(
      buildEvidenceInsertCacheIdentity(original),
    );
    expect(buildEvidenceInsertCacheIdentity(localized).fingerprint).not.toBe(
      buildEvidenceInsertCacheIdentity(original).fingerprint,
    );
    expect(() =>
      buildEvidenceInsertCacheIdentity({
        ...original,
        dimensions: { ...original.dimensions, heightPx: Number.NaN },
      } as unknown as EvidenceInsert),
    ).toThrow();
  });

  it("renders deterministic escaped SVG assets without remote resources", () => {
    const svgInsert = insert("handwritten-note", { noteText: "DON'T <LOOK> & BACK", attribution: "handwritten note" }, "fact-note");
    const first = renderEvidenceInsertSvg(svgInsert);
    const second = renderEvidenceInsertSvg(svgInsert);

    expect(second).toEqual(first);
    expect(first.svg).toContain("DON&#39;T &lt;LOOK&gt; &amp; BACK");
    expect(first.svg).not.toContain("<script");
    expect(first.mediaType).toBe("image/svg+xml");
  });
});
