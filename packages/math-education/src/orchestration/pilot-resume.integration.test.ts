import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runPilotSimulation } from "./pilot-simulation.js";

const pythonExecutable =
  process.env["MATH_VERIFIER_PYTHON"] ??
  path.resolve("python/math-verifier/.venv/bin/python");

async function fileState(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (!entry.name.endsWith(".lock"))
        result[path.relative(root, target)] = await fs.readFile(target, "utf8");
    }
  };
  await visit(root);
  return result;
}

describe("pilot resume", () => {
  it("reuses unchanged hash-valid outputs and repairs a missing output", async () => {
    const workspaceDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "math-pilot-resume-")
    );
    const options = {
      repositoryRoot: process.cwd(),
      workspaceDir,
      skillId: "M5-ZO-001",
      variant: "standard" as const,
      languages: ["de" as const],
      pythonExecutable,
    };
    const first = await runPilotSimulation(options);
    expect(first.cached).toBe(false);
    const before = await fileState(workspaceDir);

    const cached = await runPilotSimulation({ ...options, resume: true });
    expect(cached.cached).toBe(true);
    expect(await fileState(workspaceDir)).toEqual(before);

    const verificationPath = path.join(
      workspaceDir,
      first.lessonId,
      "canonical",
      "verification.json"
    );
    const verificationBefore = await fs.readFile(verificationPath, "utf8");
    await fs.unlink(
      path.join(workspaceDir, first.lessonId, "locales", "de", "metadata.json")
    );
    const downstreamRepair = await runPilotSimulation({
      ...options,
      pythonExecutable: "/bin/false",
      resume: true,
    });
    expect(downstreamRepair.cached).toBe(false);
    expect(await fs.readFile(verificationPath, "utf8")).toBe(
      verificationBefore
    );

    await fs.unlink(verificationPath);
    const repaired = await runPilotSimulation({ ...options, resume: true });
    expect(repaired.cached).toBe(false);
    await expect(
      fs.access(
        path.join(
          workspaceDir,
          first.lessonId,
          "canonical",
          "verification.json"
        )
      )
    ).resolves.toBeUndefined();
  });

  it("simulates approved number, geometry, and data candidates", async () => {
    const workspaceDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "math-domain-candidates-")
    );
    for (const skillId of ["M5-ZO-001", "M5-GM-002", "M5-DZ-001"]) {
      const result = await runPilotSimulation({
        repositoryRoot: process.cwd(),
        workspaceDir,
        skillId,
        variant: "standard",
        languages: ["de"],
        pythonExecutable,
      });
      const verification = JSON.parse(
        await fs.readFile(
          path.join(
            workspaceDir,
            result.lessonId,
            "canonical",
            "verification.json"
          ),
          "utf8"
        )
      ) as { status?: unknown };
      expect(verification.status).toBe("passed");
    }
  });

  it("reruns localized display verification for all five locked locales", async () => {
    const workspaceDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "math-localized-display-")
    );
    const result = await runPilotSimulation({
      repositoryRoot: process.cwd(),
      workspaceDir,
      skillId: "M5-ZO-001",
      variant: "standard",
      languages: ["de", "en", "es", "fr", "pt"],
      pythonExecutable,
    });
    const lockHashes = new Set<string>();
    for (const language of ["de", "en", "es", "fr", "pt"] as const) {
      const localeRoot = path.join(
        workspaceDir,
        result.lessonId,
        "locales",
        language
      );
      const narration = JSON.parse(
        await fs.readFile(path.join(localeRoot, "narration.json"), "utf8")
      ) as { factLockHash: string; region: string };
      const verification = JSON.parse(
        await fs.readFile(
          path.join(localeRoot, "display-verification.json"),
          "utf8"
        )
      ) as { status: string };
      lockHashes.add(narration.factLockHash);
      expect(verification.status).toBe("passed");
    }
    expect(lockHashes).toHaveLength(1);
  });
});
