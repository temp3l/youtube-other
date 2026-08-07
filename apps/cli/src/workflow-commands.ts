import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  TASK_SCHEMA_VERSION,
  WORKFLOW_SCHEMA_VERSION,
  artifactContractSchema,
  artifactManifestSchema,
  artifactRefSchema,
  contentLocaleSchema,
  contentVariantSchema,
  productionUnitIdSchema,
  taskDefinitionSchema,
  workflowDefinitionSchema,
  type ArtifactContract,
  type ContentProfileId,
  type OperatorOverride,
  type TaskDefinition,
  type WorkflowDefinition,
} from "@mediaforge/domain";
import {
  DarkTruthProfileStore,
  assessReferenceReadiness,
  assessStoryBibleReadiness,
  createDarkTruthFingerprintMaterial,
  createDarkTruthTaskRegistrations,
  darkTruthWorkflowDefinition,
  inspectDarkTruthMigrationStatus,
  importLegacyCharacterReferenceDraft,
  runDarkTruthDeterministicFixture,
} from "@mediaforge/dark-truth";
import {
  MathProfileStore,
  assessEducationalVisualStyleReadiness,
  assessMathProfileIntegrationReadiness,
  assessMathLessonProfileReadiness,
  createMathTaskRegistrations,
  inspectMathMigrationStatus,
  mathWorkflowDefinition,
  runMathProfileDeterministicFixture,
} from "@mediaforge/math-education";
import {
  createHistoryTaskRegistrations,
  createHistoryWorkflowOperator,
  historyWorkflowDefinition,
} from "@mediaforge/history";
import {
  createStrategicSupplementalTaskRegistrations,
  createStrategicSupplementalWorkflowOperator,
  runStrategicSupplementalWorkflowFixture,
  strategicSupplementalWorkflowDefinition,
} from "@mediaforge/strategic-reinvention";
import {
  ArtifactRepository,
  ArtifactRepositoryError,
  artifactMigrationPlanSchema,
  BatchCoordinator,
  BatchStore,
  WorkflowApprovalError,
  WorkflowBlockedError,
  WorkflowInterruptedError,
  WorkflowInputError,
  WorkflowConflictError,
  WorkflowPermanentFailureError,
  WorkflowOperator,
  TaskRegistryError,
  createTaskRegistry,
  errorToExitCode,
  normalizeWorkflowError,
  type TaskImplementation,
  type TaskFingerprintMaterial,
  type TaskRegistration,
  type BatchPlanInput,
  type BatchWorkItem,
} from "@mediaforge/workflow-engine";
import { Command } from "commander";
import { z } from "zod";
import { createCanonicalMathOperator } from "./math-workflow-runtime.js";

const WORKFLOW_CLI_SCHEMA_VERSION = "mediaforge.workflow-cli.v1" as const;
const resourceSchema = z.enum([
  "episode",
  "history",
  "lesson",
  "strategic-episode",
  "fixture",
]);
type WorkflowResource = z.infer<typeof resourceSchema>;

interface GlobalOptions {
  readonly workspace?: string;
  readonly json?: boolean;
  readonly dryRun?: boolean;
}

interface IdentityOptions {
  readonly unit?: string;
  readonly episode?: string;
  readonly lesson?: string;
  readonly unitRoot?: string;
  readonly locale?: string;
  readonly variant?: string;
  readonly artifacts?: string;
  readonly authorizeProvider?: boolean;
  readonly providerMode?: "fixture-mock" | "provider";
  readonly python?: string;
  readonly json?: boolean;
}

interface ProfileRuntime {
  readonly resource: WorkflowResource;
  readonly profileId: ContentProfileId;
  readonly workflow: WorkflowDefinition;
  readonly registrations: readonly TaskRegistration[];
}

export class WorkflowCliError extends Error {
  public readonly normalized: ReturnType<typeof normalizeWorkflowError>;
  public readonly exitCode: number;

  public constructor(error: unknown) {
    const normalized = normalizeWorkflowError(error);
    super(normalized.message, { cause: error });
    this.name = "WorkflowCliError";
    this.normalized = normalized;
    this.exitCode = errorToExitCode(error);
  }
}

function fixtureDefinition(
  id: `fixture.${string}`,
  dependencies: readonly `fixture.${string}`[] = []
): TaskDefinition {
  return taskDefinitionSchema.parse({
    schemaVersion: TASK_SCHEMA_VERSION,
    id,
    implementationVersion: "fixture.v1",
    displayName:
      id === "fixture.prepare" ? "Prepare fixture" : "Finish fixture",
    description: "Execute a deterministic no-provider CLI acceptance task.",
    applicableProfiles: ["dark-truth"],
    dependencies: dependencies.map((taskId) => ({ taskId, optional: false })),
    inputs: [],
    outputs: [],
    executionKind: "deterministic",
    policies: {
      cache: "fingerprint",
      retryLimit: 1,
      timeoutMs: 5_000,
      lockScope: "task",
      approvalRequired: false,
      batchable: false,
      provider: "none",
      estimatedCostClass: "none",
    },
    cli: {
      resource: "task",
      command: id.slice("fixture.".length),
      examples: [`mediaforge workflow fixture run --task ${id}`],
    },
    observability: { operationName: id, redactedFields: [] },
  });
}

function fixtureRuntime(interrupt = false): ProfileRuntime {
  const executePrepare: TaskImplementation = () => {
    if (interrupt) {
      throw new WorkflowInterruptedError("Deterministic fixture interruption.");
    }
    return { outputArtifacts: [], warnings: [] };
  };
  const prepare = fixtureDefinition("fixture.prepare");
  const finish = fixtureDefinition("fixture.finish", ["fixture.prepare"]);
  const registrations: readonly TaskRegistration[] = [
    {
      definition: prepare,
      implementation: { owner: "@mediaforge/testing", execute: executePrepare },
    },
    {
      definition: finish,
      implementation: {
        owner: "@mediaforge/testing",
        execute: () => ({ outputArtifacts: [], warnings: [] }),
      },
    },
  ];
  return {
    resource: "fixture",
    profileId: "dark-truth",
    registrations,
    workflow: workflowDefinitionSchema.parse({
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      id: "fixture.workflow",
      revision: "fixture.v1",
      profileId: "dark-truth",
      taskIds: registrations.map((registration) => registration.definition.id),
    }),
  };
}

function profileRuntime(
  resourceInput: string,
  interrupt = false
): ProfileRuntime {
  const resource = resourceSchema.parse(resourceInput);
  if (resource === "episode") {
    return {
      resource,
      profileId: "dark-truth",
      workflow: darkTruthWorkflowDefinition,
      registrations: createDarkTruthTaskRegistrations(),
    };
  }
  if (resource === "lesson") {
    return {
      resource,
      profileId: "mathematics-education",
      workflow: mathWorkflowDefinition,
      registrations: createMathTaskRegistrations(),
    };
  }
  if (resource === "history") {
    return {
      resource,
      profileId: "history",
      workflow: historyWorkflowDefinition,
      registrations: createHistoryTaskRegistrations(),
    };
  }
  if (resource === "strategic-episode") {
    return {
      resource,
      profileId: "strategic-reinvention",
      workflow: strategicSupplementalWorkflowDefinition,
      registrations: createStrategicSupplementalTaskRegistrations(),
    };
  }
  return fixtureRuntime(interrupt);
}

function unitId(resource: WorkflowResource, options: IdentityOptions): string {
  const value =
    options.unit ??
    (resource === "episode" || resource === "history" || resource === "strategic-episode"
      ? options.episode
      : resource === "lesson"
        ? options.lesson
        : "workflow-fixture");
  if (!value) {
    throw new WorkflowBlockedError(
      `A ${resource === "episode" || resource === "history" || resource === "strategic-episode" ? "--episode" : "--lesson"} identifier is required.`
    );
  }
  return productionUnitIdSchema.parse(value);
}

function resolveUnitRoot(
  program: Command,
  resource: WorkflowResource,
  options: IdentityOptions
): string {
  const workspace =
    program.optsWithGlobals<GlobalOptions>().workspace ?? process.cwd();
  return path.resolve(
    options.unitRoot ?? path.join(workspace, ...(resource === "history" ? ["episodes", unitId(resource, options)] : [unitId(resource, options)]))
  );
}

function instanceId(
  workflow: WorkflowDefinition,
  unit: string,
  locale: string,
  variant: string
): string {
  const hash = crypto
    .createHash("sha256")
    .update(
      `${workflow.id}\0${workflow.revision}\0${unit}\0${locale}\0${variant}`
    )
    .digest("hex");
  return `workflow-${hash.slice(0, 32)}`;
}

async function readAvailableArtifacts(
  filePath: string | undefined
): Promise<readonly ArtifactContract[]> {
  if (!filePath) return [];
  const parsed = JSON.parse(
    await fs.readFile(path.resolve(filePath), "utf8")
  ) as unknown;
  const values =
    parsed !== null &&
    typeof parsed === "object" &&
    "availableArtifacts" in parsed
      ? Reflect.get(parsed, "availableArtifacts")
      : parsed;
  return z.array(artifactContractSchema).parse(values);
}

async function createOperator(
  program: Command,
  resource: WorkflowResource,
  options: IdentityOptions,
  interrupt = false
): Promise<WorkflowOperator> {
  const runtime = profileRuntime(resource, interrupt);
  const unit = unitId(resource, options);
  const locale = contentLocaleSchema.parse(options.locale ?? "en");
  const variant = contentVariantSchema.parse(options.variant ?? "full");
  const unitRoot = resolveUnitRoot(program, resource, options);
  if (resource === "lesson") {
    return createCanonicalMathOperator({
      repositoryRoot: process.cwd(),
      workspaceRoot: path.dirname(unitRoot),
      unitId: unit,
      locale,
      contentVariant: variant as "full" | "short",
      ...(options.python ? { pythonExecutable: options.python } : {}),
      ...(options.providerMode ? { providerMode: options.providerMode } : {}),
      ...(options.authorizeProvider ? { authorizeProvider: true } : {}),
    });
  }
  if (resource === "history") {
    return createHistoryWorkflowOperator({
      unitRoot,
      episodeId: unit,
      locale,
      variant,
    });
  }
  if (resource === "strategic-episode") {
    return createStrategicSupplementalWorkflowOperator({
      unitRoot,
      episodeId: unit,
      locale,
      variant,
    });
  }
  let registrations = runtime.registrations;
  let fingerprintMaterial:
    | Readonly<Record<string, TaskFingerprintMaterial>>
    | undefined;
  if (resource === "episode") {
    const profileStore = new DarkTruthProfileStore(unitRoot);
    const bible = await profileStore.readStoryBible();
    const references = await profileStore.readReferences();
    const bibleReadiness = assessStoryBibleReadiness(bible);
    const referenceReadiness = assessReferenceReadiness({
      bible,
      references,
      variant,
      taskId: "darktruth.scene-images",
    });
    registrations = createDarkTruthTaskRegistrations(
      {},
      {
        bibleReady: bibleReadiness.ready,
        bibleReasons: bibleReadiness.reasons,
        referencesReady: referenceReadiness.ready,
        referenceReasons: referenceReadiness.reasons,
      }
    );
    fingerprintMaterial = createDarkTruthFingerprintMaterial({
      bible,
      references,
    });
  }
  const artifactRepository = new ArtifactRepository({
    workspaceRoot: path.dirname(unitRoot),
  });
  return new WorkflowOperator({
    unitRoot,
    workflow: runtime.workflow,
    registry: createTaskRegistry(registrations),
    identity: {
      instanceId: instanceId(runtime.workflow, unit, locale, variant),
      unitId: unit,
      locale,
      variant,
    },
    availableArtifacts: await readAvailableArtifacts(options.artifacts),
    ...(fingerprintMaterial ? { fingerprintMaterial } : {}),
    verifyArtifact: async (manifest) => {
      try {
        const verified = await artifactRepository.verify(manifest.ref, {
          dependencyFingerprints: manifest.dependencyFingerprints,
        });
        return (
          verified.manifest.id === manifest.id &&
          verified.manifest.checksumSha256 === manifest.checksumSha256
        );
      } catch {
        return false;
      }
    },
  });
}

function output(value: unknown): void {
  process.stdout.write(
    `${JSON.stringify({ schemaVersion: WORKFLOW_CLI_SCHEMA_VERSION, result: value }, null, 2)}\n`
  );
}

function action<T extends readonly unknown[]>(
  handler: (...args: T) => Promise<void>
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await handler(...args);
    } catch (error) {
      throw new WorkflowCliError(
        error instanceof z.ZodError || error instanceof TaskRegistryError
          ? new WorkflowInputError(error.message)
          : error
      );
    }
  };
}

function migrationCliError(error: unknown): unknown {
  if (!(error instanceof ArtifactRepositoryError)) return error;
  if (
    error.code === "ARTIFACT_CONFLICT" ||
    error.code === "ARTIFACT_AMBIGUOUS" ||
    error.code === "MIGRATION_PLAN_STALE" ||
    error.code === "ROLLBACK_UNSAFE"
  ) {
    return new WorkflowConflictError(
      "PERSISTENCE_CONFLICT",
      error.message,
      "Recreate the dry-run plan or resolve the recorded artifact conflict."
    );
  }
  if (error.code === "MIGRATION_CONFIRMATION_REQUIRED") {
    return new WorkflowInputError(error.message);
  }
  return new WorkflowPermanentFailureError(
    "ARTIFACT_VALIDATION_FAILED",
    error.message,
    "Repair artifact containment, schema, provenance, or hash evidence before retrying."
  );
}

async function readJsonFile(filePath: string): Promise<unknown> {
  return JSON.parse(
    await fs.readFile(path.resolve(filePath), "utf8")
  ) as unknown;
}

function addArtifactCommands(program: Command): void {
  const artifact = program
    .command("artifact")
    .description("Verify and explicitly migrate canonical artifacts");

  artifact
    .command("verify")
    .requiredOption("--ref <path>", "artifact reference JSON")
    .action(
      action(async (options: { readonly ref: string }) => {
        try {
          const workspace =
            program.optsWithGlobals<GlobalOptions>().workspace ?? process.cwd();
          const repository = new ArtifactRepository({
            workspaceRoot: workspace,
          });
          output(
            await repository.verify(
              artifactRefSchema.parse(await readJsonFile(options.ref))
            )
          );
        } catch (error) {
          throw migrationCliError(error);
        }
      })
    );

  artifact
    .command("migrate")
    .description("Plan by default; write only from an exact confirmed plan")
    .option("--ref <path>", "artifact reference JSON for dry-run planning")
    .option("--plan <path>", "previously emitted migration plan JSON")
    .option("--write", "apply the exact plan after revalidation")
    .option("--confirm <plan-id>", "exact deterministic migration plan ID")
    .action(
      action(
        async (options: {
          readonly ref?: string;
          readonly plan?: string;
          readonly write?: boolean;
          readonly confirm?: string;
        }) => {
          try {
            const workspace =
              program.optsWithGlobals<GlobalOptions>().workspace ??
              process.cwd();
            const repository = new ArtifactRepository({
              workspaceRoot: workspace,
            });
            if (!options.write) {
              if (!options.ref) {
                throw new WorkflowInputError(
                  "Dry-run migration requires --ref <artifact-ref.json>."
                );
              }
              const plan = await repository.planMigration(
                artifactRefSchema.parse(await readJsonFile(options.ref))
              );
              output({ dryRun: true, plan });
              return;
            }
            if (!options.plan || !options.confirm) {
              throw new WorkflowInputError(
                "Write mode requires --plan <plan.json> and --confirm <plan-id>."
              );
            }
            const plan = artifactMigrationPlanSchema.parse(
              await readJsonFile(options.plan)
            );
            output({
              dryRun: false,
              result: await repository.applyMigration({
                plan,
                confirmationPlanId: options.confirm,
              }),
            });
          } catch (error) {
            throw migrationCliError(error);
          }
        }
      )
    );

  artifact
    .command("rollback")
    .requiredOption("--manifest <path>", "hash-bound rollback manifest")
    .action(
      action(async (options: { readonly manifest: string }) => {
        try {
          const workspace =
            program.optsWithGlobals<GlobalOptions>().workspace ?? process.cwd();
          const repository = new ArtifactRepository({
            workspaceRoot: workspace,
          });
          await repository.rollbackMigration(path.resolve(options.manifest));
          output({
            rolledBack: true,
            manifest: path.resolve(options.manifest),
          });
        } catch (error) {
          throw migrationCliError(error);
        }
      })
    );
}

function addIdentityOptions(
  command: Command,
  resource: WorkflowResource
): Command {
  if (resource === "episode" || resource === "history") {
    command.requiredOption("--episode <id>", "episode ID or slug");
  } else if (resource === "lesson") {
    command.requiredOption("--lesson <id>", "lesson ID or slug");
  } else {
    command.option("--unit <id>", "fixture unit ID", "workflow-fixture");
  }
  return command
    .option("--unit-root <path>", "exact workflow unit root")
    .option("--locale <locale>", "workflow locale", "en")
    .option("--variant <variant>", "workflow variant", "full")
    .option(
      "--artifacts <path>",
      "JSON array of currently available artifact contracts"
    )
    .option("--python <path>", "approved math verifier interpreter")
    .option(
      "--provider-mode <mode>",
      "configured provider mode (fixture-mock or provider)"
    )
    .option(
      "--authorize-provider",
      "explicitly authorize the configured provider task for this action"
    )
    .option("--json", "emit the stable JSON contract");
}

async function manifestsInput(
  filePath: string | undefined
): Promise<readonly unknown[]> {
  if (!filePath) return [];
  const value = JSON.parse(
    await fs.readFile(path.resolve(filePath), "utf8")
  ) as unknown;
  return z.array(artifactManifestSchema).parse(value);
}

const batchInputSchema = z
  .object({
    profileId: z.enum(["dark-truth", "mathematics-education", "strategic-reinvention"]),
    provider: z.string().min(1),
    model: z.string().min(1).optional(),
    operation: z.string().min(3),
    executionMode: z.enum(["sync", "provider-batch"]),
    configuration: z
      .object({
        concurrency: z.number().int().positive(),
        retryLimit: z.number().int().nonnegative(),
        rateLimitPerSecond: z.number().positive().optional(),
      })
      .strict(),
    items: z
      .array(
        z
          .object({
            key: z.string().min(1),
            taskId: z.string().min(3),
            unitId: z.string().min(1),
            locale: z.string().min(2),
            variant: z.string().min(1),
            fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
            groupKey: z.string().min(1).optional(),
            revisions: z.record(z.string(), z.string()).optional(),
          })
          .strict()
      )
      .min(1),
  })
  .strict();

interface BatchCommandOptions {
  readonly input?: string;
  readonly batchRoot?: string;
  readonly batchId?: string;
  readonly evidence?: string;
  readonly reason?: string;
}

function batchRoot(program: Command, options: BatchCommandOptions): string {
  const workspace =
    program.optsWithGlobals<GlobalOptions>().workspace ?? process.cwd();
  return path.resolve(
    options.batchRoot ?? path.join(workspace, ".mediaforge", "workflow-batches")
  );
}

async function readBatchPlan(filePath: string): Promise<BatchPlanInput> {
  const parsed = batchInputSchema.parse(
    JSON.parse(await fs.readFile(path.resolve(filePath), "utf8")) as unknown
  );
  const runtime =
    parsed.profileId === "dark-truth"
      ? profileRuntime("episode")
      : parsed.profileId === "strategic-reinvention"
        ? profileRuntime("strategic-episode")
        : profileRuntime("lesson");
  const registry = createTaskRegistry(runtime.registrations);
  const items: BatchWorkItem[] = parsed.items.map((item) => {
    let execute: TaskImplementation;
    if (item.taskId === "fixture.batch") {
      execute = () => ({ outputArtifacts: [], warnings: [] });
    } else {
      const registration = registry.get(item.taskId);
      if (!registration.definition.policies.batchable) {
        throw new WorkflowBlockedError(`Task ${item.taskId} is not batchable.`);
      }
      if (!registration.implementation.execute) {
        throw new WorkflowBlockedError(
          `Task ${item.taskId} has no migrated implementation binding.`
        );
      }
      execute = registration.implementation.execute;
    }
    return {
      key: item.key,
      taskId: item.taskId,
      unitId: item.unitId,
      locale: item.locale,
      variant: item.variant,
      fingerprint: item.fingerprint,
      execute,
      ...(item.groupKey ? { groupKey: item.groupKey } : {}),
      ...(item.revisions ? { revisions: item.revisions } : {}),
    };
  });
  return {
    profileId: parsed.profileId,
    provider: parsed.provider,
    operation: parsed.operation,
    executionMode: parsed.executionMode,
    configuration: {
      concurrency: parsed.configuration.concurrency,
      retryLimit: parsed.configuration.retryLimit,
      ...(parsed.configuration.rateLimitPerSecond !== undefined
        ? { rateLimitPerSecond: parsed.configuration.rateLimitPerSecond }
        : {}),
    },
    items,
    ...(parsed.model ? { model: parsed.model } : {}),
  };
}

function addBatchCommands(program: Command): void {
  const batch = program
    .command("batch")
    .description("Canonical item-level batch lifecycle and observability");
  const inputCommand = (name: "plan" | "run" | "resume") =>
    batch
      .command(name)
      .requiredOption("--input <path>", "canonical batch input JSON")
      .option("--batch-root <path>", "canonical batch state root");
  inputCommand("plan").action(
    action(
      async (options: BatchCommandOptions & { readonly input: string }) => {
        const coordinator = new BatchCoordinator({
          root: batchRoot(program, options),
        });
        output(await coordinator.plan(await readBatchPlan(options.input)));
      }
    )
  );
  for (const name of ["run", "resume"] as const) {
    inputCommand(name).action(
      action(
        async (options: BatchCommandOptions & { readonly input: string }) => {
          const coordinator = new BatchCoordinator({
            root: batchRoot(program, options),
          });
          output(await coordinator.run(await readBatchPlan(options.input)));
        }
      )
    );
  }
  batch
    .command("status")
    .requiredOption("--batch-id <id>", "canonical batch ID")
    .option("--batch-root <path>", "canonical batch state root")
    .action(
      action(
        async (options: BatchCommandOptions & { readonly batchId: string }) => {
          output(
            await new BatchStore(batchRoot(program, options)).read(
              options.batchId
            )
          );
        }
      )
    );
  batch
    .command("reconcile")
    .requiredOption("--batch-id <id>", "canonical batch ID")
    .requiredOption(
      "--evidence <path>",
      "provider reconciliation evidence JSON"
    )
    .option("--batch-root <path>", "canonical batch state root")
    .action(
      action(
        async (
          options: BatchCommandOptions & {
            readonly batchId: string;
            readonly evidence: string;
          }
        ) => {
          const evidence = JSON.parse(
            await fs.readFile(path.resolve(options.evidence), "utf8")
          ) as unknown;
          output(
            await new BatchCoordinator({
              root: batchRoot(program, options),
            }).reconcile(
              options.batchId,
              z
                .array(
                  z
                    .object({
                      itemId: z.string(),
                      status: z.enum([
                        "succeeded",
                        "failed-retryable",
                        "failed-permanent",
                      ]),
                      providerRequestId: z.string().optional(),
                      outputManifestIds: z.array(z.string()).optional(),
                      errorCode: z.string().optional(),
                    })
                    .strict()
                )
                .parse(evidence)
                .map((item) => ({
                  itemId: item.itemId,
                  status: item.status,
                  ...(item.providerRequestId
                    ? { providerRequestId: item.providerRequestId }
                    : {}),
                  ...(item.outputManifestIds
                    ? { outputManifestIds: item.outputManifestIds }
                    : {}),
                  ...(item.errorCode ? { errorCode: item.errorCode } : {}),
                }))
            )
          );
        }
      )
    );
  batch
    .command("cancel")
    .requiredOption("--batch-id <id>", "canonical batch ID")
    .requiredOption("--reason <text>", "cancellation reason")
    .option("--batch-root <path>", "canonical batch state root")
    .action(
      action(
        async (
          options: BatchCommandOptions & {
            readonly batchId: string;
            readonly reason: string;
          }
        ) => {
          output(
            await new BatchCoordinator({
              root: batchRoot(program, options),
            }).cancel(options.batchId, options.reason)
          );
        }
      )
    );
}

function addResourceCommands(
  program: Command,
  resource: WorkflowResource
): void {
  const runtime = profileRuntime(resource);
  const parent = program
    .command(resource)
    .description(
      resource === "fixture"
        ? "Deterministic no-provider packaged CLI acceptance workflow"
        : `Canonical ${resource} workflow operator skeleton`
    );
  const examples = runtime.registrations
    .flatMap((registration) => registration.definition.cli.examples)
    .slice(0, 4);
  parent.addHelpText(
    "after",
    `\nRegistry examples:\n${examples.map((item) => `  ${item}`).join("\n")}\n`
  );

  parent.command("list").action(
    action(async () => {
      output(createTaskRegistry(runtime.registrations).list(runtime.profileId));
    })
  );

  if (resource === "episode") {
    addIdentityOptions(parent.command("profile-status"), resource).action(
      action(async (options: IdentityOptions) => {
        output(
          await inspectDarkTruthMigrationStatus(
            resolveUnitRoot(program, resource, options)
          )
        );
      })
    );
    addIdentityOptions(parent.command("profile-validate"), resource).action(
      action(async (options: IdentityOptions) => {
        const store = new DarkTruthProfileStore(
          resolveUnitRoot(program, resource, options)
        );
        const bible = await store.readStoryBible();
        const references = await store.readReferences();
        output({
          bibleValid: bible !== null,
          bibleReadiness: assessStoryBibleReadiness(bible),
          referenceManifestValid: references !== null,
          referenceReadiness: assessReferenceReadiness({
            bible,
            references,
            variant: contentVariantSchema.parse(options.variant ?? "full"),
            taskId: "darktruth.scene-images",
          }),
        });
      })
    );
    parent.command("profile-fixture").action(
      action(async () => {
        output(runDarkTruthDeterministicFixture());
      })
    );
    addIdentityOptions(
      parent
        .command("profile-import-legacy")
        .option("--write", "persist the unapproved imported reference draft"),
      resource
    ).action(
      action(
        async (options: IdentityOptions & { readonly write?: boolean }) => {
          const store = new DarkTruthProfileStore(
            resolveUnitRoot(program, resource, options)
          );
          const bible = await store.readStoryBible();
          if (!bible) {
            throw new WorkflowBlockedError(
              "A valid story bible is required before importing legacy references."
            );
          }
          const manifest = await importLegacyCharacterReferenceDraft({
            unitRoot: store.unitRoot,
            bible,
          });
          output({
            dryRun: !options.write,
            manifest,
            ...(options.write
              ? { writeResult: await store.writeReferences(manifest) }
              : {}),
          });
        }
      )
    );
  } else if (resource === "lesson") {
    addIdentityOptions(parent.command("profile-status"), resource).action(
      action(async (options: IdentityOptions) => {
        output(
          await inspectMathMigrationStatus(
            resolveUnitRoot(program, resource, options)
          )
        );
      })
    );
    addIdentityOptions(parent.command("profile-validate"), resource).action(
      action(async (options: IdentityOptions) => {
        const store = new MathProfileStore(
          resolveUnitRoot(program, resource, options)
        );
        const profile = await store.readLessonProfile();
        const visualStyle = await store.readVisualStyle();
        output({
          lessonProfileValid: profile !== null,
          lessonProfileReadiness: assessMathLessonProfileReadiness(profile),
          visualStyleValid: visualStyle !== null,
          visualStyleReadiness: assessEducationalVisualStyleReadiness(
            visualStyle,
            contentLocaleSchema.parse(options.locale ?? "en")
          ),
          integrationReadiness: assessMathProfileIntegrationReadiness(
            profile,
            visualStyle,
            contentLocaleSchema.parse(options.locale ?? "en")
          ),
        });
      })
    );
    parent.command("profile-fixture").action(
      action(async () => {
        output(runMathProfileDeterministicFixture());
      })
    );
  } else if (resource === "strategic-episode") {
    parent.command("profile-fixture").action(
      action(async () => {
        output(runStrategicSupplementalWorkflowFixture());
      })
    );
  }

  for (const commandName of ["plan", "graph", "status", "next"] as const) {
    addIdentityOptions(parent.command(commandName), resource).action(
      action(async (options: IdentityOptions) => {
        const operator = await createOperator(program, resource, options);
        if (commandName === "plan") output(await operator.plan());
        if (commandName === "graph") output(operator.graph());
        if (commandName === "status") output(await operator.status());
        if (commandName === "next") {
          const status = await operator.status();
          if (!status.nextTaskId && !status.complete) {
            if (
              status.tasks.some(
                (task) => task.readiness === "awaiting-approval"
              )
            ) {
              throw new WorkflowApprovalError(
                "The next workflow task requires approval."
              );
            }
            throw new WorkflowBlockedError(
              "No workflow task is currently ready."
            );
          }
          output({ nextTaskId: status.nextTaskId, complete: status.complete });
        }
      })
    );
  }

  addIdentityOptions(parent.command("run-next"), resource)
    .option("--continue", "continue beyond the first task")
    .option("--dry-run", "preview one selected task without writing")
    .option("--interrupt", "interrupt the fixture task deterministically")
    .action(
      action(
        async (
          options: IdentityOptions & {
            readonly continue?: boolean;
            readonly dryRun?: boolean;
            readonly interrupt?: boolean;
          }
        ) => {
          if (options.interrupt && resource !== "fixture") {
            throw new WorkflowBlockedError(
              "--interrupt is only valid for the fixture workflow."
            );
          }
          const operator = await createOperator(
            program,
            resource,
            options,
            options.interrupt
          );
          const dryRun =
            options.dryRun ??
            program.optsWithGlobals<GlobalOptions>().dryRun ??
            false;
          output(
            await operator.runNext({
              ...(dryRun ? { dryRun: true } : {}),
              ...(options.continue !== undefined
                ? { continue: options.continue }
                : {}),
            })
          );
        }
      )
    );

  addIdentityOptions(parent.command("run"), resource)
    .requiredOption("--task <task-id>", "registered task ID")
    .option("--dry-run", "preview without writing")
    .action(
      action(
        async (
          options: IdentityOptions & {
            readonly task: string;
            readonly dryRun?: boolean;
          }
        ) => {
          const dryRun =
            options.dryRun ??
            program.optsWithGlobals<GlobalOptions>().dryRun ??
            false;
          output(
            await (
              await createOperator(program, resource, options)
            ).runTask(options.task, {
              ...(dryRun ? { dryRun: true } : {}),
            })
          );
        }
      )
    );

  for (const commandName of [
    "resume",
    "retry-failed",
    "validate-state",
  ] as const) {
    addIdentityOptions(parent.command(commandName), resource).action(
      action(async (options: IdentityOptions) => {
        const operator = await createOperator(program, resource, options);
        output(
          commandName === "resume"
            ? await operator.resume()
            : commandName === "retry-failed"
              ? await operator.retryFailed()
              : await operator.validateState()
        );
      })
    );
  }

  addIdentityOptions(parent.command("invalidate"), resource)
    .requiredOption("--task <task-id>", "task to invalidate")
    .requiredOption("--reason <text>", "operator reason")
    .action(
      action(
        async (
          options: IdentityOptions & {
            readonly task: string;
            readonly reason: string;
          }
        ) => {
          output(
            await (
              await createOperator(program, resource, options)
            ).invalidate(options.task, options.reason)
          );
        }
      )
    );

  addIdentityOptions(parent.command("reconcile"), resource)
    .option("--manifests <path>", "JSON array of canonical artifact manifests")
    .action(
      action(
        async (options: IdentityOptions & { readonly manifests?: string }) => {
          const operator = await createOperator(program, resource, options);
          const manifests = await manifestsInput(options.manifests);
          const repository = new ArtifactRepository({
            workspaceRoot: path.dirname(operator.unitRoot),
          });
          output(
            await operator.reconcile({
              artifactManifests: manifests,
              verifyArtifact: async (manifest) => {
                const verified = await repository.verify(manifest.ref);
                return (
                  verified.manifest.id === manifest.id &&
                  verified.manifest.checksumSha256 === manifest.checksumSha256
                );
              },
            })
          );
        }
      )
    );

  addIdentityOptions(parent.command("override"), resource)
    .requiredOption("--task <task-id>", "task receiving the override")
    .requiredOption("--actor <name>", "attributable operator")
    .requiredOption("--reason <text>", "operator reason")
    .requiredOption(
      "--scope <scope>",
      "readiness, quality, artifact-compatibility, or task-success"
    )
    .option("--output-manifests <ids>", "comma-separated manifest IDs")
    .action(
      action(
        async (
          options: IdentityOptions & {
            readonly task: string;
            readonly actor: string;
            readonly reason: string;
            readonly scope: OperatorOverride["scope"];
            readonly outputManifests?: string;
          }
        ) => {
          output(
            await (
              await createOperator(program, resource, options)
            ).override({
              taskId: options.task,
              actor: options.actor,
              reason: options.reason,
              scope: options.scope,
              ...(options.outputManifests
                ? {
                    outputManifestIds: options.outputManifests
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean),
                  }
                : {}),
            })
          );
        }
      )
    );
}

export function registerWorkflowCommands(program: Command): void {
  addArtifactCommands(program);
  addBatchCommands(program);
  const workflow = program
    .command("workflow")
    .description("Canonical additive workflow-engine operator commands");
  addResourceCommands(workflow, "episode");
  addResourceCommands(workflow, "history");
  addResourceCommands(workflow, "strategic-episode");
  addResourceCommands(workflow, "lesson");
  addResourceCommands(workflow, "fixture");
  const cache = program
    .command("cache")
    .description("Inspect, explain, and safely prune canonical task caches");
  const addCacheIdentityOptions = (command: Command): Command =>
    command
      .requiredOption("--resource <resource>", "episode, lesson, strategic-episode, or fixture")
      .option("--unit <id>", "generic workflow unit ID")
      .option("--episode <id>", "episode ID or slug")
      .option("--lesson <id>", "lesson ID or slug")
      .option("--unit-root <path>", "exact workflow unit root")
      .option("--locale <locale>", "workflow locale", "en")
      .option("--variant <variant>", "workflow variant", "full")
      .option("--artifacts <path>", "available artifact contracts JSON")
      .option("--json", "emit the stable JSON contract");

  addCacheIdentityOptions(cache.command("inspect"))
    .option("--task <task-id>", "inspect one registered task")
    .action(
      action(
        async (
          options: IdentityOptions & {
            readonly resource: string;
            readonly task?: string;
          }
        ) => {
          const resource = resourceSchema.parse(options.resource);
          output(
            await (
              await createOperator(program, resource, options)
            ).inspectCache(options.task)
          );
        }
      )
    );

  addCacheIdentityOptions(cache.command("explain-miss"))
    .requiredOption("--task <task-id>", "explain cache evidence for one task")
    .action(
      action(
        async (
          options: IdentityOptions & {
            readonly resource: string;
            readonly task: string;
          }
        ) => {
          const resource = resourceSchema.parse(options.resource);
          output(
            await (
              await createOperator(program, resource, options)
            ).explainCacheMiss(options.task)
          );
        }
      )
    );

  addCacheIdentityOptions(cache.command("prune"))
    .description(
      "plan safe pruning; canonical attempts are immutable and never removed"
    )
    .action(
      action(
        async (options: IdentityOptions & { readonly resource: string }) => {
          const resource = resourceSchema.parse(options.resource);
          output(
            await (
              await createOperator(program, resource, options)
            ).planCachePrune()
          );
        }
      )
    );
  workflow
    .command("validate")
    .description("Validate all registered profile DAGs")
    .action(
      action(async () => {
        const profiles = [
          profileRuntime("episode"),
          profileRuntime("lesson"),
          profileRuntime("strategic-episode"),
        ];
        output(
          profiles.map((profile) => ({
            resource: profile.resource,
            workflowId: profile.workflow.id,
            tasks: createTaskRegistry(profile.registrations).validateWorkflow(
              profile.workflow
            ).taskIds.length,
            valid: true,
          }))
        );
      })
    );

  const task = program
    .command("task")
    .description("Registered task inspection");
  task
    .command("list")
    .option("--profile <episode|lesson|strategic-episode>", "profile registry", "episode")
    .action(
      action(async (options: { readonly profile: string }) => {
        const runtime = profileRuntime(options.profile);
        output(
          createTaskRegistry(runtime.registrations).list(runtime.profileId)
        );
      })
    );
  task
    .command("explain")
    .argument("<task-id>")
    .option("--profile <episode|lesson|strategic-episode>", "profile registry", "episode")
    .action(
      action(async (taskId: string, options: { readonly profile: string }) => {
        const runtime = profileRuntime(options.profile);
        output(createTaskRegistry(runtime.registrations).explain(taskId));
      })
    );
  task
    .command("run")
    .requiredOption("--profile <episode|lesson|strategic-episode>", "profile registry")
    .requiredOption("--task <task-id>", "registered task ID")
    .option("--episode <id>", "episode ID or slug")
    .option("--lesson <id>", "lesson ID or slug")
    .option("--unit-root <path>", "exact workflow unit root")
    .option("--locale <locale>", "workflow locale", "en")
    .option("--variant <variant>", "workflow variant", "full")
    .option("--artifacts <path>", "available artifact contracts JSON")
    .option("--dry-run", "preview without writing")
    .action(
      action(
        async (
          options: IdentityOptions & {
            readonly profile: string;
            readonly task: string;
            readonly dryRun?: boolean;
          }
        ) => {
          const runtime = profileRuntime(options.profile);
          const dryRun =
            options.dryRun ??
            program.optsWithGlobals<GlobalOptions>().dryRun ??
            false;
          output(
            await (
              await createOperator(program, runtime.resource, options)
            ).runTask(options.task, {
              ...(dryRun ? { dryRun: true } : {}),
            })
          );
        }
      )
    );
}
