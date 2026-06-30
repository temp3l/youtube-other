#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const entrypoint = path.resolve(currentDir, "../dist/index.js");
const warningFlag = "--disable-warning=ExperimentalWarning";
const execArgs = process.execArgv.includes(warningFlag) ? process.execArgv : [warningFlag, ...process.execArgv];

const child = spawn(process.execPath, [...execArgs, entrypoint, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  globalThis.console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
