import path from "node:path";
import { describe, expect, it } from "vitest";

import { V5_PACK_MANIFEST_HASH } from "./v5-pack-constants.js";
import { computePackManifestHash, loadHashManifest } from "./v5-pack-hash.js";

const V5_PACK_ROOT = path.resolve(
  import.meta.dirname,
  "../../../content-packs/seven-minutes-ahead-content-pack-v5-remediated"
);

describe("V5 pack manifest hash", () => {
  it("matches the remediated corpus manifest hash", () => {
    const manifest = loadHashManifest(path.join(V5_PACK_ROOT, "qa/sha256-v5.json"));
    const hash = computePackManifestHash(
      Object.entries(manifest).map(([filePath, digest]) => ({
        path: filePath,
        digest,
      }))
    );
    expect(hash).toBe(V5_PACK_MANIFEST_HASH);
  });
});
