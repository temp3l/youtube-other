export type RendererErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_VISUAL_PLAN"
  | "INVALID_RENDER_PROFILE"
  | "UNSUPPORTED_SCENE_TYPE"
  | "INVALID_FORMULA"
  | "MISSING_ASSET"
  | "MISSING_FONT"
  | "MISSING_TOOL"
  | "UNSUPPORTED_CAPABILITY"
  | "SCENE_RENDER_FAILED"
  | "FFMPEG_FAILED"
  | "FFPROBE_FAILED"
  | "OUTPUT_VALIDATION_FAILED"
  | "CACHE_CORRUPTED"
  | "INSUFFICIENT_DISK_SPACE"
  | "PROCESS_TIMEOUT"
  | "PROCESS_INTERRUPTED"
  | "FILESYSTEM_BOUNDARY_VIOLATION"
  | "LOCK_ACQUISITION_FAILED"
  | "INTERNAL_ERROR";

export interface RendererErrorData {
  readonly code: RendererErrorCode;
  readonly message: string;
  readonly sceneId?: string;
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
}

export class RendererError extends Error {
  public readonly data: RendererErrorData;
  public constructor(data: RendererErrorData, options?: ErrorOptions) {
    super(data.message, options);
    this.name = "RendererError";
    this.data = data;
  }
}

export function toRendererErrorData(error: unknown): RendererErrorData {
  if (error instanceof RendererError) return error.data;
  if (error instanceof Error) return { code: "INTERNAL_ERROR", message: error.message };
  return { code: "INTERNAL_ERROR", message: "An unknown renderer failure occurred." };
}
