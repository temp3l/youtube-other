# Story Rewrite Quality

The story rewrite pipeline treats the canonical English full narration as the source for full localizations and the approved English Short as the source for Short localizations. Full and Short prompts, output constraints, schemas, validation profiles, cache identities, and parent fingerprints must remain separate.

## Canonical Contract

Full story generation uses `FullStoryContract` plus the story IR, canonical facts, character rename map, prompt fingerprint, response schema fingerprint, and contract hash. Downstream localizations inherit the canonical English source hash and contract lineage so source changes invalidate dependent cache entries.

## Prompt Rules

English full rewrites must start with a concrete impossible detail, build scenes from observable actions and objects, use escalating experiments instead of investigation summaries, preserve one supernatural rule, dramatize emotional cost, and stop on a concrete final reveal. Short rewrites use the approved full story and follow: impossible hook, proof, rule, personal consequence, active climax, final reversal.

Localization is faithful adaptation, not fresh rewriting. It may adjust syntax, idiom, rhythm, sentence length, punctuation, and target-language flow, but must not summarize, delete required beats, replace scenes with generic descriptions, or invent a new ending.

## Gates And Repair

Provider output is parsed into narration-only schemas and then validated before persistence. Full-story validator failures now block generation callbacks instead of being ignored. The reusable quality gate reports categorized findings for missing characters/objects/endings, template leakage, abstract planning language, and source-length mismatch. Default full-localization ratio policy warns below `0.90` and blocks below `0.85`.

Repair should be targeted when possible. Full regeneration repair remains disabled unless explicitly configured; failed localized artifacts are preserved for forensic comparison under existing failure-output conventions.

## Metadata And Debugging

Metadata must be generated after final narration and use final localized word counts, duration estimates, language code, localized copy, and language-specific narration instructions from typed language profiles. Debug logs should include prompt version, schema version, source hash, cache key, raw response, parsed output, validation result, and repair result while excluding secrets and base64 media.

## Rollout

Existing artifacts are not rewritten automatically. New prompt fingerprints, validator behavior, contract hashes, and cache-key dimensions apply to new or explicitly regenerated stories. Validate old artifacts without modification, then regenerate with `stories rewrite-full --episode <id> --languages <codes> --force` and `stories rewrite-short --episode <id> --languages <codes> --force` when approved.
