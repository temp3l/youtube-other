# Story Rewrite Quality Hardening

Changed files: `packages/story-localization/src/story-generation-contracts.ts`, `story-quality-gate.ts`, `story-localization.service.ts`, `story-prompt-module-registry.ts`, `story-quality-gate.unit.test.ts`, `story-prompt-compiler.unit.test.ts`, `docs/story-rewrite-quality.md`, `docs/README.md`.

Summary: strengthened full/Short prompt separation, faithful localization instructions, concrete narration requirements, abstract planning-language detection, source-length ratio findings, and made full-story validation callback failures block before persistence.

Tests/checks: `pnpm test:focused -- packages/story-localization/src/story-quality-gate.unit.test.ts packages/story-localization/src/story-prompt-compiler.unit.test.ts` passed; `pnpm --filter @mediaforge/story-localization typecheck` passed.

Episode 030 check: current English full is 1556 words; localized fulls are de 741, es 659, fr 684, pt 661, all below the new 0.85 ratio gate. Existing localized Shorts also omit many literal protected anchors in a crude grep and require regeneration.

Risks: no provider regeneration was run; localized protected-element grep undercounts translated terms. Existing legacy artifacts remain unchanged.

Follow-up: simulate/inspect prompts, then regenerate Episode 030 explicitly with `stories rewrite-full` and `stories rewrite-short` using approved provider settings.
