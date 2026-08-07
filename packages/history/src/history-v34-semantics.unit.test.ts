import { describe, expect, it } from "vitest";
import { compileMapStateV34, proposeMapIntentsV34 } from "./history-geo-v34.js";
import { normalizeHistoryNarrationV33 } from "./history-narration-v33.js";
import { structureTrustedScriptClaimsV34 } from "./history-claims-v34.js";
import {
  applyPlanProductionPrerequisitesV34,
  buildHistoryValidationSnapshotV34,
  buildHistoryVisualPlanV34,
} from "./visual-planner-v34.js";
import {
  buildVisualPurposeV34,
  claimAuthorizesRouteMovement,
  claimHasDiscoveryGeography,
  claimIdsSupportingMapLabelV34,
  deriveLongTextOnlyRemediationV34,
  FIXED_AUDIT_PLACEHOLDER_ISO,
  hasTextOnlyEditorialJustification,
  isGenericVisualPurposeText,
  isLongTextOnlyWithoutJustification,
  isSinglePlaceMapPurpose,
  normalizeTrustedAttestationTimestampsV34,
  resolveReconstructionPolicyV34,
  shouldSplitLongStaticBeat,
  summarizeVerificationStatusV34,
  validateDiagramSemanticsV34,
  validateMapLabelProvenanceV34,
  validateRouteVisualPurposeAlignment,
} from "./history-visual-semantics-v34.js";
import { createTrustedNarrationAttestationV1 } from "./history-trusted-script-v33.js";

const FRANKLIN_EPISODE =
  "history-youtube-history-10-video-story-pack-05-franklin-expedition";

const FRANKLIN_SNIPPET = `In May 1845, two Royal Navy ships sailed from Britain to search for the Northwest Passage.
Whaling ships saw them in Baffin Bay that summer.
The expedition wintered at Beechey Island.
The ships were trapped in the ice off King William Island.
The 105 survivors abandoned the ships on April 22 and planned to march toward the Back River.
Searchers found graves, abandoned equipment, human remains, and a written message.
In 2014, a Canadian search located HMS Erebus.
In 2016, HMS Terror was found in Terror Bay.`;

function franklinStructured() {
  const narration = normalizeHistoryNarrationV33({
    episodeId: FRANKLIN_EPISODE,
    rawScript: FRANKLIN_SNIPPET,
  });
  return {
    narration,
    structured: structureTrustedScriptClaimsV34({
      episodeId: FRANKLIN_EPISODE,
      narration,
      authorityMode: "trusted-script",
    }),
  };
}

describe("History V3.4 visual semantics", () => {
  it("rejects or downgrades same-origin/destination route maps", () => {
    const { structured, narration } = franklinStructured();
    const compiled = compileMapStateV34({
      beatNumber: "0099",
      proposal: {
        claimIds: [structured.claims[0]!.id],
        mapPurpose: "expedition-route",
        movingActorEntityMentionIds: [],
        originPlaceMentionIds: structured.entities
          .filter((entity) => entity.normalizedLabel === "Britain")
          .map((entity) => entity.id)
          .slice(0, 1),
        destinationPlaceMentionIds: structured.entities
          .filter((entity) => entity.normalizedLabel === "Britain")
          .map((entity) => entity.id)
          .slice(0, 1),
        waypointPlaceMentionIds: [],
        temporalQualifierIds: [],
        routeType: "maritime",
        uncertainty: [],
      },
      claims: structured.claims,
      entities: structured.entities,
      geographicQualifiers: structured.geographicQualifiers,
      temporalQualifiers: structured.temporalQualifiers,
      narrationText: narration.normalizedText,
    });
    expect(compiled?.state.routes).toEqual([]);
    expect(compiled?.state.mapPurpose).toBe("location");
  });

  it("compiles single-location maps without invented routes", () => {
    const { structured, narration } = franklinStructured();
    const beechey = structured.entities.find((entity) => entity.normalizedLabel === "Beechey Island");
    expect(beechey).toBeTruthy();
    const compiled = compileMapStateV34({
      beatNumber: "0003",
      proposal: {
        claimIds: [structured.claims.find((claim) => /Beechey Island/iu.test(claim.normalizedProposition))!.id],
        mapPurpose: "location",
        movingActorEntityMentionIds: [],
        originPlaceMentionIds: [beechey!.id],
        destinationPlaceMentionIds: [beechey!.id],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: [],
        routeType: "none",
        uncertainty: [],
      },
      claims: structured.claims,
      entities: structured.entities,
      geographicQualifiers: structured.geographicQualifiers,
      temporalQualifiers: structured.temporalQualifiers,
      narrationText: narration.normalizedText,
    });
    expect(compiled?.state.routes).toEqual([]);
    expect(isSinglePlaceMapPurpose(compiled!.state.mapPurpose)).toBe(true);
  });

  it("preserves route direction and rejects ungrounded discovery geography", () => {
    const { structured } = franklinStructured();
    const intents = proposeMapIntentsV34({
      claims: structured.claims,
      entities: structured.entities,
      geographicQualifiers: structured.geographicQualifiers,
      temporalQualifiers: structured.temporalQualifiers,
    });
    const expedition = intents.find((intent) => intent.mapPurpose === "expedition-route");
    expect(expedition).toBeTruthy();
    const britain = structured.entities.find((entity) => entity.normalizedLabel === "Britain");
    const passage = structured.entities.find((entity) => entity.normalizedLabel === "Northwest Passage");
    expect(expedition?.originPlaceMentionIds[0]).toBe(britain?.id);
    expect(expedition?.destinationPlaceMentionIds[0]).toBe(passage?.id);

    const march = intents.find((intent) => intent.routeType === "overland");
    const backRiver = structured.entities.find((entity) => entity.normalizedLabel === "Back River");
    const kingWilliam = structured.entities.find((entity) => entity.normalizedLabel === "King William Island");
    expect(march?.originPlaceMentionIds[0]).toBe(kingWilliam?.id);
    expect(march?.destinationPlaceMentionIds[0]).toBe(backRiver?.id);

    const discoveries = intents.filter((intent) => intent.mapPurpose === "discovery-location");
    expect(discoveries).toHaveLength(1);
    const erebusClaim = structured.claims.find((claim) => /2014\b.*\bErebus\b/iu.test(claim.normalizedProposition));
    expect(erebusClaim).toBeTruthy();
    expect(
      claimHasDiscoveryGeography({
        claim: erebusClaim!,
        entities: structured.entities,
        geographicQualifiers: structured.geographicQualifiers,
      })
    ).toBe(false);
  });

  it("uses location maps for sighting claims and aligns route visual purposes", () => {
    const { structured } = franklinStructured();
    const intents = proposeMapIntentsV34({
      claims: structured.claims,
      entities: structured.entities,
      geographicQualifiers: structured.geographicQualifiers,
      temporalQualifiers: structured.temporalQualifiers,
    });
    const baffinClaim = structured.claims.find((claim) => /Baffin Bay/iu.test(claim.normalizedProposition));
    expect(baffinClaim).toBeTruthy();
    expect(claimAuthorizesRouteMovement(baffinClaim!.normalizedProposition)).toBe(false);
    const baffinIntent = intents.find((intent) => intent.claimIds.includes(baffinClaim!.id));
    expect(baffinIntent?.mapPurpose).toBe("location");
    expect(baffinIntent?.routeType).toBe("none");

    const purpose = buildVisualPurposeV34({
      modality: "map",
      narrationExcerpt: "In May 1845, two Royal Navy ships sailed from Britain to search for the Northwest Passage.",
      places: ["Britain", "Northwest Passage"],
      temporals: ["May 1845"],
      mapPurpose: "expedition-route",
      route: { origin: "Britain", destination: "Northwest Passage" },
      beatAuthorizesMovement: true,
    });
    expect(validateRouteVisualPurposeAlignment({
      visualPurpose: purpose,
      route: { origin: "Britain", destination: "Northwest Passage" },
    })).toEqual([]);
    expect(purpose).toContain("Britain");
    expect(purpose).toContain("Northwest Passage");
  });

  it("does not create sequence edges for evidence enumeration diagrams", () => {
    const blockers = validateDiagramSemanticsV34({
      state: {
        id: "diagram-state-test",
        masterId: "diagram-master-test",
        diagramType: "evidence-set",
        exactQuestion: "evidence",
        nodes: [
          { id: "n1", label: "graves", linkedClaimIds: ["claim-1"], entityMentionIds: [] },
          { id: "n2", label: "equipment", linkedClaimIds: ["claim-1"], entityMentionIds: [] },
        ],
        edges: [],
        semanticStatus: "valid",
        blockerCodes: [],
        fallbackDecision: null,
      },
      linkedClaimText:
        "Searchers found graves, abandoned equipment, human remains, and a written message.",
    });
    expect(blockers).toEqual([]);
  });

  it("flags unsupported diagram relationships", () => {
    const blockers = validateDiagramSemanticsV34({
      state: {
        id: "diagram-state-test",
        masterId: "diagram-master-test",
        diagramType: "process",
        exactQuestion: "evidence",
        nodes: [
          { id: "n1", label: "graves", linkedClaimIds: ["claim-1"], entityMentionIds: [] },
          { id: "n2", label: "equipment", linkedClaimIds: ["claim-1"], entityMentionIds: [] },
        ],
        edges: [
          {
            id: "e1",
            fromNodeId: "n1",
            toNodeId: "n2",
            relationship: "sequence",
            linkedClaimIds: ["claim-1"],
          },
        ],
        semanticStatus: "valid",
        blockerCodes: [],
        fallbackDecision: null,
      },
      linkedClaimText:
        "Searchers found graves, abandoned equipment, human remains, and a written message.",
    });
    expect(blockers).toContain("DIAGRAM_UNSUPPORTED_EDGE");
  });

  it("builds non-template visual purposes and detects generic boilerplate", () => {
    const purpose = buildVisualPurposeV34({
      modality: "map",
      narrationExcerpt:
        "The ships were trapped in the ice off King William Island before the abandonment.",
      places: ["King William Island"],
      temporals: ["1847"],
      mapPurpose: "location",
    });
    expect(purpose.toLowerCase()).toContain("king william island");
    expect(isGenericVisualPurposeText(purpose)).toBe(false);
    expect(isGenericVisualPurposeText("map clarifying beat 0010")).toBe(true);
  });

  it("warns on long static beats and supports semantic multi-shot splitting", () => {
    expect(
      shouldSplitLongStaticBeat({
        durationMs: 13_000,
        modality: "archival image",
        semanticSegments: 1,
      })
    ).toBe(true);
    expect(
      shouldSplitLongStaticBeat({
        durationMs: 9_000,
        modality: "archival image",
        semanticSegments: 2,
      })
    ).toBe(true);
  });

  it("assigns reconstruction provenance by modality", () => {
    expect(resolveReconstructionPolicyV34("archival image")).toBe("documented-archival");
    expect(resolveReconstructionPolicyV34("map")).toBe("map-or-diagram");
    expect(resolveReconstructionPolicyV34("restrained atmospheric reconstruction")).toBe(
      "historically-constrained-reconstruction"
    );
    expect(resolveReconstructionPolicyV34("text-only transition")).toBe("not-applicable");
  });

  it("distinguishes trusted-script acceptance from independent verification", () => {
    const summary = summarizeVerificationStatusV34([
      {
        independentlyVerified: false,
        authorityMode: "trusted-script",
      },
    ]);
    expect(summary.trustedNarrationAccepted).toBe(true);
    expect(summary.independentlyVerifiedCount).toBe(0);
    expect(summary.productionApprovalNote).toMatch(/not been performed/i);
  });

  it("remediates long text-only beats when a supported modality exists", () => {
    const remediated = deriveLongTextOnlyRemediationV34({
      text: "For years, Britain sent search expeditions into the Arctic.",
      claimIds: ["claim-material-1"],
      claims: [
        {
          id: "claim-material-1",
          materiality: "material",
          normalizedProposition:
            "For years, Britain sent search expeditions into the Arctic.",
        },
      ],
      entities: [{ claimId: "claim-material-1", normalizedLabel: "Britain", entityType: "state" }],
      durationMs: 18_000,
      mapIntents: [],
      hasEditorialOverride: false,
    });
    expect(remediated).toBe("map");
    expect(
      isLongTextOnlyWithoutJustification({
        modality: remediated ?? "text-only transition",
        durationMs: 18_000,
        fallback: null,
      })
    ).toBe(false);
  });

  it("keeps long rhetorical text-only blocking without override", () => {
    expect(
      deriveLongTextOnlyRemediationV34({
        text: "Why did everyone die?",
        claimIds: [],
        claims: [],
        entities: [],
        durationMs: 18_000,
        mapIntents: [],
        hasEditorialOverride: false,
      })
    ).toBeNull();
    expect(
      isLongTextOnlyWithoutJustification({
        modality: "text-only transition",
        durationMs: 18_000,
        fallback: null,
      })
    ).toBe(true);
    expect(
      hasTextOnlyEditorialJustification({
        fallback: {
          rejectedModality: "map",
          reasonForRejection: "test",
          selectedFallback: "text-only transition",
          semanticJustification: "Editorial override: hold rhetorical bridge without imagery.",
        },
      })
    ).toBe(true);
  });

  it("validates map label provenance and export validation snapshots", () => {
    const blockers = validateMapLabelProvenanceV34({
      state: {
        id: "map-state-test",
        masterId: "map-master-test",
        purpose: "test",
        mapPurpose: "expedition-route",
        baseGeography: "Britain, Baffin Bay, Northwest Passage",
        timePeriod: "May 1845",
        affectedArea: "Britain, Baffin Bay, Northwest Passage",
        labels: [
          {
            text: "Britain",
            placeId: "place-britain",
            linkedClaimIds: ["claim-1"],
            provenance: "narration-claim",
          },
          {
            text: "Baffin Bay",
            placeId: "place-baffin",
            linkedClaimIds: [],
            provenance: "episode-context",
          },
        ],
        routes: [],
        uncertainty: "",
        semanticStatus: "valid",
        blockerCodes: [],
      },
      claims: [
        {
          id: "claim-1",
          normalizedProposition:
            "In May 1845, two Royal Navy ships sailed from Britain to search for the Northwest Passage.",
        },
      ],
      entities: [{ claimId: "claim-1", normalizedLabel: "Britain" }],
    });
    expect(blockers).toEqual([]);
    expect(
      claimIdsSupportingMapLabelV34({
        placeLabel: "Baffin Bay",
        claimIds: ["claim-1"],
        claims: [
          {
            id: "claim-1",
            normalizedProposition:
              "In May 1845, two Royal Navy ships sailed from Britain to search for the Northwest Passage.",
          },
        ],
        entities: [{ claimId: "claim-1", normalizedLabel: "Britain" }],
      })
    ).toEqual([]);

    const { narration } = franklinStructured();
    const plan = buildHistoryVisualPlanV34({
      episodeId: FRANKLIN_EPISODE,
      title: "Franklin Expedition",
      narration,
      authorityMode: "trusted-script",
    });
    const finalized = applyPlanProductionPrerequisitesV34(plan, [
      { code: "LOCAL_VERIFICATION_PENDING", message: "pending" },
    ]);
    const snapshot = buildHistoryValidationSnapshotV34(finalized);
    expect(snapshot.productionBlockerCodes).toContain("LOCAL_VERIFICATION_PENDING");
    expect(snapshot.productionApprovalEligible).toBe(finalized.approval.productionApprovalEligible);
  });

  it("blocks unjustified long text-only beats and normalizes attestation timestamps", () => {
    expect(
      isLongTextOnlyWithoutJustification({
        modality: "text-only transition",
        durationMs: 13_000,
        fallback: null,
      })
    ).toBe(true);
    expect(
      isLongTextOnlyWithoutJustification({
        modality: "text-only transition",
        durationMs: 13_000,
        fallback: {
          rejectedModality: "map",
          reasonForRejection: "test",
          selectedFallback: "text-only transition",
          semanticJustification: "Editorial override: hold rhetorical bridge without imagery.",
        },
      })
    ).toBe(false);
    expect(
      hasTextOnlyEditorialJustification({
        fallback: {
          rejectedModality: "map",
          reasonForRejection: "test",
          selectedFallback: "text-only transition",
          semanticJustification: "Editorial override: hold rhetorical bridge without imagery.",
        },
      })
    ).toBe(true);

    const attestation = createTrustedNarrationAttestationV1({
      episodeId: FRANKLIN_EPISODE,
      narrationHash: "a".repeat(64),
      assertedAt: FIXED_AUDIT_PLACEHOLDER_ISO,
    });
    const normalized = normalizeTrustedAttestationTimestampsV34(attestation);
    expect(normalized.assertedAt).toBeNull();
    expect(normalized.timestampStatus).toBe("not-recorded");
  });

  it("blocks production approval while local verification is pending", () => {
    const { narration } = franklinStructured();
    const plan = buildHistoryVisualPlanV34({
      episodeId: FRANKLIN_EPISODE,
      title: "Franklin Expedition",
      narration,
      authorityMode: "trusted-script",
    });
    const blocked = applyPlanProductionPrerequisitesV34(plan, [
      {
        code: "LOCAL_VERIFICATION_PENDING",
        message: "pending-local-verification",
      },
    ]);
    expect(blocked.approval.productionApprovalEligible).toBe(false);
    expect(blocked.approval.production.blockerCodes).toContain("LOCAL_VERIFICATION_PENDING");
  });
});
