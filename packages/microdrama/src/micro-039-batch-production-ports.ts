import { mkdirSync } from "node:fs";
import path from "node:path";

import {
  createMicro036MockEnVisualProductionPort,
  createMicro036MockSegmentSynthesisPort,
  createMicro036MockSegmentSynthesisPorts,
  createMicro036MockSharedVisualReusePort,
  createMicro036OpenAiSegmentSynthesisPortForLocale,
  createMicro036SharedVisualReusePort,
  type Micro036EnVisualProductionPort,
  type Micro036SegmentSynthesisPort,
  type Micro036SegmentSynthesisPorts,
  type Micro036SharedVisualReusePort,
} from "./micro-036-batch-production-ports.js";
import type { Micro039BatchLocale } from "./micro-039-batch-bindings.js";

export type Micro039SegmentSynthesisPort = Micro036SegmentSynthesisPort;
export type Micro039SegmentSynthesisPorts = Record<
  Micro039BatchLocale,
  Micro039SegmentSynthesisPort
>;
export type Micro039EnVisualProductionPort = Micro036EnVisualProductionPort;
export type Micro039SharedVisualReusePort = Micro036SharedVisualReusePort;

export function createMicro039MockSegmentSynthesisPort(input: {
  readonly writeAudioBytes: (outputPath: string) => void;
}): Micro039SegmentSynthesisPort {
  return createMicro036MockSegmentSynthesisPort(input);
}

export function createMicro039MockSegmentSynthesisPorts(input: {
  readonly writeAudioBytes: (outputPath: string) => void;
}): Micro039SegmentSynthesisPorts {
  return createMicro036MockSegmentSynthesisPorts(input) as Micro039SegmentSynthesisPorts;
}

export function createMicro039OpenAiSegmentSynthesisPorts(): Micro039SegmentSynthesisPorts {
  return {
    "en-US": createMicro036OpenAiSegmentSynthesisPortForLocale("en-US"),
    "de-DE": createMicro036OpenAiSegmentSynthesisPortForLocale("de-DE"),
    "es-ES": createMicro036OpenAiSegmentSynthesisPortForLocale("es-ES"),
    "pt-BR": createMicro036OpenAiSegmentSynthesisPortForLocale("pt-BR"),
  };
}

export function createMicro039MockEnVisualProductionPort(
  input?: Parameters<typeof createMicro036MockEnVisualProductionPort>[0]
): Micro039EnVisualProductionPort {
  return createMicro036MockEnVisualProductionPort(input);
}

export function createMicro039SharedVisualReusePort(input: {
  readonly batchOutputRoot: string;
  readonly episodeIds: readonly ("E011" | "E012")[];
}): Micro039SharedVisualReusePort {
  return {
    async generateSharedVisual(args) {
      mkdirSync(path.dirname(args.outputPath), { recursive: true });
      // Progressive batches synthesize EN visuals in-batch; non-EN reuse via mock copy helper.
      return createMicro036MockSharedVisualReusePort().generateSharedVisual(args);
    },
  };
}

export {
  createMicro036SharedVisualReusePort as createMicro039BatchSharedVisualReusePort,
};
