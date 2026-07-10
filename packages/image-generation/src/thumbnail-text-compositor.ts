import sharp from "sharp";
import { normalizeWhitespace } from "@mediaforge/shared";
import {
  type GenerateThumbnailInput,
  type ThumbnailFormat,
  type ThumbnailStyle,
  THUMBNAIL_OUTPUTS,
  THUMBNAIL_TEXT_LAYOUT_VERSION,
  ThumbnailCompositionError,
} from "./thumbnail-contracts.js";

export const THUMBNAIL_FONT_FAMILY =
  "Impact, Arial Narrow, DejaVu Sans Condensed, Liberation Sans Narrow, sans-serif";

type WrappedTypographyLayout = {
  readonly lines: readonly string[];
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly availableWidth: number;
  readonly textBoxHeight: number;
  readonly maxLines: number;
  readonly wordGap: number;
  readonly strokeWidth: number;
  readonly shadowDx: number;
  readonly shadowDy: number;
  readonly shadowStdDeviation: number;
};

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function estimateWordWidth(word: string, fontSize: number): number {
  return [...word].reduce((total, character) => {
    if (/^[MW]$/u.test(character)) {
      return total + fontSize * 0.82;
    }
    if (/^[IJ1]$/u.test(character)) {
      return total + fontSize * 0.34;
    }
    return total + fontSize * 0.58;
  }, 0);
}

function estimateLineWidth(line: string, fontSize: number): number {
  return line
    .split(" ")
    .reduce((total, word, index) => {
      const space = index === 0 ? 0 : fontSize * 0.32;
      return total + space + estimateWordWidth(word, fontSize);
    }, 0);
}

function styleConfig(args: {
  readonly format: ThumbnailFormat;
  readonly style: ThumbnailStyle | undefined;
}): {
  readonly marginX: number;
  readonly marginY: number;
  readonly availableWidth: number;
  readonly availableHeight: number;
  readonly maxLines: number;
  readonly minLines: number;
  readonly startFontSize: number;
  readonly minFontSize: number;
  readonly lineHeightRatio: number;
  readonly wordGapRatio: number;
  readonly strokeRatio: number;
  readonly shadowDxRatio: number;
  readonly shadowDyRatio: number;
  readonly shadowStdDeviationRatio: number;
} {
  const output = THUMBNAIL_OUTPUTS[args.format];
  const viral = args.style === "viral-horror-v1";
  if (args.format === "full") {
    return {
      marginX: Math.round(output.width * (viral ? 0.05 : 0.065)),
      marginY: Math.round(output.height * (viral ? 0.075 : 0.08)),
      availableWidth: Math.round(output.width * (viral ? 0.48 : 0.38)),
      availableHeight: Math.round(output.height * (viral ? 0.72 : 0.64)),
      maxLines: viral ? 4 : 4,
      minLines: 2,
      startFontSize: viral ? 186 : 148,
      minFontSize: 52,
      lineHeightRatio: viral ? 0.9 : 0.94,
      wordGapRatio: viral ? 0.34 : 0.32,
      strokeRatio: viral ? 0.12 : 0.085,
      shadowDxRatio: viral ? 0.045 : 0,
      shadowDyRatio: viral ? 0.075 : 0.055,
      shadowStdDeviationRatio: viral ? 0.05 : 0.055,
    };
  }
  return {
    marginX: Math.round(output.width * (viral ? 0.055 : 0.065)),
    marginY: Math.round(output.height * (viral ? 0.075 : 0.08)),
    availableWidth: Math.round(output.width * (viral ? 0.78 : 0.56)),
    availableHeight: Math.round(output.height * (viral ? 0.42 : 0.38)),
    maxLines: viral ? 4 : 5,
    minLines: 2,
    startFontSize: viral ? 156 : 122,
    minFontSize: 52,
    lineHeightRatio: viral ? 0.9 : 0.94,
    wordGapRatio: viral ? 0.34 : 0.32,
    strokeRatio: viral ? 0.12 : 0.085,
    shadowDxRatio: viral ? 0.045 : 0,
    shadowDyRatio: viral ? 0.075 : 0.055,
    shadowStdDeviationRatio: viral ? 0.05 : 0.055,
  };
}

function wrapTypography(args: {
  readonly hookText: string;
  readonly format: ThumbnailFormat;
  readonly style?: ThumbnailStyle | undefined;
}): WrappedTypographyLayout {
  const config = styleConfig({
    format: args.format,
    style: args.style,
  });
  const words = normalizeWhitespace(args.hookText)
    .split(" ")
    .filter((word) => word.length > 0);
  for (
    let fontSize = config.startFontSize;
    fontSize >= config.minFontSize;
    fontSize -= 4
  ) {
    const lines: string[] = [];
    let overflowed = false;
    for (const word of words) {
      const candidate =
        lines.length === 0 ? word : `${lines[lines.length - 1]} ${word}`;
      if (
        lines.length > 0 &&
        estimateLineWidth(candidate, fontSize) <= config.availableWidth
      ) {
        lines[lines.length - 1] = candidate;
        continue;
      }
      if (estimateWordWidth(word, fontSize) > config.availableWidth) {
        overflowed = true;
        break;
      }
      lines.push(word);
      if (lines.length > config.maxLines) {
        overflowed = true;
        break;
      }
    }
    if (overflowed || lines.length < config.minLines) {
      continue;
    }
    const lineHeight = Math.round(fontSize * config.lineHeightRatio);
    const textBoxHeight = lines.length * lineHeight;
    if (textBoxHeight > config.availableHeight) {
      continue;
    }
    return {
      lines,
      fontSize,
      lineHeight,
      anchorX: config.marginX,
      anchorY: config.marginY + fontSize,
      availableWidth: config.availableWidth,
      textBoxHeight,
      maxLines: config.maxLines,
      wordGap: Math.round(fontSize * config.wordGapRatio),
      strokeWidth: Math.max(8, Math.round(fontSize * config.strokeRatio)),
      shadowDx: Math.round(fontSize * config.shadowDxRatio),
      shadowDy: Math.round(fontSize * config.shadowDyRatio),
      shadowStdDeviation: Math.round(
        fontSize * config.shadowStdDeviationRatio
      ),
    };
  }
  throw new ThumbnailCompositionError(
    `Hook text cannot fit safely inside the ${args.format} thumbnail.`
  );
}

function buildTypographySvg(args: {
  readonly format: ThumbnailFormat;
  readonly hookText: string;
  readonly emphasisWord: string;
  readonly locale: string;
  readonly style: GenerateThumbnailInput["style"];
}): Buffer {
  const output = THUMBNAIL_OUTPUTS[args.format];
  const layout = wrapTypography({
    hookText: args.hookText.toLocaleUpperCase(args.locale),
    format: args.format,
    style: args.style,
  });
  const emphasis = args.emphasisWord.toLocaleUpperCase(args.locale);
  const viral = args.style === "viral-horror-v1";
  const textSvg = layout.lines
    .map((line, index) => {
      const y = layout.anchorY + index * layout.lineHeight;
      let x = layout.anchorX;
      return line.split(" ").map((word) => {
        const width = estimateWordWidth(word, layout.fontSize);
        const fill = word === emphasis ? "#8f000b" : "#f5f5f3";
        const wordSvg = `<text x="${x}" y="${y}" font-size="${layout.fontSize}" font-family="${escapeXml(
          THUMBNAIL_FONT_FAMILY
        )}" font-weight="900" letter-spacing="0" paint-order="stroke" stroke="#050505" stroke-width="${
          layout.strokeWidth
        }" stroke-linejoin="round" fill="${fill}">${escapeXml(word)}</text>`;
        x += Math.ceil(width + layout.wordGap);
        return wordSvg;
      });
    })
    .flat()
    .join("");
  const accent =
    args.format === "full"
      ? `<rect x="0" y="0" width="${Math.round(output.width * 0.02)}" height="${output.height}" fill="#7d000b" opacity="${viral ? "0.95" : "0"}"/>`
      : `<rect x="0" y="0" width="${output.width}" height="${Math.round(output.height * 0.018)}" fill="#7d000b" opacity="${viral ? "0.95" : "0"}"/>`;
  const gradient =
    args.format === "full"
      ? `<linearGradient id="shade" x1="0%" y1="0%" x2="100%" y2="0%">
  <stop offset="0%" stop-color="rgba(0,0,0,${viral ? "0.84" : "0.72"})"/>
  <stop offset="${viral ? "68%" : "60%"}" stop-color="rgba(0,0,0,${viral ? "0.34" : "0.25"})"/>
  <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
</linearGradient>
<rect x="0" y="0" width="${Math.round(output.width * (viral ? 0.62 : 0.54))}" height="${output.height}" fill="url(#shade)"/>`
      : `<linearGradient id="shade" x1="0%" y1="0%" x2="0%" y2="100%">
  <stop offset="0%" stop-color="rgba(0,0,0,${viral ? "0.78" : "0.62"})"/>
  <stop offset="${viral ? "72%" : "68%"}" stop-color="rgba(0,0,0,${viral ? "0.26" : "0.18"})"/>
  <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
</linearGradient>
<rect x="0" y="0" width="${Math.round(output.width * (viral ? 0.9 : 0.64))}" height="${Math.round(
          output.height * (viral ? 0.5 : 0.56)
        )}" fill="url(#shade)"/>`;
  const distressOpacity = viral ? "0.38" : "0.25";
  const svg = `<svg width="${output.width}" height="${output.height}" viewBox="0 0 ${output.width} ${output.height}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <filter id="shadow">
    <feDropShadow dx="${layout.shadowDx}" dy="${layout.shadowDy}" stdDeviation="${layout.shadowStdDeviation}" flood-color="#000000" flood-opacity="${viral ? "0.88" : "0.68"}"/>
  </filter>
  <filter id="distress">
    <feTurbulence type="fractalNoise" baseFrequency="${viral ? "0.95" : "0.8"}" numOctaves="1" seed="13" result="noise"/>
    <feColorMatrix in="noise" type="saturate" values="0"/>
    <feComponentTransfer>
      <feFuncA type="table" tableValues="0 0 0.12 ${viral ? "0.28" : "0.18"}"/>
    </feComponentTransfer>
  </filter>
  <mask id="texture">
    <rect x="0" y="0" width="${output.width}" height="${output.height}" fill="white"/>
    <rect x="0" y="0" width="${output.width}" height="${output.height}" filter="url(#distress)" opacity="${distressOpacity}"/>
  </mask>
</defs>
${gradient}
${accent}
<g filter="url(#shadow)" mask="url(#texture)">${textSvg}</g>
</svg>`;
  return Buffer.from(svg, "utf8");
}

export async function normalizeThumbnailBackground(args: {
  readonly imageBuffer: Buffer;
  readonly format: ThumbnailFormat;
}): Promise<Buffer> {
  const output = THUMBNAIL_OUTPUTS[args.format];
  const resized = await sharp(args.imageBuffer)
    .resize({
      width: output.width,
      height: output.height,
      fit: "cover",
      position: sharp.strategy.attention,
    })
    .png()
    .toBuffer();
  const metadata = await sharp(resized).metadata();
  if (metadata.width !== output.width || metadata.height !== output.height) {
    throw new ThumbnailCompositionError(
      `Normalized background dimensions ${metadata.width ?? "unknown"}x${metadata.height ?? "unknown"} do not match ${output.width}x${output.height}.`
    );
  }
  return resized;
}

export async function compositeThumbnailText(args: {
  readonly background: Buffer;
  readonly input: Pick<
    GenerateThumbnailInput,
    "format" | "locale" | "hookText" | "style"
  >;
  readonly emphasisWord: string;
}): Promise<Buffer> {
  const output = THUMBNAIL_OUTPUTS[args.input.format];
  const overlay = buildTypographySvg({
    format: args.input.format,
    hookText: normalizeWhitespace(args.input.hookText),
    emphasisWord: args.emphasisWord,
    locale: args.input.locale,
    style: args.input.style,
  });
  const composited = await sharp(args.background)
    .composite([{ input: overlay, left: 0, top: 0 }])
    .png()
    .toBuffer();
  const metadata = await sharp(composited).metadata();
  if (metadata.width !== output.width || metadata.height !== output.height) {
    throw new ThumbnailCompositionError(
      `Final thumbnail dimensions ${metadata.width ?? "unknown"}x${metadata.height ?? "unknown"} do not match ${output.width}x${output.height}.`
    );
  }
  return composited;
}

export {
  buildTypographySvg,
  wrapTypography,
  THUMBNAIL_TEXT_LAYOUT_VERSION,
};
