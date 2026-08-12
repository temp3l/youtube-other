#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { verifyRuntimeBuildFingerprint } from "../../../scripts/runtime-build-fingerprint.mjs";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const entrypoint = path.resolve(currentDir, "../dist/index.js");
const warningFlag = "--disable-warning=ExperimentalWarning";
const execArgs = process.execArgv.includes(warningFlag) ? process.execArgv : [warningFlag, ...process.execArgv];
const forwardedArgs = process.argv.slice(2);

function isSourceGroundedQaCommand(args) {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  return normalized[0] === "veronica-media" && normalized[1] === "source-grounded-qa";
}

let runtimeProvenance;
if (isSourceGroundedQaCommand(forwardedArgs)) {
  try {
    const [cli, strategicReinvention] = await Promise.all([
      verifyRuntimeBuildFingerprint("cli"),
      verifyRuntimeBuildFingerprint("strategic-reinvention"),
    ]);
    runtimeProvenance = JSON.stringify({
      mode: "VERIFIED_BUILT_MODE",
      cliEntrypoint: "apps/cli/dist/index.js",
      qaController: "packages/strategic-reinvention/dist/positioning-production-adapter.js",
      admissionGuard: "packages/strategic-reinvention/dist/positioning-production-adapter.js",
      fingerprints: [cli, strategicReinvention],
    });
  } catch (error) {
    globalThis.console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

const child = spawn(process.execPath, [...execArgs, entrypoint, ...forwardedArgs], {
  stdio: "inherit",
  env: {
    ...process.env,
    ...(runtimeProvenance ? { MEDIAFORGE_QA_RUNTIME_PROVENANCE: runtimeProvenance } : {}),
  },
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
