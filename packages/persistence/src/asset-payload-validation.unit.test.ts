import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  AssetPayloadValidationError,
  strictAssetPayloadPolicy,
  validateAssetPayload,
  type AllowedAssetMimeType,
  type AssetPayloadKind,
} from "./asset-payload-validation.js";

const bytes = (...values: number[]) => Uint8Array.from(values);
const text = (value: string) => new TextEncoder().encode(value);
const riff = (type: "WEBP" | "WAVE") => text(`RIFF\u0004\u0000\u0000\u0000${type}data`);
const mp4 = bytes(0x00, 0x00, 0x00, 0x0c, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d);
const webm = bytes(0x1a, 0x45, 0xdf, 0xa3, ...text("doctype-webm"));

const fixtures: ReadonlyArray<{
  readonly kind: AssetPayloadKind;
  readonly mimeType: AllowedAssetMimeType;
  readonly payload: Uint8Array;
}> = [
  { kind: "image", mimeType: "image/png", payload: bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00) },
  { kind: "image", mimeType: "image/jpeg", payload: bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0xff, 0xd9) },
  { kind: "image", mimeType: "image/webp", payload: riff("WEBP") },
  { kind: "audio", mimeType: "audio/wav", payload: riff("WAVE") },
  { kind: "audio", mimeType: "audio/mpeg", payload: bytes(0x49, 0x44, 0x33, 0x04, 0x00) },
  { kind: "video", mimeType: "video/mp4", payload: mp4 },
  { kind: "video", mimeType: "video/webm", payload: webm },
  { kind: "document", mimeType: "application/json", payload: text('{"ok":true}') },
  { kind: "document", mimeType: "text/plain", payload: text("Hello, UTF-8: π\n") },
];

function capture(input: Parameters<typeof validateAssetPayload>[0]): AssetPayloadValidationError {
  try {
    validateAssetPayload(input);
  } catch (error) {
    expect(error).toBeInstanceOf(AssetPayloadValidationError);
    return error as AssetPayloadValidationError;
  }
  throw new Error("Expected payload validation to fail.");
}

describe("asset payload validation", () => {
  it.each(fixtures)("validates $mimeType bytes and returns canonical evidence", ({ kind, mimeType, payload }) => {
    expect(validateAssetPayload({ kind, declaredMimeType: mimeType.toUpperCase(), payload })).toEqual({
      kind,
      mimeType,
      bytes: payload.byteLength,
      sha256: crypto.createHash("sha256").update(payload).digest("hex"),
    });
  });

  it("enforces the fixed MIME/kind policy and byte limits", () => {
    expect(strictAssetPayloadPolicy.mimeTypesByKind.image).toEqual(["image/png", "image/jpeg", "image/webp"]);
    expect(capture({ kind: "image", declaredMimeType: "image/gif", payload: text("GIF89a") }).code).toBe("unsupported_mime_type");
    expect(capture({ kind: "document", declaredMimeType: "image/png", payload: fixtures[0]!.payload }).code).toBe("kind_mismatch");
    const tinyPolicy = {
      ...strictAssetPayloadPolicy,
      maxBytesByKind: { ...strictAssetPayloadPolicy.maxBytesByKind, document: 3 },
    };
    expect(capture({ kind: "document", declaredMimeType: "text/plain", payload: text("four"), policy: tinyPolicy }).code).toBe("payload_too_large");
    expect(capture({ kind: "document", declaredMimeType: "text/plain", payload: bytes() }).code).toBe("empty_payload");
  });

  it.each([
    bytes(0x4d, 0x5a, 0x90),
    bytes(0x7f, 0x45, 0x4c, 0x46),
    text("#!/bin/sh"),
    bytes(0x50, 0x4b, 0x03, 0x04),
    text("%PDF-1.7"),
    bytes(0xfe, 0xed, 0xfa, 0xcf),
  ])("rejects executable, archive, and polyglot prefixes", (payload) => {
    expect(capture({ kind: "document", declaredMimeType: "text/plain", payload }).code).toBe("dangerous_prefix");
  });

  it("rejects MIME and magic-byte mismatches across media families", () => {
    expect(capture({ kind: "image", declaredMimeType: "image/png", payload: fixtures[1]!.payload }).code).toBe("mime_magic_mismatch");
    expect(capture({ kind: "audio", declaredMimeType: "audio/wav", payload: fixtures[4]!.payload }).code).toBe("mime_magic_mismatch");
    expect(capture({ kind: "video", declaredMimeType: "video/mp4", payload: webm }).code).toBe("mime_magic_mismatch");
    expect(capture({ kind: "video", declaredMimeType: "video/webm", payload: mp4 }).code).toBe("mime_magic_mismatch");
  });

  it("rejects invalid UTF-8, malformed JSON, NULs, and control-heavy text", () => {
    expect(capture({ kind: "document", declaredMimeType: "text/plain", payload: bytes(0xc3, 0x28) }).code).toBe("invalid_utf8");
    expect(capture({ kind: "document", declaredMimeType: "application/json", payload: text("{broken") }).code).toBe("invalid_json");
    expect(capture({ kind: "document", declaredMimeType: "text/plain", payload: text("safe\0unsafe") }).code).toBe("unsafe_text");
    expect(capture({ kind: "document", declaredMimeType: "text/plain", payload: bytes(0x01, 0x02, 0x03, 0x04, 0x05) }).code).toBe("unsafe_text");
  });
});
