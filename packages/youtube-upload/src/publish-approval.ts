import crypto from "node:crypto";

import { hashFile } from "@mediaforge/shared";
import { z } from "zod";

export const PUBLISH_APPROVAL_SCHEMA_VERSION =
  "mediaforge.publish-approval.v1" as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

const publishArtifactBindingSchema = z
  .object({
    kind: z.string().min(1),
    revision: z.string().min(1),
    path: z.string().min(1),
    sha256: sha256Schema,
  })
  .strict();

export const publishDryRunEvidenceSchema = z
  .object({
    schemaVersion: z.literal(PUBLISH_APPROVAL_SCHEMA_VERSION),
    id: z.string().regex(/^publish-plan-[a-f0-9]{24}$/u),
    identity: z
      .object({
        contentId: z.string().min(1),
        locale: z.string().min(1),
        variant: z.string().min(1),
      })
      .strict(),
    target: z
      .object({
        channelId: z.string().min(1),
        accountId: z.string().min(1),
      })
      .strict(),
    artifacts: z.array(publishArtifactBindingSchema).min(1),
    metadata: z
      .object({
        revision: z.string().min(1),
        path: z.string().min(1),
        sha256: sha256Schema,
      })
      .strict(),
    requestHash: sha256Schema,
  })
  .strict()
  .superRefine((value, context) => {
    const kinds = value.artifacts.map((artifact) => artifact.kind);
    const paths = value.artifacts.map((artifact) => artifact.path);
    if (new Set(kinds).size !== kinds.length) {
      context.addIssue({
        code: "custom",
        path: ["artifacts"],
        message: "Publish artifact kinds must be unique.",
      });
    }
    if (new Set(paths).size !== paths.length) {
      context.addIssue({
        code: "custom",
        path: ["artifacts"],
        message: "Publish artifact paths must be unique.",
      });
    }
  });
export type PublishDryRunEvidence = z.infer<typeof publishDryRunEvidenceSchema>;

export const publishApprovalSchema = z
  .object({
    schemaVersion: z.literal(PUBLISH_APPROVAL_SCHEMA_VERSION),
    id: z.string().regex(/^publish-approval-[a-f0-9]{24}$/u),
    actor: z.string().trim().min(1),
    approvedAt: z.iso.datetime({ offset: true }),
    evidenceHash: sha256Schema,
    evidence: publishDryRunEvidenceSchema,
  })
  .strict();
export type PublishApproval = z.infer<typeof publishApprovalSchema>;

export interface PublishDryRunInput {
  readonly identity: {
    readonly contentId: string;
    readonly locale: string;
    readonly variant: string;
  };
  readonly target: {
    readonly channelId: string;
    readonly accountId: string;
  };
  readonly artifacts: readonly {
    readonly kind: string;
    readonly revision: string;
    readonly path: string;
  }[];
  readonly metadata: {
    readonly revision: string;
    readonly path: string;
  };
  readonly request: unknown;
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Publish evidence cannot contain a non-finite number.");
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("Publish evidence contains an unsupported value.");
}

function hashObject(value: unknown): string {
  return crypto.createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function evidenceHash(evidence: PublishDryRunEvidence): string {
  return hashObject(evidence);
}

export async function createPublishDryRunEvidence(
  input: PublishDryRunInput
): Promise<PublishDryRunEvidence> {
  const artifacts = await Promise.all(
    [...input.artifacts]
      .sort((left, right) =>
        `${left.kind}\u0000${left.path}`.localeCompare(
          `${right.kind}\u0000${right.path}`
        )
      )
      .map(async (artifact) => ({
        ...artifact,
        sha256: await hashFile(artifact.path),
      }))
  );
  const metadata = {
    ...input.metadata,
    sha256: await hashFile(input.metadata.path),
  };
  const base = {
    schemaVersion: PUBLISH_APPROVAL_SCHEMA_VERSION,
    identity: input.identity,
    target: input.target,
    artifacts,
    metadata,
    requestHash: hashObject(input.request),
  } as const;
  return publishDryRunEvidenceSchema.parse({
    ...base,
    id: `publish-plan-${hashObject(base).slice(0, 24)}`,
  });
}

export function approvePublishDryRun(args: {
  readonly evidence: PublishDryRunEvidence;
  readonly actor: string;
  readonly approvedAt: string;
}): PublishApproval {
  const evidence = publishDryRunEvidenceSchema.parse(args.evidence);
  const bindingHash = evidenceHash(evidence);
  const base = {
    schemaVersion: PUBLISH_APPROVAL_SCHEMA_VERSION,
    actor: args.actor,
    approvedAt: args.approvedAt,
    evidenceHash: bindingHash,
    evidence,
  } as const;
  return publishApprovalSchema.parse({
    ...base,
    id: `publish-approval-${hashObject(base).slice(0, 24)}`,
  });
}

export class PublishApprovalError extends Error {
  public readonly code = "PUBLISH_APPROVAL_INVALID" as const;

  public constructor(message: string) {
    super(message);
    this.name = "PublishApprovalError";
  }
}

export function assertCurrentPublishApproval(args: {
  readonly evidence: PublishDryRunEvidence;
  readonly approval: unknown;
}): PublishApproval {
  const evidence = publishDryRunEvidenceSchema.parse(args.evidence);
  const parsed = publishApprovalSchema.safeParse(args.approval);
  if (!parsed.success) {
    throw new PublishApprovalError(
      "A current attributable publish approval is required."
    );
  }
  const approval = parsed.data;
  if (
    approval.evidenceHash !== evidenceHash(evidence) ||
    canonicalJson(approval.evidence) !== canonicalJson(evidence)
  ) {
    throw new PublishApprovalError(
      "Publish approval is stale or does not match the current artifacts, metadata, identity, target, or dry-run evidence."
    );
  }
  return approval;
}
