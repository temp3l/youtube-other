# Episode 039 English/German Story Rewrite

Summary: Created canonical English and German full and short scripts for Episode 039. The rewrite gives
the changing photograph a consistent memory-erasure rule, concrete family history, a photographic
countermove, and a shared ending across both languages.

Changed files: `episodes/039-the-photograph-that-changed/languages/script-{en,de}.md`;
`episodes/039-the-photograph-that-changed/languages/short/script-{en,de}.md`;
`episodes/039-the-photograph-that-changed/source/039-the-photograph-that-changed-en-full.md`; this report.

Tests/checks: `pnpm mediaforge -- stories pipeline --episode 039-the-photograph-that-changed --locales
en,de --formats full,short --dry-run --json` passed and planned 46 stages. `pnpm exec prettier --check`
passed for all new files. Narration counts are EN/DE full 1161/1140 and short 183/189 words; path checks
and whitespace checks passed.

Risks remaining: The episode has authored canonical scripts only; no provider generation, approval,
audio, imagery, or render artifacts were produced.

Commit: not created.
