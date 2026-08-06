import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeHistoryNarrationV33 } from "./history-narration-v33.js";
import {
  DEFAULT_HISTORY_SOURCE_AUTHORITY_MODE,
  TRUSTED_SCRIPT_REVIEW_WARNING,
  contentGateAllowsTrustedClaimV33,
  createTrustedNarrationAttestationV1,
  diffTrustedScriptNarrationV33,
  extractDeterministicTrustedClaimsV33,
  freezeTrustedScriptResearchSnapshotV33,
  importTrustedClaimsFromStoryGenerationV33,
  invalidateTrustedNarrationAttestationV1,
  isTrustedAttestationValidV1,
  resolveHistorySourceAuthorityMode,
  trustedResearchDiagnosticsV33,
  validateNarrationBoundDiagramEdgeV33,
  validateNarrationBoundMapRouteV33,
  type HistoryStoryGenerationResultV1,
} from "./history-trusted-script-v33.js";
import {
  assertLiveResearchAllowedForAuthorityV33,
  runHistoryTrustScriptMigrationV33,
} from "./history-trusted-workflow-v33.js";
import {
  buildHistoryVisualPlanV33,
  validateHistoryDiagramStatesV33,
  validateHistoryMapStatesV33,
} from "./visual-planner-v33.js";
import { HISTORY_LONG_FORM_DURATION_POLICY_V33 } from "./history-narration-v33.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});

async function seedEpisode(script: string): Promise<{
  outputRoot: string;
  episodeId: string;
}> {
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "history-trusted-"));
  roots.push(outputRoot);
  const episodeId = "history-trusted-fixture";
  const root = path.join(outputRoot, episodeId);
  await fs.mkdir(path.join(root, "languages"), { recursive: true });
  await fs.mkdir(path.join(root, "source"), { recursive: true });
  await fs.writeFile(path.join(root, "languages", "script-en.md"), script, "utf8");
  await fs.writeFile(
    path.join(root, "source", "normalized-metadata.json"),
    `${JSON.stringify(
      {
        canonicalGenre: "history",
        originalFrontmatter: { title: "Trusted Fixture" },
        geographicScope: { labels: ["Russia", "Niemen"] },
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  return { outputRoot, episodeId };
}

describe("History trusted-script defaults", () => {
  it("defaults History to trusted-script and leaves unrelated genres unchanged", () => {
    expect(DEFAULT_HISTORY_SOURCE_AUTHORITY_MODE).toBe("trusted-script");
    expect(
      resolveHistorySourceAuthorityMode({ genreId: "history" })
    ).toEqual({ mode: "trusted-script", resolvedFrom: "default" });
    expect(
      resolveHistorySourceAuthorityMode({ genreId: "horror" })
    ).toEqual({ mode: null, resolvedFrom: "non-history" });
    expect(
      resolveHistorySourceAuthorityMode({
        genreId: "history",
        explicitMode: "research-backed",
      })
    ).toEqual({ mode: "research-backed", resolvedFrom: "cli" });
    expect(
      resolveHistorySourceAuthorityMode({
        genreId: "history",
        episodeMetadataMode: "unverified-external",
      })
    ).toEqual({ mode: "unverified-external", resolvedFrom: "episode-metadata" });
  });
});

describe("History trusted attestation", () => {
  it("binds narration hash, invalidates mismatches, and stays append-only", () => {
    const attestation = createTrustedNarrationAttestationV1({
      episodeId: "ep",
      narrationHash: "abc",
      assertion: "accepted-without-independent-verification",
    });
    expect(attestation.id).toMatch(/^attestation-/);
    expect(
      isTrustedAttestationValidV1({
        attestation,
        narrationHash: "abc",
      })
    ).toBe(true);
    expect(
      isTrustedAttestationValidV1({
        attestation,
        narrationHash: "changed",
      })
    ).toBe(false);
    const partial = createTrustedNarrationAttestationV1({
      episodeId: "ep",
      narrationHash: "abc",
      scope: "selected-claims",
      selectedClaimIds: ["claim-a"],
    });
    expect(
      isTrustedAttestationValidV1({
        attestation: partial,
        narrationHash: "abc",
        claimId: "claim-a",
      })
    ).toBe(true);
    expect(
      isTrustedAttestationValidV1({
        attestation: partial,
        narrationHash: "abc",
        claimId: "claim-b",
      })
    ).toBe(false);
    const invalidated = invalidateTrustedNarrationAttestationV1(attestation, {
      reason: "hash mismatch",
      invalidatedAt: "1980-01-01T00:00:00.000Z",
    });
    expect(invalidated.invalidatedAt).toBe("1980-01-01T00:00:00.000Z");
    expect(attestation.invalidatedAt).toBeNull();
    expect(attestation.assertion).toBe(
      "accepted-without-independent-verification"
    );
  });
});

describe("History trusted claim extraction", () => {
  it("extracts deterministic trusted_input claims without supported status", () => {
    const narration = normalizeHistoryNarrationV33({
      episodeId: "ep",
      rawScript:
        "In 1812, Napoleon crossed the Niemen into Russia.\n\nBut that was not the end.",
    });
    const attestation = createTrustedNarrationAttestationV1({
      episodeId: "ep",
      narrationHash: narration.normalizedTextSha256,
    });
    const extracted = extractDeterministicTrustedClaimsV33({
      episodeId: "ep",
      narration,
      attestationId: attestation.id,
      knownEntities: ["Napoleon", "Russia", "Niemen"],
    });
    expect(extracted.trustedClaims.length).toBeGreaterThan(0);
    expect(
      extracted.trustedClaims.every((claim) => claim.independentlyVerified === false)
    ).toBe(true);
    expect(
      extracted.trustedClaims.some((claim) => claim.provenanceStatus === "trusted_input")
    ).toBe(true);
    expect(
      extracted.trustedClaims.every(
        (claim) =>
          claim.provenanceStatus === "trusted_input" ||
          claim.provenanceStatus === "not_required"
      )
    ).toBe(true);
    const snapshot = freezeTrustedScriptResearchSnapshotV33({
      episodeId: "ep",
      snapshotVersion: 1,
      canonicalNarration: narration,
      claims: extracted.claims,
      trustedClaims: extracted.trustedClaims,
      attestation,
    });
    expect(snapshot.sourceReferences).toEqual([]);
    expect(snapshot.evidenceFragments).toEqual([]);
    expect(snapshot.providerRuns).toEqual([]);
    expect(
      snapshot.provenance.every((item) => item.status !== "supported")
    ).toBe(true);
    expect(trustedResearchDiagnosticsV33()).toEqual({
      researchMode: "skipped-trusted-script",
      providerCalls: 0,
      webSearchCalls: 0,
      externalSourcesRequired: false,
    });
  });

  it("imports story-generation claim proposals with stable IDs and spans", () => {
    const text = "In 1812, Napoleon crossed the Niemen into Russia.";
    const narration = normalizeHistoryNarrationV33({
      episodeId: "ep",
      rawScript: text,
    });
    const generation: HistoryStoryGenerationResultV1 = {
      narrationMarkdown: text,
      trustedClaimProposals: [
        {
          verbatimNarrationText: text,
          normalizedProposition: text,
          claimKind: "event",
          materialityRecommendation: "material",
          entities: [{ text: "Napoleon", role: "actor" }],
          temporalQualifiers: ["1812"],
          geographicQualifiers: ["Niemen", "Russia"],
          quantitativeQualifiers: [],
          uncertaintyMarkers: [],
        },
      ],
      claimNarrationBindings: [
        { claimProposalIndex: 0, verbatimNarrationText: text },
      ],
      visualOpportunities: [
        {
          claimProposalIndexes: [0],
          suggestedModality: "map",
          purpose: "show crossing",
        },
      ],
    };
    const imported = importTrustedClaimsFromStoryGenerationV33({
      episodeId: "ep",
      narration,
      generation,
      attestationId: "attestation-test",
    });
    expect(imported.trustedClaims).toHaveLength(1);
    expect(imported.trustedClaims[0]!.narrationSpan.startUtf16).toBeGreaterThanOrEqual(0);
    expect(imported.trustedClaims[0]!.provenanceStatus).toBe("trusted_input");
    expect(imported.trustedClaims[0]!.id).toMatch(/^trusted-claim-/);
  });
});

describe("History trusted approval and visuals", () => {
  it("permits content gate only with valid trusted attestation", () => {
    const attestation = createTrustedNarrationAttestationV1({
      episodeId: "ep",
      narrationHash: "hash",
    });
    expect(
      contentGateAllowsTrustedClaimV33({
        provenanceStatus: "trusted_input",
        attestation,
        narrationHash: "hash",
        claimId: "c1",
        authorityMode: "trusted-script",
      })
    ).toBe(true);
    expect(
      contentGateAllowsTrustedClaimV33({
        provenanceStatus: "trusted_input",
        attestation: null,
        narrationHash: "hash",
        claimId: "c1",
        authorityMode: "trusted-script",
      })
    ).toBe(false);
    expect(
      contentGateAllowsTrustedClaimV33({
        provenanceStatus: "trusted_input",
        attestation,
        narrationHash: "hash",
        claimId: "c1",
        authorityMode: "unverified-external",
      })
    ).toBe(false);
    expect(
      contentGateAllowsTrustedClaimV33({
        provenanceStatus: "supported",
        attestation,
        narrationHash: "hash",
        claimId: "c1",
        authorityMode: "trusted-script",
      })
    ).toBe(false);
  });

  it("accepts narration-bound maps and rejects unsupported routes and edges", () => {
    expect(
      validateNarrationBoundMapRouteV33({
        narrationText: "Napoleon crossed the Niemen into Russia.",
        claimTexts: ["Napoleon crossed the Niemen into Russia."],
        route: {
          label: "crossed",
          originLabel: "Niemen",
          destinationLabel: "Russia",
          linkedClaimIds: ["c1"],
        },
      }).ok
    ).toBe(true);
    expect(
      validateNarrationBoundMapRouteV33({
        narrationText: "Napoleon crossed the Niemen into Russia.",
        claimTexts: ["Napoleon crossed the Niemen into Russia."],
        route: {
          label: "secret alpine pass",
          originLabel: "Alps",
          destinationLabel: "Rome",
          linkedClaimIds: ["c1"],
        },
      }).ok
    ).toBe(false);
    expect(
      validateNarrationBoundDiagramEdgeV33({
        claimTexts: ["Shortage caused retreat."],
        fromLabel: "Shortage",
        toLabel: "retreat",
        relationship: "caused",
      }).ok
    ).toBe(true);
    expect(
      validateNarrationBoundDiagramEdgeV33({
        claimTexts: ["Shortage caused retreat."],
        fromLabel: "Weather",
        toLabel: "victory",
        relationship: "guaranteed",
      }).ok
    ).toBe(false);
  });

  it("builds trusted visual plans with zero provider research calls", () => {
    const narration = normalizeHistoryNarrationV33({
      episodeId: "ep",
      rawScript:
        "In 1812, Napoleon crossed the Niemen into Russia because supply failed.",
    });
    const attestation = createTrustedNarrationAttestationV1({
      episodeId: "ep",
      narrationHash: narration.normalizedTextSha256,
    });
    const extracted = extractDeterministicTrustedClaimsV33({
      episodeId: "ep",
      narration,
      attestationId: attestation.id,
    });
    const snapshot = freezeTrustedScriptResearchSnapshotV33({
      episodeId: "ep",
      snapshotVersion: 1,
      canonicalNarration: narration,
      claims: extracted.claims,
      trustedClaims: extracted.trustedClaims,
      attestation,
    });
    const plan = buildHistoryVisualPlanV33({
      title: "Trusted",
      researchSnapshot: snapshot,
      durationPolicy: HISTORY_LONG_FORM_DURATION_POLICY_V33,
    });
    expect(plan.aspectRatioPlans.some((item) => item.ratio === "16:9")).toBe(true);
    expect(plan.aspectRatioPlans.some((item) => item.ratio === "9:16")).toBe(true);
    expect(snapshot.providerRuns).toHaveLength(0);
    const mapDiagnostics = validateHistoryMapStatesV33({
      mapStates: [
        {
          id: "map-1",
          masterId: "master-1",
          purpose: "Crossing",
          baseGeography: "Eastern Europe",
          timePeriod: "1812",
          affectedArea: "Niemen to Russia",
          territorialState: "broad narration-bound geography only",
          labels: [],
          routes: [
            {
              id: "route-1",
              label: "crossed",
              origin: { label: "Niemen", coordinates: [0, 0] },
              destination: { label: "Russia", coordinates: [1, 1] },
              routeType: "overland",
              movingActor: "Napoleon",
              carrierOrVehicle: null,
              transportedObjectOrPathogen: null,
              dateOrPeriod: "1812",
              uncertainty: "broad",
              linkedClaimIds: [extracted.claims[0]!.id],
              linkedEvidenceIds: [],
            },
          ],
          uncertainty: "Retain claim-level uncertainty markers from trusted narration.",
          semanticStatus: "valid",
        },
      ],
      claimIds: new Set(extracted.claims.map((claim) => claim.id)),
      evidenceIds: new Set(),
      authorityMode: "trusted-script",
      narrationText: narration.normalizedText,
      claimTextsById: new Map(
        extracted.claims.map((claim) => [claim.id, claim.normalizedProposition])
      ),
    });
    expect(mapDiagnostics).toEqual([]);
    const fakeEvidence = validateHistoryMapStatesV33({
      mapStates: [
        {
          id: "map-1",
          masterId: "master-1",
          purpose: "Crossing",
          baseGeography: "Eastern Europe",
          timePeriod: "1812",
          affectedArea: "Niemen to Russia",
          territorialState: "broad narration-bound geography only",
          labels: [],
          routes: [
            {
              id: "route-1",
              label: "crossed",
              origin: { label: "Niemen", coordinates: [0, 0] },
              destination: { label: "Russia", coordinates: [1, 1] },
              routeType: "overland",
              movingActor: "Napoleon",
              carrierOrVehicle: null,
              transportedObjectOrPathogen: null,
              dateOrPeriod: "1812",
              uncertainty: "broad",
              linkedClaimIds: [extracted.claims[0]!.id],
              linkedEvidenceIds: ["fake"],
            },
          ],
          uncertainty: "Retain claim-level uncertainty markers from trusted narration.",
          semanticStatus: "valid",
        },
      ],
      claimIds: new Set(extracted.claims.map((claim) => claim.id)),
      evidenceIds: new Set(["fake"]),
      authorityMode: "trusted-script",
      narrationText: narration.normalizedText,
      claimTextsById: new Map(
        extracted.claims.map((claim) => [claim.id, claim.normalizedProposition])
      ),
    });
    expect(fakeEvidence.some((item) => item.code === "MAP_FAKE_EVIDENCE")).toBe(
      true
    );
    const researchBacked = validateHistoryDiagramStatesV33({
      diagramStates: [
        {
          id: "diagram-1",
          masterId: "master-d",
          diagramType: "causal",
          exactQuestion: "What caused retreat?",
          timeApplicability: "1812",
          geographyApplicability: "Russia",
          uncertainty: "none",
          nodes: [
            {
              id: "n1",
              label: "Supply",
              linkedClaimIds: [extracted.claims[0]!.id],
              linkedEvidenceIds: [],
            },
            {
              id: "n2",
              label: "Retreat",
              linkedClaimIds: [extracted.claims[0]!.id],
              linkedEvidenceIds: [],
            },
          ],
          edges: [
            {
              id: "e1",
              fromNodeId: "n1",
              toNodeId: "n2",
              relationship: "caused",
              linkedClaimIds: [extracted.claims[0]!.id],
              linkedEvidenceIds: [],
            },
          ],
          rejectedAlternatives: [],
          fallbackDecision: "none",
          semanticStatus: "valid",
        },
      ],
      claimIds: new Set(extracted.claims.map((claim) => claim.id)),
      evidenceIds: new Set(),
      authorityMode: "research-backed",
    });
    expect(researchBacked.some((item) => item.severity === "error")).toBe(true);
  });
});

describe("History trusted incremental deltas", () => {
  it("keeps formatting-only changes trusted and invalidates factual changes", () => {
    const previous = normalizeHistoryNarrationV33({
      episodeId: "ep",
      rawScript: "In 1812, Napoleon crossed the Niemen into Russia.",
    });
    const formatting = normalizeHistoryNarrationV33({
      episodeId: "ep",
      rawScript: "In 1812, Napoleon crossed the Niemen into Russia.",
    });
    const previousClaims = extractDeterministicTrustedClaimsV33({
      episodeId: "ep",
      narration: previous,
    }).trustedClaims;
    const formattingClaims = extractDeterministicTrustedClaimsV33({
      episodeId: "ep",
      narration: formatting,
    }).trustedClaims;
    const formattingReport = diffTrustedScriptNarrationV33({
      episodeId: "ep",
      previousNarration: previous,
      nextNarration: formatting,
      previousClaims,
      nextClaims: formattingClaims,
    });
    expect(formattingReport.reattestationRequired).toBe(false);
    const changed = normalizeHistoryNarrationV33({
      episodeId: "ep",
      rawScript: "In 1813, Napoleon crossed the Niemen into Russia.",
    });
    const changedClaims = extractDeterministicTrustedClaimsV33({
      episodeId: "ep",
      narration: changed,
    }).trustedClaims;
    const changedReport = diffTrustedScriptNarrationV33({
      episodeId: "ep",
      previousNarration: previous,
      nextNarration: changed,
      previousClaims,
      nextClaims: changedClaims,
    });
    expect(changedReport.reattestationRequired).toBe(true);
    expect(
      changedReport.deltas.some(
        (delta) => delta.kind === "changed-date" || delta.invalidatesTrust
      )
    ).toBe(true);
  });
});

describe("History trusted migration offline", () => {
  it("migrates without provider calls or API key and emits trusted warning", async () => {
    const previousKey = process.env["OPENAI_API_KEY"];
    delete process.env["OPENAI_API_KEY"];
    const { outputRoot, episodeId } = await seedEpisode(
      "In 1812, Napoleon crossed the Niemen into Russia because supply failed.\n\nBut that was not the end."
    );
    try {
      const result = await runHistoryTrustScriptMigrationV33({
        episodeId,
        outputRoot,
      });
      expect(result["providerCalls"]).toBe(0);
      expect(result["webSearchCalls"]).toBe(0);
      expect(result["sourceAuthorityMode"]).toBe("trusted-script");
      expect(result["warning"]).toBe(TRUSTED_SCRIPT_REVIEW_WARNING);
      expect(Number(result["trustedClaimCount"])).toBeGreaterThan(0);
      expect(() =>
        assertLiveResearchAllowedForAuthorityV33({
          mode: "trusted-script",
        })
      ).toThrow(/promote-to-research-backed/);
      assertLiveResearchAllowedForAuthorityV33({
        mode: "trusted-script",
        promoteToResearchBacked: true,
      });
      const authority = JSON.parse(
        await fs.readFile(
          path.join(
            outputRoot,
            episodeId,
            "source",
            "history-v3.3",
            "source-authority.json"
          ),
          "utf8"
        )
      ) as { sourceAuthorityMode: string };
      expect(authority.sourceAuthorityMode).toBe("trusted-script");
    } finally {
      if (previousKey === undefined) delete process.env["OPENAI_API_KEY"];
      else process.env["OPENAI_API_KEY"] = previousKey;
    }
  });
});
