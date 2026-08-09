import type { SaasIdentity } from "./saas-runtime.js";

export interface RecentAuthConfirmationConsumer {
  consume(input: { readonly workspaceId: string; readonly principalId: string; readonly action: string; readonly csrfSessionId: string; readonly now: string }): Promise<boolean>;
}

/** Fails closed if the authenticated session lacks a server-bound CSRF ID. */
export async function consumeRecentAuthConfirmation(input: { readonly identity: SaasIdentity; readonly action: string; readonly consumer?: RecentAuthConfirmationConsumer; readonly now?: () => Date }): Promise<boolean> {
  if (!input.consumer || !input.identity.csrfSessionId) return false;
  return input.consumer.consume({ workspaceId: input.identity.session.workspaceId, principalId: input.identity.session.principalId, action: input.action, csrfSessionId: input.identity.csrfSessionId, now: (input.now ?? (() => new Date()))().toISOString() });
}
