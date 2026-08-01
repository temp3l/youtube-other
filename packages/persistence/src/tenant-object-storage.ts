import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  allowedAssetMimeTypes,
  strictAssetPayloadPolicy,
  validateAssetPayload,
  type AllowedAssetMimeType,
  type AssetPayloadKind,
} from "./asset-payload-validation.js";

export interface StoredAsset {
  readonly workspaceId: string;
  readonly assetId: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly mimeType: string;
  readonly locator: string;
  readonly state: "quarantined" | "ready";
}

export interface ObjectStorageHead {
  readonly bytes: number;
  readonly mimeType: string;
  readonly sha256: string;
}

const validationEvidenceBrand: unique symbol = Symbol("asset-validation-evidence");
const issuedValidationEvidence = new WeakSet<ImmutableAssetValidationEvidence>();

/**
 * Process-local, immutable proof that payload bytes passed the strict validator.
 * It is deliberately not reconstructible from object-store metadata alone.
 */
export interface ImmutableAssetValidationEvidence {
  readonly [validationEvidenceBrand]: true;
  readonly workspaceId: string;
  readonly assetId: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly mimeType: AllowedAssetMimeType;
  readonly kind: AssetPayloadKind;
}

/** Deliberately SDK-neutral S3-compatible boundary owned by deployment code. */
export interface ObjectStorageClient {
  put(input: { readonly key: string; readonly bytes: Uint8Array; readonly mimeType: string; readonly sha256: string; readonly ifAbsent: boolean }): Promise<void>;
  head(key: string): Promise<ObjectStorageHead | null>;
  copy(input: { readonly sourceKey: string; readonly destinationKey: string; readonly ifAbsent: boolean }): Promise<void>;
  signedReadUrl(input: { readonly key: string; readonly expiresAt: Date }): Promise<string>;
  beginMultipart(input: { readonly key: string; readonly mimeType: string; readonly sha256: string }): Promise<{ readonly uploadId: string }>;
  completeMultipart(input: { readonly key: string; readonly uploadId: string; readonly parts: readonly { readonly number: number; readonly etag: string }[]; readonly ifAbsent: boolean }): Promise<void>;
  abortMultipart(input: { readonly key: string; readonly uploadId: string }): Promise<void>;
}

export interface AggregateAssetAuthority {
  switchToObjectStorage(input: { readonly workspaceId: string; readonly aggregateId: string; readonly assetIds: readonly string[] }): Promise<void>;
}

const identifier = /^[A-Za-z0-9][A-Za-z0-9._-]{2,159}$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const allowedMimeTypeSet = new Set<string>(allowedAssetMimeTypes);
const maxMultipartParts = 10_000;
function assertIdentifier(value: string): string {
  if (!identifier.test(value)) throw new Error("Asset and workspace identifiers must be opaque safe identifiers.");
  return value;
}
function digest(bytes: Uint8Array): string { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function payloadKind(mimeType: string): AssetPayloadKind {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized.startsWith("image/")) return "image";
  if (normalized.startsWith("audio/")) return "audio";
  if (normalized.startsWith("video/")) return "video";
  return "document";
}

function assertMimeType(value: string): AllowedAssetMimeType {
  const normalized = value.trim().toLowerCase();
  if (value.length > 160 || !allowedMimeTypeSet.has(normalized))
    throw new Error("Multipart asset MIME type is unsupported or exceeds the configured limit.");
  return normalized as AllowedAssetMimeType;
}

function assertSha256(value: string): string {
  if (!sha256Pattern.test(value))
    throw new Error("Multipart asset SHA-256 must be 64 lowercase hexadecimal characters.");
  return value;
}

function assertExpectedBytes(bytes: number, mimeType: AllowedAssetMimeType): number {
  const kind = payloadKind(mimeType);
  if (
    !Number.isSafeInteger(bytes) ||
    bytes < 1 ||
    bytes > strictAssetPayloadPolicy.maxBytesByKind[kind]
  )
    throw new Error("Multipart asset byte count is invalid or exceeds the MIME policy limit.");
  return bytes;
}

function assertUploadId(value: string): string {
  if (value.length < 1 || value.length > 512 || /[\u0000-\u001f\u007f]/u.test(value))
    throw new Error("Multipart upload ID is invalid or exceeds the configured limit.");
  return value;
}

function assertMultipartParts(
  parts: readonly { readonly number: number; readonly etag: string }[]
): void {
  if (parts.length < 1 || parts.length > maxMultipartParts)
    throw new Error("Multipart completion requires between 1 and 10000 parts.");
  let previous = 0;
  for (const part of parts) {
    if (
      !Number.isSafeInteger(part.number) ||
      part.number < 1 ||
      part.number > maxMultipartParts ||
      part.number <= previous
    )
      throw new Error("Multipart parts must have unique, strictly increasing numbers between 1 and 10000.");
    if (
      part.etag.length < 1 ||
      part.etag.length > 512 ||
      /[\u0000-\u001f\u007f]/u.test(part.etag)
    )
      throw new Error("Multipart part ETags are invalid or exceed the configured limit.");
    previous = part.number;
  }
}

export function createImmutableAssetValidationEvidence(input: {
  readonly asset: StoredAsset;
  readonly payload: Uint8Array;
}): ImmutableAssetValidationEvidence {
  if (input.asset.state !== "quarantined")
    throw new Error("Validation evidence can be issued only for a quarantined asset.");
  const validated = validateAssetPayload({
    kind: payloadKind(input.asset.mimeType),
    declaredMimeType: input.asset.mimeType,
    payload: input.payload,
  });
  if (
    validated.sha256 !== input.asset.sha256 ||
    validated.bytes !== input.asset.bytes ||
    validated.mimeType !== input.asset.mimeType
  )
    throw new Error("Validated payload bytes do not match the quarantined asset inventory.");
  const evidence: ImmutableAssetValidationEvidence = Object.freeze({
    [validationEvidenceBrand]: true as const,
    workspaceId: input.asset.workspaceId,
    assetId: input.asset.assetId,
    sha256: validated.sha256,
    bytes: validated.bytes,
    mimeType: validated.mimeType,
    kind: validated.kind,
  });
  issuedValidationEvidence.add(evidence);
  return evidence;
}

function assertPromotionEvidence(
  asset: StoredAsset,
  evidence: ImmutableAssetValidationEvidence
): void {
  if (
    asset.state !== "quarantined" ||
    !issuedValidationEvidence.has(evidence) ||
    !Object.isFrozen(evidence) ||
    evidence.workspaceId !== asset.workspaceId ||
    evidence.assetId !== asset.assetId ||
    evidence.sha256 !== asset.sha256 ||
    evidence.bytes !== asset.bytes ||
    evidence.mimeType !== asset.mimeType
  )
    throw new Error("Asset promotion requires immutable validation evidence for the quarantined payload.");
}

/** Filesystem-backed test adapter with the same tenant/immutability contract as object storage. */
export class TenantObjectStorage {
  public constructor(private readonly root: string) {}

  private location(workspaceId: string, state: "quarantine" | "objects", assetId: string): string {
    return path.join(this.root, state, assertIdentifier(workspaceId), assertIdentifier(assetId));
  }

  public async quarantine(input: { readonly workspaceId: string; readonly assetId: string; readonly bytes: Uint8Array; readonly mimeType: string }): Promise<StoredAsset> {
    const validated = validateAssetPayload({ kind: payloadKind(input.mimeType), declaredMimeType: input.mimeType, payload: input.bytes });
    const filePath = this.location(input.workspaceId, "quarantine", input.assetId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, input.bytes, { flag: "wx" });
    return { workspaceId: input.workspaceId, assetId: input.assetId, sha256: validated.sha256, bytes: validated.bytes, mimeType: validated.mimeType, locator: `quarantine/${input.workspaceId}/${input.assetId}`, state: "quarantined" };
  }

  public async promote(input: {
    readonly asset: StoredAsset;
    readonly validation: ImmutableAssetValidationEvidence;
  }): Promise<StoredAsset> {
    assertPromotionEvidence(input.asset, input.validation);
    const source = this.location(input.asset.workspaceId, "quarantine", input.asset.assetId);
    const bytes = await fs.readFile(source);
    if (digest(bytes) !== input.validation.sha256 || bytes.byteLength !== input.validation.bytes)
      throw new Error("Quarantined asset no longer matches its validation evidence.");
    const destination = this.location(input.asset.workspaceId, "objects", input.asset.assetId);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.rename(source, destination);
    return {
      ...input.asset,
      bytes: bytes.byteLength,
      locator: `objects/${input.asset.workspaceId}/${input.asset.assetId}`,
      state: "ready",
    };
  }

  public async get(workspaceId: string, assetId: string): Promise<Uint8Array | null> {
    return fs.readFile(this.location(workspaceId, "objects", assetId)).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    });
  }

  public async migrateLegacy(input: { readonly workspaceId: string; readonly assetId: string; readonly sourcePath: string; readonly mimeType: string; readonly expectedSha256: string }): Promise<StoredAsset> {
    const bytes = await fs.readFile(input.sourcePath);
    if (digest(bytes) !== input.expectedSha256) throw new Error("Legacy asset hash does not match migration inventory.");
    const quarantined = await this.quarantine({ workspaceId: input.workspaceId, assetId: input.assetId, bytes, mimeType: input.mimeType });
    return this.promote({
      asset: quarantined,
      validation: createImmutableAssetValidationEvidence({ asset: quarantined, payload: bytes }),
    });
  }
}

/**
 * Production object-store adapter. Logical keys always carry the workspace;
 * physical deduplication is never used as an authorization mechanism.
 */
export class S3TenantObjectStorage {
  public constructor(private readonly client: ObjectStorageClient, private readonly prefix = "mediaforge") {}

  private key(workspaceId: string, state: "quarantine" | "objects", assetId: string): string {
    return `${this.prefix}/${state}/${assertIdentifier(workspaceId)}/${assertIdentifier(assetId)}`;
  }

  private stored(input: { readonly workspaceId: string; readonly assetId: string; readonly state: "quarantined" | "ready"; readonly head: ObjectStorageHead }): StoredAsset {
    return {
      workspaceId: input.workspaceId,
      assetId: input.assetId,
      sha256: input.head.sha256,
      bytes: input.head.bytes,
      mimeType: input.head.mimeType,
      locator: this.key(input.workspaceId, input.state === "ready" ? "objects" : "quarantine", input.assetId),
      state: input.state,
    };
  }

  public async quarantine(input: { readonly workspaceId: string; readonly assetId: string; readonly bytes: Uint8Array; readonly mimeType: string }): Promise<StoredAsset> {
    const validated = validateAssetPayload({ kind: payloadKind(input.mimeType), declaredMimeType: input.mimeType, payload: input.bytes });
    const key = this.key(input.workspaceId, "quarantine", input.assetId);
    await this.client.put({ key, bytes: input.bytes, mimeType: validated.mimeType, sha256: validated.sha256, ifAbsent: true }).catch(async (error: unknown) => {
      const existing = await this.client.head(key);
      if (existing?.sha256 === validated.sha256 && existing.bytes === validated.bytes && existing.mimeType === validated.mimeType) return;
      throw error;
    });
    const head = await this.client.head(key);
    if (!head || head.sha256 !== validated.sha256 || head.bytes !== validated.bytes || head.mimeType !== validated.mimeType) throw new Error("Quarantined object verification failed.");
    return this.stored({ workspaceId: input.workspaceId, assetId: input.assetId, state: "quarantined", head });
  }

  public async promote(input: {
    readonly asset: StoredAsset;
    readonly validation: ImmutableAssetValidationEvidence;
  }): Promise<StoredAsset> {
    assertPromotionEvidence(input.asset, input.validation);
    const sourceKey = this.key(input.asset.workspaceId, "quarantine", input.asset.assetId);
    const destinationKey = this.key(input.asset.workspaceId, "objects", input.asset.assetId);
    const source = await this.client.head(sourceKey);
    if (!source || source.sha256 !== input.validation.sha256 || source.bytes !== input.validation.bytes || source.mimeType !== input.validation.mimeType) throw new Error("Quarantined object no longer matches its validation evidence.");
    await this.client.copy({ sourceKey, destinationKey, ifAbsent: true }).catch(async (error: unknown) => {
      const existing = await this.client.head(destinationKey);
      if (existing?.sha256 === source.sha256 && existing.bytes === source.bytes && existing.mimeType === source.mimeType) return;
      throw error;
    });
    const destination = await this.client.head(destinationKey);
    if (!destination || destination.sha256 !== source.sha256 || destination.bytes !== source.bytes || destination.mimeType !== source.mimeType) throw new Error("Promoted object verification failed.");
    return this.stored({ workspaceId: input.asset.workspaceId, assetId: input.asset.assetId, state: "ready", head: destination });
  }

  public async signedReadUrl(input: StoredAsset & { readonly expiresAt: Date }): Promise<string> {
    if (input.state !== "ready" || input.expiresAt <= new Date()) throw new Error("Signed reads require an unexpired ready asset.");
    const head = await this.client.head(this.key(input.workspaceId, "objects", input.assetId));
    if (!head || head.sha256 !== input.sha256) throw new Error("Ready asset is unavailable.");
    return this.client.signedReadUrl({ key: this.key(input.workspaceId, "objects", input.assetId), expiresAt: input.expiresAt });
  }

  public async beginMultipart(input: { readonly workspaceId: string; readonly assetId: string; readonly mimeType: string; readonly sha256: string }): Promise<{ readonly uploadId: string }> {
    const result = await this.client.beginMultipart({
      key: this.key(input.workspaceId, "quarantine", input.assetId),
      mimeType: assertMimeType(input.mimeType),
      sha256: assertSha256(input.sha256),
    });
    return { uploadId: assertUploadId(result.uploadId) };
  }

  public async completeMultipart(input: {
    readonly workspaceId: string;
    readonly assetId: string;
    readonly uploadId: string;
    readonly parts: readonly { readonly number: number; readonly etag: string }[];
    readonly expectedBytes: number;
    readonly expectedMimeType: string;
    readonly expectedSha256: string;
  }): Promise<StoredAsset> {
    const uploadId = assertUploadId(input.uploadId);
    assertMultipartParts(input.parts);
    const expectedMimeType = assertMimeType(input.expectedMimeType);
    const expectedSha256 = assertSha256(input.expectedSha256);
    const expectedBytes = assertExpectedBytes(input.expectedBytes, expectedMimeType);
    const key = this.key(input.workspaceId, "quarantine", input.assetId);
    let completionError: unknown;
    try {
      await this.client.completeMultipart({
        key,
        uploadId,
        parts: input.parts,
        ifAbsent: true,
      });
    } catch (error) {
      completionError = error;
    }
    const head = await this.client.head(key);
    if (
      !head ||
      head.bytes !== expectedBytes ||
      head.mimeType !== expectedMimeType ||
      head.sha256 !== expectedSha256
    ) {
      if (completionError) throw completionError;
      throw new Error("Completed multipart object does not match its expected byte, MIME, and SHA-256 evidence.");
    }
    return this.stored({
      workspaceId: input.workspaceId,
      assetId: input.assetId,
      state: "quarantined",
      head,
    });
  }

  public abortMultipart(input: { readonly workspaceId: string; readonly assetId: string; readonly uploadId: string }): Promise<void> {
    return this.client.abortMultipart({ key: this.key(input.workspaceId, "quarantine", input.assetId), uploadId: input.uploadId });
  }

  /** Source files remain untouched; authority changes only after every copied object verifies. */
  public async migrateLegacyAggregate(input: {
    readonly workspaceId: string;
    readonly aggregateId: string;
    readonly assets: readonly { readonly assetId: string; readonly bytes: Uint8Array; readonly mimeType: string; readonly expectedSha256: string }[];
    readonly authority: AggregateAssetAuthority;
  }): Promise<readonly StoredAsset[]> {
    const assets: StoredAsset[] = [];
    for (const legacy of input.assets) {
      if (digest(legacy.bytes) !== legacy.expectedSha256) throw new Error("Legacy asset hash does not match migration inventory.");
      const quarantined = await this.quarantine({ ...legacy, workspaceId: input.workspaceId });
      assets.push(await this.promote({
        asset: quarantined,
        validation: createImmutableAssetValidationEvidence({
          asset: quarantined,
          payload: legacy.bytes,
        }),
      }));
    }
    await input.authority.switchToObjectStorage({ workspaceId: input.workspaceId, aggregateId: input.aggregateId, assetIds: assets.map((asset) => asset.assetId) });
    return assets;
  }
}
