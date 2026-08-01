# Cloned-voice consent operations

Record the subject, immutable evidence artifact ID and SHA-256, permitted channels,
synthetic/commercial/multilingual permissions, validity interval, and revocation time.
Normal APIs return status only, not evidence or sensitive provider identifiers.

Before activation and every new generation verify: the record exists; evidence hash is
present; current time is within validity; it is not revoked; all three permissions are
true; and the target channel is listed. Expiration or revocation blocks new work but does
not alter historical artifacts or audit records. Audit activation, deprecation, policy
changes, overrides, retries, and replacements. Rotate settings by creating a new version.
