import type { IncomingMessage } from "node:http";
import { describe, expect, it, vi } from "vitest";

import { createPilotApiKeyRequestAuthenticator } from "./pilot-api-key-authenticator.js";

function request(authorization?: string): IncomingMessage {
  return { headers: authorization ? { authorization } : {} } as IncomingMessage;
}

describe("pilot API key request authenticator", () => {
  it("accepts only the explicit ApiKey scheme and forwards no other credentials", async () => {
    const authenticate = vi.fn(async (token: string | undefined) => token
      ? { principalId: "service-1", workspaceId: "workspace-1", permissions: ["content.read"], kind: "service" as const }
      : null);
    const adapter = createPilotApiKeyRequestAuthenticator({ authenticate });
    await expect(adapter(request("ApiKey mfk_d29ya3NwYWNlLTE.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"))).resolves.toMatchObject({ principalId: "service-1" });
    await expect(adapter(request("Bearer mfk_d29ya3NwYWNlLTE.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"))).resolves.toBeNull();
    await expect(adapter(request("ApiKey malformed"))).resolves.toBeNull();
    expect(authenticate.mock.calls).toEqual([
      ["mfk_d29ya3NwYWNlLTE.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"],
      [undefined],
      [undefined],
    ]);
  });
});
