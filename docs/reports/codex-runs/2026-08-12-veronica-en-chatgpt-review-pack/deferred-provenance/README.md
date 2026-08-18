# Deferred v5 provenance evidence

These three source files are from `veronica-stories-editorial-master-v5`. The adjacent workspace manifests deliberately record a different, older Pack 1 source path. Persisted audio, timing, plans, and QA cache therefore cannot be claimed for the v5 revisions.

| Episode | Current v5 source | Existing workspace source | Required next step |
| --- | --- | --- | --- |
| L02-S01 | `l02-s01-selling-to-everyone-is-the-problem.v5.md` | Pack 1 `l02-s01-selling-to-everyone-is-the-problem.md` | Explicitly renew source, selected narration/audio, and timing as one provenance unit; then deterministically replan. |
| L02-S02 | `l02-s02-why-smaller-niches-can-make-you-bigger.v5.md` | Pack 1 `l02-s02-why-smaller-niches-can-make-you-bigger.md` | Same. |
| L05-S01 | `l05-s01-you-dont-need-a-publisher.v5.md` | Pack 1 `l05-s01-you-dont-need-a-publisher.md` | Same. |

The stale-workspace fail-closed rule prevents automatic replacement. No narration was replaced in this run. Do not infer that the current v5 sources have passed planning or QA merely because their old workspaces contain such artifacts.
