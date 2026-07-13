import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { linuxProcessTreeRssBytes, runProcess } from "../../src/infrastructure/process.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });
describe("process measurement", () => {
  it("sums a Linux process tree from a deterministic proc fixture", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "renderer-proc-")); roots.push(root);
    await fs.mkdir(path.join(root, "10")); await fs.mkdir(path.join(root, "11"));
    await fs.writeFile(path.join(root, "10", "stat"), "10 (root) S 1 0 0"); await fs.writeFile(path.join(root, "11", "stat"), "11 (child) S 10 0 0");
    await fs.writeFile(path.join(root, "10", "status"), "VmRSS:\t12 kB\n"); await fs.writeFile(path.join(root, "11", "status"), "VmRSS:\t8 kB\n");
    expect(await linuxProcessTreeRssBytes(10, root)).toBe(20 * 1024);
  });
  it("reports timeout and cancellation as typed errors and terminates the child", async () => {
    await expect(runProcess(process.execPath, ["-e", "setTimeout(()=>{}, 10000)"], { timeoutMs: 20 })).rejects.toMatchObject({ data: { code: "PROCESS_TIMEOUT" } });
    const controller = new AbortController(); const pending = runProcess(process.execPath, ["-e", "setTimeout(()=>{}, 10000)"], { signal: controller.signal }); controller.abort();
    await expect(pending).rejects.toMatchObject({ data: { code: "PROCESS_INTERRUPTED" } });
  });
});
