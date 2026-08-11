# Architecture review pack

Build a source-grounded repository pack without calling AI providers:

```bash
pnpm youtube audit build-review-pack --scope repository --output ./artifacts/review-packs --zip
```

The command writes an unpacked `youtube-architecture-review-<timestamp>/` directory and, by default, a ZIP beside it. Repository scope includes bounded source, configuration, tests, scripts, CI evidence, source indexes, static dependency analysis, and architecture/quality/operations reports. Smaller scopes are `image`, `speech`, `localization`, `publishing`, `qa`, and `episode-pipeline`.

Secret files, build output, dependencies, media, caches, symlinks, and oversized files are excluded. Obvious literals in mandatory evidence are redacted only in the generated copy. Use `--max-file-bytes` and `--max-source-bytes` to bound non-mandatory evidence; mandatory source is never silently truncated. ZIP output is created by default and may be requested explicitly with `--zip`.

The pack is deterministic for the same selected source and options except for timestamped output metadata. Upload the ZIP to ChatGPT, then ask it to verify conclusions against `source/` rather than trusting generated summaries. Regenerate after relevant repository changes.
