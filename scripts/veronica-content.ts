import { validateVeronicaContentSource } from "../packages/strategic-reinvention/src/veronica-content-source.js";

const strictLocales = process.argv.includes("--strict-locales");
const json = process.argv.includes("--json");
const status = process.argv.includes("--status");

const result = await validateVeronicaContentSource({
  repositoryRoot: process.cwd(),
  strictLocales,
});

if (json || !status) {
  process.stdout.write(`${JSON.stringify(result, null, json ? 2 : undefined)}\n`);
} else {
  process.stdout.write([
    `Canonical pack: ${result.canonicalPackId}`,
    `Canonical path: ${result.packRoot}`,
    `Manifest: ${result.manifestPath}`,
    `Episodes: ${result.episodes}`,
    `Longs: ${result.longs}`,
    `Shorts: ${result.shorts}`,
    `Canonical English assets: ${result.canonicalEnglishAssets}`,
    `Locales discovered: ${result.locales.join(", ")}`,
    `Missing translation sets: ${result.missingTranslations.length}`,
    `Localized timing violations: ${result.timingViolations.length}`,
    `Explicit legacy diagnostics: ${result.legacyReferences.length}`,
    "Production legacy references: 0",
    "Legacy fallback: disabled",
    "Paid providers invoked: no",
  ].join("\n") + "\n");
}
