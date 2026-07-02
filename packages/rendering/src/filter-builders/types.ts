import type { NormalizedCrop } from "@mediaforge/domain";

export class FilterBuilderError extends Error {
  public readonly operationKind: string;
  public readonly field: string;
  public readonly expected: string;

  public constructor(input: {
    readonly operationKind: string;
    readonly field: string;
    readonly expected: string;
  }) {
    super(
      `Invalid ${input.operationKind}.${input.field}: expected ${input.expected}`
    );
    this.name = "FilterBuilderError";
    this.operationKind = input.operationKind;
    this.field = input.field;
    this.expected = input.expected;
  }
}

export type StreamLabel = string;

export interface DimensionsPx {
  readonly width: number;
  readonly height: number;
}

export interface PointPx {
  readonly x: number;
  readonly y: number;
}

export interface NormalizedPoint {
  /** Normalized coordinate in [0, 1]. */
  readonly x: number;
  /** Normalized coordinate in [0, 1]. */
  readonly y: number;
}

export interface CropRectPx extends DimensionsPx, PointPx {}

export type PixelFormat = "yuv420p" | "rgba" | "rgb24" | "yuva420p";

export type XfadeTransition =
  | "fade"
  | "wipeleft"
  | "wiperight"
  | "wipeup"
  | "wipedown"
  | "slideleft"
  | "slideright"
  | "slideup"
  | "slidedown"
  | "circlecrop"
  | "rectcrop"
  | "distance"
  | "fadeblack"
  | "fadewhite"
  | "dissolve";

export interface ScaleExplicitOperation {
  readonly kind: "scale";
  readonly mode: "explicit";
  /** Output width in pixels. */
  readonly widthPx: number;
  /** Output height in pixels. */
  readonly heightPx: number;
  readonly forceEven?: boolean;
}

export interface ScaleAspectOperation {
  readonly kind: "scale";
  readonly mode: "preserve-aspect" | "fit" | "contain" | "fill" | "cover";
  readonly widthPx: number;
  readonly heightPx: number;
  readonly forceEven?: boolean;
}

export type ScaleOperation = ScaleExplicitOperation | ScaleAspectOperation;

export type CropPosition =
  | { readonly mode: "explicit"; readonly xPx: number; readonly yPx: number }
  | { readonly mode: "center" }
  | { readonly mode: "focal"; readonly focal: NormalizedPoint };

export interface CropOperation {
  readonly kind: "crop";
  /** Crop width in pixels after source/normalized crops are resolved. */
  readonly widthPx: number;
  /** Crop height in pixels after source/normalized crops are resolved. */
  readonly heightPx: number;
  readonly position: CropPosition;
  /** Optional input width in pixels for bounds validation. */
  readonly inputWidthPx?: number;
  /** Optional input height in pixels for bounds validation. */
  readonly inputHeightPx?: number;
}

export interface NormalizedCropResolutionInput {
  readonly crop: NormalizedCrop;
  readonly inputWidthPx: number;
  readonly inputHeightPx: number;
}

export interface ZoomPanOperation {
  readonly kind: "zoompan";
  /** Shot duration in seconds. Frame count is round(durationSeconds * fps). */
  readonly durationSeconds: number;
  /** Frames per second. */
  readonly fps: number;
  /** Output width in pixels. */
  readonly outputWidthPx: number;
  /** Output height in pixels. */
  readonly outputHeightPx: number;
  /** Zoom scale factor, where 1 means no zoom. */
  readonly startZoom: number;
  /** Zoom scale factor, where 1 means no zoom. */
  readonly endZoom: number;
  readonly startCenter: NormalizedPoint;
  readonly endCenter: NormalizedPoint;
}

export interface OverlayOperation {
  readonly kind: "overlay";
  /** Overlay x position in pixels. */
  readonly xPx: number;
  /** Overlay y position in pixels. */
  readonly yPx: number;
  /** Optional enable start time in seconds. */
  readonly startSeconds?: number;
  /** Optional enable end time in seconds. */
  readonly endSeconds?: number;
  /** Opacity metadata in [0, 1]; graph composition must apply alpha upstream. */
  readonly opacity?: number;
  /** Local asset path metadata; assets are passed as FFmpeg inputs, not embedded. */
  readonly assetPath?: string;
}

export interface BoxBlurOperation {
  readonly kind: "boxblur";
  readonly radius: number;
  readonly power?: number;
}

export interface EqOperation {
  readonly kind: "eq";
  readonly brightness?: number;
  readonly contrast?: number;
  readonly saturation?: number;
  readonly gamma?: number;
}

export interface NoiseOperation {
  readonly kind: "noise";
  readonly strength: number;
  readonly temporal?: boolean;
}

export interface VignetteOperation {
  readonly kind: "vignette";
  readonly angle?: number;
}

export interface FadeOperation {
  readonly kind: "fade";
  readonly direction: "in" | "out";
  /** Fade start time in seconds. */
  readonly startSeconds: number;
  /** Fade duration in seconds. */
  readonly durationSeconds: number;
  readonly color?: string;
}

export interface DrawTextOperation {
  readonly kind: "drawtext";
  readonly text: string;
  /** Text x position in pixels. */
  readonly xPx: number;
  /** Text y position in pixels. */
  readonly yPx: number;
  /** Font size in pixels. */
  readonly fontSizePx: number;
  readonly fontColor: string;
  readonly fontFile?: string;
  readonly box?: {
    readonly color: string;
    readonly opacity: number;
    readonly borderWidthPx?: number;
  };
  readonly startSeconds?: number;
  readonly endSeconds?: number;
}

export interface CrossFadeOperation {
  readonly kind: "xfade";
  readonly transition: XfadeTransition;
  /** Crossfade duration in seconds. */
  readonly durationSeconds: number;
  /** Crossfade offset in seconds relative to the first input. */
  readonly offsetSeconds: number;
  readonly firstClipDurationSeconds?: number;
}

export type SetPtsOperation =
  | { readonly kind: "setpts"; readonly mode: "reset" }
  | {
      readonly kind: "setpts";
      readonly mode: "offset";
      readonly offsetSeconds: number;
    }
  | { readonly kind: "setpts"; readonly mode: "scale"; readonly factor: number };

export interface RotateOperation {
  readonly kind: "rotate";
  /** Rotation angle in degrees. */
  readonly angleDegrees: number;
  readonly expandOutput?: boolean;
  readonly fillColor?: string;
  readonly startSeconds?: number;
  readonly endSeconds?: number;
}

export interface FormatOperation {
  readonly kind: "format";
  readonly pixelFormat: PixelFormat;
}

export interface PadOperation {
  readonly kind: "pad";
  /** Output width in pixels. */
  readonly widthPx: number;
  /** Output height in pixels. */
  readonly heightPx: number;
  readonly x: "center" | number;
  readonly y: "center" | number;
  readonly color?: string;
}

export type VideoFilterOperation =
  | ScaleOperation
  | CropOperation
  | ZoomPanOperation
  | OverlayOperation
  | BoxBlurOperation
  | EqOperation
  | NoiseOperation
  | VignetteOperation
  | FadeOperation
  | DrawTextOperation
  | CrossFadeOperation
  | SetPtsOperation
  | RotateOperation
  | FormatOperation
  | PadOperation;

export interface FilterGraphNode {
  readonly inputLabels: readonly StreamLabel[];
  readonly operation: VideoFilterOperation;
  readonly outputLabel: StreamLabel;
}

export interface FilterGraph {
  readonly inputLabels: readonly StreamLabel[];
  readonly nodes: readonly FilterGraphNode[];
  readonly outputLabels?: readonly StreamLabel[];
}
