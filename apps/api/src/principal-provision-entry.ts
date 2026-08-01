import { provisionPrincipalFromEnvironment } from "./principal-provision.js";

provisionPrincipalFromEnvironment().then(
  (principal) => {
    process.stdout.write(`${JSON.stringify({
      workspaceId: principal.workspaceId,
      principalId: principal.principalId,
      kind: principal.kind,
      permissions: principal.permissions,
      revision: principal.revision,
    })}\n`);
  },
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
);
