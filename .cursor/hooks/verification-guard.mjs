import fs from "node:fs";
import { evaluateVerificationCommand } from "../../scripts/lib/verification-command-policy.mjs";

const payloadPath = process.argv[2];

function allow() {
  process.stdout.write(JSON.stringify({ permission: "allow" }));
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      permission: "deny",
      user_message: reason,
      agent_message: reason,
    })
  );
}

let payload;
try {
  payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
} catch (error) {
  deny(`Invalid Cursor hook payload for verification guard: ${error.message}`);
  process.exit(0);
}

const command = payload?.command ?? payload?.tool_input?.command;
const result = evaluateVerificationCommand(command, {
  allowBroadVerification: process.env.ALLOW_BROAD_VERIFICATION === "1",
  allowAdhocDebug: process.env.ALLOW_ADHOC_DEBUG === "1",
});

if (result.allowed) {
  allow();
} else {
  deny(result.reason);
}
