# Copy latest episodes

Date: 2026-08-14

Summary: Copied the four newest non-archive episode directories (by modification time) into a dedicated `episodes/latest-episodes/` folder.

Changed paths:

- `episodes/latest-episodes/01a-revenue-is-not-a-good-business/`
- `episodes/latest-episodes/02b-stop-posting-where-your-customers-arent/`
- `episodes/latest-episodes/03b-the-promise-formula/`
- `episodes/latest-episodes/08b-prospecting-without-being-annoying/`
- `docs/reports/codex-runs/2026-08-14-copy-latest-episodes.md`

Tests/checks: Confirmed four copied directories, 1,069 files, and a 129 MB destination size.

Commit: `492543b`

Unresolved risks: “Latest” is based on directory modification times; if a different selection rule was intended, the copy set may need adjustment.
