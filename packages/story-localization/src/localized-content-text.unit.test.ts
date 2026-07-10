import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readJsonIfExists, writeJsonAtomic, writeTextAtomic } from "@mediaforge/shared";
import {
  detectLocalizedUnicodeIssues,
  normalizeLocalizedContentText,
} from "./localized-content-text.js";

describe("localized content text", () => {
  it("normalizes content to NFC without ASCII-folding narration", () => {
    const decomposed = "ho\u0308rte u\u0308ber dem Ku\u0308chentisch";

    expect(normalizeLocalizedContentText(decomposed)).toBe(
      "hörte über dem Küchentisch"
    );
  });

  it("flags the known German ASCII-transliteration failure fixture", async () => {
    const fixture = await fs.readFile(
      path.join(
        import.meta.dirname,
        "__fixtures__",
        "localized-unicode",
        "bad-german-ascii.md"
      ),
      "utf8"
    );

    const diagnostics = detectLocalizedUnicodeIssues({
      language: "de",
      text: fixture,
    });

    expect(diagnostics.some((entry) => entry.severity === "error")).toBe(true);
    expect(diagnostics.flatMap((entry) => entry.terms)).toEqual(
      expect.arrayContaining([
        "horte",
        "uber",
        "Kuchentisch",
        "Luftungsgitter",
        "Worter",
        "Uberschriften",
      ])
    );
  });

  it("passes the corrected German Unicode fixture", async () => {
    const fixture = await fs.readFile(
      path.join(
        import.meta.dirname,
        "__fixtures__",
        "localized-unicode",
        "good-german-unicode.md"
      ),
      "utf8"
    );

    expect(
      detectLocalizedUnicodeIssues({ language: "de", text: fixture })
    ).toEqual([]);
  });

  it("warns but does not hard-block suspicious long ASCII-only Spanish text", () => {
    const text = Array.from(
      { length: 35 },
      () =>
        "El senor entro en la habitacion y despues miro detras de la puerta porque tambien oyo al nino."
    ).join(" ");

    expect(detectLocalizedUnicodeIssues({ language: "es", text })).toEqual([
      expect.objectContaining({ severity: "warning" }),
    ]);
  });

  it("preserves Unicode through UTF-8 Markdown and JSON cache round trips", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "localized-unicode-"));
    const markdownPath = path.join(root, "script-de.md");
    const jsonPath = path.join(root, "cache.json");
    const narration =
      "Ich hörte Wörter über dem Küchentisch und schloß die Tür.";

    await writeTextAtomic(markdownPath, `# Narration Script\n\n${narration}\n`);
    await writeJsonAtomic(jsonPath, { narration });

    expect(await fs.readFile(markdownPath, "utf8")).toContain(narration);
    expect(
      await readJsonIfExists(jsonPath, (value) => value as { narration: string })
    ).toEqual({ narration });
  });
});
