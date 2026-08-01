import { type ApiProblem } from "@mediaforge/api-sdk";
import {
  ConnectedApiCliError,
  parseConnectedApiEnvironment,
} from "./api-commands.js";
import { Command } from "commander";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const OUTPUT_SCHEMA_VERSION = "mediaforge.speech-cli.v1" as const;

const profileSchema = z
  .object({
    profileId: z.string().min(1),
    key: z.string().min(1),
    displayName: z.string().min(1),
    status: z.string().min(1),
    consentStatus: z.string().min(1),
    activeVersionId: z.string().min(1).optional(),
    revision: z.number().int().nonnegative(),
  })
  .passthrough();

const profileListSchema = z.object({ items: z.array(profileSchema) }).strict();
const estimateSchema = z
  .object({
    profileVersionId: z.string().min(1),
    provider: z.string().min(1),
    billableCharacters: z.number().int().nonnegative(),
    estimatedCredits: z.number().nonnegative().optional(),
    estimatedCurrencyAmount: z.number().nonnegative().optional(),
    currency: z.string().optional(),
    cacheHitExpected: z.boolean(),
    quotaImpact: z
      .object({
        allowed: z.boolean(),
        warning: z.boolean(),
        remainingCharacters: z.number().int().nonnegative().optional(),
      })
      .strict(),
  })
  .strict();

const generationSchema = z
  .object({
    generationId: z.string().min(1),
    revision: z.number().int().nonnegative(),
    state: z.string().min(1),
    profileVersionId: z.string().min(1),
    provider: z.string().min(1),
    cacheHit: z.boolean(),
    masterArtifactId: z.string().min(1).optional(),
    failure: z
      .object({
        code: z.string().min(1),
        retryable: z.boolean(),
        message: z.string().min(1),
      })
      .strict()
      .optional(),
  })
  .strict();

export interface SpeechCommandDependencies {
  readonly environment?: NodeJS.ProcessEnv;
  readonly request?: typeof fetch;
  readonly stdout?: { write(chunk: string): unknown };
}

interface WorkspaceOption {
  readonly workspace: string;
}
interface VideoOption extends WorkspaceOption {
  readonly video: string;
  readonly profile?: string;
  readonly text?: string;
  readonly language?: string;
}

function apiProblem(
  status: number,
  parsed: unknown,
  requestId: string | null
): ApiProblem {
  const candidate = z
    .object({
      type: z.string(),
      title: z.string(),
      status: z.number(),
      detail: z.string(),
      code: z.string(),
      requestId: z.string(),
      retryable: z.boolean(),
      errors: z.array(z.object({ path: z.string(), message: z.string() })),
    })
    .safeParse(parsed);
  if (candidate.success) return candidate.data;
  return {
    type: "about:blank",
    title: `HTTP ${status}`,
    status,
    detail:
      "The connected speech API request failed without a valid Problem Details response.",
    code: "speech_api_invalid_problem_response",
    requestId: requestId ?? "unknown",
    retryable: status === 429 || status >= 500,
    errors: [],
  };
}

function speechPath(workspace: string, suffix: string): string {
  return `/v1/workspaces/${encodeURIComponent(workspace)}/speech/${suffix}`;
}

function output(
  stdout: { write(chunk: string): unknown },
  operation: string,
  data: unknown,
  status = 200,
  requestId?: string,
  etag?: string
): void {
  stdout.write(
    `${JSON.stringify({ schemaVersion: OUTPUT_SCHEMA_VERSION, operation, status, requestId: requestId ?? null, etag: etag ?? null, data }, null, 2)}\n`
  );
}

function requireId(value: string, label: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,159}$/u.test(value))
    throw new Error(`${label} must be a valid opaque identifier.`);
  return value;
}

/** Connected-API boundary for the provider-neutral speech application service. */
function createSpeechApi(dependencies: SpeechCommandDependencies) {
  const environment = parseConnectedApiEnvironment(
    dependencies.environment ?? process.env
  );
  const request = dependencies.request ?? fetch;
  const baseUrl = environment.baseUrl.replace(/\/+$/u, "");
  return async <T>(
    path: string,
    method: "GET" | "POST" | "PUT",
    body?: unknown,
    extraHeaders: Readonly<Record<string, string>> = {}
  ): Promise<{
    readonly data: T;
    readonly status: number;
    readonly requestId?: string;
    readonly etag?: string;
  }> => {
    let response: Response;
    try {
      response = await request(`${baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${environment.bearerToken}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...(method === "POST" ? { "idempotency-key": randomUUID() } : {}),
          ...extraHeaders,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (cause) {
      throw new ConnectedApiCliError(
        {
          type: "about:blank",
          title: "Speech API unavailable",
          status: 503,
          detail:
            "Unable to reach the connected speech API. Check MEDIAFORGE_API_BASE_URL and retry.",
          code: "speech_api_unavailable",
          requestId: "unknown",
          retryable: true,
          errors: [],
        },
        { cause }
      );
    }
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text.length === 0 ? null : (JSON.parse(text) as unknown);
    } catch {
      throw new ConnectedApiCliError(
        apiProblem(response.status, null, response.headers.get("x-request-id"))
      );
    }
    if (!response.ok)
      throw new ConnectedApiCliError(
        apiProblem(
          response.status,
          parsed,
          response.headers.get("x-request-id")
        )
      );
    return {
      data: parsed as T,
      status: response.status,
      ...(response.headers.get("x-request-id")
        ? { requestId: response.headers.get("x-request-id")! }
        : {}),
      ...(response.headers.get("etag")
        ? { etag: response.headers.get("etag")! }
        : {}),
    };
  };
}

export function registerSpeechCommands(
  program: Command,
  dependencies: SpeechCommandDependencies = {}
): void {
  const stdout = dependencies.stdout ?? process.stdout;
  const api = createSpeechApi(dependencies);
  const speech = program
    .command("speech")
    .description(
      "Provider-neutral speech generation through the connected Mediaforge API"
    );
  const profiles = speech
    .command("profiles")
    .description("Inspect configured immutable voice profiles");

  profiles
    .command("list")
    .requiredOption("--workspace <id>")
    .action(async (options: WorkspaceOption) => {
      const result = await api<unknown>(
        speechPath(requireId(options.workspace, "--workspace"), "profiles"),
        "GET"
      );
      output(
        stdout,
        "speech.profiles.list",
        profileListSchema.parse(result.data),
        result.status,
        result.requestId,
        result.etag
      );
    });
  profiles
    .command("create")
    .requiredOption("--workspace <id>")
    .requiredOption("--key <key>")
    .requiredOption("--display-name <name>")
    .option("--consent-record <id>")
    .action(
      async (
        options: WorkspaceOption & {
          readonly key: string;
          readonly displayName: string;
          readonly consentRecord?: string;
        }
      ) => {
        const result = await api<unknown>(
          speechPath(requireId(options.workspace, "--workspace"), "profiles"),
          "POST",
          {
            key: options.key,
            displayName: options.displayName,
            ...(options.consentRecord
              ? {
                  consentRecordId: requireId(
                    options.consentRecord,
                    "--consent-record"
                  ),
                }
              : {}),
          }
        );
        output(
          stdout,
          "speech.profiles.create",
          profileSchema.parse(result.data),
          result.status,
          result.requestId,
          result.etag
        );
      }
    );
  profiles
    .command("version <profile>")
    .requiredOption("--workspace <id>")
    .requiredOption("--language <language>")
    .requiredOption("--configuration <json>")
    .action(
      async (
        profileId: string,
        options: WorkspaceOption & {
          readonly language: string;
          readonly configuration: string;
        }
      ) => {
        let configuration: unknown;
        try {
          configuration = JSON.parse(options.configuration) as unknown;
        } catch {
          throw new Error("--configuration must be valid JSON.");
        }
        const result = await api<unknown>(
          speechPath(
            requireId(options.workspace, "--workspace"),
            `profiles/${encodeURIComponent(requireId(profileId, "profile"))}/versions`
          ),
          "POST",
          {
            language: options.language,
            configuration,
          }
        );
        output(
          stdout,
          "speech.profiles.version",
          result.data,
          result.status,
          result.requestId,
          result.etag
        );
      }
    );
  profiles
    .command("activate <profile-version>")
    .requiredOption("--workspace <id>")
    .requiredOption("--revision <revision>")
    .action(
      async (
        version: string,
        options: WorkspaceOption & { readonly revision: string }
      ) => {
        if (!/^\d+$/u.test(options.revision))
          throw new Error("--revision must be a non-negative integer.");
        const result = await api<unknown>(
          speechPath(
            requireId(options.workspace, "--workspace"),
            `profile-versions/${encodeURIComponent(requireId(version, "profile version"))}/activate`
          ),
          "POST",
          {},
          { "if-match": `"${options.revision}"` }
        );
        output(
          stdout,
          "speech.profiles.activate",
          result.data,
          result.status,
          result.requestId,
          result.etag
        );
      }
    );
  profiles
    .command("deprecate <profile-version>")
    .requiredOption("--workspace <id>")
    .requiredOption("--revision <revision>")
    .action(
      async (
        version: string,
        options: WorkspaceOption & { readonly revision: string }
      ) => {
        if (!/^\d+$/u.test(options.revision))
          throw new Error("--revision must be a non-negative integer.");
        const result = await api<unknown>(
          speechPath(
            requireId(options.workspace, "--workspace"),
            `profile-versions/${encodeURIComponent(requireId(version, "profile version"))}:deprecate`
          ),
          "POST",
          {},
          { "if-match": `"${options.revision}"` }
        );
        output(
          stdout,
          "speech.profiles.deprecate",
          result.data,
          result.status,
          result.requestId,
          result.etag
        );
      }
    );
  profiles
    .command("show <profile>")
    .requiredOption("--workspace <id>")
    .action(async (profile: string, options: WorkspaceOption) => {
      const result = await api<unknown>(
        speechPath(requireId(options.workspace, "--workspace"), "profiles"),
        "GET"
      );
      const items = profileListSchema.parse(result.data).items;
      const selected = items.find(
        (item) => item.profileId === profile || item.key === profile
      );
      if (!selected)
        throw new Error(
          `Speech profile '${profile}' was not found in this workspace. Run 'mediaforge speech profiles list --workspace ${options.workspace}'.`
        );
      output(
        stdout,
        "speech.profiles.show",
        selected,
        result.status,
        result.requestId,
        result.etag
      );
    });
  profiles
    .command("validate <profile-version>")
    .requiredOption("--workspace <id>")
    .action(async (version: string, options: WorkspaceOption) => {
      const result = await api<unknown>(
        speechPath(
          requireId(options.workspace, "--workspace"),
          `profile-versions/${encodeURIComponent(requireId(version, "profile version"))}:validate`
        ),
        "POST",
        {}
      );
      output(
        stdout,
        "speech.profiles.validate",
        result.data,
        result.status,
        result.requestId,
        result.etag
      );
    });

  speech
    .command("estimate")
    .requiredOption("--workspace <id>")
    .requiredOption("--video <id>")
    .option("--profile <profile-version>")
    .option("--language <language>")
    .option("--text <narration>")
    .action(async (options: VideoOption) => {
      const result = await api<unknown>(
        speechPath(requireId(options.workspace, "--workspace"), "estimates"),
        "POST",
        {
          videoId: requireId(options.video, "--video"),
          ...(options.language ? { language: options.language } : {}),
          ...(options.text ? { text: options.text } : {}),
          ...(options.profile
            ? { profileVersionId: requireId(options.profile, "--profile") }
            : {}),
        }
      );
      output(
        stdout,
        "speech.estimate",
        estimateSchema.parse(result.data),
        result.status,
        result.requestId,
        result.etag
      );
    });
  speech
    .command("generate")
    .requiredOption("--workspace <id>")
    .requiredOption("--video <id>")
    .option("--profile <profile-version>")
    .option("--language <language>")
    .option("--text <narration>")
    .option("--idempotency-key <key>")
    .option("--supersedes <generation-id>")
    .option(
      "--dry-run",
      "estimate resolution, cache, and quota impact without generation"
    )
    .option(
      "--force",
      "create a replacement generation without overwriting historical artifacts"
    )
    .action(
      async (
        options: VideoOption & {
          readonly force?: boolean;
          readonly idempotencyKey?: string;
          readonly supersedes?: string;
          readonly dryRun?: boolean;
        }
      ) => {
        const payload = {
          videoId: requireId(options.video, "--video"),
          ...(options.language ? { language: options.language } : {}),
          ...(options.text ? { text: options.text } : {}),
          ...(options.profile
            ? { profileVersionId: requireId(options.profile, "--profile") }
            : {}),
        };
        if (options.dryRun) {
          const result = await api<unknown>(
            speechPath(
              requireId(options.workspace, "--workspace"),
              "estimates"
            ),
            "POST",
            payload
          );
          output(
            stdout,
            "speech.generate.dry-run",
            estimateSchema.parse(result.data),
            result.status,
            result.requestId,
            result.etag
          );
          return;
        }
        const result = await api<unknown>(
          speechPath(
            requireId(options.workspace, "--workspace"),
            "generations"
          ),
          "POST",
          {
            ...payload,
            forceRegeneration: options.force === true,
            ...(options.supersedes
              ? {
                  supersedesGenerationId: requireId(
                    options.supersedes,
                    "--supersedes"
                  ),
                }
              : {}),
          },
          options.idempotencyKey
            ? {
                "idempotency-key": requireId(
                  options.idempotencyKey,
                  "--idempotency-key"
                ),
              }
            : {}
        );
        output(
          stdout,
          "speech.generate",
          generationSchema.parse(result.data),
          result.status,
          result.requestId,
          result.etag
        );
      }
    );
  speech
    .command("status <generation-id>")
    .requiredOption("--workspace <id>")
    .action(async (generationId: string, options: WorkspaceOption) => {
      const result = await api<unknown>(
        speechPath(
          requireId(options.workspace, "--workspace"),
          `generations/${encodeURIComponent(requireId(generationId, "generation id"))}`
        ),
        "GET"
      );
      output(
        stdout,
        "speech.status",
        generationSchema.parse(result.data),
        result.status,
        result.requestId,
        result.etag
      );
    });
  speech
    .command("retry <generation-id>")
    .requiredOption("--workspace <id>")
    .requiredOption("--language <language>")
    .requiredOption("--text <narration>")
    .option("--idempotency-key <key>")
    .action(
      async (
        generationId: string,
        options: WorkspaceOption & {
          readonly language: string;
          readonly text: string;
          readonly idempotencyKey?: string;
        }
      ) => {
        const result = await api<unknown>(
          speechPath(
            requireId(options.workspace, "--workspace"),
            `generations/${encodeURIComponent(requireId(generationId, "generation id"))}:retry`
          ),
          "POST",
          { language: options.language, text: options.text },
          options.idempotencyKey
            ? {
                "idempotency-key": requireId(
                  options.idempotencyKey,
                  "--idempotency-key"
                ),
              }
            : {}
        );
        output(
          stdout,
          "speech.retry",
          generationSchema.parse(result.data),
          result.status,
          result.requestId,
          result.etag
        );
      }
    );
  speech
    .command("cancel <generation-id>")
    .requiredOption("--workspace <id>")
    .action(async (generationId: string, options: WorkspaceOption) => {
      const result = await api<unknown>(
        speechPath(
          requireId(options.workspace, "--workspace"),
          `generations/${encodeURIComponent(requireId(generationId, "generation id"))}:cancel`
        ),
        "POST",
        {}
      );
      output(
        stdout,
        "speech.cancel",
        generationSchema.parse(result.data),
        result.status,
        result.requestId,
        result.etag
      );
    });
}
