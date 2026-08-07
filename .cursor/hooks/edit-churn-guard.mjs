import fs from "node:fs";
import path from "node:path";
import { recordFileEdit } from "../../scripts/lib/verification-session-state.mjs";

const payloadPath = process.argv[2];
const EDIT_WARN_THRESHOLD = 12;
const EDIT_DENY_THRESHOLD = 20;

function respond(additionalContext) {
  process.stdout.write(
    JSON.stringify(
      additionalContext ? { additional_context: additionalContext } : {}
    )
  );
}

let payload;
try {
  payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
} catch (error) {
  respond(
    `Edit churn guard could not parse hook payload: ${error.message}. Treat this as a signal to stop editing and report status.`
  );
  process.exit(0);
}

const toolName = payload?.tool_name ?? payload?.toolName ?? "";
const toolInput = payload?.tool_input ?? payload?.toolInput ?? {};
const filePath =
  toolInput.path ??
  toolInput.file_path ??
  toolInput.target_notebook ??
  "";

if (!filePath || !/StrReplace|Write|EditNotebook/.test(toolName)) {
  respond();
  process.exit(0);
}

const absolutePath = path.isAbsolute(filePath)
  ? filePath
  : path.resolve(filePath);
const count = recordFileEdit(absolutePath);
const relativePath = path.relative(process.cwd(), absolutePath) || absolutePath;

if (count >= EDIT_DENY_THRESHOLD) {
  respond(
    `Edit churn stop rule triggered for ${relativePath} (${count} edits this session). Do not keep patching this file. Stop, run one focused test if needed, classify the failure, and report the exact blocker plus the smallest follow-up.`
  );
  process.exit(0);
}

if (count >= EDIT_WARN_THRESHOLD) {
  respond(
    `High edit churn on ${relativePath} (${count} edits this session). Prefer one structural fix or a focused regression test over more incremental StrReplace loops. After two failed targeted fixes on the same test, stop and report.`
  );
  process.exit(0);
}

respond();
process.exit(0);
