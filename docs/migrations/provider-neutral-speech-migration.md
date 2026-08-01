# Provider-neutral speech migration and rollback

The PostgreSQL migration is additive and transactional. It creates tenant-RLS consent,
profile/version, policy/override, generation/transition/chunk, cache authority,
pricing/usage, and quota-reservation tables and indexes. An idempotent backfill creates an
active system OpenAI profile/version from existing configuration. Existing audio and
legacy metadata are retained; link historical generations where identity is available.

Apply code and schema with ElevenLabs disabled. Verify OpenAI through the shared adapter,
then enable ElevenLabs in development and staging. Rollback disables new speech dispatch
and reverts callers to the compatibility wrapper; it does not drop tables or artifacts.
Physical schema rollback is intentionally deferred until retention and audit obligations
expire. Constraints are added with new tables, avoiding locks on legacy audio metadata.
