Summary: Created canonical review scripts for episode 028 in the authored-script layout used by the resolver. Added English and German `full` and `short` story files under the episode workspace so they can be reviewed before any video-generation step.

Changed paths: `episodes/028-the-man-in-the-attic/languages/script-en.md`, `episodes/028-the-man-in-the-attic/languages/script-de.md`, `episodes/028-the-man-in-the-attic/languages/short/script-en.md`, `episodes/028-the-man-in-the-attic/languages/short/script-de.md`

Tests/checks: `find episodes/028-the-man-in-the-attic/languages -maxdepth 2 -type f | sort`; `wc -w episodes/028-the-man-in-the-attic/languages/script-en.md episodes/028-the-man-in-the-attic/languages/script-de.md episodes/028-the-man-in-the-attic/languages/short/script-en.md episodes/028-the-man-in-the-attic/languages/short/script-de.md`; `git diff --check -- episodes/028-the-man-in-the-attic/languages/script-en.md episodes/028-the-man-in-the-attic/languages/script-de.md episodes/028-the-man-in-the-attic/languages/short/script-en.md episodes/028-the-man-in-the-attic/languages/short/script-de.md`

Commit hash: `0888508`

Unresolved risks: These are freshly authored review drafts, not provider-generated outputs from the current CLI rewrite flow. Story quality, tone, and pacing still need human approval before downstream production.
