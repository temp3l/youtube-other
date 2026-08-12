import path from "node:path";

export type PackPathIssue = {
  code: "unsafe_path" | "path_escape" | "symlink" | "unexpected_root_entry";
  message: string;
  path?: string;
};

const unsafeSegmentPattern = /(?:^|[\\/])\.\.(?:[\\/]|$)/u;

export function normalizePackRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

export function isSafePackRelativePath(relativePath: string): boolean {
  if (!relativePath || relativePath.startsWith("/")) {
    return false;
  }
  const normalized = normalizePackRelativePath(relativePath);
  if (normalized.includes("\0")) {
    return false;
  }
  if (unsafeSegmentPattern.test(normalized)) {
    return false;
  }
  return /^[A-Za-z0-9._/\-]+$/u.test(normalized);
}

export function resolvePackPath(packRoot: string, relativePath: string): string | PackPathIssue {
  if (!isSafePackRelativePath(relativePath)) {
    return {
      code: "unsafe_path",
      message: `Unsafe pack relative path: ${relativePath}`,
      path: relativePath,
    };
  }
  const absolute = path.resolve(packRoot, relativePath);
  const normalizedRoot = path.resolve(packRoot);
  if (absolute !== normalizedRoot && !absolute.startsWith(`${normalizedRoot}${path.sep}`)) {
    return {
      code: "path_escape",
      message: `Path escapes pack root: ${relativePath}`,
      path: relativePath,
    };
  }
  return absolute;
}
