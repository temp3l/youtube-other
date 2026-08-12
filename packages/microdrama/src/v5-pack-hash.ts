import { createHash } from "node:crypto";
import fs from "node:fs";

import { normalizePackRelativePath } from "./v5-pack-path-policy.js";

export function hashFileSync(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return createHash("sha256").update(buffer).digest("hex");
}

export function computePackManifestHash(
  entries: ReadonlyArray<{ path: string; digest: string }>
): string {
  const canonical = [...entries]
    .sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0
    )
    .map((entry) => `${entry.path}\t${entry.digest}\n`)
    .join("");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function loadHashManifest(
  manifestPath: string
): Record<string, string> {
  const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<
    string,
    string
  >;
  const normalized: Record<string, string> = {};
  for (const [key, digest] of Object.entries(raw)) {
    normalized[normalizePackRelativePath(key)] = digest;
  }
  return normalized;
}
