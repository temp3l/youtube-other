import { createHash } from "node:crypto";
import { z } from "zod";

export const veronicaTimingSourceSchema = z.enum([
  "selected-audio-word-timestamps",
  "selected-audio-utterance-timestamps",
  "derived-audio-silence-alignment",
  "proportional-total-audio-reconciliation",
]);
export type VeronicaTimingSource = z.infer<typeof veronicaTimingSourceSchema>;

export const veronicaTimedNarrationUnitSchema = z.strictObject({
  kind: z.enum(["word", "utterance"]),
  text: z.string().min(1),
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().positive(),
}).refine((unit) => unit.endSeconds >= unit.startSeconds, "Timed narration units must have a non-negative span.");
export type VeronicaTimedNarrationUnit = z.infer<typeof veronicaTimedNarrationUnitSchema>;

export interface VeronicaResolvedCanonicalTiming {
  readonly timingSource: VeronicaTimingSource;
  readonly timingConfidence: "actual" | "derived" | "fallback";
  readonly timingAlgorithmVersion: "veronica-canonical-audio-alignment.v1";
  readonly selectedAudioHash: string;
  readonly narrationDurationSeconds: number;
  readonly scenes: readonly {
    readonly sceneId: string;
    readonly startSeconds: number;
    readonly endSeconds: number;
  }[];
  readonly timingFingerprint: string;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function words(value: string): readonly string[] {
  return value.toLocaleLowerCase("en").match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
}

function proportionalBoundaries(input: {
  readonly duration: number;
  readonly scenes: readonly { readonly plannedDurationSeconds: number }[];
}): readonly number[] {
  const total = input.scenes.reduce((sum, scene) => sum + scene.plannedDurationSeconds, 0);
  if (!(total > 0)) throw new Error("Canonical timing requires positive planned scene durations.");
  let cursor = 0;
  return input.scenes.slice(0, -1).map((scene) => {
    cursor += scene.plannedDurationSeconds;
    return input.duration * cursor / total;
  });
}

function timestampBoundaries(input: {
  readonly scenes: readonly { readonly narration: string }[];
  readonly units: readonly VeronicaTimedNarrationUnit[];
  readonly kind: "word" | "utterance";
  readonly duration: number;
}): readonly number[] | null {
  const units = input.units.filter((unit) => unit.kind === input.kind);
  if (units.length === 0) return null;
  const narrationWords = input.scenes.flatMap((scene) => words(scene.narration));
  const unitWords = units.flatMap((unit) => words(unit.text));
  if (narrationWords.length === 0 || narrationWords.length !== unitWords.length || narrationWords.some((word, index) => word !== unitWords[index])) return null;
  const sceneEnds: number[] = [];
  let targetWord = 0;
  for (const scene of input.scenes.slice(0, -1)) {
    targetWord += words(scene.narration).length;
    let cumulative = 0;
    let boundary: number | null = null;
    for (const unit of units) {
      cumulative += words(unit.text).length;
      if (cumulative === targetWord) {
        boundary = Math.min(input.duration, unit.endSeconds);
        break;
      }
      if (cumulative > targetWord) return null;
    }
    if (boundary === null) return null;
    sceneEnds.push(boundary);
  }
  return sceneEnds;
}

interface PcmWav {
  readonly sampleRate: number;
  readonly channels: number;
  readonly dataOffset: number;
  readonly dataSize: number;
}

function pcm16Wav(bytes: Buffer): PcmWav | null {
  if (bytes.length < 44 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") return null;
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let format = 0;
  let bits = 0;
  let dataOffset = -1;
  let dataSize = 0;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt " && size >= 16 && start + 16 <= bytes.length) {
      format = bytes.readUInt16LE(start);
      channels = bytes.readUInt16LE(start + 2);
      sampleRate = bytes.readUInt32LE(start + 4);
      bits = bytes.readUInt16LE(start + 14);
    }
    if (id === "data") {
      dataOffset = start;
      dataSize = Math.min(size, bytes.length - start);
      break;
    }
    offset = start + size + (size % 2);
  }
  return format === 1 && bits === 16 && sampleRate > 0 && channels > 0 && dataOffset >= 0 && dataSize > 0
    ? { sampleRate, channels, dataOffset, dataSize }
    : null;
}

function silenceMidpoints(bytes: Buffer): readonly number[] {
  const wav = pcm16Wav(bytes);
  if (!wav) return [];
  const samplesPerWindow = Math.max(1, Math.round(wav.sampleRate * 0.01));
  const frameBytes = wav.channels * 2;
  const frameCount = Math.floor(wav.dataSize / frameBytes);
  const amplitudes: number[] = [];
  for (let frame = 0; frame < frameCount; frame += samplesPerWindow) {
    let peak = 0;
    const end = Math.min(frameCount, frame + samplesPerWindow);
    for (let index = frame; index < end; index += 1) {
      for (let channel = 0; channel < wav.channels; channel += 1) {
        peak = Math.max(peak, Math.abs(bytes.readInt16LE(wav.dataOffset + index * frameBytes + channel * 2)));
      }
    }
    amplitudes.push(peak);
  }
  const peak = Math.max(...amplitudes, 0);
  if (peak === 0) return [];
  const threshold = Math.max(160, peak * 0.035);
  const midpoints: number[] = [];
  let silenceStart = -1;
  for (let index = 0; index <= amplitudes.length; index += 1) {
    const silent = index < amplitudes.length && amplitudes[index]! <= threshold;
    if (silent && silenceStart < 0) silenceStart = index;
    if (!silent && silenceStart >= 0) {
      const duration = (index - silenceStart) * 0.01;
      const midpoint = (silenceStart + index) * 0.005;
      if (duration >= 0.12 && midpoint > 0.08 && midpoint < frameCount / wav.sampleRate - 0.08) midpoints.push(midpoint);
      silenceStart = -1;
    }
  }
  return midpoints;
}

function silenceAlignedBoundaries(input: {
  readonly audioBytes: Buffer;
  readonly duration: number;
  readonly scenes: readonly { readonly narration: string }[];
}): readonly number[] | null {
  const candidates = silenceMidpoints(input.audioBytes);
  if (candidates.length === 0) return null;
  const sceneWordCounts = input.scenes.map((scene) => words(scene.narration).length);
  const totalWords = sceneWordCounts.reduce((sum, count) => sum + count, 0);
  if (totalWords === 0) return null;
  let cumulativeWords = 0;
  let previous = 0;
  const boundaries: number[] = [];
  for (const count of sceneWordCounts.slice(0, -1)) {
    cumulativeWords += count;
    const target = input.duration * cumulativeWords / totalWords;
    const eligible = candidates.filter((candidate) => candidate > previous + 0.15 && candidate < input.duration - 0.15);
    const selected = eligible.sort((left, right) => Math.abs(left - target) - Math.abs(right - target) || left - right)[0];
    if (selected === undefined || Math.abs(selected - target) > Math.max(3, input.duration * 0.09)) return null;
    boundaries.push(selected);
    previous = selected;
  }
  return boundaries;
}

export function resolveVeronicaCanonicalTiming(input: {
  readonly selectedAudioHash: string;
  readonly selectedAudioDurationSeconds: number;
  readonly selectedAudioBytes?: Buffer;
  readonly timedNarrationUnits?: readonly VeronicaTimedNarrationUnit[];
  readonly scenes: readonly {
    readonly sceneId: string;
    readonly narration: string;
    readonly plannedDurationSeconds: number;
  }[];
}): VeronicaResolvedCanonicalTiming {
  if (!/^[a-f0-9]{64}$/u.test(input.selectedAudioHash) || !(input.selectedAudioDurationSeconds > 0) || input.scenes.length === 0) throw new Error("Canonical timing requires selected audio identity, duration, and scenes.");
  const units = (input.timedNarrationUnits ?? []).map((unit) => veronicaTimedNarrationUnitSchema.parse(unit));
  const wordBoundaries = timestampBoundaries({ scenes: input.scenes, units, kind: "word", duration: input.selectedAudioDurationSeconds });
  const utteranceBoundaries = wordBoundaries ? null : timestampBoundaries({ scenes: input.scenes, units, kind: "utterance", duration: input.selectedAudioDurationSeconds });
  const derivedBoundaries = wordBoundaries || utteranceBoundaries ? null : input.selectedAudioBytes ? silenceAlignedBoundaries({ audioBytes: input.selectedAudioBytes, duration: input.selectedAudioDurationSeconds, scenes: input.scenes }) : null;
  const boundaries = wordBoundaries ?? utteranceBoundaries ?? derivedBoundaries ?? proportionalBoundaries({ duration: input.selectedAudioDurationSeconds, scenes: input.scenes });
  const timingSource: VeronicaTimingSource = wordBoundaries
    ? "selected-audio-word-timestamps"
    : utteranceBoundaries
      ? "selected-audio-utterance-timestamps"
      : derivedBoundaries
        ? "derived-audio-silence-alignment"
        : "proportional-total-audio-reconciliation";
  const timingConfidence = wordBoundaries || utteranceBoundaries ? "actual" as const : derivedBoundaries ? "derived" as const : "fallback" as const;
  const points = [0, ...boundaries, input.selectedAudioDurationSeconds];
  const scenes = input.scenes.map((scene, index) => ({ sceneId: scene.sceneId, startSeconds: points[index]!, endSeconds: points[index + 1]! }));
  const fingerprintMaterial = { selectedAudioHash: input.selectedAudioHash, timingSource, units, scenes };
  return {
    timingSource,
    timingConfidence,
    timingAlgorithmVersion: "veronica-canonical-audio-alignment.v1",
    selectedAudioHash: input.selectedAudioHash,
    narrationDurationSeconds: input.selectedAudioDurationSeconds,
    scenes,
    timingFingerprint: hash(fingerprintMaterial),
  };
}
