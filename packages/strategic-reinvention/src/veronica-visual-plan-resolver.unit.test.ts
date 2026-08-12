import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  discoverVeronicaContentPack2Shorts,
  prepareCanonicalSourceEpisodeWorkspace,
} from "./veronica-content-pack-2-ingestion.js";
import { compilePositioningProductionScenePlan } from "./positioning-production-adapter.js";
import {
  DeterministicVeronicaCanonicalVisualPlanner,
  VeronicaVisualPlanResolutionError,
  positioningProductionPlanSchema,
  resolveVeronicaVisualPlan,
  type VeronicaCanonicalVisualPlanner,
} from "./veronica-visual-plan-resolver.js";
import {
  assertValidSemanticPlanHash,
  computeSemanticPlanHash,
  finalizeSemanticPlanHash,
  hasValidSemanticPlanHash,
  SemanticPlanHashIntegrityError,
} from "./positioning-visual-semantics.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

async function writePack(narration = "Revenue is not margin. Strong unit economics survive growth."): Promise<string> {
  const packDir = await temporaryDirectory("veronica-plan-pack-");
  await fs.mkdir(path.join(packDir, "shorts", "en"), { recursive: true });
  await fs.mkdir(path.join(packDir, "shorts", "de"), { recursive: true });
  await fs.writeFile(
    path.join(packDir, "content-pack.json"),
    `${JSON.stringify({ packId: "veronica-content-pack-2", languages: ["en", "de"] })}\n`,
  );
  await fs.writeFile(
    path.join(packDir, "shorts", "en", "01a-revenue-is-not-a-good-business.md"),
    narration,
  );
  await fs.writeFile(
    path.join(packDir, "shorts", "de", "01a-revenue-is-not-a-good-business.md"),
    "Umsatz ist nicht Marge.",
  );
  return packDir;
}

function fakePlan(contentId: string) {
  return positioningProductionPlanSchema.parse({
    schemaVersion: "veronicabenini-positioning-visual-plan.v2",
    plannerVersion: "veronicabenini-positioning-visual-planner.v2.2",
    contentId,
    format: "short",
    aspectRatio: "9:16",
    scenes: ["HOOK", "PAYOFF"].map((stage, index) => ({
      sceneId: `${contentId}-${stage}`,
      progressionStage: stage,
      narrationAnchor: `${stage.toLowerCase()}-anchor`,
      startMs: index * 5_000,
      durationMs: 5_000,
      treatment: {
        narrativeBeat: `${stage.toLowerCase()}-beat`,
        communicationIntent: index === 0 ? "create-tension" : "deliver-payoff",
        subjectRequirement: "a business owner comparing visible unit economics",
        environment: "European editorial studio",
        composition: "vertical editorial composition",
        camera: "45mm point of view",
        lighting: "clean directional daylight",
        action: "the owner compares revenue with remaining margin",
        actionOwnerRole: "expert",
        strategy: index === 0 ? "comparison-composition" : "client-decision",
        props: ["product parcel", "cost tokens"],
      },
    })),
    assets: ["HOOK", "PAYOFF"].map((stage) => ({
      sceneId: `${contentId}-${stage}`,
      prompt: `Text-free 9:16 editorial treatment for ${stage}.`,
      nativeAspectRatio: "9:16",
      textFree: true,
      textInGeneratedImage: false,
    })),
    validation: { status: "pass", failures: [] },
    planHash: "a".repeat(64),
  });
}

async function preparedWorkspace(narration?: string) {
  const packDir = await writePack(narration);
  const workspaceRoot = await temporaryDirectory("veronica-plan-workspace-");
  const sourceEpisode = (await discoverVeronicaContentPack2Shorts({ packDir }))[0];
  if (!sourceEpisode) throw new Error("Fixture source was not discovered.");
  const prepared = await prepareCanonicalSourceEpisodeWorkspace({
    workspaceRoot,
    sourceEpisode,
    locale: "en",
  });
  return { packDir, workspaceRoot, sourceEpisode, prepared };
}

function fakePlanner(contentId: string): VeronicaCanonicalVisualPlanner & { execute: ReturnType<typeof vi.fn> } {
  return { execute: vi.fn(async () => fakePlan(contentId)) };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("canonical Veronica visual-plan resolver", () => {
  it("derives and persists a missing Pack 2 plan in the production adapter's canonical schema", async () => {
    const { prepared } = await preparedWorkspace();
    const deterministicPlanner = new DeterministicVeronicaCanonicalVisualPlanner();
    const planner: VeronicaCanonicalVisualPlanner & { execute: ReturnType<typeof vi.fn> } = {
      execute: vi.fn((input) => deterministicPlanner.execute(input)),
    };
    const resolved = await resolveVeronicaVisualPlan({
      episodeDir: prepared.episodeDir,
      episodeId: prepared.episodeId,
      planner,
    });

    expect(resolved.evidence).toMatchObject({
      visualPlanSource: "derived_from_planner_input",
      reuseReason: "visual-plan-missing",
    });
    expect(planner.execute).toHaveBeenCalledTimes(1);
    await expect(fs.access(resolved.planPath)).resolves.toBeUndefined();

    const productionInput = compilePositioningProductionScenePlan({
      episodeId: prepared.episodeId,
      narration: await fs.readFile(prepared.scriptPath, "utf8"),
      plan: resolved.plan,
    });
    expect(productionInput.scenes).toHaveLength(resolved.plan.scenes.length);
    expect(productionInput.scenes[0]?.imagePrompt).toBe(resolved.plan.assets[0]?.prompt);
    const reloaded = positioningProductionPlanSchema.parse(
      JSON.parse(await fs.readFile(resolved.planPath, "utf8")),
    );
    expect(hasValidSemanticPlanHash(reloaded)).toBe(true);
    expect(reloaded.planHash).toBe(resolved.plan.planHash);
    expect(() => assertValidSemanticPlanHash(reloaded)).not.toThrow();
  });

  it("uses one canonical self-hash projection and detects post-finalization mutation", () => {
    const finalized = finalizeSemanticPlanHash(fakePlan("semantic-hash-contract"));
    expect(finalized.planHash).toBe(computeSemanticPlanHash(finalized));
    expect(hasValidSemanticPlanHash(finalized)).toBe(true);

    const reordered = {
      planHash: finalized.planHash,
      validation: finalized.validation,
      assets: finalized.assets,
      scenes: finalized.scenes,
      aspectRatio: finalized.aspectRatio,
      format: finalized.format,
      contentId: finalized.contentId,
      plannerVersion: finalized.plannerVersion,
      schemaVersion: finalized.schemaVersion,
    } as typeof finalized;
    expect(computeSemanticPlanHash(reordered)).toBe(finalized.planHash);

    const mutated = { ...finalized, contentId: "semantic-hash-contract-mutated" };
    expect(hasValidSemanticPlanHash(mutated)).toBe(false);
    expect(() => assertValidSemanticPlanHash(mutated)).toThrow(SemanticPlanHashIntegrityError);
  });

  it("reuses a matching derived plan without invoking the planner", async () => {
    const { prepared } = await preparedWorkspace();
    const firstPlanner = fakePlanner(prepared.episodeId);
    await resolveVeronicaVisualPlan({ episodeDir: prepared.episodeDir, episodeId: prepared.episodeId, planner: firstPlanner });
    const secondPlanner = fakePlanner(prepared.episodeId);
    const reused = await resolveVeronicaVisualPlan({ episodeDir: prepared.episodeDir, episodeId: prepared.episodeId, planner: secondPlanner });

    expect(secondPlanner.execute).not.toHaveBeenCalled();
    expect(reused.evidence.reuseReason).toBe("matching-planner-input-hash");
  });

  it("rejects a stale derived plan and invokes the planner after source input changes", async () => {
    const { packDir, workspaceRoot, prepared } = await preparedWorkspace("Revenue is not margin.");
    await resolveVeronicaVisualPlan({
      episodeDir: prepared.episodeDir,
      episodeId: prepared.episodeId,
      planner: fakePlanner(prepared.episodeId),
    });
    await fs.writeFile(
      path.join(packDir, "shorts", "en", "01a-revenue-is-not-a-good-business.md"),
      "Revenue is not margin. Every incremental sale must leave something behind.",
    );
    const changedEpisode = (await discoverVeronicaContentPack2Shorts({ packDir }))[0];
    if (!changedEpisode) throw new Error("Changed fixture source was not discovered.");
    await prepareCanonicalSourceEpisodeWorkspace({ workspaceRoot, sourceEpisode: changedEpisode, locale: "en" });
    const planner = fakePlanner(prepared.episodeId);
    const regenerated = await resolveVeronicaVisualPlan({
      episodeDir: prepared.episodeDir,
      episodeId: prepared.episodeId,
      planner,
    });

    expect(planner.execute).toHaveBeenCalledTimes(1);
    expect(regenerated.evidence.reuseReason).toBe("planner-input-changed");
  });

  it("fails closed for malformed or internally stale planner input", async () => {
    const { prepared } = await preparedWorkspace();
    await fs.writeFile(prepared.plannerInputPath, "{}\n");
    await expect(resolveVeronicaVisualPlan({
      episodeDir: prepared.episodeDir,
      episodeId: prepared.episodeId,
      planner: fakePlanner(prepared.episodeId),
    })).rejects.toMatchObject<Partial<VeronicaVisualPlanResolutionError>>({ code: "INVALID_PLANNER_INPUT" });
  });

  it("fails with a typed error when neither plan nor planner input exists", async () => {
    const episodeDir = await temporaryDirectory("veronica-plan-empty-");
    await expect(resolveVeronicaVisualPlan({
      episodeDir,
      episodeId: "01a-revenue-is-not-a-good-business",
    })).rejects.toMatchObject<Partial<VeronicaVisualPlanResolutionError>>({ code: "MISSING_PLANNING_INPUT" });
  });

  it("preserves a legacy plan and converges both paths on the production schema", async () => {
    const episodeDir = await temporaryDirectory("veronica-plan-legacy-");
    const episodeId = "l01-s01-being-good-isnt-enough";
    const planPath = path.join(episodeDir, "source", "visual-plan.json");
    await fs.mkdir(path.dirname(planPath), { recursive: true });
    await fs.writeFile(planPath, `${JSON.stringify(fakePlan(episodeId), null, 2)}\n`);
    const legacy = await resolveVeronicaVisualPlan({ episodeDir, episodeId });

    expect(legacy.evidence).toMatchObject({
      visualPlanSource: "existing",
      reuseReason: "legacy-or-human-authored-plan",
    });
    expect(positioningProductionPlanSchema.safeParse(legacy.plan).success).toBe(true);
  });

  it("resolves the real 01a Pack 2 canary through the deterministic planner", async () => {
    const packDir = path.resolve("content-packs/vero/veronica-content-pack-2");
    const workspaceRoot = await temporaryDirectory("veronica-plan-canary-");
    const sourceEpisode = (await discoverVeronicaContentPack2Shorts({ packDir })).find(
      (episode) => episode.episodeId === "01a-revenue-is-not-a-good-business",
    );
    if (!sourceEpisode) throw new Error("Real Pack 2 canary source was not discovered.");
    const prepared = await prepareCanonicalSourceEpisodeWorkspace({
      workspaceRoot,
      sourceEpisode,
      locale: "en",
    });
    const resolved = await resolveVeronicaVisualPlan({
      episodeDir: prepared.episodeDir,
      episodeId: prepared.episodeId,
    });

    expect(resolved.plan).toMatchObject({
      contentId: prepared.episodeId,
      format: "short",
      aspectRatio: "9:16",
      derivation: {
        sourceNarrationSha256: "4e82a65208256d74b2171c4475ee624d9506cfd6f0b21b1f055074d4062c7503",
      },
    });
    expect(resolved.evidence.visualPlanSource).toBe("derived_from_planner_input");
  });
});
