import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const script = path.resolve("scripts/ai-pack.mjs");

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ai-pack-"));
  await fs.mkdir(path.join(root, "docs", "ai-context"), { recursive: true });
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(
    path.join(root, "src", "source.md"),
    "# Source\n\nrequiredSymbol\n"
  );
  await fs.writeFile(
    path.join(root, "src", "owner.ts"),
    "export const ownerSymbol = true;\n"
  );
  await fs.writeFile(
    path.join(root, "docs", "ai-context", "sources.json"),
    JSON.stringify(
      {
        schemaVersion: "mediaforge.ai-pack-config.v1",
        generatorVersion: "test-generator.v1",
        limits: {
          sourceFileBytes: 10000,
          packFileBytes: 10000,
          totalPackBytes: 100000,
        },
        requiredSections: ["architecture"],
        entries: [
          {
            output: "architecture/source.md",
            source: "src/source.md",
            symbols: ["requiredSymbol"],
          },
        ],
        sourceIndex: [
          {
            concept: "owner",
            source: "src/owner.ts",
            symbols: ["ownerSymbol"],
          },
        ],
        exclusions: [],
      },
      null,
      2
    )
  );
  return root;
}

function run(root: string, command: string) {
  return execFileSync(
    process.execPath,
    [script, command, "--json", "--root", root],
    { encoding: "utf8" }
  );
}

describe("AI context pack tooling", () => {
  it("builds deterministically and validates/statuses unchanged inputs", async () => {
    const root = await fixture();
    run(root, "build");
    const first = await fs.readFile(
      path.join(root, "docs", "ai-context", "MANIFEST.json"),
      "utf8"
    );
    run(root, "build");
    expect(
      await fs.readFile(
        path.join(root, "docs", "ai-context", "MANIFEST.json"),
        "utf8"
      )
    ).toBe(first);
    expect(JSON.parse(run(root, "validate"))).toMatchObject({ valid: true });
    expect(JSON.parse(run(root, "status"))).toMatchObject({
      fresh: true,
      valid: true,
    });
  });

  it("rejects stale symbols, path escapes, and credential-like values without disclosing values", async () => {
    const root = await fixture();
    await fs.writeFile(
      path.join(root, "src", "source.md"),
      '# Source\napi_key = "super-secret-value-123"\n'
    );
    const secret = spawnSync(
      process.execPath,
      [script, "build", "--root", root],
      { encoding: "utf8" }
    );
    expect(secret.status).toBe(1);
    expect(secret.stderr).toContain("[API_KEY]");
    expect(secret.stderr).not.toContain("super-secret-value-123");

    const configPath = path.join(root, "docs", "ai-context", "sources.json");
    const config = JSON.parse(await fs.readFile(configPath, "utf8"));
    config.entries[0].output = "../escape.md";
    await fs.writeFile(configPath, JSON.stringify(config));
    const escape = spawnSync(
      process.execPath,
      [script, "build", "--root", root],
      { encoding: "utf8" }
    );
    expect(escape.status).toBe(1);
    expect(escape.stderr).toContain("Invalid or reserved AI-pack output");
  });
});
