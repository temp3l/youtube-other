import type { VeronicaMediaPlan, VeronicaAspectRatio } from "../contracts/media-plan.v1.js";
import { resolvePreparedAssetIdForAspect } from "../rendering/manifest-integrity.js";

export interface ContactSheetTile {
  readonly placementId: string;
  readonly anchorId: string;
  readonly assetId: string;
  readonly preparedAssetId: string;
  readonly visualStateIds: readonly string[];
  readonly visualStateIndex: number;
  readonly aspectRatio: VeronicaAspectRatio;
  readonly sourcePage?: number;
  readonly sourceSlide?: number;
  readonly transformationLevel: string;
  readonly dwellSeconds: number;
  readonly approvalState: string;
  readonly previewLabel: string;
  readonly thumbnailBase64?: string;
}

export function buildContactSheetTiles(
  plan: VeronicaMediaPlan,
  aspectRatio: VeronicaAspectRatio,
  preparedAssetBytes?: Readonly<Record<string, Uint8Array>>,
): readonly ContactSheetTile[] {
  const placements =
    aspectRatio === "16:9" ? plan.landscapePlacements : plan.portraitPlacements;
  return placements.map((placement) => {
    const stateId = placement.visualStateIds[0];
    const visualState = stateId
      ? plan.visualStates.find((state) => state.stateId === stateId)
      : undefined;
    const preparedAssetId =
      (stateId ? resolvePreparedAssetIdForAspect(plan, stateId, aspectRatio) : undefined) ??
      "unknown";
    const provenance = visualState
      ? plan.provenance.find((record) => record.provenanceId === visualState.provenanceId)
      : undefined;
    const sourceAsset = provenance
      ? plan.sourceAssets.find((asset) => asset.assetId === provenance.sourceAssetId)
      : undefined;
    const thumbnailBase64 =
      preparedAssetId !== "unknown" && preparedAssetBytes?.[preparedAssetId]
        ? Buffer.from(preparedAssetBytes[preparedAssetId]!).toString("base64")
        : undefined;
    return {
      placementId: placement.placementId,
      anchorId: placement.anchorId,
      assetId: sourceAsset?.assetId ?? "unknown",
      preparedAssetId,
      visualStateIds: placement.visualStateIds,
      visualStateIndex: visualState?.sequenceIndex ?? 0,
      aspectRatio,
      ...(provenance?.sourceReference.pageNumber !== undefined
        ? { sourcePage: provenance.sourceReference.pageNumber }
        : {}),
      ...(provenance?.sourceReference.slideNumber !== undefined
        ? { sourceSlide: provenance.sourceReference.slideNumber }
        : {}),
      transformationLevel: visualState?.treatment ?? "unknown",
      dwellSeconds: placement.dwellDurationSeconds,
      approvalState: plan.approvalState,
      previewLabel: [
        placement.placementId,
        placement.anchorId,
        preparedAssetId,
        visualState?.treatment ?? "n/a",
        `${placement.dwellDurationSeconds}s`,
      ].join(" | "),
      ...(thumbnailBase64 ? { thumbnailBase64 } : {}),
    };
  });
}

export function renderContactSheetSvg(input: {
  readonly episodeId: string;
  readonly aspectRatio: VeronicaAspectRatio;
  readonly tiles: readonly ContactSheetTile[];
}): string {
  const columns = input.aspectRatio === "16:9" ? 3 : 2;
  const tileWidth = input.aspectRatio === "16:9" ? 360 : 280;
  const tileHeight = input.aspectRatio === "16:9" ? 280 : 420;
  const padding = 16;
  const imageHeight = Math.floor(tileHeight * 0.55);
  const rows = Math.max(1, Math.ceil(input.tiles.length / columns));
  const width = columns * tileWidth + (columns + 1) * padding;
  const height = rows * tileHeight + (rows + 1) * padding + 40;
  const tileRects = input.tiles
    .map((tile, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = padding + col * (tileWidth + padding);
      const y = padding + 40 + row * (tileHeight + padding);
      const lines = [
        `anchor: ${tile.anchorId}`,
        `placement: ${tile.placementId}`,
        `prepared: ${tile.preparedAssetId}`,
        `source: ${tile.assetId}`,
        `state: ${tile.visualStateIndex}`,
        tile.sourceSlide !== undefined ? `slide: ${tile.sourceSlide}` : null,
        tile.sourcePage !== undefined ? `page: ${tile.sourcePage}` : null,
        `transform: ${tile.transformationLevel}`,
        `aspect: ${tile.aspectRatio}`,
        `dwell: ${tile.dwellSeconds}s`,
        `approval: ${tile.approvalState}`,
      ].filter(Boolean) as string[];
      const textY = y + imageHeight + 20;
      const text = lines
        .map((line, lineIndex) => {
          const escaped = line.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
          return `<tspan x="${x + 12}" dy="${lineIndex === 0 ? 0 : 14}">${escaped}</tspan>`;
        })
        .join("");
      const imageMarkup = tile.thumbnailBase64
        ? `<image href="data:image/png;base64,${tile.thumbnailBase64}" x="${x + 8}" y="${y + 8}" width="${tileWidth - 16}" height="${imageHeight - 8}" preserveAspectRatio="xMidYMid meet"/>`
        : `<rect x="${x + 8}" y="${y + 8}" width="${tileWidth - 16}" height="${imageHeight - 8}" fill="#d4d4d8" stroke="#a1a1aa"/>`;
      return [
        `<rect x="${x}" y="${y}" width="${tileWidth}" height="${tileHeight}" fill="#f4f4f5" stroke="#27272a" stroke-width="1" rx="8"/>`,
        imageMarkup,
        `<text x="${x + 12}" y="${textY}" font-family="monospace" font-size="11" fill="#18181b">${text}</text>`,
      ].join("");
    })
    .join("\n");
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    `<text x="${padding}" y="28" font-family="sans-serif" font-size="18" font-weight="600">${input.episodeId} — ${input.aspectRatio} contact sheet</text>`,
    tileRects || `<text x="${padding}" y="80" font-family="sans-serif" font-size="14">No placements.</text>`,
    `</svg>`,
  ].join("\n");
}
