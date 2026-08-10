import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  explanatoryRelationJsonSchemaV36,
  relationContractDocumentV36,
} from "../packages/history/src/v36/explanatory-relation-v36.js";
import {
  atomicGroundingContractDocumentV36,
  atomicGroundingJsonSchemaV36,
} from "../packages/history/src/v36/atomic-claim-grounding-v36.js";
import {
  goldenFixtureSummaryV36,
} from "../packages/history/src/v36/golden-semantic-fixtures-v36.js";
import {
  reviewArtifactProvenanceJsonSchemaV36,
} from "../packages/history/src/v36/review-provenance-v36.js";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(repository, "docs", "history", "v3.6");

await fs.writeFile(
  path.join(output, "atomic-grounding-schema.json"),
  `${JSON.stringify(atomicGroundingJsonSchemaV36, null, 2)}\n`
);
await fs.writeFile(
  path.join(output, "atomic-grounding-contract-document.json"),
  `${JSON.stringify(atomicGroundingContractDocumentV36, null, 2)}\n`
);

await fs.writeFile(
  path.join(output, "relation-schema.json"),
  `${JSON.stringify(explanatoryRelationJsonSchemaV36, null, 2)}\n`
);
await fs.writeFile(
  path.join(output, "relation-contract-document.json"),
  `${JSON.stringify(relationContractDocumentV36, null, 2)}\n`
);
await fs.writeFile(
  path.join(output, "provenance-schema.json"),
  `${JSON.stringify(reviewArtifactProvenanceJsonSchemaV36, null, 2)}\n`
);
await fs.writeFile(
  path.join(output, "golden-fixture-summary.json"),
  `${JSON.stringify(goldenFixtureSummaryV36, null, 2)}\n`
);
