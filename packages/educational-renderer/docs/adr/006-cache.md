# ADR 006: Cache design

Accepted. Content-addressed scene directories contain MP4 plus a versioned manifest. Strict SHA-256 keys,
root-anchored discovery/deletion, renderer/representation/byte/hash verification, and hard-link reuse
prevent path escape and false hits. Promotion uses a contained same-filesystem transaction: stage the new
pair, snapshot a validated prior pair, mark commit, install video then manifest, and validate before
cleanup. Recovery keeps a valid installed pair, otherwise restores the snapshot, or removes an incomplete
first promotion as miss/corrupt. A live validated lock prevents inspect/clean recovery. A lock is stale
only after its age threshold and when its owner PID is not live; age alone never removes a live lock.
Cache hits are hash-checked, not re-probed.

Every cache mutation rejects symlink components, stages replacements beside the destination, and promotes
on the same filesystem. Node does not expose portable `openat2` operations, so writable cache roots must
not be shared with hostile same-user processes that can rename directories during a system-call window.

Material writes preflight their actual target filesystem with a conservative frame/profile estimate plus
64 MiB. Unsupported `statfs` is non-fatal; actual ENOSPC is always typed as
`INSUFFICIENT_DISK_SPACE`.
Contracts reserve geometry/text/equation/theme layers for future independent materialization.
