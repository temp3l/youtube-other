# Git tracking cleanup

## Changed files

- `.gitignore`
- Untracked from Git while retained locally: `.tmp/**`, `docs.bak/**`, `content-ideas/thumbnails-de/trash/**`, the duplicated Tafelmathe image-pack ZIP, timestamped Veronica bulk-review JSON files, and Veronica visual-review ZIP files
- `docs/reports/codex-runs/2026-08-09-git-tracking-cleanup.md`

## Tests and checks

- `git check-ignore -v --no-index` for each new ignore family
- Local path-existence checks for representative files from every untracked family
- Indexed blob-size comparison
- `git diff --check`
- Isolated mirror rewrite with `git-filter-repo`, followed by `git fsck --full`

## Results

- 82 generated, duplicate, backup, temporary, or discarded paths removed from the index
- All checked local files remain present
- Indexed content reduced from 197,095,671 to 145,683,049 bytes (51,412,622 bytes)
- Canonical `visual-review/bulk-visual-review.json` remains tracked
- Trial historical rewrite removed every targeted path and reduced the Git store from 123 MiB to 102 MiB

## Risks remaining

- Existing objects remain in the working repository history until an explicitly coordinated rewrite and force-push of 19 refs
- Git LFS is unavailable; `git-filter-repo` was installed only in a temporary trial location
- Remaining production PNG/audio assets still require a retention-versus-LFS decision

## Follow-up tasks

- Coordinate a maintenance window before rewriting shared remote refs
- Install and validate `git-filter-repo`, and optionally Git LFS, before historical migration
