# True hybrid math rendering task pack

## Changed paths

- `docs/remote-rendering/README.md`
- `docs/remote-rendering/tasks/task-01-portable-render-contract-and-executor.md`
- `docs/remote-rendering/tasks/task-02-bounded-scene-concurrency-and-cache.md`
- `docs/remote-rendering/tasks/task-03-docker-math-render-worker.md`
- `docs/remote-rendering/tasks/task-04-ssh-transport-deployment-and-operations.md`
- `docs/remote-rendering/tasks/task-05-math-workflow-remote-integration.md`
- `docs/remote-rendering/tasks/task-06-batch-render-overlap-and-resume.md`
- `docs/remote-rendering/tasks/task-07-benchmark-rollout-and-final-verification.md`

## Tests and checks

- Documentation path/link and whitespace checks only; no code tests required.
- No Docker build, SSH connection, remote render, provider call, or publication.

## Result and risks

The seven-task pack now requires scene-level sharding across concurrent local
and VPS Docker lanes. Final concat, narration mux, and QA remain local; remote
shards never receive audio. Implementation remains pending. Performance depends
on measured worker throughput and must pass the 20% warm-hybrid gate.
