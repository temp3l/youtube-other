#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "history-v35-combine-episode-range.mjs"
);
const args = ["11", "20", ...process.argv.slice(2)];
const result = spawnSync(process.execPath, [scriptPath, ...args], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
