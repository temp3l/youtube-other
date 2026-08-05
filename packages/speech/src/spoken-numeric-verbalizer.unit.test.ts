import { describe, expect, it } from "vitest";
import {
  NUMERIC_VERBALIZER_CHARACTERIZATION_GENRES,
  SPOKEN_NUMERIC_VERBALIZER_VERSION,
  buildGermanNumericVerbalizationDryRunReport,
  normalizeGermanNumericText,
  verbalizeGermanNumericValue,
  type SpokenNumericIntent,
} from "./spoken-numeric-verbalizer.js";

describe("German spoken numeric verbalizer", () => {
  it.each([
    ["12", "cardinal", "zwölf"],
    ["15", "cardinal", "fünfzehn"],
    ["2026", "year", "zweitausendsechsundzwanzig"],
    ["3.5", "decimal", "drei Komma fünf"],
    ["-4", "cardinal", "minus vier"],
    ["25%", "percentage", "fünfundzwanzig Prozent"],
    ["1/2", "fraction", "ein Halb"],
    ["3–5", "range", "drei bis fünf"],
    ["3.", "ordinal", "dritte"],
    ["21.", "ordinal", "einundzwanzigste"],
    ["02.08.2026", "date", "zweite August zweitausendsechsundzwanzig"],
    ["13:45", "time", "dreizehn Uhr fünfundvierzig"],
    ["25 €", "currency", "fünfundzwanzig Euro"],
    ["E-12", "identifier", "E - eins zwei"],
    ["12", "digits", "eins zwei"],
  ] as const satisfies readonly (readonly [string, SpokenNumericIntent, string])[])(
    "verbalizes %s as %s",
    (display, intent, spoken) => {
      expect(verbalizeGermanNumericValue({ display, intent })).toEqual({
        display,
        spoken,
        subtitle: display,
      });
    }
  );

  it("changes only confident numeric spans and supports explicit digit escapes", () => {
    const result = normalizeGermanNumericText(
      "12 Kinder teilen 1/2 Kuchen um 13:45. Episode 12 und Raum 237 bleiben unverändert. Code [[numeric:digits:12]]."
    );
    expect(result.version).toBe(SPOKEN_NUMERIC_VERBALIZER_VERSION);
    expect(result.spokenText).toBe(
      "zwölf Kinder teilen ein Halb Kuchen um dreizehn Uhr fünfundvierzig. Episode 12 und Raum 237 bleiben unverändert. Code eins zwei."
    );
    expect(result.changes.map((change) => change.intent)).toEqual([
      "cardinal",
      "fraction",
      "time",
      "digits",
    ]);
  });

  it("uses a natural dative date after am while standalone dates retain their standard form", () => {
    expect(normalizeGermanNumericText("Am 02.08.2026 beginnt die Reise.").spokenText).toBe(
      "Am zweiten August zweitausendsechsundzwanzig beginnt die Reise."
    );
    expect(normalizeGermanNumericText("02.08.2026 beginnt die Reise.").spokenText).toBe(
      "zweite August zweitausendsechsundzwanzig beginnt die Reise."
    );
  });

  it("keeps surrounding words, punctuation, and genre style unchanged in the required characterization matrix", () => {
    const samples = [
      ["dark-truth", "Um 03:17 stand sie vor Tür 12.", "Um drei Uhr siebzehn stand sie vor Tür zwölf."],
      ["history", "Im Jahr 2026 erinnern wir an 12 Ereignisse.", "Im Jahr zweitausendsechsundzwanzig erinnern wir an zwölf Ereignisse."],
      ["veronica-benini", "Preis: 25% Rabatt auf 15 €.", "Preis: fünfundzwanzig Prozent Rabatt auf fünfzehn Euro."],
      ["generic", "Die Strecke ist 3.5 km lang.", "Die Strecke ist drei Komma fünf km lang."],
    ] as const;
    expect(samples.map(([genre]) => genre)).toEqual(NUMERIC_VERBALIZER_CHARACTERIZATION_GENRES);
    for (const [, source, expected] of samples) {
      const result = normalizeGermanNumericText(source);
      expect(result.spokenText).toBe(expected);
      expect(result.changes.length).toBeGreaterThan(0);
    }
  });

  it("reports potentially affected artifacts without changing any artifact", () => {
    const report = buildGermanNumericVerbalizationDryRunReport([
      { artifactId: "dark-001", genre: "dark-truth", locale: "de-DE", narrationText: "12 Schritte.", subtitleText: "12 Schritte." },
      { artifactId: "history-001", genre: "history", locale: "de-DE", narrationText: "Raum 237." },
      { artifactId: "generic-en", genre: "generic", locale: "en-US", narrationText: "12 steps." },
    ]);
    expect(report.mode).toBe("dry-run");
    expect(report.regenerationRequiresExplicitApproval).toBe(true);
    expect(report.affectedArtifactIds).toEqual(["dark-001"]);
    expect(report.artifacts[0]?.subtitleChanges).toEqual([]);
    expect(report.artifacts[1]?.affected).toBe(false);
    expect(report.artifacts[2]?.affected).toBe(false);
  });
});
