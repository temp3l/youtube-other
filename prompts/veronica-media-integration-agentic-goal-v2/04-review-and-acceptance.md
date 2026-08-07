# Independent Review and Acceptance

## Persona

Act as an independent principal engineer, video-pipeline architect, security reviewer, and QA lead.

Do not trust implementation summaries. Inspect code, generated artifacts, and test evidence.

# 1. Functional acceptance

Verify a representative Veronica episode can:

- ingest narration + mixed media
- revise narration
- preserve original traceability
- produce stable semantic anchors
- link claims/sources/media
- generate multi-state visual sequences
- translate embedded text
- adapt/redesign a dense slide
- produce genuinely separate 16:9 and 9:16 plans
- evaluate hard approval eligibility
- resolve timing from final narration alignment
- render both outputs with FFmpeg
- export a redacted approval pack
- calculate regeneration scope
- resume after partial completion

# 2. History-enhancement reuse review

Verify generic lessons were incorporated without importing history-specific semantics.

Check:

- plan/schema versioning
- hard approval gate
- semantic anchors
- asset reuse
- multi-state planning
- provenance
- claim/source linkage
- deterministic text-heavy graphics
- ratio-specific planning
- duration contract
- fallback transparency
- review-pack generation
- bulk-review extension
- metrics
- regeneration boundaries

Reject duplicate generic infrastructure if a stable shared implementation already exists.

Also reject unsafe coupling to history-specific semantics.

# 3. Concurrent-session safety review

Inspect Git diff and `MERGE-STATUS.md`.

Verify:

- unrelated history changes were not reverted
- external dirty files were not overwritten
- destructive Git commands were not used
- shared conflicts were serialized or deferred
- adapters were used where appropriate
- remaining merge steps are documented

If history changed shared contracts during this run, re-audit compatibility.

# 4. Contract/type safety

Verify:

- strict TypeScript
- runtime validation at trust boundaries
- exhaustive unions
- stable schema versions
- deterministic hashing/serialization
- no unsafe casts masking invalid input
- explicit error codes

# 5. Security

Test/review:

- path traversal
- malicious archives
- oversized/decompression-bomb inputs
- MIME mismatch
- malformed media
- SVG active content
- FFmpeg command injection
- arbitrary filter injection
- temporary-file isolation
- tenant cache isolation
- tampered manifests
- redaction
- cleanup safety

# 6. FFmpeg correctness

Verify:

- argument-array execution
- validated typed operations only
- deterministic crop/timing values
- timeout/cancellation
- sanitized stderr
- output validation
- both aspect ratios
- no complex document layout delegated directly to FFmpeg

# 7. Compatibility

Prove unchanged defaults for:

- history
- horror
- math
- generic auto-genre
- Veronica without supplemental media
- all other discovered genres

Check:

- schemas
- cache keys
- output artifacts
- planner defaults
- renderer defaults
- CLI/API behavior

# 8. Performance/reliability

Review:

- bounded concurrency
- large-document behavior
- memory use
- extraction limits
- cache reuse
- duplicate-work prevention
- regeneration minimization
- resumability
- failure isolation
- intermediate cleanup

# 9. Approval-pack quality

Inspect a generated pack.

Verify:

- readable contact sheets
- clear source-to-placement traceability
- visible approval eligibility
- explicit fallback decisions
- translated text evidence
- landscape/portrait evidence
- no secret/local-path leakage
- checksums and versions

# 10. Planner-quality metrics

Verify metrics are meaningful.

At minimum:

- asset utilization
- fallback ratio
- low-confidence placements
- approval-required rate
- untranslated text
- portrait failures
- anchor failures
- semantic coverage
- dwell durations
- redesign frequency
- cache hit ratio

# 11. Validation strategy

Use focused validation first.

Run full repository gates only if:

- shared code changed materially
- final acceptance policy requires it
- cross-genre compatibility cannot otherwise be established

Document exact commands.

# 12. Final artifacts

Produce:

```text
docs/architecture/veronica-supplemental-media/
├── FINAL-REVIEW.md
├── MERGE-STATUS.md
└── ACCEPTANCE-MATRIX.md
```

Final review must contain:

1. verdict
2. exact commands run
3. tests/results
4. render fixture evidence
5. artifact-pack evidence
6. security findings
7. compatibility findings
8. concurrency/merge findings
9. performance findings
10. unresolved issues
11. recommended follow-up

# 13. Severity and verdict

Severity:

```text
blocker
critical
high
medium
low
informational
```

Do not accept unresolved blocker/critical/high findings.

Verdict must be one of:

```text
ACCEPTED
ACCEPTED_WITH_MEDIUM_RISKS
REJECTED
BLOCKED_BY_CONCURRENT_INTEGRATION
```

Use `BLOCKED_BY_CONCURRENT_INTEGRATION` only when implementation is otherwise complete but a shared contract cannot safely be integrated while another session owns it.
