import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { importCurriculumSeed } from "../curriculum/importer.js";
import { buildLessonVariant } from "../lesson/variant-builder.js";
import { assertFactCoverage } from "./fact-coverage-gate.js";
import {
  createVerifierRequest,
  MathVerifierBoundaryError,
  SympyVerifierAdapter,
} from "./sympy-adapter.js";

const pythonExecutable =
  process.env["MATH_VERIFIER_PYTHON"] ??
  path.resolve("python/math-verifier/.venv/bin/python");

const integerCheck = {
  checkId: "check-boundary",
  kind: "evaluate" as const,
  expression: { kind: "integer" as const, value: "1" },
  expected: {
    kind: "scalar" as const,
    expression: { kind: "integer" as const, value: "1" },
  },
  critical: true,
};

async function fakeWorker(source: string): Promise<string> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "math-verifier-fixture-")
  );
  const moduleRoot = path.join(root, "src", "math_verifier");
  await fs.mkdir(moduleRoot, { recursive: true });
  await fs.writeFile(path.join(moduleRoot, "__init__.py"), "", "utf8");
  await fs.writeFile(path.join(moduleRoot, "worker.py"), source, "utf8");
  return root;
}

function validResponse(overrides = ""): string {
  return `
import json, sys
request = json.load(sys.stdin)
response = {
    "protocolVersion": "math-verifier.v3",
    "requestId": request["requestId"],
    "inputHash": request["inputHash"],
    "verifierVersion": "3.0.0",
    "sympyVersion": "1.14.0",
    "status": "passed",
    "checks": [{"checkId": check["checkId"], "status": "passed"} for check in request["checks"]],
}
${overrides}
sys.stdout.write(json.dumps(response, separators=(",", ":")))
`;
}

async function expectBoundaryCode(
  promise: Promise<unknown>,
  codes: string | readonly string[]
): Promise<void> {
  try {
    await promise;
    throw new Error("Expected verifier boundary failure.");
  } catch (error) {
    expect(error).toBeInstanceOf(MathVerifierBoundaryError);
    expect(Array.isArray(codes) ? codes : [codes]).toContain(
      (error as MathVerifierBoundaryError).code
    );
  }
}

describe("SymPy adapter", () => {
  it("verifies the pilot example and challenge through protocol v3", async () => {
    const curriculum = importCurriculumSeed(
      await fs.readFile(
        "docs/mathe/curriculum/03-machine-readable-seed.md",
        "utf8"
      )
    );
    const skill = curriculum.skills.find(
      (item) => item.skillId === "M5-ZO-001"
    );
    expect(skill).toBeDefined();
    if (!skill) return;
    const lesson = buildLessonVariant(skill, "standard");
    const adapter = new SympyVerifierAdapter({
      workerRoot: "python/math-verifier",
      pythonExecutable,
    });
    const response = await adapter.verify(
      createVerifierRequest("pilot-standard", lesson.checks)
    );
    expect(response.status).toBe("passed");
    expect(() => assertFactCoverage(lesson, response)).not.toThrow();
  });

  it("turns crash-before-stdin into one structured blocking error", async () => {
    if (process.platform === "win32") return;
    const adapter = new SympyVerifierAdapter({
      workerRoot: "python/math-verifier",
      pythonExecutable: "/bin/false",
      timeoutMs: 1_000,
    });
    await expectBoundaryCode(
      adapter.verify(createVerifierRequest("early-exit", [integerCheck])),
      ["PROCESS_EXIT", "PROCESS_IO"]
    );
  });

  it("turns spawn failure into one structured blocking error", async () => {
    const adapter = new SympyVerifierAdapter({
      workerRoot: "python/math-verifier",
      pythonExecutable: "/definitely-not-a-math-verifier-python",
      timeoutMs: 1_000,
    });
    await expectBoundaryCode(
      adapter.verify(createVerifierRequest("spawn-failure", [integerCheck])),
      "SPAWN_ERROR"
    );
  });

  it.each([
    ["nonzero exit", "import sys; sys.exit(7)", "PROCESS_EXIT"],
    [
      "stderr on success",
      validResponse('sys.stderr.write("diagnostic\\n")'),
      "STDERR_OUTPUT",
    ],
    [
      "noisy stdout",
      'import sys; sys.stdin.read(); sys.stdout.write("diagnostic\\n{}")',
      "MALFORMED_OUTPUT",
    ],
    [
      "malformed JSON",
      'import sys; sys.stdin.read(); sys.stdout.write("{not-json")',
      "MALFORMED_OUTPUT",
    ],
    [
      "multiple JSON values",
      'import sys; sys.stdin.read(); sys.stdout.write("{}{}")',
      "MALFORMED_OUTPUT",
    ],
    [
      "protocol mismatch",
      validResponse('response["protocolVersion"] = "math-verifier.v2"'),
      "VERSION_MISMATCH",
    ],
    [
      "verifier version mismatch",
      validResponse('response["verifierVersion"] = "0.0.0"'),
      "VERSION_MISMATCH",
    ],
    [
      "SymPy version mismatch",
      validResponse('response["sympyVersion"] = "0.0.0"'),
      "VERSION_MISMATCH",
    ],
    [
      "hash mismatch",
      validResponse('response["inputHash"] = "0" * 64'),
      "IDENTITY_MISMATCH",
    ],
    [
      "request identity mismatch",
      validResponse('response["requestId"] = "different-request"'),
      "IDENTITY_MISMATCH",
    ],
    [
      "check identity mismatch",
      validResponse('response["checks"][0]["checkId"] = "different-check"'),
      "IDENTITY_MISMATCH",
    ],
  ])("blocks %s", async (_name, source, code) => {
    const root = await fakeWorker(source);
    const adapter = new SympyVerifierAdapter({
      workerRoot: root,
      pythonExecutable,
      timeoutMs: 1_000,
    });
    await expectBoundaryCode(
      adapter.verify(createVerifierRequest(`fixture-${code}`, [integerCheck])),
      code
    );
  });

  it.each([
    ["stdout", 'sys.stdout.write("x" * 4096); sys.stdout.flush()'],
    ["stderr", 'sys.stderr.write("x" * 4096); sys.stderr.flush()'],
  ])("bounds %s", async (_stream, output) => {
    const root = await fakeWorker(`import sys; sys.stdin.read(); ${output}`);
    const adapter = new SympyVerifierAdapter({
      workerRoot: root,
      pythonExecutable,
      maxOutputBytes: 128,
      timeoutMs: 1_000,
    });
    await expectBoundaryCode(
      adapter.verify(createVerifierRequest("output-limit", [integerCheck])),
      "OUTPUT_LIMIT"
    );
  });

  it("kills a timed-out worker process group within tolerance", async () => {
    if (process.platform === "win32") return;
    const sentinel = path.join(
      os.tmpdir(),
      `math-verifier-descendant-${process.pid}-${Date.now()}`
    );
    const childScript = `import pathlib, time; time.sleep(0.5); pathlib.Path(${JSON.stringify(
      sentinel
    )}).write_text("survived")`;
    const root = await fakeWorker(`
import subprocess, sys, time
subprocess.Popen([sys.executable, "-c", ${JSON.stringify(childScript)}])
time.sleep(30)
`);
    const adapter = new SympyVerifierAdapter({
      workerRoot: root,
      pythonExecutable,
      timeoutMs: 100,
    });
    const startedAt = Date.now();
    await expectBoundaryCode(
      adapter.verify(createVerifierRequest("timeout-tree", [integerCheck])),
      "TIMEOUT"
    );
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    await new Promise((resolve) => setTimeout(resolve, 700));
    await expect(fs.stat(sentinel)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
