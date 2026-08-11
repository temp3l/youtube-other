import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resolveVeronicaCanonicalTiming } from "./veronica-canonical-timing.js";

const scenes = [
  { sceneId: "scene-001", narration: "Alpha beta.", plannedDurationSeconds: 2 },
  {
    sceneId: "scene-002",
    narration: "Gamma delta.",
    plannedDurationSeconds: 2,
  },
  {
    sceneId: "scene-003",
    narration: "Epsilon zeta.",
    plannedDurationSeconds: 2,
  },
] as const;

function wavWithSilences(
  durationSeconds: number,
  silences: readonly [number, number][],
  sampleRate = 8_000
): Buffer {
  const frames = Math.round(durationSeconds * sampleRate);
  const pcm = Buffer.alloc(frames * 2);
  for (let frame = 0; frame < frames; frame += 1) {
    const seconds = frame / sampleRate;
    const silent = silences.some(
      ([start, end]) => seconds >= start && seconds <= end
    );
    pcm.writeInt16LE(
      silent ? 0 : Math.round(Math.sin(frame * 0.11) * 9_000),
      frame * 2
    );
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const audioHash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

describe("Veronica canonical audio timing", () => {
  it("uses selected-audio word timestamps and preserves canonical total runtime", () => {
    const audio = wavWithSilences(6, []);
    const timing = resolveVeronicaCanonicalTiming({
      selectedAudioHash: audioHash(audio),
      selectedAudioDurationSeconds: 6,
      scenes,
      timedNarrationUnits: [
        ["Alpha", 0, 0.7],
        ["beta", 0.8, 1.5],
        ["Gamma", 1.9, 2.6],
        ["delta", 2.7, 3.4],
        ["Epsilon", 4.1, 4.8],
        ["zeta", 4.9, 5.7],
      ].map(([text, startSeconds, endSeconds]) => ({
        kind: "word" as const,
        text: String(text),
        startSeconds: Number(startSeconds),
        endSeconds: Number(endSeconds),
      })),
    });
    expect(timing.timingSource).toBe("selected-audio-word-timestamps");
    expect(timing.timingConfidence).toBe("actual");
    expect(timing.scenes.map((scene) => scene.endSeconds)).toEqual([
      1.5, 3.4, 6,
    ]);
  });

  it("uses timestamped utterances before derived alignment and fingerprints aligned changes", () => {
    const audio = wavWithSilences(6, []);
    const base = resolveVeronicaCanonicalTiming({
      selectedAudioHash: audioHash(audio),
      selectedAudioDurationSeconds: 6,
      scenes,
      timedNarrationUnits: scenes.map((scene, index) => ({
        kind: "utterance" as const,
        text: scene.narration,
        startSeconds: index * 2,
        endSeconds: index === 0 ? 1.7 : index === 1 ? 3.8 : 5.9,
      })),
    });
    const changed = resolveVeronicaCanonicalTiming({
      selectedAudioHash: audioHash(audio),
      selectedAudioDurationSeconds: 6,
      scenes,
      timedNarrationUnits: scenes.map((scene, index) => ({
        kind: "utterance" as const,
        text: scene.narration,
        startSeconds: index * 2,
        endSeconds: index === 0 ? 1.9 : index === 1 ? 3.8 : 5.9,
      })),
    });
    expect(base.timingSource).toBe("selected-audio-utterance-timestamps");
    expect(base.scenes[0]?.endSeconds).toBe(1.7);
    expect(changed.timingFingerprint).not.toBe(base.timingFingerprint);
  });

  it("derives semantic boundaries from selected-audio silence and labels proportional fallback", () => {
    const alignedAudio = wavWithSilences(6, [
      [1.75, 2.05],
      [3.85, 4.15],
    ]);
    const aligned = resolveVeronicaCanonicalTiming({
      selectedAudioHash: audioHash(alignedAudio),
      selectedAudioDurationSeconds: 6,
      selectedAudioBytes: alignedAudio,
      scenes,
    });
    expect(aligned.timingSource).toBe("derived-audio-silence-alignment");
    expect(aligned.timingConfidence).toBe("derived");
    expect(aligned.scenes[0]?.endSeconds).toBeCloseTo(1.9, 1);
    expect(aligned.scenes.at(-1)?.endSeconds).toBe(6);

    const fallbackAudio = wavWithSilences(6, []);
    const fallback = resolveVeronicaCanonicalTiming({
      selectedAudioHash: audioHash(fallbackAudio),
      selectedAudioDurationSeconds: 6,
      selectedAudioBytes: fallbackAudio,
      scenes: [
        { ...scenes[0], plannedDurationSeconds: 1 },
        { ...scenes[1], plannedDurationSeconds: 2 },
        { ...scenes[2], plannedDurationSeconds: 3 },
      ],
    });
    const repeated = resolveVeronicaCanonicalTiming({
      selectedAudioHash: audioHash(fallbackAudio),
      selectedAudioDurationSeconds: 6,
      selectedAudioBytes: fallbackAudio,
      scenes: [
        { ...scenes[0], plannedDurationSeconds: 1 },
        { ...scenes[1], plannedDurationSeconds: 2 },
        { ...scenes[2], plannedDurationSeconds: 3 },
      ],
    });
    expect(fallback.timingSource).toBe(
      "proportional-total-audio-reconciliation"
    );
    expect(fallback.timingConfidence).toBe("fallback");
    expect(fallback.scenes.map((scene) => scene.endSeconds)).toEqual([1, 3, 6]);
    expect(repeated).toEqual(fallback);
  });

  it("uses selected-audio duration rather than a WPM-derived or planned total", () => {
    const audio = wavWithSilences(10, []);
    const timing = resolveVeronicaCanonicalTiming({
      selectedAudioHash: audioHash(audio),
      selectedAudioDurationSeconds: 10,
      selectedAudioBytes: audio,
      scenes: scenes.map((scene) => ({ ...scene, plannedDurationSeconds: 2 })),
    });
    expect(timing.narrationDurationSeconds).toBe(10);
    expect(timing.scenes.at(-1)?.endSeconds).toBe(10);
  });
});
