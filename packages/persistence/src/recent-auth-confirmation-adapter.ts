import crypto from "node:crypto";

import type {
  PostgresRecentAuthConfirmationRepository,
  RecentAuthConfirmationBinding,
} from "./postgres-recent-auth-confirmation-repository.js";

type RecentAuthRecord = RecentAuthConfirmationBinding & {
  readonly confirmationId: string;
  readonly authenticatedAt: string;
  readonly expiresAt: string;
};

/**
 * Server-composition bridge shared by the OIDC callback recorder and BFF
 * action consumer. It never exposes a query primitive to browser code.
 */
export function createRecentAuthConfirmationAdapter(input: {
  readonly repository: Pick<PostgresRecentAuthConfirmationRepository, "record" | "consume">;
  readonly createConfirmationId?: () => string;
}) {
  const createConfirmationId = input.createConfirmationId ?? crypto.randomUUID;
  return {
    recordRecentAuth: async (value: Omit<RecentAuthRecord, "confirmationId">): Promise<void> =>
      input.repository.record({ ...value, confirmationId: createConfirmationId() }),
    recentAuthConsumer: {
      consume: (value: RecentAuthConfirmationBinding & { readonly now: string }): Promise<boolean> =>
        input.repository.consume(value),
    },
  };
}
