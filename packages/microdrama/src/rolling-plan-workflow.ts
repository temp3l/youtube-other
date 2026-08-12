export const MICRODRAMA_PLANNING_WORKFLOW_VERSION =
  "mediaforge.microdrama.planning-workflow.v1" as const;

export const MICRODRAMA_PLANNING_TASK_IDS = [
  "microdrama.planning.anchor-snapshot",
  "microdrama.planning.validate-constraints",
  "microdrama.planning.compile-macro",
  "microdrama.planning.compile-arc",
  "microdrama.planning.compile-near-horizon",
  "microdrama.planning.compile-current-episode",
] as const;

export type MicrodramaPlanningTaskId = (typeof MICRODRAMA_PLANNING_TASK_IDS)[number];

export type MicrodramaPlanningWorkflowTask = {
  readonly id: MicrodramaPlanningTaskId;
  readonly displayName: string;
  readonly dependsOn: readonly MicrodramaPlanningTaskId[];
  readonly providerFree: true;
};

export const MICRODRAMA_PLANNING_WORKFLOW_TASKS: readonly MicrodramaPlanningWorkflowTask[] =
  [
    {
      id: "microdrama.planning.anchor-snapshot",
      displayName: "Anchor rolling plan to accepted snapshot",
      dependsOn: [],
      providerFree: true,
    },
    {
      id: "microdrama.planning.validate-constraints",
      displayName: "Validate promise, reveal and season constraints",
      dependsOn: ["microdrama.planning.anchor-snapshot"],
      providerFree: true,
    },
    {
      id: "microdrama.planning.compile-macro",
      displayName: "Compile season macro planning horizon",
      dependsOn: ["microdrama.planning.validate-constraints"],
      providerFree: true,
    },
    {
      id: "microdrama.planning.compile-arc",
      displayName: "Compile bounded story-arc planning horizon",
      dependsOn: ["microdrama.planning.validate-constraints"],
      providerFree: true,
    },
    {
      id: "microdrama.planning.compile-near-horizon",
      displayName: "Compile near-horizon episode intentions",
      dependsOn: ["microdrama.planning.validate-constraints"],
      providerFree: true,
    },
    {
      id: "microdrama.planning.compile-current-episode",
      displayName: "Compile current production episode plan",
      dependsOn: ["microdrama.planning.validate-constraints"],
      providerFree: true,
    },
  ] as const;

export function topologicalSortMicrodramaPlanningTasks(
  taskIds: readonly MicrodramaPlanningTaskId[]
): MicrodramaPlanningTaskId[] {
  const selected = new Set(taskIds);
  const byId = new Map(
    MICRODRAMA_PLANNING_WORKFLOW_TASKS.map((task) => [task.id, task])
  );
  const visiting = new Set<MicrodramaPlanningTaskId>();
  const visited = new Set<MicrodramaPlanningTaskId>();
  const ordered: MicrodramaPlanningTaskId[] = [];

  function visit(taskId: MicrodramaPlanningTaskId): void {
    if (!selected.has(taskId) || visited.has(taskId)) {
      return;
    }
    if (visiting.has(taskId)) {
      throw new Error(`Planning workflow cycle detected at ${taskId}.`);
    }
    visiting.add(taskId);
    const task = byId.get(taskId);
    if (!task) {
      throw new Error(`Unknown planning task ${taskId}.`);
    }
    for (const dependency of task.dependsOn) {
      if (selected.has(dependency)) {
        visit(dependency);
      }
    }
    visiting.delete(taskId);
    visited.add(taskId);
    ordered.push(taskId);
  }

  for (const taskId of taskIds) {
    visit(taskId);
  }
  return ordered;
}

export function planningTaskForHorizon(
  horizon: "season_macro" | "story_arc" | "near_horizon" | "current_episode"
): MicrodramaPlanningTaskId {
  switch (horizon) {
    case "season_macro":
      return "microdrama.planning.compile-macro";
    case "story_arc":
      return "microdrama.planning.compile-arc";
    case "near_horizon":
      return "microdrama.planning.compile-near-horizon";
    case "current_episode":
      return "microdrama.planning.compile-current-episode";
  }
}
