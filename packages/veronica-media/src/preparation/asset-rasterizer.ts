import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import type { VeronicaIngestedAsset } from "../ingestion/secure-ingest.js";

const PNG_SIGNATURE = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

export interface RasterizeVeronicaAssetInput {
  readonly asset: VeronicaIngestedAsset;
  readonly candidateId: string;
  readonly label: string;
  readonly width?: number;
  readonly height?: number;
}

export function rasterizeVeronicaPreparedAssetSynthetic(input: RasterizeVeronicaAssetInput): Uint8Array {
  const width = input.width ?? (input.asset.mediaKind === "svg" ? 640 : 960);
  const height = input.height ?? (input.asset.mediaKind === "svg" ? 360 : 540);
  const seed = createHash("sha256")
    .update(`${input.asset.assetId}:${input.candidateId}:${input.label}`)
    .digest();
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const noise = seed[(x + y) % seed.length] ?? 0;
      pixels[offset] = 40 + (noise % 120);
      pixels[offset + 1] = 60 + ((noise >> 1) % 100);
      pixels[offset + 2] = 80 + ((noise >> 2) % 80);
      pixels[offset + 3] = 255;
    }
  }
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const zlib = deflateSync(raw);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const body = Buffer.concat([
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  return Uint8Array.from(Buffer.concat([Buffer.from(PNG_SIGNATURE), body]));
}
