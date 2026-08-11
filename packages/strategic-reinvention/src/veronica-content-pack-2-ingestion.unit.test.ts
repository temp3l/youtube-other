import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  canonicalSourceEpisodePlannerInput,
  discoverVeronicaContentPack2Shorts,
  prepareCanonicalSourceEpisodeWorkspace,
} from "./veronica-content-pack-2-ingestion.js";
import { generatePositioningVisualPlanCalibration } from "./positioning-visual-planner.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

async function writePack2Fixture(input: {
  readonly enNarration?: string;
  readonly includeDe?: boolean;
} = {}): Promise<string> {
  const packDir = await temporaryDirectory("veronica-pack2-");
  await fs.mkdir(path.join(packDir, "shorts", "en"), { recursive: true });
  await fs.mkdir(path.join(packDir, "shorts", "de"), { recursive: true });
  await fs.writeFile(
    path.join(packDir, "content-pack.json"),
    `${JSON.stringify({ packId: "veronica-content-pack-2", languages: ["en", "de"] })}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(packDir, "shorts", "en", "01a-revenue-is-not-a-good-business.md"),
    input.enNarration ?? "Revenue is not margin.",
    "utf8",
  );
  await fs.writeFile(
    path.join(packDir, "shorts", "en", "01b-next-order.md"),
    "The next order changes the workload.",
    "utf8",
  );
  if (input.includeDe ?? true) {
    await fs.writeFile(
      path.join(packDir, "shorts", "de", "01a-revenue-is-not-a-good-business.md"),
      "Umsatz ist nicht Marge.",
      "utf8",
    );
  }
  return packDir;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("Veronica Content Pack 2 ingestion", () => {
  it("discovers grouped locale sources with stable opaque episode IDs and no authored visual dependencies", async () => {
    const packDir = await writePack2Fixture();
    const first = await discoverVeronicaContentPack2Shorts({ packDir });
    const second = await discoverVeronicaContentPack2Shorts({ packDir });
    const canary = first.find((episode) => episode.episodeId === "01a-revenue-is-not-a-good-business");
    const other = first.find((episode) => episode.episodeId === "01b-next-order");

    expect(canary?.canonicalSlug).toBe("01a-revenue-is-not-a-good-business");
    expect(canary?.localeSources.map((source) => source.locale)).toEqual(["de", "en"]);
    expect(canary?.declaredReusableAssets).toEqual([]);
    expect(other?.episodeId).not.toBe(canary?.episodeId);
    expect(second.find((episode) => episode.episodeId === canary?.episodeId)?.sourceRevisionHash).toBe(
      canary?.sourceRevisionHash,
    );
  });

  it("changes source revision without changing episode identity", async () => {
    const packDir = await writePack2Fixture({ enNarration: "Revenue is not margin." });
    const before = (await discoverVeronicaContentPack2Shorts({ packDir })).find(
      (episode) => episode.episodeId === "01a-revenue-is-not-a-good-business",
    );
    await fs.writeFile(
      path.join(packDir, "shorts", "en", "01a-revenue-is-not-a-good-business.md"),
      "Revenue is not margin when costs rise with every sale.",
      "utf8",
    );
    const after = (await discoverVeronicaContentPack2Shorts({ packDir })).find(
      (episode) => episode.episodeId === "01a-revenue-is-not-a-good-business",
    );

    expect(after?.episodeId).toBe(before?.episodeId);
    expect(after?.localeSources.find((source) => source.locale === "en")?.sourceSha256).not.toBe(
      before?.localeSources.find((source) => source.locale === "en")?.sourceSha256,
    );
    expect(after?.sourceRevisionHash).not.toBe(before?.sourceRevisionHash);
  });

  it("prepares the supplied canary into canonical script and planner-input artifacts without a visual plan", async () => {
    const workspaceRoot = await temporaryDirectory("veronica-pack2-workspace-");
    const packDir = path.resolve("content-packs/vero/veronica-content-pack-2");
    const sourceEpisode = (await discoverVeronicaContentPack2Shorts({ packDir })).find(
      (episode) => episode.episodeId === "01a-revenue-is-not-a-good-business",
    );
    if (!sourceEpisode) throw new Error("Pack 2 canary source was not discovered.");
    const result = await prepareCanonicalSourceEpisodeWorkspace({
      workspaceRoot,
      sourceEpisode,
      locale: "en",
    });
    const plannerInput = canonicalSourceEpisodePlannerInput({
      sourceEpisode,
      locale: "en",
    });
    const manifest = JSON.parse(await fs.readFile(path.join(result.episodeDir, "manifest.json"), "utf8")) as {
      readonly sourceMetadata: { readonly authoritativeSource: { readonly sha256: string } };
    };

    await expect(fs.readFile(result.scriptPath, "utf8")).resolves.toBe(
      plannerInput.narration.narration,
    );
    await expect(fs.access(result.plannerInputPath)).resolves.toBeUndefined();
    await expect(fs.access(path.join(result.episodeDir, "source", "visual-plan.json"))).rejects.toThrow();
    expect(plannerInput.visualPlanOverride).toBeNull();
    expect(manifest.sourceMetadata.authoritativeSource.sha256).toBe(
      "4e82a65208256d74b2171c4475ee624d9506cfd6f0b21b1f055074d4062c7503",
    );
  });

  it("keeps the legacy positioning-pack calibration path available", async () => {
    const outputDir = await temporaryDirectory("veronica-legacy-calibration-");
    const result = await generatePositioningVisualPlanCalibration({
      packDir: path.resolve("content-packs/veronica-content-pack-1"),
      outputDir,
      contentIds: ["L01", "L01-S01"],
    });

    expect(result).toMatchObject({ contentIds: ["L01", "L01-S01"], providerCalls: 0 });
  });
});
