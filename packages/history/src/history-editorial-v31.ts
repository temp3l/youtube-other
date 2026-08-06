/**
 * An integration-neutral editorial planning seam.  It deliberately does not
 * read episodes or write artifacts: callers provide their resolved narration,
 * research, and beat boundaries.
 */
export const HISTORY_EDITORIAL_V31 = "history-editorial-v3.1.0" as const;

export type EditorialRole =
  | "hook"
  | "context"
  | "cause"
  | "evidence"
  | "turning-point"
  | "contrast"
  | "aftermath"
  | "conclusion"
  | "transition";
export type MediaType =
  | "cinematic-reconstruction"
  | "archival-art"
  | "archival-photograph"
  | "portrait"
  | "historical-map"
  | "animated-map"
  | "document"
  | "quotation-card"
  | "material-culture"
  | "location-or-terrain"
  | "diagram"
  | "data-graphic"
  | "timeline"
  | "title-or-chapter-card";
export type DiagnosticCode =
  | "genericPurposeTemplate"
  | "genericPurposeRate"
  | "narrationPurposeOverlap"
  | "purposeTemplateFrequency"
  | "purposeSimilarityCluster"
  | "duplicatePurpose"
  | "repeatedPurposePrefix"
  | "purposeCluster"
  | "duplicateShotPurpose"
  | "duplicateShotAsset"
  | "anchorSequenceSemanticDiversity"
  | "dominantMediaShare"
  | "mediaReasonSimilarity"
  | "mediaConfidenceDistribution"
  | "evidentiaryMediaShare"
  | "reconstructionShare"
  | "archivalSearchIntentCount"
  | "mediaFallbackCount";

export interface EditorialNarrationUnit {
  readonly id: string;
  readonly text: string;
}
export interface EditorialEntity {
  readonly id: string;
  readonly name: string;
  readonly type?: string;
  readonly narrationUnitIds?: readonly string[];
  readonly confidence?: number;
}
export interface EditorialClaim {
  readonly id: string;
  readonly text: string;
  readonly kind?:
    | "factual"
    | "causal"
    | "interpretive"
    | "quantitative"
    | "chronological"
    | "geographic"
    | "comparative"
    | "disputed"
    | "uncertain"
    | "rhetorical"
    | "testimonial";
  readonly narrationUnitIds: readonly string[];
  readonly sourceStatus?:
    | "resolved"
    | "partial"
    | "unresolved"
    | "not-applicable";
  readonly evidenceReferenceIds?: readonly string[];
  readonly sourceReferenceIds?: readonly string[];
  readonly confidence?: number;
}
export interface EditorialBeatInput {
  readonly id: string;
  readonly narrationUnitIds: readonly string[];
  readonly claimIds?: readonly string[];
  readonly editorialRole?: EditorialRole;
  readonly importance?: number;
}
export interface EditorialPlanningInput {
  readonly narrationUnits: readonly EditorialNarrationUnit[];
  readonly entities?: readonly EditorialEntity[];
  readonly claims?: readonly EditorialClaim[];
  readonly beats?: readonly EditorialBeatInput[];
  readonly researchAssetTypes?: readonly MediaType[];
  readonly productionCostPreference?: "low" | "balanced" | "premium";
}
export interface SemanticBeat {
  readonly id: string;
  readonly coveredNarrationUnitIds: readonly string[];
  readonly claimIds: readonly string[];
  readonly editorialRole: EditorialRole;
  readonly importance: number;
  readonly viewerUnderstanding: string;
  readonly visualPurpose: string;
  readonly purposeConfidence: number;
  readonly narrationOverlap: number;
  readonly visualQuestion?: string;
  readonly contrast?: string;
  readonly causalMechanism?: string;
}
export interface MediaDecision {
  readonly id: string;
  readonly beatId: string;
  readonly selectedMediaType: MediaType;
  readonly selectionReason: string;
  readonly alternativesConsidered: readonly MediaType[];
  readonly evidenceAvailability:
    | "direct"
    | "indirect"
    | "unresolved"
    | "not-applicable";
  readonly historicalAuthority:
    | "primary"
    | "scholarly"
    | "illustrative"
    | "synthetic";
  readonly productionCostClass: "low" | "medium" | "high";
  readonly reuseOpportunity: "none" | "sequence" | "episode";
  readonly confidence: number;
  readonly illustrativeReconstruction: boolean;
  readonly archivalSearchIntent?: string;
  readonly adaptations: readonly MediaAdaptation[];
}
export interface MediaAdaptation {
  readonly ratio: "16:9" | "9:16";
  readonly strategy: string;
  readonly focalRegion: string;
  readonly protectedSubjects: readonly string[];
  readonly cropTolerance: "none" | "low" | "medium" | "high";
  readonly textSafeZones: readonly string[];
  readonly labelPriority: readonly string[];
  readonly cameraAdjustment: string;
  readonly requiresIndependentRender: boolean;
  readonly reason: string;
}
export interface EditorialShot {
  readonly id: string;
  readonly sequenceId: string;
  readonly beatId: string;
  readonly editorialFunction:
    | "establish"
    | "orient"
    | "explain"
    | "contrast"
    | "reveal"
    | "detail"
    | "evidence"
    | "reaction"
    | "transition"
    | "resolve"
    | "callback";
  readonly assetIntentId: string;
  readonly narrationUnitIds: readonly string[];
  readonly startMs: number;
  readonly endMs: number;
  readonly compositionIntent: string;
  readonly cameraOrMotionIntent: string;
  readonly transitionIntent: string;
}
export interface EditorialDiagnostic {
  readonly code: DiagnosticCode;
  readonly severity: "warning" | "error";
  readonly message: string;
  readonly affectedIds: readonly string[];
}
export interface HistoryEditorialPlanV31 {
  readonly plannerVersion: typeof HISTORY_EDITORIAL_V31;
  readonly beats: readonly SemanticBeat[];
  readonly mediaDecisions: readonly MediaDecision[];
  readonly shots: readonly EditorialShot[];
  readonly diagnostics: readonly EditorialDiagnostic[];
}

const genericTemplates = [
  /^show the viewer the historical significance of/u,
  /^explain how .+ shapes the narrated outcome\.?$/u,
  /^clarify the complete narration unit/u,
];
const prefix = (value: string): string =>
  value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/u)
    .slice(0, 5)
    .join(" ");
const includes = (text: string, words: RegExp): boolean => words.test(text);
const unitsText = (
  units: readonly EditorialNarrationUnit[],
  ids: readonly string[]
): string =>
  ids
    .map((id) => units.find((unit) => unit.id === id)?.text ?? "")
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();

function roleFor(text: string, index: number, total: number): EditorialRole {
  if (index === 0) return "hook";
  if (index === total - 1) return "conclusion";
  if (includes(text, /\b(but|however|rather than|instead)\b/iu))
    return "contrast";
  if (
    includes(
      text,
      /\b(because|therefore|caused|led to|resulted in|supply|tax|trade)\b/iu
    )
  )
    return "cause";
  if (
    includes(
      text,
      /\b(battle|invasion|collapse|revolt|retreat|crossed|assassinated)\b/iu
    )
  )
    return "turning-point";
  if (
    includes(text, /\b(letter|decree|law|record|account|evidence|document)\b/iu)
  )
    return "evidence";
  return "context";
}

const contentWords = (value: string): string[] =>
  value
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}]{4,}/gu)
    ?.filter(
      (word) =>
        !new Set([
          "because",
          "through",
          "before",
          "after",
          "their",
          "therefore",
          "narration",
          "viewer",
          "visual",
          "historical",
        ]).has(word)
    ) ?? [];
const overlap = (purposeText: string, narration: string): number => {
  const purposeWords = contentWords(purposeText);
  const narrationWords = new Set(contentWords(narration));
  return purposeWords.length
    ? Number(
        (
          purposeWords.filter((word) => narrationWords.has(word)).length /
          purposeWords.length
        ).toFixed(2)
      )
    : 0;
};
function subjectFor(
  text: string,
  entities: readonly EditorialEntity[]
): string {
  const localEntities = entities.filter((entity) =>
    text.toLocaleLowerCase().includes(entity.name.toLocaleLowerCase())
  );
  const place = localEntities.find((entity) => entity.type === "place")?.name;
  if (includes(text, /\b(?:crossed|crossing)\b/iu) && place)
    return `${place} crossing`;
  if (includes(text, /\b(?:arrived|arrival|port)\b/iu) && place)
    return `${place} arrival`;
  if (includes(text, /\b(?:battle|battlefield|fought)\b/iu) && place)
    return `${place} battle`;
  if (includes(text, /\b(supply|wagon|depot|provision|fodder)\b/iu))
    return "campaign supply network";
  if (includes(text, /\b(surrender|capture|occupied|occupation)\b/iu))
    return "the decision to occupy without a negotiated surrender";
  if (
    includes(
      text,
      /\b(thousands?|soldiers?|army|armies|troops?|casualties)\b/iu
    )
  )
    return "campaign manpower and attrition";
  if (includes(text, /\b(tax|revenue|treasury|fiscal)\b/iu))
    return "imperial fiscal capacity";
  if (includes(text, /\b(decree|statute|ordinance|law)\b/iu))
    return "legal control of labour and property";
  if (includes(text, /\b(crossed|advance|retreat|route|river|march)\b/iu))
    return place ? `${place} movement` : "campaign movement corridor";
  if (includes(text, /\b(plague|disease|epidemic)\b/iu))
    return "plague transmission ecology";
  if (includes(text, /\b(labou?r|wages?|workers?|workforce)\b/iu))
    return "post-plague labour bargaining";
  if (includes(text, /\b(population|mortality|dead|death|demographic)\b/iu))
    return "demographic shock";
  if (includes(text, /\b(winter|cold|snow|frostbite|hunger)\b/iu))
    return "winter attrition";
  if (includes(text, /\b(emperor|succession|court|authority|government)\b/iu))
    return "imperial political authority";
  if (includes(text, /\b(roman|officials?|administration|bureaucracy)\b/iu))
    return "Roman imperial administration";
  if (includes(text, /\b(church|faith|religion|prayer|clergy)\b/iu))
    return "religious response under plague";
  if (includes(text, /\b(persecution|violence|pogrom|accused)\b/iu))
    return "organized persecution during crisis";
  if (includes(text, /\b(trade|merchant|ships?|roads?)\b/iu))
    return "interregional trade network";
  if (includes(text, /\b(flea|fleas|rat|rats|bacteri|pathogen)\b/iu))
    return "the plague transmission chain";
  if (includes(text, /\b(quarantine|isolation|medicine|physician)\b/iu))
    return "the public-health response";
  if (includes(text, /\b(land|serf|feudal|estate|property)\b/iu))
    return "landholding and feudal obligations";
  if (includes(text, /\b(battle|invasion|revolt|collapse)\b/iu))
    return "political rupture";
  if (includes(text, /\b(transform|adapt|surviv|continu|new kingdoms?)\b/iu))
    return "institutional survival and transformation";
  const named = localEntities.find(
    (entity) => entity.type !== "date" && entity.type !== "period"
  )?.name;
  if (named) return named;
  return "the material condition described in the linked narration";
}
function purpose(
  text: string,
  role: EditorialRole,
  entities: readonly EditorialEntity[]
): Pick<
  SemanticBeat,
  | "viewerUnderstanding"
  | "visualPurpose"
  | "purposeConfidence"
  | "narrationOverlap"
  | "visualQuestion"
  | "contrast"
  | "causalMechanism"
> {
  const subject = subjectFor(text, entities);
  const base =
    role === "hook" &&
    /\b(?:crossed|crossing)\b/iu.test(text) &&
    /\b(?:army|armies|soldiers|force)\b/iu.test(text)
      ? {
          viewerUnderstanding:
            "See the opening movement commit a multinational army to the campaign.",
          visualPurpose:
            "Begin on the river threshold, then reveal the scale of columns moving east.",
          visualQuestion:
            "How can an advance this large already contain the conditions of failure?",
        }
      : role === "hook" && /\b(?:ships?|port|arrived)\b/iu.test(text)
        ? {
            viewerUnderstanding:
              "See maritime exchange become the entry point for epidemic risk.",
            visualPurpose:
              "Open on an ordinary harbor arrival, then shift attention to the first signs of illness.",
            visualQuestion:
              "How does routine commerce become a transmission network?",
          }
        : role === "hook" && /\b(?:removed|deposed|emperor)\b/iu.test(text)
          ? {
              viewerUnderstanding:
                "See a quiet deposition become a retrospective political endpoint.",
              visualPurpose:
                "Open on a transfer of power rather than an imagined instant civilizational collapse.",
              visualQuestion:
                "What actually ends when an imperial title disappears?",
            }
          : role === "cause"
            ? {
                viewerUnderstanding: `Understand how ${subject} produces the narrated consequence.`,
                visualPurpose: `Diagram the pressure points in the ${subject} and reveal their sequence of effects.`,
                causalMechanism:
                  "Link the named pressure to its consequence using only narrated relationships.",
              }
            : role === "contrast" &&
                /\b(?:end|ended|crowd|vanish|disappear)\b/iu.test(text)
              ? {
                  viewerUnderstanding:
                    "Distinguish a retrospective endpoint from the absence of an immediate visible rupture.",
                  visualPurpose:
                    "Set the conventional break against ordinary continuity at the same moment.",
                  contrast:
                    "Hold period and scale constant while the expected rupture fails to appear.",
                }
              : role === "contrast"
                ? {
                    viewerUnderstanding: `Compare the competing conditions surrounding ${subject}.`,
                    visualPurpose: `Use matched views to separate the two conditions shaping ${subject}.`,
                    contrast:
                      "Hold scale and period cues constant so the difference is visible.",
                  }
                : role === "turning-point"
                  ? {
                      viewerUnderstanding: `Recognize why ${subject} redirects the wider story.`,
                      visualPurpose: `Establish ${subject} at contextual scale, then isolate the change that follows.`,
                      visualQuestion: `What changes after ${subject}?`,
                    }
                  : role === "evidence"
                    ? {
                        viewerUnderstanding: `Assess the claim through the available evidence for ${subject}.`,
                        visualPurpose: `Reveal the relevant evidence for ${subject}, then hold on the detail that supports the claim.`,
                      }
                    : role === "hook"
                      ? {
                          viewerUnderstanding: `Grasp the stakes introduced by ${subject}.`,
                          visualPurpose: `Stage the unresolved tension around ${subject} before the explanation begins.`,
                          visualQuestion: `Why does ${subject} matter now?`,
                        }
                      : role === "conclusion"
                        ? {
                            viewerUnderstanding: `Connect ${subject} to the episode's final consequence.`,
                            visualPurpose: `Return to ${subject} and resolve its relationship to the final historical state.`,
                          }
                        : {
                            viewerUnderstanding: `Locate ${subject} within the conditions that make the next development intelligible.`,
                            visualPurpose: `Orient the viewer to the setting and constraints around ${subject}.`,
                          };
  return {
    ...base,
    purposeConfidence: Number(
      (entities.some((entity) =>
        text.toLocaleLowerCase().includes(entity.name.toLocaleLowerCase())
      )
        ? 0.88
        : subject === "the unresolved historical constraint"
          ? 0.58
          : 0.74
      ).toFixed(2)
    ),
    narrationOverlap: overlap(
      `${base.viewerUnderstanding} ${base.visualPurpose}`,
      text
    ),
  };
}

function chooseMedia(
  text: string,
  beat: SemanticBeat,
  claims: readonly EditorialClaim[],
  research: readonly MediaType[],
  cost: "low" | "balanced" | "premium"
): Omit<MediaDecision, "id" | "beatId" | "adaptations"> {
  const resolved = claims.some(
    (claim) =>
      beat.claimIds.includes(claim.id) && claim.sourceStatus === "resolved"
  );
  const direct =
    resolved &&
    includes(
      text,
      /\b(letter|decree|law|record|account|document|testimony)\b/iu
    );
  let selected: MediaType = "cinematic-reconstruction";
  let reason =
    "The passage needs a concrete, labelled reconstruction because no direct visual form is named.";
  if (
    includes(
      text,
      /\b(crossed|advance|retreat|route|spread|moved|into|across)\b/iu
    )
  ) {
    selected = "animated-map";
    reason =
      "Movement and changing geography are clearer as an animated map with named locations and direction.";
  } else if (beat.editorialRole === "cause") {
    selected = "diagram";
    reason =
      "The passage explains a mechanism, so a causal diagram can distinguish condition, pressure, and consequence.";
  } else if (
    includes(
      text,
      /\b(letter|decree|law|record|account|document|testimony)\b/iu
    )
  ) {
    selected = direct ? "document" : "quotation-card";
    reason =
      "Written evidence is named directly, so the visual should foreground the source rather than imply an unseen scene.";
  } else if (
    includes(text, /\b(emperor|king|queen|general|commander|pope|tsar)\b/iu)
  ) {
    selected = "portrait";
    reason =
      "A named office-holder is central to this passage; a portrait supplies identity and period context.";
  } else if (
    includes(text, /\b(coin|weapon|armour|tool|ship|medicine|relic|grain)\b/iu)
  ) {
    selected = "material-culture";
    reason =
      "The narrated object can carry the explanation more faithfully than a generic scene.";
  } else if (includes(text, /\b(ruins|mountain|river|city|terrain|port)\b/iu)) {
    selected = "location-or-terrain";
    reason =
      "Place and terrain are the explanatory content, making a location-focused visual appropriate.";
  } else if (
    includes(
      text,
      /\b(?:imagine|household|street|crowd|collapsed|fled|nursed|burial|engineers|freezing water|fires? spread|soldiers fought|families separated|food was withheld)\b/iu
    )
  ) {
    selected = "cinematic-reconstruction";
    reason =
      "No direct image records this narrated human action; a labelled reconstruction can show spatial stakes without claiming eyewitness authority.";
  } else if (research.includes("archival-art")) {
    selected = "archival-art";
    reason =
      "A researched period image is available and can establish the narrated setting without reconstruction.";
  }
  const evidenceAvailability = direct
    ? "direct"
    : resolved
      ? "indirect"
      : selected === "animated-map" || selected === "diagram"
        ? "not-applicable"
        : "unresolved";
  const authority =
    selected === "cinematic-reconstruction"
      ? "illustrative"
      : direct
        ? "primary"
        : resolved
          ? "scholarly"
          : selected === "diagram" || selected === "animated-map"
            ? "synthetic"
            : "illustrative";
  const confidence = Number(
    (direct
      ? 0.91
      : resolved
        ? 0.78
        : selected === "cinematic-reconstruction"
          ? 0.46
          : selected === "diagram" || selected === "animated-map"
            ? 0.69
            : 0.57
    ).toFixed(2)
  );
  return {
    selectedMediaType: selected,
    selectionReason: `${reason} Editorial aim: ${beat.viewerUnderstanding}`,
    alternativesConsidered:
      selected === "animated-map"
        ? ["historical-map", "location-or-terrain"]
        : selected === "diagram"
          ? ["data-graphic", "animated-map"]
          : ["archival-art", "cinematic-reconstruction"],
    evidenceAvailability,
    historicalAuthority: authority,
    productionCostClass:
      selected === "cinematic-reconstruction"
        ? cost === "low"
          ? "medium"
          : "high"
        : selected === "animated-map" || selected === "diagram"
          ? "medium"
          : "low",
    reuseOpportunity:
      selected === "animated-map" || selected === "diagram"
        ? "episode"
        : beat.importance >= 4
          ? "sequence"
          : "none",
    confidence,
    illustrativeReconstruction: selected === "cinematic-reconstruction",
    ...(selected === "archival-art" ||
    selected === "portrait" ||
    selected === "document"
      ? {
          archivalSearchIntent: `Locate rights-cleared, period-appropriate ${selected} material tied to the narration.`,
        }
      : {}),
  };
}

function adaptations(media: MediaType): readonly MediaAdaptation[] {
  const map = media === "animated-map" || media === "historical-map";
  const diagram =
    media === "diagram" || media === "data-graphic" || media === "timeline";
  const document = media === "document" || media === "quotation-card";
  const portrait = media === "portrait";
  const reconstruction = media === "cinematic-reconstruction";
  const archival = media === "archival-art";
  const material = media === "material-culture";
  const focal = map
    ? "route corridor and endpoint labels"
    : diagram
      ? "causal relationship between named conditions"
      : document
        ? "dated document body and source mark"
        : portrait
          ? "face, regalia, and identifying inscription"
          : archival
            ? "principal figure and evidence-bearing action in the period artwork"
            : material
              ? "dated object surface, wear, and identifying detail"
              : reconstruction
                ? "historically plausible action and period setting"
                : "specific researched object or setting";
  const protectedSubjects = map
    ? ["origin label", "destination label", "route path", "map legend"]
    : diagram
      ? ["condition node", "consequence node", "relation connector"]
      : document
        ? ["date", "quoted evidence", "archive attribution"]
        : portrait
          ? ["face", "identifying inscription", "period dress"]
          : archival
            ? ["principal figure", "depicted action", "artwork attribution"]
            : material
              ? ["object silhouette", "dated detail", "scale cue"]
              : reconstruction
                ? ["depicted action", "period material cue", "spatial context"]
                : ["researched focal object", "period context"];
  return [
    {
      ratio: "16:9",
      strategy: map
        ? "wide geographic composition"
        : diagram
          ? "horizontal causal flow"
          : portrait
            ? "contextual portrait frame"
            : document
              ? "document with contextual margin"
              : archival
                ? "full artwork with protected attribution"
                : material
                  ? "object and contextual scale frame"
                  : reconstruction
                    ? "wide scene reconstruction"
                    : "contextual landscape composition",
      focalRegion: focal,
      protectedSubjects,
      cropTolerance:
        map || diagram || document ? "low" : portrait ? "none" : "medium",
      textSafeZones: ["lower third outside the focal region"],
      labelPriority: map
        ? ["origin", "destination", "route", "legend"]
        : document
          ? ["date", "source attribution"]
          : portrait
            ? ["identifying inscription"]
            : [],
      cameraAdjustment:
        "Use the wide frame to retain the contextual relationships that establish period and place.",
      requiresIndependentRender: false,
      reason:
        "A landscape composition preserves context without reducing the readable evidence.",
    },
    {
      ratio: "9:16",
      strategy: map
        ? "portrait map with stacked labels"
        : diagram
          ? "vertical causal stack"
          : portrait
            ? "face-safe portrait crop"
            : document
              ? "vertical evidence close-up"
              : archival
                ? "full-frame introduction then guided detail crop"
                : material
                  ? "object detail with scale panel"
                  : reconstruction
                    ? "portrait scene reblock"
                    : "vertical recomposition",
      focalRegion: focal,
      protectedSubjects,
      cropTolerance:
        map || diagram || document ? "none" : portrait ? "none" : "low",
      textSafeZones: [
        "upper third outside the focal region",
        "lower third outside the focal region",
      ],
      labelPriority: map
        ? ["origin", "destination", "route", "legend"]
        : document
          ? ["date", "source attribution"]
          : portrait
            ? ["identifying inscription"]
            : [],
      cameraAdjustment: map
        ? "Stack geography vertically and move the legend into the lower safe zone."
        : diagram
          ? "Stack cause above consequence with vertical connectors."
          : portrait
            ? "Keep the face and inscription fully visible; expand the period background instead of cropping."
            : document
              ? "Center the dated evidence and retain a separate attribution panel."
              : archival
                ? "Begin on the full artwork, then pan toward the principal figure while keeping attribution visible."
                : material
                  ? "Rotate or slide from the whole object to the dated detail without losing the scale cue."
                  : "Reblock the composition for portrait viewing rather than cropping the landscape frame.",
      requiresIndependentRender: true,
      reason:
        "A separate portrait composition protects evidence and avoids mechanical pan-and-scan.",
    },
  ];
}

function diagnostics(
  beats: readonly SemanticBeat[],
  decisions: readonly MediaDecision[],
  shots: readonly EditorialShot[]
): EditorialDiagnostic[] {
  const result: EditorialDiagnostic[] = [];
  const grouped = new Map<string, string[]>();
  const genericIds: string[] = [];
  for (const beat of beats) {
    const key = prefix(beat.visualPurpose);
    grouped.set(key, [...(grouped.get(key) ?? []), beat.id]);
    if (
      genericTemplates.some((template) => template.test(beat.visualPurpose))
    ) {
      genericIds.push(beat.id);
      result.push({
        code: "genericPurposeTemplate",
        severity: "error",
        message: "A visual purpose matches a known generic template.",
        affectedIds: [beat.id],
      });
    }
    if (beat.narrationOverlap > 0.35) {
      genericIds.push(beat.id);
      result.push({
        code: "narrationPurposeOverlap",
        severity: "error",
        message: `Purpose overlap ${beat.narrationOverlap} exceeds the 0.35 maximum; replace copied narration with editorial direction.`,
        affectedIds: [beat.id],
      });
    }
  }
  if (genericIds.length / Math.max(1, beats.length) > 0.2)
    result.push({
      code: "genericPurposeRate",
      severity: "error",
      message:
        "More than 20% of purposes are generic or too close to narration.",
      affectedIds: [...new Set(genericIds)],
    });
  for (const ids of grouped.values())
    if (ids.length > 1) {
      result.push({
        code: "duplicatePurpose",
        severity: "warning",
        message: "Multiple beats use the same visual purpose prefix.",
        affectedIds: ids,
      });
      result.push({
        code: "repeatedPurposePrefix",
        severity: "warning",
        message: "Repeated opening language weakens editorial specificity.",
        affectedIds: ids,
      });
    }
  for (const ids of grouped.values())
    if (ids.length >= 3)
      result.push({
        code: "purposeTemplateFrequency",
        severity: "warning",
        message: "One purpose template is used for three or more beats.",
        affectedIds: ids,
      });
  const roles = new Map<string, string[]>();
  for (const beat of beats)
    roles.set(beat.editorialRole, [
      ...(roles.get(beat.editorialRole) ?? []),
      beat.id,
    ]);
  for (const ids of roles.values())
    if (ids.length >= 4)
      result.push({
        code: "purposeCluster",
        severity: "warning",
        message:
          "A large cluster shares one editorial role; review for distinct viewer understanding.",
        affectedIds: ids,
      });
  for (const ids of grouped.values())
    if (ids.length >= 3)
      result.push({
        code: "purposeSimilarityCluster",
        severity: "warning",
        message:
          "Similar purpose openings form an editorial similarity cluster.",
        affectedIds: ids,
      });
  const sequences = new Map<string, EditorialShot[]>();
  for (const shot of shots)
    sequences.set(shot.sequenceId, [
      ...(sequences.get(shot.sequenceId) ?? []),
      shot,
    ]);
  for (const sequence of sequences.values())
    if (sequence.length > 1) {
      if (new Set(sequence.map((shot) => shot.assetIntentId)).size === 1)
        result.push({
          code: "duplicateShotAsset",
          severity: "warning",
          message:
            "An anchor sequence reuses one asset intent; ensure treatment remains distinct.",
          affectedIds: sequence.map((shot) => shot.id),
        });
      if (
        new Set(
          sequence.map(
            (shot) =>
              `${shot.editorialFunction}/${shot.compositionIntent}/${shot.cameraOrMotionIntent}`
          )
        ).size === 1
      )
        result.push({
          code: "anchorSequenceSemanticDiversity",
          severity: "error",
          message: "A multi-shot sequence differs only by duration.",
          affectedIds: sequence.map((shot) => shot.id),
        });
    }
  const types = new Map<MediaType, number>();
  for (const decision of decisions)
    types.set(
      decision.selectedMediaType,
      (types.get(decision.selectedMediaType) ?? 0) + 1
    );
  if (decisions.length && Math.max(...types.values()) / decisions.length > 0.75)
    result.push({
      code: "dominantMediaShare",
      severity: "warning",
      message:
        "One media type dominates the plan; confirm the narration justifies it.",
      affectedIds: decisions.map((decision) => decision.id),
    });
  if (
    new Set(decisions.map((decision) => decision.selectionReason)).size <= 1 &&
    decisions.length > 1
  )
    result.push({
      code: "mediaReasonSimilarity",
      severity: "warning",
      message: "Media reasons are too similar to demonstrate editorial choice.",
      affectedIds: decisions.map((decision) => decision.id),
    });
  if (
    new Set(decisions.map((decision) => decision.confidence)).size <= 1 &&
    decisions.length > 1
  )
    result.push({
      code: "mediaConfidenceDistribution",
      severity: "warning",
      message: "Media confidence does not vary with evidence.",
      affectedIds: decisions.map((decision) => decision.id),
    });
  return result;
}

export function buildHistoryEditorialPlanV31(
  input: EditorialPlanningInput
): HistoryEditorialPlanV31 {
  const claims = input.claims ?? [];
  const rawBeats: readonly EditorialBeatInput[] = input.beats?.length
    ? input.beats
    : input.narrationUnits.map((unit) => ({
        id: `beat-${unit.id}`,
        narrationUnitIds: [unit.id],
      }));
  const beats = rawBeats.map((raw, index) => {
    const text = unitsText(input.narrationUnits, raw.narrationUnitIds);
    const editorialRole =
      raw.editorialRole ?? roleFor(text, index, rawBeats.length);
    const semantic = purpose(text, editorialRole, input.entities ?? []);
    return {
      id: raw.id,
      coveredNarrationUnitIds: [...raw.narrationUnitIds],
      claimIds: raw.claimIds
        ? [...raw.claimIds]
        : claims
            .filter((claim) =>
              claim.narrationUnitIds.some((id) =>
                raw.narrationUnitIds.includes(id)
              )
            )
            .map((claim) => claim.id),
      editorialRole,
      importance:
        raw.importance ??
        (editorialRole === "hook" ||
        editorialRole === "conclusion" ||
        editorialRole === "turning-point"
          ? 5
          : editorialRole === "cause"
            ? 4
            : 3),
      ...semantic,
    };
  });
  const decisions = beats.map((beat, index) => {
    const selected = chooseMedia(
      unitsText(input.narrationUnits, beat.coveredNarrationUnitIds),
      beat,
      claims,
      input.researchAssetTypes ?? [],
      input.productionCostPreference ?? "balanced"
    );
    return {
      id: `media-${String(index + 1).padStart(3, "0")}`,
      beatId: beat.id,
      ...selected,
      adaptations: adaptations(selected.selectedMediaType),
    };
  });
  let cursor = 0;
  const shots: EditorialShot[] = [];
  for (const [index, beat] of beats.entries()) {
    const decision = decisions[index]!;
    const duration = Math.max(
      1500,
      beat.coveredNarrationUnitIds.reduce(
        (total, id) =>
          total +
          Math.max(
            900,
            (input.narrationUnits
              .find((unit) => unit.id === id)
              ?.text.split(/\s+/u).length ?? 1) * 300
          ),
        0
      )
    );
    const multi =
      beat.importance >= 4 || beat.editorialRole === "turning-point";
    const count = multi ? 2 : 1;
    for (let part = 0; part < count; part += 1) {
      const startMs = cursor + Math.floor((duration * part) / count);
      const endMs = cursor + Math.floor((duration * (part + 1)) / count);
      const first = part === 0;
      shots.push({
        id: `shot-${String(shots.length + 1).padStart(3, "0")}`,
        sequenceId: multi
          ? `sequence-${beat.id}`
          : `sequence-${beat.id}-single`,
        beatId: beat.id,
        editorialFunction: first
          ? beat.editorialRole === "cause"
            ? "explain"
            : "establish"
          : beat.editorialRole === "cause"
            ? "reveal"
            : "detail",
        assetIntentId: decision.id,
        narrationUnitIds: beat.coveredNarrationUnitIds,
        startMs,
        endMs,
        compositionIntent: first
          ? `Establish the narrated ${decision.selectedMediaType} at contextual scale.`
          : "Move to the evidence-bearing detail that changes the viewer’s interpretation.",
        cameraOrMotionIntent: first
          ? "Controlled lateral reveal to orient the viewer."
          : "Slow push toward the decisive detail; preserve all claim-bearing information.",
        transitionIntent:
          first && multi
            ? "Cut on the narrated turn from context to consequence."
            : "Dissolve only after the narration completes this idea.",
      });
    }
    cursor += duration;
  }
  return {
    plannerVersion: HISTORY_EDITORIAL_V31,
    beats,
    mediaDecisions: decisions,
    shots,
    diagnostics: diagnostics(beats, decisions, shots),
  };
}
