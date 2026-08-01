import { startTenantYoutubeReconciliationProcess } from "./reconciliation-process.js";

const controller = new AbortController();
const stop = (): void => controller.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

try {
  await startTenantYoutubeReconciliationProcess({
    signal: controller.signal,
    onDispatch: (result) => {
      if (result.kind !== "idle") {
        process.stdout.write(`${JSON.stringify(result)}\n`);
      }
    },
  });
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Unknown reconciliation process failure."}\n`
  );
  process.exitCode = 1;
} finally {
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
}
