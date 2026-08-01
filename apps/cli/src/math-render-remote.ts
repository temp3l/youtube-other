import {
  parseRemoteTransportConfig,
  type RemoteTransportConfig,
  type RuntimeConfig,
} from "@mediaforge/config";
import {
  mathRenderWorkerResultSchema,
  mathSceneShardRequestSchema,
  MATH_RENDER_WORKER_RESULT_VERSION,
  MATH_SCENE_SHARD_REQUEST_VERSION,
  type MathFragmentMetadata,
  type MathSceneShardRequest,
} from "@mediaforge/math-rendering";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const imageIdSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const revisionSchema = z.string().regex(/^[a-f0-9]{40,64}$/u);
const safeJobIdSchema = z.string().regex(/^math-[a-z0-9][a-z0-9._-]{7,119}$/u);
const safeHostSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(/^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[a-f0-9:]+\])$/iu);
const safeUserSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z_][a-z0-9_-]*$/iu);

export const mathRemoteDeploymentReceiptSchema = z.strictObject({
  artifactVersion: z.literal("math-render-remote-deployment.v1"),
  target: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  repositoryRevision: revisionSchema,
  sceneWorkerContract: z.literal(MATH_RENDER_WORKER_RESULT_VERSION),
  shardRequestContract: z.literal(MATH_SCENE_SHARD_REQUEST_VERSION),
  imageId: imageIdSchema,
  architecture: z.enum(["linux/amd64", "linux/arm64"]),
  deployedAt: z.string().datetime(),
  calibration: z
    .strictObject({
      local: z.strictObject({
        rasterSamplesPerSecond: z.number().positive(),
        encodeFramesPerSecond: z.number().positive(),
        startupLatencyMs: z.number().nonnegative(),
      }),
      remote: z.strictObject({
        rasterSamplesPerSecond: z.number().positive(),
        encodeFramesPerSecond: z.number().positive(),
        startupLatencyMs: z.number().nonnegative(),
        transferMegabytesPerSecond: z.number().positive(),
      }),
    })
    .optional(),
});

export type MathRemoteDeploymentReceipt = z.infer<
  typeof mathRemoteDeploymentReceiptSchema
>;

export interface MathRemoteSettings {
  readonly executor: "local" | "remote" | "hybrid";
  readonly imageId?: string;
  readonly localSceneSlots: number;
  readonly remoteSceneSlots: number;
  readonly remoteJobConcurrency: number;
  readonly transport: RemoteTransportConfig;
}

export function parseMathRemoteSettings(
  config: RuntimeConfig
): MathRemoteSettings {
  const transport = parseRemoteTransportConfig(config);
  safeHostSchema.parse(transport.host);
  safeUserSchema.parse(transport.user);
  validateRemoteBaseDir(transport.baseDir);
  validateOptionalLocalPath(transport.knownHostsFile, "known-hosts file");
  validateOptionalLocalPath(transport.sshPrivateKey, "SSH private key");
  return {
    executor: config.mathRenderExecutor,
    ...(config.mathRemoteImageId
      ? { imageId: imageIdSchema.parse(config.mathRemoteImageId) }
      : {}),
    localSceneSlots: config.mathLocalSceneSlots,
    remoteSceneSlots: config.mathRemoteSceneSlots,
    remoteJobConcurrency: config.mathRemoteJobConcurrency,
    transport,
  };
}

function validateOptionalLocalPath(
  value: string | undefined,
  label: string
): void {
  if (value && /[\0\r\n]/u.test(value)) {
    throw new Error(`The ${label} contains an invalid character.`);
  }
}

export function validateRemoteBaseDir(value: string): string {
  if (
    !path.posix.isAbsolute(value) ||
    value === "/" ||
    value.length > 1_024 ||
    /[\0\r\n]/u.test(value) ||
    value.split("/").some((segment) => segment === "..")
  ) {
    throw new Error(
      "The remote base directory is not a contained absolute path."
    );
  }
  return path.posix.normalize(value);
}

export function createMathRemoteJobId(now = new Date()): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/gu, "")
    .replace(/\.\d{3}Z$/u, "z")
    .toLowerCase();
  return safeJobIdSchema.parse(`math-${stamp}-${randomUUID()}`);
}

export function quoteRemoteShellValue(value: string): string {
  if (/[\0\r\n]/u.test(value)) {
    throw new Error("Remote shell values must remain on one line.");
  }
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}

export function buildStrictSshArgs(
  transport: RemoteTransportConfig
): readonly string[] {
  if (!transport.verifyHostKey) {
    throw new Error(
      "Math remote rendering requires strict SSH host-key verification."
    );
  }
  return [
    "-p",
    String(transport.port),
    "-o",
    "BatchMode=yes",
    "-o",
    `ConnectTimeout=${transport.connectTimeoutSeconds}`,
    "-o",
    "StrictHostKeyChecking=yes",
    ...(transport.knownHostsFile
      ? ["-o", `UserKnownHostsFile=${transport.knownHostsFile}`]
      : []),
    ...(transport.sshPrivateKey ? ["-i", transport.sshPrivateKey] : []),
  ];
}

function sshTarget(transport: RemoteTransportConfig): string {
  safeHostSchema.parse(transport.host);
  safeUserSchema.parse(transport.user);
  return `${transport.user}@${transport.host}`;
}

function remoteCommand(
  transport: RemoteTransportConfig,
  script: string,
  values: readonly string[] = []
): CommandInvocation {
  const command = [
    "bash",
    "-lc",
    quoteRemoteShellValue(script),
    "--",
    ...values.map(quoteRemoteShellValue),
  ].join(" ");
  return {
    command: "ssh",
    args: [...buildStrictSshArgs(transport), sshTarget(transport), command],
    timeoutMs: transport.commandTimeoutSeconds * 1_000,
  };
}

function rsyncShell(transport: RemoteTransportConfig): string {
  return ["ssh", ...buildStrictSshArgs(transport)]
    .map(quoteRemoteShellValue)
    .join(" ");
}

function rsyncTarget(
  transport: RemoteTransportConfig,
  remotePath: string
): string {
  return `${sshTarget(transport)}:${quoteRemoteShellValue(remotePath)}`;
}

export interface CommandInvocation {
  readonly command: string;
  readonly args: readonly string[];
  readonly timeoutMs?: number;
}

export interface CommandResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface MathRemoteProcessExecutor {
  run(invocation: CommandInvocation): Promise<CommandResult>;
}

export class MathRemoteOperationError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "MathRemoteOperationError";
    this.status = status;
  }
}

export const systemMathRemoteProcessExecutor: MathRemoteProcessExecutor = {
  run: async ({ command, args, timeoutMs }) =>
    new Promise<CommandResult>((resolve, reject) => {
      const child = spawn(command, [...args], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      const timer =
        timeoutMs === undefined
          ? undefined
          : setTimeout(() => child.kill("SIGTERM"), timeoutMs);
      child.once("error", reject);
      child.once("close", (status) => {
        if (timer) clearTimeout(timer);
        resolve({ status: status ?? 1, stdout, stderr });
      });
    }),
};

async function requireSuccess(
  executor: MathRemoteProcessExecutor,
  invocation: CommandInvocation,
  failure: string
): Promise<CommandResult> {
  const result = await executor.run(invocation);
  if (result.status !== 0) {
    throw new MathRemoteOperationError(failure, result.status);
  }
  return result;
}

function dockerPlatform(raw: string): "linux/amd64" | "linux/arm64" {
  const architecture = raw.trim().toLowerCase();
  if (architecture === "x86_64" || architecture === "amd64") {
    return "linux/amd64";
  }
  if (architecture === "aarch64" || architecture === "arm64") {
    return "linux/arm64";
  }
  throw new Error("The remote Docker architecture is unsupported.");
}

function outputImageId(result: CommandResult): string {
  const candidate = result.stdout.match(/sha256:[a-f0-9]{64}/gu)?.at(-1);
  return imageIdSchema.parse(candidate);
}

function receiptPath(
  repositoryRoot: string,
  transport: RemoteTransportConfig
): string {
  const targetHash = createHash("sha256")
    .update(`${transport.user}@${transport.host}:${transport.port}`)
    .digest("hex")
    .slice(0, 20);
  return path.join(
    repositoryRoot,
    ".mediaforge",
    "math-render-remote",
    `${targetHash}.json`
  );
}

async function writeReceipt(
  repositoryRoot: string,
  transport: RemoteTransportConfig,
  receipt: MathRemoteDeploymentReceipt
): Promise<void> {
  const output = receiptPath(repositoryRoot, transport);
  await fs.mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  const partial = `${output}.${process.pid}.partial`;
  await fs.writeFile(partial, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await fs.rename(partial, output);
}

export async function readMathRemoteDeploymentReceipt(
  repositoryRoot: string,
  transport: RemoteTransportConfig
): Promise<MathRemoteDeploymentReceipt | undefined> {
  try {
    return mathRemoteDeploymentReceiptSchema.parse(
      JSON.parse(
        await fs.readFile(receiptPath(repositoryRoot, transport), "utf8")
      )
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw new Error("The local math deployment receipt is malformed.");
  }
}

const remoteImageLoadScript = [
  "set -Eeuo pipefail",
  "umask 077",
  'base="$1"',
  'partial="$2"',
  'archive="$3"',
  'expected="$4"',
  'case "$partial" in "$base"/deploy/*.partial) ;; *) exit 64 ;; esac',
  'case "$archive" in "$base"/deploy/*.tar) ;; *) exit 64 ;; esac',
  'mkdir -p -- "$base/deploy"',
  'chmod 700 -- "$base" "$base/deploy"',
  'mv -- "$partial" "$archive"',
  'docker load --input "$archive" >/dev/null',
  'actual="$(docker image inspect --format={{.Id}} "$expected")"',
  'rm -f -- "$archive"',
  'test "$actual" = "$expected"',
].join("; ");

export async function deployMathRemoteWorker(input: {
  readonly settings: MathRemoteSettings;
  readonly repositoryRoot: string;
  readonly executor?: MathRemoteProcessExecutor;
  readonly now?: Date;
}): Promise<MathRemoteDeploymentReceipt> {
  const { transport } = input.settings;
  const executor = input.executor ?? systemMathRemoteProcessExecutor;
  if (!transport.enabled) {
    throw new Error("REMOTE_RENDER_ENABLED must be true for math deployment.");
  }
  buildStrictSshArgs(transport);
  const architecture = dockerPlatform(
    (
      await requireSuccess(
        executor,
        remoteCommand(
          transport,
          "set -Eeuo pipefail; test \"$(id -u)\" -ne 0; docker info --format '{{.Architecture}}'"
        ),
        "Remote Docker architecture inspection failed."
      )
    ).stdout
  );
  const revision = revisionSchema.parse(
    (
      await requireSuccess(
        executor,
        {
          command: "git",
          args: ["rev-parse", "HEAD"],
          timeoutMs: 30_000,
        },
        "Repository revision inspection failed."
      )
    ).stdout.trim()
  );
  const builtImageId = outputImageId(
    await requireSuccess(
      executor,
      {
        command: "docker",
        args: [
          "build",
          "--quiet",
          "--platform",
          architecture,
          "--build-arg",
          `MATH_RENDER_WORKER_BUILD_REVISION=${revision}`,
          "--file",
          "docker/math-render-worker/Dockerfile",
          input.repositoryRoot,
        ],
        timeoutMs: transport.commandTimeoutSeconds * 1_000,
      },
      "The math worker image build failed."
    )
  );
  if (input.settings.imageId && input.settings.imageId !== builtImageId) {
    throw new Error(
      "The built math worker image ID does not match the configured immutable ID."
    );
  }
  const localIdentity = outputImageId(
    await requireSuccess(
      executor,
      {
        command: "docker",
        args: ["image", "inspect", "--format={{.Id}}", builtImageId],
        timeoutMs: 30_000,
      },
      "The immutable image is unavailable in the local Docker engine."
    )
  );
  if (localIdentity !== builtImageId) {
    throw new Error("The local Docker image identity changed after build.");
  }

  const deploymentWorkingRoot = path.join(
    input.repositoryRoot,
    ".cache",
    "math-pipeline",
    "state",
    "remote-deploy"
  );
  await fs.mkdir(deploymentWorkingRoot, { recursive: true });
  const temporaryRoot = await fs.mkdtemp(
    path.join(deploymentWorkingRoot, "deploy-")
  );
  const archive = path.join(temporaryRoot, "math-render-worker.tar");
  const remoteDeployRoot = path.posix.join(transport.baseDir, "deploy");
  const remotePartial = path.posix.join(
    remoteDeployRoot,
    `${builtImageId.slice("sha256:".length)}.tar.partial`
  );
  const remoteArchive = remotePartial.replace(/\.partial$/u, "");
  try {
    await requireSuccess(
      executor,
      {
        command: "docker",
        args: ["save", "--output", archive, builtImageId],
        timeoutMs: transport.commandTimeoutSeconds * 1_000,
      },
      "Saving the math worker archive failed."
    );
    await requireSuccess(
      executor,
      {
        command: "rsync",
        args: [
          "--archive",
          "--partial",
          "--append-verify",
          "--chmod=F600",
          "--rsh",
          rsyncShell(transport),
          archive,
          rsyncTarget(transport, remotePartial),
        ],
        timeoutMs: transport.commandTimeoutSeconds * 1_000,
      },
      "Transferring the math worker archive failed."
    );
    await requireSuccess(
      executor,
      remoteCommand(transport, remoteImageLoadScript, [
        transport.baseDir,
        remotePartial,
        remoteArchive,
        builtImageId,
      ]),
      "Remote image load or immutable identity verification failed."
    );
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }

  const receipt = mathRemoteDeploymentReceiptSchema.parse({
    artifactVersion: "math-render-remote-deployment.v1",
    target: `sha256:${createHash("sha256")
      .update(`${transport.user}@${transport.host}:${transport.port}`)
      .digest("hex")}`,
    repositoryRevision: revision,
    sceneWorkerContract: MATH_RENDER_WORKER_RESULT_VERSION,
    shardRequestContract: MATH_SCENE_SHARD_REQUEST_VERSION,
    imageId: builtImageId,
    architecture,
    deployedAt: (input.now ?? new Date()).toISOString(),
  });
  await writeReceipt(input.repositoryRoot, transport, receipt);
  return receipt;
}

const preflightScript = [
  "set -Eeuo pipefail",
  "umask 077",
  'base="$1"',
  'expected="$2"',
  'test "$(id -u)" -ne 0',
  "command -v docker >/dev/null",
  "command -v rsync >/dev/null",
  'test "$(docker image inspect --format={{.Id}} "$expected")" = "$expected"',
  'mkdir -p -- "$base/jobs" "$base/cache"',
  'chmod 700 -- "$base" "$base/jobs" "$base/cache"',
  'test "$(stat -c %a "$base")" = 700',
  'test "$(stat -c %a "$base/jobs")" = 700',
  'test "$(stat -c %a "$base/cache")" = 700',
  'test "$(df -Pk "$base" | awk "NR==2 {print \\$4}")" -gt 1048576',
  'test "$(nproc)" -gt 0',
  'test "$(awk "/MemAvailable/ {print \\$2}" /proc/meminfo)" -gt 262144',
  'docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --entrypoint node "$expected" --version >/dev/null',
  'printf "%s\\n" "$expected"',
].join("; ");

export async function checkMathRemoteWorker(input: {
  readonly settings: MathRemoteSettings;
  readonly repositoryRoot: string;
  readonly executor?: MathRemoteProcessExecutor;
}): Promise<{
  readonly imageId: string;
  readonly local: "ok";
  readonly remote: "ok";
}> {
  const executor = input.executor ?? systemMathRemoteProcessExecutor;
  const { transport } = input.settings;
  if (!transport.enabled) {
    throw new Error("REMOTE_RENDER_ENABLED must be true for math preflight.");
  }
  buildStrictSshArgs(transport);
  const receipt = await readMathRemoteDeploymentReceipt(
    input.repositoryRoot,
    transport
  );
  const expected = imageIdSchema.parse(
    input.settings.imageId ?? receipt?.imageId
  );
  if (
    input.settings.imageId &&
    receipt &&
    receipt.imageId !== input.settings.imageId
  ) {
    throw new Error(
      "The configured math image ID does not match the deployment receipt."
    );
  }
  const [localSmoke, remote] = await Promise.all([
    requireSuccess(
      executor,
      {
        command: "docker",
        args: [
          "run",
          "--rm",
          "--network",
          "none",
          "--read-only",
          "--cap-drop",
          "ALL",
          "--security-opt",
          "no-new-privileges",
          "--entrypoint",
          "node",
          expected,
          "--version",
        ],
        timeoutMs: transport.commandTimeoutSeconds * 1_000,
      },
      "The isolated local math worker smoke failed."
    ),
    requireSuccess(
      executor,
      remoteCommand(transport, preflightScript, [transport.baseDir, expected]),
      "The remote math worker preflight failed."
    ),
  ]);
  const localIdentity = outputImageId(
    await requireSuccess(
      executor,
      {
        command: "docker",
        args: ["image", "inspect", "--format={{.Id}}", expected],
        timeoutMs: 30_000,
      },
      "Local math image identity inspection failed."
    )
  );
  const remoteIdentity = outputImageId(remote);
  if (
    localSmoke.status !== 0 ||
    localIdentity !== expected ||
    remoteIdentity !== expected
  ) {
    throw new Error("Local and remote math worker image IDs differ.");
  }
  return { imageId: expected, local: "ok", remote: "ok" };
}

export const mathRemoteJobStateSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "fallback",
  "malformed",
  "missing",
]);
export type MathRemoteJobState = z.infer<typeof mathRemoteJobStateSchema>;

export const mathRemoteStatusRecordSchema = z.strictObject({
  jobId: safeJobIdSchema,
  state: mathRemoteJobStateSchema,
  sceneCount: z.number().int().nonnegative().max(9),
  updatedAt: z.string().datetime().optional(),
  message: z.string().min(1).max(400).optional(),
});

export type MathRemoteStatusRecord = z.infer<
  typeof mathRemoteStatusRecordSchema
>;

export function parseMathRemoteStatus(
  jobId: string,
  raw: string | undefined
): MathRemoteStatusRecord {
  safeJobIdSchema.parse(jobId);
  if (raw === undefined || raw.trim() === "") {
    return { jobId, state: "missing", sceneCount: 0 };
  }
  try {
    return mathRemoteStatusRecordSchema.parse(JSON.parse(raw));
  } catch {
    return { jobId, state: "malformed", sceneCount: 0 };
  }
}

export function parseMathRemoteStatusList(
  raw: string
): MathRemoteStatusRecord[] {
  const parsed = z.array(z.unknown()).parse(JSON.parse(raw));
  return parsed.map((record) => {
    const jobId =
      typeof record === "object" &&
      record !== null &&
      "jobId" in record &&
      typeof record.jobId === "string" &&
      safeJobIdSchema.safeParse(record.jobId).success
        ? record.jobId
        : "math-malformed";
    return parseMathRemoteStatus(jobId, JSON.stringify(record));
  });
}

const statusScript = [
  "const fs=require('node:fs');",
  "const path=require('node:path');",
  "const base=process.argv[1],requested=process.argv[2];",
  "const root=path.join(base,'jobs');",
  "const safe=/^math-[a-z0-9][a-z0-9._-]{7,119}$/u;",
  "const ids=requested?[requested]:(fs.existsSync(root)?fs.readdirSync(root):[]);",
  "const output=[];",
  "for(const id of ids){if(!safe.test(id)){continue;}const file=path.join(root,id,'metadata','status.json');",
  "try{output.push(JSON.parse(fs.readFileSync(file,'utf8')));}catch(error){output.push({jobId:id,state:error&&error.code==='ENOENT'?'missing':'malformed',sceneCount:0});}}",
  "process.stdout.write(JSON.stringify(output));",
].join("");

export async function inspectMathRemoteStatus(input: {
  readonly settings: MathRemoteSettings;
  readonly jobId?: string;
  readonly executor?: MathRemoteProcessExecutor;
}): Promise<MathRemoteStatusRecord[]> {
  const executor = input.executor ?? systemMathRemoteProcessExecutor;
  if (input.jobId) safeJobIdSchema.parse(input.jobId);
  const result = await requireSuccess(
    executor,
    remoteCommand(input.settings.transport, 'node -e "$1" "$2" "$3"', [
      statusScript,
      input.settings.transport.baseDir,
      input.jobId ?? "",
    ]),
    "Math remote status inspection failed."
  );
  return parseMathRemoteStatusList(result.stdout);
}

const mathRemoteLogRecordSchema = z.strictObject({
  artifactVersion: z.string().min(1).max(80),
  event: z.string().min(1).max(80),
  jobId: safeJobIdSchema,
  assignmentId: z.string().min(1).max(120),
  requestHash: z.string().regex(/^[a-f0-9]{64}$/u),
  exitClass: z.string().min(1).max(80),
  sceneCount: z.number().int().min(1).max(9),
});

export function parseMathRemoteLogs(raw: string): readonly string[] {
  return raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      JSON.stringify(mathRemoteLogRecordSchema.parse(JSON.parse(line)))
    );
}

export async function inspectMathRemoteLogs(input: {
  readonly settings: MathRemoteSettings;
  readonly jobId: string;
  readonly executor?: MathRemoteProcessExecutor;
}): Promise<readonly string[]> {
  safeJobIdSchema.parse(input.jobId);
  const logPath = path.posix.join(
    input.settings.transport.baseDir,
    "jobs",
    input.jobId,
    "logs",
    "worker.jsonl"
  );
  const result = await requireSuccess(
    input.executor ?? systemMathRemoteProcessExecutor,
    remoteCommand(
      input.settings.transport,
      'set -Eeuo pipefail; file="$1"; test -f "$file"; tail -n 200 -- "$file"',
      [logPath]
    ),
    "Math remote logs are missing or unreadable."
  );
  return parseMathRemoteLogs(result.stdout);
}

export function buildMathRemoteCleanupScript(): string {
  return [
    "set -Eeuo pipefail",
    "umask 077",
    'base="$1"',
    'cutoff="$2"',
    'jobs="$base/jobs"',
    'test "$base" != /',
    'test -d "$jobs"',
    'find "$jobs" -mindepth 1 -maxdepth 1 -type d -print0 | while IFS= read -r -d "" candidate; do name="${candidate##*/}"',
    'case "$name" in math-[a-z0-9][a-z0-9._-]*) ;; *) continue ;; esac',
    'test ! -e "$candidate/running" || continue',
    'manifest="$candidate/metadata/request.json"',
    'test -f "$manifest" || continue',
    'node -e \'const fs=require("node:fs");const p=process.argv[1],id=process.argv[2];const v=JSON.parse(fs.readFileSync(p,"utf8"));if(v.artifactVersion!=="math-scene-shard-request.v1"||v.jobId!==id)process.exit(1)\' "$manifest" "$name" || continue',
    'test "$(find "$candidate" -maxdepth 0 -mmin "+$cutoff" -print)" = "$candidate" || continue',
    'rm -rf -- "$candidate"',
    "done",
  ].join("; ");
}

export async function cleanupMathRemoteJobs(input: {
  readonly settings: MathRemoteSettings;
  readonly executor?: MathRemoteProcessExecutor;
}): Promise<void> {
  const transport = input.settings.transport;
  await requireSuccess(
    input.executor ?? systemMathRemoteProcessExecutor,
    remoteCommand(transport, buildMathRemoteCleanupScript(), [
      transport.baseDir,
      String(Math.max(1, transport.cleanupMaxAgeHours * 60)),
    ]),
    "Guarded math remote cleanup failed."
  );
}

function sha256(buffer: Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function stageMathRemoteShard(input: {
  readonly stagingRoot: string;
  readonly request: MathSceneShardRequest;
  readonly svgInputs: ReadonlyMap<string, Uint8Array>;
}): Promise<string> {
  const request = mathSceneShardRequestSchema.parse(input.request);
  safeJobIdSchema.parse(request.jobId);
  const jobRoot = path.join(input.stagingRoot, request.jobId);
  for (const scene of request.scenes) {
    if (
      scene.svgRelativePath !== `inputs/${scene.svgHash}.svg` ||
      !input.svgInputs.has(scene.svgHash)
    ) {
      throw new Error(
        "Remote shards require one content-addressed SVG input per scene."
      );
    }
    const content = input.svgInputs.get(scene.svgHash)!;
    if (sha256(content) !== scene.svgHash) {
      throw new Error("A staged SVG does not match its declared content hash.");
    }
  }
  await Promise.all([
    fs.mkdir(path.join(jobRoot, "inputs"), { recursive: true, mode: 0o700 }),
    fs.mkdir(path.join(jobRoot, "metadata"), { recursive: true, mode: 0o700 }),
    fs.mkdir(path.join(jobRoot, "output"), { recursive: true, mode: 0o700 }),
    fs.mkdir(path.join(jobRoot, "logs"), { recursive: true, mode: 0o700 }),
  ]);
  await Promise.all(
    request.scenes.map((scene) =>
      fs.writeFile(
        path.join(jobRoot, scene.svgRelativePath),
        input.svgInputs.get(scene.svgHash)!,
        { mode: 0o600 }
      )
    )
  );
  await fs.writeFile(
    path.join(jobRoot, "metadata", "request.json"),
    `${JSON.stringify(request)}\n`,
    { encoding: "utf8", mode: 0o600 }
  );
  return jobRoot;
}

export function buildMathShardUploadInvocation(
  settings: MathRemoteSettings,
  localJobRoot: string,
  jobId: string
): CommandInvocation {
  safeJobIdSchema.parse(jobId);
  if (/[\0\r\n]/u.test(localJobRoot)) {
    throw new Error("The local staging path is invalid.");
  }
  const remoteJobRoot = path.posix.join(
    settings.transport.baseDir,
    "jobs",
    jobId
  );
  return {
    command: "rsync",
    args: [
      "--archive",
      "--partial",
      "--partial-dir=.rsync-partial",
      "--delay-updates",
      "--chmod=Du=rwx,Dgo=,Fu=rw,Fgo=",
      "--rsh",
      rsyncShell(settings.transport),
      `${localJobRoot}/`,
      rsyncTarget(settings.transport, `${remoteJobRoot}/`),
    ],
    timeoutMs: settings.transport.commandTimeoutSeconds * 1_000,
  };
}

const publishReadyScript = [
  "set -Eeuo pipefail",
  "umask 077",
  'base="$1"',
  'job="$2"',
  'root="$base/jobs/$job"',
  'case "$job" in math-[a-z0-9][a-z0-9._-]*) ;; *) exit 64 ;; esac',
  'test -f "$root/metadata/request.json"',
  'test ! -e "$root/ready"',
  'chmod 700 -- "$root" "$root/inputs" "$root/metadata" "$root/output" "$root/logs"',
  'printf "%s\\n" ready >"$root/.ready.partial"',
  'mv -- "$root/.ready.partial" "$root/ready"',
].join("; ");

export async function uploadMathRemoteShard(input: {
  readonly settings: MathRemoteSettings;
  readonly localJobRoot: string;
  readonly jobId: string;
  readonly executor?: MathRemoteProcessExecutor;
}): Promise<void> {
  const executor = input.executor ?? systemMathRemoteProcessExecutor;
  await requireSuccess(
    executor,
    buildMathShardUploadInvocation(
      input.settings,
      input.localJobRoot,
      input.jobId
    ),
    "Uploading the resumable math shard failed."
  );
  await requireSuccess(
    executor,
    remoteCommand(input.settings.transport, publishReadyScript, [
      input.settings.transport.baseDir,
      safeJobIdSchema.parse(input.jobId),
    ]),
    "Publishing the atomic math shard ready marker failed."
  );
}

const launchWorkerScript = [
  "set -Eeuo pipefail",
  "umask 077",
  'base="$1"',
  'job="$2"',
  'image="$3"',
  'slots="$4"',
  'root="$base/jobs/$job"',
  'case "$job" in math-[a-z0-9][a-z0-9._-]*) ;; *) exit 64 ;; esac',
  'test -f "$root/ready"',
  'test ! -e "$root/running"',
  'chmod 755 -- "$root" "$root/inputs" "$root/metadata" "$root/output" "$root/logs"',
  'chmod 644 -- "$root/metadata/request.json" "$root"/inputs/*.svg',
  'printf "%s\\n" running >"$root/running"',
  "set +e",
  'docker run --rm --name "mediaforge-$job" --network none --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit 64 --cpus "$slots" -e "MATH_RENDER_WORKER_IMAGE_ID=$image" -e "MATH_RENDER_WORKER_BUILD_REVISION=$(docker image inspect --format={{index .Config.Labels \\"org.opencontainers.image.revision\\"}} "$image")" -v "$root:/job" -v "$base/cache:/cache" "$image" /job /cache /job/metadata/request.json >"$root/logs/process.stdout" 2>"$root/logs/process.stderr"',
  "status=$?",
  "set -e",
  'rm -f -- "$root/running"',
  'exit "$status"',
].join("; ");

export async function launchMathRemoteShard(input: {
  readonly settings: MathRemoteSettings;
  readonly jobId: string;
  readonly executor?: MathRemoteProcessExecutor;
}): Promise<void> {
  const imageId = imageIdSchema.parse(input.settings.imageId);
  await requireSuccess(
    input.executor ?? systemMathRemoteProcessExecutor,
    remoteCommand(input.settings.transport, launchWorkerScript, [
      input.settings.transport.baseDir,
      safeJobIdSchema.parse(input.jobId),
      imageId,
      String(input.settings.remoteSceneSlots),
    ]),
    "The immutable remote math shard worker failed."
  );
}

export function buildMathShardDownloadInvocation(
  settings: MathRemoteSettings,
  jobId: string,
  localPartialRoot: string
): CommandInvocation {
  safeJobIdSchema.parse(jobId);
  if (/[\0\r\n]/u.test(localPartialRoot)) {
    throw new Error("The local partial download path is invalid.");
  }
  const remoteJobRoot = path.posix.join(
    settings.transport.baseDir,
    "jobs",
    jobId
  );
  return {
    command: "rsync",
    args: [
      "--archive",
      "--partial",
      "--partial-dir=.rsync-partial",
      "--append-verify",
      "--include=/output/***",
      "--include=/work/***",
      "--include=/logs/***",
      "--include=/metadata/***",
      "--exclude=*",
      "--rsh",
      rsyncShell(settings.transport),
      rsyncTarget(settings.transport, `${remoteJobRoot}/`),
      `${localPartialRoot}/`,
    ],
    timeoutMs: settings.transport.commandTimeoutSeconds * 1_000,
  };
}

export async function downloadMathRemoteShard(input: {
  readonly settings: MathRemoteSettings;
  readonly jobId: string;
  readonly localPartialRoot: string;
  readonly executor?: MathRemoteProcessExecutor;
}): Promise<void> {
  await requireSuccess(
    input.executor ?? systemMathRemoteProcessExecutor,
    buildMathShardDownloadInvocation(
      input.settings,
      input.jobId,
      input.localPartialRoot
    ),
    "Downloading the resumable math shard failed."
  );
}

export async function promoteDownloadedMathFragment(input: {
  readonly partialPath: string;
  readonly finalPath: string;
  readonly expected: Pick<MathFragmentMetadata, "sha256" | "byteLength">;
}): Promise<void> {
  if (!input.partialPath.endsWith(".partial")) {
    throw new Error(
      "Downloaded fragments must remain partial until validated."
    );
  }
  const stats = await fs.stat(input.partialPath);
  if (
    stats.size !== input.expected.byteLength ||
    sha256(await fs.readFile(input.partialPath)) !== input.expected.sha256
  ) {
    throw new Error("Downloaded fragment hash or byte length is invalid.");
  }
  await fs.mkdir(path.dirname(input.finalPath), { recursive: true });
  await fs.rename(input.partialPath, input.finalPath);
}

export function validateDownloadedWorkerResult(
  raw: unknown,
  expectedImageId: string
) {
  const result = mathRenderWorkerResultSchema.parse(raw);
  if (
    result.artifactVersion !== MATH_RENDER_WORKER_RESULT_VERSION ||
    result.worker.imageId !== imageIdSchema.parse(expectedImageId)
  ) {
    throw new Error(
      "Downloaded worker result has the wrong immutable identity."
    );
  }
  return result;
}
