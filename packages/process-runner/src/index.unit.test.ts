import { describe, expect, it } from "vitest";
import { ProcessExecutionError } from "@mediaforge/domain";

import { redactProcessArgs, redactResponseHeaders, redactUrl, runCommand } from "./index.js";

describe("process runner telemetry redaction", () => {
  it("redacts bearer headers and secret-like argument values while preserving command context", () => {
    const redacted = redactProcessArgs([
      "-sS",
      "-H",
      "Authorization: Bearer sk-live-secret",
      "--header=Authorization: Bearer inline-secret",
      "--api-key",
      "sk-flag-secret",
      "--token=token-secret",
      "--client-secret",
      "client-secret-value",
      "OPENAI_API_KEY=env-secret",
      "https://api.example.test/v1/images",
    ]);

    expect(redacted).toEqual([
      "-sS",
      "-H",
      "Authorization: Bearer [redacted]",
      "--header=Authorization: Bearer [redacted]",
      "--api-key",
      "[redacted]",
      "--token=[redacted]",
      "--client-secret",
      "[redacted]",
      "OPENAI_API_KEY=[redacted]",
      "https://api.example.test/v1/images",
    ]);
  });

  it("does not redact unrelated adjacent command arguments", () => {
    expect(redactProcessArgs(["--model", "gpt-image-2", "--quality=high"])).toEqual([
      "--model",
      "gpt-image-2",
      "--quality=high",
    ]);
  });

  it("removes URL credentials/query secrets and sensitive response headers", () => {
    expect(redactUrl("https://user:password@example.test/v1?api_key=secret#fragment")).toBe("https://example.test/v1");
    expect(redactResponseHeaders({ authorization: "Bearer secret", cookie: "session=secret", "x-request-id": "safe" })).toEqual({
      authorization: "[redacted]",
      cookie: "[redacted]",
      "x-request-id": "safe",
    });
  });

  it("uses TERM grace and rejects completion after cancellation", async () => {
    const controller = new AbortController();
    const execution = runCommand(
      "node",
      ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"],
      { signal: controller.signal, terminationGraceMs: 10 }
    );
    controller.abort();
    await expect(execution).rejects.toBeInstanceOf(ProcessExecutionError);
  });
});
