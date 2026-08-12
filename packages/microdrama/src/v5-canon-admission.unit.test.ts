import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  canonicalEpisodeIds,
  compileV5CanonAdmission,
  validateV5CanonAdmissionBundle,
  V5_REMEDIATED_PACK_VERSION,
} from "./index.js";

const V5_PACK_ROOT = path.resolve(
  import.meta.dirname,
  "../../../content-packs/seven-minutes-ahead-content-pack-v5-remediated"
);
const ADMITTED_AT = "2026-08-12T03:10:00.000Z";

describe("V5 canon admission", () => {
  it("compiles one accepted 100-episode canon with 400 locale revisions", () => {
    const result = compileV5CanonAdmission(V5_PACK_ROOT, ADMITTED_AT);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.issues.map((issue) => issue.message).join("\n"));
    }

    const bundle = validateV5CanonAdmissionBundle(result.bundle);
    expect(bundle.episodeBoundaries).toHaveLength(100);
    expect(bundle.admittedScripts).toHaveLength(400);
    expect(bundle.episodeIdentities).toHaveLength(100);
    expect(bundle.seriesBibleRevisionId).toBe(
      `rev.series-bible.${V5_REMEDIATED_PACK_VERSION}`
    );
    expect(
      new Set(bundle.admittedScripts.map((script) => script.importStatus)).size
    ).toBe(1);
    expect(bundle.admittedScripts[0]?.importStatus).toBe(
      "IMPORTED_APPROVED_LOCALIZED_SCRIPT"
    );
  });

  it("keeps E001-E100 canonical identities aligned across all locales", () => {
    const result = compileV5CanonAdmission(V5_PACK_ROOT, ADMITTED_AT);
    if (!result.ok) {
      throw new Error("expected successful admission");
    }

    const expectedIds = canonicalEpisodeIds();
    expect(result.bundle.episodeIdentities.map((identity) => identity.episodeId)).toEqual(
      expectedIds
    );

    for (const identity of result.bundle.episodeIdentities) {
      expect(identity.locales).toEqual(["en-US", "de-DE", "es-ES", "pt-BR"]);
      expect(new Set(identity.contentHashes).size).toBe(4);
      expect(new Set(identity.scriptRevisionIds).size).toBe(4);
      for (const scriptRevisionId of identity.scriptRevisionIds) {
        expect(scriptRevisionId.startsWith("rev.script.")).toBe(true);
      }
    }
  });

  it("preserves replayable boundary obligations and script provenance", () => {
    const result = compileV5CanonAdmission(V5_PACK_ROOT, ADMITTED_AT);
    if (!result.ok) {
      throw new Error("expected successful admission");
    }

    const e001Boundary = result.bundle.episodeBoundaries.find(
      (boundary) => boundary.episodeId === "E001"
    );
    expect(e001Boundary?.hook.length).toBeGreaterThan(0);
    expect(e001Boundary?.cliffhangerBeat.length).toBeGreaterThan(0);
    expect(e001Boundary?.nextOpeningObligation?.length).toBeGreaterThan(0);
    expect(e001Boundary?.provenance.sourcePackVersion).toBe(V5_REMEDIATED_PACK_VERSION);

    for (const script of result.bundle.admittedScripts) {
      expect(script.provenance.sourceArtifactHash).toMatch(/^[a-f0-9]{64}$/u);
      expect(script.provenance.sourceRelativePath.length).toBeGreaterThan(0);
      expect(script.contentHash).toBe(script.provenance.sourceArtifactHash);
    }
  });

  it("fails closed when the continuity audit artifact is missing", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "microdrama-v5-audit-"));
    fs.cpSync(V5_PACK_ROOT, tempRoot, { recursive: true });
    fs.rmSync(
      path.join(tempRoot, "shared/canonical-continuity-audit-en-v5.md")
    );

    const result = compileV5CanonAdmission(tempRoot, ADMITTED_AT);
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected missing audit to fail");
    }
    expect(result.issues.some((issue) => issue.code === "continuity_audit_missing")).toBe(
      true
    );
  });
});
