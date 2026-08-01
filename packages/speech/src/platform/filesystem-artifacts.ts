import fs from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { runCommand } from "@mediaforge/process-runner";
import { ensureDir, hashFile } from "@mediaforge/shared";
import {
  CANONICAL_SPEECH_MASTERING_PROFILE,
  masterNarration,
} from "../mastering.js";
import { SpeechDomainError } from "./errors.js";
import type { SpeechArtifactService, StoredSpeechArtifact } from "./service.js";

const safeIdentifier = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/u;
const contentTypeExtensions: Readonly<Record<string, string>> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
  "audio/ogg": "ogg",
  "audio/aac": "aac",
};

export interface FileSystemSpeechArtifactServiceOptions {
  readonly rootDirectory: string;
  readonly maximumRawBytes?: number;
  readonly runProcess?: (
    executable: string,
    args: readonly string[]
  ) => Promise<{ readonly stderr: string }>;
}

function escapeConcatPath(value: string): string {
  return `'${value.replace(/'/gu, "'\\''")}'`;
}

export class FileSystemSpeechArtifactService implements SpeechArtifactService {
  private readonly root: string;
  private readonly maximumRawBytes: number;
  private readonly runProcess: NonNullable<
    FileSystemSpeechArtifactServiceOptions["runProcess"]
  >;

  public constructor(options: FileSystemSpeechArtifactServiceOptions) {
    this.root = path.resolve(options.rootDirectory);
    this.maximumRawBytes = options.maximumRawBytes ?? 100 * 1024 * 1024;
    this.runProcess =
      options.runProcess ??
      (async (executable, args) => {
        const result = await runCommand(executable, args, {
          timeoutMs: 300_000,
        });
        return { stderr: result.stderr.slice(-8_000) };
      });
  }

  public async persistRaw(
    input: Parameters<SpeechArtifactService["persistRaw"]>[0]
  ): Promise<StoredSpeechArtifact> {
    this.assertIdentifier(input.generationId, "generationId");
    if (!Number.isSafeInteger(input.chunkIndex) || input.chunkIndex < 0) {
      throw new SpeechDomainError(
        "SPEECH_ARTIFACT_PERSISTENCE_FAILED",
        "Speech chunk index was invalid."
      );
    }
    const normalizedContentType =
      input.contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
    const extension = contentTypeExtensions[normalizedContentType];
    if (!extension) {
      throw new SpeechDomainError(
        "SPEECH_PROVIDER_INVALID_RESPONSE",
        "Speech provider returned an unsupported audio content type."
      );
    }
    const artifactId = `speech/raw/${input.generationId}/${input.chunkIndex}.${extension}`;
    const outputPath = this.resolveArtifact(artifactId);
    const temporaryPath = `${outputPath}.${process.pid}.tmp`;
    await ensureDir(path.dirname(outputPath));
    let bytes = 0;
    const limiter = new Transform({
      transform: (chunk: Buffer | Uint8Array, _encoding, callback) => {
        bytes += chunk.byteLength;
        if (bytes > this.maximumRawBytes) {
          callback(
            new SpeechDomainError(
              "SPEECH_PROVIDER_INVALID_RESPONSE",
              "Speech audio exceeded the configured artifact size limit."
            )
          );
          return;
        }
        callback(null, chunk);
      },
    });
    try {
      await pipeline(
        input.audio,
        limiter,
        (await fs.open(temporaryPath, "wx", 0o600)).createWriteStream()
      );
      if (bytes === 0)
        throw new SpeechDomainError(
          "SPEECH_PROVIDER_INVALID_RESPONSE",
          "Speech provider returned empty audio."
        );
      await fs.rename(temporaryPath, outputPath);
      return {
        artifactId,
        sha256: await hashFile(outputPath),
        contentType: normalizedContentType,
      };
    } catch (error: unknown) {
      if (error instanceof SpeechDomainError) throw error;
      throw new SpeechDomainError(
        "SPEECH_ARTIFACT_PERSISTENCE_FAILED",
        "Raw speech artifact could not be persisted.",
        { cause: error }
      );
    } finally {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }

  public async createCanonicalMaster(
    input: Parameters<SpeechArtifactService["createCanonicalMaster"]>[0]
  ): Promise<StoredSpeechArtifact> {
    this.assertIdentifier(input.generationId, "generationId");
    if (input.rawArtifacts.length === 0) {
      throw new SpeechDomainError(
        "SPEECH_AUDIO_PROCESSING_FAILED",
        "No raw speech chunks were available for mastering."
      );
    }
    await ensureDir(this.root);
    const temporaryDirectory = await fs.mkdtemp(
      path.join(this.root, ".tmp-speech-master-")
    );
    const concatListPath = path.join(temporaryDirectory, "chunks.txt");
    const cleanPath = path.join(temporaryDirectory, "clean.wav");
    const artifactId = `speech/master/${input.generationId}.flac`;
    const outputPath = this.resolveArtifact(artifactId);
    const metadataPath = `${outputPath}.metadata.json`;
    try {
      const paths = input.rawArtifacts.map((artifact) =>
        this.resolveArtifact(artifact.artifactId)
      );
      await fs.writeFile(
        concatListPath,
        `${paths.map((item) => `file ${escapeConcatPath(item)}`).join("\n")}\n`,
        { mode: 0o600 }
      );
      await this.runProcess("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatListPath,
        "-ar",
        "48000",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
        cleanPath,
      ]);
      await ensureDir(path.dirname(outputPath));
      const mastered = await masterNarration({
        inputPath: cleanPath,
        outputPath,
        metadataPath,
        narrationRoot: this.root,
        profile: CANONICAL_SPEECH_MASTERING_PROFILE,
        runFfmpegCapture: (args) => this.runProcess("ffmpeg", args),
        runFfmpeg: (args) =>
          this.runProcess("ffmpeg", args).then(() => undefined),
      });
      if (mastered.status !== "completed") {
        throw new SpeechDomainError(
          "SPEECH_AUDIO_PROCESSING_FAILED",
          "Canonical speech mastering failed."
        );
      }
      return {
        artifactId,
        sha256: mastered.outputHash,
        contentType: "audio/flac",
      };
    } catch (error: unknown) {
      if (error instanceof SpeechDomainError) throw error;
      throw new SpeechDomainError(
        "SPEECH_AUDIO_PROCESSING_FAILED",
        "Canonical speech audio could not be produced.",
        { cause: error }
      );
    } finally {
      await fs
        .rm(temporaryDirectory, { recursive: true, force: true })
        .catch(() => undefined);
    }
  }

  private assertIdentifier(value: string, label: string): void {
    if (!safeIdentifier.test(value)) {
      throw new SpeechDomainError(
        "SPEECH_ARTIFACT_PERSISTENCE_FAILED",
        `${label} was not a safe artifact identifier.`
      );
    }
  }

  private resolveArtifact(artifactId: string): string {
    const resolved = path.resolve(this.root, artifactId);
    const relative = path.relative(this.root, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new SpeechDomainError(
        "SPEECH_ARTIFACT_PERSISTENCE_FAILED",
        "Speech artifact path escaped the configured root."
      );
    }
    return resolved;
  }
}
