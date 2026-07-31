import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

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
function assertIdentifier(value: string): string {
  if (!identifier.test(value)) throw new Error("Asset and workspace identifiers must be opaque safe identifiers.");
  return value;
}
function digest(bytes: Uint8Array): string { return crypto.createHash("sha256").update(bytes).digest("hex"); }

/** Filesystem-backed test adapter with the same tenant/immutability contract as object storage. */
export class TenantObjectStorage {
  public constructor(private readonly root: string) {}

  private location(workspaceId: string, state: "quarantine" | "objects", assetId: string): string {
    return path.join(this.root, state, assertIdentifier(workspaceId), assertIdentifier(assetId));
  }

  public async quarantine(input: { readonly workspaceId: string; readonly assetId: string; readonly bytes: Uint8Array; readonly mimeType: string }): Promise<StoredAsset> {
    if (!input.mimeType.includes("/")) throw new Error("Asset MIME type is required.");
    const filePath = this.location(input.workspaceId, "quarantine", input.assetId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, input.bytes, { flag: "wx" });
    return { workspaceId: input.workspaceId, assetId: input.assetId, sha256: digest(input.bytes), bytes: input.bytes.byteLength, mimeType: input.mimeType, locator: `quarantine/${input.workspaceId}/${input.assetId}`, state: "quarantined" };
  }

  public async promote(input: StoredAsset & { readonly expectedSha256: string }): Promise<StoredAsset> {
    if (input.state !== "quarantined" || input.sha256 !== input.expectedSha256) throw new Error("Asset promotion requires the verified quarantine hash.");
    const source = this.location(input.workspaceId, "quarantine", input.assetId);
    const bytes = await fs.readFile(source);
    if (digest(bytes) !== input.expectedSha256) throw new Error("Quarantined asset hash no longer matches its verified hash.");
    const destination = this.location(input.workspaceId, "objects", input.assetId);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.rename(source, destination);
    return { ...input, bytes: bytes.byteLength, locator: `objects/${input.workspaceId}/${input.assetId}`, state: "ready" };
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
    return this.promote({ ...quarantined, expectedSha256: input.expectedSha256 });
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
    if (!input.mimeType.includes("/")) throw new Error("Asset MIME type is required.");
    const key = this.key(input.workspaceId, "quarantine", input.assetId);
    const sha256 = digest(input.bytes);
    await this.client.put({ key, bytes: input.bytes, mimeType: input.mimeType, sha256, ifAbsent: true }).catch(async (error: unknown) => {
      const existing = await this.client.head(key);
      if (existing?.sha256 === sha256 && existing.bytes === input.bytes.byteLength && existing.mimeType === input.mimeType) return;
      throw error;
    });
    const head = await this.client.head(key);
    if (!head || head.sha256 !== sha256 || head.bytes !== input.bytes.byteLength || head.mimeType !== input.mimeType) throw new Error("Quarantined object verification failed.");
    return this.stored({ workspaceId: input.workspaceId, assetId: input.assetId, state: "quarantined", head });
  }

  public async promote(input: StoredAsset & { readonly expectedSha256: string }): Promise<StoredAsset> {
    if (input.state !== "quarantined" || input.sha256 !== input.expectedSha256) throw new Error("Asset promotion requires the verified quarantine hash.");
    const sourceKey = this.key(input.workspaceId, "quarantine", input.assetId);
    const destinationKey = this.key(input.workspaceId, "objects", input.assetId);
    const source = await this.client.head(sourceKey);
    if (!source || source.sha256 !== input.expectedSha256 || source.bytes !== input.bytes || source.mimeType !== input.mimeType) throw new Error("Quarantined object no longer matches its inventory.");
    await this.client.copy({ sourceKey, destinationKey, ifAbsent: true }).catch(async (error: unknown) => {
      const existing = await this.client.head(destinationKey);
      if (existing?.sha256 === source.sha256 && existing.bytes === source.bytes && existing.mimeType === source.mimeType) return;
      throw error;
    });
    const destination = await this.client.head(destinationKey);
    if (!destination || destination.sha256 !== source.sha256 || destination.bytes !== source.bytes || destination.mimeType !== source.mimeType) throw new Error("Promoted object verification failed.");
    return this.stored({ workspaceId: input.workspaceId, assetId: input.assetId, state: "ready", head: destination });
  }

  public async signedReadUrl(input: StoredAsset & { readonly expiresAt: Date }): Promise<string> {
    if (input.state !== "ready" || input.expiresAt <= new Date()) throw new Error("Signed reads require an unexpired ready asset.");
    const head = await this.client.head(this.key(input.workspaceId, "objects", input.assetId));
    if (!head || head.sha256 !== input.sha256) throw new Error("Ready asset is unavailable.");
    return this.client.signedReadUrl({ key: this.key(input.workspaceId, "objects", input.assetId), expiresAt: input.expiresAt });
  }

  public beginMultipart(input: { readonly workspaceId: string; readonly assetId: string; readonly mimeType: string; readonly sha256: string }): Promise<{ readonly uploadId: string }> {
    return this.client.beginMultipart({ key: this.key(input.workspaceId, "quarantine", input.assetId), mimeType: input.mimeType, sha256: input.sha256 });
  }

  public completeMultipart(input: { readonly workspaceId: string; readonly assetId: string; readonly uploadId: string; readonly parts: readonly { readonly number: number; readonly etag: string }[] }): Promise<void> {
    return this.client.completeMultipart({ key: this.key(input.workspaceId, "quarantine", input.assetId), uploadId: input.uploadId, parts: input.parts, ifAbsent: true });
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
      assets.push(await this.promote({ ...quarantined, expectedSha256: legacy.expectedSha256 }));
    }
    await input.authority.switchToObjectStorage({ workspaceId: input.workspaceId, aggregateId: input.aggregateId, assetIds: assets.map((asset) => asset.assetId) });
    return assets;
  }
}
