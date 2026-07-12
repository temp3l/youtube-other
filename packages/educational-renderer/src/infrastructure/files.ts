import { createHash } from "node:crypto";
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
export async function hashFile(filePath: string): Promise<string> { const hash = createHash("sha256"); hash.update(await fs.readFile(filePath)); return hash.digest("hex"); }

export function resolveContained(rootInput: string, candidateInput: string): string {
  const root = path.resolve(rootInput);
  const candidate = path.resolve(root, candidateInput);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) throw new RendererError({ code: "FILESYSTEM_BOUNDARY_VIOLATION", message: `Path escapes configured root: ${candidateInput}` });
  return candidate;
}

export async function assertNoSymlinkEscape(rootInput: string, candidateInput: string): Promise<void> {
  const root = path.resolve(rootInput);
  const candidate = resolveContained(root, candidateInput);
  const relative = path.relative(root, candidate);
  let current = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = await fs.lstat(current).catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
      throw error;
    });
    if (stat?.isSymbolicLink()) throw new RendererError({ code: "FILESYSTEM_BOUNDARY_VIOLATION", message: `Symbolic links are not allowed in writable paths: ${current}` });
    if (!stat) break;
  }
}

export async function writeAtomic(filePath: string, data: string | Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  try { await fs.writeFile(temporary, data); await fs.rename(temporary, filePath); } finally { await fs.rm(temporary, { force: true }).catch(() => undefined); }
}
export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> { await writeAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`); }
export async function pathExists(filePath: string): Promise<boolean> { return fs.access(filePath).then(() => true, () => false); }
export async function fileSize(filePath: string): Promise<number> { return (await fs.stat(filePath)).size; }
export async function linkOrCopy(source: string, target: string): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.rm(target, { force: true });
  await fs.link(source, target).catch(async () => fs.copyFile(source, target));
}
