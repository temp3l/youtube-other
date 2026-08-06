import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  HISTORY_LONG_FORM_DURATION_POLICY_V33,
  assertCanonicalNarrationV33,
  estimateHistoryTimingV33,
  normalizeHistoryNarrationV33,
} from "./history-narration-v33.js";
import {
  OpenAiWebSearchRetrievalProviderV33,
  ResilientClaimExtractionProviderV33,
  alignClaimProposalsV33,
  appendHumanOverrideV33,
  claimProposalV33Schema,
  createEvidenceFragmentV33,
  createSourceReferenceV33,
  deriveClaimProvenanceV33,
  freezeResearchSnapshotV33,
  hashCanonicalV33,
  validateAssessmentsV33,
  validHumanOverrideV33,
  visualPurposeProposalV33Schema,
  type ClaimEvidenceAssessmentV3_3,
  type ClaimProposalV3_3,
  type ClaimV3_3,
  type SourceReferenceV3_3,
} from "./history-research-v33.js";
import {
  buildHistoryVisualPlanV33,
  measureHistoryRepetitionV33,
  validateHistoryDiagramStatesV33,
  validateHistoryMapStatesV33,
} from "./visual-planner-v33.js";
import {
  createCombinedHistoryApprovalBundleV33,
  createHistoryApprovalPackV33,
} from "./history-workflow-v33.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});

const proposal = (
  unitId: string,
  text: string,
  extra: Partial<ClaimProposalV3_3> = {}
): ClaimProposalV3_3 =>
  claimProposalV33Schema.parse({
    narrationUnitId: unitId,
    verbatimText: text,
    normalizedProposition: text,
    claimKind: "event",
    materialityRecommendation: "material",
    entities: [],
    temporalQualifiers: [],
    geographicQualifiers: [],
    quantitativeQualifiers: [],
    uncertaintyMarkers: [],
    requiresMultipleSources: false,
    researchHints: [],
    ...extra,
  });

const narrationAndClaim = (text = "In 1812, an army crossed a river.") => {
  const narration = normalizeHistoryNarrationV33({ episodeId: "episode", rawScript: text });
  const claim = alignClaimProposalsV33({ episodeId: "episode", narration, proposals: [proposal(narration.units[0]!.id, narration.units[0]!.text)] })[0]!;
  return { narration, claim };
};

const source = (url = "https://example.edu/history?utm_source=test") =>
  createSourceReferenceV33({
    canonicalUrl: url,
    sourceType: "scholarly",
    qualityTier: 2,
    title: "Scholarly history",
    authors: ["A. Historian"],
    publisherOrInstitution: "Example University",
    publicationDate: "2024",
    edition: null,
    language: "en",
    doi: null,
    isbn: null,
    archiveIdentifier: null,
    retrievalProvider: "fixture",
    retrievedAt: "1980-01-01T00:00:00.000Z",
    snapshotHash: null,
    normalizedCitation: "A. Historian. Scholarly history.",
  });

const assessment = (
  claim: ClaimV3_3,
  evidenceId: string,
  kind: ClaimEvidenceAssessmentV3_3["assessment"],
  unsupportedAspects: string[] = []
): ClaimEvidenceAssessmentV3_3 => ({
  claimId: claim.id,
  evidenceFragmentId: evidenceId,
  assessment: kind,
  supportedAspects: kind === "supports" || kind === "partially_supports" ? ["event"] : [],
  unsupportedAspects,
  contradictionAspects: kind === "contradicts" ? ["event"] : [],
  temporalAlignment: "aligned",
  geographicAlignment: "aligned",
  entityAlignment: "aligned",
  rationale: "Fixture assessment limited to supplied evidence.",
  confidence: 0.8,
});

describe("History V3.3 canonical narration", () => {
  it("normalizes headings, Markdown, whitespace, Unicode, and explicit UTF-16 offsets in one pass", () => {
    const result = normalizeHistoryNarrationV33({
      episodeId: "unicode",
      rawScript: "# Heading\r\n\r\n **Müller** said “café”—then 😀 left.\r\n\r\n- Köln  moved.\n!!!",
    });
    expect(result.normalizedText).toBe("Müller said “café”—then 😀 left.\n\nKöln moved.");
    expect(result.offsetEncoding).toBe("UTF-16 code units");
    expect(result.units.every((unit) => result.normalizedText.slice(unit.startUtf16, unit.endUtf16Exclusive) === unit.text)).toBe(true);
    assertCanonicalNarrationV33(result);
  });

  it("keeps repeated identical sentences distinct with deterministic IDs", () => {
    const first = normalizeHistoryNarrationV33({ episodeId: "repeat", rawScript: "Same sentence. Same sentence." });
    const second = normalizeHistoryNarrationV33({ episodeId: "repeat", rawScript: "Same sentence. Same sentence." });
    expect(first.units).toHaveLength(2);
    expect(first.units[0]!.id).not.toBe(first.units[1]!.id);
    expect(second.units).toEqual(first.units);
  });

  it("covers every canonical episode without the V3.2 mid-word slices", async () => {
    const ids = [
      "history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia",
      "history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire",
      "history-youtube-history-10-video-story-pack-04-black-death",
    ];
    for (const episodeId of ids) {
      const rawScript = await fs.readFile(path.join("episodes", episodeId, "languages", "script-en.md"), "utf8");
      const result = normalizeHistoryNarrationV33({ episodeId, rawScript });
      assertCanonicalNarrationV33(result);
      expect(result.units.map((unit) => unit.text)).not.toEqual(expect.arrayContaining(["lages were emptied. The", "vinces paid taxes. Tax", "e complex. Social changes"]));
      expect(result.units.at(-1)!.endUtf16Exclusive).toBeLessThanOrEqual(result.normalizedText.length);
    }
  });

  it("handles blank lines, punctuation-only lines, paragraph boundaries, and no trailing newline", () => {
    const result = normalizeHistoryNarrationV33({ episodeId: "boundaries", rawScript: "First paragraph.\n\n...\n\nSecond paragraph" });
    expect(result.normalizedText).toBe("First paragraph.\n\nSecond paragraph");
    expect(result.units.map((unit) => unit.text)).toEqual(["First paragraph.", "Second paragraph"]);
  });
});

describe("History V3.3 claims and timing", () => {
  it("aligns claim spans deterministically and rejects model offsets or IDs", () => {
    const { narration } = narrationAndClaim();
    const claim = alignClaimProposalsV33({ episodeId: "episode", narration, proposals: [proposal(narration.units[0]!.id, "an army crossed a river")] })[0]!;
    expect(narration.normalizedText.slice(claim.span.startUtf16, claim.span.endUtf16Exclusive)).toBe("an army crossed a river");
    expect(claim.id).toBe(alignClaimProposalsV33({ episodeId: "episode", narration, proposals: [proposal(narration.units[0]!.id, "an army crossed a river")] })[0]!.id);
    expect(claimProposalV33Schema.safeParse({ ...proposal(narration.units[0]!.id, narration.units[0]!.text), id: "model-id", start: 0 }).success).toBe(false);
    expect(visualPurposeProposalV33Schema.safeParse({ narrationUnitId: narration.units[0]!.id, protectedFactualMeaning: narration.units[0]!.text, recommendedModality: "map", semanticJustification: "route", disallowedMisleadingTreatments: [], requiredEntities: [], requiredDates: [], requiredPlaces: [], requiredQuantities: [], uncertainty: [], evidenceRequirements: [], rejectedModality: null, rejectionReason: null, sourceReferenceIds: ["model-source"] }).success).toBe(false);
  });

  it("rejects unmatched and ambiguous repeated claim text", () => {
    const narration = normalizeHistoryNarrationV33({ episodeId: "ambiguous", rawScript: "Rome and Rome remained." });
    expect(() => alignClaimProposalsV33({ episodeId: "ambiguous", narration, proposals: [proposal(narration.units[0]!.id, "missing")] })).toThrow("not present");
    expect(() => alignClaimProposalsV33({ episodeId: "ambiguous", narration, proposals: [proposal(narration.units[0]!.id, "Rome")] })).toThrow("ambiguous");
  });

  it("forces dates, quantities, named entities, causal claims, and higher-evidence claims to material", () => {
    const narration = normalizeHistoryNarrationV33({ episodeId: "material", rawScript: "In 1812, Napoleon caused 50 percent losses." });
    const claim = alignClaimProposalsV33({ episodeId: "material", narration, proposals: [proposal(narration.units[0]!.id, narration.units[0]!.text, { claimKind: "causal", materialityRecommendation: "non_material", entities: [{ text: "Napoleon", role: "person" }], temporalQualifiers: ["1812"], quantitativeQualifiers: ["50 percent"], requiresMultipleSources: true })] })[0]!;
    expect(claim.material).toBe(true);
    expect(claim.requiresMultipleSources).toBe(true);
    expect(claim.forcedMaterialityReasons).toEqual(expect.arrayContaining(["claim-kind:causal", "named-entity", "temporal-qualifier", "quantitative-qualifier"]));
  });

  it("uses aggregate words/WPM and bounded, separate pauses independent of unit count", () => {
    const few = normalizeHistoryNarrationV33({ episodeId: "few", rawScript: `${"word ".repeat(900)}.` });
    const many = normalizeHistoryNarrationV33({ episodeId: "many", rawScript: Array.from({ length: 90 }, () => `${"word ".repeat(10)}.`).join(" ") });
    const a = estimateHistoryTimingV33({ narration: few });
    const b = estimateHistoryTimingV33({ narration: many });
    expect(a.baseSpeechDurationMs).toBe(b.baseSpeechDurationMs);
    expect(Math.abs(a.totalDurationMs - b.totalDurationMs)).toBeLessThanOrEqual(15_000);
    expect(b.punctuationPauseDurationMs).toBeLessThanOrEqual(15_000);
    expect(b.paragraphPauseDurationMs).toBeLessThanOrEqual(12_000);
    expect(b.chapterPauseDurationMs).toBeLessThanOrEqual(6_000);
  });

  it("preserves the ten-minute preference while allowing measured 8–20 minute episodes", () => {
    const { narration } = narrationAndClaim();
    const hash = createHash("sha256").update("audio").digest("hex");
    for (const durationMs of [480_000, 600_000, 1_020_000, 1_200_000]) {
      const timing = estimateHistoryTimingV33({ narration, measurement: { source: "measured-tts", durationMs, audioSha256: hash } });
      expect(timing.withinAllowedRange).toBe(true);
      expect(timing.timingSource).toBe("measured-tts");
    }
    expect(HISTORY_LONG_FORM_DURATION_POLICY_V33.preferredDurationMs).toBe(600_000);
    expect(estimateHistoryTimingV33({ narration, measurement: { source: "measured-final-audio", durationMs: 1_200_001, audioSha256: hash } }).withinAllowedRange).toBe(false);
  });
});

describe("History V3.3 source and provenance authority", () => {
  it("bounds retries and caches successful claim extraction by canonical inputs", async () => {
    const { narration } = narrationAndClaim();
    let calls = 0;
    const inner = {
      provider: "fixture-retry",
      extract: async () => {
        calls += 1;
        if (calls === 1) throw Object.assign(new Error("rate limited"), { status: 429 });
        return {
          proposals: [proposal(narration.units[0]!.id, narration.units[0]!.text)],
          metadata: {
            provider: "fixture-retry", model: "fixture", apiFeature: "fixture", promptVersion: "v1", promptHash: "a".repeat(64), schemaVersion: "v1", schemaHash: "b".repeat(64), requestId: "request", requestedAt: "1980-01-01T00:00:00.000Z", inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, retryCount: 0, cacheKey: "c".repeat(64),
          },
        };
      },
    };
    const provider = new ResilientClaimExtractionProviderV33(inner, { maxRetries: 2, random: () => 0, delay: async () => undefined });
    const input = { episodeId: "episode", narrationSha256: narration.normalizedTextSha256, units: narration.units };
    expect((await provider.extract(input)).metadata.retryCount).toBe(1);
    await provider.extract(input);
    expect(calls).toBe(2);
  });

  it("canonicalizes source identity and deterministic IDs without tracking parameters", () => {
    const first = source("HTTPS://Example.EDU/history/?utm_source=x&b=2&a=1#fragment");
    const second = source("https://example.edu/history?a=1&b=2");
    expect(first.canonicalUrl).toBe("https://example.edu/history?a=1&b=2");
    expect(first.id).toBe(second.id);
  });

  it("hashes evidence fragments from source, locator, and concise excerpt", () => {
    const item = createEvidenceFragmentV33({ sourceReferenceId: source().id, locator: { kind: "page", value: "12" }, excerpt: "  Evidence   excerpt. ", independentlyReproducible: true, retrievedAt: "1980-01-01T00:00:00.000Z" });
    expect(item.excerpt).toBe("Evidence excerpt.");
    expect(item.excerptHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(createEvidenceFragmentV33({ ...item, id: undefined, excerptHash: undefined } as never).id).toBe(item.id);
  });

  it("rejects free-form model URLs by accepting only web-search annotations", async () => {
    const provider = new OpenAiWebSearchRetrievalProviderV33({ responses: { create: async () => ({ id: "response", output_text: "Use https://invented.example/source", output: [] }) } }, "gpt-test", () => "1980-01-01T00:00:00.000Z");
    expect((await provider.retrieve({ episodeId: "episode", queries: ["query"] })).sources).toEqual([]);
  });

  it("rejects assessment references outside the exact supplied claims and evidence", () => {
    const { claim } = narrationAndClaim();
    const citedSource = source();
    const evidence = createEvidenceFragmentV33({ sourceReferenceId: citedSource.id, locator: { kind: "section", value: "Overview" }, excerpt: "The army crossed the river.", independentlyReproducible: true, retrievedAt: "1980-01-01T00:00:00.000Z" });
    expect(() => validateAssessmentsV33({ claims: [claim], sources: [citedSource], evidence: [evidence], assessments: [{ ...assessment(claim, evidence.id, "supports"), evidenceFragmentId: "invented" }] })).toThrow("not supplied");
  });

  it("derives supported, partial, contradicted, contested, and unresolved statuses without confidence authority", () => {
    const { claim } = narrationAndClaim();
    const citedSource = source();
    const evidence = createEvidenceFragmentV33({ sourceReferenceId: citedSource.id, locator: { kind: "section", value: "Overview" }, excerpt: "The army crossed the river.", independentlyReproducible: true, retrievedAt: "1980-01-01T00:00:00.000Z" });
    const derive = (items: ClaimEvidenceAssessmentV3_3[]) => deriveClaimProvenanceV33({ claims: [claim], sources: [citedSource], evidence: [evidence], assessments: items })[0]!;
    expect(derive([assessment(claim, evidence.id, "supports")]).status).toBe("supported");
    expect(derive([assessment(claim, evidence.id, "partially_supports", ["actor"])]).status).toBe("partially_supported");
    expect(derive([assessment(claim, evidence.id, "contradicts")]).status).toBe("contradicted");
    expect(derive([assessment(claim, evidence.id, "supports"), assessment(claim, evidence.id, "contradicts")]).status).toBe("contested");
    expect(derive([]).status).toBe("unresolved");
    expect(derive([{ ...assessment(claim, evidence.id, "ambiguous"), confidence: 1 }]).status).toBe("unresolved");
  });

  it("requires two independent sources for higher-evidence claims unless one is exceptionally strong", () => {
    const { claim: base } = narrationAndClaim();
    const claim = { ...base, requiresMultipleSources: true };
    const citedSource = source("https://reference.example/history");
    const evidence = createEvidenceFragmentV33({ sourceReferenceId: citedSource.id, locator: { kind: "page", value: "1" }, excerpt: "Evidence.", independentlyReproducible: true, retrievedAt: "1980-01-01T00:00:00.000Z" });
    const status = deriveClaimProvenanceV33({ claims: [claim], sources: [{ ...citedSource, qualityTier: 4 }], evidence: [evidence], assessments: [assessment(claim, evidence.id, "supports")] })[0]!.status;
    expect(status).toBe("partially_supported");
  });

  it("chains append-only overrides and invalidates them when any bound hash changes", () => {
    const h = (value: string) => createHash("sha256").update(value).digest("hex");
    const boundHashes = { narrationSha256: h("n"), claimSha256: h("c"), sourcesSha256: h("s"), evidenceSha256: h("e"), planSha256: h("p"), policySha256: h("policy") };
    const ledger = appendHumanOverrideV33({ existing: [], reviewerId: "reviewer", recordedAt: "2026-08-06T00:00:00.000Z", reason: "Documented review", claimId: "claim", decision: "accept", boundHashes });
    expect(validHumanOverrideV33({ record: ledger[0]!, currentHashes: boundHashes })).toBe(true);
    expect(validHumanOverrideV33({ record: ledger[0]!, currentHashes: { ...boundHashes, planSha256: h("changed") } })).toBe(false);
  });
});

describe("History V3.3 visual semantics and packaging", () => {
  it("rejects maritime/overland and pathogen/actor contradictions", () => {
    const diagnostics = validateHistoryMapStatesV33({ mapStates: [{ id: "map-state", masterId: "map", purpose: "route", baseGeography: "Europe", timePeriod: "1347", affectedArea: "Europe", territorialState: "not applicable", labels: [], uncertainty: "none", semanticStatus: "blocked", routes: [{ id: "route", routeType: "maritime", origin: { label: "Black Sea", coordinates: [40, 40] }, destination: { label: "Messina", coordinates: [15, 38] }, movingActor: "Yersinia pestis", carrierOrVehicle: "ship", transportedObjectOrPathogen: "Yersinia pestis", dateOrPeriod: "1347", label: "Overland trade connection", uncertainty: "route generalized", linkedClaimIds: [], linkedEvidenceIds: [] }] }], claimIds: new Set(), evidenceIds: new Set() });
    expect(diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining(["MAP_ROUTE_LABEL_CONTRADICTION", "MAP_PATHOGEN_ROLE_CONFLICT", "MAP_EVIDENCE_MISSING"]));
  });

  it("rejects unsupported diagram nodes and edges", () => {
    const diagnostics = validateHistoryDiagramStatesV33({ diagramStates: [{ id: "diagram-state", masterId: "diagram", diagramType: "causal", exactQuestion: "Why?", timeApplicability: "1812", geographyApplicability: "Russia", uncertainty: "none", rejectedAlternatives: [], fallbackDecision: "none", semanticStatus: "blocked", nodes: [{ id: "node-a", label: "Revenue", linkedClaimIds: [], linkedEvidenceIds: [] }], edges: [{ id: "edge", fromNodeId: "node-a", toNodeId: "missing", relationship: "causes", linkedClaimIds: [], linkedEvidenceIds: [] }] }], claimIds: new Set(), evidenceIds: new Set() });
    expect(diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining(["DIAGRAM_NODE_EVIDENCE_MISSING", "DIAGRAM_EDGE_REFERENCE_INVALID", "DIAGRAM_EDGE_EVIDENCE_MISSING"]));
  });

  it("exports complete beats, shots, evidence-safe modality fallbacks, and independent ratio plans", () => {
    const { narration, claim } = narrationAndClaim("In 1812, an army crossed a river. However, the result remained disputed.");
    const provenance = deriveClaimProvenanceV33({ claims: [claim], sources: [], evidence: [], assessments: [] });
    const snapshot = freezeResearchSnapshotV33({ episodeId: "episode", snapshotVersion: 1, frozenAt: "1980-01-01T00:00:00.000Z", canonicalNarration: narration, claims: [claim], sourceReferences: [], evidenceFragments: [], evidenceAssessments: [], provenance, providerRuns: [], researchDiagnostics: [], overrides: [] });
    const plan = buildHistoryVisualPlanV33({ title: "Episode", researchSnapshot: snapshot });
    expect(plan.schemaVersion).toBe("history-visual-plan.v3.3");
    expect(plan.beats).toHaveLength(narration.units.length);
    expect(plan.shots).toHaveLength(plan.beats.length);
    expect(plan.aspectRatioPlans.filter((item) => item.ratio === "9:16").every((item) => item.independentPortraitRenderingMandatory)).toBe(true);
    expect(plan.visualPurposes.every((item) => item.recommendedModality !== "map" && item.fallbackDecision)).toBe(true);
    expect(plan.approval.content.state).toBe("blocked");
    expect(plan.approval.production.state).toBe("blocked");
  });

  it("detects exact purpose and camera repetition with actionable thresholds", () => {
    const purpose = { id: "purpose", beatId: "beat", narrationSpan: { startUtf16: 0, endUtf16Exclusive: 4 }, linkedClaimIds: [], protectedFactualMeaning: "same", recommendedModality: "no generated visual" as const, semanticJustification: "same", disallowedMisleadingTreatments: [], requiredEntities: [], requiredDates: [], requiredPlaces: [], requiredQuantities: [], uncertainty: [], evidenceRequirements: [], fallbackDecision: null };
    const shot = { id: "shot", beatId: "beat", durationMs: 1, startMs: 0, endMs: 1, framing: "same", cameraMovement: "pan", subject: "same", focalEvidence: "none", foreground: "none", midground: "none", background: "none", permittedMotion: [], prohibitedMisleadingMotion: [], transition: "cut", assetReuseReference: null, linkedClaimIds: [], linkedEvidenceIds: [], ratioSpecificAdaptations: [], reconstructionPolicy: "not-applicable" as const };
    expect(measureHistoryRepetitionV33({ purposes: [purpose, { ...purpose, id: "purpose-2", beatId: "beat-2" }], shots: [shot, { ...shot, id: "shot-2", beatId: "beat-2", startMs: 1, endMs: 2 }] }).passes).toBe(false);
  });

  it("writes every required artifact, validates checksums, and produces byte-identical ZIPs", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "history-v33-pack-"));
    roots.push(root);
    const episodeId = "history-v33-fixture";
    const episode = path.join(root, "episodes", episodeId);
    await fs.mkdir(path.join(episode, "languages"), { recursive: true });
    await fs.mkdir(path.join(episode, "source"), { recursive: true });
    await fs.writeFile(path.join(episode, "languages", "script-en.md"), `${"A documented historical event occurred. ".repeat(900)}`);
    await fs.writeFile(path.join(episode, "source", "normalized-metadata.json"), JSON.stringify({ originalFrontmatter: { title: "Fixture" } }));
    await fs.writeFile(path.join(episode, "source", "research-sources.json"), JSON.stringify({ sources: [{ title: "University source", url: "https://example.edu/history" }] }));
    const output = path.join(root, "approval", episodeId);
    const first = await createHistoryApprovalPackV33({ episodeId, output, outputRoot: path.join(root, "episodes"), regenerate: true });
    const firstBytes = await fs.readFile(first.zipPath);
    const second = await createHistoryApprovalPackV33({ episodeId, output, outputRoot: path.join(root, "episodes") });
    expect(await fs.readFile(second.zipPath)).toEqual(firstBytes);
    const files = await fs.readdir(output);
    expect(files).toEqual(expect.arrayContaining(["approval.md", "research-snapshot.json", "claims.json", "beats.json", "shots.json", "map-masters.json", "diagram-states.json", "aspect-ratio-plans.json", "determinism-report.json", "manifest.json", "checksums.sha256"]));
    const lines = (await fs.readFile(path.join(output, "checksums.sha256"), "utf8")).trim().split("\n");
    for (const line of lines) {
      const [expected, file] = line.split(/\s{2}/u);
      expect(createHash("sha256").update(await fs.readFile(path.join(output, file!))).digest("hex")).toBe(expected);
    }
  }, 30_000);

  it("keeps identified per-episode states in the combined comparison and nested ZIPs equal expanded packs", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "history-v33-combined-"));
    roots.push(root);
    const ids = ["history-a", "history-b", "history-c"];
    for (const id of ids) {
      const episode = path.join(root, "episodes", id);
      await fs.mkdir(path.join(episode, "languages"), { recursive: true });
      await fs.mkdir(path.join(episode, "source"), { recursive: true });
      await fs.writeFile(path.join(episode, "languages", "script-en.md"), `${"A specific historical event occurred. ".repeat(900)}`);
      await fs.writeFile(path.join(episode, "source", "normalized-metadata.json"), JSON.stringify({ originalFrontmatter: { title: id } }));
      await fs.writeFile(path.join(episode, "source", "research-sources.json"), JSON.stringify({ sources: [] }));
    }
    const output = path.join(root, "combined");
    const bundle = await createCombinedHistoryApprovalBundleV33({ episodeIds: ids, output, outputRoot: path.join(root, "episodes"), regenerate: true });
    const comparison = JSON.parse(await fs.readFile(path.join(output, "comparison-manifest.json"), "utf8")) as { aggregateApproval: unknown; episodes: Array<{ episodeId: string }> };
    expect(comparison.aggregateApproval).toBeNull();
    expect(comparison.episodes.map((item) => item.episodeId).sort()).toEqual(ids);
    for (const episode of bundle.episodes) expect(await fs.readFile(`${path.join(output, episode.episodeId)}.zip`)).toEqual(await fs.readFile(episode.zipPath));
  }, 60_000);
});
