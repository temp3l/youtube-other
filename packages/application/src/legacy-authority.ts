export const aggregateAuthorities = [
  "filesystem-legacy",
  "database-v1",
] as const;

export type AggregateAuthority = (typeof aggregateAuthorities)[number];

export interface NewInstanceAuthorityPolicy {
  readonly authority: AggregateAuthority;
  readonly rollbackWindowActive: boolean;
}

/**
 * New instances are database-owned unless the explicitly time-bounded
 * compatibility switch is enabled. Existing filesystem instances remain
 * filesystem-owned until a verified migration changes their authority.
 */
export function resolveNewInstanceAuthority(input: {
  readonly rollbackToFilesystem?: boolean;
  readonly rollbackWindowActive: boolean;
}): NewInstanceAuthorityPolicy {
  if (input.rollbackToFilesystem && !input.rollbackWindowActive) {
    throw new Error(
      "The filesystem authority rollback switch is no longer available."
    );
  }
  return {
    authority: input.rollbackToFilesystem
      ? "filesystem-legacy"
      : "database-v1",
    rollbackWindowActive: input.rollbackWindowActive,
  };
}
