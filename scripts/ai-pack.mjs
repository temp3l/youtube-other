#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const command = args[0];
const json = args.includes("--json");
const rootArg = args.indexOf("--root");
const repoRoot = path.resolve(
  rootArg >= 0 && args[rootArg + 1]
    ? args[rootArg + 1]
    : path.resolve(import.meta.dirname, "..")
);
const packRoot = path.join(repoRoot, "docs", "ai-context");
const configPath = path.join(packRoot, "sources.json");
const reservedOutputs = new Set([
  "README.md",
  "MANIFEST.json",
  "source-index.json",
  "context-pack.md",
]);
const mediaExtensions = new Set([
  ".mp3",
  ".mp4",
  ".mov",
  ".mkv",
  ".wav",
  ".flac",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".pdf",
  ".zip",
  ".gz",
  ".woff",
  ".woff2",
]);

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function pretty(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function normalize(content) {
  return content.replace(/\r\n?/gu, "\n");
}

function contained(relativePath) {
  if (!relativePath || path.isAbsolute(relativePath)) return false;
  const normalized = path.posix.normalize(relativePath.replaceAll("\\", "/"));
  return (
    normalized !== ".." &&
    !normalized.startsWith("../") &&
    normalized === relativePath.replaceAll("\\", "/")
  );
}

async function regularFile(relativePath) {
  if (!contained(relativePath))
    throw new Error(`Path escape rejected: ${relativePath}`);
  const absolute = path.join(repoRoot, relativePath);
  const stat = await fs.lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error(`Source is not a regular file: ${relativePath}`);
  return { absolute, stat };
}

function secretType(content) {
  const patterns = [
    ["PRIVATE_KEY", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
    ["BEARER_TOKEN", /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/u],
    [
      "API_KEY",
      /(?:api[_-]?key|token|client[_-]?secret|password)\s*[:=]\s*["'][^"'\n]{12,}["']/iu,
    ],
  ];
  return patterns.find(([, pattern]) => pattern.test(content))?.[0] ?? null;
}

async function readConfig() {
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  if (config.schemaVersion !== "mediaforge.ai-pack-config.v1")
    throw new Error("Invalid AI-pack source configuration schema.");
  if (!Array.isArray(config.entries) || !Array.isArray(config.sourceIndex))
    throw new Error("AI-pack source configuration is incomplete.");
  const outputs = config.entries.map((entry) => entry.output);
  if (new Set(outputs).size !== outputs.length)
    throw new Error("Duplicate AI-pack output entry.");
  for (const output of outputs) {
    if (!contained(output) || reservedOutputs.has(output))
      throw new Error(`Invalid or reserved AI-pack output: ${output}`);
  }
  return config;
}

function rewriteLinks(content, source, output, sourceToOutput) {
  if (!source.endsWith(".md")) return content;
  return content.replace(/\]\(([^)]+)\)/gu, (match, destination) => {
    if (/^(?:https?:|mailto:|#)/u.test(destination)) return match;
    const [target, anchor = ""] = destination.split("#", 2);
    const resolved = path.posix.normalize(
      path.posix.join(path.posix.dirname(source), target)
    );
    const mapped = sourceToOutput.get(resolved);
    const destinationOutput = mapped ?? "source-index.json";
    const relative =
      path.posix.relative(path.posix.dirname(output), destinationOutput) ||
      path.posix.basename(destinationOutput);
    return `](${relative}${mapped && anchor ? `#${anchor}` : ""})`;
  });
}

async function sourceRecord(relativePath, symbols, limit) {
  let file;
  try {
    file = await regularFile(relativePath);
  } catch (error) {
    throw new Error(`Missing or unsafe AI-pack source: ${relativePath}`, {
      cause: error,
    });
  }
  if (mediaExtensions.has(path.extname(relativePath).toLowerCase()))
    throw new Error(
      `Generated media or binary source rejected: ${relativePath}`
    );
  if (file.stat.size > limit)
    throw new Error(`AI-pack source exceeds size limit: ${relativePath}`);
  const bytes = await fs.readFile(file.absolute);
  if (bytes.includes(0))
    throw new Error(`Binary AI-pack source rejected: ${relativePath}`);
  const content = normalize(bytes.toString("utf8"));
  const credential = secretType(content);
  if (credential)
    throw new Error(`Credential-like content: ${relativePath} [${credential}]`);
  for (const symbol of symbols ?? []) {
    if (!content.includes(symbol))
      throw new Error(`Missing source symbol: ${relativePath} [${symbol}]`);
  }
  return {
    content,
    sha256: sha256(content),
    sizeBytes: Buffer.byteLength(content),
  };
}

function gitValue(args, fallback) {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return fallback;
  }
}

function generatedAt() {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch && /^\d+$/u.test(epoch))
    return new Date(Number(epoch) * 1000).toISOString();
  const timestamp = gitValue(
    ["show", "-s", "--format=%cI", "HEAD"],
    "1970-01-01T00:00:00.000Z"
  );
  return new Date(timestamp).toISOString();
}

async function buildContents(config) {
  const contents = new Map();
  const sourceRecords = new Map();
  const sourceToOutput = new Map(
    config.entries.map((entry) => [entry.source, entry.output])
  );
  const allSources = new Map();
  for (const entry of [...config.entries, ...config.sourceIndex]) {
    const symbols = allSources.get(entry.source) ?? new Set();
    for (const symbol of entry.symbols ?? []) symbols.add(symbol);
    allSources.set(entry.source, symbols);
  }
  for (const [source, symbols] of [...allSources.entries()].sort(
    ([left], [right]) => left.localeCompare(right)
  )) {
    sourceRecords.set(
      source,
      await sourceRecord(source, [...symbols], config.limits.sourceFileBytes)
    );
  }
  for (const entry of [...config.entries].sort((left, right) =>
    left.output.localeCompare(right.output)
  )) {
    const record = sourceRecords.get(entry.source);
    const body = rewriteLinks(
      record.content,
      entry.source,
      entry.output,
      sourceToOutput
    );
    contents.set(
      entry.output,
      `<!-- Generated by ${config.generatorVersion}; source: ${entry.source}; sha256: ${record.sha256} -->\n\n${body.replace(/\n*$/u, "\n")}`
    );
  }
  const index = {
    schemaVersion: "mediaforge.ai-pack-source-index.v1",
    generatorVersion: config.generatorVersion,
    concepts: [...config.sourceIndex]
      .sort((left, right) => left.concept.localeCompare(right.concept))
      .map((entry) => ({
        concept: entry.concept,
        source: entry.source,
        sourceSha256: sourceRecords.get(entry.source).sha256,
        symbols: [...entry.symbols].sort(),
      })),
  };
  contents.set("source-index.json", pretty(index));
  const outputs = [...contents.keys()].sort();
  const readme = [
    "# Mediaforge AI Context Pack",
    "",
    "Generated deterministically from `sources.json`. Edit the mapped sources, not generated pack files.",
    "",
    "## Curated files",
    "",
    ...outputs.map((output) => `- [${output}](${output})`),
    "",
  ].join("\n");
  contents.set("README.md", readme);
  const contextLinks = [
    ["repository map", "repository-map.md"],
    ["architecture", "architecture/target-architecture.md"],
    ["CLI", "cli/commands.md"],
    ["source index", "source-index.json"],
    ["Dark Truth", "darktruth/profile.md"],
    ["mathematics", "mathematics/profile.md"],
    ["migration", "migration/compatibility.md"],
    ["duplicate elimination", "operations/duplicate-elimination.md"],
    ["release validation", "testing/release-validation.md"],
  ].filter(([, target]) => contents.has(target));
  const context = [
    "# Mediaforge AI Context Pack",
    "",
    "This generated compatibility entry point replaces the former manually maintained context pack.",
    "",
    ...contextLinks.map(([label, target]) => `- [${label}](${target})`),
    "",
  ].join("\n");
  contents.set("context-pack.md", context);
  return { contents, sourceRecords };
}

async function atomicWrite(relativeOutput, content) {
  const absolute = path.join(packRoot, relativeOutput);
  const root = path.resolve(packRoot);
  const resolved = path.resolve(absolute);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`))
    throw new Error(`Output path escape rejected: ${relativeOutput}`);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    const handle = await fs.open(temporary, "wx");
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, absolute);
  } finally {
    await fs.unlink(temporary).catch(() => undefined);
  }
}

async function listFiles(root, prefix = "") {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory())
      files.push(...(await listFiles(path.join(root, entry.name), relative)));
    else files.push(relative);
  }
  return files;
}

function expectedFiles(config) {
  return new Set([
    "sources.json",
    "README.md",
    "MANIFEST.json",
    "source-index.json",
    "context-pack.md",
    ...config.entries.map((entry) => entry.output),
  ]);
}

async function validateLinks(files) {
  const fileSet = new Set(files);
  for (const file of files.filter((item) => item.endsWith(".md"))) {
    const content = await fs.readFile(path.join(packRoot, file), "utf8");
    for (const match of content.matchAll(/\]\(([^)]+)\)/gu)) {
      const destination = match[1];
      if (/^(?:https?:|mailto:|#)/u.test(destination)) continue;
      const target = destination.split("#", 1)[0];
      const resolved = path.posix.normalize(
        path.posix.join(path.posix.dirname(file), target)
      );
      if (!fileSet.has(resolved))
        throw new Error(
          `Broken internal AI-pack link: ${file} -> ${destination}`
        );
    }
  }
}

async function validatePack(config) {
  const files = await listFiles(packRoot);
  const expected = expectedFiles(config);
  const unexpected = files.filter((file) => !expected.has(file));
  const missing = [...expected].filter((file) => !files.includes(file));
  if (unexpected.length)
    throw new Error(`Unexpected AI-pack files: ${unexpected.join(", ")}`);
  if (missing.length)
    throw new Error(`Missing AI-pack files: ${missing.join(", ")}`);
  let manifest;
  try {
    manifest = JSON.parse(
      await fs.readFile(path.join(packRoot, "MANIFEST.json"), "utf8")
    );
  } catch (error) {
    throw new Error("Invalid AI-pack MANIFEST.json.", { cause: error });
  }
  if (manifest.schemaVersion !== "mediaforge.ai-pack-manifest.v1")
    throw new Error("Invalid AI-pack manifest schema.");
  const configBytes = Buffer.from(
    normalize(await fs.readFile(configPath, "utf8")),
    "utf8",
  );
  if (
    manifest.sourceConfiguration?.path !== "docs/ai-context/sources.json" ||
    manifest.sourceConfiguration?.sha256 !== sha256(configBytes) ||
    manifest.sourceConfiguration?.sizeBytes !== configBytes.byteLength
  ) {
    throw new Error("AI-pack source configuration hash is stale.");
  }
  const generated = [...expected]
    .filter((file) => !["sources.json", "MANIFEST.json"].includes(file))
    .sort();
  if (
    new Set(manifest.packFiles.map((entry) => entry.path)).size !==
    manifest.packFiles.length
  )
    throw new Error("Duplicate AI-pack manifest output.");
  let total = 0;
  for (const file of generated) {
    const bytes = await fs.readFile(path.join(packRoot, file));
    if (
      bytes.includes(0) ||
      mediaExtensions.has(path.extname(file).toLowerCase())
    )
      throw new Error(`Binary or media pack output rejected: ${file}`);
    if (bytes.byteLength > config.limits.packFileBytes)
      throw new Error(`AI-pack output exceeds size limit: ${file}`);
    const credential = secretType(bytes.toString("utf8"));
    if (credential)
      throw new Error(`Credential-like content: ${file} [${credential}]`);
    const record = manifest.packFiles.find((entry) => entry.path === file);
    if (
      !record ||
      record.sha256 !== sha256(bytes) ||
      record.sizeBytes !== bytes.byteLength
    )
      throw new Error(`Stale AI-pack output hash: ${file}`);
    total += bytes.byteLength;
  }
  if (total !== manifest.totalPackBytes || total > config.limits.totalPackBytes)
    throw new Error("AI-pack total size is stale or excessive.");
  for (const section of config.requiredSections) {
    if (!generated.some((file) => file.startsWith(`${section}/`)))
      throw new Error(`Missing required AI-pack section: ${section}`);
  }
  await validateLinks(files);
  for (const entry of [...config.entries, ...config.sourceIndex])
    await sourceRecord(
      entry.source,
      entry.symbols,
      config.limits.sourceFileBytes
    );
  return {
    valid: true,
    files: generated.length,
    totalPackBytes: total,
    revision: manifest.repository.revision,
  };
}

async function build() {
  const config = await readConfig();
  const { contents, sourceRecords } = await buildContents(config);
  for (const [output, content] of [...contents.entries()].sort(
    ([left], [right]) => left.localeCompare(right)
  ))
    await atomicWrite(output, content);
  const packFiles = [...contents.keys()].sort().map((file) => {
    const content = contents.get(file);
    return {
      path: file,
      sizeBytes: Buffer.byteLength(content),
      sha256: sha256(content),
    };
  });
  const manifest = {
    schemaVersion: "mediaforge.ai-pack-manifest.v1",
    generatorVersion: config.generatorVersion,
    generatedAt: generatedAt(),
    repository: {
      revision: gitValue(["rev-parse", "HEAD"], "unknown"),
      dirty: gitValue(["status", "--porcelain"], "").length > 0,
    },
    sourceConfiguration: await (async () => {
      const bytes = Buffer.from(
        normalize(await fs.readFile(configPath, "utf8")),
        "utf8",
      );
      return {
        path: "docs/ai-context/sources.json",
        sizeBytes: bytes.byteLength,
        sha256: sha256(bytes),
      };
    })(),
    packFiles,
    sources: [...sourceRecords.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([source, record]) => ({
        path: source,
        sizeBytes: record.sizeBytes,
        sha256: record.sha256,
      })),
    exclusions: config.exclusions,
    requiredSections: config.requiredSections,
    limits: config.limits,
    totalPackBytes: packFiles.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    variableFields: [],
    knownLimitations: [
      "Retained compatibility adapters are indexed in the Batch 13 duplicate inventory.",
    ],
    unresolvedSourceMappings: [],
  };
  await atomicWrite("MANIFEST.json", pretty(manifest));
  const result = await validatePack(config);
  return {
    command: "build",
    ...result,
    manifestHash: sha256(pretty(manifest)),
  };
}

async function status() {
  const config = await readConfig();
  const changedSources = [];
  const missingSources = [];
  let manifest;
  try {
    manifest = JSON.parse(
      await fs.readFile(path.join(packRoot, "MANIFEST.json"), "utf8")
    );
  } catch {
    return {
      command: "status",
      fresh: false,
      valid: false,
      changedSources,
      missingSources,
      requiredAction: "pnpm ai-pack:build",
    };
  }
  for (const record of manifest.sources ?? []) {
    try {
      const current = await sourceRecord(
        record.path,
        [],
        config.limits.sourceFileBytes
      );
      if (current.sha256 !== record.sha256) changedSources.push(record.path);
    } catch {
      missingSources.push(record.path);
    }
  }
  let validationError = null;
  try {
    await validatePack(config);
  } catch (error) {
    validationError = error instanceof Error ? error.message : String(error);
  }
  const fresh =
    changedSources.length === 0 &&
    missingSources.length === 0 &&
    validationError === null;
  return {
    command: "status",
    fresh,
    valid: validationError === null,
    revision: manifest.repository?.revision ?? "unknown",
    dirty: manifest.repository?.dirty ?? null,
    changedSources,
    missingSources,
    totalPackBytes: manifest.totalPackBytes ?? null,
    validationError,
    requiredAction: fresh ? "none" : "pnpm ai-pack:build",
  };
}

async function main() {
  if (!["build", "validate", "status"].includes(command))
    throw new Error(
      "Usage: ai-pack.mjs <build|validate|status> [--json] [--root <path>]"
    );
  const result =
    command === "build"
      ? await build()
      : command === "validate"
        ? { command: "validate", ...(await validatePack(await readConfig())) }
        : await status();
  process.stdout.write(
    json
      ? pretty(result)
      : `${command}: ${result.fresh === false || result.valid === false ? "stale" : "ok"}\n${pretty(result)}`
  );
  if ((command === "status" && !result.fresh) || result.valid === false)
    process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exit(1);
});
