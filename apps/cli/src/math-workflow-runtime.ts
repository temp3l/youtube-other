import crypto from "node:crypto";
import path from "node:path";

import {
  ArtifactRepository,
  WorkflowOperator,
  WorkflowStore,
  createTaskRegistry,
} from "@mediaforge/workflow-engine";
import {
  MathProfileStore,
  assessAuthoritativeMathReadiness,
  canonicalHash,
  createMathFingerprintMaterial,
  createMathProductionTaskImplementations,
  createMathTaskRegistrations,
  loadCurriculumRelease,
  loadPrivateOwnerAttestation,
  mathLanguageSchema,
  mathWorkflowDefinition,
  type LessonVariant,
  type MathLanguage,
  type MathProviderAuthorization,
} from "@mediaforge/math-education";

export interface CanonicalMathOperatorInput {
  readonly repositoryRoot: string;
  readonly workspaceRoot: string;
  readonly unitId: string;
  readonly locale: string;
  readonly contentVariant: "full" | "short";
  readonly lessonVariant?: LessonVariant;
  readonly skillId?: string;
  readonly curriculumRoot?: string;
  readonly simulation?: boolean;
  readonly pythonExecutable?: string;
  readonly authorizeProvider?: boolean;
  readonly providerMode?: "fixture-mock" | "provider";
  readonly releaseVisibility?: "private" | "public";
  readonly privateOwnerAttestationPath?: string;
}

function selectionFromUnit(unitId: string): {
  readonly skillId: string;
  readonly lessonVariant: LessonVariant;
} {
  const match =
    /^(m\d+)-([a-z]{2})-(\d{3})-(foundation|standard|challenge)$/u.exec(unitId);
  if (!match?.[1] || !match[2] || !match[3] || !match[4]) {
    throw new Error(
      `Math lesson ID ${unitId} must end in foundation, standard, or challenge.`
    );
  }
  return {
    skillId: `${match[1]}-${match[2]}-${match[3]}`.toUpperCase(),
    lessonVariant: match[4] as LessonVariant,
  };
}

function workflowInstanceId(input: CanonicalMathOperatorInput): string {
  return `workflow-${crypto
    .createHash("sha256")
    .update(
      `${mathWorkflowDefinition.id}\0${mathWorkflowDefinition.revision}\0${input.unitId}\0${input.locale}\0${input.contentVariant}`
    )
    .digest("hex")
    .slice(0, 32)}`;
}

export async function createCanonicalMathOperator(
  input: CanonicalMathOperatorInput
): Promise<WorkflowOperator> {
  const inferred = selectionFromUnit(input.unitId);
  const skillId = input.skillId ?? inferred.skillId;
  const lessonVariant = input.lessonVariant ?? inferred.lessonVariant;
  const locale: MathLanguage = mathLanguageSchema.parse(input.locale);
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const unitRoot = path.join(workspaceRoot, input.unitId);
  const curriculum = await loadCurriculumRelease(
    path.resolve(
      input.curriculumRoot ??
        path.join(
          input.repositoryRoot,
          "packages/math-education/data/curriculum/v1"
        )
    )
  );
  const releaseVisibility = input.releaseVisibility ?? "public";
  const privateOwnerAttestation =
    input.simulation !== true && releaseVisibility === "private"
      ? await loadPrivateOwnerAttestation(
          path.resolve(
            input.privateOwnerAttestationPath ??
              path.join(
                input.repositoryRoot,
                "packages/math-education/data/reviews/v1/private-owner-attestation.json"
              )
          )
        )
      : undefined;
  const profileStore = new MathProfileStore(unitRoot);
  const [profile, visualStyle] = await Promise.all([
    profileStore.readLessonProfile(),
    profileStore.readVisualStyle(),
  ]);
  const providerAuthorization: MathProviderAuthorization = {
    configured: Boolean(input.providerMode),
    operatorAuthorized: input.authorizeProvider === true,
    mode: input.providerMode ?? "provider",
    configurationFingerprint: canonicalHash({
      mode: input.providerMode ?? "unconfigured",
      simulation: input.simulation === true,
    }),
  };
  const identity = {
    instanceId: workflowInstanceId(input),
    unitId: input.unitId,
    locale,
    variant: input.contentVariant,
  } as const;
  const store = new WorkflowStore({
    unitRoot,
    workflow: mathWorkflowDefinition,
    identity,
  });
  const repository = new ArtifactRepository({ workspaceRoot });
  const adapterOptions = {
    repositoryRoot: path.resolve(input.repositoryRoot),
    workspaceRoot,
    unitRoot,
    unitId: input.unitId,
    curriculum,
    profile,
    visualStyle,
    locale,
    lessonVariant,
    contentVariant: input.contentVariant,
    skillId,
    simulation: input.simulation === true,
    releaseVisibility,
    ...(privateOwnerAttestation ? { privateOwnerAttestation } : {}),
    providerAuthorization,
    store,
    repository,
    ...(input.pythonExecutable
      ? { pythonExecutable: input.pythonExecutable }
      : {}),
    rendererVersions: visualStyle?.rendererVersions ?? {
      visualPlan: "math-visual-plan.v1",
      canonicalAdapter: "math.canonical-adapters.v1",
    },
  } as const;
  const readiness = assessAuthoritativeMathReadiness(adapterOptions);
  const implementations =
    createMathProductionTaskImplementations(adapterOptions);
  const registrations = createMathTaskRegistrations(implementations, readiness);
  const fingerprintMaterial = createMathFingerprintMaterial({
    profile,
    visualStyle,
    curriculum: {
      releaseId: curriculum.release.releaseId,
      revision: curriculum.release.curriculumVersion,
      releaseHash: curriculum.releaseHash,
      authorityHash: canonicalHash({
        release: curriculum.release,
        releaseHash: curriculum.releaseHash,
      }),
    },
    selection: {
      skillId,
      locale,
      contentVariant: input.contentVariant,
      lessonVariant,
    },
    ...(!profile ? { profileRevision: "simulation-reviewed-fixtures-v1" } : {}),
    ...(!visualStyle
      ? { visualStyleRevision: "simulation-reviewed-fixtures-v1" }
      : {}),
    verifierVersion: "3.0.0",
    rendererVersions: adapterOptions.rendererVersions,
    providerConfiguration: providerAuthorization,
    ...(privateOwnerAttestation
      ? {
          curriculum: {
            releaseId: curriculum.release.releaseId,
            revision: curriculum.release.curriculumVersion,
            releaseHash: curriculum.releaseHash,
            authorityHash: canonicalHash({
              release: curriculum.release,
              releaseHash: curriculum.releaseHash,
              privateOwnerAttestationHash: privateOwnerAttestation.evidenceHash,
            }),
          },
        }
      : {}),
  });
  return new WorkflowOperator({
    unitRoot,
    workflow: mathWorkflowDefinition,
    registry: createTaskRegistry(registrations),
    identity,
    store,
    fingerprintMaterial,
    verifyArtifact: async (manifest) => {
      try {
        const verified = await repository.verify(manifest.ref, {
          dependencyFingerprints: manifest.dependencyFingerprints,
        });
        return (
          verified.manifest.id === manifest.id &&
          verified.manifest.checksumSha256 === manifest.checksumSha256 &&
          verified.manifest.producerAttemptId === manifest.producerAttemptId
        );
      } catch {
        return false;
      }
    },
  });
}
