import { describe, expect, it } from "vitest";
import { consumeRecentAuthConfirmation } from "./recent-auth-step-up.js";

describe("recent auth step-up consumer", () => {
  it("fails closed without a server-bound CSRF session and binds every consume", async () => {
    const consume = async (input: { readonly workspaceId: string; readonly principalId: string; readonly action: string; readonly csrfSessionId: string }) => input.workspaceId === "ws-1" && input.principalId === "principal-1" && input.action === "credential.rotate" && input.csrfSessionId === "csrf-1";
    const identity = { session: { workspaceId: "ws-1", principalId: "principal-1", principalName: "Ada", workspaceName: "Pilot", profiles: ["history"] as const }, csrfSessionId: "csrf-1" };
    await expect(consumeRecentAuthConfirmation({ identity, action: "credential.rotate", consumer: { consume } })).resolves.toBe(true);
    await expect(consumeRecentAuthConfirmation({ identity: { session: identity.session }, action: "credential.rotate", consumer: { consume } })).resolves.toBe(false);
  });
});
