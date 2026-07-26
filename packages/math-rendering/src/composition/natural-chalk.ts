import { centerlineGlyphDefinition } from "./centerline-chalk-font.js";

export const MATH_NATURAL_CHALK_VERSION = "guided-natural-chalk.v3" as const;

export type ChalkColourToken =
  | "primary"
  | "emphasis"
  | "warning"
  | "construction";

export type ChalkPrecisionMode =
  | "freehand"
  | "guided"
  | "ruler"
  | "mathematical";

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface VectorPath {
  readonly points: readonly Point[];
  readonly closed: boolean;
}

export interface PressurePoint {
  readonly offset: number;
  readonly pressure: number;
}

export interface SpeedPoint {
  readonly offset: number;
  readonly speed: number;
}

export interface ChalkStroke {
  readonly id: string;
  readonly path: VectorPath;
  readonly order: number;
  readonly length: number;
  readonly baseWidth: number;
  readonly colourToken: ChalkColourToken;
  readonly pressureProfile: readonly PressurePoint[];
  readonly speedProfile: readonly SpeedPoint[];
  readonly seed: number;
}

export interface ChalkGlyph {
  readonly grapheme: string;
  readonly variant: string;
  readonly advanceWidth: number;
  readonly strokes: readonly ChalkStroke[];
}

const frequentlyRepeated = new Set(Array.from("0123456789aeinrst+-=×÷<>%()[]"));

function stableSeed(value: string): number {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function unit(seed: number, salt: number): number {
  let value = (seed + Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return value / 0xffff_ffff;
}

export function segmentChalkGraphemes(text: string, locale = "de"): string[] {
  return [
    ...new Intl.Segmenter(locale, { granularity: "grapheme" }).segment(text),
  ].map((part) => part.segment);
}

export function selectChalkGlyphVariant(args: {
  readonly grapheme: string;
  readonly occurrence: number;
  readonly seed: string;
}): string {
  const variants = frequentlyRepeated.has(args.grapheme.toLocaleLowerCase())
    ? 3
    : 2;
  return `v${1 + (stableSeed(`${args.seed}:${args.grapheme}:${args.occurrence}`) % variants)}`;
}

function rawPaths(grapheme: string): readonly (readonly Point[])[] {
  return centerlineGlyphDefinition(grapheme).paths;
}

function pathLength(points: readonly Point[]): number {
  return points.slice(1).reduce((total, point, index) => {
    const previous = points[index]!;
    return total + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);
}

export function createChalkGlyphs(
  text: string,
  seed: string,
  locale = "de"
): ChalkGlyph[] {
  const occurrences = new Map<string, number>();
  return segmentChalkGraphemes(text, locale).map((grapheme, glyphIndex) => {
    const occurrence = occurrences.get(grapheme) ?? 0;
    occurrences.set(grapheme, occurrence + 1);
    const variant = selectChalkGlyphVariant({ grapheme, occurrence, seed });
    const glyphSeed = stableSeed(`${seed}:${glyphIndex}:${variant}`);
    const paths = rawPaths(grapheme);
    return {
      grapheme,
      variant,
      advanceWidth: centerlineGlyphDefinition(grapheme).advanceWidth,
      strokes: paths.map((points, order) => {
        const perturbed = points.map((point, pointIndex) => ({
          x: point.x + (unit(glyphSeed, order * 17 + pointIndex) - 0.5) * 0.018,
          y:
            point.y +
            (unit(glyphSeed, order * 19 + pointIndex + 7) - 0.5) * 0.018,
        }));
        return {
          id: `${glyphIndex}-${order}`,
          path: { points: perturbed, closed: false },
          order,
          length: pathLength(perturbed),
          baseWidth: 0.075 + unit(glyphSeed, order + 31) * 0.014,
          colourToken: "primary",
          pressureProfile: [
            { offset: 0, pressure: 0.72 },
            { offset: 0.18, pressure: 0.94 },
            { offset: 0.82, pressure: 0.88 },
            { offset: 1, pressure: 0.78 },
          ],
          speedProfile: [
            { offset: 0, speed: 0.72 },
            { offset: 0.2, speed: 1.08 },
            { offset: 0.8, speed: 0.92 },
            { offset: 1, speed: 0.68 },
          ],
          seed: glyphSeed,
        };
      }),
    };
  });
}

function xmlDecode(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function attribute(tag: string, name: string): string | null {
  return tag.match(new RegExp(`\\b${name}="([^"]+)"`, "u"))?.[1] ?? null;
}

function setAttribute(tag: string, name: string, value: string): string {
  const pattern = new RegExp(`\\s${name}="[^"]*"`, "u");
  if (pattern.test(tag)) return tag.replace(pattern, ` ${name}="${value}"`);
  return tag.endsWith("/>")
    ? `${tag.slice(0, -2)} ${name}="${value}"/>`
    : `${tag.slice(0, -1)} ${name}="${value}">`;
}

function numericAttribute(
  tag: string,
  name: string,
  fallback: number
): number {
  const raw = attribute(tag, name);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function glyphProgress(
  glyphs: readonly ChalkGlyph[],
  index: number,
  progress: number
): number {
  const weights = glyphs.map((glyph) => {
    if (glyph.grapheme.trim() === "") return 0.22;
    return Math.max(
      0.55,
      glyph.strokes.reduce((total, stroke) => total + stroke.length, 0)
    );
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const before = weights
    .slice(0, index)
    .reduce((sum, weight) => sum + weight, 0);
  return Math.max(
    0,
    Math.min(1, (progress * total - before) / Math.max(0.001, weights[index]!))
  );
}

function strokeProgress(
  strokes: readonly ChalkStroke[],
  index: number,
  progress: number
): number {
  const total = strokes.reduce(
    (sum, stroke) => sum + Math.max(0.01, stroke.length),
    0
  );
  const before = strokes
    .slice(0, index)
    .reduce((sum, stroke) => sum + Math.max(0.01, stroke.length), 0);
  return Math.max(
    0,
    Math.min(
      1,
      (progress * total - before) /
        Math.max(0.01, strokes[index]?.length ?? 0.01)
    )
  );
}

function pointsPathData(points: readonly Point[]): string {
  const first = points[0];
  if (!first) return "";
  if (points.length === 1)
    return `M${first.x.toFixed(2)} ${first.y.toFixed(2)}l0.01 0.01`;
  if (points.length === 2)
    return `M${first.x.toFixed(2)} ${first.y.toFixed(2)}L${points[1]!.x.toFixed(2)} ${points[1]!.y.toFixed(2)}`;
  const commands = [`M${first.x.toFixed(2)} ${first.y.toFixed(2)}`];
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index]!;
    const next = points[index + 1]!;
    commands.push(
      `Q${point.x.toFixed(2)} ${point.y.toFixed(2)} ${((point.x + next.x) / 2).toFixed(2)} ${((point.y + next.y) / 2).toFixed(2)}`
    );
  }
  const last = points.at(-1)!;
  commands.push(`L${last.x.toFixed(2)} ${last.y.toFixed(2)}`);
  return commands.join("");
}

function centerlinePathData(
  points: readonly Point[],
  xScale: number,
  yScale: number
): string {
  return pointsPathData(
    points.map((point) => ({
      x: point.x * xScale,
      y: point.y * yScale,
    }))
  );
}

function absoluteCenterlinePathData(args: {
  readonly points: readonly Point[];
  readonly xScale: number;
  readonly yScale: number;
  readonly originX: number;
  readonly originY: number;
  readonly rotationDegrees: number;
  readonly rotationCenterX: number;
  readonly rotationCenterY: number;
  readonly offsetX?: number;
  readonly offsetY?: number;
}): string {
  const radians = (args.rotationDegrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return pointsPathData(
    args.points.map((point) => {
      const localX = point.x * args.xScale;
      const localY = point.y * args.yScale;
      const relativeX = localX - args.rotationCenterX;
      const relativeY = localY - args.rotationCenterY;
      return {
        x:
          args.originX +
          args.rotationCenterX +
          relativeX * cosine -
          relativeY * sine +
          (args.offsetX ?? 0),
        y:
          args.originY +
          args.rotationCenterY +
          relativeX * sine +
          relativeY * cosine +
          (args.offsetY ?? 0),
      };
    })
  );
}

export function renderNaturalChalkText(args: {
  readonly openingTag: string;
  readonly innerMarkup: string;
  readonly progress: number;
  readonly seed: string;
  readonly locale?: string;
}): string {
  const bounded = Math.max(0, Math.min(1, args.progress));
  const fill = attribute(args.openingTag, "fill") ?? "#14213d";
  if (/<[a-z][\s\S]*>/iu.test(args.innerMarkup)) {
    let opening = setAttribute(
      args.openingTag,
      "data-natural-chalk-text",
      "true"
    );
    opening = setAttribute(
      opening,
      "visibility",
      bounded <= 0 ? "hidden" : "visible"
    );
    opening = setAttribute(opening, "fill-opacity", String(bounded * 0.94));
    opening = setAttribute(opening, "stroke", bounded <= 0 ? "none" : fill);
    opening = setAttribute(opening, "stroke-opacity", String(bounded * 0.24));
    opening = setAttribute(opening, "stroke-width", "0.85");
    opening = setAttribute(opening, "stroke-linecap", "round");
    opening = setAttribute(opening, "stroke-dasharray", "0.9 0.45");
    opening = setAttribute(opening, "data-chalk-fallback", "token-grain");
    return `${opening}${args.innerMarkup}</text>`;
  }
  const text = xmlDecode(args.innerMarkup);
  const glyphs = createChalkGlyphs(text, args.seed, args.locale);
  const fontSize = numericAttribute(args.openingTag, "font-size", 72);
  const originX = numericAttribute(args.openingTag, "x", 0);
  const baselineY = numericAttribute(args.openingTag, "y", fontSize);
  const xScale = fontSize * 0.62;
  const yScale = fontSize * 0.86;
  const totalAdvance = glyphs.reduce(
    (total, glyph) => total + glyph.advanceWidth * xScale,
    0
  );
  const textAnchor = attribute(args.openingTag, "text-anchor") ?? "start";
  const startX =
    textAnchor === "middle"
      ? originX - totalAdvance / 2
      : textAnchor === "end"
        ? originX - totalAdvance
        : originX;
  const topY = baselineY - fontSize * 0.82;
  const bold =
    Number(attribute(args.openingTag, "font-weight") ?? "400") >= 600;
  const mainWidth = fontSize * (bold ? 0.082 : 0.072);
  let cursorX = startX;
  const completedBody: string[] = [];
  const completedDust: string[] = [];
  const renderedGlyphs = glyphs
    .map((glyph, index) => {
      const local = glyphProgress(glyphs, index, bounded);
      const glyphSeed = stableSeed(`${args.seed}:${index}:${glyph.variant}`);
      const glyphX = cursorX;
      cursorX += glyph.advanceWidth * xScale;
      const rotation = ((unit(glyphSeed, 1) - 0.5) * 1.25).toFixed(3);
      const pending = local <= 0.001;
      const complete = local >= 0.999;
      const state = pending ? "pending" : complete ? "complete" : "active";
      if (pending || glyph.strokes.length === 0)
        return `<g data-chalk-glyph="${index}" data-chalk-state="${state}" data-chalk-variant="${glyph.variant}" data-chalk-grapheme="${xmlEscape(glyph.grapheme)}" visibility="${pending ? "hidden" : "visible"}"></g>`;
      if (complete) {
        for (const stroke of glyph.strokes) {
          const echoX = (unit(stroke.seed, 71) - 0.5) * 1.4;
          const echoY = (unit(stroke.seed, 79) - 0.5) * 1.1;
          const pathArgs = {
            points: stroke.path.points,
            xScale,
            yScale,
            originX: glyphX,
            originY: topY,
            rotationDegrees: Number(rotation),
            rotationCenterX: glyph.advanceWidth * xScale * 0.5,
            rotationCenterY: yScale * 0.5,
          };
          completedBody.push(absoluteCenterlinePathData(pathArgs));
          completedDust.push(
            absoluteCenterlinePathData({
              ...pathArgs,
              offsetX: echoX,
              offsetY: echoY,
            })
          );
        }
        return `<g data-chalk-glyph="${index}" data-chalk-state="complete" data-chalk-variant="${glyph.variant}" data-chalk-grapheme="${xmlEscape(glyph.grapheme)}"></g>`;
      }
      const paths = glyph.strokes
        .map((stroke, strokeIndex) => {
          const reveal = strokeProgress(glyph.strokes, strokeIndex, local);
          if (reveal <= 0.001) return "";
          const d = centerlinePathData(stroke.path.points, xScale, yScale);
          const offset = (1 - reveal).toFixed(4);
          const bodyDash =
            reveal < 0.999
              ? ` stroke-dasharray="1 1" stroke-dashoffset="${offset}"`
              : ` stroke-dasharray="${(0.06 + unit(stroke.seed, 83) * 0.035).toFixed(4)} ${(0.006 + unit(stroke.seed, 89) * 0.009).toFixed(4)}" stroke-dashoffset="${(unit(stroke.seed, 97) * 0.08).toFixed(4)}"`;
          const echoX = ((unit(stroke.seed, 71) - 0.5) * 1.4).toFixed(2);
          const echoY = ((unit(stroke.seed, 79) - 0.5) * 1.1).toFixed(2);
          const echoDash =
            reveal < 0.999
              ? `stroke-dasharray="1 1" stroke-dashoffset="${offset}"`
              : `stroke-dasharray="${(0.035 + unit(stroke.seed, 101) * 0.025).toFixed(4)} ${(0.016 + unit(stroke.seed, 103) * 0.018).toFixed(4)}" stroke-dashoffset="${(unit(stroke.seed, 107) * 0.07).toFixed(4)}"`;
          return `<path data-chalk-stroke="${strokeIndex}" data-chalk-pass="body" d="${d}" pathLength="1" fill="none" stroke="${fill}" stroke-width="${mainWidth.toFixed(2)}" stroke-opacity="0.9" stroke-linecap="round" stroke-linejoin="round"${bodyDash}/><path data-chalk-stroke="${strokeIndex}" data-chalk-pass="dust" d="${d}" pathLength="1" transform="translate(${echoX} ${echoY})" fill="none" stroke="${fill}" stroke-width="${(mainWidth * 0.62).toFixed(2)}" stroke-opacity="0.28" stroke-linecap="round" stroke-linejoin="round" ${echoDash}/>`;
        })
        .join("");
      return `<g data-chalk-glyph="${index}" data-chalk-state="${state}" data-chalk-variant="${glyph.variant}" data-chalk-grapheme="${xmlEscape(glyph.grapheme)}" visibility="visible" transform="translate(${glyphX.toFixed(2)} ${topY.toFixed(2)}) rotate(${rotation} ${(glyph.advanceWidth * xScale * 0.5).toFixed(2)} ${(yScale * 0.5).toFixed(2)})">${paths}</g>`;
    })
    .join("");
  const completedSeed = stableSeed(`${args.seed}:completed`);
  const completedPaths =
    completedBody.length === 0
      ? ""
      : `<path data-chalk-pass="completed-body" d="${completedBody.join("")}" fill="none" stroke="${fill}" stroke-width="${mainWidth.toFixed(2)}" stroke-opacity="0.9" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${(6.2 + unit(completedSeed, 1) * 3.1).toFixed(2)} ${(0.65 + unit(completedSeed, 2) * 0.8).toFixed(2)}" stroke-dashoffset="${(unit(completedSeed, 3) * 4).toFixed(2)}"/><path data-chalk-pass="completed-dust" d="${completedDust.join("")}" fill="none" stroke="${fill}" stroke-width="${(mainWidth * 0.62).toFixed(2)}" stroke-opacity="0.28" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${(3 + unit(completedSeed, 4) * 2).toFixed(2)} ${(1.4 + unit(completedSeed, 5) * 1.5).toFixed(2)}" stroke-dashoffset="${(unit(completedSeed, 6) * 3).toFixed(2)}"/>`;
  const opacity = attribute(args.openingTag, "opacity") ?? "1";
  return `<g data-natural-chalk-text="true" data-centerline-chalk="true" data-source-x="${originX}" data-source-y="${baselineY}" aria-label="${xmlEscape(text)}" fill="none" opacity="${opacity}">${completedPaths}${renderedGlyphs}</g>`;
}

function progressiveShape(openingTag: string, progress: number): string {
  let result = setAttribute(openingTag, "opacity", "1");
  const hasStroke =
    attribute(result, "stroke") !== null &&
    attribute(result, "stroke") !== "none";
  if (!hasStroke) return setAttribute(result, "fill-opacity", String(progress));
  result = setAttribute(result, "pathLength", "1");
  result = setAttribute(result, "stroke-linecap", "round");
  result = setAttribute(result, "stroke-linejoin", "round");
  result = setAttribute(result, "stroke-dasharray", "0.018 0.006");
  result = setAttribute(result, "stroke-dashoffset", String(1 - progress));
  if (
    attribute(result, "fill") !== null &&
    attribute(result, "fill") !== "none"
  )
    result = setAttribute(result, "fill-opacity", String(progress * 0.3));
  return result;
}

export function renderNaturalChalkGroup(args: {
  readonly markup: string;
  readonly progress: number;
  readonly seed: string;
  readonly locale?: string;
}): string {
  const tokenPattern =
    /<text\b[^>]*>[\s\S]*?<\/text>|<(?:path|line|circle|ellipse|polygon|polyline|rect)\b[^>]*\/>/giu;
  const tokens = [...args.markup.matchAll(tokenPattern)];
  if (tokens.length === 0) return args.markup;
  const weights = tokens.map((match) => {
    if (/^<text\b/iu.test(match[0])) {
      const inner = match[0]
        .replace(/^<text\b[^>]*>/iu, "")
        .replace(/<\/text>$/iu, "");
      return Math.max(
        1,
        segmentChalkGraphemes(xmlDecode(inner.replace(/<[^>]+>/gu, ""))).length
      );
    }
    return 4;
  });
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  let completedWeight = 0;
  let tokenIndex = 0;
  return args.markup.replace(tokenPattern, (token) => {
    const weight = weights[tokenIndex]!;
    const local = Math.max(
      0,
      Math.min(
        1,
        (Math.max(0, Math.min(1, args.progress)) * totalWeight -
          completedWeight) /
          weight
      )
    );
    const seed = `${args.seed}:token-${tokenIndex}`;
    completedWeight += weight;
    tokenIndex += 1;
    if (/^<text\b/iu.test(token)) {
      const openingTag = token.match(/^<text\b[^>]*>/iu)?.[0];
      if (!openingTag) return token;
      return renderNaturalChalkText({
        openingTag,
        innerMarkup: token.slice(openingTag.length, -"</text>".length),
        progress: local,
        seed,
        ...(args.locale ? { locale: args.locale } : {}),
      });
    }
    return progressiveShape(token, local);
  });
}

export function injectStableChalkMaterial(
  svgMarkup: string,
  seed: string
): string {
  if (svgMarkup.includes('id="natural-chalk-grain"')) return svgMarkup;
  const numericSeed = stableSeed(seed) % 10_000;
  const definitions = `<defs data-natural-chalk-material="${MATH_NATURAL_CHALK_VERSION}"><filter id="natural-chalk-grain" x="-4%" y="-4%" width="108%" height="108%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.58 0.82" numOctaves="2" seed="${numericSeed}" result="chalk-grain"/><feDisplacementMap in="SourceGraphic" in2="chalk-grain" scale="0.8" xChannelSelector="R" yChannelSelector="G"/></filter><style>[data-chalk-step] > path,[data-chalk-step] > line{filter:url(#natural-chalk-grain)}[data-natural-chalk-text="true"]{font-kerning:none;text-rendering:geometricPrecision}</style></defs>`;
  return svgMarkup.replace(/(<svg\b[^>]*>)/u, `$1${definitions}`);
}
