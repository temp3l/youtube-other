export class TranscriptPipelineError extends Error {
  public readonly retryable: boolean;

  public constructor(
    message: string,
    public readonly code: string,
    retryable: boolean,
    options: { readonly cause?: unknown; readonly episodeSlug?: string; readonly correlationId?: string } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = "TranscriptPipelineError";
    this.retryable = retryable;
    if (options.episodeSlug) {
      (this as Record<string, unknown>)["episodeSlug"] = options.episodeSlug;
    }
    if (options.correlationId) {
      (this as Record<string, unknown>)["correlationId"] = options.correlationId;
    }
  }
}

function createTranscriptErrorClass(name: string, code: string, retryable: boolean) {
  return class extends TranscriptPipelineError {
    public constructor(
      message: string,
      options: { readonly cause?: unknown; readonly episodeSlug?: string; readonly correlationId?: string } = {}
    ) {
      super(message, code, retryable, options);
      this.name = name;
    }
  };
}

export const MissingAudioFileError = createTranscriptErrorClass("MissingAudioFileError", "MISSING_AUDIO_FILE", false);
export const WhisperBinaryNotFoundError = createTranscriptErrorClass("WhisperBinaryNotFoundError", "WHISPER_BINARY_NOT_FOUND", false);
export const UnsupportedWhisperOptionError = createTranscriptErrorClass("UnsupportedWhisperOptionError", "UNSUPPORTED_WHISPER_OPTION", false);
export const WhisperProcessFailureError = createTranscriptErrorClass("WhisperProcessFailureError", "WHISPER_PROCESS_FAILURE", true);
export const WhisperTimeoutError = createTranscriptErrorClass("WhisperTimeoutError", "WHISPER_TIMEOUT", true);
export const MissingWordTimestampsError = createTranscriptErrorClass("MissingWordTimestampsError", "MISSING_WORD_TIMESTAMPS", false);
export const InvalidRawTranscriptError = createTranscriptErrorClass("InvalidRawTranscriptError", "INVALID_RAW_TRANSCRIPT", false);
export const InvalidTimedWordError = createTranscriptErrorClass("InvalidTimedWordError", "INVALID_TIMED_WORD", false);
export const InvalidTimestampRangeError = createTranscriptErrorClass("InvalidTimestampRangeError", "INVALID_TIMESTAMP_RANGE", false);
export const ChronologicalOrderingError = createTranscriptErrorClass("ChronologicalOrderingError", "CHRONOLOGICAL_ORDERING_FAILURE", false);
export const PathologicalWordTimingError = createTranscriptErrorClass("PathologicalWordTimingError", "PATHOLOGICAL_WORD_TIMING", false);
export const UnsafeEpisodePathError = createTranscriptErrorClass("UnsafeEpisodePathError", "UNSAFE_EPISODE_PATH", false);
export const TranscriptNormalizationError = createTranscriptErrorClass("TranscriptNormalizationError", "TRANSCRIPT_NORMALIZATION_FAILURE", false);
export const AtomicWriteError = createTranscriptErrorClass("AtomicWriteError", "ATOMIC_WRITE_FAILURE", true);
