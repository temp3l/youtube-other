import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import { registerSpeechCommands } from "./speech-commands.js";

describe("speech CLI", () => {
  const environment = {
    MEDIAFORGE_API_BASE_URL: "https://api.example.test",
    MEDIAFORGE_API_BEARER_TOKEN: "test-token",
  };

  it("registers the provider-neutral command surface", () => {
    const program = new Command();
    registerSpeechCommands(program, { environment });
    const speech = program.commands.find(
      (command) => command.name() === "speech"
    );
    const profiles = speech?.commands.find(
      (command) => command.name() === "profiles"
    );
    expect(speech?.commands.map((command) => command.name())).toEqual(
      expect.arrayContaining([
        "profiles",
        "estimate",
        "generate",
        "status",
        "retry",
      ])
    );
    expect(profiles?.commands.map((command) => command.name())).toEqual([
      "list",
      "show",
      "validate",
    ]);
    expect(
      speech?.commands
        .find((command) => command.name() === "generate")
        ?.options.map((option) => option.long)
    ).toEqual(
      expect.arrayContaining(["--workspace", "--video", "--profile", "--force"])
    );
  });

  it("uses the connected application API for an estimate and prints profile, cache, and quota data", async () => {
    const request = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(
        "https://api.example.test/v1/workspaces/ws-1/speech/estimates"
      );
      expect(init?.headers).toMatchObject({
        authorization: "Bearer test-token",
      });
      expect(JSON.parse(String(init?.body))).toEqual({ videoId: "video-1" });
      return new Response(
        JSON.stringify({
          profileVersionId: "vpv-1",
          provider: "openai",
          billableCharacters: 12,
          cacheHitExpected: true,
          quotaImpact: {
            allowed: true,
            warning: false,
            remainingCharacters: 88,
          },
        }),
        { status: 200, headers: { "x-request-id": "request-1" } }
      );
    });
    const write = vi.fn();
    const program = new Command();
    program.exitOverride();
    registerSpeechCommands(program, {
      environment,
      request,
      stdout: { write },
    });
    await program.parseAsync([
      "node",
      "mediaforge",
      "speech",
      "estimate",
      "--workspace",
      "ws-1",
      "--video",
      "video-1",
    ]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      operation: "speech.estimate",
      data: {
        profileVersionId: "vpv-1",
        cacheHitExpected: true,
        quotaImpact: { remainingCharacters: 88 },
      },
    });
  });
});
