import { describe, expect, it } from "vitest";
import { proposeMapIntentsV35 } from "./history-geo-v35.js";
import { structureTrustedScriptClaimsV34 } from "./history-claims-v34.js";
import { normalizeHistoryNarrationV33 } from "./history-narration-v33.js";
import type {
  HistoryClaimV34,
  HistoryEntityMentionV34,
  HistoryGeographicQualifierV34,
} from "./history-v34-contracts.js";

const FRANKLIN_EPISODE =
  "history-youtube-history-10-video-story-pack-05-franklin-expedition";

const FRANKLIN_OPENING = `In May 1845, two Royal Navy ships sailed from Britain with 134 officers and crew to search for the Northwest Passage.

Whaling ships saw the remaining 129 in Baffin Bay that summer after five men had returned from Greenland.`;

const britainEntity: HistoryEntityMentionV34 = {
  id: "entity-britain",
  claimId: "claim-interest",
  normalizedLabel: "Britain",
  entityType: "place",
  semanticRole: "region",
  text: "Britain",
};

const passageEntity: HistoryEntityMentionV34 = {
  id: "entity-passage",
  claimId: "claim-interest",
  normalizedLabel: "Northwest Passage",
  entityType: "water-body",
  semanticRole: "region",
  text: "Northwest Passage",
};

const interestClaim: HistoryClaimV34 = {
  id: "claim-interest",
  episodeId: "franklin",
  schemaVersion: "history-claim.v3.4",
  normalizedProposition:
    "Britain’s interest in the Northwest Passage was strategic, scientific, and symbolic.",
  verbatimTexts: [
    "Britain’s interest in the Northwest Passage was strategic, scientific, and symbolic.",
  ],
  narrationUnitIds: ["unit-0010"],
  narrationSpans: [{ startUtf16: 0, endUtf16Exclusive: 80 }],
  claimKind: "place",
  materiality: "material",
  authorityMode: "trusted-script",
  provenanceStatus: "trusted_input",
  independentlyVerified: false,
  trustAttestationId: "attestation-test",
  entityMentionIds: [britainEntity.id, passageEntity.id],
  geographicQualifierIds: ["geo-britain", "geo-passage"],
  temporalQualifierIds: [],
  quantitativeQualifierIds: [],
  uncertaintyMarkers: [],
};

const geographicQualifiers: HistoryGeographicQualifierV34[] = [
  {
    id: "geo-britain",
    claimId: "claim-interest",
    entityMentionId: britainEntity.id,
    role: "location",
    text: "Britain",
  },
  {
    id: "geo-passage",
    claimId: "claim-interest",
    entityMentionId: passageEntity.id,
    role: "location",
    text: "Northwest Passage",
  },
];

describe("History V3.5 Franklin geography regressions", () => {
  it("extracts 134 and 129 crew counts as quantitative qualifiers", () => {
    const narration = normalizeHistoryNarrationV33({
      episodeId: FRANKLIN_EPISODE,
      rawScript: FRANKLIN_OPENING,
    });
    const structured = structureTrustedScriptClaimsV34({
      episodeId: FRANKLIN_EPISODE,
      narration,
      authorityMode: "trusted-script",
    });
    expect(
      structured.quantitativeQualifiers.some((item) => item.normalizedValue === "134")
    ).toBe(true);
    expect(
      structured.quantitativeQualifiers.some((item) => item.normalizedValue === "129")
    ).toBe(true);
    expect(
      structured.temporalQualifiers.some((item) => item.normalizedValue === "134")
    ).toBe(false);
    expect(
      structured.temporalQualifiers.some((item) => item.normalizedValue === "129")
    ).toBe(false);
  });

  it("includes all claim geography on non-movement map intents", () => {
    const intents = proposeMapIntentsV35({
      claims: [interestClaim],
      entities: [britainEntity, passageEntity],
      geographicQualifiers,
      temporalQualifiers: [],
    });
    const intent = intents.find((item) => item.claimIds.includes("claim-interest"));
    expect(intent).toBeDefined();
    expect(intent?.waypointPlaceMentionIds).toContain(passageEntity.id);
    expect(intent?.originPlaceMentionIds).toContain(britainEntity.id);
  });
});
