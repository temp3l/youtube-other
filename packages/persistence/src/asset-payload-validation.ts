import crypto from "node:crypto";

export const assetPayloadKinds = ["image", "audio", "video", "document"] as const;
export type AssetPayloadKind = (typeof assetPayloadKinds)[number];

export const allowedAssetMimeTypes = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "audio/wav",
  "audio/mpeg",
  "video/mp4",
  "video/webm",
  "application/json",
  "text/plain",
] as const;
export type AllowedAssetMimeType = (typeof allowedAssetMimeTypes)[number];

export interface AssetPayloadPolicy {
  readonly maxBytesByKind: Readonly<Record<AssetPayloadKind, number>>;
  readonly mimeTypesByKind: Readonly<Record<AssetPayloadKind, readonly AllowedAssetMimeType[]>>;
}

export const strictAssetPayloadPolicy: AssetPayloadPolicy = Object.freeze({
  maxBytesByKind: Object.freeze({
    image: 25 * 1024 * 1024,
    audio: 512 * 1024 * 1024,
    video: 8 * 1024 * 1024 * 1024,
    document: 5 * 1024 * 1024,
  }),
  mimeTypesByKind: Object.freeze({
    image: Object.freeze(["image/png", "image/jpeg", "image/webp"] as const),
    audio: Object.freeze(["audio/wav", "audio/mpeg"] as const),
    video: Object.freeze(["video/mp4", "video/webm"] as const),
    document: Object.freeze(["application/json", "text/plain"] as const),
  }),
});

export type AssetPayloadValidationCode =
  | "empty_payload"
  | "unsupported_mime_type"
  | "kind_mismatch"
  | "payload_too_large"
  | "dangerous_prefix"
  | "mime_magic_mismatch"
  | "invalid_utf8"
  | "invalid_json"
  | "unsafe_text";

export class AssetPayloadValidationError extends Error {
  public override readonly name = "AssetPayloadValidationError";

  public constructor(
    public readonly code: AssetPayloadValidationCode,
    message: string
  ) {
    super(message);
  }
}

export interface ValidatedAssetPayload {
  readonly kind: AssetPayloadKind;
  readonly mimeType: AllowedAssetMimeType;
  readonly bytes: number;
  readonly sha256: string;
}

const mimeTypeSet = new Set<string>(allowedAssetMimeTypes);
const asciiDecoder = new TextDecoder("ascii");
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return bytes.byteLength >= signature.length && signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return asciiDecoder.decode(bytes.subarray(start, end));
}

function hasDangerousPrefix(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0x4d, 0x5a]) ||
    startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46]) ||
    startsWith(bytes, [0x23, 0x21]) ||
    startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWith(bytes, [0x25, 0x50, 0x44, 0x46]) ||
    startsWith(bytes, [0x1f, 0x8b]) ||
    startsWith(bytes, [0x52, 0x61, 0x72, 0x21]) ||
    startsWith(bytes, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]) ||
    startsWith(bytes, [0xfe, 0xed, 0xfa, 0xce]) ||
    startsWith(bytes, [0xfe, 0xed, 0xfa, 0xcf]) ||
    startsWith(bytes, [0xce, 0xfa, 0xed, 0xfe]) ||
    startsWith(bytes, [0xcf, 0xfa, 0xed, 0xfe]) ||
    startsWith(bytes, [0xca, 0xfe, 0xba, 0xbe]);
}

function isPng(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

function isJpeg(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0xff, 0xd8, 0xff]);
}

function isWebp(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP";
}

function isWav(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WAVE";
}

function isMp3(bytes: Uint8Array): boolean {
  if (bytes.byteLength >= 3 && ascii(bytes, 0, 3) === "ID3") return true;
  const first = bytes[0];
  const second = bytes[1];
  return first === 0xff && second !== undefined && (second & 0xe0) === 0xe0 && (second & 0x18) !== 0x08 && (second & 0x06) !== 0;
}

function isMp4(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12 || ascii(bytes, 4, 8) !== "ftyp") return false;
  const declaredBoxBytes = ((bytes[0] ?? 0) * 0x1000000) + ((bytes[1] ?? 0) << 16) + ((bytes[2] ?? 0) << 8) + (bytes[3] ?? 0);
  return declaredBoxBytes >= 8 && declaredBoxBytes <= bytes.byteLength;
}

function isWebm(bytes: Uint8Array): boolean {
  if (!startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return false;
  return ascii(bytes, 0, Math.min(bytes.byteLength, 4_096)).toLowerCase().includes("webm");
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return utf8Decoder.decode(bytes);
  } catch {
    throw new AssetPayloadValidationError("invalid_utf8", "Text assets must contain valid UTF-8.");
  }
}

function validateSafeText(text: string): void {
  if (text.includes("\0"))
    throw new AssetPayloadValidationError("unsafe_text", "Text assets must not contain NUL bytes.");
  let disallowedControls = 0;
  for (const character of text) {
    const code = character.codePointAt(0)!;
    if ((code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0x7f)
      disallowedControls += 1;
  }
  const allowedControls = Math.max(2, Math.ceil(text.length * 0.01));
  if (disallowedControls > allowedControls)
    throw new AssetPayloadValidationError("unsafe_text", "Text assets contain too many control characters.");
}

function validateMagic(bytes: Uint8Array, mimeType: AllowedAssetMimeType): void {
  let valid = false;
  switch (mimeType) {
    case "image/png": valid = isPng(bytes); break;
    case "image/jpeg": valid = isJpeg(bytes); break;
    case "image/webp": valid = isWebp(bytes); break;
    case "audio/wav": valid = isWav(bytes); break;
    case "audio/mpeg": valid = isMp3(bytes); break;
    case "video/mp4": valid = isMp4(bytes); break;
    case "video/webm": valid = isWebm(bytes); break;
    case "application/json": {
      const text = decodeUtf8(bytes);
      validateSafeText(text);
      try {
        JSON.parse(text.startsWith("\ufeff") ? text.slice(1) : text);
        valid = true;
      } catch {
        throw new AssetPayloadValidationError("invalid_json", "JSON assets must contain one valid JSON value.");
      }
      break;
    }
    case "text/plain": {
      const text = decodeUtf8(bytes);
      validateSafeText(text);
      valid = true;
      break;
    }
  }
  if (!valid)
    throw new AssetPayloadValidationError("mime_magic_mismatch", `Payload bytes do not match declared MIME type ${mimeType}.`);
}

export function validateAssetPayload(input: {
  readonly kind: AssetPayloadKind;
  readonly declaredMimeType: string;
  readonly payload: Uint8Array;
  readonly policy?: AssetPayloadPolicy;
}): ValidatedAssetPayload {
  const policy = input.policy ?? strictAssetPayloadPolicy;
  if (input.payload.byteLength === 0)
    throw new AssetPayloadValidationError("empty_payload", "Asset payload must not be empty.");
  const mimeType = input.declaredMimeType.trim().toLowerCase();
  if (!mimeTypeSet.has(mimeType))
    throw new AssetPayloadValidationError("unsupported_mime_type", `MIME type ${input.declaredMimeType} is not allowed.`);
  const allowedMimeType = mimeType as AllowedAssetMimeType;
  if (!policy.mimeTypesByKind[input.kind].includes(allowedMimeType))
    throw new AssetPayloadValidationError("kind_mismatch", `MIME type ${allowedMimeType} is not allowed for ${input.kind} assets.`);
  if (input.payload.byteLength > policy.maxBytesByKind[input.kind])
    throw new AssetPayloadValidationError("payload_too_large", `${input.kind} asset exceeds its maximum byte size.`);
  if (hasDangerousPrefix(input.payload))
    throw new AssetPayloadValidationError("dangerous_prefix", "Asset payload has an executable, archive, or polyglot prefix.");
  validateMagic(input.payload, allowedMimeType);
  return {
    kind: input.kind,
    mimeType: allowedMimeType,
    bytes: input.payload.byteLength,
    sha256: crypto.createHash("sha256").update(input.payload).digest("hex"),
  };
}
