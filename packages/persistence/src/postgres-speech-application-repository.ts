import crypto from "node:crypto";
import type {
  PostgresClient,
  PostgresPool,
} from "./postgres-workflow-repository.js";

export type PersistedSpeechProvider = "openai" | "elevenlabs";
export type PersistedSpeechState =
  | "queued"
  | "preflight"
  | "generating"
  | "post_processing"
  | "succeeded"
  | "retryable_failure"
  | "blocked_quota"
  | "blocked_configuration"
  | "blocked_consent"
  | "failed_permanent"
  | "cancelled";

export interface PersistedSpeechArtifact {
  readonly artifactId: string;
  readonly sha256: string;
  readonly contentType: string;
  readonly chunkIndex?: number;
}

export interface PersistedSpeechProfileVersion {
  readonly profileId: string;
  readonly profileVersionId: string;
  readonly profileKey: string;
  readonly version: number;
  readonly language: string;
  readonly provider: PersistedSpeechProvider;
  readonly configuration: unknown;
  readonly status: "DRAFT" | "ACTIVE" | "DEPRECATED";
  readonly revision: number;
  readonly consentRecordId?: string;
}

export interface PersistedSpeechGeneration {
  readonly generationId: string;
  readonly revision: number;
  readonly state: PersistedSpeechState;
  readonly profile: PersistedSpeechProfileVersion;
  readonly cacheKey: string;
  readonly cacheHit: boolean;
  readonly rawArtifacts: readonly PersistedSpeechArtifact[];
  readonly masterArtifact?: PersistedSpeechArtifact;
  readonly estimateCharacters: number;
  readonly estimateCredits?: number;
  readonly actualCharacters: number;
  readonly actualCredits?: number;
  readonly failureCode?: string;
  readonly videoId?: string;
  readonly genreId?: string;
  readonly channel: string;
  readonly language: string;
  readonly textSha256?: string;
}

export type PersistedSpeechClaim =
  | { readonly kind: "owner" }
  | { readonly kind: "wait" }
  | { readonly kind: "hit"; readonly sourceGenerationId: string }
  | { readonly kind: "replay"; readonly generationId: string };

export class SpeechIdempotencyConflictError extends Error {}
export class SpeechOptimisticConcurrencyError extends Error {}
export class SpeechQuotaLimitError extends Error {}
export class SpeechFencingError extends Error {}

interface QueryResult<T> {
  readonly rows: T[];
  readonly rowCount?: number | null;
}

function upperStatus(value: string): "DRAFT" | "ACTIVE" | "DEPRECATED" {
  if (value === "draft") return "DRAFT";
  if (value === "active") return "ACTIVE";
  return "DEPRECATED";
}

function numeric(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
}

/** Transactional application repository. Every public operation establishes RLS workspace scope. */
export class PostgresSpeechApplicationRepository {
  public constructor(private readonly pool: PostgresPool) {}

  private async transaction<T>(
    workspaceId: string,
    work: (client: PostgresClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [
        workspaceId,
      ]);
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public listProfiles(workspaceId: string): Promise<
    readonly {
      readonly profileId: string;
      readonly key: string;
      readonly displayName: string;
      readonly status: "DRAFT" | "ACTIVE" | "DEPRECATED";
      readonly consentStatus:
        | "not_required"
        | "valid"
        | "missing"
        | "expired"
        | "revoked";
      readonly activeVersionId?: string;
      readonly revision: number;
    }[]
  > {
    return this.transaction(workspaceId, async (client) => {
      const result = await client.query<{
        voice_profile_id: string;
        profile_key: string;
        display_name: string;
        status: string;
        revision: string | number;
        consent_record_id: string | null;
        consent_valid_until: string | null;
        consent_revoked_at: string | null;
        synthetic_speech_allowed: boolean | null;
        active_version_id: string | null;
      }>(
        `SELECT p.voice_profile_id,p.profile_key,p.display_name,p.status,p.revision,p.consent_record_id,
        c.valid_until AS consent_valid_until,c.revoked_at AS consent_revoked_at,c.synthetic_speech_allowed,
        (SELECT v.voice_profile_version_id FROM voice_profile_versions v WHERE v.workspace_id=p.workspace_id AND v.voice_profile_id=p.voice_profile_id AND v.status='active' ORDER BY v.version DESC LIMIT 1) AS active_version_id
        FROM voice_profiles p LEFT JOIN voice_consent_records c ON c.workspace_id=p.workspace_id AND c.consent_record_id=p.consent_record_id
        WHERE p.workspace_id=$1 ORDER BY p.profile_key`,
        [workspaceId]
      );
      const now = Date.now();
      return result.rows.map((row) => ({
        profileId: row.voice_profile_id,
        key: row.profile_key,
        displayName: row.display_name,
        status: upperStatus(row.status),
        consentStatus:
          row.consent_record_id === null
            ? "not_required"
            : row.synthetic_speech_allowed !== true
              ? "missing"
              : row.consent_revoked_at
                ? "revoked"
                : row.consent_valid_until &&
                    Date.parse(row.consent_valid_until) <= now
                  ? "expired"
                  : "valid",
        ...(row.active_version_id
          ? { activeVersionId: row.active_version_id }
          : {}),
        revision: Number(row.revision),
      }));
    });
  }

  public async createProfile(input: {
    readonly workspaceId: string;
    readonly profileId: string;
    readonly key: string;
    readonly displayName: string;
    readonly consentRecordId?: string;
    readonly now: string;
  }): Promise<
    Awaited<
      ReturnType<PostgresSpeechApplicationRepository["listProfiles"]>
    >[number]
  > {
    await this.transaction(input.workspaceId, async (client) => {
      await client.query(
        `INSERT INTO voice_profiles
        (workspace_id,voice_profile_id,profile_key,display_name,consent_record_id,status,revision,created_at)
        VALUES ($1,$2,$3,$4,$5,'draft',0,$6::timestamptz)`,
        [
          input.workspaceId,
          input.profileId,
          input.key,
          input.displayName,
          input.consentRecordId ?? null,
          input.now,
        ]
      );
    });
    const profiles = await this.listProfiles(input.workspaceId);
    return profiles.find((profile) => profile.profileId === input.profileId)!;
  }

  public createProfileVersion(input: {
    readonly workspaceId: string;
    readonly profileId: string;
    readonly profileVersionId: string;
    readonly language: string;
    readonly provider: PersistedSpeechProvider;
    readonly configuration: unknown;
    readonly now: string;
  }): Promise<PersistedSpeechProfileVersion> {
    return this.transaction(input.workspaceId, async (client) => {
      const profile = await client.query<{
        profile_key: string;
        status: string;
      }>(
        "SELECT profile_key,status FROM voice_profiles WHERE workspace_id=$1 AND voice_profile_id=$2 FOR UPDATE",
        [input.workspaceId, input.profileId]
      );
      if (!profile.rows[0]) throw new Error("Speech profile was not found.");
      if (profile.rows[0].status === "deprecated")
        throw new Error("A deprecated speech profile cannot receive versions.");
      const next = await client.query<{ version: string | number }>(
        "SELECT COALESCE(MAX(version),0)+1 AS version FROM voice_profile_versions WHERE workspace_id=$1 AND voice_profile_id=$2",
        [input.workspaceId, input.profileId]
      );
      const version = Number(next.rows[0]?.version ?? 1);
      await client.query(
        `INSERT INTO voice_profile_versions
        (workspace_id,voice_profile_version_id,voice_profile_id,version,language,provider,configuration_json,status,revision,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'draft',0,$8::timestamptz)`,
        [
          input.workspaceId,
          input.profileVersionId,
          input.profileId,
          version,
          input.language,
          input.provider,
          JSON.stringify(input.configuration),
          input.now,
        ]
      );
      return {
        profileId: input.profileId,
        profileVersionId: input.profileVersionId,
        profileKey: profile.rows[0].profile_key,
        version,
        language: input.language,
        provider: input.provider,
        configuration: input.configuration,
        status: "DRAFT",
        revision: 0,
      };
    });
  }

  public getProfileVersion(
    workspaceId: string,
    versionId: string
  ): Promise<PersistedSpeechProfileVersion | null> {
    return this.transaction(workspaceId, async (client) => {
      const result = await client.query<{
        voice_profile_id: string;
        voice_profile_version_id: string;
        profile_key: string;
        version: string | number;
        language: string;
        provider: PersistedSpeechProvider;
        configuration_json: unknown;
        status: string;
        revision: string | number;
        consent_record_id: string | null;
      }>(
        `SELECT v.voice_profile_id,v.voice_profile_version_id,p.profile_key,v.version,v.language,v.provider,
        v.configuration_json,v.status,v.revision,p.consent_record_id FROM voice_profile_versions v
        JOIN voice_profiles p ON p.workspace_id=v.workspace_id AND p.voice_profile_id=v.voice_profile_id
        WHERE v.workspace_id=$1 AND v.voice_profile_version_id=$2`,
        [workspaceId, versionId]
      );
      const row = result.rows[0];
      return row
        ? {
            profileId: row.voice_profile_id,
            profileVersionId: row.voice_profile_version_id,
            profileKey: row.profile_key,
            version: Number(row.version),
            language: row.language,
            provider: row.provider,
            configuration: row.configuration_json,
            status: upperStatus(row.status),
            revision: Number(row.revision),
            ...(row.consent_record_id
              ? { consentRecordId: row.consent_record_id }
              : {}),
          }
        : null;
    });
  }

  public getConsentForVersion(
    workspaceId: string,
    versionId: string
  ): Promise<{
    readonly consentRecordId: string;
    readonly subjectName: string;
    readonly evidenceArtifactId: string;
    readonly evidenceSha256: string;
    readonly syntheticSpeechAllowed: boolean;
    readonly commercialUseAllowed: boolean;
    readonly multilingualUseAllowed: boolean;
    readonly permittedChannels: readonly string[];
    readonly validFrom: string;
    readonly validUntil?: string;
    readonly revokedAt?: string;
  } | null> {
    return this.transaction(workspaceId, async (client) => {
      const result = await client.query<{
        consent_record_id: string;
        subject_name: string;
        evidence_artifact_id: string;
        evidence_sha256: string;
        synthetic_speech_allowed: boolean;
        commercial_use_allowed: boolean;
        multilingual_use_allowed: boolean;
        permitted_channels: unknown;
        valid_from: string;
        valid_until: string | null;
        revoked_at: string | null;
      }>(
        `SELECT c.* FROM voice_profile_versions v JOIN voice_profiles p ON p.workspace_id=v.workspace_id AND p.voice_profile_id=v.voice_profile_id
        JOIN voice_consent_records c ON c.workspace_id=p.workspace_id AND c.consent_record_id=p.consent_record_id
        WHERE v.workspace_id=$1 AND v.voice_profile_version_id=$2`,
        [workspaceId, versionId]
      );
      const row = result.rows[0];
      return row
        ? {
            consentRecordId: row.consent_record_id,
            subjectName: row.subject_name,
            evidenceArtifactId: row.evidence_artifact_id,
            evidenceSha256: row.evidence_sha256,
            syntheticSpeechAllowed: row.synthetic_speech_allowed,
            commercialUseAllowed: row.commercial_use_allowed,
            multilingualUseAllowed: row.multilingual_use_allowed,
            permittedChannels: Array.isArray(row.permitted_channels)
              ? row.permitted_channels.filter(
                  (item): item is string => typeof item === "string"
                )
              : [],
            validFrom: row.valid_from,
            ...(row.valid_until ? { validUntil: row.valid_until } : {}),
            ...(row.revoked_at ? { revokedAt: row.revoked_at } : {}),
          }
        : null;
    });
  }

  public listeningTestApproved(
    workspaceId: string,
    versionId: string
  ): Promise<boolean> {
    return this.transaction(workspaceId, async (client) => {
      const result = await client.query(
        "SELECT 1 FROM speech_listening_test_approvals WHERE workspace_id=$1 AND voice_profile_version_id=$2",
        [workspaceId, versionId]
      );
      return (result.rowCount ?? result.rows.length) > 0;
    });
  }

  public dispatchEnabled(workspaceId: string): Promise<boolean> {
    return this.transaction(workspaceId, async (client) => {
      const result = await client.query<{ enabled: boolean }>(
        "SELECT enabled FROM speech_dispatch_controls WHERE workspace_id=$1",
        [workspaceId]
      );
      return result.rows[0]?.enabled ?? true;
    });
  }

  public setDispatchEnabled(input: {
    readonly workspaceId: string;
    readonly enabled: boolean;
    readonly actorId: string;
    readonly requestId: string;
    readonly now: string;
  }): Promise<void> {
    return this.transaction(input.workspaceId, async (client) => {
      await client.query(
        `INSERT INTO speech_dispatch_controls (workspace_id,enabled,revision,updated_at,updated_by)
        VALUES ($1,$2,1,$3::timestamptz,$4) ON CONFLICT (workspace_id) DO UPDATE SET enabled=EXCLUDED.enabled,
        revision=speech_dispatch_controls.revision+1,updated_at=EXCLUDED.updated_at,updated_by=EXCLUDED.updated_by`,
        [input.workspaceId, input.enabled, input.now, input.actorId]
      );
      await this.audit(client, {
        ...input,
        action: input.enabled ? "dispatch.enable" : "dispatch.rollback_disable",
        subjectId: "speech-dispatch",
      });
    });
  }

  public activateProfileVersion(input: {
    readonly workspaceId: string;
    readonly versionId: string;
    readonly expectedRevision: number;
    readonly actorId: string;
    readonly requestId: string;
    readonly now: string;
  }): Promise<void> {
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query(
        `UPDATE voice_profile_versions SET status='active',activated_at=$1::timestamptz,
        revision=revision+1 WHERE workspace_id=$2 AND voice_profile_version_id=$3 AND status='draft' AND revision=$4`,
        [input.now, input.workspaceId, input.versionId, input.expectedRevision]
      );
      if ((result.rowCount ?? 0) !== 1)
        throw new SpeechOptimisticConcurrencyError(
          "Speech profile version revision did not match."
        );
      await client.query(
        `UPDATE voice_profiles p SET status='active',revision=revision+1 WHERE p.workspace_id=$1 AND EXISTS
        (SELECT 1 FROM voice_profile_versions v WHERE v.workspace_id=p.workspace_id AND v.voice_profile_id=p.voice_profile_id AND v.voice_profile_version_id=$2)`,
        [input.workspaceId, input.versionId]
      );
      await this.audit(client, {
        ...input,
        action: "profile.activate",
        subjectId: input.versionId,
      });
    });
  }

  public deprecateProfileVersion(input: {
    readonly workspaceId: string;
    readonly versionId: string;
    readonly expectedRevision: number;
    readonly actorId: string;
    readonly requestId: string;
    readonly now: string;
  }): Promise<void> {
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query(
        `UPDATE voice_profile_versions SET status='deprecated',deprecated_at=$1::timestamptz,revision=revision+1
        WHERE workspace_id=$2 AND voice_profile_version_id=$3 AND status IN ('draft','active') AND revision=$4`,
        [input.now, input.workspaceId, input.versionId, input.expectedRevision]
      );
      if ((result.rowCount ?? 0) !== 1)
        throw new SpeechOptimisticConcurrencyError(
          "Speech profile version revision did not match."
        );
      await this.audit(client, {
        ...input,
        action: "profile.deprecate",
        subjectId: input.versionId,
      });
    });
  }

  public setGenrePolicy(input: {
    readonly workspaceId: string;
    readonly genreId: string;
    readonly profileVersionId: string;
    readonly expectedRevision: number;
    readonly actorId: string;
    readonly requestId: string;
    readonly now: string;
  }): Promise<number> {
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query<{ revision: string | number }>(
        `INSERT INTO genre_speech_policies
        (workspace_id,genre_id,default_voice_profile_version_id,revision,created_at,updated_at)
        SELECT $1,$2,$3,1,$5::timestamptz,$5::timestamptz WHERE $4=0
        ON CONFLICT (workspace_id,genre_id) DO UPDATE SET default_voice_profile_version_id=EXCLUDED.default_voice_profile_version_id,
        revision=genre_speech_policies.revision+1,updated_at=EXCLUDED.updated_at WHERE genre_speech_policies.revision=$4
        RETURNING revision`,
        [
          input.workspaceId,
          input.genreId,
          input.profileVersionId,
          input.expectedRevision,
          input.now,
        ]
      );
      const revision = result.rows[0]?.revision;
      if (revision === undefined)
        throw new SpeechOptimisticConcurrencyError(
          "Genre speech policy revision did not match."
        );
      await this.audit(client, {
        ...input,
        action: "policy.genre.override",
        subjectId: input.genreId,
      });
      return Number(revision);
    });
  }

  public setVideoOverride(input: {
    readonly workspaceId: string;
    readonly videoId: string;
    readonly profileVersionId?: string;
    readonly expectedRevision: number;
    readonly actorId: string;
    readonly requestId: string;
    readonly now: string;
  }): Promise<number> {
    return this.transaction(input.workspaceId, async (client) => {
      if (!input.profileVersionId) {
        const deleted = await client.query(
          `DELETE FROM video_speech_overrides WHERE workspace_id=$1 AND video_id=$2 AND revision=$3`,
          [input.workspaceId, input.videoId, input.expectedRevision]
        );
        if (input.expectedRevision !== 0 && (deleted.rowCount ?? 0) !== 1)
          throw new SpeechOptimisticConcurrencyError(
            "Video speech override revision did not match."
          );
        await this.audit(client, {
          ...input,
          action: "policy.video.clear",
          subjectId: input.videoId,
        });
        return 0;
      }
      const result = await client.query<{ revision: string | number }>(
        `INSERT INTO video_speech_overrides
        (workspace_id,video_id,voice_profile_version_id,revision,created_at,updated_at)
        SELECT $1,$2,$3,1,$5::timestamptz,$5::timestamptz WHERE $4=0
        ON CONFLICT (workspace_id,video_id) DO UPDATE SET voice_profile_version_id=EXCLUDED.voice_profile_version_id,
        revision=video_speech_overrides.revision+1,updated_at=EXCLUDED.updated_at WHERE video_speech_overrides.revision=$4
        RETURNING revision`,
        [
          input.workspaceId,
          input.videoId,
          input.profileVersionId,
          input.expectedRevision,
          input.now,
        ]
      );
      const revision = result.rows[0]?.revision;
      if (revision === undefined)
        throw new SpeechOptimisticConcurrencyError(
          "Video speech override revision did not match."
        );
      await this.audit(client, {
        ...input,
        action: "policy.video.override",
        subjectId: input.videoId,
      });
      return Number(revision);
    });
  }

  public resolveProfile(input: {
    readonly workspaceId: string;
    readonly videoId?: string;
    readonly genreId?: string;
    readonly replacementProfileVersionId?: string;
    readonly systemProfileVersionId: string;
    readonly allowInactiveReplacement?: boolean;
  }): Promise<PersistedSpeechProfileVersion | null> {
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query<{ voice_profile_version_id: string }>(
        `WITH selected AS (
        SELECT $5::text AS voice_profile_version_id,0 AS precedence WHERE $5::text IS NOT NULL
        UNION ALL SELECT voice_profile_version_id,1 FROM video_speech_overrides WHERE workspace_id=$1 AND video_id=$2
        UNION ALL SELECT default_voice_profile_version_id,2 FROM genre_speech_policies WHERE workspace_id=$1 AND genre_id=$3
        UNION ALL SELECT $4,3) SELECT voice_profile_version_id FROM selected s WHERE EXISTS
        (SELECT 1 FROM voice_profile_versions v WHERE v.workspace_id=$1 AND v.voice_profile_version_id=s.voice_profile_version_id
          AND (v.status='active' OR (s.precedence=0 AND $6::boolean)))
        ORDER BY precedence LIMIT 1`,
        [
          input.workspaceId,
          input.videoId ?? null,
          input.genreId ?? null,
          input.systemProfileVersionId,
          input.replacementProfileVersionId ?? null,
          input.allowInactiveReplacement ?? false,
        ]
      );
      const versionId = result.rows[0]?.voice_profile_version_id;
      if (!versionId) return null;
      const detail = await client.query<{
        voice_profile_id: string;
        voice_profile_version_id: string;
        profile_key: string;
        version: string | number;
        language: string;
        provider: PersistedSpeechProvider;
        configuration_json: unknown;
        status: string;
        revision: string | number;
        consent_record_id: string | null;
      }>(
        `SELECT v.voice_profile_id,v.voice_profile_version_id,p.profile_key,v.version,v.language,v.provider,v.configuration_json,
        v.status,v.revision,p.consent_record_id FROM voice_profile_versions v JOIN voice_profiles p ON p.workspace_id=v.workspace_id
        AND p.voice_profile_id=v.voice_profile_id WHERE v.workspace_id=$1 AND v.voice_profile_version_id=$2`,
        [input.workspaceId, versionId]
      );
      const row = detail.rows[0]!;
      return {
        profileId: row.voice_profile_id,
        profileVersionId: row.voice_profile_version_id,
        profileKey: row.profile_key,
        version: Number(row.version),
        language: row.language,
        provider: row.provider,
        configuration: row.configuration_json,
        status: upperStatus(row.status),
        revision: Number(row.revision),
        ...(row.consent_record_id
          ? { consentRecordId: row.consent_record_id }
          : {}),
      };
    });
  }

  public claimGeneration(input: {
    readonly workspaceId: string;
    readonly generationId: string;
    readonly profileVersionId: string;
    readonly cacheKey: string;
    readonly cacheInputVersion: string;
    readonly requestFingerprint: string;
    readonly textSha256: string;
    readonly channel: string;
    readonly language: string;
    readonly workerId: string;
    readonly leaseSeconds: number;
    readonly forceRegeneration: boolean;
    readonly now: string;
    readonly videoId?: string;
    readonly genreId?: string;
    readonly idempotencyKey?: string;
    readonly supersedesGenerationId?: string;
  }): Promise<PersistedSpeechClaim> {
    return this.transaction(input.workspaceId, async (client) => {
      if (input.idempotencyKey) {
        const existing = await client.query<{
          generation_id: string;
          request_fingerprint: string | null;
        }>(
          "SELECT generation_id,request_fingerprint FROM speech_generations WHERE workspace_id=$1 AND idempotency_key=$2 FOR UPDATE",
          [input.workspaceId, input.idempotencyKey]
        );
        if (existing.rows[0]) {
          if (existing.rows[0].request_fingerprint !== input.requestFingerprint)
            throw new SpeechIdempotencyConflictError(
              "The speech idempotency key was already used with a different request."
            );
          return {
            kind: "replay",
            generationId: existing.rows[0].generation_id,
          };
        }
      }
      let claim: PersistedSpeechClaim;
      let fence = 0;
      let leaseOwner: string | null = null;
      let leaseExpires: string | null = null;
      if (input.forceRegeneration) {
        claim = { kind: "owner" };
        fence = 1;
        leaseOwner = input.workerId;
        leaseExpires = input.now;
      } else {
        await client.query(
          `INSERT INTO speech_cache_entries
          (workspace_id,cache_key,cache_input_version,lease_fence,created_at,updated_at)
          VALUES ($1,$2,$3,0,$4::timestamptz,$4::timestamptz) ON CONFLICT DO NOTHING`,
          [
            input.workspaceId,
            input.cacheKey,
            input.cacheInputVersion,
            input.now,
          ]
        );
        const cache = await client.query<{
          authoritative_generation_id: string | null;
          lease_owner: string | null;
          lease_fence: string | number;
          lease_expires_at: string | null;
        }>(
          "SELECT authoritative_generation_id,lease_owner,lease_fence,lease_expires_at FROM speech_cache_entries WHERE workspace_id=$1 AND cache_key=$2 FOR UPDATE",
          [input.workspaceId, input.cacheKey]
        );
        const row = cache.rows[0]!;
        if (row.authoritative_generation_id) {
          claim = {
            kind: "hit",
            sourceGenerationId: row.authoritative_generation_id,
          };
        } else if (
          !row.lease_owner ||
          !row.lease_expires_at ||
          Date.parse(row.lease_expires_at) <= Date.parse(input.now)
        ) {
          fence = Number(row.lease_fence) + 1;
          leaseOwner = input.workerId;
          leaseExpires = input.now;
          await client.query(
            `UPDATE speech_cache_entries SET lease_owner=$1,lease_fence=$2,
            lease_expires_at=$3::timestamptz + ($4::text || ' seconds')::interval,updated_at=$3::timestamptz
            WHERE workspace_id=$5 AND cache_key=$6`,
            [
              input.workerId,
              fence,
              input.now,
              input.leaseSeconds,
              input.workspaceId,
              input.cacheKey,
            ]
          );
          claim = { kind: "owner" };
        } else claim = { kind: "wait" };
      }
      await client.query(
        `INSERT INTO speech_generations
        (workspace_id,generation_id,video_id,genre_id,voice_profile_version_id,cache_key,cache_input_version,state,
         idempotency_key,request_fingerprint,supersedes_generation_id,cache_hit,lease_owner,lease_fence,lease_expires_at,
         channel,language,text_sha256,force_regeneration,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'queued',$8,$9,$10,FALSE,$11,$12,
          CASE WHEN $11::text IS NULL THEN NULL ELSE $13::timestamptz + ($14::text || ' seconds')::interval END,
          $15,$16,$17,$18,$13::timestamptz,$13::timestamptz)`,
        [
          input.workspaceId,
          input.generationId,
          input.videoId ?? null,
          input.genreId ?? null,
          input.profileVersionId,
          input.cacheKey,
          input.cacheInputVersion,
          input.idempotencyKey ?? null,
          input.requestFingerprint,
          input.supersedesGenerationId ?? null,
          leaseOwner,
          fence,
          input.now,
          input.leaseSeconds,
          input.channel,
          input.language,
          input.textSha256,
          input.forceRegeneration,
        ]
      );
      return claim;
    });
  }

  public renewLease(input: {
    readonly workspaceId: string;
    readonly generationId: string;
    readonly leaseSeconds: number;
    readonly now: string;
  }): Promise<void> {
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query(
        `UPDATE speech_generations g SET lease_expires_at=$1::timestamptz + ($2::text || ' seconds')::interval,
        updated_at=$1::timestamptz WHERE g.workspace_id=$3 AND g.generation_id=$4 AND g.lease_owner IS NOT NULL AND
        (g.force_regeneration OR EXISTS (SELECT 1 FROM speech_cache_entries c WHERE c.workspace_id=g.workspace_id AND c.cache_key=g.cache_key
          AND c.lease_owner=g.lease_owner AND c.lease_fence=g.lease_fence AND c.authoritative_generation_id IS NULL))`,
        [input.now, input.leaseSeconds, input.workspaceId, input.generationId]
      );
      if ((result.rowCount ?? 0) !== 1)
        throw new SpeechFencingError("Speech generation lease was lost.");
      await client.query(
        `UPDATE speech_cache_entries c SET lease_expires_at=$1::timestamptz + ($2::text || ' seconds')::interval,
        updated_at=$1::timestamptz FROM speech_generations g WHERE g.workspace_id=$3 AND g.generation_id=$4 AND NOT g.force_regeneration
        AND c.workspace_id=g.workspace_id AND c.cache_key=g.cache_key AND c.lease_owner=g.lease_owner AND c.lease_fence=g.lease_fence`,
        [input.now, input.leaseSeconds, input.workspaceId, input.generationId]
      );
    });
  }

  public cacheStatus(input: {
    readonly workspaceId: string;
    readonly cacheKey: string;
  }): Promise<{
    readonly authoritativeGenerationId?: string;
    readonly leaseExpiresAt?: string;
  } | null> {
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query<{
        authoritative_generation_id: string | null;
        lease_expires_at: string | null;
      }>(
        "SELECT authoritative_generation_id,lease_expires_at FROM speech_cache_entries WHERE workspace_id=$1 AND cache_key=$2",
        [input.workspaceId, input.cacheKey]
      );
      const row = result.rows[0];
      return row
        ? {
            ...(row.authoritative_generation_id
              ? { authoritativeGenerationId: row.authoritative_generation_id }
              : {}),
            ...(row.lease_expires_at
              ? { leaseExpiresAt: row.lease_expires_at }
              : {}),
          }
        : null;
    });
  }

  public reclaimWaitingGeneration(input: {
    readonly workspaceId: string;
    readonly generationId: string;
    readonly cacheKey: string;
    readonly workerId: string;
    readonly leaseSeconds: number;
    readonly now: string;
  }): Promise<boolean> {
    return this.transaction(input.workspaceId, async (client) => {
      const cache = await client.query<{
        lease_fence: string | number;
        authoritative_generation_id: string | null;
        lease_expires_at: string | null;
      }>(
        "SELECT lease_fence,authoritative_generation_id,lease_expires_at FROM speech_cache_entries WHERE workspace_id=$1 AND cache_key=$2 FOR UPDATE",
        [input.workspaceId, input.cacheKey]
      );
      const row = cache.rows[0];
      if (
        !row ||
        row.authoritative_generation_id ||
        !row.lease_expires_at ||
        Date.parse(row.lease_expires_at) > Date.parse(input.now)
      )
        return false;
      const fence = Number(row.lease_fence) + 1;
      await client.query(
        `UPDATE speech_cache_entries SET lease_owner=$1,lease_fence=$2,
        lease_expires_at=$3::timestamptz+($4::text||' seconds')::interval,updated_at=$3::timestamptz
        WHERE workspace_id=$5 AND cache_key=$6`,
        [
          input.workerId,
          fence,
          input.now,
          input.leaseSeconds,
          input.workspaceId,
          input.cacheKey,
        ]
      );
      const generation = await client.query(
        `UPDATE speech_generations SET lease_owner=$1,lease_fence=$2,
        lease_expires_at=$3::timestamptz+($4::text||' seconds')::interval,updated_at=$3::timestamptz
        WHERE workspace_id=$5 AND generation_id=$6 AND state='queued'`,
        [
          input.workerId,
          fence,
          input.now,
          input.leaseSeconds,
          input.workspaceId,
          input.generationId,
        ]
      );
      return (generation.rowCount ?? 0) === 1;
    });
  }

  public transition(input: {
    readonly workspaceId: string;
    readonly generationId: string;
    readonly from: PersistedSpeechState;
    readonly to: PersistedSpeechState;
    readonly now: string;
    readonly failureCode?: string;
  }): Promise<void> {
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query(
        `UPDATE speech_generations SET state=$1,failure_code=$2,updated_at=$3::timestamptz,
        started_at=CASE WHEN $1='generating' THEN COALESCE(started_at,$3::timestamptz) ELSE started_at END,
        completed_at=CASE WHEN $1 IN ('succeeded','blocked_quota','blocked_configuration','blocked_consent','failed_permanent','cancelled') THEN $3::timestamptz ELSE completed_at END
        WHERE workspace_id=$4 AND generation_id=$5 AND state=$6`,
        [
          input.to,
          input.failureCode ?? null,
          input.now,
          input.workspaceId,
          input.generationId,
          input.from,
        ]
      );
      if ((result.rowCount ?? 0) !== 1)
        throw new Error(
          `Speech generation transition ${input.from} -> ${input.to} was rejected.`
        );
      await client.query(
        `INSERT INTO speech_generation_transitions
        (workspace_id,generation_id,from_state,to_state,failure_code,occurred_at) VALUES ($1,$2,$3,$4,$5,$6::timestamptz)`,
        [
          input.workspaceId,
          input.generationId,
          input.from,
          input.to,
          input.failureCode ?? null,
          input.now,
        ]
      );
    });
  }

  public recordChunk(input: {
    readonly workspaceId: string;
    readonly generationId: string;
    readonly chunkIndex: number;
    readonly attempt: number;
    readonly textSha256: string;
    readonly providerRequestId?: string;
    readonly artifact?: PersistedSpeechArtifact;
    readonly failureCode?: string;
    readonly now: string;
  }): Promise<void> {
    return this.transaction(input.workspaceId, async (client) => {
      if (input.artifact)
        await client.query(
          `INSERT INTO speech_artifacts
        (workspace_id,generation_id,artifact_id,kind,chunk_index,sha256,content_type,created_at)
        VALUES ($1,$2,$3,'raw',$4,$5,$6,$7::timestamptz) ON CONFLICT (workspace_id,artifact_id) DO NOTHING`,
          [
            input.workspaceId,
            input.generationId,
            input.artifact.artifactId,
            input.chunkIndex,
            input.artifact.sha256,
            input.artifact.contentType,
            input.now,
          ]
        );
      await client.query(
        `INSERT INTO speech_generation_chunk_attempts
        (workspace_id,generation_id,chunk_index,attempt,text_sha256,provider_request_id,state,raw_artifact_id,failure_code,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz)`,
        [
          input.workspaceId,
          input.generationId,
          input.chunkIndex,
          input.attempt,
          input.textSha256,
          input.providerRequestId ?? null,
          input.artifact ? "succeeded" : "failed",
          input.artifact?.artifactId ?? null,
          input.failureCode ?? null,
          input.now,
        ]
      );
    });
  }

  public reusableChunk(input: {
    readonly workspaceId: string;
    readonly generationId: string;
    readonly chunkIndex: number;
    readonly textSha256: string;
  }): Promise<PersistedSpeechArtifact | null> {
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query<{
        artifact_id: string;
        sha256: string;
        content_type: string;
      }>(
        `SELECT a.artifact_id,a.sha256,a.content_type
        FROM speech_generation_chunk_attempts attempt JOIN speech_artifacts a ON a.workspace_id=attempt.workspace_id AND a.artifact_id=attempt.raw_artifact_id
        WHERE attempt.workspace_id=$1 AND attempt.generation_id=$2 AND attempt.chunk_index=$3 AND attempt.text_sha256=$4 AND attempt.state='succeeded'
        ORDER BY attempt.attempt DESC LIMIT 1`,
        [
          input.workspaceId,
          input.generationId,
          input.chunkIndex,
          input.textSha256,
        ]
      );
      const row = result.rows[0];
      return row
        ? {
            artifactId: row.artifact_id,
            sha256: row.sha256,
            contentType: row.content_type,
            chunkIndex: input.chunkIndex,
          }
        : null;
    });
  }

  public completeGeneration(input: {
    readonly workspaceId: string;
    readonly generationId: string;
    readonly artifacts: readonly PersistedSpeechArtifact[];
    readonly master: PersistedSpeechArtifact;
    readonly estimateCharacters: number;
    readonly estimateCredits?: number;
    readonly actualCharacters: number;
    readonly actualCredits?: number;
    readonly now: string;
  }): Promise<void> {
    return this.transaction(input.workspaceId, async (client) => {
      for (const artifact of [...input.artifacts, input.master])
        await client.query(
          `INSERT INTO speech_artifacts
        (workspace_id,generation_id,artifact_id,kind,chunk_index,sha256,content_type,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz) ON CONFLICT (workspace_id,artifact_id) DO NOTHING`,
          [
            input.workspaceId,
            input.generationId,
            artifact.artifactId,
            artifact.chunkIndex === undefined ? "master" : "raw",
            artifact.chunkIndex ?? null,
            artifact.sha256,
            artifact.contentType,
            input.now,
          ]
        );
      const generation = await client.query<{
        cache_key: string;
        lease_owner: string | null;
        lease_fence: string | number;
        force_regeneration: boolean;
      }>(
        `UPDATE speech_generations SET raw_artifact_ids=$1::jsonb,master_artifact_id=$2,estimate_characters=$3,estimate_credits=$4,
        actual_characters=$5,actual_credits=$6,updated_at=$7::timestamptz WHERE workspace_id=$8 AND generation_id=$9
        RETURNING cache_key,lease_owner,lease_fence,force_regeneration`,
        [
          JSON.stringify(input.artifacts.map((item) => item.artifactId)),
          input.master.artifactId,
          input.estimateCharacters,
          input.estimateCredits ?? null,
          input.actualCharacters,
          input.actualCredits ?? null,
          input.now,
          input.workspaceId,
          input.generationId,
        ]
      );
      const row = generation.rows[0];
      if (!row)
        throw new Error("Speech generation was not found during completion.");
      if (!row.force_regeneration) {
        const published = await client.query(
          `UPDATE speech_cache_entries SET authoritative_generation_id=$1,
          authoritative_master_artifact_id=$2,lease_owner=NULL,lease_expires_at=NULL,updated_at=$3::timestamptz
          WHERE workspace_id=$4 AND cache_key=$5 AND lease_owner=$6 AND lease_fence=$7 AND authoritative_generation_id IS NULL`,
          [
            input.generationId,
            input.master.artifactId,
            input.now,
            input.workspaceId,
            row.cache_key,
            row.lease_owner,
            Number(row.lease_fence),
          ]
        );
        if ((published.rowCount ?? 0) !== 1)
          throw new SpeechFencingError(
            "A stale speech worker cannot publish artifacts."
          );
      }
    });
  }

  public recordCacheHit(input: {
    readonly workspaceId: string;
    readonly generationId: string;
    readonly sourceGenerationId: string;
    readonly now: string;
  }): Promise<void> {
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query(
        `UPDATE speech_generations target SET cache_hit=TRUE,estimate_characters=0,estimate_credits=0,
        actual_characters=0,actual_credits=0,raw_artifact_ids=source.raw_artifact_ids,master_artifact_id=source.master_artifact_id,
        updated_at=$1::timestamptz FROM speech_generations source WHERE target.workspace_id=$2 AND target.generation_id=$3
        AND source.workspace_id=target.workspace_id AND source.generation_id=$4 AND source.state='succeeded'`,
        [
          input.now,
          input.workspaceId,
          input.generationId,
          input.sourceGenerationId,
        ]
      );
      if ((result.rowCount ?? 0) !== 1)
        throw new Error(
          "Authoritative speech generation was unavailable for cache reuse."
        );
    });
  }

  public getGeneration(
    workspaceId: string,
    generationId: string
  ): Promise<PersistedSpeechGeneration | null> {
    return this.transaction(workspaceId, async (client) =>
      this.getGenerationWithClient(client, workspaceId, generationId)
    );
  }

  private async getGenerationWithClient(
    client: PostgresClient,
    workspaceId: string,
    generationId: string
  ): Promise<PersistedSpeechGeneration | null> {
    const result = await client.query<{
      generation_id: string;
      state: PersistedSpeechState;
      cache_key: string;
      cache_hit: boolean;
      failure_code: string | null;
      video_id: string | null;
      genre_id: string | null;
      channel: string;
      generation_language: string;
      text_sha256: string | null;
      estimate_characters: string | number | null;
      estimate_credits: string | number | null;
      actual_characters: string | number | null;
      actual_credits: string | number | null;
      voice_profile_id: string;
      voice_profile_version_id: string;
      profile_key: string;
      version: string | number;
      language: string;
      provider: PersistedSpeechProvider;
      configuration_json: unknown;
      profile_status: string;
      profile_revision: string | number;
      consent_record_id: string | null;
    }>(
      `SELECT g.generation_id,g.state,g.cache_key,g.cache_hit,g.failure_code,g.video_id,g.genre_id,g.channel,g.language AS generation_language,g.text_sha256,g.estimate_characters,g.estimate_credits,
      g.actual_characters,g.actual_credits,v.voice_profile_id,v.voice_profile_version_id,p.profile_key,v.version,v.language,
      v.provider,v.configuration_json,v.status AS profile_status,v.revision AS profile_revision,p.consent_record_id
      FROM speech_generations g JOIN voice_profile_versions v ON v.workspace_id=g.workspace_id AND v.voice_profile_version_id=g.voice_profile_version_id
      JOIN voice_profiles p ON p.workspace_id=v.workspace_id AND p.voice_profile_id=v.voice_profile_id
      WHERE g.workspace_id=$1 AND g.generation_id=$2`,
      [workspaceId, generationId]
    );
    const row = result.rows[0];
    if (!row) return null;
    const artifacts = await client.query<{
      artifact_id: string;
      kind: "raw" | "master";
      chunk_index: number | null;
      sha256: string;
      content_type: string;
    }>(
      `SELECT a.artifact_id,a.kind,a.chunk_index,a.sha256,a.content_type FROM speech_artifacts a
       JOIN speech_generations g ON g.workspace_id=a.workspace_id
       WHERE g.workspace_id=$1 AND g.generation_id=$2 AND
       (a.artifact_id=g.master_artifact_id OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(g.raw_artifact_ids) item WHERE item=a.artifact_id))
       ORDER BY a.kind DESC,a.chunk_index NULLS LAST`,
      [workspaceId, generationId]
    );
    const mapped = artifacts.rows.map((artifact) => ({
      artifactId: artifact.artifact_id,
      sha256: artifact.sha256,
      contentType: artifact.content_type,
      ...(artifact.chunk_index === null
        ? {}
        : { chunkIndex: artifact.chunk_index }),
    }));
    const masterIndex = artifacts.rows.findIndex(
      (artifact) => artifact.kind === "master"
    );
    const master = masterIndex >= 0 ? mapped[masterIndex] : undefined;
    const estimateCredits = numeric(row.estimate_credits);
    const actualCredits = numeric(row.actual_credits);
    return {
      generationId: row.generation_id,
      revision: this.revisionForState(row.state),
      state: row.state,
      cacheKey: row.cache_key,
      cacheHit: row.cache_hit,
      profile: {
        profileId: row.voice_profile_id,
        profileVersionId: row.voice_profile_version_id,
        profileKey: row.profile_key,
        version: Number(row.version),
        language: row.language,
        provider: row.provider,
        configuration: row.configuration_json,
        status: upperStatus(row.profile_status),
        revision: Number(row.profile_revision),
        ...(row.consent_record_id
          ? { consentRecordId: row.consent_record_id }
          : {}),
      },
      rawArtifacts: mapped.filter(
        (_, index) => artifacts.rows[index]?.kind === "raw"
      ),
      ...(master ? { masterArtifact: master } : {}),
      estimateCharacters: numeric(row.estimate_characters) ?? 0,
      ...(estimateCredits === undefined ? {} : { estimateCredits }),
      actualCharacters: numeric(row.actual_characters) ?? 0,
      ...(actualCredits === undefined ? {} : { actualCredits }),
      ...(row.failure_code ? { failureCode: row.failure_code } : {}),
      ...(row.video_id ? { videoId: row.video_id } : {}),
      ...(row.genre_id ? { genreId: row.genre_id } : {}),
      channel: row.channel,
      language: row.generation_language,
      ...(row.text_sha256 ? { textSha256: row.text_sha256 } : {}),
    };
  }

  public reserveQuota(input: {
    readonly workspaceId: string;
    readonly reservationId: string;
    readonly generationId: string;
    readonly provider: string;
    readonly genreId?: string;
    readonly characters: number;
    readonly now: string;
  }): Promise<number | undefined> {
    return this.transaction(input.workspaceId, async (client) => {
      const scopes: Array<readonly [string, string]> = [
        ["provider", input.provider],
      ];
      if (input.genreId) scopes.push(["genre", input.genreId]);
      let minimumRemaining: number | undefined;
      for (const [scopeType, scopeId] of scopes) {
        const policy = await client.query<{
          monthly_hard_limit_characters: string | number;
        }>(
          `SELECT monthly_hard_limit_characters FROM speech_quota_policies
          WHERE workspace_id=$1 AND scope_type=$2 AND scope_id=$3 FOR UPDATE`,
          [input.workspaceId, scopeType, scopeId]
        );
        if (!policy.rows[0]) continue;
        const used = await client.query<{ total: string | number }>(
          `SELECT COALESCE(SUM(CASE WHEN state='settled' THEN actual_characters ELSE reserved_characters END),0) AS total
          FROM speech_quota_reservation_scopes WHERE workspace_id=$1 AND scope_type=$2 AND scope_id=$3
          AND billing_period=date_trunc('month',$4::timestamptz)::date AND state IN ('reserved','settled')`,
          [input.workspaceId, scopeType, scopeId, input.now]
        );
        const remaining =
          Number(policy.rows[0].monthly_hard_limit_characters) -
          Number(used.rows[0]?.total ?? 0) -
          input.characters;
        if (remaining < 0)
          throw new SpeechQuotaLimitError(
            `Speech quota is exhausted for ${scopeType} ${scopeId}.`
          );
        minimumRemaining =
          minimumRemaining === undefined
            ? remaining
            : Math.min(minimumRemaining, remaining);
        await client.query(
          `INSERT INTO speech_quota_reservation_scopes
          (workspace_id,reservation_id,generation_id,scope_type,scope_id,billing_period,reserved_characters,state,created_at,updated_at)
          VALUES ($1,$2,$3,$4,$5,date_trunc('month',$6::timestamptz)::date,$7,'reserved',$6::timestamptz,$6::timestamptz)
          ON CONFLICT (workspace_id,generation_id,scope_type,scope_id) DO NOTHING`,
          [
            input.workspaceId,
            input.reservationId,
            input.generationId,
            scopeType,
            scopeId,
            input.now,
            input.characters,
          ]
        );
      }
      return minimumRemaining;
    });
  }

  public queueDepth(workspaceId: string): Promise<number> {
    return this.transaction(workspaceId, async (client) => {
      const result = await client.query<{ depth: string | number }>(
        "SELECT COUNT(*) AS depth FROM speech_generations WHERE workspace_id=$1 AND state IN ('queued','preflight','generating','post_processing')",
        [workspaceId]
      );
      return Number(result.rows[0]?.depth ?? 0);
    });
  }

  public quotaImpact(input: {
    readonly workspaceId: string;
    readonly provider: string;
    readonly genreId?: string;
    readonly characters: number;
    readonly now: string;
  }): Promise<{
    readonly allowed: boolean;
    readonly warning: boolean;
    readonly remainingCharacters?: number;
  }> {
    return this.transaction(input.workspaceId, async (client) => {
      const scopes: Array<readonly [string, string]> = [
        ["provider", input.provider],
      ];
      if (input.genreId) scopes.push(["genre", input.genreId]);
      let minimum: number | undefined;
      let warning = false;
      for (const [scopeType, scopeId] of scopes) {
        const policy = await client.query<{
          monthly_hard_limit_characters: string | number;
          warning_percent: string | number;
        }>(
          "SELECT monthly_hard_limit_characters,warning_percent FROM speech_quota_policies WHERE workspace_id=$1 AND scope_type=$2 AND scope_id=$3",
          [input.workspaceId, scopeType, scopeId]
        );
        if (!policy.rows[0]) continue;
        const used = await client.query<{ total: string | number }>(
          `SELECT COALESCE(SUM(CASE WHEN state='settled' THEN actual_characters ELSE reserved_characters END),0) AS total
          FROM speech_quota_reservation_scopes WHERE workspace_id=$1 AND scope_type=$2 AND scope_id=$3
          AND billing_period=date_trunc('month',$4::timestamptz)::date AND state IN ('reserved','settled')`,
          [input.workspaceId, scopeType, scopeId, input.now]
        );
        const limit = Number(policy.rows[0].monthly_hard_limit_characters);
        const consumed = Number(used.rows[0]?.total ?? 0);
        const remaining = Math.max(0, limit - consumed);
        minimum =
          minimum === undefined ? remaining : Math.min(minimum, remaining);
        warning ||=
          (consumed + input.characters) / limit >=
          Number(policy.rows[0].warning_percent) / 100;
      }
      return {
        allowed: minimum === undefined || input.characters <= minimum,
        warning,
        ...(minimum === undefined ? {} : { remainingCharacters: minimum }),
      };
    });
  }

  public settleQuota(input: {
    readonly workspaceId: string;
    readonly reservationId: string;
    readonly actualCharacters: number;
    readonly now: string;
  }): Promise<void> {
    return this.transaction(input.workspaceId, async (client) => {
      await client.query(
        `UPDATE speech_quota_reservation_scopes SET state='settled',actual_characters=$1,updated_at=$2::timestamptz
      WHERE workspace_id=$3 AND reservation_id=$4 AND state='reserved'`,
        [
          input.actualCharacters,
          input.now,
          input.workspaceId,
          input.reservationId,
        ]
      );
    });
  }
  public releaseQuota(input: {
    readonly workspaceId: string;
    readonly reservationId: string;
    readonly now: string;
  }): Promise<void> {
    return this.transaction(input.workspaceId, async (client) => {
      await client.query(
        `UPDATE speech_quota_reservation_scopes SET state='released',updated_at=$1::timestamptz
      WHERE workspace_id=$2 AND reservation_id=$3 AND state='reserved'`,
        [input.now, input.workspaceId, input.reservationId]
      );
    });
  }

  public recordUsage(input: {
    readonly workspaceId: string;
    readonly usageId: string;
    readonly generationId: string;
    readonly provider: string;
    readonly genreId?: string;
    readonly videoId?: string;
    readonly inputCharacters: number;
    readonly billableCharacters: number;
    readonly estimatedCredits?: number;
    readonly actualCredits?: number;
    readonly cacheHit: boolean;
    readonly providerRequestId?: string;
    readonly now: string;
  }): Promise<void> {
    return this.transaction(input.workspaceId, async (client) => {
      const pricingId = `system-${input.provider}-characters-v1`;
      await client.query(
        `INSERT INTO speech_pricing_versions (workspace_id,pricing_version_id,provider,pricing_json,active_from,created_at)
        VALUES ($1,$2,$3,'{"unit":"characters"}'::jsonb,'1970-01-01'::timestamptz,$4::timestamptz) ON CONFLICT DO NOTHING`,
        [input.workspaceId, pricingId, input.provider, input.now]
      );
      await client.query(
        `INSERT INTO speech_usage_ledger
        (workspace_id,usage_id,generation_id,provider,genre_id,video_id,billing_period,input_characters,billable_characters,
         estimated_credits,actual_credits,pricing_version_id,cache_hit,provider_request_id,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,date_trunc('month',$7::timestamptz)::date,$8,$9,$10,$11,$12,$13,$14,$7::timestamptz)
        ON CONFLICT (workspace_id,generation_id) DO NOTHING`,
        [
          input.workspaceId,
          input.usageId,
          input.generationId,
          input.provider,
          input.genreId ?? null,
          input.videoId ?? null,
          input.now,
          input.inputCharacters,
          input.billableCharacters,
          input.estimatedCredits ?? null,
          input.actualCredits ?? null,
          pricingId,
          input.cacheHit,
          input.providerRequestId ?? null,
        ]
      );
    });
  }

  public cancelGeneration(input: {
    readonly workspaceId: string;
    readonly generationId: string;
    readonly actorId: string;
    readonly requestId: string;
    readonly now: string;
  }): Promise<PersistedSpeechGeneration | null> {
    return this.transaction(input.workspaceId, async (client) => {
      const changed = await client.query(
        `UPDATE speech_generations SET state='cancelled',completed_at=$1::timestamptz,updated_at=$1::timestamptz
        WHERE workspace_id=$2 AND generation_id=$3 AND state IN ('queued','preflight','generating','retryable_failure')`,
        [input.now, input.workspaceId, input.generationId]
      );
      if ((changed.rowCount ?? 0) !== 1) return null;
      await this.audit(client, {
        ...input,
        action: "generation.cancel",
        subjectId: input.generationId,
      });
      return this.getGenerationWithClient(
        client,
        input.workspaceId,
        input.generationId
      );
    });
  }

  public async auditAction(input: {
    readonly workspaceId: string;
    readonly action: string;
    readonly subjectId: string;
    readonly actorId: string;
    readonly requestId: string;
    readonly now: string;
  }): Promise<void> {
    await this.transaction(input.workspaceId, (client) =>
      this.audit(client, input)
    );
  }

  private async audit(
    client: PostgresClient,
    input: {
      readonly workspaceId: string;
      readonly action: string;
      readonly subjectId: string;
      readonly actorId: string;
      readonly requestId: string;
      readonly now: string;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO speech_audit_records (workspace_id,audit_id,action,subject_id,actor_id,request_id,occurred_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz)`,
      [
        input.workspaceId,
        `speech-audit-${crypto.randomUUID()}`,
        input.action,
        input.subjectId,
        input.actorId,
        input.requestId,
        input.now,
      ]
    );
  }

  private revisionForState(state: PersistedSpeechState): number {
    return (
      [
        "queued",
        "preflight",
        "generating",
        "post_processing",
        "succeeded",
      ].indexOf(state) + 1
    );
  }
}
