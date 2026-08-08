import { describe, expect, it } from "vitest";

import { resolveProviderHealthStatus } from "./provider-health-resolver.js";
import {
  evaluateReservationAdmission,
  reconcileReservationTransition,
  releaseReservationTransition,
} from "./usage-reservation-lifecycle.js";
import {
  projectQuotaDimensionStatus,
  projectUsageEstimate,
} from "./usage-estimate-projector.js";

const freshness = "2026-08-08T12:00:00.000Z";

describe("usage reservation lifecycle", () => {
  it("blocks hard-limit reservations without creating an effect", () => {
    const admission = evaluateReservationAdmission({
      limitUnits: 100,
      reservedUnits: 80,
      settledUnits: 10,
      requestedUnits: 30,
      enforcement: "hard",
    });
    expect(admission.allowed).toBe(false);
    expect(admission.reason).toBe("hard_limit_exceeded");
  });

  it("allows soft-limit overflow with warning", () => {
    const admission = evaluateReservationAdmission({
      limitUnits: 100,
      reservedUnits: 80,
      settledUnits: 10,
      requestedUnits: 30,
      enforcement: "soft",
    });
    expect(admission.allowed).toBe(true);
    expect(admission.warning).toBe(true);
    expect(admission.reason).toBe("soft_limit_exceeded");
  });

  it("reconciles reserved capacity to measured actual usage", () => {
    const transition = reconcileReservationTransition({
      reservationId: "reservation-1",
      fromState: "reserved",
      reservedUnits: 50,
      actualUnits: 42,
    });
    expect(transition.toState).toBe("settled");
    expect(transition.settledUnits).toBe(42);
  });

  it("releases unused reservations", () => {
    const transition = releaseReservationTransition({
      reservationId: "reservation-2",
      fromState: "reserved",
      reservedUnits: 25,
    });
    expect(transition.toState).toBe("released");
  });
});

describe("usage estimate projection", () => {
  it("marks provider-free fixtures as zero external cost with full reuse", () => {
    const estimate = projectUsageEstimate({
      dimension: "speech_characters",
      estimatedUnits: 1200,
      cacheHitExpected: false,
      providerFreeFixture: true,
      projectedAt: freshness,
    });
    expect(estimate.billableUnits).toBe(0);
    expect(estimate.externalCostMinor).toBe(0);
    expect(estimate.basis).toBe("provider_free_fixture");
    expect(estimate.cacheReuseEffect).toBe("full_reuse");
    expect(estimate.confidence).toBe("authoritative");
  });

  it("identifies cache reuse as eliminating billable units", () => {
    const estimate = projectUsageEstimate({
      dimension: "speech_characters",
      estimatedUnits: 800,
      cacheHitExpected: true,
      projectedAt: freshness,
    });
    expect(estimate.billableUnits).toBe(0);
    expect(estimate.basis).toBe("cache_reuse");
  });

  it("projects remaining dimension capacity after settlement", () => {
    const status = projectQuotaDimensionStatus({
      dimension: "active_workflows",
      limitUnits: 10,
      reservedUnits: 3,
      settledUnits: 4,
      enforcement: "hard",
    });
    expect(status.availableUnits).toBe(3);
  });
});

describe("provider health resolver", () => {
  it("maps stale probes to degraded health", () => {
    const health = resolveProviderHealthStatus({
      providerId: "openai",
      scope: "speech",
      configured: true,
      supportedInProfile: true,
      probeStale: true,
      freshness,
    });
    expect(health.state).toBe("degraded");
  });

  it("requires explicit fallback when degraded with a configured alternate", () => {
    const health = resolveProviderHealthStatus({
      providerId: "elevenlabs",
      scope: "speech",
      configured: true,
      supportedInProfile: true,
      probeHealthy: false,
      freshness,
      fallbackProviderId: "provider-free",
    });
    expect(health.state).toBe("unavailable");
    expect(health.fallbackProviderId).toBe("provider-free");
    expect(health.fallbackExplicit).toBe(true);
  });

  it("reports unsupported providers without fallback", () => {
    const health = resolveProviderHealthStatus({
      providerId: "legacy-voice",
      scope: "speech",
      configured: true,
      supportedInProfile: false,
      freshness,
      fallbackProviderId: "openai",
    });
    expect(health.state).toBe("unsupported");
    expect(health.fallbackExplicit).toBe(false);
  });
});
