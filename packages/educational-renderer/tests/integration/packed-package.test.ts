import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

it("passes packed-consumer acceptance", async () => {
  const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(packageRoot, "scripts", "package-acceptance.mjs")], { cwd: packageRoot, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); }); child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.once("error", reject); child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
  expect(result.stdout).toContain("packed-consumer: ok");
}, 120_000);
