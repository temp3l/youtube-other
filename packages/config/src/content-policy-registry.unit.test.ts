import { describe, expect, it } from "vitest";
import { CreatorProfileRegistry, GenreRegistry, resolveEffectiveContentPolicy } from "./content-policy-registry.js";

const genre = { schemaVersion: "1.1", id: "strategic-reinvention", displayName: "Strategic", description: "Source-led strategic work.", version: "0.1.0", canonicalLocale: "it", episodeModes: ["tactical-lesson"], requiredApprovalGates: ["source", "publish"], autoPublish: false } as const;
const creator = { schemaVersion: "1.1", id: "veronica-benini", displayName: "Veronica", genreId: "strategic-reinvention", status: "discovery", canonicalLocale: "it", supportedLocales: ["it", "en"], autoPublish: false, syntheticNarrationEnabled: false, generatedLikenessEnabled: false } as const;
const permissions = { supportedLocales: ["it", "en"], permittedContentTiers: ["public", "lead-generation"], requiredApprovalGates: ["source", "publish"], autoPublish: false, syntheticNarrationEnabled: false, generatedLikenessEnabled: false } as const;

describe("content policy registries", () => {
  it("rejects duplicate and malformed registry entries", () => {
    expect(() => new GenreRegistry([genre, genre])).toThrow("Duplicate genre");
    expect(() => new CreatorProfileRegistry([{ ...creator, schemaVersion: "1.0" }])).toThrow();
  });

  it("keeps genre and creator separate and intersects every permission layer", () => {
    const genres = new GenreRegistry([genre]);
    const creators = new CreatorProfileRegistry([creator]);
    expect(creators.list(genres.get("strategic-reinvention").id)).toHaveLength(1);
    const policy = resolveEffectiveContentPolicy({
      genre: genres.get("strategic-reinvention"), creatorProfile: creators.get("veronica-benini"),
      system: permissions, genrePermissions: permissions, creatorPermissions: permissions,
      episodeOverride: { supportedLocales: ["it"], permittedContentTiers: ["public"] },
    });
    expect(policy.supportedLocales).toEqual(["it"]);
    expect(policy.permittedContentTiers).toEqual(["public"]);
    expect(policy.requiredApprovalGates).toEqual(["source", "publish"]);
    const withAdditionalGate = resolveEffectiveContentPolicy({
      genre, creatorProfile: creator, system: permissions, genrePermissions: permissions, creatorPermissions: permissions,
      episodeOverride: { requiredApprovalGates: ["localization"] },
    });
    expect(withAdditionalGate.requiredApprovalGates).toEqual(["source", "publish", "localization"]);
    expect(() => resolveEffectiveContentPolicy({ ...{ genre, creatorProfile: { ...creator, genreId: "other-genre" }, system: permissions, genrePermissions: permissions, creatorPermissions: permissions } })).toThrow("does not belong");
  });
});
