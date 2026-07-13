import { setTimeout as delay } from "node:timers/promises";

export interface YoutubeMutationClient {
  channels: { list: (request: unknown) => Promise<{ data: { items?: Array<{ id?: string | null }> }; headers?: Record<string, unknown> }> };
  videos: {
    insert: (request: unknown, options?: unknown) => Promise<{ data: { id?: string | null }; headers?: Record<string, unknown> }>;
    list?: (request: unknown, options?: unknown) => Promise<{ data?: { items?: Array<{ id?: string | null }> }; headers?: Record<string, unknown> }>;
  };
  thumbnails: { set: (request: unknown, options?: unknown) => Promise<{ headers?: Record<string, unknown> }> };
  playlistItems: { insert: (request: unknown, options?: unknown) => Promise<{ data?: { id?: string | null }; headers?: Record<string, unknown> }> };
}

export type YoutubeMutationOperation =
  | "channels.list"
  | "videos.insert"
  | "thumbnails.set"
  | "playlistItems.insert"
  | "videos.list";

export interface YoutubeMutationProgress {
  channelId: string | null;
  videoId: string | null;
  videoRetryable: boolean | null;
  thumbnailStatus: "assigned" | "failed" | "skipped" | "not-attempted";
  thumbnailRetryable: boolean | null;
  playlistResults: Array<{
    playlistId: string;
    status: "assigned" | "failed";
    error: string | null;
    retryable: boolean | null;
  }>;
  verificationStatus: "verified" | "failed" | "skipped" | "not-attempted";
  verificationRetryable: boolean | null;
  blockers: string[];
  mutations: number;
}

export function readYoutubeRequestId(response: {
  readonly headers?: Record<string, unknown>;
}): string | undefined {
  for (const candidate of [
    response.headers?.["x-goog-request-id"],
    response.headers?.["x-request-id"],
    response.headers?.["x-guploader-uploadid"],
  ])
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  return undefined;
}

export function isRetryableYoutubeError(error: unknown): boolean {
  if (!error || typeof error !== "object") return true;
  const value = error as {
    readonly response?: {
      readonly status?: unknown;
      readonly data?: { readonly error?: { readonly errors?: ReadonlyArray<{ readonly reason?: unknown }> } };
    };
  };
  const reason = value.response?.data?.error?.errors?.[0]?.reason;
  if ([
    "invalidCredentials",
    "insufficientPermissions",
    "forbidden",
    "badRequest",
    "invalidVideoId",
    "invalidThumbnail",
    "duplicate",
    "authError",
  ].includes(String(reason))) return false;
  const status = value.response?.status;
  return typeof status !== "number" || status === 408 || status === 409 || status === 429 || status >= 500;
}

export function describeYoutubeError(error: unknown): string {
  if (error && typeof error === "object") {
    const value = error as {
      readonly message?: unknown;
      readonly response?: { readonly status?: unknown };
    };
    const message = typeof value.message === "string" ? value.message : "YouTube API request failed.";
    return `${message}${typeof value.response?.status === "number" ? ` (status ${value.response.status})` : ""}`;
  }
  return error instanceof Error ? error.message : String(error);
}

export async function withYoutubeRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries: number;
    label: string;
    onRetry?: (event: { label: string; attempt: number; delayMs: number; error: string }) => void;
  }
): Promise<T> {
  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableYoutubeError(error) || attempt > options.maxRetries) throw error;
      const delayMs = Math.min(1000 * 2 ** (attempt - 1), 8000) + Math.floor(Math.random() * 250);
      options.onRetry?.({
        label: options.label,
        attempt,
        delayMs,
        error: describeYoutubeError(error),
      });
      await delay(delayMs);
    }
  }
}

interface OperationConfig {
  maxRetries: number;
  timeoutMs?: number;
}

export async function executeYoutubeMutationSequence(args: {
  client: YoutubeMutationClient;
  expectedChannelId?: string;
  channelRequest: unknown;
  uploadRequest: unknown;
  upload: OperationConfig;
  thumbnail?: { request: (videoId: string) => unknown; config: OperationConfig };
  playlists: ReadonlyArray<{ playlistId: string; request: (videoId: string) => unknown; config: OperationConfig }>;
  verification?: { request: (videoId: string) => unknown; config: OperationConfig };
  verificationIdentityRequired?: boolean;
  requireObservedChannelId?: boolean;
  channelMismatchMessage?: (actualChannelId: string | null, expectedChannelId: string) => string;
  prior?: {
    videoId: string | null;
    videoRetryAllowed?: boolean;
    thumbnailAssigned: boolean;
    assignedPlaylistIds: readonly string[];
    thumbnailRetryAllowed?: boolean;
    nonRetryablePlaylistIds?: readonly string[];
  };
  captureFailures: boolean;
  continuePlaylistFailures: boolean;
  ignoreThumbnailError?: (error: unknown, context: { videoId: string }) => boolean;
  ignoreVerificationError?: (error: unknown, context: { videoId: string }) => boolean;
  onRetry?: (event: { label: string; attempt: number; delayMs: number; error: string }) => void;
  onSuccess?: (operation: YoutubeMutationOperation, response: unknown, context: { videoId?: string; playlistId?: string; channelId?: string; expectedChannelId?: string }) => void | Promise<void>;
}): Promise<YoutubeMutationProgress> {
  const progress: YoutubeMutationProgress = {
    channelId: null,
    videoId: args.prior?.videoId ?? null,
    videoRetryable: null,
    thumbnailStatus: args.prior?.thumbnailAssigned ? "assigned" : "not-attempted",
    thumbnailRetryable: null,
    playlistResults: [],
    verificationStatus: "not-attempted",
    verificationRetryable: null,
    blockers: [],
    mutations: 0,
  };
  const run = <T>(operation: YoutubeMutationOperation, config: OperationConfig, action: () => Promise<T>) =>
    withYoutubeRetry(action, {
      maxRetries: config.maxRetries,
      label: operation,
      ...(args.onRetry ? { onRetry: args.onRetry } : {}),
    });
  const fail = (message: string, error: unknown): false => {
    if (!args.captureFailures) throw error;
    progress.blockers.push(`${message}: ${describeYoutubeError(error)}`);
    return false;
  };
  const notifySuccess = async (
    operation: YoutubeMutationOperation,
    response: unknown,
    context: { videoId?: string; playlistId?: string; channelId?: string; expectedChannelId?: string }
  ): Promise<boolean> => {
    try {
      await args.onSuccess?.(operation, response, context);
      return true;
    } catch (error) {
      fail("Mutation progress persistence failed", error);
      return false;
    }
  };

  try {
    const response = await run("channels.list", { maxRetries: 2 }, () =>
      args.client.channels.list(args.channelRequest)
    );
    progress.channelId = response.data.items?.[0]?.id ?? null;
    if (!await notifySuccess("channels.list", response, {
      ...(progress.channelId ? { channelId: progress.channelId } : {}),
      ...(args.expectedChannelId ? { expectedChannelId: args.expectedChannelId } : {}),
    })) return progress;
    if (
      args.expectedChannelId &&
      ((progress.channelId && progress.channelId !== args.expectedChannelId) ||
        (!progress.channelId && args.requireObservedChannelId !== false))
    ) {
      const error = new Error(args.channelMismatchMessage?.(progress.channelId, args.expectedChannelId) ??
        `Authenticated channel ${progress.channelId ?? "missing"} does not match ${args.expectedChannelId}.`);
      if (!args.captureFailures) throw error;
      progress.blockers.push(error.message);
      return progress;
    }
  } catch (error) {
    fail("Channel ownership validation failed", error);
    return progress;
  }

  if (!progress.videoId && args.prior?.videoRetryAllowed === false) {
    progress.videoRetryable = false;
    progress.blockers.push("Video insertion is incomplete and not retryable.");
    return progress;
  }
  if (!progress.videoId) {
    try {
      progress.mutations += 1;
      const response = await run("videos.insert", args.upload, () =>
        args.client.videos.insert(
          args.uploadRequest,
          args.upload.timeoutMs === undefined ? undefined : { timeout: args.upload.timeoutMs }
        )
      );
      progress.videoId = response.data.id ?? null;
      if (!progress.videoId) throw new Error("Upload returned no video ID.");
      if (!await notifySuccess("videos.insert", response, { videoId: progress.videoId }))
        return progress;
    } catch (error) {
      progress.videoRetryable = isRetryableYoutubeError(error);
      fail("Video insertion failed", error);
      return progress;
    }
  }
  const videoId = progress.videoId;

  if (!args.thumbnail) {
    progress.thumbnailStatus = "skipped";
  } else if (
    progress.thumbnailStatus !== "assigned" &&
    args.prior?.thumbnailRetryAllowed !== false
  ) {
    try {
      progress.mutations += 1;
      const response = await run("thumbnails.set", args.thumbnail.config, () =>
        args.client.thumbnails.set(
          args.thumbnail!.request(videoId),
          args.thumbnail!.config.timeoutMs === undefined
            ? undefined
            : { timeout: args.thumbnail!.config.timeoutMs }
        )
      );
      progress.thumbnailStatus = "assigned";
      progress.thumbnailRetryable = null;
      if (!await notifySuccess("thumbnails.set", response, { videoId }))
        return progress;
    } catch (error) {
      if (args.ignoreThumbnailError?.(error, { videoId })) {
        progress.thumbnailStatus = "skipped";
      } else {
        progress.thumbnailStatus = "failed";
        progress.thumbnailRetryable = isRetryableYoutubeError(error);
        if (!fail("Thumbnail assignment failed", error)) {
          // Captured generic failures still retain video progress for resume.
        }
      }
    }
  } else if (progress.thumbnailStatus !== "assigned") {
    progress.thumbnailStatus = "failed";
    progress.thumbnailRetryable = false;
    progress.blockers.push("Thumbnail assignment is incomplete and not retryable.");
  }

  const assigned = new Set(args.prior?.assignedPlaylistIds ?? []);
  const nonRetryable = new Set(args.prior?.nonRetryablePlaylistIds ?? []);
  for (const playlist of args.playlists) {
    if (assigned.has(playlist.playlistId)) {
      progress.playlistResults.push({ playlistId: playlist.playlistId, status: "assigned", error: null, retryable: null });
      continue;
    }
    if (nonRetryable.has(playlist.playlistId)) {
      progress.playlistResults.push({ playlistId: playlist.playlistId, status: "failed", error: "Prior failure is not retryable.", retryable: false });
      progress.blockers.push(`Playlist ${playlist.playlistId} remains blocked by a non-retryable prior failure.`);
      continue;
    }
    try {
      progress.mutations += 1;
      const response = await run("playlistItems.insert", playlist.config, () =>
        args.client.playlistItems.insert(
          playlist.request(videoId),
          playlist.config.timeoutMs === undefined ? undefined : { timeout: playlist.config.timeoutMs }
        )
      );
      progress.playlistResults.push({ playlistId: playlist.playlistId, status: "assigned", error: null, retryable: null });
      if (!await notifySuccess("playlistItems.insert", response, { videoId, playlistId: playlist.playlistId }))
        return progress;
    } catch (error) {
      const message = describeYoutubeError(error);
      progress.playlistResults.push({ playlistId: playlist.playlistId, status: "failed", error: message, retryable: isRetryableYoutubeError(error) });
      if (!args.captureFailures || !args.continuePlaylistFailures) throw error;
      progress.blockers.push(`Playlist ${playlist.playlistId} failed: ${message}`);
    }
  }

  if (args.verification && args.client.videos.list) {
    try {
      const response = await run("videos.list", args.verification.config, () =>
        args.client.videos.list!(
          args.verification!.request(videoId),
          args.verification!.config.timeoutMs === undefined
            ? undefined
            : { timeout: args.verification!.config.timeoutMs }
        )
      );
      const verifiedId = response.data?.items?.[0]?.id ?? null;
      if (args.verificationIdentityRequired !== false && verifiedId !== videoId)
        throw new Error("Upload verification returned the wrong video identity.");
      progress.verificationStatus = "verified";
      progress.verificationRetryable = null;
      if (!await notifySuccess("videos.list", response, { videoId }))
        return progress;
    } catch (error) {
      if (args.ignoreVerificationError?.(error, { videoId })) progress.verificationStatus = "skipped";
      else {
        progress.verificationStatus = "failed";
        progress.verificationRetryable = isRetryableYoutubeError(error);
        fail("Upload verification failed", error);
      }
    }
  } else if (args.verification) {
    progress.verificationStatus = "failed";
    const error = new Error("Upload verification client is unavailable.");
    fail("Upload verification failed", error);
  }
  return progress;
}
