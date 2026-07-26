#!/usr/bin/env node
import process from "node:process";
import {
  mathRenderWorkerExitCode,
  mathRenderWorkerFailureEvent,
  runMathRenderWorker,
} from "./math-render-worker.js";

// The fixed container UID must leave bind-mounted artifacts readable and
// removable by the host operator. Integrity is enforced by hashes, and the
// worker remains confined to the two writable mounts.
process.umask(0o000);

runMathRenderWorker(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(mathRenderWorkerFailureEvent(error));
  process.exitCode = mathRenderWorkerExitCode(error);
});
