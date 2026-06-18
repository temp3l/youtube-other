import http from "node:http";
import { createPipeline } from "@mediaforge/pipeline";

export async function startApiServer(port = 3333): Promise<http.Server> {
  const pipeline = await createPipeline();
  return http.createServer(async (_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ ok: true, workspace: pipeline.environment.config.workspaceDir }));
  }).listen(port);
}

