# Mathematics channel: paid-provider runbook

Math production is private and owner-attested. It supports paid narration and
deterministic rendering, but live YouTube publication is deliberately disabled.
The final command below creates a publish dry-run packet only.

```bash
pnpm install
cp .env.example .env
export MEDIAFORGE_OPENAI_COMPATIBLE_API_KEY='…'
export MEDIAFORGE_OPENAI_COMPATIBLE_BASE_URL=https://api.openai.com/v1
export YOUTUBE_CLIENT_ID='…'       # not used by math publish yet
export YOUTUBE_CLIENT_SECRET='…'   # not used by math publish yet
pnpm build
pnpm doctor

WORKSPACE=/tmp/mediaforge-math-private
SKILL=M5-ZO-001

pnpm mediaforge -- math curriculum validate
pnpm mediaforge -- math production plan \
  --skill "$SKILL" --variant standard --language de --private \
  --workspace "$WORKSPACE" --paid-speech --max-provider-cost-usd 5

pnpm mediaforge -- math production run \
  --skill "$SKILL" --variant standard --language de --private \
  --workspace "$WORKSPACE" --paid-speech --max-provider-cost-usd 5 \
  --render-executor local

# If interrupted, use the same arguments with `resume`.
pnpm mediaforge -- math production resume \
  --skill "$SKILL" --variant standard --language de --private \
  --workspace "$WORKSPACE" --paid-speech --max-provider-cost-usd 5 \
  --render-executor local

LESSON="${SKILL}-standard"
pnpm mediaforge -- math status --lesson "$LESSON" --workspace "$WORKSPACE"
pnpm mediaforge -- math publish --lesson "$LESSON" --workspace "$WORKSPACE" \
  --language de --dry-run
```

There is currently no supported live Math YouTube upload command. Do not use
the legacy `youtube upload` command with Math workspace artifacts; wait for the
approved Math publisher integration.
