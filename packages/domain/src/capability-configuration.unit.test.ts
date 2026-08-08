import { describe, expect, it } from "vitest";

import { evaluateProductionCapabilityAdmission } from "./capability-admission-evaluator.js";
import {
  CAPABILITY_CONFIGURATION_SCHEMA_VERSION,
  type TenantSettings,
} from "./capability-configuration-contracts.js";
import {
  buildCapabilityRegistry,
  computeCapabilityVersion,
  resolveProductionConfiguration,
} from "./capability-configuration-resolver.js";
import { resolvedConfigFingerprintSchema } from "./production-state-contracts.js";
import { PLATFORM_CAPABILITY_REGISTRY_REVISION } from "./platform-capability-defaults.js";

const resolvedAt = "2026-08-08T12:00:00.000Z";

function tenant(overrides: Partial<TenantSettings> = {}): TenantSettings {
  return {
    schemaVersion: CAPABILITY_CONFIGURATION_SCHEMA_VERSION,
    revision: 1,
    entitledProfiles: ["history", "mathematics-education"],
    updatedAt: resolvedAt,
    ...overrides,
  };
}

describe("capability configuration registry", () => {
  it("applies platform → tenant → genre precedence for supported locales", () => {
    const settings = tenant({
      profileLocaleOverrides: {
        history: ["en", "de"],
      },
    });
    const genreResolved = resolveProductionConfiguration({
      profileId: "history",
      tenant: settings,
      genre: {
        schemaVersion: CAPABILITY_CONFIGURATION_SCHEMA_VERSION,
        profileId: "history",
        revision: 3,
        supportedLocales: ["de"],
        updatedAt: resolvedAt,
      },
      resolvedAt,
    });
    expect(genreResolved.supportedLocales).toEqual(["de"]);
    expect(genreResolved.provenance.find((item) => item.field === "supportedLocales")).toEqual(
      expect.objectContaining({ layer: "genre", layerRevision: 3 })
    );

    const episodeResolved = resolveProductionConfiguration({
      profileId: "history",
      tenant: settings,
      episode: {
        schemaVersion: CAPABILITY_CONFIGURATION_SCHEMA_VERSION,
        episodeId: "episode-1",
        revision: 4,
        defaultLocale: "de",
        updatedAt: resolvedAt,
      },
      resolvedAt,
    });
    expect(episodeResolved.defaultLocale).toBe("de");
    expect(
      episodeResolved.provenance.find((item) => item.field === "defaultLocale")
    ).toEqual(
      expect.objectContaining({
        layer: "episode",
        layerRevision: 4,
        layerId: "episode-1",
      })
    );
  });

  it("returns typed rejection for unsupported profile-locale-variant combinations", () => {
    const settings = tenant({
      entitledProfiles: ["mathematics-education"],
      profileLocaleOverrides: {
        "mathematics-education": ["en"],
      },
    });
    const result = evaluateProductionCapabilityAdmission({
      context: {
        profileId: "mathematics-education",
        tenant: settings,
        resolvedAt,
      },
      request: {
        schemaVersion: CAPABILITY_CONFIGURATION_SCHEMA_VERSION,
        profileId: "mathematics-education",
        episodeRevision: 2,
        selections: [{ locale: "de", variant: "full" }],
        approvalMode: "required",
        publicationMode: "none",
      },
      evaluatedAt: resolvedAt,
    });
    expect(result.admitted).toBe(false);
    expect(result.rejections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "locale_not_supported",
          field: "supportedLocales",
          requestedValue: "de",
        }),
      ])
    );
  });

  it("keeps pinned revision configuration stable when later defaults change", () => {
    const settings = tenant({
      entitledProfiles: ["history"],
      profileLocaleOverrides: { history: ["en"] },
    });
    const pinned = resolveProductionConfiguration({
      profileId: "history",
      tenant: settings,
      resolvedAt,
    });
    const changedTenant = tenant({
      entitledProfiles: ["history"],
      revision: 9,
      profileLocaleOverrides: { history: ["en", "de", "fr"] },
    });
    const withPin = resolveProductionConfiguration({
      profileId: "history",
      tenant: changedTenant,
      pinnedConfiguration: pinned,
      resolvedAt,
    });
    expect(withPin.fingerprint).toBe(pinned.fingerprint);
    expect(withPin.supportedLocales).toEqual(["en"]);
  });

  it("changes capability version when tenant entitlements change", () => {
    const base = tenant({ revision: 1, entitledProfiles: ["history"] });
    const expanded = tenant({
      revision: 2,
      entitledProfiles: ["history", "dark-truth"],
    });
    const before = computeCapabilityVersion({
      platformRevision: PLATFORM_CAPABILITY_REGISTRY_REVISION,
      tenant: base,
      profileId: "history",
    });
    const after = computeCapabilityVersion({
      platformRevision: PLATFORM_CAPABILITY_REGISTRY_REVISION,
      tenant: expanded,
      profileId: "history",
    });
    expect(before).not.toBe(after);
    const registry = buildCapabilityRegistry(expanded, resolvedAt);
    expect(registry.cells.map((cell) => cell.profileId)).toEqual([
      "history",
      "dark-truth",
    ]);
  });

  it("names missing profile entitlement during admission preflight", () => {
    const settings = tenant({ entitledProfiles: ["history"] });
    const result = evaluateProductionCapabilityAdmission({
      context: {
        profileId: "dark-truth",
        tenant: settings,
        resolvedAt,
      },
      request: {
        schemaVersion: CAPABILITY_CONFIGURATION_SCHEMA_VERSION,
        profileId: "dark-truth",
        episodeRevision: 1,
        selections: [{ locale: "en", variant: "full" }],
        approvalMode: "required",
        publicationMode: "none",
      },
      evaluatedAt: resolvedAt,
    });
    expect(result.admitted).toBe(false);
    expect(result.rejections[0]).toEqual(
      expect.objectContaining({
        code: "profile_not_entitled",
        entitlement: "dark-truth",
      })
    );
  });

  it("rejects stale capability version races at admission", () => {
    const settings = tenant({ entitledProfiles: ["history"] });
    const staleVersion = resolvedConfigFingerprintSchema.parse("b".repeat(64));
    const result = evaluateProductionCapabilityAdmission({
      context: {
        profileId: "history",
        tenant: settings,
        resolvedAt,
      },
      request: {
        schemaVersion: CAPABILITY_CONFIGURATION_SCHEMA_VERSION,
        profileId: "history",
        episodeRevision: 1,
        selections: [{ locale: "en", variant: "full" }],
        approvalMode: "required",
        publicationMode: "none",
        capabilityVersion: staleVersion,
      },
      evaluatedAt: resolvedAt,
    });
    expect(result.admitted).toBe(false);
    expect(result.rejections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "capability_version_stale" }),
      ])
    );
  });
});
