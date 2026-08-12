import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveVeronicaCanonicalReferencePack,
  VeronicaCanonicalReferencePackResolutionError,
} from "./veronica-visual-artifacts.js";

describe("Veronica canonical reference-pack resolution", () => {
  it("honors an explicit pack root without depending on the workspace or current directory", async () => {
    const canonical = await resolveVeronicaCanonicalReferencePack();
    const isolatedRoot = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-reference-pack-"));
    const configuredRoot = path.join(isolatedRoot, "configured-reference-pack");
    await fs.symlink(canonical.packRoot, configuredRoot, "dir");

    const resolved = await resolveVeronicaCanonicalReferencePack({
      canonicalReferencePackRoot: configuredRoot,
    });

    expect(resolved.resolutionSource).toBe("configured");
    expect(resolved.packRoot).toBe(configuredRoot);
    expect(resolved.manifest.characterId).toBe("veronica-benini");
  });

  it("fails actionably instead of searching elsewhere when a configured pack is missing", async () => {
    const isolatedRoot = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-reference-pack-missing-"));
    const configuredRoot = path.join(isolatedRoot, "missing-reference-pack");
    const attemptedManifestPath = path.join(configuredRoot, "manifest.json");

    await expect(resolveVeronicaCanonicalReferencePack({
      canonicalReferencePackRoot: configuredRoot,
    })).rejects.toMatchObject<Partial<VeronicaCanonicalReferencePackResolutionError>>({
      code: "VERONICA_CANONICAL_REFERENCE_PACK_MISSING",
      resolutionSource: "configured",
      attemptedManifestPath,
    });
  });
});
