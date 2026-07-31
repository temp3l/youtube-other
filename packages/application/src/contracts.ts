import { z } from "zod";

const identifier = z
  .string()
  .min(3)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9._-]*$/u);
const requestIdentifier = z
  .string()
  .min(3)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);
const nonEmpty = z.string().trim().min(1);

export const applicationActorSchema = z
  .object({
    principalId: identifier,
    kind: z.enum(["user", "service", "worker", "system"]),
    permissions: z.array(nonEmpty).readonly(),
  })
  .strict();
export type ApplicationActor = z.infer<typeof applicationActorSchema>;

export const applicationWorkspaceSchema = z.object({ id: identifier }).strict();
export type ApplicationWorkspace = z.infer<typeof applicationWorkspaceSchema>;

export const applicationAuthorizationSchema = z
  .object({
    decision: z.enum(["allowed", "denied"]),
    requiredPermissions: z.array(nonEmpty).readonly(),
  })
  .strict();
export type ApplicationAuthorization = z.infer<
  typeof applicationAuthorizationSchema
>;

export const applicationIdempotencySchema = z
  .object({
    key: z
      .string()
      .min(1)
      .max(255)
      .regex(/^[\x20-\x7E]+$/u),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();
export type ApplicationIdempotency = z.infer<
  typeof applicationIdempotencySchema
>;

export const applicationRequestContextSchema = z
  .object({
    actor: applicationActorSchema,
    workspace: applicationWorkspaceSchema,
    authorization: applicationAuthorizationSchema,
    requestId: requestIdentifier,
    correlationId: requestIdentifier,
    causationId: requestIdentifier.optional(),
    deadlineAt: z.iso.datetime({ offset: true }),
    idempotency: applicationIdempotencySchema.optional(),
  })
  .strict();
export type ApplicationRequestContext = z.infer<
  typeof applicationRequestContextSchema
>;

export interface ApplicationExecutionContext extends ApplicationRequestContext {
  readonly signal: AbortSignal;
}

export function createApplicationExecutionContext(input: {
  readonly context: unknown;
  readonly signal?: AbortSignal;
}): ApplicationExecutionContext {
  return {
    ...applicationRequestContextSchema.parse(input.context),
    signal: input.signal ?? new AbortController().signal,
  };
}

export const applicationCommandSchema = z
  .object({
    name: nonEmpty,
    payload: z.unknown(),
  })
  .strict();
export type ApplicationCommand = z.infer<typeof applicationCommandSchema>;

export const applicationQuerySchema = z
  .object({
    name: nonEmpty,
    parameters: z.unknown(),
  })
  .strict();
export type ApplicationQuery = z.infer<typeof applicationQuerySchema>;

export const applicationSuccessSchema = z
  .object({
    status: z.literal("ok"),
    value: z.unknown(),
  })
  .strict();
export type ApplicationSuccess = z.infer<typeof applicationSuccessSchema>;

export interface ApplicationCommandHandler<TCommand, TResult> {
  execute(
    command: TCommand,
    context: ApplicationExecutionContext
  ): Promise<TResult>;
}

export interface ApplicationQueryHandler<TQuery, TResult> {
  execute(
    query: TQuery,
    context: ApplicationExecutionContext
  ): Promise<TResult>;
}
