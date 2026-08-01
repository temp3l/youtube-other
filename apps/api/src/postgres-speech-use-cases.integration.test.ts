import http from "node:http";
import { Readable } from "node:stream";
import { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PostgresSpeechRepository } from "@mediaforge/persistence";
import {
  SpeechProviderRegistry,
  type SpeechProvider,
} from "@mediaforge/speech";
import { createApiServer, type ApiUseCases } from "./http-server.js";
import { createPostgresSpeechApiUseCases } from "./postgres-speech-use-cases.js";

const host = process.env.POSTGRES_INTEGRATION_HOST;
const port = Number(process.env.POSTGRES_INTEGRATION_PORT ?? "55432");
const database =
  process.env.POSTGRES_INTEGRATION_DATABASE ?? "mediaforge_task04";
const adminConnectionString = process.env.POSTGRES_INTEGRATION_ADMIN_URL;
const applicationConnectionString =
  process.env.POSTGRES_INTEGRATION_APPLICATION_URL;
const applicationRole =
  process.env.POSTGRES_INTEGRATION_APPLICATION_ROLE ?? "mediaforge_task04_app";
const describePostgres =
  host || adminConnectionString ? describe : describe.skip;

async function serve(server: http.Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("missing server address");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      ),
  };
}
async function request(
  url: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {}
) {
  return new Promise<{
    status: number;
    headers: http.IncomingHttpHeaders;
    body: string;
  }>((resolve, reject) => {
    const target = new URL(url);
    const outgoing = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        method,
        headers: {
          ...(body ? { "content-type": "application/json" } : {}),
          ...headers,
        },
        agent: false,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          })
        );
      }
    );
    outgoing.on("error", reject);
    outgoing.end(body ? JSON.stringify(body) : undefined);
  });
}

describePostgres("PostgreSQL speech HTTP use cases", () => {
  const adminPool = new Pool(
    adminConnectionString
      ? { connectionString: adminConnectionString, max: 2 }
      : { host, port, database, max: 2 }
  );
  const applicationPool = new Pool(
    applicationConnectionString
      ? { connectionString: applicationConnectionString, max: 4 }
      : { host, port, database, user: applicationRole, max: 4 }
  );
  const closers: Array<() => Promise<void>> = [];
  const synthesize = vi.fn<SpeechProvider["synthesize"]>(async (request) => ({
    rawAudio: Readable.from([Buffer.from(request.text)]),
    rawContentType: "audio/wav",
    actualBillableCharacters: [...request.text].length,
    providerRequestId: "mock-request",
  }));
  const provider: SpeechProvider = {
    id: "openai",
    validateProfile: async () => undefined,
    estimate: async (request) => ({
      billableCharacters: [...request.text].length,
    }),
    synthesize,
  };

  beforeAll(async () => {
    await new PostgresSpeechRepository(adminPool).migrate();
    if (!applicationConnectionString)
      await adminPool.query(
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${applicationRole}') THEN CREATE ROLE ${applicationRole} LOGIN NOSUPERUSER; END IF; END $$`
      );
    await adminPool.query(`GRANT USAGE ON SCHEMA public TO ${applicationRole}`);
    await adminPool.query(
      `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${applicationRole}`
    );
    await adminPool.query(
      `GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${applicationRole}`
    );
  });
  beforeEach(async () => {
    synthesize.mockClear();
    await adminPool.query(`TRUNCATE speech_dispatch_controls,speech_listening_test_approvals,speech_audit_records,
    speech_generation_chunk_attempts,speech_artifacts,speech_quota_reservation_scopes,speech_quota_policies,speech_quota_reservations,
    speech_usage_ledger,speech_pricing_versions,speech_generation_chunks,speech_generation_transitions,speech_cache_entries,speech_generations,
    video_speech_overrides,genre_speech_policies,voice_profile_versions,voice_profiles,voice_consent_records CASCADE`);
  });
  afterEach(async () => Promise.all(closers.splice(0).map((close) => close())));
  afterAll(async () => {
    await applicationPool.end();
    await adminPool.end();
  });

  const authenticate = async () => ({
    principalId: "operator",
    workspaceId: "workspace-api",
    kind: "user" as const,
    permissions: ["content.read", "content.write"],
  });
  const speechUseCases = () =>
    createPostgresSpeechApiUseCases({
      pool: applicationPool,
      config: {
        workspaceDirectory: "/tmp",
        openAiModel: "gpt-4o-mini-tts",
        openAiVoice: "onyx",
        elevenLabsFeatureEnabled: false,
        elevenLabsRequestTimeoutMs: 1000,
        channel: "youtube",
      },
      providerRegistry: new SpeechProviderRegistry([provider]),
      artifactsForWorkspace: () => ({
        persistRaw: async (input) => {
          for await (const _chunk of input.audio) {
            /* consume */
          }
          return {
            artifactId: `speech/raw/${input.generationId}/${input.chunkIndex}.wav`,
            sha256: "a".repeat(64),
            contentType: input.contentType,
          };
        },
        createCanonicalMaster: async (input) => ({
          artifactId: `speech/master/${input.generationId}.flac`,
          sha256: "b".repeat(64),
          contentType: "audio/flac",
        }),
      }),
    });
  const create = (speech = speechUseCases()) =>
    createApiServer({
      useCases: {} as ApiUseCases,
      authenticate,
      requestId: () => "request-speech-real",
      speechUseCases: speech,
    });

  it("executes profile, policy, estimate, generation, replay, status, and safe-error routes through durable use cases", async () => {
    const durableSpeech = speechUseCases();
    const running = await serve(create(durableSpeech));
    closers.push(running.close);
    const base = `${running.baseUrl}/v1/workspaces/workspace-api`;
    const created = await request(`${base}/speech/profiles`, "POST", {
      key: "narrator",
      displayName: "Narrator",
    });
    expect(created.status).toBe(201);
    const profileId = (JSON.parse(created.body) as { profileId: string })
      .profileId;
    expect(created.body).not.toContain("consentRecordId");
    const version = await request(
      `${base}/speech/profiles/${profileId}/versions`,
      "POST",
      {
        language: "en",
        configuration: {
          provider: "openai",
          model: "gpt-4o-mini-tts",
          voice: "onyx",
          speed: 1,
          outputFormat: "wav",
        },
      }
    );
    expect(version.status).toBe(201);
    const versionId = (JSON.parse(version.body) as { profileVersionId: string })
      .profileVersionId;
    const validated = await request(
      `${base}/speech/profile-versions/${versionId}:validate`,
      "POST",
      {}
    );
    expect(validated.status).toBe(200);
    await adminPool.query(
      `INSERT INTO speech_listening_test_approvals (workspace_id,voice_profile_version_id,approved_by,approved_at,evidence_artifact_id)
      VALUES ('workspace-api',$1,'operator',now(),'listening-evidence')`,
      [versionId]
    );
    const activated = await request(
      `${base}/speech/profile-versions/${versionId}/activate`,
      "POST",
      {},
      { "if-match": '"0"' }
    );
    expect(activated.status).toBe(200);
    const policy = await request(
      `${base}/genres/documentary/speech-policy`,
      "PUT",
      { profileVersionId: versionId },
      { "if-match": '"0"' }
    );
    expect(policy.status).toBe(200);
    const override = await request(
      `${base}/videos/video-1/speech-override`,
      "PUT",
      { useGenreDefault: false, profileVersionId: versionId },
      { "if-match": '"0"' }
    );
    expect(override.status).toBe(200);
    const estimate = await request(`${base}/speech/estimates`, "POST", {
      videoId: "video-1",
      language: "en",
      text: "Exact narration.",
    });
    expect(estimate.status).toBe(200);
    expect(estimate.body).not.toContain("onyx");
    expect(estimate.body).not.toContain("Exact narration");
    const first = await request(
      `${base}/speech/generations`,
      "POST",
      { videoId: "video-1", language: "en", text: "Exact narration." },
      { "idempotency-key": "same-key" }
    );
    expect(first.status, first.body).toBe(202);
    const firstBody = JSON.parse(first.body) as {
      generationId: string;
      masterArtifactId: string;
    };
    expect(firstBody.masterArtifactId).toContain("speech/master/");
    const replay = await request(
      `${base}/speech/generations`,
      "POST",
      { videoId: "video-1", language: "en", text: "Exact narration." },
      { "idempotency-key": "same-key" }
    );
    expect(replay.status).toBe(202);
    expect(JSON.parse(replay.body)).toMatchObject({
      generationId: firstBody.generationId,
    });
    expect(synthesize).toHaveBeenCalledOnce();
    const mismatch = await request(
      `${base}/speech/generations`,
      "POST",
      { videoId: "video-1", language: "en", text: "Different narration." },
      { "idempotency-key": "same-key" }
    );
    expect(mismatch.status).toBe(409);
    const status = await request(
      `${base}/speech/generations/${firstBody.generationId}`
    );
    expect(status.status).toBe(200);
    expect(status.headers.etag).toBeDefined();
    const cancellation = await request(
      `${base}/speech/generations/${firstBody.generationId}:cancel`,
      "POST",
      {}
    );
    expect(cancellation.status).toBe(409);
    const deprecated = await request(
      `${base}/speech/profile-versions/${versionId}:deprecate`,
      "POST",
      {},
      { "if-match": '"1"' }
    );
    expect(deprecated.status).toBe(200);
    expect(JSON.parse(deprecated.body)).toMatchObject({
      status: "DEPRECATED",
      revision: 2,
    });
    expect(
      (await request(`${base}/speech/generations/${firstBody.generationId}`))
        .status
    ).toBe(200);
    const profiles = await request(`${base}/speech/profiles`);
    expect(profiles.status).toBe(200);
    expect(profiles.body).not.toContain("voice");
  });

  it("enforces speech authorization before invoking durable use cases", async () => {
    const running = await serve(
      createApiServer({
        useCases: {} as ApiUseCases,
        authenticate: async () => ({
          principalId: "reader",
          workspaceId: "workspace-api",
          kind: "user",
          permissions: ["content.read"],
        }),
        speechUseCases: createPostgresSpeechApiUseCases({
          pool: applicationPool,
          config: {
            workspaceDirectory: "/tmp",
            openAiModel: "model",
            openAiVoice: "voice",
            elevenLabsFeatureEnabled: false,
            elevenLabsRequestTimeoutMs: 1000,
            channel: "youtube",
          },
          providerRegistry: new SpeechProviderRegistry([provider]),
          artifactsForWorkspace: () => ({
            persistRaw: async () => {
              throw new Error("not called");
            },
            createCanonicalMaster: async () => {
              throw new Error("not called");
            },
          }),
        }),
      })
    );
    closers.push(running.close);
    const response = await request(
      `${running.baseUrl}/v1/workspaces/workspace-api/speech/profiles`,
      "POST",
      { key: "forbidden", displayName: "Forbidden" }
    );
    expect(response.status).toBe(403);
  });
});
