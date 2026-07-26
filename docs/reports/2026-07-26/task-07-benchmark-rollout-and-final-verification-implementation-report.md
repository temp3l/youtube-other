# Task 07 Benchmark Rollout And Final Verification

Commit: `8991a79`

Summary: Implemented the provider-free portions of
`docs/remote-rendering/tasks/task-07-benchmark-rollout-and-final-verification.md`:
the required CLI selection and resource authorization, temporary outputs,
native/container/remote/hybrid cold/warm matrix, strict input/output schemas,
unavailable-versus-zero metrics, ratio/speedup/throughput/overlap gates,
redacted receipts, local-default recommendation, configuration examples,
architecture guidance, rollback, and operations documentation.

Changed paths: `.env.example`; CLI benchmark/hybrid/remote/workflow files;
config defaults/tests; math-rendering benchmark contract and exports; media,
commands, and remote operations docs; reports.

Tests/checks: Task 06 scheduler 5/5, CLI gate 1/1, CLI typecheck passed;
Task 07 benchmark 2/2 after one stale-dist repair; diff check passed. Targeted
lint retained the pre-existing remote quoting finding.

Unresolved risks: The post-change CLI typecheck was not run because Task 06
consumed the authorized typecheck. No deployment, preflight, real render/QA,
image ID, timing/ratio, cache/transfer, overlap, reassignment, cleanup,
publication, or default change ran. Retain `local` pending authorized staged
verification and a passing `<=0.80` warm ratio.
