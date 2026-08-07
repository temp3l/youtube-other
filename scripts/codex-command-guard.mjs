import fs from "node:fs";
import { evaluateVerificationCommand } from "./lib/verification-command-policy.mjs";
import {
  normalizeShellCommand,
  readVerificationSessionState,
  recordShellCommand,
} from "./lib/verification-session-state.mjs";
const payloadPath = process.argv[2];

function emit(output) {
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

function approve() {
  emit({ decision: "approve" });
}

function block(reason) {
  emit({ decision: "block", reason });
}

let payload;
try {
  payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
} catch (error) {
  block(`Invalid Codex hook payload for repository command guard: ${error.message}`);
  process.exit(0);
}

if (payload?.hook_event_name !== "PreToolUse" && payload?.hookEventName !== "PreToolUse") {
  block("Unexpected hook payload for repository command guard.");
  process.exit(0);
}

if (payload.tool_name !== "Bash") {
  approve();
  process.exit(0);
}

const command = payload?.tool_input?.command;
const normalized = normalizeShellCommand(command ?? "");
const priorCount = readVerificationSessionState().shellCommands[normalized] ?? 0;
const result = evaluateVerificationCommand(command, {
  allowBroadVerification: process.env.ALLOW_BROAD_VERIFICATION === "1",
  allowAdhocDebug: process.env.ALLOW_ADHOC_DEBUG === "1",
  shellCommandCount: priorCount,
});

if (result.allowed) {
  if (normalized) {
    recordShellCommand(command);
  }
  approve();
} else {
  block(result.reason);
}
