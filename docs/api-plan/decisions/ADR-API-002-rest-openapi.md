# ADR-API-002: REST and OpenAPI

- **Status:** Board accepted
- **Date:** 2026-07-31
- **Confidence:** High

## Question

Which external protocol represents the product?

## Repository evidence

No real HTTP contract/framework exists. Operations are resource-oriented, asynchronous, and intended for non-TypeScript integrations.

## Options

REST/OpenAPI supports language-neutral SDKs, HTTP idempotency and job resources; tRPC is convenient but TypeScript-coupled; GraphQL is flexible for mature reads but complicates cost, auth, cache, and mutations.

## Impacts

OpenAPI adds schema/drift discipline and a stable security boundary. Operations remain conventional. Migration needs explicit public/internal adapters.

## Recommendation

REST under `/v1`, OpenAPI 3.1, Problem Details, cursor pagination, high-level async commands. tRPC may be private later; GraphQL is deferred.

## Conditions that change it

A dominant first-party TypeScript-only client or mature cross-resource analytics demand could justify an additional private tRPC or read-only GraphQL surface without replacing use cases.

## Consequences

The OpenAPI contract is reviewed authority and is not a dump of internal domain types.
