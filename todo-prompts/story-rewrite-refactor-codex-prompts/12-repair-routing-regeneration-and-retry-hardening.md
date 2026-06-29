# Task: Repair Routing, Regeneration, And Retry Hardening

Unify repair, regeneration, incomplete-response handling, and retry policy with variant safety.

## Required Types

Use repository conventions with equivalent semantics:

```ts
type StoryGenerationPurpose =
  | "canonical-full"
  | "localized-full"
  | "canonical-short"
  | "localized-short";

type RepairScope =
  | "field"
  | "sentence"
  | "paragraph"
  | "paragraph-range"
  | "opening"
  | "hook"
  | "ending"
  | "full-regeneration"
  | "short-regeneration";
```

## Routing Policy

- Full story never enters short regeneration.
- Short story never enters full regeneration with full output targets.
- Short fragment repair receives only short-local context and parent contract excerpts.
- Global short failures use configured short model.
- Global full localization failures use localization model.
- Token exhaustion is variant-specific.
- Retry caps are variant-specific.
- Request fingerprints include variant and parent artifact hash.

## Incomplete Responses

Detect `response.incomplete_details?.reason === "max_output_tokens"` and equivalent SDK shapes. Persist partial response metadata, usage, incomplete reason, and failed cost. Do not retry the same unchanged request.

## Tests

Add tests for:

- max-output exhaustion on localized full;
- max-output exhaustion on short;
- deterministic validation failure blocks retry where repair cannot help;
- short repair prompt excludes full payload and metadata;
- fingerprint duplicate failure suppression.

## Acceptance Criteria

- Repair and regeneration are purpose-aware.
- Full and short retry logic cannot cross routes.
- Failed and incomplete calls are observable and costed.
