# ElevenLabs speech setup and secrets

Required backend environment:

```text
ELEVENLABS_FEATURE_ENABLED=false
ELEVENLABS_API_KEY=<secret reference at deployment>
ELEVENLABS_REQUEST_TIMEOUT_MS=60000
ELEVENLABS_BASE_URL=https://api.elevenlabs.io
```

The flag defaults off. Enabling without a key fails startup. The key belongs in the
deployment secret store (Azure Key Vault in Azure deployments), injected as an
environment secret; never place it in episode config, profile JSON, CLI arguments,
frontend configuration, logs, fixtures, or reports. A custom base URL requires an
explicit deployment hostname allowlist and HTTPS origin validation.

Import the example profile as DRAFT, replace the backend-managed voice ID and consent
reference, validate it, run listening tests, then activate the version. Activation does
not change any genre. Set the pilot genre policy separately after approval.

Pricing records are versioned data. Configure provider and genre monthly character hard
limits. At 80% the API/UI warns; at 100% reservation fails before provider dispatch.
Actual usage reconciles the reservation. Cached generations record zero new usage.
