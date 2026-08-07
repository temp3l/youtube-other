import { spawnSync } from "node:child_process";
import type { VeronicaRenderManifest } from "../contracts/media-plan.v1.js";
import {
  compileRenderManifestToFfmpegArgs,
  validateCompiledFfmpegSafety,
} from "./compiler.js";

export interface ExecuteVeronicaRenderInput {
  readonly manifest: VeronicaRenderManifest;
  readonly execute?: boolean;
  readonly ffmpegExecutable?: string;
}

export interface ExecuteVeronicaRenderResult {
  readonly executed: boolean;
  readonly commands: readonly (readonly string[])[];
  readonly outputPath: string;
  readonly skippedReason?: string;
}

export function prepareVeronicaRenderCommands(
  manifest: VeronicaRenderManifest,
): readonly (readonly string[])[] {
  const commands = compileRenderManifestToFfmpegArgs(manifest);
  validateCompiledFfmpegSafety(commands);
  return commands;
}

export function executeVeronicaRender(
  input: ExecuteVeronicaRenderInput,
): ExecuteVeronicaRenderResult {
  const commands = prepareVeronicaRenderCommands(input.manifest);
  if (!input.execute) {
    return {
      executed: false,
      commands,
      outputPath: input.manifest.outputPath,
      skippedReason: "Render execution requires explicit --execute flag.",
    };
  }
  const ffmpeg = input.ffmpegExecutable ?? "ffmpeg";
  for (const args of commands) {
    const result = spawnSync(ffmpeg, [...args], { encoding: "utf8" });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(
        `FFmpeg render failed (${result.status}): ${result.stderr || result.stdout}`,
      );
    }
  }
  return {
    executed: true,
    commands,
    outputPath: input.manifest.outputPath,
  };
}
