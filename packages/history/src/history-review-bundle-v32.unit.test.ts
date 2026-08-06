import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHistoryReviewBundleV32 } from "./history-review-bundle-v32.js";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });
describe("History V3.2 review bundle", () => { it("writes a redacted deterministic manifest and ZIP", async () => { const root = await fs.mkdtemp(path.join(os.tmpdir(), "history-v32-bundle-")); roots.push(root); const episode = path.join(root, "episodes", "history-bundle"); await fs.mkdir(path.join(episode, "languages"), { recursive: true }); await fs.mkdir(path.join(episode, "source"), { recursive: true }); await fs.writeFile(path.join(episode, "languages", "script-en.md"), "A historical claim survives."); await fs.writeFile(path.join(episode, "source", "normalized-metadata.json"), JSON.stringify({ runtime: { targetDurationMinutes: 10 } })); const output = path.join(root, "review"); const first = await createHistoryReviewBundleV32({ episodeId: "history-bundle", output, outputRoot: path.join(root, "episodes") }); const firstHash = crypto.createHash("sha256").update(await fs.readFile(first.zipPath)).digest("hex"); const second = await createHistoryReviewBundleV32({ episodeId: "history-bundle", output, outputRoot: path.join(root, "episodes") }); expect(crypto.createHash("sha256").update(await fs.readFile(second.zipPath)).digest("hex")).toBe(firstHash); expect(JSON.parse(await fs.readFile(path.join(output, "manifest.json"), "utf8")).files).toHaveLength(4); }); });
