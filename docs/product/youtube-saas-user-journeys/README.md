# YouTube SaaS/API user journeys

## Purpose and status

This is the canonical, implementation-neutral product-specification corpus for a multi-tenant, API-first YouTube production product. It records the user outcomes, integrity rules, and evidence-based current-state assessment needed before implementation planning. Status classifications are preliminary as of 2026-08-08 and cite repository evidence in the relevant story.

## Scope

The corpus covers SaaS frontend, supporting API, and external-client journeys from tenant setup through episode production, review, localization, publishing, operations, reuse, and retention. It does not prescribe tables, endpoint shapes, implementation waves, estimates, or delivery order.

## How to consume it later

A later planning pass should use the story index and coverage matrix to select bounded capability gaps; use the story files for behaviour and acceptance criteria; use the domain-state assessment to avoid UI-derived state; and resolve only the consolidated open questions before selecting a design. Existing code remains authoritative for current contracts.

## Conventions

`tenant` is the product boundary; current code often calls it `workspace`. An **episode** is editorial content; an **episode revision** is its immutable/revisioned production input. A **workflow run** is asynchronous execution, not the episode lifecycle. Validation, approval, rendering, and publication are distinct states. `source episode` and `localized derivative` are distinct. “Provider-free” means deterministic, server-side execution with no paid/external provider requirement.

Every story below follows the same baseline: tenant-scoped authorization; server-side credentials only; opaque identifiers; correlation IDs for async work; sanitized errors; and audit of authorized state-changing actions. A heading marked “N/A” means the property does not apply beyond that baseline.
