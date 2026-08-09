import crypto from "node:crypto";

import {
  ApplicationError,
  type AuthenticatedPrincipal,
} from "@mediaforge/application";
import {
  assertContentReadAccess,
  assertContentWriteAccess,
  buildAssetReferenceAttachment,
  buildEpisodeCloneResult,
  buildProductionTemplateApplyResult,
  buildProductionTemplateBinding,
  cloneEpisodeContent,
  defaultAssetReferenceMode,
  episodeCloneInputSchema,
  episodeCloneResultSchema,
  parseEpisodeAssetReferenceAttachInput,
  productionTemplateApplyInputSchema,
  productionTemplateCreateInputSchema,
  productionTemplateRecordSchema,
  productionTemplateUpdateInputSchema,
  projectAssetDescriptor,
  projectProductionTemplateRecord,
  projectReusableAssetRecord,
  reusableAssetPageSchema,
  type ProductionTemplateRecord,
} from "@mediaforge/domain";
import {
  PostgresContentReuseRepository,
  PostgresWorkflowRepository,
  mapEpisodeAssetReferenceRow,
  mapEpisodeTemplateBindingRow,
  mapProductionTemplateRow,
  type PostgresPool,
} from "@mediaforge/persistence";

import { parseEpisodeInput } from "./contract.js";
import type { ApiRequestContext } from "./http-server.js";

function digest(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function assertRead(principal: AuthenticatedPrincipal): void {
  try {
    assertContentReadAccess(principal.permissions);
  } catch {
    throw new ApplicationError(
      "authorization_denied",
      "Content read requires content.read.",
      false
    );
  }
}

function assertWrite(principal: AuthenticatedPrincipal): void {
  try {
    assertContentWriteAccess(principal.permissions);
  } catch {
    throw new ApplicationError(
      "authorization_denied",
      "Content write requires content.write.",
      false
    );
  }
}

function encodeAssetCursor(
  value: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly assetId: string;
  },
  secret: string
): string {
  const payload = Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  return `${payload}.${crypto.createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

function decodeAssetCursor(
  after: string | undefined,
  workspaceId: string,
  projectId: string,
  secret: string
): string | undefined {
  if (!after) return undefined;
  const [payload, signature, extra] = after.split(".");
  if (!payload || !signature || extra !== undefined)
    throw new ApplicationError("invalid_request", "The page cursor is invalid.", false);
  const expectedSignature = crypto.createHmac("sha256", secret).update(payload).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (
    supplied.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(supplied, expectedSignature)
  )
    throw new ApplicationError("invalid_request", "The page cursor is invalid.", false);
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    workspaceId?: string;
    projectId?: string;
    assetId?: string;
  };
  if (
    parsed.workspaceId !== workspaceId ||
    parsed.projectId !== projectId ||
    typeof parsed.assetId !== "string"
  )
    throw new ApplicationError("invalid_request", "The page cursor is invalid.", false);
  return parsed.assetId;
}

export function createApiContentReuseUseCases(input: {
  readonly pool: PostgresPool;
  readonly cursorSecret: string;
  readonly now?: () => Date;
  readonly createId?: (prefix: string) => string;
}) {
  if (Buffer.byteLength(input.cursorSecret, "utf8") < 32)
    throw new Error("API cursor signing secret must contain at least 32 bytes.");
  const workflow = new PostgresWorkflowRepository(input.pool);
  const reuse = new PostgresContentReuseRepository(input.pool);
  const now = input.now ?? (() => new Date());
  const createId = input.createId ?? ((prefix: string) => `${prefix}-${crypto.randomUUID()}`);

  async function ensureSchema(): Promise<void> {
    await reuse.ensureSchema();
  }

  function toTemplateRecord(
    row: ReturnType<typeof mapProductionTemplateRow>
  ): Record<string, unknown> {
    return productionTemplateRecordSchema.parse(
      projectProductionTemplateRecord({
        workspaceId: row.workspaceId,
        templateId: row.templateId,
        name: row.name,
        profile: row.profile as ProductionTemplateRecord["profile"],
        revision: row.revision,
        snapshot: row.snapshot as ProductionTemplateRecord["snapshot"],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })
    );
  }

  return {
    createProductionTemplate: async (
      body: unknown,
      context: Required<Pick<ApiRequestContext, "workspaceId" | "principal">>
    ) => {
      assertWrite(context.principal);
      await ensureSchema();
      const parsed = productionTemplateCreateInputSchema.parse(body);
      const created = await reuse.createTemplate({
        workspaceId: context.workspaceId,
        templateId: createId("production-template"),
        name: parsed.name,
        profile: parsed.profile,
        snapshot: parsed.snapshot,
        now: now().toISOString(),
      });
      return toTemplateRecord(mapProductionTemplateRow(created));
    },
    listProductionTemplates: async (
      context: Required<Pick<ApiRequestContext, "workspaceId" | "principal">>
    ) => {
      assertRead(context.principal);
      await ensureSchema();
      const rows = await reuse.listTemplates(context.workspaceId);
      return {
        items: rows.map((row) =>
          toTemplateRecord(mapProductionTemplateRow(row))
        ),
      };
    },
    getProductionTemplate: async (
      templateId: string,
      context: Required<Pick<ApiRequestContext, "workspaceId" | "principal">>
    ) => {
      assertRead(context.principal);
      await ensureSchema();
      const row = await reuse.getTemplate(context.workspaceId, templateId);
      if (!row)
        throw new ApplicationError("not_found", "Resource not found.", false);
      return toTemplateRecord(mapProductionTemplateRow(row));
    },
    updateProductionTemplate: async (
      templateId: string,
      body: unknown,
      context: Required<
        Pick<ApiRequestContext, "workspaceId" | "principal" | "ifMatch">
      >
    ) => {
      assertWrite(context.principal);
      await ensureSchema();
      const parsed = productionTemplateUpdateInputSchema.parse(body);
      const expectedRevision = Number(context.ifMatch);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
        throw new ApplicationError(
          "precondition_failed",
          "If-Match does not match the current template revision.",
          false
        );
      const updated = await reuse.updateTemplate({
        workspaceId: context.workspaceId,
        templateId,
        expectedRevision,
        name: parsed.name,
        snapshot: parsed.snapshot,
        now: now().toISOString(),
      });
      if (!updated)
        throw new ApplicationError(
          "precondition_failed",
          "If-Match does not match the current template revision.",
          false
        );
      return toTemplateRecord(mapProductionTemplateRow(updated));
    },
    applyProductionTemplate: async (
      episodeId: string,
      body: unknown,
      context: Required<Pick<ApiRequestContext, "workspaceId" | "projectId" | "principal">>
    ) => {
      assertWrite(context.principal);
      await ensureSchema();
      const parsed = productionTemplateApplyInputSchema.parse(body);
      const episode = await workflow.withWorkspaceTransaction(
        context.workspaceId,
        (transaction) =>
          transaction.getEpisode(
            context.workspaceId,
            context.projectId,
            episodeId
          )
      );
      if (!episode)
        throw new ApplicationError("not_found", "Resource not found.", false);
      const templateRow = await reuse.getTemplate(
        context.workspaceId,
        parsed.templateId
      );
      if (!templateRow)
        throw new ApplicationError("not_found", "Resource not found.", false);
      const template = projectProductionTemplateRecord({
        workspaceId: context.workspaceId,
        templateId: templateRow.template_id,
        name: templateRow.name,
        profile: templateRow.profile as ProductionTemplateRecord["profile"],
        revision: Number(templateRow.revision),
        snapshot: templateRow.snapshot as ProductionTemplateRecord["snapshot"],
        createdAt: new Date(templateRow.created_at).toISOString(),
        updatedAt: new Date(templateRow.updated_at).toISOString(),
      });
      const project = await workflow.withWorkspaceTransaction(
        context.workspaceId,
        (transaction) =>
          transaction.getProject(context.workspaceId, context.projectId)
      );
      if (!project)
        throw new ApplicationError("not_found", "Resource not found.", false);
      if (project.profile !== template.profile)
        throw new ApplicationError(
          "profile_input_invalid",
          "Production template profile does not match the project profile.",
          false
        );
      const pinnedRevision = parsed.pinnedRevision ?? template.revision;
      const binding = buildProductionTemplateBinding({
        template,
        pinnedRevision,
        appliedAt: now().toISOString(),
      });
      await reuse.upsertEpisodeTemplateBinding({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        episodeId,
        templateId: template.templateId,
        pinnedRevision: binding.pinnedRevision,
        appliedSnapshot: binding.appliedSnapshot,
        appliedAt: binding.appliedAt,
      });
      return buildProductionTemplateApplyResult({ binding });
    },
    cloneEpisode: async (
      episodeId: string,
      body: unknown,
      context: Required<
        Pick<
          ApiRequestContext,
          "workspaceId" | "projectId" | "principal" | "idempotencyKey"
        >
      >
    ) => {
      assertWrite(context.principal);
      if (!context.idempotencyKey)
        throw new ApplicationError(
          "precondition_required",
          "Idempotency-Key is required.",
          false
        );
      await ensureSchema();
      const parsed = episodeCloneInputSchema.parse(body);
      const targetProjectId = parsed.targetProjectId ?? context.projectId;
      const fingerprint = digest(
        JSON.stringify({
          sourceEpisodeId: episodeId,
          sourceProjectId: context.projectId,
          targetProjectId,
          copyPolicy: parsed.copyPolicy,
          sourceRevision: parsed.sourceRevision ?? null,
        })
      );
      const prior = await reuse.getCloneIdempotency(
        context.workspaceId,
        context.idempotencyKey
      );
      if (prior) {
        if (prior.requestFingerprint !== fingerprint)
          throw new ApplicationError(
            "idempotency_key_conflict",
            "Idempotency key is already associated with a different request.",
            false
          );
        return episodeCloneResultSchema.parse(prior.response);
      }
      const sourceEpisode = await workflow.withWorkspaceTransaction(
        context.workspaceId,
        (transaction) =>
          transaction.getEpisode(
            context.workspaceId,
            context.projectId,
            episodeId
          )
      );
      if (!sourceEpisode)
        throw new ApplicationError("not_found", "Resource not found.", false);
      if (
        parsed.sourceRevision !== undefined &&
        parsed.sourceRevision !== sourceEpisode.revision
      )
        throw new ApplicationError(
          "precondition_failed",
          "Source revision does not match the current episode revision.",
          false
        );
      const targetProject = await workflow.withWorkspaceTransaction(
        context.workspaceId,
        (transaction) =>
          transaction.getProject(context.workspaceId, targetProjectId)
      );
      if (!targetProject)
        throw new ApplicationError("not_found", "Resource not found.", false);
      const assetIds = new Set<string>();
      const contentRecord = sourceEpisode.content as Record<string, unknown>;
      for (const field of ["referenceAssetIds", "sourceAssetIds"]) {
        const value = contentRecord[field];
        if (Array.isArray(value))
          for (const entry of value)
            if (typeof entry === "string") assetIds.add(entry);
      }
      const assetCatalog: Record<string, ReturnType<typeof projectAssetDescriptor>> =
        {};
      for (const assetId of assetIds) {
        const descriptor = await workflow.withWorkspaceTransaction(
          context.workspaceId,
          (transaction) =>
            transaction.getAssetDescriptor({
              workspaceId: context.workspaceId,
              projectId: context.projectId,
              assetId,
            })
        );
        if (!descriptor) continue;
        try {
          assetCatalog[assetId] = projectAssetDescriptor({
            assetId: descriptor.assetId,
            mimeType: descriptor.mimeType,
            bytes: descriptor.bytes,
            sha256: descriptor.sha256,
            lifecycle: descriptor.lifecycle,
            provenance: descriptor.provenance,
            ownerProjectId: context.projectId,
          });
        } catch {
          continue;
        }
      }
      const cloned = cloneEpisodeContent({
        sourceContent: sourceEpisode.content,
        sourceProjectId: context.projectId,
        targetProjectId,
        assetCatalog,
        copyPolicy: parsed.copyPolicy,
      });
      const sourceContent = sourceEpisode.content as Record<string, unknown>;
      if (
        typeof sourceContent["type"] === "string" &&
        sourceContent["type"] !== targetProject.profile
      )
        throw new ApplicationError(
          "profile_input_invalid",
          "Cloned episode content does not match the target project profile.",
          false
        );
      const newEpisodeId = createId("episode");
      const created = await workflow.withWorkspaceTransaction(
        context.workspaceId,
        async (transaction) =>
          transaction.createEpisode({
            workspaceId: context.workspaceId,
            projectId: targetProjectId,
            episodeId: newEpisodeId,
            content: cloned.content,
            now: now().toISOString(),
          })
      );
      if (!created)
        throw new ApplicationError("not_found", "Resource not found.", false);
      const result = buildEpisodeCloneResult({
        episodeId: created.episodeId,
        revision: created.revision,
        omittedAssets: cloned.omittedAssets,
      });
      await reuse.recordCloneIdempotency({
        workspaceId: context.workspaceId,
        idempotencyKey: context.idempotencyKey,
        requestFingerprint: fingerprint,
        response: result,
        now: now().toISOString(),
      });
      return result;
    },
    listReusableAssets: async (
      after: string | undefined,
      size: number,
      filters: { readonly mimeType?: string },
      context: Required<
        Pick<ApiRequestContext, "workspaceId" | "projectId" | "principal">
      >
    ) => {
      assertRead(context.principal);
      const cursorAssetId = decodeAssetCursor(
        after,
        context.workspaceId,
        context.projectId,
        input.cursorSecret
      );
      const records = await workflow.withWorkspaceTransaction(
        context.workspaceId,
        (transaction) =>
          transaction.listAssetDescriptors({
            workspaceId: context.workspaceId,
            projectId: context.projectId,
            ...(cursorAssetId ? { after: cursorAssetId } : {}),
            size: size + 1,
          })
      );
      const page = records.slice(0, size);
      const last = page.at(-1);
      const items = page
        .map((record) => {
          try {
            const asset = projectAssetDescriptor({
              assetId: record.assetId,
              mimeType: record.mimeType,
              bytes: record.bytes,
              sha256: record.sha256,
              lifecycle: record.lifecycle,
              provenance: record.provenance,
              ownerProjectId: context.projectId,
            });
            return projectReusableAssetRecord({
              asset,
              sourceProjectId: context.projectId,
              targetProjectId: context.projectId,
              ...(filters.mimeType ? { mimeTypeFilter: filters.mimeType } : {}),
            });
          } catch {
            return null;
          }
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .filter((entry) => entry.eligibility.eligible);
      return reusableAssetPageSchema.parse({
        items,
        ...(records.length > size && last
          ? {
              nextAfter: encodeAssetCursor(
                {
                  workspaceId: context.workspaceId,
                  projectId: context.projectId,
                  assetId: last.assetId,
                },
                input.cursorSecret
              ),
            }
          : {}),
      });
    },
    attachEpisodeAssetReference: async (
      episodeId: string,
      body: unknown,
      context: Required<Pick<ApiRequestContext, "workspaceId" | "projectId" | "principal">>
    ) => {
      assertWrite(context.principal);
      await ensureSchema();
      const parsed = parseEpisodeAssetReferenceAttachInput(body);
      const episode = await workflow.withWorkspaceTransaction(
        context.workspaceId,
        (transaction) =>
          transaction.getEpisode(
            context.workspaceId,
            context.projectId,
            episodeId
          )
      );
      if (!episode)
        throw new ApplicationError("not_found", "Resource not found.", false);
      const descriptor = await workflow.withWorkspaceTransaction(
        context.workspaceId,
        (transaction) =>
          transaction.getAssetDescriptor({
            workspaceId: context.workspaceId,
            projectId: context.projectId,
            assetId: parsed.assetId,
          })
      );
      if (!descriptor)
        throw new ApplicationError("not_found", "Resource not found.", false);
      const asset = projectAssetDescriptor({
        assetId: descriptor.assetId,
        mimeType: descriptor.mimeType,
        bytes: descriptor.bytes,
        sha256: descriptor.sha256,
        lifecycle: descriptor.lifecycle,
        provenance: descriptor.provenance,
        ownerProjectId: context.projectId,
      });
      const eligibility = projectReusableAssetRecord({
        asset,
        sourceProjectId: context.projectId,
        targetProjectId: context.projectId,
      });
      if (!eligibility?.eligibility.eligible)
        throw new ApplicationError(
          "authorization_denied",
          eligibility?.eligibility.reason ?? "Asset is not reusable.",
          false
        );
      const mode = defaultAssetReferenceMode(parsed.mode);
      const attachmentKey =
        parsed.attachmentKey ??
        digest(`${episodeId}:${parsed.assetId}:${asset.sha256}`);
      const attached = await reuse.attachAssetReference({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        episodeId,
        attachmentKey,
        assetId: asset.assetId,
        sha256: asset.sha256,
        provenance: asset.provenance,
        mode,
        now: now().toISOString(),
      });
      const reference = buildAssetReferenceAttachment({
        asset,
        attachmentKey,
        mode,
        createdAt: mapEpisodeAssetReferenceRow(attached.row).createdAt,
      });
      return { reference, replayed: attached.replayed };
    },
    getEpisodeProductionTemplateBinding: async (
      episodeId: string,
      context: Required<
        Pick<ApiRequestContext, "workspaceId" | "projectId" | "principal">
      >
    ) => {
      assertRead(context.principal);
      await ensureSchema();
      const row = await reuse.getEpisodeTemplateBinding({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        episodeId,
      });
      if (!row) return null;
      const mapped = mapEpisodeTemplateBindingRow(row);
      return buildProductionTemplateApplyResult({
        binding: {
          schemaVersion: "mediaforge.production-template-binding.v1",
          templateId: mapped.templateId,
          pinnedRevision: mapped.pinnedRevision,
          appliedSnapshot:
            mapped.appliedSnapshot as ProductionTemplateRecord["snapshot"],
          appliedAt: mapped.appliedAt,
        },
      });
    },
  };
}
