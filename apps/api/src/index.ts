import { loadRuntimeConfig } from "@mediaforge/config";

export * from "./contract.js";
export * from "./http-server.js";
import { createApiServer } from "./http-server.js";

export async function startApiServer(port = 3333) {
  await loadRuntimeConfig();
  return createApiServer().listen(port);
}
