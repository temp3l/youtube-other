import {
  creatorProfileSchema,
  effectiveContentPolicySchema,
  genreDefinitionSchema,
  type CreatorProfile,
  type EffectiveContentPolicy,
  type GenreDefinition,
} from "@mediaforge/domain";
import { z } from "zod";

const localeSchema = z.enum(["en", "de", "es", "fr", "pt", "it"]);
const tierSchema = z.enum(["public", "lead-generation", "premium", "private"]);
const gateSchema = z.enum(["source", "canonical-script", "localization", "voice", "final-render", "publish"]);
const unique = <T extends z.ZodType<string>>(item: T) => z.array(item).min(1).refine(
  (values) => new Set(values).size === values.length,
  "Values must be unique."
);

/** The permission-shaped parts of a policy. Each layer can only reduce these values. */
export const contentPolicyPermissionsSchema = z.strictObject({
  supportedLocales: unique(localeSchema),
  permittedContentTiers: unique(tierSchema),
  requiredApprovalGates: unique(gateSchema),
  autoPublish: z.literal(false),
  syntheticNarrationEnabled: z.literal(false),
  generatedLikenessEnabled: z.literal(false),
});
export type ContentPolicyPermissions = z.infer<typeof contentPolicyPermissionsSchema>;

/**
 * A grant is intentionally not an override. A later rights/approval task must
 * evaluate it; the registry never widens an effective policy from this value.
 */
export const explicitContentPermissionGrantSchema = z.strictObject({
  grantId: z.string().trim().min(1),
  issuerId: z.string().trim().min(1),
  scope: z.enum(["rights", "voice", "likeness", "publishing"]),
  evidenceReference: z.string().trim().min(1),
});
export type ExplicitContentPermissionGrant = z.infer<typeof explicitContentPermissionGrantSchema>;

function registry<T extends { id: string }>(
  values: readonly unknown[],
  schema: z.ZodType<T>,
  name: string,
): ReadonlyMap<string, T> {
  const entries = new Map<string, T>();
  for (const raw of values) {
    const value = schema.parse(raw);
    if (entries.has(value.id)) throw new Error(`Duplicate ${name} id: ${value.id}`);
    entries.set(value.id, value);
  }
  return entries;
}

export class GenreRegistry {
  readonly #entries: ReadonlyMap<string, GenreDefinition>;
  constructor(values: readonly unknown[]) { this.#entries = registry(values, genreDefinitionSchema, "genre"); }
  get(id: string): GenreDefinition {
    const value = this.#entries.get(id);
    if (!value) throw new Error(`Unknown genre id: ${id}`);
    return value;
  }
  list(): readonly GenreDefinition[] { return [...this.#entries.values()]; }
}

export class CreatorProfileRegistry {
  readonly #entries: ReadonlyMap<string, CreatorProfile>;
  constructor(values: readonly unknown[]) { this.#entries = registry(values, creatorProfileSchema, "creator profile"); }
  get(id: string): CreatorProfile {
    const value = this.#entries.get(id);
    if (!value) throw new Error(`Unknown creator profile id: ${id}`);
    return value;
  }
  list(genreId?: string): readonly CreatorProfile[] {
    return [...this.#entries.values()].filter((profile) => !genreId || profile.genreId === genreId);
  }
}

export interface ResolveEffectiveContentPolicyInput {
  readonly genre: GenreDefinition;
  readonly creatorProfile: CreatorProfile;
  readonly system: ContentPolicyPermissions;
  readonly genrePermissions: ContentPolicyPermissions;
  readonly creatorPermissions: ContentPolicyPermissions;
  /** Episode policy is deliberately partial and is intersected, never overlaid. */
  readonly episodeOverride?: Partial<ContentPolicyPermissions>;
  /** Kept distinct from overrides so grants cannot silently widen policy. */
  readonly explicitGrants?: readonly ExplicitContentPermissionGrant[];
}

function intersect<T extends string>(base: readonly T[], next: readonly T[]): T[] {
  const allowed = new Set(next);
  return base.filter((value) => allowed.has(value));
}

function requiredIntersection<T extends string>(field: string, values: readonly (readonly T[])[]): T[] {
  let result: T[] = [...(values[0] ?? [])];
  for (const next of values.slice(1)) result = intersect(result, next);
  if (result.length === 0) throw new Error(`Permission intersection leaves no ${field}.`);
  return result;
}

function requiredUnion<T extends string>(values: readonly (readonly T[])[]): T[] {
  return [...new Set(values.flat())];
}

export function resolveEffectiveContentPolicy(input: ResolveEffectiveContentPolicyInput): EffectiveContentPolicy {
  const genre = genreDefinitionSchema.parse(input.genre);
  const creator = creatorProfileSchema.parse(input.creatorProfile);
  if (creator.genreId !== genre.id) {
    throw new Error(`Creator profile ${creator.id} does not belong to genre ${genre.id}.`);
  }
  const system = contentPolicyPermissionsSchema.parse(input.system);
  const genrePermissions = contentPolicyPermissionsSchema.parse(input.genrePermissions);
  const creatorPermissions = contentPolicyPermissionsSchema.parse(input.creatorPermissions);
  const episode = input.episodeOverride
    ? contentPolicyPermissionsSchema.partial().parse(input.episodeOverride)
    : {};
  for (const grant of input.explicitGrants ?? []) explicitContentPermissionGrantSchema.parse(grant);

  const supportedLocales = requiredIntersection("supportedLocales", [
    system.supportedLocales,
    genrePermissions.supportedLocales,
    creatorPermissions.supportedLocales,
    ...(episode.supportedLocales ? [episode.supportedLocales] : []),
  ]);
  if (!supportedLocales.includes(creator.canonicalLocale)) {
    throw new Error("Permission intersection excludes the creator canonical locale.");
  }
  return effectiveContentPolicySchema.parse({
    schemaVersion: "1.1",
    genreId: genre.id,
    creatorProfileId: creator.id,
    canonicalLocale: creator.canonicalLocale,
    supportedLocales,
    permittedContentTiers: requiredIntersection("permittedContentTiers", [
      system.permittedContentTiers,
      genrePermissions.permittedContentTiers,
      creatorPermissions.permittedContentTiers,
      ...(episode.permittedContentTiers ? [episode.permittedContentTiers] : []),
    ]),
    // Gates are obligations, not permissions: a narrower episode may add one,
    // but can never remove a system, genre, or creator safety gate.
    requiredApprovalGates: requiredUnion([
      system.requiredApprovalGates,
      genrePermissions.requiredApprovalGates,
      creatorPermissions.requiredApprovalGates,
      ...(episode.requiredApprovalGates ? [episode.requiredApprovalGates] : []),
    ]),
    autoPublish: false,
    syntheticNarrationEnabled: false,
    generatedLikenessEnabled: false,
  });
}
