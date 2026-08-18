import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SpeechProvider } from "@mediaforge/speech";
import {
  runVeronicaNarrationCanary,
  type VeronicaNarrationCanaryResult,
} from "./veronica-narration-canary.js";

const temporaryDirectories: string[] = [];

function hash(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function fixture(input: { existingCall?: boolean } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-narration-canary-"));
  temporaryDirectories.push(root);
  const workspaceRoot = path.join(root, "episodes");
  const reportsRoot = path.join(root, "reports");
  const episodeId = "03b-the-promise-formula";
  const episodeDir = path.join(workspaceRoot, episodeId);
  const narration = "A clear promise makes value easier to understand and trust.";
  const sourceSha256 = hash(narration);
  const sourceEpisode = {
    schemaVersion: "veronica-canonical-source-episode.v1",
    ingestionAdapterVersion: "veronica-unified-content-pack-adapter.v1",
    sourcePackId: "veronica-unified-content-pack-v2",
    episodeId,
    authoredEpisodeKey: episodeId,
    canonicalSlug: episodeId,
    contentProfileId: "veronicabenini",
    format: "short",
    canonicalLocale: "en",
    contentHash: sourceSha256,
    seriesEpisodeId: "veronica-episode-03",
    seriesEpisodeOrder: 3,
    seriesSlot: "short-b",
    relatedStoryIds: ["osc-l03", "osc-s03a"],
    readiness: "CANONICAL_READY",
    localeSources: [
      {
        locale: "en",
        sourcePath: `shorts/en/${episodeId}.md`,
        sourceSha256,
        narration,
      },
    ],
    sourceRevisionHash: hash("revision"),
    declaredReusableAssets: [],
  };
  const plannerInput = {
    schemaVersion: "veronica-canonical-source-planner-input.v1",
    sourceEpisode,
    locale: "en",
    narration: sourceEpisode.localeSources[0],
    planningConfiguration: {
      schemaVersion: "veronica-canonical-visual-planning-configuration.v1",
      targetWordsPerMinute: 155,
      imageProviderModel: "provider-unbound:text-free-canonical-v1",
      rendererVersion: "ffmpeg-event-compiler.v1",
    },
    declaredReusableAssets: [],
    visualPlanOverride: null,
  };
  await Promise.all([
    fs.mkdir(path.join(episodeDir, "source"), { recursive: true }),
    fs.mkdir(path.join(episodeDir, "languages", "short"), { recursive: true }),
    fs.mkdir(reportsRoot, { recursive: true }),
  ]);
  await Promise.all([
    fs.writeFile(
      path.join(episodeDir, "source", "canonical-source-episode.v1.json"),
      JSON.stringify(sourceEpisode),
    ),
    fs.writeFile(
      path.join(episodeDir, "source", "visual-planner-input.v1.json"),
      JSON.stringify(plannerInput),
    ),
    fs.writeFile(
      path.join(episodeDir, "languages", "short", "script-en.md"),
      narration,
    ),
  ]);
  const authorization = {
    schemaVersion: "veronicabenini.synthetic-narration-authorization.v1",
    authorizationId: "bounded-canary-test",
    contentProfileId: "veronicabenini",
    creatorProfileId: "veronica-benini",
    unitId: episodeId,
    locale: "en",
    variant: "short",
    provider: "openai-compatible",
    voiceId: "shimmer",
    syntheticNarrationAllowed: true,
    commercialUseAllowed: true,
    grantedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
    approvedBy: [
      { actor: "operator", role: "creator" },
      { actor: "reviewer", role: "independent-reviewer" },
    ],
  };
  const authorizationPath = path.join(reportsRoot, "authorization.json");
  const authorizationBytes = `${JSON.stringify(authorization, null, 2)}\n`;
  await fs.writeFile(authorizationPath, authorizationBytes);
  if (input.existingCall) {
    await fs.writeFile(
      path.join(episodeDir, "openai-cost-summary.json"),
      JSON.stringify({
        byOperation: {
          "speech-generation": {
            providerCalls: 1,
            unpricedProviderCalls: 0,
            knownEstimatedCostUsd: 0.015,
          },
        },
      }),
    );
  }
  const reservationPath = path.join(reportsRoot, "reservation.json");
  await fs.writeFile(
    reservationPath,
    JSON.stringify({
      schemaVersion: "veronica-narration-cost-reservation.v1",
      reservationId: "test-reservation",
      status: "HELD",
      createdAt: "2026-08-12T00:00:00.000Z",
      authorizationReference: "test",
      locale: "en",
      variant: "short",
      provider: "openai",
      model: "gpt-4o-mini-tts",
      voice: "shimmer",
      episodes: [
        {
          episodeId,
          sourceSha256,
          authorizationPath: "authorization.json",
          authorizationSha256: hash(authorizationBytes),
          conservativeCostUsd: 0.06,
          conservativeCostEur: 0.057,
          preDispatchSpeechCalls: 0,
          preDispatchSpeechCostUsd: 0,
        },
      ],
      limits: {
        maxProviderCalls: 1,
        providerCeilingUsd: 0.06,
        canonicalCeilingEur: 0.057,
      },
      budgetBeforeReservation: {
        canonicalCurrency: "EUR",
        portfolioCeilingEur: 4.8,
        cumulativeSpendEur: 2.3,
        remainingEur: 2.5,
      },
      conversionPolicy: {
        observationDate: "2026-08-11",
        source: "ECB",
        observedUsdPerEur: 1.154,
        safetyMultiplier: 1.1,
        conservativeEurPerUsd: 0.953206239,
      },
      activity: {
        providerCalls: 0,
        cacheHits: 0,
        completedEpisodes: [],
        failedEpisode: null,
      },
      actualCost: {
        knownEstimatedCostUsd: 0,
        unpricedProviderCalls: 0,
        conservativeChargedUsd: 0,
        conservativeChargedEur: 0,
      },
      reservationReconciliation: {
        reservedEur: 0.057,
        consumedEur: 0,
        releasedEur: 0,
        stillHeldEur: 0.057,
      },
      result: null,
    }),
  );
  return { workspaceRoot, episodeDir, episodeId, reservationPath };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("bounded Veronica narration canary", () => {
  it("dispatches once, binds selected audio and timing to the active source, and consumes the reservation", async () => {
    const state = await fixture();
    let calls = 0;
    const provider: SpeechProvider = {
      synthesize: async (request) => {
        calls += 1;
        await fs.writeFile(request.outputPath, "bounded-audio");
        await fs.writeFile(
          path.join(state.episodeDir, "openai-cost-summary.json"),
          JSON.stringify({
            byOperation: {
              "speech-generation": {
                providerCalls: 1,
                unpricedProviderCalls: 0,
                knownEstimatedCostUsd: 0.015,
              },
            },
          }),
        );
        return {
          sceneId: request.sceneId,
          filePath: request.outputPath,
          durationSeconds: 4,
          sampleRate: 48_000,
          channels: 1,
        };
      },
    };
    const result: VeronicaNarrationCanaryResult =
      await runVeronicaNarrationCanary({
        workspaceRoot: state.workspaceRoot,
        reservationPath: state.reservationPath,
        provider,
        voiceProfile: {
          id: "test",
          label: "test",
          gender: "female",
          style: "clear",
          paceWpm: 155,
        },
        instructions: "Speak clearly.",
        speed: 1,
        probeDuration: async () => 4,
      });
    const timing = JSON.parse(
      await fs.readFile(
        path.join(
          state.episodeDir,
          "locales/en/short/canonical-timing.v1.json",
        ),
        "utf8",
      ),
    ) as { narrationHash: string; selectedAudioHash: string };
    const selection = JSON.parse(
      await fs.readFile(
        path.join(
          state.episodeDir,
          "locales/en/short/audio/narration/selected-narration.v1.json",
        ),
        "utf8",
      ),
    ) as { sourceSha256: string; selectedAudioSha256: string };
    const reservation = JSON.parse(
      await fs.readFile(state.reservationPath, "utf8"),
    ) as { status: string; activity: { providerCalls: number } };

    expect(calls).toBe(1);
    expect(result).toMatchObject({ status: "PASS", providerCalls: 1 });
    expect(timing.narrationHash).toBe(selection.sourceSha256);
    expect(timing.selectedAudioHash).toBe(selection.selectedAudioSha256);
    expect(reservation).toMatchObject({
      status: "CONSUMED_PASS",
      activity: { providerCalls: 1 },
    });
  });

  it("fails closed before a retry when the authorized provider-call ceiling is already consumed", async () => {
    const state = await fixture({ existingCall: true });
    let calls = 0;
    const provider: SpeechProvider = {
      synthesize: async (request) => {
        calls += 1;
        return {
          sceneId: request.sceneId,
          filePath: request.outputPath,
          durationSeconds: 4,
          sampleRate: 48_000,
          channels: 1,
        };
      },
    };
    await expect(
      runVeronicaNarrationCanary({
        workspaceRoot: state.workspaceRoot,
        reservationPath: state.reservationPath,
        provider,
        voiceProfile: {
          id: "test",
          label: "test",
          gender: "female",
          style: "clear",
          paceWpm: 155,
        },
        instructions: "Speak clearly.",
        speed: 1,
        probeDuration: async () => 4,
      }),
    ).rejects.toThrow("NARRATION_PROVIDER_CALL_CEILING_EXCEEDED");
    expect(calls).toBe(0);
  });
});
