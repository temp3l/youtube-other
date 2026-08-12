import {
  type MicrodramaPublicationIdempotencyRecord,
  type TikTokDirectPostEffectRecord,
} from "@mediaforge/domain";

import { type TikTokDirectPostPersistencePort } from "./tiktok-direct-post-service.js";

export class InMemoryTikTokDirectPostPersistence implements TikTokDirectPostPersistencePort {
  private readonly effectsByIdempotency = new Map<string, TikTokDirectPostEffectRecord>();
  private readonly idempotencyRecords = new Map<string, MicrodramaPublicationIdempotencyRecord>();

  public getEffectByIdempotencyKey(
    idempotencyKey: string
  ): TikTokDirectPostEffectRecord | null {
    return this.effectsByIdempotency.get(idempotencyKey) ?? null;
  }

  public saveEffect(input: {
    readonly effect: TikTokDirectPostEffectRecord;
  }): TikTokDirectPostEffectRecord {
    this.effectsByIdempotency.set(input.effect.idempotencyKey, input.effect);
    return input.effect;
  }

  public getIdempotencyRecord(
    idempotencyKey: string
  ): MicrodramaPublicationIdempotencyRecord | null {
    return this.idempotencyRecords.get(idempotencyKey) ?? null;
  }

  public saveIdempotencyRecord(input: {
    readonly record: MicrodramaPublicationIdempotencyRecord;
  }): MicrodramaPublicationIdempotencyRecord {
    this.idempotencyRecords.set(input.record.idempotencyKey, input.record);
    return input.record;
  }
}
