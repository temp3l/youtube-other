import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadCurriculumRelease } from "../curriculum/release.js";
import { loadAllDataDiagramStandardContent } from "../lesson/data-diagrams-standard-content.js";
import { loadAllFractionsDecimalsStandardContent } from "../lesson/fractions-decimals-standard-content.js";
import { loadAllGeometryMeasurementStandardContent } from "../lesson/geometry-measurement-standard-content.js";
import { loadAllNumberOperationsStandardContent } from "../lesson/number-operations-standard-content.js";
import { assertProductionLessonCapability } from "../lesson/capabilities.js";
import {
  assessAuthoritativeMathReadiness,
  type MathCanonicalAdapterOptions,
} from "../orchestration/canonical-task-adapters.js";
import { canonicalHash } from "../verification/canonical-json.js";
import {
  assertPrivateOwnerCurriculumApproval,
  assertPrivateOwnerLessonContentApproval,
  loadPrivateOwnerAttestation,
  privateOwnerAttestationSchema,
} from "./private-owner-attestation.js";

const attestationPath = path.resolve(
  "packages/math-education/data/reviews/v1/private-owner-attestation.json"
);

describe("private owner attestation", () => {
  it("binds Stephan's private no-claim approval to the exact Class 5 and content targets", async () => {
    const [attestation, curriculum] = await Promise.all([
      loadPrivateOwnerAttestation(attestationPath),
      loadCurriculumRelease("packages/math-education/data/curriculum/v1"),
    ]);
    expect(
      assertPrivateOwnerCurriculumApproval(attestation, curriculum, "M5-GM-002")
        .allowedUse
    ).toMatchObject({ publicPublishing: false, providerCalls: false });
    for (const specifications of [
      loadAllNumberOperationsStandardContent(),
      loadAllFractionsDecimalsStandardContent(),
      loadAllGeometryMeasurementStandardContent(),
      loadAllDataDiagramStandardContent(),
    ]) {
      expect(() =>
        assertPrivateOwnerLessonContentApproval(specifications, attestation)
      ).not.toThrow();
    }
    expect(() =>
      assertProductionLessonCapability(
        "M5-GM-002",
        "standard",
        attestation,
        "private"
      )
    ).not.toThrow();
    expect(() =>
      assertProductionLessonCapability(
        "M5-GM-002",
        "standard",
        attestation,
        "public"
      )
    ).toThrow(/public use/u);
    const readinessInput = {
      curriculum,
      profile: null,
      visualStyle: null,
      locale: "de",
      lessonVariant: "standard",
      contentVariant: "full",
      skillId: "M5-GM-002",
      simulation: false,
      releaseVisibility: "private",
      privateOwnerAttestation: attestation,
      providerAuthorization: {
        configured: true,
        operatorAuthorized: true,
        mode: "fixture-mock",
        configurationFingerprint: canonicalHash("fixture-mock"),
      },
      pythonExecutable: "python3",
    } as MathCanonicalAdapterOptions;
    expect(
      assessAuthoritativeMathReadiness(readinessInput).curriculumReady
    ).toBe(true);
    expect(
      assessAuthoritativeMathReadiness({
        ...readinessInput,
        releaseVisibility: "public",
      }).curriculumReady
    ).toBe(false);
  });

  it("rejects tampering, stale content, out-of-scope skills, and public enablement", async () => {
    const [attestation, curriculum] = await Promise.all([
      loadPrivateOwnerAttestation(attestationPath),
      loadCurriculumRelease("packages/math-education/data/curriculum/v1"),
    ]);
    expect(() =>
      privateOwnerAttestationSchema.parse({
        ...attestation,
        allowedUse: { ...attestation.allowedUse, publicPublishing: true },
      })
    ).toThrow();
    expect(() =>
      assertPrivateOwnerCurriculumApproval(attestation, curriculum, "M6-ZO-001")
    ).toThrow(/exact curriculum target/u);
    const stale = structuredClone(attestation);
    stale.contentFamilies[0]!.orderedContentHashes[0] = "f".repeat(64);
    expect(() =>
      assertPrivateOwnerLessonContentApproval(
        loadAllNumberOperationsStandardContent(),
        stale
      )
    ).toThrow();
  });
});
