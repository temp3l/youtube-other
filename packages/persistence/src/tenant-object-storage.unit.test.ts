import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  S3TenantObjectStorage,
  TenantObjectStorage,
  createImmutableAssetValidationEvidence,
  type ImmutableAssetValidationEvidence,
  type ObjectStorageClient,
} from "./tenant-object-storage.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))));
const sha = (value: Uint8Array) => crypto.createHash("sha256").update(value).digest("hex");
const onePixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

describe("tenant object storage", () => {
  it("does not expose an asset until its verified quarantine object is promoted", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-storage-")); roots.push(root);
    const storage = new TenantObjectStorage(root); const bytes = Buffer.from("immutable asset");
    const staged = await storage.quarantine({ workspaceId: "workspace-1", assetId: "asset-1", bytes, mimeType: "text/plain" });
    expect(await storage.get("workspace-1", "asset-1")).toBeNull();
    const fabricated = Object.freeze({
      workspaceId: staged.workspaceId,
      assetId: staged.assetId,
      sha256: staged.sha256,
      bytes: staged.bytes,
      mimeType: staged.mimeType,
      kind: "document",
    }) as unknown as ImmutableAssetValidationEvidence;
    await expect(storage.promote({ asset: staged, validation: fabricated }))
      .rejects.toThrow(/immutable validation evidence/u);
    const validation = createImmutableAssetValidationEvidence({
      asset: staged,
      payload: bytes,
    });
    expect(Object.isFrozen(validation)).toBe(true);
    const ready = await storage.promote({ asset: staged, validation });
    expect(ready).toMatchObject({ state: "ready", locator: "objects/workspace-1/asset-1" });
    expect(await storage.get("workspace-2", "asset-1")).toBeNull();
  });

  it("completes multipart uploads only with bounded ordered input and verified HEAD evidence", async () => {
    const sha256 = sha(onePixelPng);
    let completed = 0;
    let headReads = 0;
    let beginInput: Parameters<ObjectStorageClient["beginMultipart"]>[0] | undefined;
    let completeInput: Parameters<ObjectStorageClient["completeMultipart"]>[0] | undefined;
    const client: ObjectStorageClient = {
      put: async () => undefined,
      head: async () => {
        headReads += 1;
        return completed > 0
          ? { bytes: onePixelPng.byteLength, mimeType: "image/png", sha256 }
          : null;
      },
      copy: async () => undefined,
      signedReadUrl: async () => "https://storage.invalid/read",
      beginMultipart: async (input) => {
        beginInput = input;
        return { uploadId: "upload-1" };
      },
      completeMultipart: async (input) => {
        completeInput = input;
        completed += 1;
      },
      abortMultipart: async () => undefined,
    };
    const storage = new S3TenantObjectStorage(client);

    await expect(storage.beginMultipart({
      workspaceId: "workspace-1",
      assetId: "asset-1",
      mimeType: " IMAGE/PNG ",
      sha256,
    })).resolves.toEqual({ uploadId: "upload-1" });
    expect(beginInput).toMatchObject({ mimeType: "image/png", sha256 });

    const quarantined = await storage.completeMultipart({
      workspaceId: "workspace-1",
      assetId: "asset-1",
      uploadId: "upload-1",
      parts: [{ number: 1, etag: "etag-1" }, { number: 3, etag: "etag-3" }],
      expectedBytes: onePixelPng.byteLength,
      expectedMimeType: "image/png",
      expectedSha256: sha256,
    });
    expect(quarantined).toMatchObject({
      state: "quarantined",
      bytes: onePixelPng.byteLength,
      mimeType: "image/png",
      sha256,
    });
    expect(completeInput).toMatchObject({ ifAbsent: true, uploadId: "upload-1" });
    expect(headReads).toBe(1);

    await expect(storage.beginMultipart({
      workspaceId: "workspace-1",
      assetId: "asset-2",
      mimeType: "application/x-executable",
      sha256,
    })).rejects.toThrow(/MIME/u);
    await expect(storage.beginMultipart({
      workspaceId: "workspace-1",
      assetId: "asset-2",
      mimeType: "image/png",
      sha256: "ABC",
    })).rejects.toThrow(/SHA-256/u);
    await expect(storage.completeMultipart({
      workspaceId: "workspace-1",
      assetId: "asset-2",
      uploadId: "upload-2",
      parts: [{ number: 2, etag: "etag-2" }, { number: 1, etag: "etag-1" }],
      expectedBytes: onePixelPng.byteLength,
      expectedMimeType: "image/png",
      expectedSha256: sha256,
    })).rejects.toThrow(/strictly increasing/u);
    expect(completed).toBe(1);
  });

  it("rejects multipart completion when object-store HEAD evidence differs", async () => {
    const client: ObjectStorageClient = {
      put: async () => undefined,
      head: async () => ({
        bytes: onePixelPng.byteLength + 1,
        mimeType: "image/png",
        sha256: sha(onePixelPng),
      }),
      copy: async () => undefined,
      signedReadUrl: async () => "https://storage.invalid/read",
      beginMultipart: async () => ({ uploadId: "upload-1" }),
      completeMultipart: async () => undefined,
      abortMultipart: async () => undefined,
    };
    await expect(new S3TenantObjectStorage(client).completeMultipart({
      workspaceId: "workspace-1",
      assetId: "asset-1",
      uploadId: "upload-1",
      parts: [{ number: 1, etag: "etag-1" }],
      expectedBytes: onePixelPng.byteLength,
      expectedMimeType: "image/png",
      expectedSha256: sha(onePixelPng),
    })).rejects.toThrow(/expected byte, MIME, and SHA-256 evidence/u);
  });

  it("promotes verified logical tenant objects and switches aggregate authority only after every asset is ready", async () => {
    const objects = new Map<string, { readonly bytes: Uint8Array; readonly mimeType: string; readonly sha256: string }>();
    const client: ObjectStorageClient = {
      put: async (input) => { if (objects.has(input.key) && input.ifAbsent) throw new Error("exists"); objects.set(input.key, { bytes: input.bytes, mimeType: input.mimeType, sha256: input.sha256 }); },
      head: async (key) => { const value = objects.get(key); return value ? { bytes: value.bytes.byteLength, mimeType: value.mimeType, sha256: value.sha256 } : null; },
      copy: async (input) => { const source = objects.get(input.sourceKey); if (!source) throw new Error("missing"); if (objects.has(input.destinationKey) && input.ifAbsent) throw new Error("exists"); objects.set(input.destinationKey, source); },
      signedReadUrl: async ({ key }) => `https://storage.invalid/${key}`,
      beginMultipart: async () => ({ uploadId: "upload-1" }), completeMultipart: async () => undefined, abortMultipart: async () => undefined,
    };
    const storage = new S3TenantObjectStorage(client);
    const bytes = onePixelPng;
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const switches: unknown[] = [];
    const assets = await storage.migrateLegacyAggregate({ workspaceId: "workspace-1", aggregateId: "episode-1", assets: [{ assetId: "asset-1", bytes, mimeType: "image/png", expectedSha256: sha256 }], authority: { switchToObjectStorage: async (input) => { switches.push(input); } } });
    await expect(storage.signedReadUrl({ ...assets[0]!, expiresAt: new Date(Date.now() + 60_000) })).resolves.toContain("workspace-1");
    expect(switches).toEqual([{ workspaceId: "workspace-1", aggregateId: "episode-1", assetIds: ["asset-1"] }]);
  });

  it("rejects a legacy migration before registering a mismatched object", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-storage-")); roots.push(root);
    const source = path.join(root, "legacy.bin"); await fs.writeFile(source, "legacy");
    const storage = new TenantObjectStorage(root);
    await expect(storage.migrateLegacy({ workspaceId: "workspace-1", assetId: "asset-1", sourcePath: source, mimeType: "application/octet-stream", expectedSha256: "0".repeat(64) })).rejects.toThrow(/hash/u);
    expect(await storage.get("workspace-1", "asset-1")).toBeNull();
  });

  it("rejects unsafe quarantine bytes before filesystem or object-store writes", async () => {
    const unsafe = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-storage-")); roots.push(root);
    const filesystem = new TenantObjectStorage(root);
    await expect(filesystem.quarantine({ workspaceId: "workspace-1", assetId: "asset-unsafe", bytes: unsafe, mimeType: "image/png" })).rejects.toMatchObject({ code: "dangerous_prefix" });
    await expect(fs.stat(path.join(root, "quarantine", "workspace-1", "asset-unsafe"))).rejects.toMatchObject({ code: "ENOENT" });

    let writes = 0;
    const client: ObjectStorageClient = {
      put: async () => { writes += 1; },
      head: async () => null,
      copy: async () => undefined,
      signedReadUrl: async () => "https://storage.invalid/read",
      beginMultipart: async () => ({ uploadId: "upload-1" }),
      completeMultipart: async () => undefined,
      abortMultipart: async () => undefined,
    };
    const objectStorage = new S3TenantObjectStorage(client);
    await expect(objectStorage.quarantine({ workspaceId: "workspace-1", assetId: "asset-unsafe", bytes: unsafe, mimeType: "image/png" })).rejects.toMatchObject({ code: "dangerous_prefix" });
    expect(writes).toBe(0);
  });
});
