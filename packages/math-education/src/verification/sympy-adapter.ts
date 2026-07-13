import { spawn } from "node:child_process";
import path from "node:path";
import {
  createMathCorrelationId,
  recordMathStageEvent,
} from "@mediaforge/observability";
import { canonicalHash } from "./canonical-json.js";
import {
  MATH_SPEC_VERSION,
  SYMPY_VERSION,
  VERIFIER_PROTOCOL_VERSION,
  VERIFIER_VERSION,
  verifierRequestSchema,
  verifierResponseSchema,
  type VerifierRequest,
  type VerifierResponse,
} from "./protocol-schemas.js";
import { type VerificationCheck } from "../domain/index.js";

export function createVerifierRequest(
  requestId: string,
  checks: readonly VerificationCheck[]
): VerifierRequest {
  const payload = {
    protocolVersion: VERIFIER_PROTOCOL_VERSION,
    requestId,
    mathSpecVersion: MATH_SPEC_VERSION,
    checks,
  };
  return verifierRequestSchema.parse({
    ...payload,
    inputHash: canonicalHash(payload),
  });
}

export interface SympyAdapterOptions {
  workerRoot: string;
  pythonExecutable?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export type MathVerifierBoundaryErrorCode =
  | "SPAWN_ERROR"
  | "PROCESS_IO"
  | "PROCESS_EXIT"
  | "TIMEOUT"
  | "OUTPUT_LIMIT"
  | "STDERR_OUTPUT"
  | "MALFORMED_OUTPUT"
  | "VERSION_MISMATCH"
  | "IDENTITY_MISMATCH"
  | "VERIFICATION_BLOCKED";

export class MathVerifierBoundaryError extends Error {
  override readonly name = "MathVerifierBoundaryError";

  constructor(
    readonly code: MathVerifierBoundaryErrorCode,
    message: string
  ) {
    super(message);
  }
}

function terminateProcessGroup(
  child: ReturnType<typeof spawn>,
  signal: NodeJS.Signals = "SIGKILL"
): void {
  try {
    if (process.platform !== "win32" && child.pid !== undefined) {
      process.kill(-child.pid, signal);
    } else {
      child.kill(signal);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
    try {
      child.kill(signal);
    } catch {
      // The boundary still settles as failed even if the OS has reaped the child.
    }
  }
}

function resolvePythonExecutable(executable: string): string {
  if (path.isAbsolute(executable)) return executable;
  if (executable.includes("/") || executable.includes("\\")) {
    return path.resolve(executable);
  }
  return executable;
}

export class SympyVerifierAdapter {
  constructor(private readonly options: SympyAdapterOptions) {}
  verify(request: VerifierRequest): Promise<VerifierResponse> {
    const parsed = verifierRequestSchema.parse(request);
    return new Promise((resolve, reject) => {
      const timeoutMs = this.options.timeoutMs ?? 10_000;
      const maxOutputBytes = this.options.maxOutputBytes ?? 1_000_000;
      const startedAt = Date.now();
      const correlationId = createMathCorrelationId({
        lessonId: parsed.requestId,
        stage: "math-verification",
      });
      const contextBase = {
        correlationId,
        lessonId: parsed.requestId,
        stage: "math-verification" as const,
        provider: "local",
        model: "sympy",
        version: VERIFIER_VERSION,
        attempt: 1,
        cache: "miss" as const,
        costMicros: null,
      };
      const pythonExecutable = resolvePythonExecutable(
        this.options.pythonExecutable ??
          process.env["MATH_VERIFIER_PYTHON"] ??
          "python3"
      );
      const child = spawn(
        pythonExecutable,
        ["-m", "math_verifier.worker"],
        {
          cwd: path.resolve(this.options.workerRoot),
          stdio: ["pipe", "pipe", "pipe"],
          detached: process.platform !== "win32",
          env: {
            PATH: process.env["PATH"] ?? "",
            PYTHONPATH: path.resolve(this.options.workerRoot, "src"),
            PYTHONHASHSEED: "0",
            PYTHONNOUSERSITE: "1",
          },
        }
      );
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let settled = false;

      const fail = (
        code: MathVerifierBoundaryErrorCode,
        message: string,
        terminate = false
      ): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (terminate) terminateProcessGroup(child);
        recordMathStageEvent({
          status: "failure",
          context: {
            ...contextBase,
            durationMs: Date.now() - startedAt,
          },
          category: code,
          details: { message },
        });
        reject(new MathVerifierBoundaryError(code, message));
      };
      const succeed = (response: VerifierResponse): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        recordMathStageEvent({
          status: "success",
          context: {
            ...contextBase,
            durationMs: Date.now() - startedAt,
          },
          details: {
            requestId: response.requestId,
            inputHash: response.inputHash,
            checkCount: response.checks.length,
          },
        });
        resolve(response);
      };
      const timeout = setTimeout(() => {
        fail("TIMEOUT", `Math verifier timed out after ${timeoutMs} ms.`, true);
      }, timeoutMs);
      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBytes += chunk.length;
        if (stdoutBytes > maxOutputBytes) {
          fail("OUTPUT_LIMIT", "Math verifier stdout limit exceeded.", true);
          return;
        }
        stdout.push(chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderrBytes += chunk.length;
        if (stderrBytes > maxOutputBytes) {
          fail("OUTPUT_LIMIT", "Math verifier stderr limit exceeded.", true);
          return;
        }
        stderr.push(chunk);
      });
      child.stdout.on("error", (error) => {
        fail(
          "PROCESS_IO",
          `Math verifier stdout failed: ${error.message}`,
          true
        );
      });
      child.stderr.on("error", (error) => {
        fail(
          "PROCESS_IO",
          `Math verifier stderr failed: ${error.message}`,
          true
        );
      });
      child.on("error", (error) => {
        fail("SPAWN_ERROR", `Math verifier failed to start: ${error.message}`);
      });
      child.on("close", (code) => {
        if (settled) return;
        const stdoutText = Buffer.concat(stdout).toString("utf8");
        const stderrText = Buffer.concat(stderr).toString("utf8");
        if (code !== 0) {
          fail(
            "PROCESS_EXIT",
            `Math verifier exited ${code ?? "without a status"}: ${stderrText.trim()}`
          );
          return;
        }
        if (stderrBytes > 0) {
          fail("STDERR_OUTPUT", "Math verifier emitted stderr on success.");
          return;
        }
        try {
          const raw = JSON.parse(stdoutText) as Record<string, unknown>;
          if (
            raw["protocolVersion"] !== VERIFIER_PROTOCOL_VERSION ||
            raw["verifierVersion"] !== VERIFIER_VERSION ||
            raw["sympyVersion"] !== SYMPY_VERSION
          ) {
            fail(
              "VERSION_MISMATCH",
              "Math verifier response version mismatch."
            );
            return;
          }
          const response = verifierResponseSchema.parse(raw);
          if (
            response.requestId !== parsed.requestId ||
            response.inputHash !== parsed.inputHash ||
            response.checks.length !== parsed.checks.length ||
            response.checks.some(
              (check, index) => check.checkId !== parsed.checks[index]?.checkId
            )
          ) {
            fail(
              "IDENTITY_MISMATCH",
              "Math verifier response identity mismatch."
            );
            return;
          }
          if (
            response.status !== "passed" ||
            response.checks.some((check) => check.status !== "passed")
          ) {
            fail(
              "VERIFICATION_BLOCKED",
              `Math verification blocked: ${response.checks
                .filter((check) => check.status !== "passed")
                .map((check) => `${check.checkId}:${check.status}`)
                .join(", ")}`
            );
            return;
          }
          succeed(response);
        } catch (error) {
          fail(
            "MALFORMED_OUTPUT",
            `Math verifier emitted malformed output: ${(error as Error).message}`
          );
        }
      });
      child.stdin.on("error", (error) => {
        fail(
          "PROCESS_IO",
          `Math verifier stdin failed: ${error.message}`,
          true
        );
      });
      child.stdin.end(`${JSON.stringify(parsed)}\n`);
    });
  }
}
