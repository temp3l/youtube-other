# Localization Quality Hardening

Root cause: heuristic facts and production artifacts could fall back to titles, first sentences, or scaffold prose, then cache/protect those weak values.

Changed files: `packages/story-localization/src/canonical-facts.service.ts`, `story-localization-cache.ts`, `story-quality-gate.ts`, `story-production.ts`, prompt compiler/modules, short repair prompt, schemas/types, story facts persistence, quality/cache tests, Episode 027 fixtures.

Invalid cache fields found: old facts/cache entries lacked source narration hash, prompt template hash, extractor/schema versions, reasoning effort, locale/variant, quality gate version, and protected-elements version; readers now treat them as stale.

Prompts updated: full rewrite, localization via shared full compiler, shorts, and targeted short repair now require concrete hooks, story-specific escalation, supernatural rule, preserved anchors, and emotional-cost climax.

Validators added: title-as-setting, empty object anchors, copied threat, scaffold reveals/rules, duplicate paragraphs, generic localization filler, short outlines, missing names/objects/locations/rule/emotional cost.

Fixtures added: Episode 027 bad duplicate full, German filler, and outline short cases.

Commands run: `pnpm test:focused -- packages/story-localization/src/story-quality-gate.unit.test.ts`; `pnpm test:focused -- packages/story-localization/src/story-localization-cache.unit.test.ts`; `pnpm --filter @mediaforge/story-localization typecheck`; `git diff --check -- <touched files>`.

Paid API calls: avoided.

Risks: deterministic Episode 027 extraction is heuristic; broader real-output corpus validation was not run.
