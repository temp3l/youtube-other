import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

interface RunResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function repoRoot(): string {
  return path.resolve(import.meta.dirname, "../../..");
}

async function runNode(
  args: readonly string[],
  options: { readonly cwd?: string } = {}
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...args], {
      cwd: options.cwd ?? repoRoot(),
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

async function copyPackageRuntime(
  packageName: string,
  destinationRoot: string
): Promise<void> {
  const source = path.join(repoRoot(), "packages", packageName);
  const destination = path.join(
    destinationRoot,
    "node_modules",
    "@mediaforge",
    packageName
  );
  await fs.mkdir(path.join(destination, "dist"), { recursive: true });
  await fs.copyFile(
    path.join(source, "package.json"),
    path.join(destination, "package.json")
  );
  await fs.cp(path.join(source, "dist"), path.join(destination, "dist"), {
    recursive: true,
    force: true,
  });
}

async function createCopiedMathConsumer(): Promise<string> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "mediaforge-math-package-")
  );
  await fs.mkdir(path.join(root, "node_modules", "@mediaforge"), {
    recursive: true,
  });
  await copyPackageRuntime("domain", root);
  await copyPackageRuntime("math-education", root);
  await copyPackageRuntime("shared", root);
  await copyPackageRuntime("workflow-engine", root);
  for (const packageName of ["observability", "speech"]) {
    await fs.symlink(
      path.join(repoRoot(), "node_modules", "@mediaforge", packageName),
      path.join(root, "node_modules", "@mediaforge", packageName),
      "dir"
    );
  }
  await fs.symlink(
    path.join(repoRoot(), "node_modules", "zod"),
    path.join(root, "node_modules", "zod"),
    "dir"
  );
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ type: "module" }, null, 2),
    "utf8"
  );
  return root;
}

describe("packaged CLI and math workspace packages", () => {
  it("imports math education from copied workspace runtime JavaScript", async () => {
    const consumer = await createCopiedMathConsumer();
    const result = await runNode(
      [
        "-e",
        "import('@mediaforge/math-education').then((m) => console.log(typeof m.loadCurriculumRelease, typeof m.importCurriculumSeed))",
      ],
      { cwd: consumer }
    );

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe("function function");
    expect(result.stderr).not.toContain("ERR_UNKNOWN_FILE_EXTENSION");
  });

  it("starts root, horror, and math help through the real packaged entrypoint", async () => {
    const checks = [
      { args: ["--help"], expected: "Usage: mediaforge" },
      {
        args: ["stories", "production", "batch", "--help"],
        expected: "Usage: mediaforge stories production batch",
      },
      { args: ["math", "--help"], expected: "Usage: mediaforge math" },
    ];

    for (const check of checks) {
      const result = await runNode([
        "apps/cli/bin/mediaforge.js",
        ...check.args,
      ]);
      expect(
        result.code,
        `${check.args.join(" ")} stderr:\n${result.stderr}`
      ).toBe(0);
      expect(result.stdout).toContain(check.expected);
      expect(result.stderr).not.toContain("ERR_UNKNOWN_FILE_EXTENSION");
    }
  });

  it("dispatches math curriculum validate and import dry-run through the real packaged entrypoint", async () => {
    const validate = await runNode([
      "apps/cli/bin/mediaforge.js",
      "math",
      "curriculum",
      "validate",
    ]);
    expect(validate.code, validate.stderr).toBe(0);
    expect(validate.stdout).toContain('"structurallyValid": true');
    expect(validate.stderr).not.toContain("ERR_UNKNOWN_FILE_EXTENSION");

    const dryRun = await runNode([
      "apps/cli/bin/mediaforge.js",
      "math",
      "curriculum",
      "import",
      "--dry-run",
    ]);
    expect(dryRun.code, dryRun.stderr).toBe(0);
    expect(dryRun.stdout).toContain('"dryRun": true');
    expect(dryRun.stderr).not.toContain("ERR_UNKNOWN_FILE_EXTENSION");
  });

  it("runs the deterministic workflow operator loop through the packaged CLI", async () => {
    const unitRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "mediaforge-workflow-packaged-")
    );
    const invoke = (...args: readonly string[]) =>
      runNode([
        "apps/cli/bin/mediaforge.js",
        "workflow",
        "fixture",
        ...args,
        "--unit-root",
        unitRoot,
      ]);

    const dryRun = await invoke("run-next", "--dry-run");
    expect(dryRun.code, dryRun.stderr).toBe(0);
    await expect(fs.stat(path.join(unitRoot, "state"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    const interrupted = await invoke("run-next", "--interrupt");
    expect(interrupted.code, interrupted.stderr).toBe(130);
    expect(interrupted.stderr).toContain('"code": "INTERRUPTED"');

    const resume = await invoke("resume");
    expect(resume.code, resume.stderr).toBe(0);
    expect(resume.stdout).toContain('"taskId": "fixture.prepare"');

    const runNext = await invoke("run-next");
    expect(runNext.code, runNext.stderr).toBe(0);
    expect(runNext.stdout).toContain('"taskId": "fixture.finish"');

    const reconcile = await invoke("reconcile");
    expect(reconcile.code, reconcile.stderr).toBe(0);
    const validateState = await invoke("validate-state");
    expect(validateState.code, validateState.stderr).toBe(0);
    const status = await invoke("status");
    expect(status.code, status.stderr).toBe(0);
    expect(status.stdout).toContain('"complete": true');
  });
});
