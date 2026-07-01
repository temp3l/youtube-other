import sharp from "sharp";
import { normalizeWhitespace } from "@mediaforge/shared";
import {
  type GenerateThumbnailInput,
  type ThumbnailFormat,
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
      const space = index === 0 ? 0 : fontSize * 0.28;
      return total + space + estimateWordWidth(word, fontSize);
    }, 0);
}

function wrapTypography(args: {
  readonly hookText: string;
  readonly format: ThumbnailFormat;
}): WrappedTypographyLayout {
  const output = THUMBNAIL_OUTPUTS[args.format];
  const words = normalizeWhitespace(args.hookText)
    .split(" ")
    .filter((word) => word.length > 0);
  const marginX = Math.round(output.width * 0.065);
  const marginY = Math.round(output.height * 0.08);
  const availableWidth =
    args.format === "full"
      ? Math.round(output.width * 0.38)
      : Math.round(output.width * 0.56);
  const availableHeight =
    args.format === "full"
      ? Math.round(output.height * 0.64)
      : Math.round(output.height * 0.38);
  const maxLines = args.format === "full" ? 4 : 5;
  const minLines = args.format === "full" ? 2 : 2;
  for (let fontSize = args.format === "full" ? 148 : 122; fontSize >= 52; fontSize -= 4) {
    const lines: string[] = [];
    let overflowed = false;
    for (const word of words) {
      const candidate =
        lines.length === 0 ? word : `${lines[lines.length - 1]} ${word}`;
      if (
        lines.length > 0 &&
        estimateLineWidth(candidate, fontSize) <= availableWidth
      ) {
        lines[lines.length - 1] = candidate;
        continue;
      }
      if (estimateWordWidth(word, fontSize) > availableWidth) {
        overflowed = true;
        break;
      }
      lines.push(word);
      if (lines.length > maxLines) {
        overflowed = true;
        break;
      }
    }
    if (overflowed || lines.length < minLines) {
      continue;
    }
    const lineHeight = Math.round(fontSize * 0.94);
    const textBoxHeight = lines.length * lineHeight;
    if (textBoxHeight > availableHeight) {
      continue;
    }
    return {
      lines,
      fontSize,
      lineHeight,
      anchorX: marginX,
      anchorY: marginY + fontSize,
      availableWidth,
      textBoxHeight,
      maxLines,
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
  });
  const emphasis = args.emphasisWord.toLocaleUpperCase(args.locale);
  const textSvg = layout.lines
    .map((line, index) => {
      const y = layout.anchorY + index * layout.lineHeight;
      const parts = line.split(" ").map((word) => {
        const fill = word === emphasis ? "#9f1018" : "#f5f5f3";
        return `<tspan fill="${fill}">${escapeXml(word)}</tspan>`;
      });
      return `<text x="${layout.anchorX}" y="${y}" font-size="${layout.fontSize}" font-family="${escapeXml(
        THUMBNAIL_FONT_FAMILY
      )}" font-weight="900" letter-spacing="-1.5" paint-order="stroke" stroke="#060606" stroke-width="${Math.max(
        6,
        Math.round(layout.fontSize * 0.085)
      )}" stroke-linejoin="round">${parts.join(
        '<tspan fill="#f5f5f3"> </tspan>'
      )}</text>`;
    })
    .join("");
  const gradient =
    args.format === "full"
      ? `<linearGradient id="shade" x1="0%" y1="0%" x2="100%" y2="0%">
  <stop offset="0%" stop-color="rgba(0,0,0,0.72)"/>
  <stop offset="60%" stop-color="rgba(0,0,0,0.25)"/>
  <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
</linearGradient>
<rect x="0" y="0" width="${Math.round(output.width * 0.54)}" height="${output.height}" fill="url(#shade)"/>`
      : `<linearGradient id="shade" x1="0%" y1="0%" x2="0%" y2="100%">
  <stop offset="0%" stop-color="rgba(0,0,0,0.62)"/>
  <stop offset="68%" stop-color="rgba(0,0,0,0.18)"/>
  <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
</linearGradient>
<rect x="0" y="0" width="${Math.round(output.width * 0.64)}" height="${Math.round(
          output.height * 0.56
        )}" fill="url(#shade)"/>`;
  const svg = `<svg width="${output.width}" height="${output.height}" viewBox="0 0 ${output.width} ${output.height}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <filter id="shadow">
    <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#000000" flood-opacity="0.68"/>
  </filter>
  <filter id="distress">
    <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" seed="13" result="noise"/>
    <feColorMatrix in="noise" type="saturate" values="0"/>
    <feComponentTransfer>
      <feFuncA type="table" tableValues="0 0 0.1 0.18"/>
    </feComponentTransfer>
  </filter>
  <mask id="texture">
    <rect x="0" y="0" width="${output.width}" height="${output.height}" fill="white"/>
    <rect x="0" y="0" width="${output.width}" height="${output.height}" filter="url(#distress)" opacity="0.25"/>
  </mask>
</defs>
${gradient}
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
