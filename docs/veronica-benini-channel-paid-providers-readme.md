# Veronica Benini channel: current status

There is no supported command sequence for generating or publishing a paid-
provider Veronica Benini video yet.

The repository currently defines `strategic-reinvention` and the separate
`veronica-benini` creator profile, but the profile is discovery-only,
voice-disabled, synthetic narration is disabled, and `autoPublish` is always
false. The CLI does not register a Veronica production workflow or a live
publisher. Do not substitute Dark Truth or the generic dynamic-genre profile:
the creator identity and policy must remain separate.

The currently available, non-publishing analysis command is:

```bash
pnpm install
cp .env.example .env
export OPENAI_API_KEY='…'
pnpm build

pnpm mediaforge -- stories dynamic analyze \
  --input <story-or-outline.txt> \
  --input-type story \
  --content-id <episode-id> \
  --revision <revision> \
  --locale it \
  --budget standard \
  --json
```

This produces a trusted analysis/resolved configuration artifact; it does not
generate narration, images, video, or a YouTube upload. A paid end-to-end
runbook can be added only after the dedicated profile workflow, rights/offer
evidence, voice policy, approvals, and generic publisher are activated.
