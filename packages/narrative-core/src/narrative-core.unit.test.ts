import { describe, expect, it } from "vitest";

import {
  NARRATIVE_SCHEMA_VERSION,
  computePayloadHash,
  canTransitionRevisionStatus,
  parseCharacterPayload,
  parseNarrativeSnapshotPayload,
  parseRelationshipStatePayload,
  parseSeriesBibleRevision,
  validateContentHash,
  validateNarrativeSnapshotPayload,
  validateRevisionEnvelope,
  validateRevisionStatusTransition,
  type NarrativeSnapshotPayload,
  type SeriesBibleRevision,
} from "./index.js";

const createdAt = "2026-08-12T00:00:00.000Z";

function seriesBiblePayload() {
  return {
    schemaVersion: NARRATIVE_SCHEMA_VERSION,
    seriesId: "series.alpha",
    premise: "A woman receives messages from her future self.",
    genre: "thriller",
    subgenre: "microdrama",
    audience: "Adults seeking fast serialized suspense",
    emotionalPromise: "Urgent curiosity with emotional stakes",
    centralConflict: "Trust versus self-deception",
    centralMystery: "Who is sending the warnings",
    tone: "Tense and intimate",
    themes: ["identity", "trust"],
    storytellingRules: ["Every episode ends on a cliffhanger"],
    prohibitedPatterns: ["Fourth-wall breaks"],
  };
}

function seriesBibleRevision(): SeriesBibleRevision {
  const payload = seriesBiblePayload();
  return {
    schemaVersion: NARRATIVE_SCHEMA_VERSION,
    revisionId: "rev.series-bible.1",
    aggregateId: "series.alpha",
    aggregateKind: "series_bible",
    revisionNumber: 1,
    payload,
    contentHash: computePayloadHash(payload),
    parentRevisionIds: [],
    status: "DRAFT",
    provenance: { sourceKind: "import" },
    createdAt,
  };
}

function snapshotPayload(): NarrativeSnapshotPayload {
  return {
    schemaVersion: NARRATIVE_SCHEMA_VERSION,
    snapshotId: "snapshot.e001",
    seriesId: "series.alpha",
    episodeId: "episode.e001",
    acceptedSeriesBibleRevisionId: "rev.series-bible.1",
    characterStates: [
      {
        schemaVersion: NARRATIVE_SCHEMA_VERSION,
        characterId: "character.veronica",
        goal: "Understand the warning",
        belief: "The message is real",
        emotionalState: "anxious",
        injuriesAndStatus: [],
        provenanceRevisionIds: ["rev.episode.e001"],
      },
    ],
    relationshipStates: [],
    secrets: [],
    knowledgeClaims: [],
    promises: [],
    provenance: { sourceKind: "compilation" },
  };
}

describe("@mediaforge/narrative-core", () => {
  it("parses SeriesBible revision envelopes with matching content hash", () => {
    const revision = seriesBibleRevision();
    const parsed = parseSeriesBibleRevision(revision);
    expect(parsed.success).toBe(true);
    expect(validateContentHash(revision)).toEqual({ ok: true });
    expect(validateRevisionEnvelope(revision).ok).toBe(true);
  });

  it("rejects revision envelopes with content hash mismatch", () => {
    const revision = {
      ...seriesBibleRevision(),
      contentHash: "0000000000000000000000000000000000000000000000000000000000000000",
    };
    const result = validateRevisionEnvelope(revision);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.code).toBe("content_hash_mismatch");
    }
  });

  it("enforces revision status transitions deterministically", () => {
    expect(canTransitionRevisionStatus("DRAFT", "VALIDATED")).toBe(true);
    expect(canTransitionRevisionStatus("DRAFT", "ACCEPTED")).toBe(false);
    expect(validateRevisionStatusTransition("QA_APPROVED", "ACCEPTED").ok).toBe(
      true
    );
    expect(validateRevisionStatusTransition("ACCEPTED", "DRAFT").ok).toBe(false);
  });

  it("rejects self-directed relationship state", () => {
    const parsed = parseRelationshipStatePayload({
      schemaVersion: NARRATIVE_SCHEMA_VERSION,
      fromCharacterId: "character.veronica",
      toCharacterId: "character.veronica",
      affinity: 0,
      trust: 0,
      attraction: 0,
      resentment: 0,
      fear: 0,
      dependency: 0,
      evidenceRevisionIds: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects invalid character payloads", () => {
    const parsed = parseCharacterPayload({
      schemaVersion: NARRATIVE_SCHEMA_VERSION,
      characterId: "character.veronica",
      displayName: "",
      narrativeRole: "protagonist",
      wants: [],
      needs: [],
      fears: [],
      flaws: [],
      contradictions: [],
      speechProfile: "direct",
    });
    expect(parsed.success).toBe(false);
  });

  it("validates narrative snapshot cross references", () => {
    const payload = snapshotPayload();
    expect(validateNarrativeSnapshotPayload(payload).ok).toBe(true);
    expect(parseNarrativeSnapshotPayload(payload).success).toBe(true);
  });

  it("rejects duplicate character states in a snapshot", () => {
    const payload = snapshotPayload();
    payload.characterStates.push({ ...payload.characterStates[0] });
    const result = validateNarrativeSnapshotPayload(payload);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === "duplicate_identifier")).toBe(
        true
      );
    }
  });

  it("rejects relationship references to unknown characters", () => {
    const payload = snapshotPayload();
    payload.relationshipStates.push({
      schemaVersion: NARRATIVE_SCHEMA_VERSION,
      fromCharacterId: "character.veronica",
      toCharacterId: "character.unknown",
      affinity: 10,
      trust: 5,
      attraction: 0,
      resentment: 0,
      fear: 0,
      dependency: 0,
      evidenceRevisionIds: [],
    });
    const result = validateNarrativeSnapshotPayload(payload);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some((issue) => issue.code === "missing_character_reference")
      ).toBe(true);
    }
  });
});
