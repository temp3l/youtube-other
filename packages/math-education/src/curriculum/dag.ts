import { z } from "zod";
import { skillIdSchema, type CurriculumSkill } from "../domain/index.js";

export const prerequisiteEdgeSchema = z.strictObject({
  from: skillIdSchema,
  to: skillIdSchema,
  kind: z.enum(["required", "recommended"]),
  rationale: z.string().min(1),
  provenance: z.string().min(1),
  reviewStatus: z.literal("reviewed"),
  futureGradeApproval: z.string().min(1).optional(),
});
export type PrerequisiteEdge = z.infer<typeof prerequisiteEdgeSchema>;

export const prerequisitesFileSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    reviewStatus: z.enum(["reviewed", "explicitly-incomplete"]),
    incompleteReason: z.string().min(1).optional(),
    disconnectedPolicy: z.strictObject({
      status: z.literal("reviewed"),
      reason: z.string().min(1),
    }),
    edges: z.array(prerequisiteEdgeSchema).min(1),
  })
  .superRefine((file, context) => {
    if (file.reviewStatus === "explicitly-incomplete" && !file.incompleteReason)
      context.addIssue({
        code: "custom",
        path: ["incompleteReason"],
        message: "Incomplete prerequisite files require a reason.",
      });
  });

export interface PrerequisiteDagDiagnostics {
  order: string[];
  disconnectedSkillIds: string[];
}

function findCyclePath(
  ids: readonly string[],
  successors: ReadonlyMap<string, readonly string[]>
): string[] | undefined {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const visit = (id: string): string[] | undefined => {
    visiting.add(id);
    stack.push(id);
    for (const next of successors.get(id) ?? []) {
      if (visiting.has(next)) {
        const start = stack.indexOf(next);
        return [...stack.slice(start), next];
      }
      if (!visited.has(next)) {
        const cycle = visit(next);
        if (cycle) return cycle;
      }
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
    return undefined;
  };

  for (const id of ids) {
    if (visited.has(id)) continue;
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return undefined;
}

export function analyzePrerequisiteDag(
  skills: readonly CurriculumSkill[],
  rawEdges: readonly unknown[]
): PrerequisiteDagDiagnostics {
  const edges = rawEdges.map((edge) => prerequisiteEdgeSchema.parse(edge));
  const byId = new Map(skills.map((skill) => [skill.skillId, skill]));
  const pairs = new Set<string>();
  const successors = new Map<string, string[]>();
  const connected = new Set<string>();
  const indegree = new Map(skills.map((skill) => [skill.skillId, 0]));
  for (const edge of edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to)
      throw new Error(`Unknown prerequisite edge: ${edge.from} -> ${edge.to}`);
    if (edge.from === edge.to)
      throw new Error(`Self prerequisite: ${edge.from}`);
    const pair = `${edge.from}:${edge.to}`;
    if (pairs.has(pair)) throw new Error(`Parallel prerequisite edge: ${pair}`);
    pairs.add(pair);
    connected.add(edge.from);
    connected.add(edge.to);
    if (from.canonicalGrade > to.canonicalGrade && !edge.futureGradeApproval) {
      throw new Error(
        `Future-grade prerequisite requires approval: ${edge.from} -> ${edge.to}`
      );
    }
    if (edge.kind === "required") {
      successors.set(edge.from, [
        ...(successors.get(edge.from) ?? []),
        edge.to,
      ]);
      indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    }
  }
  const compare = (a: string, b: string) => {
    const left = byId.get(a);
    const right = byId.get(b);
    if (!left || !right) return a.localeCompare(b);
    return (
      left.canonicalGrade - right.canonicalGrade ||
      left.seedOrder - right.seedOrder ||
      a.localeCompare(b)
    );
  };
  for (const values of successors.values()) values.sort(compare);
  const cycle = findCyclePath([...byId.keys()].sort(compare), successors);
  if (cycle) throw new Error(`Prerequisite graph cycle: ${cycle.join(" -> ")}`);
  const queue = [...indegree]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id)
    .sort(compare);
  const ordered: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) break;
    ordered.push(id);
    for (const next of successors.get(id) ?? []) {
      const degree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, degree);
      if (degree === 0) {
        queue.push(next);
        queue.sort(compare);
      }
    }
  }
  if (ordered.length !== skills.length)
    throw new Error("Prerequisite graph contains an unresolved cycle.");
  return {
    order: ordered,
    disconnectedSkillIds: [...byId.keys()]
      .filter((id) => !connected.has(id))
      .sort(compare),
  };
}

export function validatePrerequisiteDag(
  skills: readonly CurriculumSkill[],
  rawEdges: readonly unknown[]
): string[] {
  return analyzePrerequisiteDag(skills, rawEdges).order;
}
