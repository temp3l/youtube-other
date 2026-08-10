import sharp from "sharp";

export const TECHNICAL_PIXEL_QA_VERSION = "technical-pixel-qa.v1" as const;

export type TechnicalPixelQaGenre = "history" | "dark-truth" | "veronica";
export type TechnicalPixelQaSeverity = "warning" | "blocking";

export interface TechnicalPixelQaFinding {
  readonly code:
    | "IMAGE_UNREADABLE"
    | "IMAGE_DIMENSIONS_UNEXPECTED"
    | "IMAGE_EMPTY_OR_UNIFORM"
    | "IMAGE_ALPHA_FAILURE";
  readonly severity: TechnicalPixelQaSeverity;
  readonly message: string;
}

export interface TechnicalPixelQaResult {
  readonly schemaVersion: typeof TECHNICAL_PIXEL_QA_VERSION;
  readonly width: number | null;
  readonly height: number | null;
  readonly findings: readonly TechnicalPixelQaFinding[];
  readonly passed: boolean;
}

export interface TechnicalPixelQaPolicy {
  readonly genre: TechnicalPixelQaGenre;
  readonly invalidImageSeverity: TechnicalPixelQaSeverity;
  readonly dimensionSeverity: TechnicalPixelQaSeverity;
  readonly uniformImageSeverity: TechnicalPixelQaSeverity;
}

export function resolveTechnicalPixelQaPolicy(
  genre: TechnicalPixelQaGenre,
): TechnicalPixelQaPolicy {
  return {
    genre,
    invalidImageSeverity: "blocking",
    dimensionSeverity: genre === "veronica" ? "warning" : "blocking",
    uniformImageSeverity: genre === "veronica" ? "warning" : "blocking",
  };
}

export async function inspectTechnicalImagePixels(input: {
  readonly imagePath: string;
  readonly expectedAspectRatio?: "16:9" | "9:16";
  readonly policy: TechnicalPixelQaPolicy;
}): Promise<TechnicalPixelQaResult> {
  const findings: TechnicalPixelQaFinding[] = [];
  try {
    const image = sharp(input.imagePath, { failOn: "error" });
    const [metadata, stats] = await Promise.all([image.metadata(), image.stats()]);
    const width = metadata.width ?? null;
    const height = metadata.height ?? null;
    if (!width || !height) {
      findings.push({
        code: "IMAGE_UNREADABLE",
        severity: input.policy.invalidImageSeverity,
        message: "Image metadata has no usable raster dimensions.",
      });
    } else if (input.expectedAspectRatio) {
      const expected = input.expectedAspectRatio === "16:9" ? 16 / 9 : 9 / 16;
      const actual = width / height;
      if (Math.abs(actual - expected) > 0.035) {
        findings.push({
          code: "IMAGE_DIMENSIONS_UNEXPECTED",
          severity: input.policy.dimensionSeverity,
          message: `Expected ${input.expectedAspectRatio}, received ${width}x${height}.`,
        });
      }
    }
    const channels = stats.channels;
    const variation = channels.reduce((total, channel) => total + channel.stdev, 0);
    if (channels.length > 0 && variation < 0.5) {
      findings.push({
        code: "IMAGE_EMPTY_OR_UNIFORM",
        severity: input.policy.uniformImageSeverity,
        message: "Image pixels are unexpectedly uniform or near-empty.",
      });
    }
    const alpha = metadata.hasAlpha ? channels.at(-1) : undefined;
    if (alpha?.min === 0 && alpha.max === 0) {
      findings.push({
        code: "IMAGE_ALPHA_FAILURE",
        severity: input.policy.invalidImageSeverity,
        message: "Image is fully transparent and cannot be rendered.",
      });
    }
    return {
      schemaVersion: TECHNICAL_PIXEL_QA_VERSION,
      width,
      height,
      findings,
      passed: !findings.some((finding) => finding.severity === "blocking"),
    };
  } catch {
    return {
      schemaVersion: TECHNICAL_PIXEL_QA_VERSION,
      width: null,
      height: null,
      findings: [
        {
          code: "IMAGE_UNREADABLE",
          severity: input.policy.invalidImageSeverity,
          message: "Image bytes are corrupt or unsupported.",
        },
      ],
      passed: false,
    };
  }
}
