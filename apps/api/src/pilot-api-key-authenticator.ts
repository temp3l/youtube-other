import type { IncomingMessage } from "node:http";

import type { AuthenticatedPrincipal } from "@mediaforge/application";

/**
 * Explicit ApiKey scheme keeps pilot keys separate from OIDC Bearer tokens.
 * Deployments may compose the two authenticators with an intentional policy.
 */
export function createPilotApiKeyRequestAuthenticator(authenticator: {
  authenticate(token: string | undefined): Promise<AuthenticatedPrincipal | null>;
}): (request: IncomingMessage) => Promise<AuthenticatedPrincipal | null> {
  return (request) => {
    const authorization = request.headers.authorization;
    const token = authorization?.match(/^ApiKey (mfk_[A-Za-z0-9_.-]+)$/u)?.[1];
    return authenticator.authenticate(token);
  };
}
