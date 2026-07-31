import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { S3TenantObjectStorage, TenantObjectStorage, type ObjectStorageClient } from "./tenant-object-storage.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))));
const sha = (value: Uint8Array) => crypto.createHash("sha256").update(value).digest("hex");

describe("tenant object storage", () => {
  it("does not expose an asset until its verified quarantine object is promoted", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-storage-")); roots.push(root);
    const storage = new TenantObjectStorage(root); const bytes = Buffer.from("immutable asset");
    const staged = await storage.quarantine({ workspaceId: "workspace-1", assetId: "asset-1", bytes, mimeType: "text/plain" });
    expect(await storage.get("workspace-1", "asset-1")).toBeNull();
    const ready = await storage.promote({ ...staged, expectedSha256: sha(bytes) });
    expect(ready).toMatchObject({ state: "ready", locator: "objects/workspace-1/asset-1" });
    expect(await storage.get("workspace-2", "asset-1")).toBeNull();
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
    const bytes = Buffer.from("asset");
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const switches: unknown[] = [];
    const assets = await storage.migrateLegacyAggregate({ workspaceId: "workspace-1", aggregateId: "episode-1", assets: [{ assetId: "asset-1", bytes, mimeType: "text/plain", expectedSha256: sha256 }], authority: { switchToObjectStorage: async (input) => { switches.push(input); } } });
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
});
