export const HISTORY_SEMANTIC_VALIDATOR_V31 =
  "history-semantic-validator.v3.1.0" as const;

export interface HistoryArtifactLintV31 {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly genericPurposeRate: number;
  readonly invalidEntityCount: number;
  readonly rejectedEntityCount: number;
  readonly emptyMovementRouteCount: number;
  readonly genericDiagramCount: number;
  readonly duplicateAnchorShotCount: number;
  readonly dominantMediaShare: number;
  readonly identicalMediaReasonRate: number;
  readonly constantConfidenceFlags: readonly string[];
  readonly genericAspectRatioRate: number;
  readonly approvalCommandSafety: boolean;
}

interface LintablePlan {
  readonly entities: readonly {
    readonly id: string;
    readonly canonicalName: string;
    readonly type: string;
    readonly confidence: number;
  }[];
  readonly rejectedEntityCandidates: readonly unknown[];
  readonly claims: readonly { readonly confidence: number }[];
  readonly beats: readonly {
    readonly id: string;
    readonly visualPurpose: string;
    readonly viewerUnderstanding: string;
  }[];
  readonly shots: readonly {
    readonly id: string;
    readonly sequenceId: string;
    readonly editorialFunction: string;
    readonly assetIntentId: string;
    readonly compositionIntent: string;
    readonly cameraOrMotionIntent: string;
  }[];
  readonly mediaDecisions: readonly {
    readonly id: string;
    readonly selectedMediaType: string;
    readonly selectionReason: string;
    readonly confidence: number;
    readonly adaptations: readonly {
      readonly strategy: string;
      readonly focalRegion: string;
      readonly protectedSubjects: readonly string[];
    }[];
  }[];
  readonly mapStates: readonly {
    readonly id: string;
    readonly routes: readonly unknown[];
    readonly movements?: readonly unknown[];
    readonly labels: readonly string[];
    readonly actorEntityIds: readonly string[];
  }[];
  readonly diagramStates: readonly {
    readonly id: string;
    readonly nodes: readonly { readonly label: string }[];
    readonly edges: readonly {
      readonly label: string;
      readonly relation?: string;
    }[];
  }[];
}

const purposePlaceholders = [
  /show the viewer the historical significance of/iu,
  /without extending its claim/iu,
  /shapes the narrated outcome/iu,
  /clarify the complete narration unit/iu,
];
const diagramPlaceholders =
  /^(?:Narrated condition|Narrated outcome|placeholder|node 1|node 2|contributes to)$/iu;
const ratioPlaceholders =
  /^(?:claim-bearing subject|primary subject|vertical recompose)$/iu;
const invalidStandaloneEntities =
  /^(?:formation|Roman|August|Napoleon['’]s)$/iu;
const placeTypes = new Set(["place"]);

const rate = (count: number, total: number): number =>
  total ? Number((count / total).toFixed(4)) : 0;

export function lintHistoryVisualPlanV31(
  plan: LintablePlan,
  approvalPack?: string
): HistoryArtifactLintV31 {
  const errors: string[] = [];
  const warnings: string[] = [];
  const invalidEntities = plan.entities.filter(
    (entity) =>
      invalidStandaloneEntities.test(entity.canonicalName) ||
      (/^\d{3,4}$/u.test(entity.canonicalName) && placeTypes.has(entity.type))
  );
  if (invalidEntities.length)
    errors.push(
      `Invalid accepted entities: ${invalidEntities.map((entity) => entity.id).join(", ")}.`
    );

  const genericBeats = plan.beats.filter((beat) =>
    purposePlaceholders.some(
      (pattern) =>
        pattern.test(beat.visualPurpose) ||
        pattern.test(beat.viewerUnderstanding)
    )
  );
  const genericPurposeRate = rate(genericBeats.length, plan.beats.length);
  if (genericPurposeRate > 0.1)
    errors.push(
      `Generic visual-purpose rate ${genericPurposeRate} exceeds the 0.1 threshold.`
    );

  const emptyMovementStates = plan.mapStates.filter(
    (state) => Boolean(state.movements?.length) && !state.routes.length
  );
  if (emptyMovementStates.length)
    errors.push(
      `Movement map states without routes: ${emptyMovementStates.map((state) => state.id).join(", ")}.`
    );
  const rawLabelStates = plan.mapStates.filter((state) =>
    state.labels.some((label) => /^(?:entity|place|map)-[\w-]+$/iu.test(label))
  );
  if (rawLabelStates.length)
    errors.push(
      `Map labels expose raw ids: ${rawLabelStates.map((state) => state.id).join(", ")}.`
    );

  const genericDiagrams = plan.diagramStates.filter(
    (state) =>
      state.nodes.some((node) => diagramPlaceholders.test(node.label)) ||
      state.edges.some(
        (edge) =>
          diagramPlaceholders.test(edge.label) ||
          diagramPlaceholders.test(edge.relation ?? "")
      )
  );
  if (genericDiagrams.length)
    errors.push(
      `Placeholder diagrams: ${genericDiagrams.map((state) => state.id).join(", ")}.`
    );

  const sequenceGroups = new Map<string, LintablePlan["shots"][number][]>();
  for (const shot of plan.shots)
    sequenceGroups.set(shot.sequenceId, [
      ...(sequenceGroups.get(shot.sequenceId) ?? []),
      shot,
    ]);
  const duplicateShots = [...sequenceGroups.values()].filter(
    (sequence) =>
      sequence.length > 1 &&
      new Set(
        sequence.map(
          (shot) =>
            `${shot.editorialFunction}|${shot.assetIntentId}|${shot.compositionIntent}|${shot.cameraOrMotionIntent}`
        )
      ).size === 1
  );
  if (duplicateShots.length)
    errors.push("One or more anchor sequences differ only by timing.");

  const mediaCounts = new Map<string, number>();
  for (const decision of plan.mediaDecisions)
    mediaCounts.set(
      decision.selectedMediaType,
      (mediaCounts.get(decision.selectedMediaType) ?? 0) + 1
    );
  const dominantMediaShare = rate(
    Math.max(0, ...mediaCounts.values()),
    plan.mediaDecisions.length
  );
  if (dominantMediaShare > 0.75)
    warnings.push(
      `Dominant media share ${dominantMediaShare} requires editorial justification.`
    );
  const reasonCounts = new Map<string, number>();
  for (const decision of plan.mediaDecisions)
    reasonCounts.set(
      decision.selectionReason,
      (reasonCounts.get(decision.selectionReason) ?? 0) + 1
    );
  const identicalMediaReasonRate = rate(
    Math.max(0, ...reasonCounts.values()),
    plan.mediaDecisions.length
  );
  if (identicalMediaReasonRate > 0.75)
    warnings.push("Media-selection reasons are insufficiently varied.");

  const constantConfidenceFlags: string[] = [];
  for (const [name, values] of [
    ["entities", plan.entities.map((item) => item.confidence)],
    ["claims", plan.claims.map((item) => item.confidence)],
    ["media", plan.mediaDecisions.map((item) => item.confidence)],
  ] as const)
    if (values.length > 1 && new Set(values).size === 1)
      constantConfidenceFlags.push(name);
  if (constantConfidenceFlags.length)
    warnings.push(
      `Uniform confidence distributions: ${constantConfidenceFlags.join(", ")}.`
    );

  const adaptations = plan.mediaDecisions.flatMap(
    (decision) => decision.adaptations
  );
  const genericAdaptations = adaptations.filter(
    (adaptation) =>
      ratioPlaceholders.test(adaptation.strategy) ||
      ratioPlaceholders.test(adaptation.focalRegion) ||
      adaptation.protectedSubjects.some((subject) =>
        ratioPlaceholders.test(subject)
      )
  );
  const genericAspectRatioRate = rate(
    genericAdaptations.length,
    adaptations.length
  );
  if (genericAspectRatioRate)
    errors.push("Generic aspect-ratio placeholders remain.");

  if (!plan.rejectedEntityCandidates.length)
    warnings.push("Rejected-entity diagnostics are empty.");
  const approvalCommandSafety = approvalPack
    ? !/visuals approve/iu.test(approvalPack)
    : true;
  if (!approvalCommandSafety)
    errors.push("Approval command is present in a semantically blocked pack.");

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    genericPurposeRate,
    invalidEntityCount: invalidEntities.length,
    rejectedEntityCount: plan.rejectedEntityCandidates.length,
    emptyMovementRouteCount: emptyMovementStates.length,
    genericDiagramCount: genericDiagrams.length,
    duplicateAnchorShotCount: duplicateShots.length,
    dominantMediaShare,
    identicalMediaReasonRate,
    constantConfidenceFlags,
    genericAspectRatioRate,
    approvalCommandSafety,
  };
}
