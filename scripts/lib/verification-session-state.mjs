import fs from "node:fs";
import path from "node:path";

const STATE_DIR = path.resolve(".cursor/hooks-state");
const STATE_PATH = path.join(STATE_DIR, "verification-session.json");

function emptyState() {
  return {
    shellCommands: {},
    fileEdits: {},
    startedAt: new Date().toISOString(),
  };
}

export function readVerificationSessionState() {
  try {
    const raw = fs.readFileSync(STATE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return emptyState();
  }
}

export function writeVerificationSessionState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function resetVerificationSessionState() {
  writeVerificationSessionState(emptyState());
}

export function normalizeShellCommand(command) {
  return command.trim().replace(/\s+/g, " ");
}

export function recordShellCommand(command) {
  const state = readVerificationSessionState();
  const key = normalizeShellCommand(command);
  state.shellCommands[key] = (state.shellCommands[key] ?? 0) + 1;
  writeVerificationSessionState(state);
  return state.shellCommands[key];
}

export function recordFileEdit(filePath) {
  const state = readVerificationSessionState();
  const key = filePath.trim();
  state.fileEdits[key] = (state.fileEdits[key] ?? 0) + 1;
  writeVerificationSessionState(state);
  return state.fileEdits[key];
}
