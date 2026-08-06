# Napoleon live research + V3.3 ZIP regen

Summary: ran History V3.3 live research for Napoleon (`retrieve-sources
--live-research --refresh-source`), then assess/evaluate/freeze/plan/validate
from the frozen snapshot, and regenerated ChatGPT approval ZIPs. Raised OpenAI
History provider/client timeouts (default 5m, overridable via
`OPENAI_HISTORY_TIMEOUT_MS`) after 120s aborts.

Changed paths: `apps/cli/src/index.ts`; `packages/history/src/history-research-v33.ts`;
episode `source/history-v3.3/` snapshot/plan (gitignored under episodes); ignored
`artifacts/chatgpt-review/*napoleon*-v3.3*` and combined `history-approval-packs-v3.3*`.

Tests: CLI/history rebuild; live retrieve-sources exit 0; ZIP listing + sha256sum.

Upload ZIPs:
- `artifacts/chatgpt-review/history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia-v3.3.zip` (`adca1409…5d9f`)
- combined `artifacts/chatgpt-review/history-approval-packs-v3.3.zip` (`e3d5801f…b96d`)

Napoleon: claims 114; sources/evidence 1/1; assessments 114; unresolved material
114; snapshot `6f77f4a7…`; plan `bedef359…`. Gates: structural reviewable;
editorial/content/production blocked (unresolved claims, maps/diagrams withheld,
timing measurement).

Risks: only one retrieved source/fragment; all claims still blocking; assess/
evaluate stages reused frozen snapshot (paid assess already ran inside
retrieve-sources). Timeout change not committed.
