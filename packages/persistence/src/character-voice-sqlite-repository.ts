import type { DatabaseSync } from "node:sqlite";
import {
  buildCharacterVoiceProfileId,
  characterVoiceConsentRecordPayloadSchema,
  characterVoiceProfilePayloadSchema,
  characterVoiceProfileVersionPayloadSchema,
  characterVoicePronunciationRevisionPayloadSchema,
  computeCharacterVoicePronunciationRevisionHash,
  type CharacterVoiceProfileId,
  type CharacterVoiceProfileVersionId,
  type MicrodramaBcp47Locale,
} from "@mediaforge/narrative-core";

import type {
  ActivateCharacterVoiceProfileVersionInput,
  AppendCharacterVoicePronunciationRevisionInput,
  AppendCharacterVoiceProfileVersionInput,
  CharacterVoiceRegistryPersistencePort,
  RegisterCharacterVoiceConsentRecordInput,
  RegisterCharacterVoiceProfileInput,
  ResolvedCharacterVoiceProfileRecord,
} from "./character-voice-persistence-port.js";
import {
  CharacterVoiceConcurrencyError,
  CharacterVoiceDuplicateVersionError,
  CharacterVoiceProfileVersionImmutableError,
} from "./character-voice-persistence-port.js";
import {
  CHARACTER_VOICE_SQLITE_MIGRATION,
  CHARACTER_VOICE_SQLITE_MIGRATION_ID,
} from "./character-voice-sqlite-schema.js";
import { MICRODRAMA_SQLITE_MIGRATION_ID } from "./microdrama-sqlite-schema.js";

type SQLitePersistenceHost = {
  readonly database: DatabaseSync;
};

type ProfileRow = {
  profile_id: string;
  character_id: string;
  locale: string;
  display_name: string;
  narrative_role: string;
  speech_style_notes: string;
  active_version_id: string | null;
};

type VersionRow = {
  profile_version_id: string;
  profile_id: string;
  version_number: number;
  status: string;
  provider: string;
  model_intent: string;
  voice_binding_status: string;
  provider_voice_id: string | null;
  canary_evidence_artifact_hash: string | null;
  consent_record_id: string | null;
  delivery_configuration_json: string;
  pronunciation_revision_id: string | null;
  revision: number;
};

type PronunciationRow = {
  pronunciation_revision_id: string;
  profile_id: string;
  profile_version_number: number;
  locale: string;
  entries_json: string;
  content_hash: string;
};

function parseProfileRow(row: ProfileRow) {
  return characterVoiceProfilePayloadSchema.parse({
    schemaVersion: "mediaforge.narrative.v1",
    profileId: row.profile_id,
    characterId: row.character_id,
    locale: row.locale,
    displayName: row.display_name,
    narrativeRole: row.narrative_role,
    speechStyleNotes: row.speech_style_notes,
  });
}

function parseVersionRow(row: VersionRow) {
  return characterVoiceProfileVersionPayloadSchema.parse({
    schemaVersion: "mediaforge.narrative.v1",
    profileVersionId: row.profile_version_id,
    profileId: row.profile_id,
    versionNumber: row.version_number,
    status: row.status,
    provider: row.provider,
    modelIntent: row.model_intent,
    voiceBindingStatus: row.voice_binding_status,
    ...(row.provider_voice_id ? { providerVoiceId: row.provider_voice_id } : {}),
    ...(row.canary_evidence_artifact_hash
      ? { canaryEvidenceArtifactHash: row.canary_evidence_artifact_hash }
      : {}),
    ...(row.consent_record_id ? { consentRecordId: row.consent_record_id } : {}),
    deliveryConfiguration: JSON.parse(row.delivery_configuration_json) as unknown,
    ...(row.pronunciation_revision_id
      ? { pronunciationRevisionId: row.pronunciation_revision_id }
      : {}),
  });
}

function parsePronunciationRow(row: PronunciationRow) {
  return characterVoicePronunciationRevisionPayloadSchema.parse({
    schemaVersion: "mediaforge.narrative.v1",
    pronunciationRevisionId: row.pronunciation_revision_id,
    profileId: row.profile_id,
    profileVersionNumber: row.profile_version_number,
    locale: row.locale,
    entries: JSON.parse(row.entries_json) as unknown,
  });
}

export class CharacterVoiceSQLiteRepository
  implements CharacterVoiceRegistryPersistencePort
{
  public constructor(private readonly sqlite: SQLitePersistenceHost) {}

  public migrate(): void {
    const database = this.sqlite.database;
    database.exec(CHARACTER_VOICE_SQLITE_MIGRATION);
    const applied = database
      .prepare(
        "SELECT migration_id FROM microdrama_schema_migrations WHERE migration_id = ?"
      )
      .get(CHARACTER_VOICE_SQLITE_MIGRATION_ID) as
      | { migration_id: string }
      | undefined;
    if (!applied) {
      const baseApplied = database
        .prepare(
          "SELECT migration_id FROM microdrama_schema_migrations WHERE migration_id = ?"
        )
        .get(MICRODRAMA_SQLITE_MIGRATION_ID) as { migration_id: string } | undefined;
      if (!baseApplied) {
        throw new Error(
          "Character voice migration requires microdrama embedded schema v1."
        );
      }
      database
        .prepare(
          "INSERT INTO microdrama_schema_migrations (migration_id, applied_at) VALUES (?, ?)"
        )
        .run(CHARACTER_VOICE_SQLITE_MIGRATION_ID, new Date().toISOString());
    }
  }

  public registerProfile(
    input: RegisterCharacterVoiceProfileInput
  ): ReturnType<CharacterVoiceRegistryPersistencePort["registerProfile"]> {
    const payload = characterVoiceProfilePayloadSchema.parse(input.payload);
    this.sqlite.database
      .prepare(
        `INSERT INTO microdrama_character_voice_profiles (
          profile_id, character_id, locale, display_name, narrative_role,
          speech_style_notes, active_version_id, revision, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, 0, ?)`
      )
      .run(
        payload.profileId,
        payload.characterId,
        payload.locale,
        payload.displayName,
        payload.narrativeRole,
        payload.speechStyleNotes,
        input.createdAt
      );
    return payload;
  }

  public registerConsentRecord(
    input: RegisterCharacterVoiceConsentRecordInput
  ): ReturnType<CharacterVoiceRegistryPersistencePort["registerConsentRecord"]> {
    const payload = characterVoiceConsentRecordPayloadSchema.parse(input.payload);
    this.sqlite.database
      .prepare(
        `INSERT INTO microdrama_character_voice_consent_records (
          consent_record_id, payload_json, recorded_at
        ) VALUES (?, ?, ?)`
      )
      .run(
        payload.consentRecordId,
        JSON.stringify(payload),
        input.recordedAt
      );
    return payload;
  }

  public appendProfileVersion(
    input: AppendCharacterVoiceProfileVersionInput
  ): ReturnType<CharacterVoiceRegistryPersistencePort["appendProfileVersion"]> {
    const payload = characterVoiceProfileVersionPayloadSchema.parse(input.payload);
    const database = this.sqlite.database;
    const profile = database
      .prepare(
        "SELECT profile_id FROM microdrama_character_voice_profiles WHERE profile_id = ?"
      )
      .get(payload.profileId) as { profile_id: string } | undefined;
    if (!profile) {
      throw new Error(`Character voice profile not found: ${payload.profileId}`);
    }

    const duplicate = database
      .prepare(
        "SELECT profile_version_id FROM microdrama_character_voice_profile_versions WHERE profile_version_id = ?"
      )
      .get(payload.profileVersionId) as { profile_version_id: string } | undefined;
    if (duplicate) {
      throw new CharacterVoiceDuplicateVersionError(
        `Profile version already exists: ${payload.profileVersionId}`
      );
    }

    database
      .prepare(
        `INSERT INTO microdrama_character_voice_profile_versions (
          profile_version_id, profile_id, version_number, status, provider, model_intent,
          voice_binding_status, provider_voice_id, canary_evidence_artifact_hash,
          consent_record_id, delivery_configuration_json, pronunciation_revision_id,
          revision, created_at, activated_at, deprecated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL, NULL)`
      )
      .run(
        payload.profileVersionId,
        payload.profileId,
        payload.versionNumber,
        payload.status,
        payload.provider,
        payload.modelIntent,
        payload.voiceBindingStatus,
        payload.providerVoiceId ?? null,
        payload.canaryEvidenceArtifactHash ?? null,
        payload.consentRecordId ?? null,
        JSON.stringify(payload.deliveryConfiguration),
        payload.pronunciationRevisionId ?? null,
        input.createdAt
      );
    return payload;
  }

  public appendPronunciationRevision(
    input: AppendCharacterVoicePronunciationRevisionInput
  ): ReturnType<
    CharacterVoiceRegistryPersistencePort["appendPronunciationRevision"]
  > {
    const payload = characterVoicePronunciationRevisionPayloadSchema.parse(
      input.payload
    );
    const contentHash = computeCharacterVoicePronunciationRevisionHash(payload);
    this.sqlite.database
      .prepare(
        `INSERT INTO microdrama_character_voice_pronunciation_revisions (
          pronunciation_revision_id, profile_id, profile_version_number, locale,
          entries_json, content_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        payload.pronunciationRevisionId,
        payload.profileId,
        payload.profileVersionNumber,
        payload.locale,
        JSON.stringify(payload.entries),
        contentHash,
        input.createdAt
      );
    return payload;
  }

  public activateProfileVersion(
    input: ActivateCharacterVoiceProfileVersionInput
  ): ReturnType<CharacterVoiceRegistryPersistencePort["activateProfileVersion"]> {
    const database = this.sqlite.database;
    database.exec("BEGIN IMMEDIATE");
    try {
      const row = database
        .prepare(
          `SELECT profile_version_id, profile_id, version_number, status, provider, model_intent,
          voice_binding_status, provider_voice_id, canary_evidence_artifact_hash,
          consent_record_id, delivery_configuration_json, pronunciation_revision_id, revision
          FROM microdrama_character_voice_profile_versions WHERE profile_version_id = ?`
        )
        .get(input.profileVersionId) as VersionRow | undefined;
      if (!row) {
        throw new Error(`Profile version not found: ${input.profileVersionId}`);
      }
      if (row.status !== "DRAFT") {
        throw new CharacterVoiceProfileVersionImmutableError(
          "Only draft profile versions can be activated."
        );
      }
      if (row.revision !== input.expectedRevision) {
        throw new CharacterVoiceConcurrencyError(
          `Expected revision ${input.expectedRevision}, found ${row.revision}.`
        );
      }

      const updated = database
        .prepare(
          `UPDATE microdrama_character_voice_profile_versions
          SET status = 'ACTIVE', activated_at = ?, revision = revision + 1
          WHERE profile_version_id = ? AND status = 'DRAFT' AND revision = ?`
        )
        .run(input.activatedAt, input.profileVersionId, input.expectedRevision);
      if (updated.changes !== 1) {
        throw new CharacterVoiceConcurrencyError(
          "Profile version activation lost an optimistic concurrency race."
        );
      }

      database
        .prepare(
          `UPDATE microdrama_character_voice_profile_versions
          SET status = 'DEPRECATED', deprecated_at = ?, revision = revision + 1
          WHERE profile_id = ? AND status = 'ACTIVE' AND profile_version_id <> ?`
        )
        .run(input.activatedAt, row.profile_id, input.profileVersionId);

      database
        .prepare(
          `UPDATE microdrama_character_voice_profiles
          SET active_version_id = ?, revision = revision + 1
          WHERE profile_id = ?`
        )
        .run(input.profileVersionId, row.profile_id);

      database.exec("COMMIT");
      const activated = this.getProfileVersion(input.profileVersionId);
      if (!activated) {
        throw new Error("Activated profile version could not be reloaded.");
      }
      return activated;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  public getProfile(
    profileId: CharacterVoiceProfileId
  ): ReturnType<CharacterVoiceRegistryPersistencePort["getProfile"]> {
    const row = this.sqlite.database
      .prepare(
        `SELECT profile_id, character_id, locale, display_name, narrative_role, speech_style_notes
        FROM microdrama_character_voice_profiles WHERE profile_id = ?`
      )
      .get(profileId) as ProfileRow | undefined;
    return row ? parseProfileRow(row) : null;
  }

  public getProfileVersion(
    profileVersionId: CharacterVoiceProfileVersionId
  ): ReturnType<CharacterVoiceRegistryPersistencePort["getProfileVersion"]> {
    const row = this.sqlite.database
      .prepare(
        `SELECT profile_version_id, profile_id, version_number, status, provider, model_intent,
        voice_binding_status, provider_voice_id, canary_evidence_artifact_hash,
        consent_record_id, delivery_configuration_json, pronunciation_revision_id, revision
        FROM microdrama_character_voice_profile_versions WHERE profile_version_id = ?`
      )
      .get(profileVersionId) as VersionRow | undefined;
    return row ? parseVersionRow(row) : null;
  }

  public recordBoundedCanaryApprovedProviderBinding(input: {
    readonly profileVersionId: CharacterVoiceProfileVersionId;
    readonly providerVoiceId: string;
    readonly canaryEvidenceArtifactHash: string;
    readonly recordedAt: string;
  }): ReturnType<CharacterVoiceRegistryPersistencePort["getProfileVersion"]> {
    const database = this.sqlite.database;
    const row = database
      .prepare(
        `SELECT profile_version_id, profile_id, version_number, status, provider, model_intent,
        voice_binding_status, provider_voice_id, canary_evidence_artifact_hash,
        consent_record_id, delivery_configuration_json, pronunciation_revision_id, revision
        FROM microdrama_character_voice_profile_versions WHERE profile_version_id = ?`
      )
      .get(input.profileVersionId) as VersionRow | undefined;
    if (!row) {
      throw new Error(`Profile version not found: ${input.profileVersionId}`);
    }
    if (row.status !== "ACTIVE") {
      throw new CharacterVoiceProfileVersionImmutableError(
        "Bounded canary provider binding requires an active profile version."
      );
    }
    if (
      row.voice_binding_status === "CANARY_APPROVED" &&
      row.provider_voice_id === input.providerVoiceId &&
      row.canary_evidence_artifact_hash === input.canaryEvidenceArtifactHash
    ) {
      return parseVersionRow(row);
    }
    if (row.voice_binding_status === "CANARY_APPROVED") {
      const rebound = database
        .prepare(
          `UPDATE microdrama_character_voice_profile_versions
          SET provider_voice_id = ?,
              canary_evidence_artifact_hash = ?,
              revision = revision + 1
          WHERE profile_version_id = ?
            AND status = 'ACTIVE'
            AND voice_binding_status = 'CANARY_APPROVED'`
        )
        .run(
          input.providerVoiceId,
          input.canaryEvidenceArtifactHash,
          input.profileVersionId
        );
      if (rebound.changes !== 1) {
        throw new CharacterVoiceConcurrencyError(
          "Bounded canary provider rebinding lost an optimistic concurrency race."
        );
      }
      const reboundVersion = this.getProfileVersion(input.profileVersionId);
      if (!reboundVersion) {
        throw new Error("Rebound profile version could not be reloaded.");
      }
      return reboundVersion;
    }
    if (row.voice_binding_status !== "UNBOUND") {
      throw new CharacterVoiceProfileVersionImmutableError(
        "Bounded canary provider binding requires UNBOUND active profile version."
      );
    }

    const updated = database
      .prepare(
        `UPDATE microdrama_character_voice_profile_versions
        SET voice_binding_status = 'CANARY_APPROVED',
            provider_voice_id = ?,
            canary_evidence_artifact_hash = ?,
            revision = revision + 1
        WHERE profile_version_id = ?
          AND status = 'ACTIVE'
          AND voice_binding_status = 'UNBOUND'`
      )
      .run(
        input.providerVoiceId,
        input.canaryEvidenceArtifactHash,
        input.profileVersionId
      );
    if (updated.changes !== 1) {
      throw new CharacterVoiceConcurrencyError(
        "Bounded canary provider binding lost an optimistic concurrency race."
      );
    }

    const rebound = this.getProfileVersion(input.profileVersionId);
    if (!rebound) {
      throw new Error("Rebound profile version could not be reloaded.");
    }
    return rebound;
  }

  public resolveActiveProfile(
    characterId: string,
    locale: MicrodramaBcp47Locale
  ): ResolvedCharacterVoiceProfileRecord | null {
    const profileId = buildCharacterVoiceProfileId(characterId, locale);
    const profile = this.getProfile(profileId);
    if (!profile) {
      return null;
    }

    const profileRow = this.sqlite.database
      .prepare(
        "SELECT active_version_id FROM microdrama_character_voice_profiles WHERE profile_id = ?"
      )
      .get(profileId) as { active_version_id: string | null } | undefined;
    const activeVersionId = profileRow?.active_version_id;
    const activeVersion = activeVersionId
      ? this.getProfileVersion(activeVersionId as CharacterVoiceProfileVersionId)
      : null;

    const pronunciationRevision =
      activeVersion?.pronunciationRevisionId != null
        ? this.getPronunciationRevision(activeVersion.pronunciationRevisionId)
        : null;

    const consent =
      activeVersion?.consentRecordId != null
        ? this.getConsentRecord(activeVersion.consentRecordId)
        : null;

    return {
      profile,
      activeVersion,
      pronunciationRevision,
      consent,
    };
  }

  private getPronunciationRevision(pronunciationRevisionId: string) {
    const row = this.sqlite.database
      .prepare(
        `SELECT pronunciation_revision_id, profile_id, profile_version_number, locale, entries_json, content_hash
        FROM microdrama_character_voice_pronunciation_revisions WHERE pronunciation_revision_id = ?`
      )
      .get(pronunciationRevisionId) as PronunciationRow | undefined;
    return row ? parsePronunciationRow(row) : null;
  }

  private getConsentRecord(consentRecordId: string) {
    const row = this.sqlite.database
      .prepare(
        "SELECT payload_json FROM microdrama_character_voice_consent_records WHERE consent_record_id = ?"
      )
      .get(consentRecordId) as { payload_json: string } | undefined;
    return row
      ? characterVoiceConsentRecordPayloadSchema.parse(
          JSON.parse(row.payload_json) as unknown
        )
      : null;
  }
}

export function assertCharacterVoiceProfileVersionImmutable(
  database: DatabaseSync,
  profileVersionId: string
): void {
  const row = database
    .prepare(
      `SELECT status, provider, model_intent, voice_binding_status, provider_voice_id,
      canary_evidence_artifact_hash, consent_record_id, delivery_configuration_json,
      pronunciation_revision_id
      FROM microdrama_character_voice_profile_versions WHERE profile_version_id = ?`
    )
    .get(profileVersionId) as VersionRow | undefined;
  if (!row || row.status === "DRAFT") {
    return;
  }
  throw new CharacterVoiceProfileVersionImmutableError(
    "Activated or deprecated profile versions are immutable."
  );
}
