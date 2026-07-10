import { readFileSync } from "node:fs";
import path from "node:path";
import type { VideoVariant } from "@mediaforge/domain";
import {
  type MediaDimensionSpec,
  resolveMediaProfileSpec,
} from "./video-image-spec.js";

type ImageGenerationEnv = Readonly<Record<string, string | undefined>>;

export interface ResolvedMediaDimensionSpec extends MediaDimensionSpec {
  readonly source:
    | "default"
    | "OPENAI_IMAGE_FULL_SIZE"
    | "YOUTUBE_FULL_IMAGE_SIZE"
    | "OPENAI_IMAGE_SIZE"
    | "OPENAI_IMAGE_SHORT_SIZE"
    | "YOUTUBE_SHORT_IMAGE_SIZE"
    | "SHORTS_OPENAI_IMAGE_SIZE"
    | "SHORTS_PORTRAIT_WIDTH/SHORTS_PORTRAIT_HEIGHT"
    | "YOUTUBE_FULL_RENDER_SIZE"
    | "YOUTUBE_SHORT_RENDER_SIZE"
    | "SHORTS_FINAL_WIDTH/SHORTS_FINAL_HEIGHT";
}

function parseDotEnv(text: string): Record<string, string> {
  const entries: Record<string, string> = {};

  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    const quoted =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue;
    entries[key] = quoted.replace(/\\n/gu, "\n");
  }

  return entries;
}

export function mergeImageGenerationEnv(
  env: ImageGenerationEnv = process.env,
  cwd: string = process.cwd()
): Record<string, string | undefined> {
  const dotenvPath = path.join(cwd, ".env");
  let dotenvValues: Record<string, string> = {};

  try {
    dotenvValues = parseDotEnv(readFileSync(dotenvPath, "utf8"));
  } catch {
    dotenvValues = {};
  }

  return {
    ...dotenvValues,
    ...env,
    ...(dotenvValues["OPENAI_API_KEY"] !== undefined
      ? { OPENAI_API_KEY: dotenvValues["OPENAI_API_KEY"] }
      : {}),
  };
}

function isExpectedAspectRatio(args: {
  readonly width: number;
  readonly height: number;
  readonly aspectRatio: "16:9" | "9:16";
}): boolean {
  return args.aspectRatio === "16:9"
    ? args.width * 9 === args.height * 16
    : args.width * 16 === args.height * 9;
}

function parseConfiguredSize(args: {
  readonly value: string;
  readonly envVarName: string;
  readonly profile: VideoVariant;
  readonly expectedAspectRatio: "16:9" | "9:16";
}): MediaDimensionSpec {
  const normalized = args.value.trim();
  const match = /^(\d+)x(\d+)$/u.exec(normalized);

  if (!match) {
    throw new Error(
      `Invalid ${args.envVarName} value "${args.value}" for ${args.profile} image generation. Expected WIDTHxHEIGHT with ${args.expectedAspectRatio} aspect ratio.`
    );
  }

  const width = Number.parseInt(match[1] ?? "", 10);
  const height = Number.parseInt(match[2] ?? "", 10);

  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(
      `Invalid ${args.envVarName} value "${args.value}" for ${args.profile} image generation. Expected positive WIDTHxHEIGHT with ${args.expectedAspectRatio} aspect ratio.`
    );
  }

  if (
    !isExpectedAspectRatio({
      width,
      height,
      aspectRatio: args.expectedAspectRatio,
    })
  ) {
    throw new Error(
      `Invalid ${args.envVarName} value "${args.value}" for ${args.profile} image generation. Expected ${args.expectedAspectRatio} aspect ratio for the ${args.profile} profile.`
    );
  }

  return {
    width,
    height,
    aspectRatio: args.expectedAspectRatio,
    size: `${width}x${height}`,
  };
}

function parseLegacyWidthHeightPair(args: {
  readonly env: ImageGenerationEnv;
  readonly widthVarName: string;
  readonly heightVarName: string;
  readonly profile: VideoVariant;
  readonly expectedAspectRatio: "16:9" | "9:16";
  readonly purpose: "image generation" | "render";
}): MediaDimensionSpec | undefined {
  const widthText = args.env[args.widthVarName];
  const heightText = args.env[args.heightVarName];

  if (widthText === undefined && heightText === undefined) {
    return undefined;
  }

  if (widthText === undefined || heightText === undefined) {
    throw new Error(
      `Invalid ${args.widthVarName}/${args.heightVarName} configuration for ${args.profile} ${args.purpose}. Both variables must be set together.`
    );
  }

  return parseConfiguredSize({
    value: `${widthText}x${heightText}`,
    envVarName: `${args.widthVarName}/${args.heightVarName}`,
    profile: args.profile,
    expectedAspectRatio: args.expectedAspectRatio,
  });
}

export function resolveConfiguredImageGenerationSize(args: {
  readonly profile: VideoVariant;
  readonly env?: ImageGenerationEnv;
}): ResolvedMediaDimensionSpec {
  const mergedEnv = args.env ?? mergeImageGenerationEnv();
  const defaults = resolveMediaProfileSpec(args.profile);
  const expectedAspectRatio = defaults.aspectRatio;

  if (args.profile === "full") {
    for (const envVarName of [
      "OPENAI_IMAGE_FULL_SIZE",
      "YOUTUBE_FULL_IMAGE_SIZE",
      "OPENAI_IMAGE_SIZE",
    ] as const) {
      const value = mergedEnv[envVarName];
      if (!value) {
        continue;
      }
      return {
        ...parseConfiguredSize({
          value,
          envVarName,
          profile: "full",
          expectedAspectRatio,
        }),
        source: envVarName,
      };
    }
    return {
      ...defaults.imageGenerationSize,
      source: "default",
    };
  }

  for (const envVarName of [
    "OPENAI_IMAGE_SHORT_SIZE",
    "YOUTUBE_SHORT_IMAGE_SIZE",
    "SHORTS_OPENAI_IMAGE_SIZE",
  ] as const) {
    const value = mergedEnv[envVarName];
    if (!value) {
      continue;
    }
    return {
      ...parseConfiguredSize({
        value,
        envVarName,
        profile: "short",
        expectedAspectRatio,
      }),
      source: envVarName,
    };
  }

  const legacyShortPortrait = parseLegacyWidthHeightPair({
    env: mergedEnv,
    widthVarName: "SHORTS_PORTRAIT_WIDTH",
    heightVarName: "SHORTS_PORTRAIT_HEIGHT",
    profile: "short",
    expectedAspectRatio,
    purpose: "image generation",
  });

  if (legacyShortPortrait) {
    return {
      ...legacyShortPortrait,
      source: "SHORTS_PORTRAIT_WIDTH/SHORTS_PORTRAIT_HEIGHT",
    };
  }

  return {
    ...defaults.imageGenerationSize,
    source: "default",
  };
}

export function resolveConfiguredRenderSize(args: {
  readonly profile: VideoVariant;
  readonly env?: ImageGenerationEnv;
}): ResolvedMediaDimensionSpec {
  const mergedEnv = args.env ?? mergeImageGenerationEnv();
  const defaults = resolveMediaProfileSpec(args.profile);
  const expectedAspectRatio = defaults.aspectRatio;

  if (args.profile === "full") {
    const configured = mergedEnv["YOUTUBE_FULL_RENDER_SIZE"];
    if (!configured) {
      return {
        ...defaults.renderSize,
        source: "default",
      };
    }
    return {
      ...parseConfiguredSize({
        value: configured,
        envVarName: "YOUTUBE_FULL_RENDER_SIZE",
        profile: "full",
        expectedAspectRatio,
      }),
      source: "YOUTUBE_FULL_RENDER_SIZE",
    };
  }

  const configured = mergedEnv["YOUTUBE_SHORT_RENDER_SIZE"];
  if (configured) {
    return {
      ...parseConfiguredSize({
        value: configured,
        envVarName: "YOUTUBE_SHORT_RENDER_SIZE",
        profile: "short",
        expectedAspectRatio,
      }),
      source: "YOUTUBE_SHORT_RENDER_SIZE",
    };
  }

  const legacyShortRender = parseLegacyWidthHeightPair({
    env: mergedEnv,
    widthVarName: "SHORTS_FINAL_WIDTH",
    heightVarName: "SHORTS_FINAL_HEIGHT",
    profile: "short",
    expectedAspectRatio,
    purpose: "render",
  });

  if (legacyShortRender) {
    return {
      ...legacyShortRender,
      source: "SHORTS_FINAL_WIDTH/SHORTS_FINAL_HEIGHT",
    };
  }

  return {
    ...defaults.renderSize,
    source: "default",
  };
}

export function buildIgnoredShortFullSizeWarning(
  env: ImageGenerationEnv
): string | undefined {
  const fullFallback = env["OPENAI_IMAGE_SIZE"];
  if (!fullFallback) {
    return undefined;
  }

  if (
    env["OPENAI_IMAGE_SHORT_SIZE"] ||
    env["YOUTUBE_SHORT_IMAGE_SIZE"] ||
    env["SHORTS_OPENAI_IMAGE_SIZE"] ||
    (env["SHORTS_PORTRAIT_WIDTH"] && env["SHORTS_PORTRAIT_HEIGHT"])
  ) {
    return undefined;
  }

  return [
    `Ignoring OPENAI_IMAGE_SIZE=${fullFallback} for short image generation.`,
    "Configure OPENAI_IMAGE_SHORT_SIZE or YOUTUBE_SHORT_IMAGE_SIZE for the short profile.",
  ].join(" ");
}
