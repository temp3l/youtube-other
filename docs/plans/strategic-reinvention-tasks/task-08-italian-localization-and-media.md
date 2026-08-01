# Task 08: Italian Localization And Locale Media

## Objective

Support Italian everywhere generic media locales are supported and derive reviewed localizations from the approved Italian canonical script.

## Dependencies And Parallelism

Depends on Task 03. Safe in parallel with Task 07.

## Exclusive Ownership

- Italian/general locale branches in `packages/story-localization/src/`
- Italian/general locale branches in `packages/speech/src/`
- Italian/general locale branches in `packages/metadata/src/`
- locale capability tests in alignment/rendering when production code is already generic
- relevant config/auth locale maps, but not CLI workflow composition

## Required Behavior

- Add Italian language profile, terminology/protected-term QA, narration pacing/pronunciation defaults, captions, metadata hints, and localized CTA fields.
- Keep existing profile target defaults unchanged.
- Require approved Italian parent fingerprint and locale-specific approval evidence.
- Enforce creator voice policy before speech dispatch.
- Persist scripts, subtitles, audio, metadata, and reports through canonical resolver intent.

## Verification

```bash
pnpm test:focused -- packages/story-localization/src/story-workflow-locales.unit.test.ts
pnpm test:focused -- packages/speech/src/voice-settings.unit.test.ts
pnpm test:focused -- packages/metadata/src/youtube-metadata.unit.test.ts
```

## Acceptance

Italian full/Short assets validate; English/Spanish derive from the exact approved Italian fingerprint; protected terms and CTA destinations produce visible review status; no existing default gains Italian silently.

Lead checkpoint: `feat(locale): add Italian multilingual media support`.
