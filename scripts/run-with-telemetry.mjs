#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const argv = process.argv.slice(2);
const separatorIndex = argv.indexOf("--");
const scriptName = argv[0] ?? "mediaforge";
const command = separatorIndex >= 0 ? argv.slice(separatorIndex + 1) : argv.slice(1);
const forwardedArgs = [];
const executionId = process.env.MEDIAFORGE_EXECUTION_ID ?? randomUUID();
const startedAt = new Date().toISOString();

if (command.length === 0) {
  console.error(
    JSON.stringify({
      level: "error",
      event: "npm_script_wrapper_error",
      scriptName,
      executionId,
      message: "No command provided to telemetry wrapper.",
    })
  );
  process.exit(1);
}

const child = spawn(command[0], [...command.slice(1), ...forwardedArgs], {
  stdio: "inherit",
  env: {
    ...process.env,
    MEDIAFORGE_EXECUTION_ID: executionId,
    MEDIAFORGE_EXECUTION_STARTED_AT: startedAt,
    MEDIAFORGE_NPM_SCRIPT: scriptName,
    MEDIAFORGE_NPM_SCRIPT_COMMAND: command.join(" "),
    MEDIAFORGE_NPM_SCRIPT_ARGS: JSON.stringify(forwardedArgs),
  },
});

console.error(
  JSON.stringify({
    level: "info",
    event: "npm_script_start",
    scriptName,
    executionId,
    command: command.join(" "),
    argv: forwardedArgs,
    startedAt,
  })
);

let forwardedSignal = null;
const forwardSignal = (signal) => {
  forwardedSignal = signal;
  child.kill(signal);
};

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("close", (exitCode, signal) => {
  const endedAt = new Date().toISOString();
  console.error(
    JSON.stringify({
      level: "info",
      event: "npm_script_end",
      scriptName,
      executionId,
      command: command.join(" "),
      argv: forwardedArgs,
      startedAt,
      endedAt,
      durationMs: Date.parse(endedAt) - Date.parse(startedAt),
      exitCode,
      signal: signal ?? forwardedSignal,
      success: exitCode === 0 && !signal && !forwardedSignal,
    })
  );
  process.exit(exitCode ?? (signal ? 1 : 0));
});

child.on("error", (error) => {
  console.error(
    JSON.stringify({
      level: "error",
      event: "npm_script_spawn_failed",
      scriptName,
      executionId,
      command: command.join(" "),
      message: error instanceof Error ? error.message : String(error),
    })
  );
  process.exit(1);
});
