Summary: Removed the active batch state stores only, leaving stale copy folders and unrelated episode-level `.batch` directories untouched.

Changed paths:
- `content-ideas/content/dark-truth-episodes/.batch`
- `episodes/.batch`
- `episodes/011-the-black-eyed-children/state/image-generation/.batch`
- `episodes/022-the-whistler-in-the-woods/state/image-generation/.batch`

Tests/checks:
- `rm -rf content-ideas/content/dark-truth-episodes/.batch episodes/.batch episodes/011-the-black-eyed-children/state/image-generation/.batch episodes/022-the-whistler-in-the-woods/state/image-generation/.batch`
- shell existence check for each removed path

Results: All four targeted active batch directories were removed successfully.

Risks/follow-up: This deleted local batch history, manifests, retry lineage, and downloaded results for the targeted stores. Stale/copy batch folders still exist elsewhere in the repo and were not removed by request.

Commit: `96bc991b4f481e79eabaf0d4c4949f9ef50da7db`
