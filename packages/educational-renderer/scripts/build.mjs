import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(packageRoot, "dist");
const buildInfo = path.join(packageRoot, ".cache", "tsconfig.tsbuildinfo");

await fs.rm(output, { recursive: true, force: true });
await fs.rm(buildInfo, { force: true });

const exitCode = await new Promise((resolve, reject) => {
  const child = spawn("pnpm", ["exec", "tsc", "-p", "tsconfig.json"], {
    cwd: packageRoot,
    stdio: "inherit",
  });
  child.once("error", reject);
  child.once("close", (code) => resolve(code ?? 1));
});

if (exitCode !== 0) process.exitCode = exitCode;
