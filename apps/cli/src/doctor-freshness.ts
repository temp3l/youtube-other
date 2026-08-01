import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface CliDoctorFreshnessCheck {
  readonly label: "Packaged CLI output";
  readonly status: "ok" | "missing";
  readonly detail: string;
  readonly kind: "required";
}

export async function packagedCliFreshnessCheck(options: {
  readonly sourceEntryPath?: string;
  readonly packagedEntryPath?: string;
} = {}): Promise<CliDoctorFreshnessCheck> {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const compiledLayout = path.basename(moduleDir) === "dist";
  const sourceEntryPath = options.sourceEntryPath ?? path.join(moduleDir, compiledLayout ? ".." : ".", compiledLayout ? "src/index.ts" : "index.ts");
  const packagedEntryPath = options.packagedEntryPath ?? path.join(moduleDir, compiledLayout ? "index.js" : "../dist/index.js");
  const [source, packaged] = await Promise.all([
    fs.stat(sourceEntryPath).catch(() => undefined),
    fs.stat(packagedEntryPath).catch(() => undefined),
  ]);
  if (!source || !packaged) {
    return {
      label: "Packaged CLI output",
      status: "missing",
      detail: `Missing ${!source ? sourceEntryPath : packagedEntryPath}; run pnpm --filter @mediaforge/cli build.`,
      kind: "required",
    };
  }
  if (packaged.mtimeMs < source.mtimeMs) {
    return {
      label: "Packaged CLI output",
      status: "missing",
      detail: `${packagedEntryPath} is stale relative to ${sourceEntryPath}; run pnpm --filter @mediaforge/cli build.`,
      kind: "required",
    };
  }
  return {
    label: "Packaged CLI output",
    status: "ok",
    detail: `${packagedEntryPath} is current.`,
    kind: "required",
  };
}
