import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runRepresentativeNativeStructuredClaimExperimentV36 } from "./native-structured-claim-experiment-v36.js";
import { admitProofAwarePolicyResponseV36 } from "./proof-aware-policy-response-admission-v36.js";

async function blackDeathNative() {
  const entries = await fs.readdir(path.resolve("episodes"), { withFileTypes: true });
  const episodeId = entries.find((entry) => entry.isDirectory() && entry.name.includes("04-black-death") && !entry.name.endsWith("-v3.4"))!.name;
  const root = path.resolve("episodes", episodeId, "source", "history-v3.5");
  const structured = JSON.parse(await fs.readFile(path.join(root, "structured-claims.json"), "utf8"));
  const plan = JSON.parse(await fs.readFile(path.join(root, "plan.json"), "utf8"));
  return runRepresentativeNativeStructuredClaimExperimentV36([{ shadow: { episodeId, claims: structured.claims, entities: structured.entities, places: plan.places ?? [] }, native: { episodeId, claims: structured.claims, entities: structured.entities } }]).runs[0]!.native;
}

describe("proof-aware policy-response admission", () => {
  it("admits only the validated Black Death proof with exact asymmetric modality", async () => {
    const result = admitProofAwarePolicyResponseV36(await blackDeathNative());
    if (result.status === "rejected") throw new Error(result.reason);
    expect(result).toMatchObject({ status: "admitted", value: { relation: { kind: "policy-response", conditionAssertionStatus: "uncertain", responseAssertionStatus: "attempted", supportClaimIds: expect.arrayContaining(["claim-ee76bea77004b9d801b6630b", "claim-095a61f563fa2980b636c6cc"]) } } });
  });
});
