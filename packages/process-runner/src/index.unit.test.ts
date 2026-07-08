import { describe, expect, it } from "vitest";
import { redactProcessArgs } from "./index.js";

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
});
