import {
  assertCreatorCapabilityAllowsDirectPost,
  buildCreatorInfoCacheRecord,
  creatorInfoCacheKey,
  isCreatorInfoCacheFresh,
  resolveTikTokLocaleTarget,
  validateTikTokCreatorPreflightResult,
  type MicrodramaPublicationTargetProfile,
  type TikTokCreatorInfoCacheRecord,
  type TikTokCreatorInfoSnapshot,
  type TikTokCreatorPreflightResult,
} from "@mediaforge/domain";

export type TikTokCreatorInfoAdapter = {
  fetchCreatorInfo(input: {
    readonly providerAccountId: string;
    readonly credentialVersion: string;
    readonly accountFence: string;
    readonly fetchedAt: string;
  }): Promise<TikTokCreatorInfoSnapshot>;
};

export type TikTokCreatorInfoCachePort = {
  get(cacheKey: string): TikTokCreatorInfoCacheRecord | null;
  put(record: TikTokCreatorInfoCacheRecord): void;
};

export class InMemoryTikTokCreatorInfoCache implements TikTokCreatorInfoCachePort {
  private readonly records = new Map<string, TikTokCreatorInfoCacheRecord>();

  public get(cacheKey: string): TikTokCreatorInfoCacheRecord | null {
    return this.records.get(cacheKey) ?? null;
  }

  public put(record: TikTokCreatorInfoCacheRecord): void {
    this.records.set(record.cacheKey, record);
  }
}

export class FixtureTikTokCreatorInfoAdapter implements TikTokCreatorInfoAdapter {
  public constructor(
    private readonly fixture: TikTokCreatorInfoSnapshot
  ) {}

  public async fetchCreatorInfo(): Promise<TikTokCreatorInfoSnapshot> {
    return this.fixture;
  }
}

export type TikTokCreatorPreflightServiceInput = {
  readonly cache: TikTokCreatorInfoCachePort;
  readonly adapter: TikTokCreatorInfoAdapter;
  readonly cacheTtlSeconds?: number;
};

export class TikTokCreatorPreflightService {
  private readonly cacheTtlSeconds;

  public constructor(private readonly input: TikTokCreatorPreflightServiceInput) {
    this.cacheTtlSeconds = input.cacheTtlSeconds ?? 300;
  }

  public async runPreflight(input: {
    readonly seriesId: string;
    readonly locale: string;
    readonly targetProfile: MicrodramaPublicationTargetProfile;
    readonly checkedAt: string;
  }): Promise<TikTokCreatorPreflightResult> {
    const resolution = resolveTikTokLocaleTarget({
      seriesId: input.seriesId,
      locale: input.locale,
      targetProfile: input.targetProfile,
      resolvedAt: input.checkedAt,
    });

    const cacheKey = creatorInfoCacheKey({
      providerAccountId: resolution.targetProfile.providerAccountId,
      credentialVersion: resolution.targetProfile.credentialVersion,
    });
    const cached = this.input.cache.get(cacheKey);
    let creatorInfo: TikTokCreatorInfoSnapshot;
    let cacheHit = false;

    if (cached && isCreatorInfoCacheFresh(cached, input.checkedAt)) {
      creatorInfo = cached.snapshot;
      cacheHit = true;
    } else {
      creatorInfo = await this.input.adapter.fetchCreatorInfo({
        providerAccountId: resolution.targetProfile.providerAccountId,
        credentialVersion: resolution.targetProfile.credentialVersion,
        accountFence: resolution.accountFence,
        fetchedAt: input.checkedAt,
      });
      if (creatorInfo.providerAccountId !== resolution.targetProfile.providerAccountId) {
        throw new Error("Creator info account mismatch violates account fence.");
      }
      this.input.cache.put(
        buildCreatorInfoCacheRecord({
          providerAccountId: resolution.targetProfile.providerAccountId,
          credentialVersion: resolution.targetProfile.credentialVersion,
          snapshot: creatorInfo,
          ttlSeconds: this.cacheTtlSeconds,
          recordedAt: input.checkedAt,
        })
      );
    }

    assertCreatorCapabilityAllowsDirectPost(creatorInfo);

    return validateTikTokCreatorPreflightResult({
      schemaVersion: "mediaforge.tiktok-creator-preflight.v1",
      resolution,
      creatorInfo,
      cacheHit,
      checkedAt: input.checkedAt,
    });
  }
}
