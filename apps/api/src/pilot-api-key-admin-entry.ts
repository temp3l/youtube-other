import {
  administerPilotApiKeyFromEnvironment,
  pilotApiKeyAdminOutput,
} from "./pilot-api-key-admin.js";

administerPilotApiKeyFromEnvironment().then(
  (result) => {
    process.stdout.write(
      `${JSON.stringify(pilotApiKeyAdminOutput(result))}\n`
    );
  },
  (error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
);
