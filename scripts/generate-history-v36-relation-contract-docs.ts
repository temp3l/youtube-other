import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  relationContractDocumentV36,
} from "../packages/history/src/v36/explanatory-relation-v36.js";
import {
  goldenFixtureSummaryV36,
} from "../packages/history/src/v36/golden-semantic-fixtures-v36.js";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(repository, "docs", "history", "v3.6");

await fs.writeFile(
  path.join(output, "relation-schema.json"),
  `${JSON.stringify(relationContractDocumentV36, null, 2)}\n`
);
await fs.writeFile(
  path.join(output, "golden-fixture-summary.json"),
  `${JSON.stringify(goldenFixtureSummaryV36, null, 2)}\n`
);
