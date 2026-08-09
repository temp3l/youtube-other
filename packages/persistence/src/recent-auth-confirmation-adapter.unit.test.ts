import { describe, expect, it, vi } from "vitest";

import { createRecentAuthConfirmationAdapter } from "./recent-auth-confirmation-adapter.js";

describe("recent auth confirmation composition adapter", () => {
  it("uses one repository for recording and consuming the exact security binding", async () => {
    const record = vi.fn(async () => undefined);
    const consume = vi.fn(async () => true);
    const adapter = createRecentAuthConfirmationAdapter({
      repository: { record, consume },
      createConfirmationId: () => "confirmation-1",
    });
    await adapter.recordRecentAuth({ workspaceId: "workspace-1", principalId: "principal-1", action: "credential.issue", csrfSessionId: "session-1", authenticatedAt: "2026-08-09T12:00:00.000Z", expiresAt: "2026-08-09T12:05:00.000Z" });
    await expect(adapter.recentAuthConsumer.consume({ workspaceId: "workspace-1", principalId: "principal-1", action: "credential.issue", csrfSessionId: "session-1", now: "2026-08-09T12:01:00.000Z" })).resolves.toBe(true);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ confirmationId: "confirmation-1", action: "credential.issue", csrfSessionId: "session-1" }));
    expect(consume).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "workspace-1", principalId: "principal-1", action: "credential.issue", csrfSessionId: "session-1" }));
  });
});
