import {
  ApiProblemError,
  MediaforgeApiClient,
  type ApiProblem,
  type ApiResponse,
  type EpisodeInput,
} from "@mediaforge/api-sdk";
import { Command } from "commander";
import { z } from "zod";

const API_CLI_SCHEMA_VERSION = "mediaforge.api-cli.v1" as const;
const environmentSchema = z.object({
  MEDIAFORGE_API_BASE_URL: z.string().max(2_048).url(),
  MEDIAFORGE_API_BEARER_TOKEN: z.string().min(1).max(8_192).regex(/^[\x21-\x7E]+$/u),
}).superRefine((value, context) => {
  const url = new URL(value.MEDIAFORGE_API_BASE_URL);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    context.addIssue({ code: "custom", path: ["MEDIAFORGE_API_BASE_URL"], message: "Connected API URLs must use HTTPS outside localhost." });
  }
});

export interface ConnectedApiEnvironment {
  readonly baseUrl: string;
  readonly bearerToken: string;
}

export function parseConnectedApiEnvironment(environment: NodeJS.ProcessEnv): ConnectedApiEnvironment {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success)
    throw new Error("MEDIAFORGE_API_BASE_URL and MEDIAFORGE_API_BEARER_TOKEN must contain bounded connected-API configuration.");
  return { baseUrl: parsed.data.MEDIAFORGE_API_BASE_URL, bearerToken: parsed.data.MEDIAFORGE_API_BEARER_TOKEN };
}

function exitCode(problem: ApiProblem): number {
  if (problem.status === 409 || problem.status === 412) return 5;
  if (problem.status === 429 || problem.status === 502 || problem.status === 503 || problem.retryable) return 4;
  if (problem.status >= 400 && problem.status < 500) return 1;
  return 6;
}

export class ConnectedApiCliError extends Error {
  public readonly exitCode: number;

  public constructor(public readonly problem: ApiProblem, options?: ErrorOptions) {
    super(problem.detail, options);
    this.name = "ConnectedApiCliError";
    this.exitCode = exitCode(problem);
  }
}

export interface ConnectedApiCommandDependencies {
  readonly environment?: NodeJS.ProcessEnv;
  readonly request?: typeof fetch;
  readonly stdout?: { write(chunk: string): unknown };
}

function csv(value: string): string[] {
  const items = [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
  if (items.length === 0) throw new Error("Comma-separated options must contain at least one value.");
  return items;
}

function integer(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative integer.`);
  return parsed;
}

function pageOptions(options: { readonly pageSize?: string; readonly after?: string }): { size?: number; after?: string } {
  const size = options.pageSize === undefined ? undefined : integer(options.pageSize, "--page-size");
  if (size !== undefined && (size < 1 || size > 100)) throw new Error("--page-size must be between 1 and 100.");
  return {
    ...(size !== undefined ? { size } : {}),
    ...(options.after !== undefined ? { after: options.after } : {}),
  };
}

function oneOf<const T extends string>(value: string, allowed: readonly T[], label: string): T {
  if (!allowed.includes(value as T)) throw new Error(`${label} must be one of: ${allowed.join(", ")}.`);
  return value as T;
}

function variants(value: string): ("full" | "short")[] {
  return csv(value).map((item) => oneOf(item, ["full", "short"] as const, "--variants"));
}

function output(stdout: { write(chunk: string): unknown }, operation: string, response: ApiResponse<unknown>): void {
  stdout.write(`${JSON.stringify({
    schemaVersion: API_CLI_SCHEMA_VERSION,
    operation,
    status: response.status,
    requestId: response.requestId ?? null,
    etag: response.etag ?? null,
    data: response.data,
  }, null, 2)}\n`);
}

function episodeInput(options: {
  readonly profile: "dark_truth" | "mathematics_education";
  readonly premise?: string;
  readonly storyBible?: string;
  readonly referenceAssets?: string;
  readonly curriculumSource?: string;
  readonly skill?: string;
  readonly grade?: string;
  readonly difficulty?: "foundation" | "standard" | "challenge";
  readonly presentationPreset?: string;
  readonly audioPreset?: string;
}): EpisodeInput {
  if (options.profile === "dark_truth") {
    if (!options.premise || !options.storyBible) throw new Error("Dark Truth episodes require --premise and --story-bible.");
    return { content: { type: "dark_truth", version: "1", premise: options.premise, storyBibleId: options.storyBible, referenceAssetIds: options.referenceAssets ? csv(options.referenceAssets) : [] } };
  }
  if (!options.curriculumSource || !options.skill || !options.grade || !options.difficulty || !options.presentationPreset || !options.audioPreset)
    throw new Error("Mathematics episodes require curriculum, skill, grade, difficulty, presentation, and audio options.");
  const grade = integer(options.grade, "--grade");
  if (grade < 5 || grade > 10) throw new Error("--grade must be between 5 and 10.");
  return { content: { type: "mathematics_education", version: "1", curriculumSourceId: options.curriculumSource, skillId: options.skill, grade: grade as 5 | 6 | 7 | 8 | 9 | 10, difficulty: options.difficulty, presentationPresetId: options.presentationPreset, audioPresetId: options.audioPreset } };
}

type EpisodeCommandOptions = Omit<Parameters<typeof episodeInput>[0], "profile" | "difficulty"> & {
  readonly workspace: string;
  readonly project: string;
  readonly profile: string;
  readonly difficulty?: string;
};

function parsedEpisodeInput(options: EpisodeCommandOptions): EpisodeInput {
  return episodeInput({
    profile: oneOf(options.profile, ["dark_truth", "mathematics_education"] as const, "--profile"),
    ...(options.premise ? { premise: options.premise } : {}),
    ...(options.storyBible ? { storyBible: options.storyBible } : {}),
    ...(options.referenceAssets ? { referenceAssets: options.referenceAssets } : {}),
    ...(options.curriculumSource ? { curriculumSource: options.curriculumSource } : {}),
    ...(options.skill ? { skill: options.skill } : {}),
    ...(options.grade ? { grade: options.grade } : {}),
    ...(options.difficulty ? { difficulty: oneOf(options.difficulty, ["foundation", "standard", "challenge"] as const, "--difficulty") } : {}),
    ...(options.presentationPreset ? { presentationPreset: options.presentationPreset } : {}),
    ...(options.audioPreset ? { audioPreset: options.audioPreset } : {}),
  });
}

export function registerConnectedApiCommands(program: Command, dependencies: ConnectedApiCommandDependencies = {}): void {
  const stdout = dependencies.stdout ?? process.stdout;
  const run = (operation: string, handler: (client: MediaforgeApiClient) => Promise<ApiResponse<unknown>>) => async () => {
    const environment = parseConnectedApiEnvironment(dependencies.environment ?? process.env);
    const client = new MediaforgeApiClient({ baseUrl: environment.baseUrl, accessToken: environment.bearerToken, ...(dependencies.request ? { request: dependencies.request } : {}) });
    try {
      output(stdout, operation, await handler(client));
    } catch (error) {
      if (error instanceof ApiProblemError) throw new ConnectedApiCliError(error.problem, { cause: error });
      throw error;
    }
  };

  const api = program.command("api").description("Connected Mediaforge API commands (credentials are read only from environment)");
  const health = api.command("health");
  health.command("live").action(run("getLiveness", (client) => client.getLiveness()));
  health.command("ready").action(run("getReadiness", (client) => client.getReadiness()));
  api.command("openapi").action(run("getOpenApiDocument", (client) => client.getOpenApiDocument()));

  api.command("quota").command("status").requiredOption("--workspace <id>")
    .action((o: { workspace: string }) => run("getQuota", (client) => client.getQuota(o.workspace))());
  api.command("usage").command("list").requiredOption("--workspace <id>")
    .option("--page-size <number>").option("--after <cursor>")
    .action((o: { workspace: string; pageSize?: string; after?: string }) => run("listUsageRecords", (client) => client.listUsageRecords(o.workspace, pageOptions(o)))());
  api.command("audit").command("list").requiredOption("--workspace <id>")
    .option("--page-size <number>").option("--after <cursor>")
    .action((o: { workspace: string; pageSize?: string; after?: string }) => run("listAuditEvents", (client) => client.listAuditEvents(o.workspace, pageOptions(o)))());

  api.command("project").command("create")
    .requiredOption("--workspace <id>").requiredOption("--name <name>")
    .requiredOption("--profile <profile>", "dark_truth or mathematics_education")
    .action((options: { workspace: string; name: string; profile: string }) =>
      run("createProject", (client) => client.createProject(options.workspace, { name: options.name, profile: oneOf(options.profile, ["dark_truth", "mathematics_education"] as const, "--profile") }))());

  const episode = api.command("episode");
  episode.command("create")
    .requiredOption("--workspace <id>").requiredOption("--project <id>")
    .requiredOption("--profile <profile>", "dark_truth or mathematics_education")
    .option("--premise <text>").option("--story-bible <id>").option("--reference-assets <ids>")
    .option("--curriculum-source <id>").option("--skill <id>").option("--grade <number>")
    .option("--difficulty <difficulty>").option("--presentation-preset <id>").option("--audio-preset <id>")
    .action((options: EpisodeCommandOptions) =>
      run("createEpisode", (client) => client.createEpisode(options.workspace, options.project, parsedEpisodeInput(options)))());
  episode.command("get").requiredOption("--workspace <id>").requiredOption("--project <id>").requiredOption("--episode <id>")
    .action((o: { workspace: string; project: string; episode: string }) => run("getEpisode", (client) => client.getEpisode(o.workspace, o.project, o.episode))());
  episode.command("replace")
    .requiredOption("--workspace <id>").requiredOption("--project <id>").requiredOption("--episode <id>").requiredOption("--if-match <etag>")
    .requiredOption("--profile <profile>", "dark_truth or mathematics_education")
    .option("--premise <text>").option("--story-bible <id>").option("--reference-assets <ids>")
    .option("--curriculum-source <id>").option("--skill <id>").option("--grade <number>")
    .option("--difficulty <difficulty>").option("--presentation-preset <id>").option("--audio-preset <id>")
    .action((options: EpisodeCommandOptions & { episode: string; ifMatch: string }) =>
      run("replaceEpisodeContent", (client) => client.replaceEpisodeContent(options.workspace, options.project, options.episode, parsedEpisodeInput(options), { ifMatch: options.ifMatch }))());

  const workflow = api.command("workflow");
  workflow.command("start").requiredOption("--workspace <id>").requiredOption("--project <id>").requiredOption("--episode <id>")
    .requiredOption("--episode-revision <number>").requiredOption("--locales <codes>").requiredOption("--variants <values>")
    .requiredOption("--approval-mode <mode>").requiredOption("--idempotency-key <key>")
    .action((o: { workspace: string; project: string; episode: string; episodeRevision: string; locales: string; variants: string; approvalMode: string; idempotencyKey: string }) => run("admitWorkflow", (client) => client.admitWorkflow(o.workspace, o.project, o.episode, { template: "episode-production", episodeRevision: integer(o.episodeRevision, "--episode-revision"), locales: csv(o.locales), variants: variants(o.variants), approvalMode: oneOf(o.approvalMode, ["required", "automatic"] as const, "--approval-mode"), publicationMode: "none" }, { idempotencyKey: o.idempotencyKey }))());
  workflow.command("status").requiredOption("--workspace <id>").requiredOption("--project <id>").requiredOption("--run <id>")
    .action((o: { workspace: string; project: string; run: string }) => run("getWorkflow", (client) => client.getWorkflow(o.workspace, o.project, o.run))());
  workflow.command("steps").requiredOption("--workspace <id>").requiredOption("--project <id>").requiredOption("--run <id>")
    .action((o: { workspace: string; project: string; run: string }) => run("listWorkflowSteps", (client) => client.listWorkflowSteps(o.workspace, o.project, o.run))());
  workflow.command("cancel").requiredOption("--workspace <id>").requiredOption("--project <id>").requiredOption("--run <id>").requiredOption("--if-match <etag>")
    .action((o: { workspace: string; project: string; run: string; ifMatch: string }) => run("cancelWorkflow", (client) => client.cancelWorkflow(o.workspace, o.project, o.run, { ifMatch: o.ifMatch }))());
  workflow.command("resume").requiredOption("--workspace <id>").requiredOption("--project <id>").requiredOption("--run <id>").requiredOption("--if-match <etag>").requiredOption("--idempotency-key <key>")
    .action((o: { workspace: string; project: string; run: string; ifMatch: string; idempotencyKey: string }) => run("resumeWorkflow", (client) => client.resumeWorkflow(o.workspace, o.project, o.run, { ifMatch: o.ifMatch, idempotencyKey: o.idempotencyKey }))());

  api.command("job").command("status").requiredOption("--workspace <id>").requiredOption("--project <id>").requiredOption("--job <id>")
    .action((o: { workspace: string; project: string; job: string }) => run("getJob", (client) => client.getJob(o.workspace, o.project, o.job))());
  api.command("asset").command("get").requiredOption("--workspace <id>").requiredOption("--project <id>").requiredOption("--asset <id>")
    .action((o: { workspace: string; project: string; asset: string }) => run("getAsset", (client) => client.getAsset(o.workspace, o.project, o.asset))());
  api.command("validation").command("list").requiredOption("--workspace <id>").requiredOption("--project <id>")
    .option("--page-size <number>").option("--after <cursor>")
    .action((o: { workspace: string; project: string; pageSize?: string; after?: string }) => run("listValidations", (client) => client.listValidations(o.workspace, o.project, pageOptions(o)))());
  api.command("publication").command("get").requiredOption("--workspace <id>").requiredOption("--project <id>").requiredOption("--publication <id>")
    .action((o: { workspace: string; project: string; publication: string }) => run("getPublication", (client) => client.getPublication(o.workspace, o.project, o.publication))());
  const approval = api.command("approval");
  approval.command("record").requiredOption("--workspace <id>").requiredOption("--project <id>").requiredOption("--challenge <id>").requiredOption("--subject <id>").requiredOption("--expected-revision <number>").requiredOption("--decision <decision>").requiredOption("--reason <text>").requiredOption("--if-match <etag>").requiredOption("--idempotency-key <key>")
    .action((o: { workspace: string; project: string; challenge: string; subject: string; expectedRevision: string; decision: string; reason: string; ifMatch: string; idempotencyKey: string }) => run("recordApproval", (client) => client.recordApproval(o.workspace, o.project, { challengeId: o.challenge, subjectId: o.subject, expectedRevision: integer(o.expectedRevision, "--expected-revision"), decision: oneOf(o.decision, ["approved", "rejected"] as const, "--decision"), reason: o.reason }, { ifMatch: o.ifMatch, idempotencyKey: o.idempotencyKey }))());
  approval.command("revoke").requiredOption("--workspace <id>").requiredOption("--project <id>").requiredOption("--approval <id>").requiredOption("--reason <text>").requiredOption("--if-match <etag>").requiredOption("--idempotency-key <key>")
    .action((o: { workspace: string; project: string; approval: string; reason: string; ifMatch: string; idempotencyKey: string }) => run("revokeApproval", (client) => client.revokeApproval(o.workspace, o.project, o.approval, { reason: o.reason }, { ifMatch: o.ifMatch, idempotencyKey: o.idempotencyKey }))());
}
