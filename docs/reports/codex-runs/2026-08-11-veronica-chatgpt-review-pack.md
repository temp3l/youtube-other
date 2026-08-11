# Veronica ChatGPT review pack

## Summary

Created an upload-ready ZIP for all 12 Veronica episode directories. It contains reviewable text/JSON/CSV source and planning artifacts plus 533 persisted OpenAI-call, image-provider metadata, and source-grounded QA records. Audio, image, and video files are excluded.

## Changed paths

- `artifacts/chatgpt-review/veronica-episodes-openai-calls/README.md`
- `artifacts/chatgpt-review/veronica-episodes-openai-calls.zip`
- `docs/reports/codex-runs/2026-08-11-veronica-chatgpt-review-pack.md`

## Tests/checks

- ZIP listing: 856 files, 12 episode directories.
- Archive extension scan: no audio, image, or video files.
- OpenAI evidence count: 533 records.

## Commit hash

`c4e786f742a75489bb1a725fa7fc07d50328d167`

## Unresolved risks

Historical OpenAI logs retain intentional prompt/image-payload redaction where no exact persisted prompt can be proven.
