import { constants as fsConstants, createReadStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { RendererError } from "../errors.js";

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}

export function hashText(value: string): string { return createHash("sha256").update(value).digest("hex"); }
export async function hashFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", resolve);
  });
  return hash.digest("hex");
}

function boundary(message: string, cause?: unknown): RendererError {
  return new RendererError({ code: "FILESYSTEM_BOUNDARY_VIOLATION", message }, cause === undefined ? undefined : { cause });
}

function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

async function lstatOptional(filePath: string): Promise<Awaited<ReturnType<typeof fs.lstat>> | undefined> {
  try { return await fs.lstat(filePath); } catch (error) { if (isCode(error, "ENOENT")) return undefined; throw error; }
}

export function resolveContained(rootInput: string, candidateInput: string): string {
  const root = path.resolve(rootInput);
  const candidate = path.resolve(root, candidateInput);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) throw boundary(`Path escapes configured root: ${candidateInput}`);
  return candidate;
}

function componentsTo(candidateInput: string): string[] {
  const candidate = path.resolve(candidateInput);
  const parsed = path.parse(candidate);
  const parts = path.relative(parsed.root, candidate).split(path.sep).filter(Boolean);
  const output = [parsed.root];
  let current = parsed.root;
  for (const part of parts) { current = path.join(current, part); output.push(current); }
  return output;
}

/** Reject every existing symlink from the filesystem root through the candidate. */
async function assertAbsolutePathNoSymlinks(candidate: string): Promise<void> {
  for (const component of componentsTo(candidate)) {
    const stat = await lstatOptional(component);
    if (!stat) break;
    if (stat.isSymbolicLink()) throw boundary(`Symbolic links are not allowed in writable paths: ${component}`);
  }
}

/** Resolve an existing input once and return the exact real path that may be passed to tools. */
export async function resolveExistingContained(rootInput: string, candidateInput: string): Promise<string> {
  const lexicalRoot = path.resolve(rootInput);
  const lexicalCandidate = resolveContained(lexicalRoot, candidateInput);
  try {
    const [realRoot, realCandidate] = await Promise.all([fs.realpath(lexicalRoot), fs.realpath(lexicalCandidate)]);
    if (realCandidate !== realRoot && !realCandidate.startsWith(`${realRoot}${path.sep}`)) throw boundary(`Real path escapes configured root: ${candidateInput}`);
    return realCandidate;
  } catch (error) {
    if (error instanceof RendererError) throw error;
    if (isCode(error, "ENOENT")) throw new RendererError({ code: "MISSING_ASSET", message: `Required input does not exist: ${candidateInput}` }, { cause: error });
    throw error;
  }
}

export async function assertNoSymlinkEscape(rootInput: string, candidateInput: string): Promise<void> {
  const root = path.resolve(rootInput);
  const candidate = resolveContained(root, candidateInput);
  await assertAbsolutePathNoSymlinks(root);
  const relative = path.relative(root, candidate);
  let current = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = await lstatOptional(current);
    if (!stat) break;
    if (stat.isSymbolicLink()) throw boundary(`Symbolic links are not allowed in writable paths: ${current}`);
  }
}

/** Create one directory component at a time and verify each immediately after creation. */
export async function ensureSafeDirectory(rootInput: string, directoryInput: string): Promise<string> {
  const root = path.resolve(rootInput);
  const directory = resolveContained(root, directoryInput);
  await assertAbsolutePathNoSymlinks(root);
  if (!(await lstatOptional(root))) throw boundary(`Configured writable root does not exist: ${root}`);
  const rootStat = await fs.lstat(root);
  if (!rootStat.isDirectory()) throw boundary(`Configured writable root is not a directory: ${root}`);
  let current = root;
  for (const part of path.relative(root, directory).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const before = await lstatOptional(current);
    if (!before) {
      try { await fs.mkdir(current); } catch (error) { if (!isCode(error, "EEXIST")) throw error; }
    }
    const after = await fs.lstat(current).catch((error: unknown) => { throw boundary(`Writable directory changed during creation: ${current}`, error); });
    if (after.isSymbolicLink() || !after.isDirectory()) throw boundary(`Writable path component is not a real directory: ${current}`);
  }
  await assertNoSymlinkEscape(root, directory);
  return directory;
}

/** Re-check writable containment immediately before a mutation. */
export async function assertSafeMutationTarget(rootInput: string, candidateInput: string, allowRoot = false): Promise<string> {
  const root = path.resolve(rootInput);
  const candidate = resolveContained(root, candidateInput);
  if (!allowRoot && candidate === root) throw boundary(`Refusing to mutate configured root: ${root}`);
  await assertNoSymlinkEscape(root, candidate);
  const target = await lstatOptional(candidate);
  if (target?.isSymbolicLink()) throw boundary(`Refusing to mutate symbolic link target: ${candidate}`);
  return candidate;
}

export async function createWritableRoot(rootInput: string): Promise<string> {
  const root = path.resolve(rootInput);
  const parent = path.dirname(root);
  if (parent === root) throw boundary(`Refusing filesystem root as a writable renderer root: ${root}`);
  let ancestor = parent;
  while (!(await lstatOptional(ancestor))) {
    const next = path.dirname(ancestor);
    if (next === ancestor) throw boundary(`No existing ancestor for writable root: ${root}`);
    ancestor = next;
  }
  await assertAbsolutePathNoSymlinks(ancestor);
  await ensureSafeDirectory(ancestor, root);
  return root;
}

function diskError(error: unknown, filePath: string): never {
  if (isCode(error, "ENOSPC")) throw new RendererError({ code: "INSUFFICIENT_DISK_SPACE", message: `Insufficient disk space while writing ${filePath}` }, { cause: error });
  throw error;
}

async function safeTemporary(root: string, target: string): Promise<string> {
  const directory = await ensureSafeDirectory(root, path.dirname(target));
  const temporary = path.join(directory, `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`);
  await assertSafeMutationTarget(root, temporary);
  return temporary;
}

export async function writeAtomic(rootInput: string, filePathInput: string, data: string | Uint8Array, overwrite = true): Promise<void> {
  const root = path.resolve(rootInput); const filePath = resolveContained(root, filePathInput); const temporary = await safeTemporary(root, filePath);
  try {
    const handle = await fs.open(temporary, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW, 0o600);
    try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
    await assertSafeMutationTarget(root, temporary); await assertSafeMutationTarget(root, filePath);
    if (!overwrite && await pathExists(filePath)) throw new RendererError({ code: "OUTPUT_ALREADY_EXISTS", message: `Output already exists: ${filePath}` });
    await fs.rename(temporary, filePath);
    await assertSafeMutationTarget(root, filePath);
  } catch (error) { diskError(error, filePath); }
  finally { await assertSafeMutationTarget(root, temporary).then(() => fs.rm(temporary, { force: true }), () => undefined).catch(() => undefined); }
}

export async function writeJsonAtomic(root: string, filePath: string, value: unknown, overwrite = true): Promise<void> {
  await writeAtomic(root, filePath, `${JSON.stringify(value, null, 2)}\n`, overwrite);
}

export async function pathExists(filePath: string): Promise<boolean> { return fs.access(filePath).then(() => true, () => false); }
export async function fileSize(filePath: string): Promise<number> { return (await fs.stat(filePath)).size; }

export async function removeSafe(rootInput: string, targetInput: string, recursive = false): Promise<void> {
  const root = path.resolve(rootInput); const target = await assertSafeMutationTarget(root, targetInput);
  await assertNoSymlinkEscape(root, path.dirname(target));
  await fs.rm(target, { recursive, force: true });
}

export interface AtomicMutationHooks { readonly beforePromote?: () => void | Promise<void>; readonly linkFile?: (source: string, target: string) => Promise<void>; }

export async function linkOrCopy(rootInput: string, source: string, targetInput: string, hooks: AtomicMutationHooks = {}): Promise<void> {
  const root = path.resolve(rootInput); const target = resolveContained(root, targetInput); const temporary = await safeTemporary(root, target);
  try {
    await (hooks.linkFile ?? fs.link)(source, temporary).catch(async (error: unknown) => {
      if (!isCode(error, "EXDEV") && !isCode(error, "EPERM") && !isCode(error, "EACCES") && !isCode(error, "EMLINK")) throw error;
      await fs.copyFile(source, temporary, fsConstants.COPYFILE_EXCL);
    });
    await hooks.beforePromote?.();
    await assertSafeMutationTarget(root, temporary); await assertSafeMutationTarget(root, target);
    await fs.rename(temporary, target);
    await assertSafeMutationTarget(root, target);
  } catch (error) { diskError(error, target); }
  finally { await assertSafeMutationTarget(root, temporary).then(() => fs.rm(temporary, { force: true }), () => undefined).catch(() => undefined); }
}

export async function copyFileAtomic(rootInput: string, source: string, targetInput: string): Promise<void> {
  const root = path.resolve(rootInput); const target = resolveContained(root, targetInput); const temporary = await safeTemporary(root, target);
  try {
    await fs.copyFile(source, temporary, fsConstants.COPYFILE_EXCL);
    await assertSafeMutationTarget(root, temporary); await assertSafeMutationTarget(root, target);
    await fs.rename(temporary, target);
  } catch (error) { diskError(error, target); }
  finally { await assertSafeMutationTarget(root, temporary).then(() => fs.rm(temporary, { force: true }), () => undefined).catch(() => undefined); }
}

export async function promoteFile(rootInput: string, sourceInput: string, targetInput: string, overwrite: boolean): Promise<void> {
  const root = path.resolve(rootInput); const source = await assertSafeMutationTarget(root, sourceInput); const target = await assertSafeMutationTarget(root, targetInput);
  await ensureSafeDirectory(root, path.dirname(target));
  await assertSafeMutationTarget(root, source); await assertSafeMutationTarget(root, target);
  if (overwrite) await fs.rename(source, target);
  else {
    try { await fs.link(source, target); }
    catch (error) { if (isCode(error, "EEXIST")) throw new RendererError({ code: "OUTPUT_ALREADY_EXISTS", message: `Output already exists: ${target}` }); throw error; }
    await removeSafe(root, source);
  }
  await assertSafeMutationTarget(root, target);
}

export type StatfsProbe = (filePath: string) => Promise<{ readonly bavail: number | bigint; readonly bsize: number | bigint }>;
export interface DiskSpaceCheck { readonly availableBytes?: number; readonly requiredBytes: number; readonly checkedPath?: string; }

/** Check the nearest existing ancestor, which is necessarily on the target's filesystem. */
export async function assertSufficientDiskSpace(targetPath: string, requiredBytes: number, probe: StatfsProbe = fs.statfs): Promise<DiskSpaceCheck> {
  if (!Number.isSafeInteger(requiredBytes) || requiredBytes < 0) throw new RendererError({ code: "INTERNAL_ERROR", message: "Invalid disk-space estimate." });
  let candidate = path.resolve(targetPath);
  while (true) {
    try {
      const stat = await probe(candidate); const available = Number(stat.bavail) * Number(stat.bsize); if (!Number.isFinite(available) || available < 0) return { requiredBytes };
      if (available < requiredBytes) throw new RendererError({ code: "INSUFFICIENT_DISK_SPACE", message: `Insufficient disk space at ${candidate}`, details: { availableBytes: Math.floor(available), requiredBytes } });
      return { availableBytes: Math.floor(available), requiredBytes, checkedPath: candidate };
    } catch (error) {
      if (error instanceof RendererError) throw error;
      if (isCode(error, "ENOENT")) { const parent = path.dirname(candidate); if (parent !== candidate) { candidate = parent; continue; } }
      if (error instanceof Error && "code" in error && ["ENOSYS", "ENOTSUP", "EOPNOTSUPP", "EINVAL"].includes(String(error.code))) return { requiredBytes };
      if (isCode(error, "ENOSPC")) throw new RendererError({ code: "INSUFFICIENT_DISK_SPACE", message: `Insufficient disk space while checking ${candidate}` }, { cause: error });
      throw error;
    }
  }
}
