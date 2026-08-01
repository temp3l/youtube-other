import type {
  PostgresClient,
  PostgresPool,
} from "./postgres-workflow-repository.js";

/** Additive, workspace-scoped authority for provider-neutral speech generations. */
export const POSTGRES_SPEECH_MIGRATION = `
CREATE TABLE IF NOT EXISTS voice_consent_records (
  workspace_id TEXT NOT NULL, consent_record_id TEXT NOT NULL, subject_name TEXT NOT NULL,
  evidence_artifact_id TEXT NOT NULL, evidence_sha256 TEXT NOT NULL,
  synthetic_speech_allowed BOOLEAN NOT NULL, commercial_use_allowed BOOLEAN NOT NULL,
  multilingual_use_allowed BOOLEAN NOT NULL, permitted_channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  valid_from TIMESTAMPTZ NOT NULL, valid_until TIMESTAMPTZ NULL, revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL, PRIMARY KEY (workspace_id, consent_record_id),
  CHECK (jsonb_typeof(permitted_channels) = 'array')
);
CREATE TABLE IF NOT EXISTS voice_profiles (
  workspace_id TEXT NOT NULL, voice_profile_id TEXT NOT NULL, profile_key TEXT NOT NULL,
  display_name TEXT NOT NULL, consent_record_id TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'deprecated')),
  created_at TIMESTAMPTZ NOT NULL, deprecated_at TIMESTAMPTZ NULL,
  PRIMARY KEY (workspace_id, voice_profile_id), UNIQUE (workspace_id, profile_key),
  FOREIGN KEY (workspace_id, consent_record_id) REFERENCES voice_consent_records (workspace_id, consent_record_id)
);
CREATE TABLE IF NOT EXISTS voice_profile_versions (
  workspace_id TEXT NOT NULL, voice_profile_version_id TEXT NOT NULL, voice_profile_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0), provider TEXT NOT NULL CHECK (provider IN ('openai', 'elevenlabs')),
  configuration_json JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'deprecated')),
  created_at TIMESTAMPTZ NOT NULL, activated_at TIMESTAMPTZ NULL, deprecated_at TIMESTAMPTZ NULL,
  PRIMARY KEY (workspace_id, voice_profile_version_id), UNIQUE (workspace_id, voice_profile_id, version),
  FOREIGN KEY (workspace_id, voice_profile_id) REFERENCES voice_profiles (workspace_id, voice_profile_id),
  CHECK (jsonb_typeof(configuration_json) = 'object')
);
CREATE TABLE IF NOT EXISTS genre_speech_policies (
  workspace_id TEXT NOT NULL, genre_id TEXT NOT NULL, default_voice_profile_version_id TEXT NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, genre_id), FOREIGN KEY (workspace_id, default_voice_profile_version_id)
    REFERENCES voice_profile_versions (workspace_id, voice_profile_version_id)
);
CREATE TABLE IF NOT EXISTS video_speech_overrides (
  workspace_id TEXT NOT NULL, video_id TEXT NOT NULL, voice_profile_version_id TEXT NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, video_id), FOREIGN KEY (workspace_id, voice_profile_version_id)
    REFERENCES voice_profile_versions (workspace_id, voice_profile_version_id)
);
CREATE TABLE IF NOT EXISTS speech_generations (
  workspace_id TEXT NOT NULL, generation_id TEXT NOT NULL, video_id TEXT NULL, genre_id TEXT NULL,
  voice_profile_version_id TEXT NOT NULL, cache_key TEXT NOT NULL, cache_input_version TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued','preflight','generating','post_processing','succeeded','retryable_failure','blocked_quota','blocked_configuration','blocked_consent','failed_permanent','cancelled')),
  idempotency_key TEXT NULL, supersedes_generation_id TEXT NULL, cache_hit BOOLEAN NOT NULL DEFAULT FALSE,
  lease_owner TEXT NULL, lease_fence BIGINT NOT NULL DEFAULT 0, lease_expires_at TIMESTAMPTZ NULL,
  provider_request_id TEXT NULL, raw_artifact_ids JSONB NOT NULL DEFAULT '[]'::jsonb, master_artifact_id TEXT NULL,
  failure_code TEXT NULL, failure_metadata JSONB NULL, created_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ NULL, completed_at TIMESTAMPTZ NULL, updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, generation_id),
  FOREIGN KEY (workspace_id, voice_profile_version_id) REFERENCES voice_profile_versions (workspace_id, voice_profile_version_id),
  FOREIGN KEY (workspace_id, supersedes_generation_id) REFERENCES speech_generations (workspace_id, generation_id),
  CHECK ((lease_owner IS NULL AND lease_expires_at IS NULL) OR (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CHECK (jsonb_typeof(raw_artifact_ids) = 'array')
);
-- Cache authority is deliberately separate from generation history: --force may
-- create another generation for the same deterministic inputs without replacing
-- the successful artifact selected for ordinary cache reuse.
ALTER TABLE speech_generations DROP CONSTRAINT IF EXISTS speech_generations_workspace_id_cache_key_key;
CREATE TABLE IF NOT EXISTS speech_cache_entries (
  workspace_id TEXT NOT NULL, cache_key TEXT NOT NULL, cache_input_version TEXT NOT NULL,
  authoritative_generation_id TEXT NULL, authoritative_master_artifact_id TEXT NULL,
  lease_owner TEXT NULL, lease_fence BIGINT NOT NULL DEFAULT 0, lease_expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, cache_key),
  FOREIGN KEY (workspace_id, authoritative_generation_id) REFERENCES speech_generations (workspace_id, generation_id),
  CHECK ((lease_owner IS NULL AND lease_expires_at IS NULL) OR (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CHECK ((authoritative_generation_id IS NULL AND authoritative_master_artifact_id IS NULL)
    OR (authoritative_generation_id IS NOT NULL AND authoritative_master_artifact_id IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS speech_generation_transitions (
  workspace_id TEXT NOT NULL, transition_id BIGINT GENERATED ALWAYS AS IDENTITY, generation_id TEXT NOT NULL,
  from_state TEXT NULL, to_state TEXT NOT NULL, failure_code TEXT NULL, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL, PRIMARY KEY (workspace_id, transition_id),
  FOREIGN KEY (workspace_id, generation_id) REFERENCES speech_generations (workspace_id, generation_id),
  CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE TABLE IF NOT EXISTS speech_generation_chunks (
  workspace_id TEXT NOT NULL, generation_id TEXT NOT NULL, chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  text_sha256 TEXT NOT NULL, provider_request_id TEXT NULL, state TEXT NOT NULL, raw_artifact_id TEXT NULL,
  failure_code TEXT NULL, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, generation_id, chunk_index), FOREIGN KEY (workspace_id, generation_id)
    REFERENCES speech_generations (workspace_id, generation_id)
);
CREATE TABLE IF NOT EXISTS speech_pricing_versions (
  workspace_id TEXT NOT NULL, pricing_version_id TEXT NOT NULL, provider TEXT NOT NULL,
  pricing_json JSONB NOT NULL, active_from TIMESTAMPTZ NOT NULL, retired_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL, PRIMARY KEY (workspace_id, pricing_version_id), CHECK (jsonb_typeof(pricing_json) = 'object')
);
CREATE TABLE IF NOT EXISTS speech_usage_ledger (
  workspace_id TEXT NOT NULL, usage_id TEXT NOT NULL, generation_id TEXT NOT NULL, provider TEXT NOT NULL,
  genre_id TEXT NULL, video_id TEXT NULL, billing_period DATE NOT NULL, input_characters INTEGER NOT NULL CHECK (input_characters >= 0),
  billable_characters INTEGER NOT NULL CHECK (billable_characters >= 0), estimated_credits NUMERIC NULL, actual_credits NUMERIC NULL,
  estimated_currency_amount NUMERIC NULL, actual_currency_amount NUMERIC NULL, currency TEXT NULL, pricing_version_id TEXT NOT NULL,
  cache_hit BOOLEAN NOT NULL, provider_request_id TEXT NULL, created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, usage_id), UNIQUE (workspace_id, generation_id),
  FOREIGN KEY (workspace_id, generation_id) REFERENCES speech_generations (workspace_id, generation_id),
  FOREIGN KEY (workspace_id, pricing_version_id) REFERENCES speech_pricing_versions (workspace_id, pricing_version_id)
);
CREATE TABLE IF NOT EXISTS speech_quota_reservations (
  workspace_id TEXT NOT NULL, reservation_id TEXT NOT NULL, generation_id TEXT NOT NULL, scope_type TEXT NOT NULL CHECK (scope_type IN ('provider','genre')),
  scope_id TEXT NOT NULL, billing_period DATE NOT NULL, reserved_characters INTEGER NOT NULL CHECK (reserved_characters > 0),
  state TEXT NOT NULL CHECK (state IN ('reserved','settled','released')), actual_characters INTEGER NULL CHECK (actual_characters IS NULL OR actual_characters >= 0),
  created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL, PRIMARY KEY (workspace_id, reservation_id),
  UNIQUE (workspace_id, generation_id, scope_type), FOREIGN KEY (workspace_id, generation_id) REFERENCES speech_generations (workspace_id, generation_id)
);
CREATE TABLE IF NOT EXISTS speech_quota_policies (
  workspace_id TEXT NOT NULL, scope_type TEXT NOT NULL CHECK (scope_type IN ('provider','genre')),
  scope_id TEXT NOT NULL, monthly_hard_limit_characters INTEGER NOT NULL CHECK (monthly_hard_limit_characters > 0),
  warning_percent INTEGER NOT NULL DEFAULT 80 CHECK (warning_percent BETWEEN 1 AND 100),
  revision BIGINT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, scope_type, scope_id)
);
CREATE TABLE IF NOT EXISTS speech_quota_reservation_scopes (
  workspace_id TEXT NOT NULL, reservation_id TEXT NOT NULL, generation_id TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('provider','genre')), scope_id TEXT NOT NULL,
  billing_period DATE NOT NULL, reserved_characters INTEGER NOT NULL CHECK (reserved_characters >= 0),
  actual_characters INTEGER NULL CHECK (actual_characters IS NULL OR actual_characters >= 0),
  state TEXT NOT NULL CHECK (state IN ('reserved','settled','released')),
  created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, reservation_id, scope_type, scope_id),
  UNIQUE (workspace_id, generation_id, scope_type, scope_id),
  FOREIGN KEY (workspace_id, generation_id) REFERENCES speech_generations (workspace_id, generation_id)
);
CREATE TABLE IF NOT EXISTS speech_artifacts (
  workspace_id TEXT NOT NULL, generation_id TEXT NOT NULL, artifact_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('raw','master')), chunk_index INTEGER NULL,
  sha256 TEXT NOT NULL, content_type TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, artifact_id),
  UNIQUE (workspace_id, generation_id, kind, chunk_index),
  FOREIGN KEY (workspace_id, generation_id) REFERENCES speech_generations (workspace_id, generation_id),
  CHECK ((kind='raw' AND chunk_index IS NOT NULL) OR (kind='master' AND chunk_index IS NULL))
);
CREATE TABLE IF NOT EXISTS speech_generation_chunk_attempts (
  workspace_id TEXT NOT NULL, generation_id TEXT NOT NULL, chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  attempt INTEGER NOT NULL CHECK (attempt > 0), text_sha256 TEXT NOT NULL, provider_request_id TEXT NULL,
  state TEXT NOT NULL CHECK (state IN ('succeeded','failed')), raw_artifact_id TEXT NULL, failure_code TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, generation_id, chunk_index, attempt),
  FOREIGN KEY (workspace_id, generation_id) REFERENCES speech_generations (workspace_id, generation_id)
);
CREATE TABLE IF NOT EXISTS speech_audit_records (
  workspace_id TEXT NOT NULL, audit_id TEXT NOT NULL, action TEXT NOT NULL, subject_id TEXT NOT NULL,
  actor_id TEXT NOT NULL, request_id TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL, PRIMARY KEY (workspace_id, audit_id), CHECK (jsonb_typeof(metadata)='object')
);
CREATE TABLE IF NOT EXISTS speech_listening_test_approvals (
  workspace_id TEXT NOT NULL, voice_profile_version_id TEXT NOT NULL, approved_by TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL, evidence_artifact_id TEXT NOT NULL,
  PRIMARY KEY (workspace_id, voice_profile_version_id),
  FOREIGN KEY (workspace_id, voice_profile_version_id) REFERENCES voice_profile_versions (workspace_id, voice_profile_version_id)
);
CREATE TABLE IF NOT EXISTS speech_dispatch_controls (
  workspace_id TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE, revision BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL, updated_by TEXT NOT NULL,
  PRIMARY KEY (workspace_id)
);
ALTER TABLE voice_profiles ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0;
ALTER TABLE voice_profile_versions ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';
ALTER TABLE voice_profile_versions ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0;
ALTER TABLE speech_generations ADD COLUMN IF NOT EXISTS request_fingerprint TEXT NULL;
ALTER TABLE speech_generations ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'default';
ALTER TABLE speech_generations ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';
ALTER TABLE speech_generations ADD COLUMN IF NOT EXISTS text_sha256 TEXT NULL;
ALTER TABLE speech_generations ADD COLUMN IF NOT EXISTS estimate_characters INTEGER NULL;
ALTER TABLE speech_generations ADD COLUMN IF NOT EXISTS estimate_credits NUMERIC NULL;
ALTER TABLE speech_generations ADD COLUMN IF NOT EXISTS actual_characters INTEGER NULL;
ALTER TABLE speech_generations ADD COLUMN IF NOT EXISTS actual_credits NUMERIC NULL;
ALTER TABLE speech_generations ADD COLUMN IF NOT EXISTS force_regeneration BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS speech_generation_cache_key_idx ON speech_generations (workspace_id, cache_key, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS speech_generation_idempotency_idx ON speech_generations (workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS speech_cache_claim_idx ON speech_cache_entries (workspace_id, cache_key, lease_expires_at) WHERE authoritative_generation_id IS NULL;
CREATE INDEX IF NOT EXISTS speech_generations_profile_idx ON speech_generations (workspace_id, voice_profile_version_id, created_at DESC);
CREATE INDEX IF NOT EXISTS speech_genre_policy_profile_idx ON genre_speech_policies (workspace_id, default_voice_profile_version_id);
CREATE INDEX IF NOT EXISTS speech_video_override_profile_idx ON video_speech_overrides (workspace_id, voice_profile_version_id);
CREATE INDEX IF NOT EXISTS speech_usage_period_idx ON speech_usage_ledger (workspace_id, provider, billing_period, genre_id);
CREATE INDEX IF NOT EXISTS speech_transitions_generation_idx ON speech_generation_transitions (workspace_id, generation_id, occurred_at);
CREATE INDEX IF NOT EXISTS speech_quota_scope_idx ON speech_quota_reservation_scopes (workspace_id, scope_type, scope_id, billing_period, state);
CREATE INDEX IF NOT EXISTS speech_artifacts_generation_idx ON speech_artifacts (workspace_id, generation_id, kind, chunk_index);
CREATE INDEX IF NOT EXISTS speech_audit_occurred_idx ON speech_audit_records (workspace_id, occurred_at DESC);
CREATE OR REPLACE FUNCTION enforce_voice_profile_version_immutability() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'voice profile versions cannot be deleted' USING ERRCODE = 'P0001'; END IF;
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.voice_profile_version_id IS DISTINCT FROM OLD.voice_profile_version_id
     OR NEW.voice_profile_id IS DISTINCT FROM OLD.voice_profile_id OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.provider IS DISTINCT FROM OLD.provider OR NEW.configuration_json IS DISTINCT FROM OLD.configuration_json
  THEN RAISE EXCEPTION 'voice profile versions are immutable' USING ERRCODE = 'P0001'; END IF;
  IF OLD.status = 'active' AND NEW.status = 'draft' THEN RAISE EXCEPTION 'active voice profile version cannot return to draft' USING ERRCODE = 'P0001'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS voice_profile_versions_immutable ON voice_profile_versions;
CREATE TRIGGER voice_profile_versions_immutable BEFORE UPDATE OR DELETE ON voice_profile_versions FOR EACH ROW EXECUTE FUNCTION enforce_voice_profile_version_immutability();
DO $$ DECLARE t TEXT; BEGIN FOREACH t IN ARRAY ARRAY['voice_consent_records','voice_profiles','voice_profile_versions','genre_speech_policies','video_speech_overrides','speech_generations','speech_cache_entries','speech_generation_transitions','speech_generation_chunks','speech_pricing_versions','speech_usage_ledger','speech_quota_reservations','speech_quota_policies','speech_quota_reservation_scopes','speech_artifacts','speech_generation_chunk_attempts','speech_audit_records','speech_listening_test_approvals','speech_dispatch_controls'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t); EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  EXECUTE format('DROP POLICY IF EXISTS workspace_isolation ON %I', t);
  EXECUTE format('CREATE POLICY workspace_isolation ON %I USING (workspace_id = current_setting(''app.workspace_id'', true)) WITH CHECK (workspace_id = current_setting(''app.workspace_id'', true))', t);
END LOOP; END $$;
`;

export type SpeechGenerationState =
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
export interface ResolvedSpeechProfileRecord {
  readonly profileVersionId: string;
  readonly profileKey: string;
  readonly provider: "openai" | "elevenlabs";
  readonly configuration: unknown;
  readonly source: "video" | "genre" | "system";
}
interface ProfileRow {
  voice_profile_version_id: string;
  profile_key: string;
  provider: "openai" | "elevenlabs";
  configuration_json: unknown;
  source: "video" | "genre" | "system";
}
interface GenerationRow {
  generation_id: string;
  state: SpeechGenerationState;
  cache_hit: boolean;
  lease_fence: string | number;
}

export class SpeechPersistenceError extends Error {}
const terminal = new Set<SpeechGenerationState>([
  "succeeded",
  "blocked_quota",
  "blocked_configuration",
  "blocked_consent",
  "failed_permanent",
  "cancelled",
]);
const transitions: Readonly<
  Record<SpeechGenerationState, readonly SpeechGenerationState[]>
> = {
  queued: ["preflight", "cancelled"],
  preflight: [
    "generating",
    "blocked_quota",
    "blocked_configuration",
    "blocked_consent",
    "retryable_failure",
    "cancelled",
  ],
  generating: [
    "post_processing",
    "retryable_failure",
    "failed_permanent",
    "cancelled",
  ],
  post_processing: ["succeeded", "retryable_failure", "failed_permanent"],
  succeeded: [],
  retryable_failure: ["queued", "cancelled"],
  blocked_quota: [],
  blocked_configuration: [],
  blocked_consent: [],
  failed_permanent: [],
  cancelled: [],
};
function mapProfile(row: ProfileRow): ResolvedSpeechProfileRecord {
  return {
    profileVersionId: row.voice_profile_version_id,
    profileKey: row.profile_key,
    provider: row.provider,
    configuration: row.configuration_json,
    source: row.source,
  };
}

export class PostgresSpeechRepository {
  public constructor(private readonly pool: PostgresPool) {}
  public async migrate(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(POSTGRES_SPEECH_MIGRATION);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
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
  /** Seeds a non-active OpenAI profile/version during migration; callers supply legacy configuration. */
  public backfillOpenAiDefault(input: {
    readonly workspaceId: string;
    readonly profileId: string;
    readonly profileVersionId: string;
    readonly profileKey: string;
    readonly configuration: unknown;
    readonly now: string;
  }): Promise<void> {
    return this.transaction(input.workspaceId, async (client) => {
      await client.query(
        `INSERT INTO voice_profiles (workspace_id, voice_profile_id, profile_key, display_name, status, created_at) VALUES ($1,$2,$3,'Migrated OpenAI default','active',$4::timestamptz) ON CONFLICT (workspace_id, profile_key) DO NOTHING`,
        [input.workspaceId, input.profileId, input.profileKey, input.now]
      );
      await client.query(
        `INSERT INTO voice_profile_versions (workspace_id, voice_profile_version_id, voice_profile_id, version, provider, configuration_json, status, created_at, activated_at) VALUES ($1,$2,$3,1,'openai',$4::jsonb,'active',$5::timestamptz,$5::timestamptz) ON CONFLICT (workspace_id, voice_profile_version_id) DO NOTHING`,
        [
          input.workspaceId,
          input.profileVersionId,
          input.profileId,
          JSON.stringify(input.configuration),
          input.now,
        ]
      );
    });
  }
  public resolveProfile(input: {
    readonly workspaceId: string;
    readonly videoId?: string;
    readonly genreId?: string;
    readonly systemProfileVersionId: string;
  }): Promise<ResolvedSpeechProfileRecord | null> {
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query<ProfileRow>(
        `WITH selected AS (SELECT voice_profile_version_id, 'video'::text AS source FROM video_speech_overrides WHERE workspace_id=$1 AND video_id=$2 UNION ALL SELECT default_voice_profile_version_id, 'genre'::text FROM genre_speech_policies WHERE workspace_id=$1 AND genre_id=$3 UNION ALL SELECT $4, 'system'::text) SELECT version.voice_profile_version_id, profile.profile_key, version.provider, version.configuration_json, selected.source FROM selected JOIN voice_profile_versions version ON version.workspace_id=$1 AND version.voice_profile_version_id=selected.voice_profile_version_id AND version.status='active' JOIN voice_profiles profile ON profile.workspace_id=$1 AND profile.voice_profile_id=version.voice_profile_id ORDER BY CASE selected.source WHEN 'video' THEN 1 WHEN 'genre' THEN 2 ELSE 3 END LIMIT 1`,
        [
          input.workspaceId,
          input.videoId ?? null,
          input.genreId ?? null,
          input.systemProfileVersionId,
        ]
      );
      return result.rows[0] ? mapProfile(result.rows[0]) : null;
    });
  }
  /** Atomically claims a cache key before making a provider call. Forced work bypasses cache authority but remains historical. */
  public claimGeneration(input: {
    readonly workspaceId: string;
    readonly generationId: string;
    readonly profileVersionId: string;
    readonly cacheKey: string;
    readonly cacheInputVersion: string;
    readonly workerId: string;
    readonly leaseSeconds: number;
    readonly now: string;
    readonly forceRegeneration?: boolean;
    readonly idempotencyKey?: string;
    readonly supersedesGenerationId?: string;
  }): Promise<{
    readonly generationId: string;
    readonly state: SpeechGenerationState;
    readonly leaseFence: number;
  } | null> {
    if (!Number.isSafeInteger(input.leaseSeconds) || input.leaseSeconds <= 0)
      throw new SpeechPersistenceError("Lease seconds must be positive.");
    return this.transaction(input.workspaceId, async (client) => {
      const force = input.forceRegeneration ?? false;
      const result = await client.query<GenerationRow>(
        `WITH claimed AS (INSERT INTO speech_cache_entries (workspace_id,cache_key,cache_input_version,lease_owner,lease_fence,lease_expires_at,created_at,updated_at) SELECT $1,$4,$5,$6,1,$7::timestamptz + ($8::text || ' seconds')::interval,$7::timestamptz,$7::timestamptz WHERE NOT $9::boolean ON CONFLICT (workspace_id,cache_key) DO UPDATE SET lease_owner=EXCLUDED.lease_owner, lease_fence=speech_cache_entries.lease_fence+1, lease_expires_at=EXCLUDED.lease_expires_at, updated_at=EXCLUDED.updated_at WHERE speech_cache_entries.authoritative_generation_id IS NULL AND speech_cache_entries.lease_expires_at <= $7::timestamptz RETURNING lease_fence), created_generation AS (INSERT INTO speech_generations (workspace_id,generation_id,voice_profile_version_id,cache_key,cache_input_version,state,idempotency_key,supersedes_generation_id,lease_owner,lease_fence,lease_expires_at,created_at,updated_at) SELECT $1,$2,$3,$4,$5,'queued',$10,$11,$6,CASE WHEN $9::boolean THEN 1 ELSE claimed.lease_fence END,$7::timestamptz + ($8::text || ' seconds')::interval,$7::timestamptz,$7::timestamptz FROM claimed UNION ALL SELECT $1,$2,$3,$4,$5,'queued',$10,$11,$6,1,$7::timestamptz + ($8::text || ' seconds')::interval,$7::timestamptz,$7::timestamptz WHERE $9::boolean) SELECT generation_id,state,FALSE AS cache_hit,lease_fence FROM created_generation`,
        [
          input.workspaceId,
          input.generationId,
          input.profileVersionId,
          input.cacheKey,
          input.cacheInputVersion,
          input.workerId,
          input.now,
          input.leaseSeconds,
          force,
          input.idempotencyKey ?? null,
          input.supersedesGenerationId ?? null,
        ]
      );
      const row = result.rows[0];
      return row
        ? {
            generationId: row.generation_id,
            state: row.state,
            leaseFence: Number(row.lease_fence),
          }
        : null;
    });
  }
  /** Renews both generation and cache leases under the original fencing token. */
  public renewGenerationLease(input: {
    readonly workspaceId: string;
    readonly generationId: string;
    readonly cacheKey: string;
    readonly workerId: string;
    readonly leaseFence: number;
    readonly leaseSeconds: number;
    readonly now: string;
    readonly forceRegeneration?: boolean;
  }): Promise<boolean> {
    if (!Number.isSafeInteger(input.leaseSeconds) || input.leaseSeconds <= 0)
      throw new SpeechPersistenceError("Lease seconds must be positive.");
    return this.transaction(input.workspaceId, async (client) => {
      const generation = await client.query(
        `UPDATE speech_generations SET lease_expires_at=$1::timestamptz + ($2::text || ' seconds')::interval, updated_at=$1::timestamptz WHERE workspace_id=$3 AND generation_id=$4 AND lease_owner=$5 AND lease_fence=$6 AND state IN ('queued','preflight','generating','post_processing')`,
        [
          input.now,
          input.leaseSeconds,
          input.workspaceId,
          input.generationId,
          input.workerId,
          input.leaseFence,
        ]
      );
      if ((generation.rowCount ?? 0) !== 1) return false;
      if (input.forceRegeneration ?? false) return true;
      const cache = await client.query(
        `UPDATE speech_cache_entries SET lease_expires_at=$1::timestamptz + ($2::text || ' seconds')::interval, updated_at=$1::timestamptz WHERE workspace_id=$3 AND cache_key=$4 AND lease_owner=$5 AND lease_fence=$6 AND authoritative_generation_id IS NULL`,
        [
          input.now,
          input.leaseSeconds,
          input.workspaceId,
          input.cacheKey,
          input.workerId,
          input.leaseFence,
        ]
      );
      if ((cache.rowCount ?? 0) === 1) return true;
      throw new SpeechPersistenceError(
        "Speech cache lease fencing token was lost during renewal."
      );
    });
  }
  /** Records the immutable successful master selected for future normal cache hits. */
  public markCacheEntrySucceeded(input: {
    readonly workspaceId: string;
    readonly cacheKey: string;
    readonly generationId: string;
    readonly masterArtifactId: string;
    readonly workerId: string;
    readonly leaseFence: number;
    readonly now: string;
  }): Promise<boolean> {
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query(
        `UPDATE speech_cache_entries SET authoritative_generation_id=$1, authoritative_master_artifact_id=$2, lease_owner=NULL, lease_expires_at=NULL, updated_at=$3::timestamptz WHERE workspace_id=$4 AND cache_key=$5 AND lease_owner=$6 AND lease_fence=$7 AND authoritative_generation_id IS NULL`,
        [
          input.generationId,
          input.masterArtifactId,
          input.now,
          input.workspaceId,
          input.cacheKey,
          input.workerId,
          input.leaseFence,
        ]
      );
      return (result.rowCount ?? 0) === 1;
    });
  }
  public transitionGeneration(input: {
    readonly workspaceId: string;
    readonly generationId: string;
    readonly from: SpeechGenerationState;
    readonly to: SpeechGenerationState;
    readonly now: string;
    readonly failureCode?: string;
  }): Promise<boolean> {
    if (terminal.has(input.from) || !transitions[input.from].includes(input.to))
      throw new SpeechPersistenceError(
        `Invalid speech transition ${input.from} -> ${input.to}.`
      );
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query(
        `UPDATE speech_generations SET state=$1, failure_code=$2, completed_at=CASE WHEN $1 IN ('succeeded','blocked_quota','blocked_configuration','blocked_consent','failed_permanent','cancelled') THEN $3::timestamptz ELSE completed_at END, updated_at=$3::timestamptz WHERE workspace_id=$4 AND generation_id=$5 AND state=$6`,
        [
          input.to,
          input.failureCode ?? null,
          input.now,
          input.workspaceId,
          input.generationId,
          input.from,
        ]
      );
      if ((result.rowCount ?? 0) !== 1) return false;
      await client.query(
        `INSERT INTO speech_generation_transitions (workspace_id,generation_id,from_state,to_state,failure_code,occurred_at) VALUES ($1,$2,$3,$4,$5,$6::timestamptz)`,
        [
          input.workspaceId,
          input.generationId,
          input.from,
          input.to,
          input.failureCode ?? null,
          input.now,
        ]
      );
      return true;
    });
  }
}
