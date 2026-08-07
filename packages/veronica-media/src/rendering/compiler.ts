import type { VeronicaRenderManifest } from "../contracts/media-plan.v1.js";

function escapePath(filePath: string): string {
  return filePath.replace(/'/gu, "'\\''");
}

export function compileRenderManifestToFfmpegArgs(
  manifest: VeronicaRenderManifest,
): readonly (readonly string[])[] {
  const commands: string[][] = [];
  for (const clip of manifest.clips) {
    const filters: string[] = [];
    let inputCount = 0;
    const inputs: string[] = [];
    for (const operation of clip.operations) {
      switch (operation.kind) {
        case "contain":
        case "cover":
        case "crop": {
          inputs.push("-loop", "1", "-i", operation.assetPath);
          const inputLabel = `[${inputCount}:v]`;
          inputCount += 1;
          const mode =
            operation.kind === "cover"
              ? "increase"
              : operation.kind === "crop"
                ? "exact"
                : "decrease";
          filters.push(
            `${inputLabel}scale=${operation.width}:${operation.height}:force_original_aspect_ratio=${mode},crop=${operation.width}:${operation.height},setsar=1[v${inputCount}]`,
          );
          break;
        }
        case "overlay": {
          inputs.push("-loop", "1", "-i", operation.assetPath);
          const base = `[v${inputCount}]`;
          const overlay = `[${inputCount}:v]`;
          inputCount += 1;
          filters.push(
            `${base}${overlay}overlay=${operation.x}:${operation.y}:format=auto:alpha=${operation.opacity}[v${inputCount}]`,
          );
          break;
        }
        case "fade": {
          filters.push(
            `[v${inputCount}]fade=t=in:st=${operation.startSeconds}:d=${operation.endSeconds - operation.startSeconds}:alpha=${operation.opacity}[v${inputCount}]`,
          );
          break;
        }
        case "pip": {
          inputs.push("-loop", "1", "-i", operation.assetPath);
          const base = `[v${inputCount}]`;
          const pip = `[${inputCount}:v]`;
          inputCount += 1;
          filters.push(
            `${pip}scale=${operation.width}:${operation.height}[pip${inputCount}];${base}[pip${inputCount}]overlay=${operation.x}:${operation.y}[v${inputCount}]`,
          );
          break;
        }
        case "loop-video": {
          inputs.push("-stream_loop", "-1", "-i", operation.assetPath);
          if (operation.muteSourceAudio) {
            inputs.push("-an");
          }
          inputCount += 1;
          break;
        }
        default: {
          const exhaustive: never = operation;
          throw new Error(`Unsupported render operation: ${JSON.stringify(exhaustive)}`);
        }
      }
    }
    const duration = clip.endSeconds - clip.startSeconds;
    const filterComplex = filters.length > 0 ? ["-filter_complex", filters.join(";")] : [];
    commands.push([
      "-y",
      ...inputs,
      ...filterComplex,
      "-t",
      String(duration),
      "-r",
      String(manifest.profile.fps),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      manifest.outputPath.replace(/\.mp4$/u, `-${clip.clipId}.mp4`),
    ]);
  }
  const concatList = manifest.clips
    .map((clip) => `file '${escapePath(manifest.outputPath.replace(/\.mp4$/u, `-${clip.clipId}.mp4`))}'`)
    .join("\n");
  commands.push([
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    `${manifest.outputPath}.concat.txt`,
    "-i",
    manifest.narrationAudioPath,
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-shortest",
    manifest.outputPath,
  ]);
  void concatList;
  return commands;
}

export function validateCompiledFfmpegSafety(args: readonly (readonly string[])[]): void {
  for (const command of args) {
    const joined = command.join(" ");
    if (/[;&|`$]/.test(joined)) {
      throw new Error("Unsafe FFmpeg command detected.");
    }
    if (/\b-filter_complex\b.*(?:eval|system|movie)=/iu.test(joined)) {
      throw new Error("Disallowed FFmpeg filter expression detected.");
    }
  }
}
