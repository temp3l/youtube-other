# Dependency And Build Impact

## Candidate removable workspace references

- `@mediaforge/pipeline` from `apps/cli` and `apps/api`.
- `@mediaforge/persistence` from `apps/api` if API no longer opens SQLite.
- Pipeline-only references in package manifests after import removal.

## External dependencies

No external dependency can be removed solely from current evidence. `commander`, `zod`, `pino`, `sharp`, `googleapis`, `openai`, and `dotenv` all have active Dark Truth usage or plausible shared usage.

## Build wiring

- Root `pnpm build`, `typecheck`, and test scripts are broad and should not be used as first validation.
- `apps/api/package.json` depends on `@mediaforge/pipeline`; update after API replacement.
- `apps/cli/package.json` depends on all active packages and `@mediaforge/pipeline`; remove only after CLI root command migration.
- `pnpm-lock.yaml` cleanup happens after dependency removal, not before.

## TypeScript/path aliases

No separate TS path alias map was found beyond workspace package resolution. Build impact is package import and package manifest based.

## CI/CD

No root `.github` was present in this workspace. `tools/whisper.cpp/.github` is third-party/tooling and unrelated. Docker/Kubernetes/Terraform wiring was not found.

## Evidence requirement

Before removing any dependency:

```text
rg "@mediaforge/pipeline|from \"<dependency>\"|require\\(\"<dependency>\"\\)" apps packages scripts
pnpm --filter <affected-package> typecheck
pnpm test:focused -- <affected-test-file>
```
