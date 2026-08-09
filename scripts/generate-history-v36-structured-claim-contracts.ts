import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  structuredClaimContractDocumentV36,
  structuredClaimJsonSchemaV36,
} from "../packages/history/src/v36/structured-claim-v36.js";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(repository, "docs", "history", "v3.6");
await fs.mkdir(output, { recursive: true });
await fs.writeFile(
  path.join(output, "structured-claim-schema.json"),
  `${JSON.stringify(structuredClaimJsonSchemaV36, null, 2)}\n`
);
await fs.writeFile(
  path.join(output, "structured-claim-contract-document.json"),
  `${JSON.stringify(structuredClaimContractDocumentV36, null, 2)}\n`
);
