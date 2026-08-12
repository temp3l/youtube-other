import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

const packages = {
  cli: {
    directory: "apps/cli",
    manifest: "apps/cli/dist/runtime-fingerprint.json",
  },
  "strategic-reinvention": {
    directory: "packages/strategic-reinvention",
    manifest: "packages/strategic-reinvention/dist/runtime-fingerprint.json",
  },
};

function repositoryRoot(rootDir) {
  return rootDir ?? path.resolve(scriptDir, "..");
}

async function listRuntimeSources(directory, rootDir) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listRuntimeSources(absolutePath, rootDir));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".ts") || /\.test\.ts$/u.test(entry.name)) continue;
    files.push(path.relative(rootDir, absolutePath).split(path.sep).join("/"));
  }
  return files;
}

async function sourceFingerprint(packageName, rootDir) {
  const definition = packages[packageName];
  if (!definition) throw new Error(`Unknown runtime package: ${packageName}`);
  const packageDirectory = path.join(rootDir, definition.directory);
  const files = [
    ...await listRuntimeSources(path.join(packageDirectory, "src"), rootDir),
    `${definition.directory}/package.json`,
    `${definition.directory}/tsconfig.json`,
    "tsconfig.base.json",
  ].sort();
  const hash = createHash("sha256");
  for (const relativePath of files) {
    hash.update(relativePath);
    hash.update("\0");
    hash.update(await fs.readFile(path.join(rootDir, relativePath)));
    hash.update("\0");
  }
  return { files, fingerprint: hash.digest("hex") };
}

export async function writeRuntimeBuildFingerprint(packageName, options = {}) {
  const rootDir = repositoryRoot(options.rootDir);
  const definition = packages[packageName];
  if (!definition) throw new Error(`Unknown runtime package: ${packageName}`);
  const source = await sourceFingerprint(packageName, rootDir);
  const manifest = {
    schemaVersion: 1,
    packageName,
    sourceFingerprint: source.fingerprint,
    sourceFiles: source.files,
  };
  const manifestPath = path.join(rootDir, definition.manifest);
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { ...manifest, manifestPath: definition.manifest };
}

export async function verifyRuntimeBuildFingerprint(packageName, options = {}) {
  const rootDir = repositoryRoot(options.rootDir);
  const definition = packages[packageName];
  if (!definition) throw new Error(`Unknown runtime package: ${packageName}`);
  const manifestPath = path.join(rootDir, definition.manifest);
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch {
    throw new Error(`Runtime build fingerprint missing for ${packageName}; run pnpm --filter @mediaforge/${packageName} build before source-grounded QA.`);
  }
  const current = await sourceFingerprint(packageName, rootDir);
  if (manifest.schemaVersion !== 1 || manifest.packageName !== packageName || manifest.sourceFingerprint !== current.fingerprint) {
    throw new Error(`Runtime build fingerprint is stale for ${packageName}; run pnpm --filter @mediaforge/${packageName} build before source-grounded QA.`);
  }
  return {
    packageName,
    sourceFingerprint: current.fingerprint,
    manifestPath: definition.manifest,
  };
}

async function main() {
  const [operation, option, packageName] = process.argv.slice(2);
  if ((operation !== "write" && operation !== "verify") || option !== "--package" || !packageName) {
    throw new Error("Usage: node scripts/runtime-build-fingerprint.mjs <write|verify> --package <cli|strategic-reinvention>");
  }
  const result = operation === "write"
    ? await writeRuntimeBuildFingerprint(packageName)
    : await verifyRuntimeBuildFingerprint(packageName);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
