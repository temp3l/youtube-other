import { describe, expect, it } from "vitest";

import {
  contentSourceManifestSchema,
  episodeBlueprintSchema,
  normalizeContentSourceManifestV1,
  normalizeEpisodeBlueprintV1,
} from "./content-policy-contracts.js";

const hash = "a".repeat(64);
const now = "2026-08-01T12:00:00.000Z";

describe("strategic content policy contracts", () => {
  it("normalizes v1 blueprints into strict v1.1 targets", () => {
    const normalized = normalizeEpisodeBlueprintV1({
      episodeId: "episode-001",
      genreId: "strategic-reinvention",
      creatorProfileId: "veronica-benini",
      canonicalLocale: "it-IT",
      mode: "story-to-strategy",
      sources: ["source-001"],
      contentTier: "lead-magnet",
      thesis: "A sufficiently long thesis.",
      beats: Array.from({ length: 6 }, (_, index) => ({
        beatId: `beat-00${index + 1}`,
        type: "hook",
        purpose: "Set the context.",
        sourceIds: ["source-001"],
      })),
      cta: {
        kind: "newsletter",
        destination: "https://example.test/newsletter",
        campaignId: "pilot-001",
        localizedDestinations: {
          "it-IT": "https://example.test/it",
          "en-US": "https://example.test/en",
        },
      },
      targetLocales: ["it-IT", "en-US"],
      approvals: {
        source: "pending",
        canonicalScript: "pending",
        localization: "pending",
        voice: "pending",
        render: "pending",
        publish: "pending",
      },
    });

    expect(normalized.schemaVersion).toBe("1.1");
    expect(normalized.contentTier).toBe("lead-generation");
    expect(normalized.cta.localizedDestinations?.it).toBe(
      "https://example.test/it"
    );
    expect(normalized.canonicalLocale).toBe("it");
    expect(normalized.targetLocales).toEqual(["it", "en"]);
    expect(() =>
      episodeBlueprintSchema.parse({ ...normalized, extra: true })
    ).toThrow();
  });

  it("preserves the complete supplied source v1 shape while normalizing tiers", () => {
    const normalized = normalizeContentSourceManifestV1({
      sourceId: "source-001",
      title: "Source",
      owner: "Owner",
      sourceType: "creator-written-note",
      provenance: {
        kind: "file",
        location: "sources/content/source-001/note.md",
        capturedAt: now,
        capturedBy: "operator-001",
        originalLanguage: "it-IT",
      },
      accessLevel: "lead-magnet",
      rights: {
        status: "creator-owned",
        rightsHolders: ["Owner"],
        licenseReference: "rights-001",
        allowedUses: ["adapt", "translate"],
        permittedLocales: ["it-IT", "en-US"],
        commercialUse: true,
        expiresAt: now,
        attribution: "Owner",
        notes: "Recorded authorization.",
      },
      aiTransformations: {
        structure: true,
        summarize: true,
        adapt: true,
        translate: true,
        syntheticVoice: false,
        syntheticLikeness: false,
      },
      sensitivity: {
        classification: "normal",
        tags: ["none"],
        manualReviewRequired: false,
      },
      sourceHash: hash,
      createdAt: now,
      approvedAt: now,
      approvedBy: "reviewer-001",
      notes: "Import without rewriting the source file.",
    });

    expect(normalized.accessLevel).toBe("lead-generation");
    expect(normalized.provenance.originalLanguage).toBe("it");
    expect(normalized.rights.permittedLocales).toEqual(["it", "en"]);
    expect(normalized.aiTransformations.syntheticLikeness).toBe(false);
    expect(normalized.rights.licenseReference).toBe("rights-001");
  });

  it("fails closed when regional locale normalization is ambiguous or unsupported", () => {
    const blueprint = {
      episodeId: "episode-001",
      genreId: "strategic-reinvention",
      creatorProfileId: "veronica-benini",
      canonicalLocale: "it-IT",
      mode: "story-to-strategy",
      sources: ["source-001"],
      contentTier: "public",
      thesis: "A sufficiently long thesis.",
      beats: Array.from({ length: 6 }, (_, index) => ({ beatId: `beat-00${index + 1}`, type: "hook", purpose: "Set the context.", sourceIds: ["source-001"] })),
      cta: { kind: "none", destination: "", campaignId: "" },
      approvals: { source: "pending", canonicalScript: "pending", localization: "pending", voice: "pending", render: "pending", publish: "pending" },
    };
    expect(() => normalizeEpisodeBlueprintV1({ ...blueprint, targetLocales: ["it-IT", "it"] })).toThrow("ambiguous locale list");
    expect(() => normalizeEpisodeBlueprintV1({ ...blueprint, canonicalLocale: "nl-NL" })).toThrow();
  });

  it("rejects unclear rights that claim publishing authority", () => {
    expect(() =>
      contentSourceManifestSchema.parse({
        schemaVersion: "1.1",
        sourceId: "source-001",
        title: "Source",
        owner: "Owner",
        sourceType: "creator-written-note",
        provenance: { kind: "manual-entry", location: "Operator entry" },
        accessLevel: "private",
        originalLocale: "it",
        rights: {
          status: "unknown",
          allowedUses: ["publish"],
          permittedLocales: ["it"],
          commercialUse: false,
        },
        aiTransformations: {
          structure: false,
          summarize: false,
          adapt: false,
          translate: false,
          syntheticVoice: false,
          syntheticLikeness: false,
        },
        sensitivity: {
          classification: "normal",
          tags: ["none"],
          manualReviewRequired: true,
        },
        sourceHash: hash,
        createdAt: now,
      })
    ).toThrow();
  });
});
