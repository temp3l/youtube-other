import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  assertTikTokCredentialHandleForAccount,
  buildTikTokCredentialHandle,
  tikTokCredentialSecretReferenceSchema,
  tikTokOAuthCredentialPayloadSchema,
  tikTokSecretStoreAvailabilitySchema,
  type TikTokCredentialSecretReference,
  type TikTokOAuthCredentialPayload,
  type TikTokSecretStoreAvailability,
} from "./tiktok-secret-store-contracts.js";
import type { TikTokSecretStorePort } from "./tiktok-secret-store-port.js";

type SecretEnvelope = {
  readonly schemaVersion: "mediaforge.tiktok-secret-store.v1";
  readonly credentialVersionId: string;
  readonly storedAt: string;
  readonly revokedAt?: string;
  readonly overlapUntil?: string;
  readonly ciphertext: string;
};

function deriveKey(secret: string): Buffer {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error(
      "TikTok secret-store encryption key must contain at least 32 bytes."
    );
  }
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
  if (algorithm !== "aes256gcm" || !ivValue || !tagValue || !payloadValue) {
    throw new Error("TikTok credential ciphertext is invalid.");
  }
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

function accountDirectory(input: {
  readonly storeRoot: string;
  readonly workspaceId: string;
  readonly accountId: string;
}): string {
  return path.join(input.storeRoot, input.workspaceId, input.accountId);
}

function secretFilePath(input: {
  readonly storeRoot: string;
  readonly workspaceId: string;
  readonly accountId: string;
  readonly credentialVersionId: string;
}): string {
  const digest = crypto
    .createHash("sha256")
    .update(input.credentialVersionId, "utf8")
    .digest("hex");
  return path.join(accountDirectory(input), `${digest}.secret.json`);
}

export class LocalEncryptedTikTokSecretStore implements TikTokSecretStorePort {
  public constructor(
    private readonly options: {
      readonly storeRoot: string;
      readonly encryptionKey: string;
    }
  ) {}

  public availability(): TikTokSecretStoreAvailability {
    if (Buffer.byteLength(this.options.encryptionKey, "utf8") < 32) {
      return tikTokSecretStoreAvailabilitySchema.parse({
        available: false,
        reason: "TikTok secret-store encryption key is not configured.",
      });
    }
    return tikTokSecretStoreAvailabilitySchema.parse({ available: true });
  }

  private async readEnvelope(input: {
    readonly workspaceId: string;
    readonly accountId: string;
    readonly credentialVersionId: string;
  }): Promise<SecretEnvelope | null> {
    const filePath = secretFilePath({
      storeRoot: this.options.storeRoot,
      workspaceId: input.workspaceId,
      accountId: input.accountId,
      credentialVersionId: input.credentialVersionId,
    });
    try {
      const raw = await fs.readFile(filePath, "utf8");
      return JSON.parse(raw) as SecretEnvelope;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  private async writeEnvelope(input: {
    readonly workspaceId: string;
    readonly accountId: string;
    readonly credentialVersionId: string;
    readonly envelope: SecretEnvelope;
  }): Promise<void> {
    const directory = accountDirectory({
      storeRoot: this.options.storeRoot,
      workspaceId: input.workspaceId,
      accountId: input.accountId,
    });
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const filePath = secretFilePath({
      storeRoot: this.options.storeRoot,
      workspaceId: input.workspaceId,
      accountId: input.accountId,
      credentialVersionId: input.credentialVersionId,
    });
    await fs.writeFile(
      filePath,
      `${JSON.stringify(input.envelope, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 }
    );
  }

  public async storeCredential(input: {
    readonly workspaceId: string;
    readonly accountId: string;
    readonly credentialVersionId: string;
    readonly payload: TikTokOAuthCredentialPayload;
    readonly storedAt: string;
  }): Promise<TikTokCredentialSecretReference> {
    const handle = buildTikTokCredentialHandle({
      workspaceId: input.workspaceId,
      accountId: input.accountId,
    });
    const payload = tikTokOAuthCredentialPayloadSchema.parse(input.payload);
    const envelope: SecretEnvelope = {
      schemaVersion: "mediaforge.tiktok-secret-store.v1",
      credentialVersionId: input.credentialVersionId,
      storedAt: input.storedAt,
      ciphertext: encrypt(JSON.stringify(payload), this.options.encryptionKey),
    };
    await this.writeEnvelope({
      workspaceId: input.workspaceId,
      accountId: input.accountId,
      credentialVersionId: input.credentialVersionId,
      envelope,
    });
    return tikTokCredentialSecretReferenceSchema.parse({
      schemaVersion: "mediaforge.tiktok-secret-store.v1",
      handle,
      credentialVersionId: input.credentialVersionId,
    });
  }

  public async resolveCredential(input: {
    readonly workspaceId: string;
    readonly accountId: string;
    readonly handle: string;
    readonly credentialVersionId: string;
  }): Promise<TikTokOAuthCredentialPayload> {
    assertTikTokCredentialHandleForAccount({
      handle: input.handle,
      workspaceId: input.workspaceId,
      accountId: input.accountId,
    });
    const envelope = await this.readEnvelope({
      workspaceId: input.workspaceId,
      accountId: input.accountId,
      credentialVersionId: input.credentialVersionId,
    });
    if (!envelope) {
      throw new Error("TikTok credential secret is unavailable.");
    }
    if (envelope.revokedAt !== undefined) {
      throw new Error("TikTok credential secret is revoked.");
    }
    const plaintext = decrypt(envelope.ciphertext, this.options.encryptionKey);
    return tikTokOAuthCredentialPayloadSchema.parse(JSON.parse(plaintext));
  }

  public async rotateCredential(input: {
    readonly workspaceId: string;
    readonly accountId: string;
    readonly previousHandle: string;
    readonly previousCredentialVersionId: string;
    readonly credentialVersionId: string;
    readonly payload: TikTokOAuthCredentialPayload;
    readonly storedAt: string;
    readonly overlapUntil?: string;
  }): Promise<TikTokCredentialSecretReference> {
    assertTikTokCredentialHandleForAccount({
      handle: input.previousHandle,
      workspaceId: input.workspaceId,
      accountId: input.accountId,
    });
    const previousEnvelope = await this.readEnvelope({
      workspaceId: input.workspaceId,
      accountId: input.accountId,
      credentialVersionId: input.previousCredentialVersionId,
    });
    if (!previousEnvelope) {
      throw new Error("TikTok credential secret rotation source is missing.");
    }
    await this.writeEnvelope({
      workspaceId: input.workspaceId,
      accountId: input.accountId,
      credentialVersionId: input.previousCredentialVersionId,
      envelope: {
        ...previousEnvelope,
        ...(input.overlapUntil ? { overlapUntil: input.overlapUntil } : {}),
      },
    });
    return this.storeCredential({
      workspaceId: input.workspaceId,
      accountId: input.accountId,
      credentialVersionId: input.credentialVersionId,
      payload: input.payload,
      storedAt: input.storedAt,
    });
  }

  public async revokeCredential(input: {
    readonly workspaceId: string;
    readonly accountId: string;
    readonly handle: string;
    readonly credentialVersionId: string;
    readonly revokedAt: string;
  }): Promise<void> {
    assertTikTokCredentialHandleForAccount({
      handle: input.handle,
      workspaceId: input.workspaceId,
      accountId: input.accountId,
    });
    const envelope = await this.readEnvelope({
      workspaceId: input.workspaceId,
      accountId: input.accountId,
      credentialVersionId: input.credentialVersionId,
    });
    if (!envelope) {
      throw new Error("TikTok credential secret is unavailable.");
    }
    await this.writeEnvelope({
      workspaceId: input.workspaceId,
      accountId: input.accountId,
      credentialVersionId: input.credentialVersionId,
      envelope: {
        ...envelope,
        revokedAt: input.revokedAt,
      },
    });
  }
}
