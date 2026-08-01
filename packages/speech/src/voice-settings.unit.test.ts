import { describe, expect, it, vi } from "vitest";
import { APPROVAL_SCHEMA_VERSION, approvalRecordSchema, sceneIdSchema, type ApprovalRecord } from "@mediaforge/domain";
import { OpenAiCompatibleSpeechProvider } from "./index.js";
import {
  loadSpeechVoiceInstructionTemplate,
  loadSpeechVoiceSettings,
  resolveSpeechVoiceInstructionPath,
} from "./voice-settings.js";

const hash = "a".repeat(64);
const outputHash = "b".repeat(64);

function approval(overrides: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return approvalRecordSchema.parse({
    schemaVersion: APPROVAL_SCHEMA_VERSION, id: "approval-voice-one", workflowInstanceId: "instance-001",
    taskId: "strategic.voice", profileId: "strategic-reinvention", unitId: "episode-001",
    locale: "it", variant: "full", decision: "approved", actor: "one@example.invalid",
    reason: "Approved voice dispatch.", boundRevision: "revision-1", artifactHashes: [outputHash],
    createdAt: "2026-08-01T00:00:00.000Z",
    scope: { gate: "voice", locale: "it", variant: "full", inputArtifactHashes: [hash], outputArtifactHashes: [outputHash], highRisk: false },
    ...overrides,
  });
}

function creatorContext(approvals: readonly ApprovalRecord[] = [approval()]) {
  return {
    kind: "creator" as const, profileId: "strategic-reinvention" as const, workflowInstanceId: "instance-001",
    taskId: "strategic.voice", unitId: "episode-001", revision: "revision-1", locale: "it", variant: "full" as const,
    inputSha256: hash, outputSha256: outputHash, approvals,
  };
}

function wavResponse(): Response {
  const samples = 24_000;
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(36 + samples * 2, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(24_000, 24); bytes.writeUInt32LE(48_000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36); bytes.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index += 1) {
    bytes.writeInt16LE(Math.round(Math.sin(index / 31) * 8_000), 44 + index * 2);
  }
  return new Response(bytes);
}

describe("speech voice settings", () => {
  it("loads the fast preset by default", () => {
    const settings = loadSpeechVoiceSettings();
    expect(settings.preset).toBe("fast");
    expect(settings.voice).toBe("onyx");
    expect(settings.profile.paceWpm).toBe(180);
    expect(settings.instructions).toContain("180 words per minute");
  });

  it("loads the fast preset when requested", () => {
    const settings = loadSpeechVoiceSettings({ preset: "fast" });
    expect(settings.preset).toBe("fast");
    expect(settings.profile.paceWpm).toBe(180);
    expect(settings.instructions).toContain("180 words per minute");
  });

  it("loads the very-fast preset when requested", () => {
    const settings = loadSpeechVoiceSettings({ preset: "very-fast" });
    expect(settings.preset).toBe("very-fast");
    expect(settings.profile.paceWpm).toBe(190);
    expect(settings.speed).toBe(1.5);
    expect(settings.instructions).toContain("190 words per minute");
  });

  it("adapts instructions for the requested language", () => {
    const settings = loadSpeechVoiceSettings({
      preset: "fast",
      language: "es",
      artifactType: "full",
    });
    expect(settings.language).toBe("es");
    expect(settings.narrationPacingPreset?.id).toBe("dark-truth-es-full-pace-v1");
    expect(settings.instructions).toContain("Spanish");
    expect(settings.instructions).toContain("es");
    expect(settings.instructions).toContain("182 palabras por minuto");
  });

  it("loads artifact-specific voice templates from config", () => {
    const fullTemplate = loadSpeechVoiceInstructionTemplate({
      preset: "fast",
      language: "de",
      artifactType: "full",
    });
    const shortTemplate = loadSpeechVoiceInstructionTemplate({
      preset: "very-fast",
      language: "de",
      artifactType: "short",
    });

    expect(fullTemplate.path).toBe(resolveSpeechVoiceInstructionPath("de", "full"));
    expect(fullTemplate.instructions).toContain("düsteren Dokumentarton");
    expect(shortTemplate.path).toBe(resolveSpeechVoiceInstructionPath("de", "short"));
    expect(shortTemplate.instructions).toContain("Halte die Lieferung kompakt");
  });

  it("applies centralized narration pacing when language and profile are provided", () => {
    const settings = loadSpeechVoiceSettings({
      preset: "fast",
      language: "de",
      artifactType: "full",
    });

    expect(settings.paceWpm).toBe(184);
    expect(settings.profile.paceWpm).toBe(184);
    expect(settings.speed).toBe(1.45);
    expect(settings.instructions).toContain("184 Wörter pro Minute");
  });

  it("applies explicit pace and speed overrides", () => {
    const settings = loadSpeechVoiceSettings({
      preset: "fast",
      language: "de",
      artifactType: "full",
      paceWpm: 186,
      speed: 1.24,
    });

    expect(settings.paceWpm).toBe(186);
    expect(settings.profile.paceWpm).toBe(186);
    expect(settings.speed).toBe(1.24);
  });

  it("loads Portuguese templates without falling back to generic instructions", () => {
    const settings = loadSpeechVoiceSettings({
      preset: "very-fast",
      language: "pt",
      artifactType: "short",
    });

    expect(settings.narrationPacingPreset?.id).toBe("dark-truth-pt-short-pace-v1");
    expect(settings.instructions).toContain("188 palavras por minuto");
    expect(settings.instructions).toContain("Portuguese");
  });

  it("loads Italian pacing and pronunciation instructions from the locale template", () => {
    const settings = loadSpeechVoiceSettings({ preset: "fast", language: "it-IT", artifactType: "full" });
    expect(settings.narrationPacingPreset?.id).toBe("strategic-reinvention-it-full-pace-v1");
    expect(resolveSpeechVoiceInstructionPath("it", "full")).toContain("voices/strategic-reinvention/it-v1.txt");
    expect(settings.instructions).toContain("italiano");
    expect(settings.instructions).toContain("181 parole al minuto");
  });

  it("blocks a missing dispatch context before any speech provider call", async () => {
    const create = vi.fn(async () => new Response());
    const provider = new OpenAiCompatibleSpeechProvider({ apiKey: "test-key", client: { audio: { speech: { create } } } });
    await expect(provider.synthesize({
      contentProfileId: "dark-truth",
      sceneId: sceneIdSchema.parse("scene-001"), text: "Do not dispatch.", voiceProfile: loadSpeechVoiceSettings().profile,
      outputPath: "/tmp/blocked-creator-voice.wav",
    }, new AbortController().signal)).rejects.toThrow("explicit dispatch context");
    expect(create).not.toHaveBeenCalled();
  });

  it("does not allow Strategic Reinvention to self-label as legacy noncreator", async () => {
    const create = vi.fn(async () => wavResponse());
    const provider = new OpenAiCompatibleSpeechProvider({ apiKey: "test-key", client: { audio: { speech: { create } } } });
    await expect(provider.synthesize({
      contentProfileId: "strategic-reinvention",
      sceneId: sceneIdSchema.parse("scene-001"), text: "Blocked.", voiceProfile: loadSpeechVoiceSettings().profile,
      outputPath: "/tmp/strategic-legacy-voice.wav", dispatchContext: { kind: "legacy-noncreator" },
    }, new AbortController().signal)).rejects.toThrow("cannot dispatch speech as legacy noncreator");
    expect(create).not.toHaveBeenCalled();
  });

  it("fails every malformed or non-current creator approval matrix entry before provider dispatch", async () => {
    const cases: Array<[string, unknown]> = [
      ["missing context", undefined],
      ["partial record", creatorContext([{ id: "partial" } as never])],
      ["wrong workflow", creatorContext([approval({ workflowInstanceId: "instance-002" as never })])],
      ["wrong task", creatorContext([approval({ taskId: "strategic.other" as never })])],
      ["wrong unit", creatorContext([approval({ unitId: "episode-002" as never })])],
      ["wrong profile", creatorContext([approval({ profileId: "dark-truth" })])],
      ["wrong gate", creatorContext([approval({ scope: { ...approval().scope!, gate: "metadata" } })])],
      ["wrong locale", creatorContext([approval({ locale: "en", scope: { ...approval().scope!, locale: "en" } })])],
      ["wrong variant", creatorContext([approval({ variant: "short", scope: { ...approval().scope!, variant: "short" } })])],
      ["wrong input", creatorContext([approval({ scope: { ...approval().scope!, inputArtifactHashes: ["c".repeat(64)] } })])],
      ["wrong output", creatorContext([approval({ artifactHashes: ["c".repeat(64)], scope: { ...approval().scope!, outputArtifactHashes: ["c".repeat(64)] } })])],
      ["wrong revision", creatorContext([approval({ boundRevision: "revision-2" })])],
      ["expired", creatorContext([approval({ expiresAt: "2026-01-01T00:00:00.000Z" })])],
      ["later rejected", creatorContext([approval(), approval({ id: "approval-voice-rejected", decision: "rejected", actor: "reviewer@example.invalid" })])],
      ["later revoked", creatorContext([approval(), approval({ id: "approval-voice-revoked", decision: "revoked", actor: "reviewer@example.invalid", supersedesApprovalId: "approval-voice-one" })])],
      ["one high-risk actor", creatorContext([approval({ scope: { ...approval().scope!, highRisk: true } })])],
    ];
    for (const [name, dispatchContext] of cases) {
      const create = vi.fn(async () => wavResponse());
      const provider = new OpenAiCompatibleSpeechProvider({ apiKey: "test-key", client: { audio: { speech: { create } } } });
      await expect(provider.synthesize({ contentProfileId: "strategic-reinvention", sceneId: sceneIdSchema.parse("scene-001"), text: "Blocked.", voiceProfile: loadSpeechVoiceSettings().profile, outputPath: `/tmp/voice-policy-${name}.wav`, dispatchContext: dispatchContext as never }, new AbortController().signal)).rejects.toThrow();
      expect(create, name).not.toHaveBeenCalled();
    }
  });

  it("blocks valid creator approvals because strategic synthetic narration is disabled", async () => {
    for (const approvals of [[
      approval(),
      approval({ id: "approval-voice-two", actor: "two@example.invalid", createdAt: "2026-08-01T00:01:00.000Z" }),
    ]]) {
      const create = vi.fn(async () => wavResponse());
      const provider = new OpenAiCompatibleSpeechProvider({ apiKey: "test-key", client: { audio: { speech: { create } } } });
      await expect(provider.synthesize({ contentProfileId: "strategic-reinvention", sceneId: sceneIdSchema.parse("scene-001"), text: "Approved.", voiceProfile: loadSpeechVoiceSettings().profile, outputPath: "/tmp/voice-policy-approved.wav", dispatchContext: creatorContext(approvals) }, new AbortController().signal)).rejects.toThrow("Synthetic narration is disabled");
      expect(create).not.toHaveBeenCalled();
    }
  });
});
