import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { parseStrategicReinventionProfile } from "./profile.js";

async function source(name: string): Promise<string> {
  return fs.readFile(fileURLToPath(new URL(`../config/${name}`, import.meta.url)), "utf8");
}

describe("Strategic Reinvention profile", () => {
  it("parses the supplied genre and creator configurations as separate policies", async () => {
    const [genre, creator] = await Promise.all([source("genre.strategic-reinvention.yaml"), source("creator.veronica-benini.yaml")]);
    const discoveryRoot = new URL("../../../docs/discovery-packs/veronica-benini-youtube-genre-discovery-pack/03-product-spec/", import.meta.url);
    const [suppliedGenre, suppliedCreator] = await Promise.all([
      fs.readFile(fileURLToPath(new URL("genre.strategic-reinvention.yaml", discoveryRoot)), "utf8"),
      fs.readFile(fileURLToPath(new URL("creator.veronica-benini.yaml", discoveryRoot)), "utf8"),
    ]);
    expect(load(genre)).toEqual(load(suppliedGenre));
    expect(load(creator)).toEqual(load(suppliedCreator));
    const profile = parseStrategicReinventionProfile(genre, creator);
    expect(profile.genre.id).toBe("strategic-reinvention");
    expect(profile.creatorProfile.id).toBe("veronica-benini");
    expect(profile.effectivePolicy.canonicalLocale).toBe("it");
    expect(profile.productionReadiness.status).toBe("PRODUCTION_BLOCKED");
    expect(profile.effectivePolicy.autoPublish).toBe(false);
  });

  it("rejects unknown versions and a creator mapped to another genre", async () => {
    const genre = await source("genre.strategic-reinvention.yaml");
    const creator = await source("creator.veronica-benini.yaml");
    expect(() => parseStrategicReinventionProfile(genre.replace('schemaVersion: "1.0"', 'schemaVersion: "9.0"'), creator)).toThrow();
    expect(() => parseStrategicReinventionProfile(genre, creator.replace("genreId: strategic-reinvention", "genreId: unrelated"))).toThrow();
    expect(() => parseStrategicReinventionProfile(genre.replace("min: 600, max: 960", "min: 960, max: 600"), creator)).toThrow();
    expect(() => parseStrategicReinventionProfile(genre, creator.replace("manualReviewRequired: true", "manualReviewRequired: true\n    unexpected: false"))).toThrow();
  });
});
