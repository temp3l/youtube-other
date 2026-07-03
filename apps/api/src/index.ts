import http from "node:http";
import { loadRuntimeConfig } from "@mediaforge/config";

export async function startApiServer(port = 3333): Promise<http.Server> {
  const config = await loadRuntimeConfig();
  return http.createServer(async (_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ ok: true, workspace: config.workspaceDir }));
  }).listen(port);
}
