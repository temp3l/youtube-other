import crypto from "node:crypto";

import type {
  PostgresClient,
  PostgresPool,
  PostgresQueryResult,
} from "./postgres-workflow-repository.js";

export const WEBHOOK_SIGNING_SECRET_MIGRATION = `
CREATE TABLE IF NOT EXISTS webhook_signing_secrets (
  workspace_id TEXT NOT NULL,
  endpoint_id TEXT NOT NULL,
  secret_version BIGINT NOT NULL CHECK (secret_version > 0),
  secret_ciphertext TEXT NOT NULL,
  overlap_until TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, endpoint_id, secret_version),
  FOREIGN KEY (workspace_id, endpoint_id) REFERENCES webhook_endpoints (workspace_id, endpoint_id)
);
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['webhook_signing_secrets']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS workspace_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY workspace_isolation ON %I USING (workspace_id = current_setting(''app.workspace_id'', true)) WITH CHECK (workspace_id = current_setting(''app.workspace_id'', true))',
      table_name
    );
  END LOOP;
END;
$$;
`;

interface SecretRow {
  readonly secret_ciphertext: string;
  readonly overlap_until: Date | string | null;
}

export class WebhookSigningSecretPersistenceError extends Error {}

function deriveKey(secret: string): Buffer {
  if (Buffer.byteLength(secret, "utf8") < 32)
    throw new Error("Webhook signing-secret encryption key must contain at least 32 bytes.");
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

function encrypt(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "aes256gcm",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join("$");
}

function decrypt(ciphertext: string, secret: string): string {
  const [algorithm, ivValue, tagValue, payloadValue] = ciphertext.split("$");
  if (algorithm !== "aes256gcm" || !ivValue || !tagValue || !payloadValue)
    throw new WebhookSigningSecretPersistenceError("Webhook secret ciphertext is invalid.");
  const key = deriveKey(secret);
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivValue, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(payloadValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export class PostgresWebhookSigningSecretRepository {
  public constructor(
    private readonly pool: PostgresPool,
    private readonly encryptionSecret: string
  ) {}

  public async migrate(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(WEBHOOK_SIGNING_SECRET_MIGRATION);
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

  public async storeSecret(input: {
    readonly workspaceId: string;
    readonly endpointId: string;
    readonly secretVersion: number;
    readonly secret: string;
    readonly now: string;
    readonly overlapUntil?: string;
  }): Promise<void> {
    if (
      !Number.isSafeInteger(input.secretVersion) ||
      input.secretVersion < 1 ||
      input.secret.length < 16
    )
      throw new WebhookSigningSecretPersistenceError(
        "Webhook signing secret version and value are required."
      );
    await this.transaction(input.workspaceId, async (client) => {
      await client.query(
        `INSERT INTO webhook_signing_secrets (
           workspace_id, endpoint_id, secret_version, secret_ciphertext, overlap_until, created_at
         ) VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz)`,
        [
          input.workspaceId,
          input.endpointId,
          input.secretVersion,
          encrypt(input.secret, this.encryptionSecret),
          input.overlapUntil ?? null,
          input.now,
        ]
      );
    });
  }

  public async resolveSecret(input: {
    readonly workspaceId: string;
    readonly endpointId: string;
    readonly secretVersion: number;
  }): Promise<string | null> {
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query<SecretRow>(
        `SELECT secret_ciphertext FROM webhook_signing_secrets
         WHERE workspace_id = $1 AND endpoint_id = $2 AND secret_version = $3`,
        [input.workspaceId, input.endpointId, input.secretVersion]
      );
      const row = result.rows[0];
      if (!row) return null;
      return decrypt(row.secret_ciphertext, this.encryptionSecret);
    });
  }

  public async setOverlapUntil(input: {
    readonly workspaceId: string;
    readonly endpointId: string;
    readonly secretVersion: number;
    readonly overlapUntil: string;
  }): Promise<void> {
    await this.transaction(input.workspaceId, async (client) => {
      await client.query(
        `UPDATE webhook_signing_secrets
         SET overlap_until = $1::timestamptz
         WHERE workspace_id = $2 AND endpoint_id = $3 AND secret_version = $4`,
        [
          input.overlapUntil,
          input.workspaceId,
          input.endpointId,
          input.secretVersion,
        ]
      );
    });
  }

  public async activeOverlapUntil(input: {
    readonly workspaceId: string;
    readonly endpointId: string;
    readonly beforeVersion: number;
    readonly evaluatedAt: string;
  }): Promise<string | null> {
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query<{ readonly overlap_until: Date | string | null }>(
        `SELECT overlap_until FROM webhook_signing_secrets
         WHERE workspace_id = $1 AND endpoint_id = $2 AND secret_version < $3
           AND overlap_until IS NOT NULL AND overlap_until > $4::timestamptz
         ORDER BY secret_version DESC LIMIT 1`,
        [
          input.workspaceId,
          input.endpointId,
          input.beforeVersion,
          input.evaluatedAt,
        ]
      );
      const row = result.rows[0];
      return row?.overlap_until === null || row?.overlap_until === undefined
        ? null
        : new Date(row.overlap_until).toISOString();
    });
  }
}

export function createPostgresWebhookSigningSecretResolver(
  repository: PostgresWebhookSigningSecretRepository
): {
  resolve(input: {
    readonly workspaceId: string;
    readonly handle: string;
    readonly version: number;
  }): Promise<string>;
} {
  return {
    resolve: async (input) => {
      const match = input.handle.match(
        /^mediaforge:\/\/workspaces\/([^/]+)\/webhook-endpoints\/([^/]+)$/u
      );
      if (!match?.[1] || !match[2])
        throw new Error("Webhook secret handle is not managed by MediaForge.");
      const secret = await repository.resolveSecret({
        workspaceId: match[1],
        endpointId: match[2],
        secretVersion: input.version,
      });
      if (!secret) throw new Error("Webhook signing secret is unavailable.");
      return secret;
    },
  };
}
