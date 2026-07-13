import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { hashFile, hashText, writeJsonAtomic } from "@mediaforge/shared";
import { z } from "zod";
import {
  executeYoutubeMutationSequence,
  type YoutubeMutationClient,
} from "./youtube-mutation-seam.js";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const policySchema = z.strictObject({
  privacyStatus: z.enum(["private", "unlisted", "public"]),
  madeForKids: z.boolean(),
  containsSyntheticMedia: z.boolean(),
});
const identitySchema = z.strictObject({
  contentId: z.string().min(1),
  language: z.string().min(1),
  variant: z.string().min(1),
});
const metadataSchema = z.strictObject({
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(5000),
  tags: z.array(z.string().min(1)),
  categoryId: z.string().regex(/^\d+$/u),
});

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Publish fingerprint cannot contain a non-finite number.");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new Error("Publish fingerprint contains an unsupported value.");
}
const hashObject = (value: unknown) => hashText(canonicalJson(value));

const playlistResultSchema = z.strictObject({
  playlistId: z.string().min(1),
  status: z.enum(["assigned", "failed"]),
  error: z.string().nullable(),
  retryable: z.boolean().nullable(),
  bindingHash: hashSchema,
});

const reportAuthority = new WeakMap<object, string>();
const operationBinding = (args: {
  requestFingerprint: string;
  operation: string;
  videoId: string | null;
  status: string;
  playlistId?: string;
}) => hashObject(args);

export const genericYoutubePublishReportSchema = z.strictObject({
  artifactVersion: z.literal("youtube-media-publish.v2"),
  status: z.enum(["PUBLISHED", "PUBLISH_BLOCKED"]),
  identity: identitySchema,
  requestFingerprint: hashSchema,
  channelId: z.string().min(1),
  videoId: z.string().min(1).nullable(),
  videoRetryable: z.boolean().nullable(),
  videoBindingHash: hashSchema.nullable(),
  videoHash: hashSchema,
  thumbnailHash: hashSchema,
  metadataHash: hashSchema,
  playlistResults: z.array(playlistResultSchema),
  thumbnailStatus: z.enum(["assigned", "failed", "not-attempted"]),
  thumbnailRetryable: z.boolean().nullable(),
  thumbnailBindingHash: hashSchema.nullable(),
  verificationStatus: z.enum(["verified", "failed", "not-attempted"]),
  verificationRetryable: z.boolean().nullable(),
  verificationBindingHash: hashSchema.nullable(),
  blockers: z.array(z.string()),
  mutations: z.number().int().nonnegative(),
}).superRefine((report, context) => {
  const ids = report.playlistResults.map((entry) => entry.playlistId);
  if (new Set(ids).size !== ids.length)
    context.addIssue({ code: "custom", path: ["playlistResults"], message: "Prior publish report contains duplicate playlist results." });
  if (!report.videoId && (report.thumbnailStatus === "assigned" || report.playlistResults.some((entry) => entry.status === "assigned")))
    context.addIssue({ code: "custom", path: ["videoId"], message: "Prior publish report claims mutations without a video identity." });
  const complete =
    Boolean(report.videoId) &&
    report.thumbnailStatus === "assigned" &&
    report.verificationStatus === "verified" &&
    report.playlistResults.every((entry) => entry.status === "assigned");
  if ((report.status === "PUBLISHED") !== (complete && report.blockers.length === 0))
    context.addIssue({ code: "custom", path: ["status"], message: "Prior publish report status contradicts its operation evidence." });
  for (const [index, entry] of report.playlistResults.entries()) {
    if ((entry.status === "assigned") !== (entry.error === null))
      context.addIssue({ code: "custom", path: ["playlistResults", index, "error"], message: "Playlist result status and error contradict." });
    if (entry.status === "assigned" && entry.retryable !== null)
      context.addIssue({ code: "custom", path: ["playlistResults", index, "retryable"], message: "Successful playlist evidence cannot be retryable." });
    if (entry.bindingHash !== operationBinding({ requestFingerprint: report.requestFingerprint, operation: "playlistItems.insert", videoId: report.videoId, playlistId: entry.playlistId, status: entry.status }))
      context.addIssue({ code: "custom", path: ["playlistResults", index, "bindingHash"], message: "Playlist operation evidence is not bound to the request and video." });
  }
  const expectedVideoBinding = report.videoId
    ? operationBinding({ requestFingerprint: report.requestFingerprint, operation: "videos.insert", videoId: report.videoId, status: "inserted" })
    : null;
  if (report.videoBindingHash !== expectedVideoBinding)
    context.addIssue({ code: "custom", path: ["videoBindingHash"], message: "Video operation evidence is not bound to the request." });
  const expectedThumbnailBinding = report.thumbnailStatus === "not-attempted"
    ? null
    : operationBinding({ requestFingerprint: report.requestFingerprint, operation: "thumbnails.set", videoId: report.videoId, status: report.thumbnailStatus });
  if (report.thumbnailBindingHash !== expectedThumbnailBinding)
    context.addIssue({ code: "custom", path: ["thumbnailBindingHash"], message: "Thumbnail operation evidence is not bound to the request and video." });
  const expectedVerificationBinding = report.verificationStatus === "not-attempted"
    ? null
    : operationBinding({ requestFingerprint: report.requestFingerprint, operation: "videos.list", videoId: report.videoId, status: report.verificationStatus });
  if (report.verificationBindingHash !== expectedVerificationBinding)
    context.addIssue({ code: "custom", path: ["verificationBindingHash"], message: "Verification evidence is not bound to the request and video." });
  if (report.thumbnailStatus !== "failed" && report.thumbnailRetryable !== null)
    context.addIssue({ code: "custom", path: ["thumbnailRetryable"], message: "Only failed thumbnail operations have retry classification." });
  if (report.verificationStatus !== "failed" && report.verificationRetryable !== null)
    context.addIssue({ code: "custom", path: ["verificationRetryable"], message: "Only failed verification operations have retry classification." });
});

export type YoutubeMediaClient = YoutubeMutationClient;
export type GenericYoutubePublishReport = z.infer<typeof genericYoutubePublishReportSchema>;

export interface PublishYoutubeMediaInput {
  mediaPath: string;
  thumbnailPath: string;
  metadataPath: string;
  identity: unknown;
  channelId: string;
  policy: unknown;
  playlistIds: readonly string[];
  metadata: unknown;
  client: YoutubeMediaClient;
  priorReport?: unknown;
  checkpoint?: (report: GenericYoutubePublishReport) => void | Promise<void>;
}

function report(args: {
  status: "PUBLISHED" | "PUBLISH_BLOCKED";
  identity: z.infer<typeof identitySchema>;
  fingerprint: string;
  channelId: string;
  videoHash: string;
  thumbnailHash: string;
  metadataHash: string;
  videoId?: string | null;
  playlistResults?: Array<Omit<GenericYoutubePublishReport["playlistResults"][number], "bindingHash">>;
  thumbnailStatus?: GenericYoutubePublishReport["thumbnailStatus"];
  verificationStatus?: GenericYoutubePublishReport["verificationStatus"];
  blockers?: string[];
  mutations?: number;
  videoRetryable?: boolean | null;
  thumbnailRetryable?: boolean | null;
  verificationRetryable?: boolean | null;
}): GenericYoutubePublishReport {
  const videoId = args.videoId ?? null;
  const thumbnailStatus = args.thumbnailStatus ?? "not-attempted";
  const verificationStatus = args.verificationStatus ?? "not-attempted";
  const value = genericYoutubePublishReportSchema.parse({
    artifactVersion: "youtube-media-publish.v2",
    status: args.status,
    identity: args.identity,
    requestFingerprint: args.fingerprint,
    channelId: args.channelId,
    videoId,
    videoRetryable: args.videoRetryable ?? null,
    videoBindingHash: videoId ? operationBinding({ requestFingerprint: args.fingerprint, operation: "videos.insert", videoId, status: "inserted" }) : null,
    videoHash: args.videoHash,
    thumbnailHash: args.thumbnailHash,
    metadataHash: args.metadataHash,
    playlistResults: (args.playlistResults ?? []).map((entry) => ({
      ...entry,
      bindingHash: operationBinding({ requestFingerprint: args.fingerprint, operation: "playlistItems.insert", videoId, playlistId: entry.playlistId, status: entry.status }),
    })),
    thumbnailStatus,
    thumbnailRetryable: thumbnailStatus === "failed" ? (args.thumbnailRetryable ?? false) : null,
    thumbnailBindingHash: thumbnailStatus === "not-attempted" ? null : operationBinding({ requestFingerprint: args.fingerprint, operation: "thumbnails.set", videoId, status: thumbnailStatus }),
    verificationStatus,
    verificationRetryable: verificationStatus === "failed" ? (args.verificationRetryable ?? false) : null,
    verificationBindingHash: verificationStatus === "not-attempted" ? null : operationBinding({ requestFingerprint: args.fingerprint, operation: "videos.list", videoId, status: verificationStatus }),
    blockers: args.blockers ?? [],
    mutations: args.mutations ?? 0,
  });
  reportAuthority.set(value, canonicalReportHash(value));
  return value;
}

function canonicalReportHash(value: GenericYoutubePublishReport): string {
  return hashObject(value);
}

export async function saveGenericYoutubePublishReport(args: {
  reportRoot: string;
  report: GenericYoutubePublishReport;
  fileName?: string;
}): Promise<{ reportPath: string; contentHash: string }> {
  if (reportAuthority.get(args.report) !== canonicalReportHash(args.report))
    throw new Error("Only an unmodified publisher-owned report can be persisted.");
  const fileName = args.fileName ?? "youtube-media-publish.json";
  if (!/^[a-z0-9][a-z0-9.-]*\.json$/u.test(fileName)) throw new Error("Invalid publish report name.");
  const root = path.resolve(args.reportRoot);
  const reportPath = path.join(root, fileName);
  await fs.mkdir(root, { recursive: true });
  await writeJsonAtomic(reportPath, args.report);
  return { reportPath, contentHash: await hashFile(reportPath) };
}

export async function loadGenericYoutubePublishReport(args: {
  reportRoot: string;
  reportPath: string;
  expectedContentHash: string;
}): Promise<GenericYoutubePublishReport> {
  const root = path.resolve(args.reportRoot);
  const target = path.resolve(args.reportPath);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("Publish report escapes its authoritative root.");
  const [rootReal, stat] = await Promise.all([fs.realpath(root), fs.lstat(target)]);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Publish report is not a regular authoritative file.");
  const targetReal = await fs.realpath(target);
  if (!targetReal.startsWith(`${rootReal}${path.sep}`)) throw new Error("Publish report symlink escapes its authoritative root.");
  if (await hashFile(target) !== args.expectedContentHash) throw new Error("Publish report content hash mismatch.");
  const value = genericYoutubePublishReportSchema.parse(JSON.parse(await fs.readFile(target, "utf8")) as unknown);
  reportAuthority.set(value, canonicalReportHash(value));
  return value;
}

export async function publishYoutubeMedia(
  input: PublishYoutubeMediaInput
): Promise<{ report: GenericYoutubePublishReport; reused: boolean }> {
  const identityResult = identitySchema.safeParse(input.identity);
  const policyResult = policySchema.safeParse(input.policy);
  const metadataResult = metadataSchema.safeParse(input.metadata);
  const identity = identityResult.success
    ? identityResult.data
    : { contentId: "invalid", language: "invalid", variant: "invalid" };
  const [videoHash, thumbnailHash, metadataFileHash] = await Promise.all([
    hashFile(input.mediaPath),
    hashFile(input.thumbnailPath),
    hashFile(input.metadataPath),
  ]);
  const metadataHash = metadataResult.success
    ? hashObject(metadataResult.data)
    : metadataFileHash;
  const playlistIds = [...new Set(input.playlistIds.map((id) => id.trim()))];
  const request = {
    identity,
    channelId: input.channelId,
    policy: policyResult.success ? policyResult.data : null,
    playlistIds,
    videoHash,
    thumbnailHash,
    metadataHash,
    metadataFileHash,
  };
  const fingerprint = hashObject(request);
  const validationBlockers = [
    ...(!identityResult.success ? ["Invalid content identity."] : []),
    ...(!policyResult.success ? policyResult.error.issues.map((issue) => `Missing or invalid policy: ${issue.path.join(".")}.`) : []),
    ...(!metadataResult.success ? ["Invalid publish metadata."] : []),
    ...(!input.channelId.trim() ? ["Missing channel target."] : []),
    ...(playlistIds.length === 0 || playlistIds.some((id) => id.length === 0) ? ["Missing required playlist policy."] : []),
  ];
  if (validationBlockers.length > 0)
    return {
      report: report({ status: "PUBLISH_BLOCKED", identity, fingerprint, channelId: input.channelId || "invalid", videoHash, thumbnailHash, metadataHash, blockers: validationBlockers }),
      reused: false,
    };
  if (!identityResult.success || !policyResult.success || !metadataResult.success)
    throw new Error("Publish validation invariant failed.");

  let prior: GenericYoutubePublishReport | undefined;
  if (input.priorReport !== undefined) {
    const parsed = genericYoutubePublishReportSchema.safeParse(input.priorReport);
    if (
      !parsed.success ||
      !input.priorReport ||
      typeof input.priorReport !== "object" ||
      reportAuthority.get(input.priorReport) !==
        (parsed.success ? canonicalReportHash(parsed.data) : undefined)
    ) {
      return {
        report: report({ status: "PUBLISH_BLOCKED", identity, fingerprint, channelId: input.channelId, videoHash, thumbnailHash, metadataHash, blockers: ["Prior publish report is malformed or not authority-loaded."] }),
        reused: false,
      };
    }
    prior = parsed.data;
    reportAuthority.set(prior, canonicalReportHash(prior));
    if (
      prior.requestFingerprint !== fingerprint ||
      JSON.stringify(prior.identity) !== JSON.stringify(identity) ||
      prior.channelId !== input.channelId ||
      prior.videoHash !== videoHash ||
      prior.thumbnailHash !== thumbnailHash ||
      prior.metadataHash !== metadataHash ||
      prior.playlistResults.some((entry, index) => entry.playlistId !== playlistIds[index])
    )
      return {
        report: report({ status: "PUBLISH_BLOCKED", identity, fingerprint, channelId: input.channelId, videoHash, thumbnailHash, metadataHash, blockers: ["Prior publish report is stale or identity-mismatched."] }),
        reused: false,
      };
    if (prior.status === "PUBLISHED" && playlistIds.every((id) =>
      prior!.playlistResults.some((entry) => entry.playlistId === id && entry.status === "assigned")
    )) return { report: prior, reused: true };
  }

  const metadata = metadataResult.data;
  const policy = policyResult.data;
  const checkpointPlaylists = new Map(
    prior?.playlistResults.map((entry) => [entry.playlistId, {
      playlistId: entry.playlistId,
      status: entry.status,
      error: entry.error,
      retryable: entry.retryable,
    }]) ?? []
  );
  let checkpointVideoId = prior?.videoId ?? null;
  let checkpointThumbnailStatus: GenericYoutubePublishReport["thumbnailStatus"] = prior?.thumbnailStatus ?? "not-attempted";
  let checkpointVerificationStatus: GenericYoutubePublishReport["verificationStatus"] = prior?.verificationStatus ?? "not-attempted";
  let checkpointMutations = prior?.mutations ?? 0;
  const emitCheckpoint = async () => {
    if (!input.checkpoint) return;
    const playlistResults = playlistIds.flatMap((playlistId) => {
      const entry = checkpointPlaylists.get(playlistId);
      return entry ? [entry] : [];
    });
    const complete =
      Boolean(checkpointVideoId) &&
      checkpointThumbnailStatus === "assigned" &&
      checkpointVerificationStatus === "verified" &&
      playlistResults.length === playlistIds.length &&
      playlistResults.every((entry) => entry.status === "assigned");
    await input.checkpoint(report({
      status: complete ? "PUBLISHED" : "PUBLISH_BLOCKED",
      identity,
      fingerprint,
      channelId: input.channelId,
      videoHash,
      thumbnailHash,
      metadataHash,
      videoId: checkpointVideoId,
      playlistResults,
      thumbnailStatus: checkpointThumbnailStatus,
      verificationStatus: checkpointVerificationStatus,
      blockers: complete ? [] : ["Publish sequence is incomplete."],
      mutations: checkpointMutations,
    }));
  };
  const progress = await executeYoutubeMutationSequence({
    client: input.client,
    expectedChannelId: input.channelId,
    channelRequest: { part: ["id"], mine: true },
    uploadRequest: {
      part: ["snippet", "status"],
      notifySubscribers: false,
      requestBody: {
        snippet: { title: metadata.title, description: metadata.description, tags: metadata.tags, categoryId: metadata.categoryId },
        status: { privacyStatus: policy.privacyStatus, selfDeclaredMadeForKids: policy.madeForKids, containsSyntheticMedia: policy.containsSyntheticMedia },
      },
      media: { mimeType: "video/mp4", body: createReadStream(input.mediaPath) },
      uploadType: "resumable",
    },
    upload: { maxRetries: 2, timeoutMs: 180_000 },
    thumbnail: {
      request: (videoId) => ({
        videoId,
        media: {
          mimeType: input.thumbnailPath.toLowerCase().endsWith(".png")
            ? "image/png"
            : input.thumbnailPath.toLowerCase().match(/\.jpe?g$/u)
              ? "image/jpeg"
              : "image/svg+xml",
          body: createReadStream(input.thumbnailPath),
        },
      }),
      config: { maxRetries: 2, timeoutMs: 120_000 },
    },
    playlists: playlistIds.map((playlistId) => ({
      playlistId,
      request: (videoId: string) => ({
        part: ["snippet"],
        requestBody: { snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } } },
      }),
      config: { maxRetries: 2, timeoutMs: 120_000 },
    })),
    verification: {
      request: (videoId) => ({ part: ["id", "snippet", "status"], id: [videoId] }),
      config: { maxRetries: 1, timeoutMs: 120_000 },
    },
    ...(prior ? {
      prior: {
        videoId: prior.videoId,
        videoRetryAllowed: Boolean(prior.videoId) || prior.videoRetryable === true,
        thumbnailAssigned: prior.thumbnailStatus === "assigned",
        assignedPlaylistIds: prior.playlistResults.filter((entry) => entry.status === "assigned").map((entry) => entry.playlistId),
        thumbnailRetryAllowed: prior.thumbnailStatus !== "failed" || prior.thumbnailRetryable === true,
        nonRetryablePlaylistIds: prior.playlistResults.filter((entry) => entry.status === "failed" && entry.retryable !== true).map((entry) => entry.playlistId),
      },
    } : {}),
    captureFailures: true,
    continuePlaylistFailures: true,
    ...(input.checkpoint ? {
      onSuccess: async (operation, _response, context) => {
        if (operation === "videos.insert") {
          checkpointVideoId = context.videoId ?? null;
          checkpointMutations += 1;
        }
        if (operation === "thumbnails.set") {
          checkpointThumbnailStatus = "assigned";
          checkpointMutations += 1;
        }
        if (operation === "playlistItems.insert" && context.playlistId) {
          checkpointPlaylists.set(context.playlistId, {
            playlistId: context.playlistId,
            status: "assigned",
            error: null,
            retryable: null,
          });
          checkpointMutations += 1;
        }
        if (operation === "videos.list") checkpointVerificationStatus = "verified";
        if (operation !== "channels.list") await emitCheckpoint();
      },
    } : {}),
  });
  const thumbnailStatus = progress.thumbnailStatus === "assigned" ? "assigned" : progress.thumbnailStatus === "failed" ? "failed" : "not-attempted";
  const verificationStatus = progress.verificationStatus === "verified" ? "verified" : progress.verificationStatus === "failed" ? "failed" : "not-attempted";
  const blockers = [...progress.blockers];
  if (thumbnailStatus !== "assigned" && !blockers.some((item) => item.includes("Thumbnail"))) blockers.push("Thumbnail assignment is incomplete.");
  if (verificationStatus !== "verified" && !blockers.some((item) => item.includes("verification"))) blockers.push("Upload verification is incomplete.");
  const completed =
    blockers.length === 0 &&
    Boolean(progress.videoId) &&
    thumbnailStatus === "assigned" &&
    verificationStatus === "verified" &&
    playlistIds.every((id) => progress.playlistResults.some((entry) => entry.playlistId === id && entry.status === "assigned"));
  return {
    reused: false,
    report: report({
      status: completed ? "PUBLISHED" : "PUBLISH_BLOCKED",
      identity,
      fingerprint,
      channelId: input.channelId,
      videoHash,
      thumbnailHash,
      metadataHash,
      videoId: progress.videoId,
      playlistResults: progress.playlistResults,
      thumbnailStatus,
      verificationStatus,
      videoRetryable: progress.videoRetryable,
      thumbnailRetryable: progress.thumbnailRetryable,
      verificationRetryable: progress.verificationRetryable,
      blockers,
      mutations: (prior?.mutations ?? 0) + progress.mutations,
    }),
  };
}
