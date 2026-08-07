import fs from "node:fs";
import path from "node:path";
import { resetVerificationSessionState } from "../../scripts/lib/verification-session-state.mjs";

const HANDOFF_PATH = path.resolve(
  "prompts/history-v35-cursor/00-restart-handoff.md"
);

resetVerificationSessionState();

let handoff = "";
try {
  handoff = fs.readFileSync(HANDOFF_PATH, "utf8").trim();
} catch {
  handoff = "";
}

const messages = [
  "Repository verification guardrails are active for this session.",
  "Run exactly one `pnpm test:focused -- <test-file>` per shell command.",
  "Do not use ad-hoc `node --input-type=module -e` debug scripts.",
  "After two targeted fixes fail to move the same focused test, stop and report instead of looping.",
  "Build commands and chained build+test commands are blocked unless explicitly authorized.",
];

if (handoff) {
  messages.push(
    "Active restart handoff is available at prompts/history-v35-cursor/00-restart-handoff.md. Read it before continuing History V3.5 work."
  );
}

process.stdout.write(
  JSON.stringify({
    additional_context: messages.join(" "),
  })
);
