import { provisionWebhookEndpointFromEnvironment } from "./webhook-endpoint-provision.js";

provisionWebhookEndpointFromEnvironment().then(
  (endpoint) => {
    process.stdout.write(
      `${JSON.stringify({
        workspaceId: endpoint.workspaceId,
        endpointId: endpoint.endpointId,
        url: endpoint.url,
        secretVersion: endpoint.secretVersion,
        eventFilters: endpoint.eventFilters,
        revision: endpoint.revision,
      })}\n`
    );
  },
  (error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
);
