import type { ZodType } from "zod";

import { computePayloadHash } from "./common.js";
import type {
  CharacterStatePayload,
  KnowledgeClaimPayload,
  NarrativePromisePayload,
  NarrativeSecretPayload,
  NarrativeSnapshotPayload,
  RelationshipStatePayload,
} from "./entities.js";
import {
  characterPayloadSchema,
  characterRevisionSchema,
  characterStatePayloadSchema,
  characterStateRevisionSchema,
  knowledgeClaimPayloadSchema,
  knowledgeClaimRevisionSchema,
  narrativePromisePayloadSchema,
  narrativePromiseRevisionSchema,
  narrativeSecretPayloadSchema,
  narrativeSecretRevisionSchema,
  narrativeSnapshotPayloadSchema,
  narrativeSnapshotRevisionSchema,
  relationshipStatePayloadSchema,
  relationshipStateRevisionSchema,
  seriesBiblePayloadSchema,
  seriesBibleRevisionSchema,
} from "./entities.js";
import type { CharacterId } from "./ids.js";
import type { NarrativeRevisionEnvelope } from "./revision.js";
import { narrativeRevisionEnvelopeSchema } from "./revision.js";
import { assertRevisionStatusTransition } from "./transitions.js";

export type ValidationIssueCode =
  | "schema_invalid"
  | "content_hash_mismatch"
  | "invalid_revision_transition"
  | "duplicate_identifier"
  | "missing_character_reference"
  | "revealed_secret_without_resolution";

export type ValidationIssue = {
  code: ValidationIssueCode;
  message: string;
  path?: string;
};

export type ValidationResult =
  | { ok: true }
  | { ok: false; issues: ValidationIssue[] };

function fail(issues: ValidationIssue[]): ValidationResult {
  return { ok: false, issues };
}

function parseWithSchema<T>(
  schema: ZodType<T>,
  value: unknown,
  label: string
): ValidationResult & { value?: T } {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return fail([
      {
        code: "schema_invalid",
        message: `${label} schema validation failed: ${parsed.error.message}`,
      },
    ]);
  }
  return { ok: true, value: parsed.data };
}

export function validateContentHash(
  envelope: Pick<NarrativeRevisionEnvelope, "payload" | "contentHash">
): ValidationResult {
  const expected = computePayloadHash(envelope.payload);
  if (expected !== envelope.contentHash) {
    return fail([
      {
        code: "content_hash_mismatch",
        message: `Content hash mismatch: expected ${expected}, received ${envelope.contentHash}`,
      },
    ]);
  }
  return { ok: true };
}

export function validateRevisionEnvelope(
  value: unknown
): ValidationResult & { envelope?: NarrativeRevisionEnvelope } {
  const parsed = parseWithSchema(narrativeRevisionEnvelopeSchema, value, "Revision");
  if (!parsed.ok) {
    return parsed;
  }
  const hashResult = validateContentHash(parsed.value!);
  if (!hashResult.ok) {
    return hashResult;
  }
  return { ok: true, envelope: parsed.value! };
}

export function validateRevisionStatusTransition(
  from: NarrativeRevisionEnvelope["status"],
  to: NarrativeRevisionEnvelope["status"]
): ValidationResult {
  try {
    assertRevisionStatusTransition(from, to);
    return { ok: true };
  } catch (error) {
    return fail([
      {
        code: "invalid_revision_transition",
        message: error instanceof Error ? error.message : String(error),
      },
    ]);
  }
}

function uniqueIds<T extends string>(
  values: readonly T[],
  path: string
): ValidationIssue[] {
  const seen = new Set<T>();
  const issues: ValidationIssue[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      issues.push({
        code: "duplicate_identifier",
        message: `Duplicate identifier: ${value}`,
        path,
      });
    }
    seen.add(value);
  }
  return issues;
}

function characterIdSet(
  characterStates: readonly CharacterStatePayload[]
): Set<CharacterId> {
  return new Set(characterStates.map((state) => state.characterId));
}

export function validateNarrativeSnapshotPayload(
  payload: NarrativeSnapshotPayload
): ValidationResult {
  const parsed = parseWithSchema(
    narrativeSnapshotPayloadSchema,
    payload,
    "NarrativeSnapshot"
  );
  if (!parsed.ok) {
    return parsed;
  }

  const snapshot = parsed.value!;
  const issues: ValidationIssue[] = [];

  issues.push(
    ...uniqueIds(
      snapshot.characterStates.map((state) => state.characterId),
      "characterStates"
    )
  );
  issues.push(
    ...uniqueIds(snapshot.secrets.map((secret) => secret.secretId), "secrets")
  );
  issues.push(
    ...uniqueIds(
      snapshot.knowledgeClaims.map((claim) => claim.claimId),
      "knowledgeClaims"
    )
  );
  issues.push(
    ...uniqueIds(
      snapshot.promises.map((promise) => promise.promiseId),
      "promises"
    )
  );

  const knownCharacters = characterIdSet(snapshot.characterStates);

  for (const relationship of snapshot.relationshipStates) {
    if (!knownCharacters.has(relationship.fromCharacterId)) {
      issues.push({
        code: "missing_character_reference",
        message: `Unknown fromCharacterId: ${relationship.fromCharacterId}`,
        path: "relationshipStates",
      });
    }
    if (!knownCharacters.has(relationship.toCharacterId)) {
      issues.push({
        code: "missing_character_reference",
        message: `Unknown toCharacterId: ${relationship.toCharacterId}`,
        path: "relationshipStates",
      });
    }
  }

  for (const secret of snapshot.secrets) {
    for (const holderId of secret.holderCharacterIds) {
      if (!knownCharacters.has(holderId)) {
        issues.push({
          code: "missing_character_reference",
          message: `Secret holder references unknown character: ${holderId}`,
          path: `secrets.${secret.secretId}`,
        });
      }
    }
    for (const affectedId of secret.affectedCharacterIds) {
      if (!knownCharacters.has(affectedId)) {
        issues.push({
          code: "missing_character_reference",
          message: `Secret affected character references unknown character: ${affectedId}`,
          path: `secrets.${secret.secretId}`,
        });
      }
    }
    if (
      secret.revealStatus === "revealed" &&
      secret.revealProvenanceRevisionIds.length === 0
    ) {
      issues.push({
        code: "revealed_secret_without_resolution",
        message: `Revealed secret ${secret.secretId} requires reveal provenance revisions`,
        path: `secrets.${secret.secretId}`,
      });
    }
  }

  for (const promise of snapshot.promises) {
    if (promise.status === "resolved" && !promise.resolution) {
      issues.push({
        code: "schema_invalid",
        message: `Resolved promise ${promise.promiseId} requires resolution text`,
        path: `promises.${promise.promiseId}`,
      });
    }
  }

  if (issues.length > 0) {
    return fail(issues);
  }
  return { ok: true };
}

export function parseSeriesBibleRevision(value: unknown) {
  return seriesBibleRevisionSchema.safeParse(value);
}

export function parseCharacterRevision(value: unknown) {
  return characterRevisionSchema.safeParse(value);
}

export function parseCharacterStateRevision(value: unknown) {
  return characterStateRevisionSchema.safeParse(value);
}

export function parseRelationshipStateRevision(value: unknown) {
  return relationshipStateRevisionSchema.safeParse(value);
}

export function parseNarrativeSecretRevision(value: unknown) {
  return narrativeSecretRevisionSchema.safeParse(value);
}

export function parseKnowledgeClaimRevision(value: unknown) {
  return knowledgeClaimRevisionSchema.safeParse(value);
}

export function parseNarrativePromiseRevision(value: unknown) {
  return narrativePromiseRevisionSchema.safeParse(value);
}

export function parseNarrativeSnapshotRevision(value: unknown) {
  return narrativeSnapshotRevisionSchema.safeParse(value);
}

export function parseSeriesBiblePayload(value: unknown) {
  return seriesBiblePayloadSchema.safeParse(value);
}

export function parseCharacterPayload(value: unknown) {
  return characterPayloadSchema.safeParse(value);
}

export function parseCharacterStatePayload(value: unknown) {
  return characterStatePayloadSchema.safeParse(value);
}

export function parseRelationshipStatePayload(value: unknown) {
  return relationshipStatePayloadSchema.safeParse(value);
}

export function parseNarrativeSecretPayload(value: unknown) {
  return narrativeSecretPayloadSchema.safeParse(value);
}

export function parseKnowledgeClaimPayload(value: unknown) {
  return knowledgeClaimPayloadSchema.safeParse(value);
}

export function parseNarrativePromisePayload(value: unknown) {
  return narrativePromisePayloadSchema.safeParse(value);
}

export function parseNarrativeSnapshotPayload(value: unknown) {
  return narrativeSnapshotPayloadSchema.safeParse(value);
}

// Export payload types used only in validators for external tests
export type {
  CharacterStatePayload,
  KnowledgeClaimPayload,
  NarrativePromisePayload,
  NarrativeSecretPayload,
  RelationshipStatePayload,
};
