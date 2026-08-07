import fs from "node:fs";
import type { VeronicaRenderManifest } from "../contracts/media-plan.v1.js";

export interface ValidateVeronicaRenderOutputInput {
  readonly manifest: VeronicaRenderManifest;
  readonly executed: boolean;
}

export interface ValidateVeronicaRenderOutputResult {
  readonly valid: boolean;
  readonly issues: readonly string[];
  readonly outputExists: boolean;
  readonly outputBytes: number;
}

export async function validateVeronicaRenderOutput(
  input: ValidateVeronicaRenderOutputInput,
): Promise<ValidateVeronicaRenderOutputResult> {
  return validateVeronicaRenderOutputSync(input);
}

export function validateVeronicaRenderOutputSync(
  input: ValidateVeronicaRenderOutputInput,
): ValidateVeronicaRenderOutputResult {
  const issues: string[] = [];
  if (!input.manifest.outputPath.endsWith(".mp4")) {
    issues.push("RENDER_OUTPUT_EXTENSION_INVALID");
  }
  if (input.manifest.clips.length === 0) {
    issues.push("RENDER_MANIFEST_EMPTY");
  }
  let outputExists = false;
  let outputBytes = 0;
  if (input.executed) {
    try {
      const stats = fs.statSync(input.manifest.outputPath);
      outputExists = stats.isFile();
      outputBytes = stats.size;
      if (!outputExists) {
        issues.push("RENDER_OUTPUT_MISSING");
      } else if (outputBytes < 44) {
        issues.push("RENDER_OUTPUT_TOO_SMALL");
      }
    } catch {
      issues.push("RENDER_OUTPUT_MISSING");
    }
  }
  return {
    valid: issues.length === 0,
    issues,
    outputExists,
    outputBytes,
  };
}
