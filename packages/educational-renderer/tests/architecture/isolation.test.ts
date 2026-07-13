import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
function boundary(args: string[] = []): Promise<{ code: number | null; stderr: string }> { return new Promise((resolve, reject) => { const child = spawn(process.execPath, [path.join(root, "scripts", "check-boundaries.mjs"), ...args], { stdio: ["ignore", "ignore", "pipe"] }); let stderr = ""; child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); }); child.once("error", reject); child.once("close", (code) => resolve({ code, stderr })); }); }
describe("package isolation", () => {
  it("enforces both package dependency directions", async () => { const result = await boundary(); expect(result.code, result.stderr).toBe(0); });
  it("detects disposable TypeScript and JavaScript violations in both directions", async () => { const result = await boundary(["--self-test"]); expect(result.code, result.stderr).toBe(0); });
});
