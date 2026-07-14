import { createDarkTruthTaskRegistrations } from "@mediaforge/dark-truth";
import { taskIdSchema } from "@mediaforge/domain";
import { createMathTaskRegistrations } from "@mediaforge/math-education";
import {
  ProductionTaskCallerAdapter,
  createTaskRegistry,
  type ProductionCallerMigrationRoute,
} from "@mediaforge/workflow-engine";
import type { Command } from "commander";

export const PRODUCTION_CALLER_MIGRATION_VERSION =
  "mediaforge.cli-production-callers.v1" as const;

const REMOVE_CONDITION =
  "the compatibility command is formally deprecated and its external callers are migrated";

const productionRoots = new Set([
  "audio",
  "clips",
  "episode",
  "images",
  "math",
  "metadata",
  "package",
  "render",
  "scenes",
  "shots",
  "stories",
  "stories:batches",
  "story-short-evaluate",
  "thumbnails",
  "transcript",
  "youtube",
]);

function route(
  caller: string,
  taskIdInput: string
): ProductionCallerMigrationRoute {
  return {
    caller: `mediaforge ${caller}`,
    taskId: taskIdSchema.parse(taskIdInput),
    compatibility: "legacy-cli",
    removeWhen: REMOVE_CONDITION,
  };
}

function normalizeCaller(callerInput: string): string {
  return callerInput.trim().replace(/^mediaforge\s+/u, "");
}

/** Maps public compatibility commands to the one registered application task. */
export function resolveProductionCallerRoute(
  callerInput: string
): ProductionCallerMigrationRoute | undefined {
  const caller = normalizeCaller(callerInput);

  if (caller === "story-short-evaluate")
    return route(caller, "darktruth.quality-shorts");
  if (caller.startsWith("transcript "))
    return route(caller, "darktruth.concept-select");
  if (caller.startsWith("scenes ") || caller.startsWith("shots "))
    return route(caller, "darktruth.shot-plan");
  if (caller.startsWith("audio "))
    return route(
      caller,
      /benchmark|generate|synthesize|run/u.test(caller)
        ? "darktruth.audio-generate"
        : "darktruth.audio-validate"
    );
  if (caller.startsWith("clips ")) return route(caller, "darktruth.render");

  if (caller.startsWith("images ")) {
    if (
      /generate-character|regenerate-character|bootstrap|sync-shared/u.test(
        caller
      )
    )
      return route(caller, "darktruth.reference-prepare");
    if (/approve-character/u.test(caller))
      return route(caller, "darktruth.reference-approval");
    if (/plan|workbook/u.test(caller))
      return route(caller, "darktruth.reference-plan");
    if (/validate|status|missing|reject/u.test(caller))
      return route(caller, "darktruth.quality-visual-continuity");
    return route(caller, "darktruth.scene-images");
  }

  if (caller === "render" || caller.startsWith("render "))
    return route(caller, "darktruth.render");
  if (caller.startsWith("metadata "))
    return route(caller, "darktruth.metadata");
  if (caller === "package")
    return route(caller, "darktruth.quality-audiovisual");
  if (caller.startsWith("youtube upload"))
    return route(caller, "darktruth.publish");
  if (caller.startsWith("thumbnails "))
    return route(
      caller,
      /validate|status/u.test(caller)
        ? "darktruth.thumbnail-validate"
        : "darktruth.thumbnail-generate"
    );

  if (caller.startsWith("episode ")) {
    if (/\benglish\b/u.test(caller))
      return route(caller, "darktruth.rewrite-full");
    if (/\blocalized\b/u.test(caller))
      return route(caller, "darktruth.localize");
    if (/\bshort\b/u.test(caller))
      return route(caller, "darktruth.shorts-derive");
    if (/\banalyze\b/u.test(caller))
      return route(caller, "darktruth.quality-structure");
    if (/\bplan\b/u.test(caller)) return route(caller, "darktruth.shot-plan");
    if (/bootstrap-characters|sync-characters/u.test(caller))
      return route(caller, "darktruth.reference-prepare");
    if (/resume-images|migrate-layout/u.test(caller))
      return route(caller, "darktruth.scene-images");
    if (/\breview\b/u.test(caller))
      return route(caller, "darktruth.story-approval");
    return route(caller, "darktruth.quality-audiovisual");
  }

  if (caller.startsWith("stories ") || caller.startsWith("stories:batches ")) {
    if (/rewrite-full/u.test(caller))
      return route(caller, "darktruth.rewrite-full");
    if (/rewrite-short/u.test(caller))
      return route(caller, "darktruth.shorts-derive");
    if (/\blocalize\b|\bbatch\b|stories:batches/u.test(caller))
      return route(caller, "darktruth.localize");
    if (/\banaly|inspect|status/u.test(caller))
      return route(caller, "darktruth.quality-structure");
    if (/\baudio\b/u.test(caller))
      return route(caller, "darktruth.audio-generate");
    if (/\bimages\b/u.test(caller))
      return route(caller, "darktruth.scene-images");
    if (/\brender\b/u.test(caller)) return route(caller, "darktruth.render");
    if (/\brepair\b/u.test(caller))
      return route(caller, "darktruth.quality-structure");
    if (/\bpipeline\b|\bproduction\b/u.test(caller))
      return route(caller, "darktruth.story-outline");
    return route(caller, "darktruth.localize");
  }

  if (caller.startsWith("math ")) {
    if (/curriculum import/u.test(caller))
      return route(caller, "math.curriculum-import");
    if (/curriculum graph/u.test(caller))
      return route(caller, "math.prerequisite-graph");
    if (/curriculum/u.test(caller))
      return route(caller, "math.source-validation");
    if (/lesson|production plan|production generate/u.test(caller))
      return route(caller, "math.lesson-spec");
    if (/speech generate/u.test(caller)) return route(caller, "math.tts");
    if (/speech compare/u.test(caller))
      return route(caller, "math.quality-gate");
    if (/production batch/u.test(caller))
      return route(caller, "math.canonical-narration");
    if (/production (process|verify)/u.test(caller))
      return route(caller, "math.math-verification");
    if (/quality/u.test(caller)) return route(caller, "math.quality-gate");
    if (/metadata/u.test(caller))
      return route(caller, "math.metadata-playlists");
    if (/publish/u.test(caller)) return route(caller, "math.publish-dry-run");
    return route(caller, "math.quality-gate");
  }

  return undefined;
}

const migratedAction = Symbol("mediaforge.production-caller-migration");

interface ActionCommand extends Command {
  _actionHandler?: (...args: unknown[]) => unknown;
  [migratedAction]?: ProductionCallerMigrationRoute;
}

function commandPath(command: Command): string {
  const names: string[] = [];
  let cursor: Command | null = command;
  while (cursor?.parent) {
    names.unshift(cursor.name());
    cursor = cursor.parent;
  }
  return names.join(" ");
}

function allCommands(program: Command): Command[] {
  return program.commands.flatMap((command) => [
    command,
    ...allCommands(command),
  ]);
}

export interface ProductionCallerMigrationSummary {
  readonly migrationVersion: typeof PRODUCTION_CALLER_MIGRATION_VERSION;
  readonly routes: readonly ProductionCallerMigrationRoute[];
  readonly unmappedProductionCallers: readonly string[];
}

/**
 * Wraps already-registered Commander actions once, allowing every public
 * compatibility surface to preserve its exact parser/output behavior.
 */
export function migrateProductionCommandCallers(
  program: Command
): ProductionCallerMigrationSummary {
  const registry = createTaskRegistry([
    ...createDarkTruthTaskRegistrations(),
    ...createMathTaskRegistrations(),
  ]);
  const adapter = new ProductionTaskCallerAdapter(registry);
  const routes: ProductionCallerMigrationRoute[] = [];
  const unmappedProductionCallers: string[] = [];

  for (const command of allCommands(program)) {
    const actionCommand = command as ActionCommand;
    const originalAction = actionCommand._actionHandler;
    if (!originalAction || actionCommand[migratedAction]) continue;
    const caller = commandPath(command);
    const route = resolveProductionCallerRoute(caller);
    if (!route) {
      const root = caller.split(" ")[0];
      if (root && productionRoots.has(root)) {
        unmappedProductionCallers.push(caller);
      }
      continue;
    }
    adapter.definition(route.taskId);
    actionCommand[migratedAction] = route;
    const argumentCount = command.registeredArguments.length;
    command.action(async (...args: unknown[]) => {
      await adapter.invoke(route, () =>
        originalAction(args.slice(0, argumentCount))
      );
    });
    routes.push(route);
  }

  if (unmappedProductionCallers.length > 0) {
    throw new Error(
      `Production callers lack canonical task routes: ${unmappedProductionCallers.join(", ")}`
    );
  }
  return {
    migrationVersion: PRODUCTION_CALLER_MIGRATION_VERSION,
    routes: routes.sort((left, right) =>
      left.caller.localeCompare(right.caller)
    ),
    unmappedProductionCallers,
  };
}
