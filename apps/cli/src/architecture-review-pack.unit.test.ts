import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  ArchitectureReviewPackError,
  MANDATORY_ARCHITECTURE_SURFACES,
  discoverArchitectureReviewPack,
  runArchitectureReviewPack,
} from "./architecture-review-pack.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

async function write(root: string, relativePath: string, content: string): Promise<void> {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
}

async function fixture(input: { readonly missing?: string; readonly sourceOverrides?: Readonly<Record<string, string>> } = {}): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "architecture-review-pack-"));
  roots.push(root);
  await write(root, "package.json", JSON.stringify({ name: "fixture", packageManager: "pnpm@10.16.0" }));
  await write(root, "pnpm-workspace.yaml", "packages:\n  - apps/*\n  - packages/*\n");
  await write(root, "apps/cli/package.json", JSON.stringify({ name: "@mediaforge/cli", dependencies: { "@mediaforge/shared": "workspace:*" } }));
  await write(root, "packages/shared/package.json", JSON.stringify({ name: "@mediaforge/shared", exports: "./src/index.ts" }));
  await write(root, "packages/shared/src/index.ts", "export const hash = 'safe';\n");
  await write(root, "packages/shared/src/cache.unit.test.ts", "export const cacheTest = true;\n");
  for (const surface of MANDATORY_ARCHITECTURE_SURFACES) {
    if (surface.path === input.missing) continue;
    await write(root, surface.path, input.sourceOverrides?.[surface.path] ?? `export const ${surface.id.replaceAll("-", "_")} = process.env.OPENAI_API_KEY;\n`);
  }
  await write(root, "docs/architecture/current.md", "# Current architecture\n");
  await write(root, ".env", "API_KEY=should-never-appear-in-a-review-pack\n");
  await write(root, "packages/shared/src/credentials.ts", "const password = 'not-a-real-but-long-secret-value';\n");
  await write(root, "episodes/veronica/manifest.json", JSON.stringify({ sourceMetadata: { genre: "veronicabenini", variant: "full" } }));
  await write(root, "content-packs/youtube-history/manifest.json", JSON.stringify({ genre: "history", variant: "full" }));
  await write(root, "content-ideas/content/dark-truth/manifest.json", JSON.stringify({ genre: "dark-truth", variant: "short" }));
  await fs.symlink(path.join(root, "package.json"), path.join(root, "apps/cli/src/outside-link.ts"));
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("architecture review pack", () => {
  it("selects every mandatory source unchanged while excluding non-critical secret files and symlinks", async () => {
    const root = await fixture();
    const discovery = await discoverArchitectureReviewPack({ repositoryRoot: root, profile: "full" });
    const paths = discovery.files.map((file) => file.relativePath);

    for (const surface of MANDATORY_ARCHITECTURE_SURFACES) expect(paths).toContain(surface.path);
    expect(paths).not.toContain(".env");
    expect(paths).not.toContain("packages/shared/src/credentials.ts");
    expect(discovery.exclusions).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "apps/cli/src/outside-link.ts" }),
      expect.objectContaining({ path: "packages/shared/src/credentials.ts", reason: "excluded by secret-safety scan" }),
    ]));
  });

  it("redacts a mandatory literal secret while preserving source structure and environment variable names", async () => {
    const criticalPath = "packages/image-generation/src/openai-image.ts";
    const root = await fixture({
      sourceOverrides: {
        [criticalPath]: 'const apiKey = "sk_abcdefghijklmnopqrstuvwxyz123456";\nexport const fromEnvironment = process.env.OPENAI_API_KEY;\n',
      },
    });
    const result = await runArchitectureReviewPack({ repositoryRoot: root, profile: "full", output: "out" });
    const packed = (await execFileAsync("unzip", ["-p", result.archive ?? "", `repository/${criticalPath}`])).stdout;
    const surface = (await execFileAsync("unzip", ["-p", result.archive ?? "", "ARCHITECTURE-SURFACE.tsv"])).stdout;

    expect(packed).toContain('const apiKey = "[REDACTED_SECRET]"');
    expect(packed).toContain("process.env.OPENAI_API_KEY");
    expect(packed).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
    expect(surface).toContain(`${criticalPath}\tOpenAI image provider adapter`);
    expect(surface).toContain("\ttrue\t1\t");
    expect(result.secretSafety).toBe("PASS");
    expect(result.architectureSurfaceCompleteness).toBe("PASS");
  });

  it("fails closed when a mandatory source is missing or cannot be safely sanitized", async () => {
    const missingRoot = await fixture({ missing: "packages/speech/src/platform/legacy-application-adapter.ts" });
    await expect(runArchitectureReviewPack({ repositoryRoot: missingRoot, profile: "full", output: "out" })).rejects.toMatchObject({ code: "ARCHITECTURE_CRITICAL_SOURCE_MISSING" } satisfies Partial<ArchitectureReviewPackError>);

    const unsafeRoot = await fixture({ sourceOverrides: { "apps/cli/src/index.ts": "\0" } });
    await expect(runArchitectureReviewPack({ repositoryRoot: unsafeRoot, profile: "full", output: "out" })).rejects.toMatchObject({ code: "ARCHITECTURE_CRITICAL_SOURCE_SANITIZATION_FAILED" } satisfies Partial<ArchitectureReviewPackError>);
  });

  it("creates an archive containing every mandatory path with deterministic source identity", async () => {
    const root = await fixture();
    const first = await runArchitectureReviewPack({ repositoryRoot: root, profile: "full", output: "out" });
    const second = await runArchitectureReviewPack({ repositoryRoot: root, profile: "full", output: "out" });

    expect(first.contentHash).toBe(second.contentHash);
    expect(second.contentUnchanged).toBe(true);
    const listing = (await execFileAsync("unzip", ["-Z1", first.archive ?? ""])).stdout;
    for (const surface of MANDATORY_ARCHITECTURE_SURFACES) expect(listing).toContain(`repository/${surface.path}`);
    expect(listing).toContain("ARCHITECTURE-SURFACE.tsv");
    expect(listing).not.toContain("repository/.env");
  });

  it("supports dry runs and requires an explicit base for delta", async () => {
    const root = await fixture();
    const result = await runArchitectureReviewPack({ repositoryRoot: root, profile: "code", dryRun: true });
    expect(result.validation).toEqual(["dry-run selection and mandatory architecture surface validation completed; no staging or archive created"]);
    await expect(runArchitectureReviewPack({ repositoryRoot: root, profile: "delta", dryRun: true })).rejects.toThrow("requires --base");
  });
});
