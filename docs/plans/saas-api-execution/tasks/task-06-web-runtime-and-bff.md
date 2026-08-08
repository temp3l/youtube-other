# Task 06: Web Runtime And BFF

## Objective

Turn `apps/web` from a rendering library into the Task 00-selected deployable SaaS
runtime with a secure browser-to-API boundary.

## Depends On

Tasks 00–01.

## Scope

- Add only the approved web framework/runtime and its focused test setup.
- Implement the application shell, routing, error boundaries, loading/empty states,
  accessible navigation, and environment validation.
- Keep API tokens server-side through the approved BFF/session model.
- Add CSRF, secure-cookie, content-security-policy, request-size, and safe redirect
  defaults appropriate to the chosen stack.
- Reuse `@mediaforge/api-sdk`; do not duplicate transport types or business logic.

## Out Of Scope

Product screens beyond a signed-out page and authenticated empty shell, public
registration, billing, and direct browser access to worker/provider credentials.

## Acceptance

- The web runtime starts with local configuration and renders both shell states.
- No bearer token or secret reaches browser HTML, logs, or client storage.
- Focused routing/security/render tests and `@mediaforge/web` typecheck pass.
- New dependencies are minimal, justified, and lockfile changes are isolated.

## Reports

Create the plan implementation report and Codex run report required by the pack README.
