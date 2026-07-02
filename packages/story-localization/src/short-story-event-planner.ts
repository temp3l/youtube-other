import {
  hashText,
  normalizeWhitespace,
  splitIntoSentences,
} from "@mediaforge/shared";
import { getLanguageProfile } from "./language-profiles.js";
import {
  resolveNarrationTimingEstimate,
  type NarrationTimingEstimate,
} from "./narration-constraints.js";
import {
  type ShortStoryOutputConstraints,
  type StoryIR,
} from "./story-artifact-model.js";
import {
  type CanonicalStoryFacts,
  type LanguageCode,
} from "./story-localization.types.js";
import {
  type ShortBeatPlan,
  type ShortBeatPlanBeat,
  type ShortNarrationQualityIssue,
  type ShortNarrationQualitySummary,
  type ShortNarrativeRole,
  type StoryEvent,
  type ShortRewriteSourceBeat,
} from "./short-rewrite.types.js";

export interface ShortStoryEventPlanInput {
  readonly language: LanguageCode;
  readonly locale: string;
  readonly storyIr: StoryIR;
  readonly canonicalFacts: CanonicalStoryFacts;
  readonly sourceBeats: readonly ShortRewriteSourceBeat[];
  readonly outputConstraints: ShortStoryOutputConstraints;
}

export interface ShortStoryEventPlanResult {
  readonly events: readonly StoryEvent[];
  readonly selectedEventIds: readonly string[];
  readonly beatPlan: ShortBeatPlan;
  readonly causalValidation: {
    readonly status: "passed" | "failed";
    readonly issues: readonly string[];
  };
  readonly timingEstimate: NarrationTimingEstimate;
}

interface EventCandidate {
  readonly id: string;
  readonly chronologyIndex: number;
  readonly text: string;
  readonly sourceBeatIds: readonly string[];
  readonly sourceFacts: readonly string[];
  readonly sourceBeatOrder: number;
}

interface SentenceProfile {
  readonly kind:
    | "physical-event"
    | "observable-evidence"
    | "character-decision"
    | "sensory-detail"
    | "escalation"
    | "rule"
    | "reversal"
    | "reveal"
    | "transition"
    | "abstract-commentary"
    | "editorial-commentary";
  readonly storyState: string;
}

function normalize(text: string): string {
  return normalizeWhitespace(text);
}

function sentenceHash(text: string): string {
  return hashText(normalize(text)).slice(0, 12);
}

function pickTargetDurationSeconds(args: ShortStoryOutputConstraints): 30 | 45 | 60 | 75 {
  const center = Math.round((args.targetDuration.minSeconds + args.targetDuration.maxSeconds) / 2);
  if (center <= 37) {
    return 30;
  }
  if (center <= 52) {
    return 45;
  }
  if (center <= 67) {
    return 60;
  }
  return 75;
}

function splitClauses(text: string): readonly string[] {
  const sentences = splitIntoSentences(text);
  const clauses: string[] = [];
  for (const sentence of sentences) {
    const normalized = normalize(sentence);
    if (!normalized) {
      continue;
    }
    const parts = normalized
      .split(/(?:;\s+|:\s+|—\s+| -\s+|,\s+(?=(?:then|but|and|so|when|while|after|before|because|that|which|who|where|if|as)\b))/iu)
      .map((entry) => normalize(entry))
      .filter(Boolean);
    if (parts.length === 0) {
      clauses.push(normalized);
      continue;
    }
    clauses.push(...parts);
  }
  return clauses;
}

function collectSourceFacts(args: {
  readonly canonicalFacts: CanonicalStoryFacts;
  readonly storyIr: StoryIR;
}): readonly string[] {
  return [
    args.canonicalFacts.setting,
    args.canonicalFacts.threat,
    args.canonicalFacts.primaryReveal,
    args.canonicalFacts.finalConsequence,
    args.canonicalFacts.unresolvedQuestion ?? "",
    args.storyIr.centralThreat.description,
    args.storyIr.centralRuleMechanism.description,
    args.storyIr.climax,
    args.storyIr.endingConsequence,
    ...args.storyIr.immutableFacts.map((fact) => fact.statement),
    ...args.storyIr.writtenMessages.map((message) => message.text),
    ...args.storyIr.chronology,
  ]
    .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    .map((entry) => normalize(entry))
    .filter(Boolean);
}

function collectCandidateTexts(args: {
  readonly sourceBeats: readonly ShortRewriteSourceBeat[];
  readonly storyIr: StoryIR;
  readonly canonicalFacts: CanonicalStoryFacts;
}): readonly EventCandidate[] {
  const candidates: EventCandidate[] = [];
  const sourceFactSet = collectSourceFacts({
    canonicalFacts: args.canonicalFacts,
    storyIr: args.storyIr,
  });
  let chronologyIndex = 0;
  for (const [beatOrder, beat] of args.sourceBeats.entries()) {
    const clauses = splitClauses(beat.text);
    for (const clause of clauses) {
      const text = normalize(clause);
      if (!text) {
        continue;
      }
      const sourceBeatIds = args.sourceBeats
        .filter((entry) => clauseMatchesBeat(text, entry))
        .map((entry) => entry.id);
      const sourceFacts = sourceFactSet.filter((fact) => clauseIncludesPhrase(text, fact));
      candidates.push({
        id: `e${String(candidates.length + 1).padStart(2, "0")}-${beat.id}-${sentenceHash(text)}`,
        chronologyIndex,
        text,
        sourceBeatIds,
        sourceFacts,
        sourceBeatOrder: beatOrder,
      });
      chronologyIndex += 1;
    }
  }
  for (const entry of [
    ...args.storyIr.chronology,
    ...args.canonicalFacts.criticalEvents,
    args.storyIr.climax,
    args.storyIr.endingConsequence,
    args.storyIr.centralThreat.description,
    args.storyIr.centralRuleMechanism.description,
    ...args.storyIr.writtenMessages.map((item) => item.text),
  ]) {
    for (const clause of splitClauses(entry)) {
      const text = normalize(clause);
      if (!text) {
        continue;
      }
      const matchedBeatIds = args.sourceBeats
        .filter((beat) => clauseMatchesBeat(text, beat))
        .map((beat) => beat.id);
      candidates.push({
        id: `e${String(candidates.length + 1).padStart(2, "0")}-supp-${sentenceHash(text)}`,
        chronologyIndex,
        text,
        sourceBeatIds: matchedBeatIds,
        sourceFacts: sourceFactSet.filter((fact) => clauseIncludesPhrase(text, fact)),
        sourceBeatOrder:
          matchedBeatIds.length > 0
            ? Math.min(
                ...matchedBeatIds.map((beatId) =>
                  args.sourceBeats.findIndex((beat) => beat.id === beatId)
                ).filter((index) => index >= 0)
              )
            : args.sourceBeats.length + chronologyIndex,
      });
      chronologyIndex += 1;
    }
  }
  return dedupeCandidates(candidates);
}

function dedupeCandidates(candidates: readonly EventCandidate[]): readonly EventCandidate[] {
  const seen = new Set<string>();
  const result: EventCandidate[] = [];
  for (const candidate of candidates) {
    const normalized = normalize(candidate.text).toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(candidate);
  }
  return result;
}

function clauseMatchesBeat(clause: string, beat: ShortRewriteSourceBeat): boolean {
  const normalizedClause = normalize(clause).toLowerCase();
  const normalizedBeat = normalize(beat.text).toLowerCase();
  if (normalizedClause.length === 0 || normalizedBeat.length === 0) {
    return false;
  }
  if (normalizedBeat.includes(normalizedClause) || normalizedClause.includes(normalizedBeat)) {
    return true;
  }
  const clauseTokens = tokenize(normalizedClause);
  const beatTokens = tokenize(normalizedBeat);
  if (clauseTokens.length === 0 || beatTokens.length === 0) {
    return false;
  }
  const shared = clauseTokens.filter((token) => beatTokens.includes(token));
  return shared.length >= Math.min(3, Math.ceil(clauseTokens.length * 0.55));
}

function clauseIncludesPhrase(text: string, phrase: string): boolean {
  const normalizedText = normalize(text).toLowerCase();
  const normalizedPhrase = normalize(phrase).toLowerCase();
  if (!normalizedPhrase) {
    return false;
  }
  if (normalizedText.includes(normalizedPhrase)) {
    return true;
  }
  const phraseTokens = tokenize(normalizedPhrase);
  if (phraseTokens.length === 0) {
    return false;
  }
  return phraseTokens.filter((token) => normalizedText.includes(token)).length >= Math.max(2, Math.ceil(phraseTokens.length * 0.6));
}

function tokenize(text: string): readonly string[] {
  return text
    .split(/[^\p{L}\p{N}]+/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 3);
}

function classifySentence(text: string, index: number, total: number): SentenceProfile {
  const normalized = normalize(text).toLowerCase();
  if (/\b(already inside|it had been inside|was inside|from inside|inside the room|wardrobe opened from inside|through the closed glass|look directly at him|look directly at her|never trying to get in)\b/iu.test(normalized)) {
    return { kind: "reveal", storyState: "inside-outside reversal" };
  }
  if (/\b(no balcony|no tree|no ladder|no footprints|no scrape|no branch|locked|closed|window latch|wardrobe|camera|recording|photograph|marks|second floor|glass|breathing between the taps|2:11|kein balkon|keine spuren|verschlossen|kamera|aufnahme|foto|glas|zweiter stock)\b/iu.test(normalized)) {
    return { kind: "observable-evidence", storyState: "physical evidence" };
  }
  if (/\b(at exactly|\b\d{1,2}:\d{2}\b|again|returned|recurred|repeated|same|\bpattern\b|every night|next night|breathing|copied the breathing|wieder|erneut|kam zurück|atmen)\b/iu.test(normalized)) {
    return { kind: "escalation", storyState: "recurring threat" };
  }
  if (/\b(if|unless|when|after|before|because|looking|mirror|eye contact|rule|still made it retreat|made it retreat|must not|never answer|wenn|bevor|danach|regel|direkt ansehen|niemals antworten)\b/iu.test(normalized)) {
    return { kind: "rule", storyState: "behavioral rule" };
  }
  if (/\b(tried|set a trap|checked|installed|searched|burned|covered|tested|compared|carried|placed|looked|opened|recorded|filmed|verbrannte|verriegelte|öffnete|prüfte|sah nach|filmte)\b/iu.test(normalized)) {
    return { kind: "character-decision", storyState: "investigation" };
  }
  if (/\b(tapping|breathing|crawled|moved|crossed|approached|watched|appeared|opened|asked|copied|exited|atmen|kroch|bewegte|öffnete|fragte|erschien)\b/iu.test(normalized)) {
    return index === 0 ? { kind: "physical-event", storyState: "unexplained intrusion" } : { kind: "physical-event", storyState: "visible threat" };
  }
  if (/\b(saw|showed|recording|camera|footage|mirror|reflection|photo|sah|zeigte|aufnahme|kamera|foto|spiegel)\b/iu.test(normalized)) {
    return { kind: "observable-evidence", storyState: "recorded proof" };
  }
  if (/\b(house|bedroom|window|bed|room|ceiling|hallway|farmhouse|haus|zimmer|fenster|decke|flur)\b/iu.test(normalized)) {
    return { kind: "transition", storyState: "setting" };
  }
  if (/\b(had been|could not|should have|seemed|felt like|less like|story|meaning|answer|nobody could explain|people say|it was the kind of room)\b/iu.test(normalized)) {
    return { kind: "abstract-commentary", storyState: "interpretation" };
  }
  if (/\b(there was no sensible way|should have|felt less like|the answer should|the narration|the story|and that was not the end|the fear became clearer)\b/iu.test(normalized)) {
    return { kind: "editorial-commentary", storyState: "commentary" };
  }
  return total > 0 && index === 0
    ? { kind: "physical-event", storyState: "hook" }
    : { kind: "sensory-detail", storyState: "observation" };
}

function buildNarrativeRoles(profile: SentenceProfile, index: number, total: number): readonly ShortNarrativeRole[] {
  const roles = new Set<ShortNarrativeRole>();
  if (index === 0 || profile.kind === "physical-event") {
    roles.add("hook");
  }
  if (profile.kind === "observable-evidence" || profile.kind === "sensory-detail") {
    roles.add("evidence");
  }
  if (profile.kind === "character-decision") {
    roles.add("decision");
  }
  if (profile.kind === "rule") {
    roles.add("rule");
  }
  if (profile.kind === "reveal") {
    roles.add("reveal");
    roles.add("reversal");
  }
  if (profile.kind === "transition" && index > 0) {
    roles.add("setup");
  }
  if (index > 0 && index < total - 1 && (profile.kind === "physical-event" || profile.kind === "observable-evidence")) {
    roles.add("escalation");
  }
  if (index === total - 1) {
    roles.add("consequence");
    roles.add("sting");
  }
  if (roles.size === 0) {
    roles.add(index === 0 ? "hook" : "setup");
  }
  return [...roles];
}

function scoreEvent(args: {
  readonly profile: SentenceProfile;
  readonly index: number;
  readonly total: number;
  readonly text: string;
  readonly sourceBeatIds: readonly string[];
  readonly sourceFacts: readonly string[];
}): {
  readonly visualStrength: 1 | 2 | 3 | 4 | 5;
  readonly horrorIntensity: 1 | 2 | 3 | 4 | 5;
  readonly informationValue: 1 | 2 | 3 | 4 | 5;
} {
  const normalized = args.text.toLowerCase();
  const isConcrete = /\b(window|wardrobe|camera|footage|glass|breathing|marks|footprints|ceiling|bed|door|house|mirror|photo|photograph|man|figure|thing)\b/iu.test(normalized);
  const isThreat = /\b(tapping|breathing|figure|creature|inside|retreat|crawled|crossed|opened|watched|exits?|grabbed|staring)\b/iu.test(normalized);
  const isEvidence = /\b(camera|footage|marks|footprints|photograph|recording|trace|print|glass)\b/iu.test(normalized);
  const isRule = /\b(if|when|looking|mirror|eye contact|retreat)\b/iu.test(normalized);
  const visualStrength = clampScore(
    (isConcrete ? 3 : 1) +
      (isEvidence ? 1 : 0) +
      (isThreat ? 1 : 0) +
      (args.profile.kind === "reveal" ? 1 : 0)
  );
  const horrorIntensity = clampScore(
    (isThreat ? 2 : 0) +
      (args.profile.kind === "reveal" ? 2 : 0) +
      (args.profile.kind === "escalation" ? 1 : 0) +
      (args.index >= args.total - 2 ? 1 : 0)
  );
  const informationValue = clampScore(
    1 +
      (args.sourceBeatIds.length > 0 ? 1 : 0) +
      (args.sourceFacts.length > 0 ? 1 : 0) +
      (isEvidence ? 1 : 0) +
      (isRule ? 1 : 0) +
      (args.profile.kind === "reveal" ? 1 : 0)
  );
  return { visualStrength, horrorIntensity, informationValue };
}

function clampScore(value: number): 1 | 2 | 3 | 4 | 5 {
  const clamped = Math.max(1, Math.min(5, Math.round(value)));
  return clamped as 1 | 2 | 3 | 4 | 5;
}

function buildEvents(args: ShortStoryEventPlanInput): readonly StoryEvent[] {
  const candidates = collectCandidateTexts({
    sourceBeats: args.sourceBeats,
    storyIr: args.storyIr,
    canonicalFacts: args.canonicalFacts,
  });
  const sourceFactTexts = collectSourceFacts({
    canonicalFacts: args.canonicalFacts,
    storyIr: args.storyIr,
  });
  return candidates.map((candidate, index) => {
    const profile = classifySentence(candidate.text, index, candidates.length);
    const roles = buildNarrativeRoles(profile, index, candidates.length);
    const scoring = scoreEvent({
      profile,
      index,
      total: candidates.length,
      text: candidate.text,
      sourceBeatIds: candidate.sourceBeatIds,
      sourceFacts: candidate.sourceFacts,
    });
    const dependencies = buildCausalDependencies({
      candidates,
      index,
      roles,
      profile,
    });
    const actor = inferActor(candidate.text);
    const object = inferObject(candidate.text);
    const location = inferLocation(candidate.text);
    return {
      id: candidate.id,
      chronologyIndex: candidate.chronologyIndex,
      statement: candidate.text,
      ...(actor ? { actor } : {}),
      action: inferAction(candidate.text),
      ...(object ? { object } : {}),
      ...(location ? { location } : {}),
      narrativeRoles: roles,
      visualStrength: scoring.visualStrength,
      horrorIntensity: scoring.horrorIntensity,
      informationValue: scoring.informationValue,
      causalDependencyIds: dependencies.filter(Boolean),
      mandatoryFacts:
        candidate.sourceFacts.length > 0
          ? [...new Set(candidate.sourceFacts)]
          : sourceFactTexts.slice(0, Math.min(3, sourceFactTexts.length)),
      optionalDetails: candidate.sourceBeatIds.length > 0 ? [...candidate.sourceBeatIds] : [],
      sourceBeatIds: candidate.sourceBeatIds,
    } satisfies StoryEvent;
  });
}

function buildCausalDependencies(args: {
  readonly candidates: readonly EventCandidate[];
  readonly index: number;
  readonly roles: readonly ShortNarrativeRole[];
  readonly profile: SentenceProfile;
}): readonly string[] {
  if (args.index === 0) {
    return [];
  }
  const prior = args.candidates.slice(0, args.index);
  const lastPrior = prior.at(-1)?.id;
  if (args.roles.includes("reveal") || args.roles.includes("reversal")) {
    return prior
      .filter((candidate) =>
        /(?:camera|footage|marks|window|wardrobe|mirror|looking|breathing|tapping|recording)/iu.test(
          candidate.text
        )
      )
      .slice(-2)
      .map((candidate) => candidate.id);
  }
  if (args.roles.includes("sting") || args.roles.includes("consequence")) {
    return prior
      .filter((candidate) =>
        /(?:reveal|reversal|already inside|from inside|leaving)/iu.test(
          candidate.text
        )
      )
      .slice(-2)
      .map((candidate) => candidate.id);
  }
  if (args.roles.includes("rule")) {
    return prior
      .filter((candidate) =>
        /(?:evidence|camera|marks|footprints|window|wardrobe)/iu.test(
          candidate.text
        )
      )
      .slice(-1)
      .map((candidate) => candidate.id);
  }
  if (args.roles.includes("escalation")) {
    return lastPrior ? [lastPrior] : [];
  }
  if (args.profile.kind === "character-decision") {
    return prior
      .filter((candidate) => /(?:evidence|rule|reveal)/iu.test(candidate.text))
      .slice(-1)
      .map((candidate) => candidate.id);
  }
  return [];
}

function inferActor(text: string): string | undefined {
  const match = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/u.exec(text);
  if (!match) {
    return undefined;
  }
  const actor = normalize(match[1] ?? "");
  return actor.length > 0 ? actor : undefined;
}

function inferAction(text: string): string {
  const normalized = normalize(text);
  const verbs = [
    "taps",
    "tapped",
    "starts",
    "started",
    "appears",
    "appeared",
    "breathes",
    "breathed",
    "moves",
    "moved",
    "opens",
    "opened",
    "crawls",
    "crawled",
    "reveals",
    "revealed",
    "records",
    "recorded",
    "returns",
    "returned",
    "shows",
    "showed",
  ] as const;
  const lower = normalized.toLowerCase();
  for (const verb of verbs) {
    if (lower.includes(verb)) {
      return verb;
    }
  }
  return normalized.split(/\s+/u).slice(0, 4).join(" ");
}

function inferObject(text: string): string | undefined {
  const match = /\b(window|wardrobe|camera|mirror|glass|photograph|bed|ceiling|door|hallway|house|farmhouse)\b/iu.exec(text);
  return match?.[1];
}

function inferLocation(text: string): string | undefined {
  const match = /\b(second floor|upstairs|bedroom|outside|inside|ceiling|window|wardrobe|farmhouse|yard|hallway|room)\b/iu.exec(text);
  return match?.[1];
}

const ROLE_BLUEPRINTS: Readonly<
  Record<30 | 45 | 60 | 75, readonly ShortNarrativeRole[]>
> = {
  30: ["hook", "evidence", "escalation", "reveal"],
  45: ["hook", "evidence", "escalation", "reversal", "sting"],
  60: ["hook", "evidence", "escalation", "escalation", "reveal", "consequence", "sting"],
  75: ["hook", "setup", "evidence", "rule", "escalation", "escalation", "reveal", "sting"],
} as const;

function narrativePriority(role: ShortNarrativeRole): readonly ShortNarrativeRole[] {
  switch (role) {
    case "hook":
      return ["hook", "evidence", "setup"];
    case "setup":
      return ["setup", "evidence", "decision"];
    case "evidence":
      return ["evidence", "setup", "decision"];
    case "decision":
      return ["decision", "evidence", "setup"];
    case "escalation":
      return ["escalation", "evidence", "decision", "rule"];
    case "rule":
      return ["rule", "evidence", "decision"];
    case "reversal":
      return ["reversal", "reveal", "escalation"];
    case "reveal":
      return ["reveal", "reversal", "consequence"];
    case "consequence":
      return ["consequence", "sting", "reveal"];
    case "sting":
      return ["sting", "consequence", "reveal"];
  }
}

function eventRoleScore(event: StoryEvent, requestedRole: ShortNarrativeRole): number {
  const priorities = narrativePriority(requestedRole);
  const matchedPriority = priorities.findIndex((role) =>
    event.narrativeRoles.includes(role)
  );
  const roleBonus = matchedPriority === -1 ? 0 : priorities.length - matchedPriority;
  return (
    roleBonus * 10 +
    event.visualStrength * 3 +
    event.horrorIntensity * 3 +
    event.informationValue * 2
  );
}

function closeDependencies(
  events: readonly StoryEvent[],
  selectedIds: Set<string>
): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const event of events) {
      if (!selectedIds.has(event.id)) {
        continue;
      }
      for (const dependencyId of event.causalDependencyIds) {
        if (selectedIds.has(dependencyId)) {
          continue;
        }
        selectedIds.add(dependencyId);
        changed = true;
      }
    }
  }
}

function pickEventForRole(args: {
  readonly events: readonly StoryEvent[];
  readonly requestedRole: ShortNarrativeRole;
  readonly usedIds: ReadonlySet<string>;
  readonly minimumChronologyIndex: number;
}): StoryEvent | undefined {
  const candidates = args.events.filter(
    (event) =>
      !args.usedIds.has(event.id) &&
      event.chronologyIndex >= args.minimumChronologyIndex &&
      narrativePriority(args.requestedRole).some((role) =>
        event.narrativeRoles.includes(role)
      )
  );
  if (candidates.length === 0) {
    return undefined;
  }
  return [...candidates].sort((left, right) => {
    const scoreDifference =
      eventRoleScore(right, args.requestedRole) -
      eventRoleScore(left, args.requestedRole);
    if (scoreDifference !== 0) {
      return scoreDifference;
    }
    if (args.requestedRole === "hook") {
      return left.chronologyIndex - right.chronologyIndex;
    }
    if (
      args.requestedRole === "reveal" ||
      args.requestedRole === "reversal" ||
      args.requestedRole === "consequence" ||
      args.requestedRole === "sting"
    ) {
      return right.chronologyIndex - left.chronologyIndex;
    }
    return left.chronologyIndex - right.chronologyIndex;
  })[0];
}

function pickSelectedEventIds(args: {
  readonly events: readonly StoryEvent[];
  readonly targetDurationSeconds: 30 | 45 | 60 | 75;
}): readonly string[] {
  const selectedIds = new Set<string>();
  let minimumChronologyIndex = 0;
  for (const role of ROLE_BLUEPRINTS[args.targetDurationSeconds]) {
    const candidate = pickEventForRole({
      events: args.events,
      requestedRole: role,
      usedIds: selectedIds,
      minimumChronologyIndex,
    });
    if (!candidate) {
      continue;
    }
    selectedIds.add(candidate.id);
    minimumChronologyIndex = candidate.chronologyIndex;
  }
  if (selectedIds.size === 0 && args.events[0]) {
    selectedIds.add(args.events[0].id);
  }
  closeDependencies(args.events, selectedIds);
  for (const requiredRole of ["hook", "evidence", "reveal", "sting"] as const) {
    const alreadyCovered = args.events.some(
      (event) =>
        selectedIds.has(event.id) && event.narrativeRoles.includes(requiredRole)
    );
    if (alreadyCovered) {
      continue;
    }
    const fallback = pickEventForRole({
      events: args.events,
      requestedRole: requiredRole,
      usedIds: selectedIds,
      minimumChronologyIndex: requiredRole === "hook" ? 0 : 1,
    });
    if (fallback) {
      selectedIds.add(fallback.id);
      closeDependencies(args.events, selectedIds);
    }
  }
  const targetCount = ROLE_BLUEPRINTS[args.targetDurationSeconds].length;
  for (const event of args.events) {
    if (selectedIds.size >= targetCount) {
      break;
    }
    if (event.chronologyIndex < minimumChronologyIndex && event.narrativeRoles.includes("hook")) {
      continue;
    }
    selectedIds.add(event.id);
  }
  closeDependencies(args.events, selectedIds);
  return args.events
    .filter((event) => selectedIds.has(event.id))
    .sort((left, right) => left.chronologyIndex - right.chronologyIndex)
    .map((event) => event.id);
}

function buildBeatPlan(args: {
  readonly events: readonly StoryEvent[];
  readonly selectedEventIds: readonly string[];
  readonly targetDurationSeconds: 30 | 45 | 60 | 75;
}): ShortBeatPlan {
  const selectedEvents = args.selectedEventIds
    .map((id) => args.events.find((event) => event.id === id))
    .filter((event): event is StoryEvent => Boolean(event))
    .sort((left, right) => left.chronologyIndex - right.chronologyIndex);
  const totalWeight = selectedEvents.reduce((sum, event) => sum + roleWeight(event), 0) || 1;
  const blueprint = ROLE_BLUEPRINTS[args.targetDurationSeconds];
  let cursor = 0;
  const beats: ShortBeatPlanBeat[] = selectedEvents.map((event, index) => {
    const weight = roleWeight(event);
    const beatDuration = Math.max(4, Math.round((args.targetDurationSeconds * weight) / totalWeight));
    const start = index === 0 ? 0 : cursor;
    const end = index === selectedEvents.length - 1 ? args.targetDurationSeconds : Math.min(args.targetDurationSeconds, start + beatDuration);
    cursor = end;
    const role = resolveBeatRole(
      event,
      index,
      selectedEvents.length,
      blueprint[index]
    );
    return {
      id: `beat-${event.id}`,
      role,
      eventIds: [event.id],
      targetStartSecond: start,
      targetEndSecond: Math.max(end, start + 1),
      purpose: buildBeatPurpose(event),
    };
  });
  return {
    targetDurationSeconds: args.targetDurationSeconds,
    selectedEventIds: [...args.selectedEventIds],
    beats,
    endingStrategy: decideEndingStrategy(selectedEvents),
  };
}

function resolveBeatRole(
  event: StoryEvent,
  index: number,
  total: number,
  blueprintRole?: ShortNarrativeRole | undefined
): ShortNarrativeRole {
  if (blueprintRole && event.narrativeRoles.includes(blueprintRole)) {
    return blueprintRole;
  }
  if (index === total - 1) {
    return determineEndingBeatRole(event);
  }
  if (blueprintRole) {
    return blueprintRole;
  }
  const priority: readonly ShortNarrativeRole[] =
    index === 0
      ? ["hook", "evidence", "setup", "decision", "escalation"]
      : [
          "reveal",
          "reversal",
          "escalation",
          "evidence",
          "rule",
          "decision",
          "setup",
          "hook",
        ];
  for (const role of priority) {
    if (event.narrativeRoles.includes(role)) {
      return role;
    }
  }
  return event.narrativeRoles[0] ?? "setup";
}

function decideEndingStrategy(events: readonly StoryEvent[]): ShortBeatPlan["endingStrategy"] {
  if (events.some((event) => event.narrativeRoles.includes("sting"))) {
    return "full-ending";
  }
  if (events.some((event) => event.narrativeRoles.includes("reveal"))) {
    return "main-reveal";
  }
  if (events.some((event) => event.narrativeRoles.includes("reversal"))) {
    return "mid-story-reversal";
  }
  return "single-scare";
}

function determineEndingBeatRole(event: StoryEvent): ShortNarrativeRole {
  const priority: readonly ShortNarrativeRole[] = [
    "sting",
    "consequence",
    "reveal",
    "reversal",
    "escalation",
    "evidence",
    "setup",
    "decision",
    "rule",
    "hook",
  ];
  for (const role of priority) {
    if (event.narrativeRoles.includes(role)) {
      return role;
    }
  }
  return event.narrativeRoles[0] ?? "setup";
}

function roleWeight(event: StoryEvent): number {
  if (event.narrativeRoles.includes("hook")) {
    return 3;
  }
  if (event.narrativeRoles.includes("reveal") || event.narrativeRoles.includes("sting")) {
    return 4;
  }
  if (event.narrativeRoles.includes("escalation")) {
    return 3;
  }
  if (event.narrativeRoles.includes("evidence") || event.narrativeRoles.includes("rule")) {
    return 2;
  }
  return 1;
}

function buildBeatPurpose(event: StoryEvent): string {
  if (event.narrativeRoles.includes("hook")) {
    return "Open with immediate threat and orient the listener.";
  }
  if (event.narrativeRoles.includes("evidence")) {
    return "Anchor the scare in physical proof.";
  }
  if (event.narrativeRoles.includes("rule")) {
    return "State the rule that changes the danger.";
  }
  if (event.narrativeRoles.includes("reveal")) {
    return "Land the reversal or reveal.";
  }
  if (event.narrativeRoles.includes("sting")) {
    return "Finish with the final sting.";
  }
  if (event.narrativeRoles.includes("escalation")) {
    return "Escalate the pressure without losing chronology.";
  }
  return "Advance the short story in order.";
}

function causalValidate(events: readonly StoryEvent[], selectedEventIds: readonly string[]): { readonly status: "passed" | "failed"; readonly issues: readonly string[] } {
  const selected = new Set(selectedEventIds);
  const issues: string[] = [];
  for (const event of events.filter((entry) => selected.has(entry.id))) {
    for (const dependencyId of event.causalDependencyIds) {
      if (!selected.has(dependencyId)) {
        issues.push(`Event ${event.id} is missing dependency ${dependencyId}.`);
      }
    }
  }
  const selectedEvents = events.filter((event) => selected.has(event.id));
  const hasEarlierSupport = (targetIndex: number): boolean =>
    selectedEvents
      .slice(0, targetIndex)
      .some((event) =>
        event.narrativeRoles.some(
          (role) => role !== "reveal" && role !== "sting" && role !== "consequence"
        )
      );
  if (selectedEvents.some((event, index) => event.narrativeRoles.includes("reveal") && !hasEarlierSupport(index))) {
    issues.push("Reveal selected without setup or evidence.");
  }
  if (selectedEvents.some((event, index) => event.narrativeRoles.includes("sting") && !hasEarlierSupport(index))) {
    issues.push("Sting selected without a reveal or reversal.");
  }
  if (
    selectedEvents.some(
      (event, index) =>
        event.narrativeRoles.includes("consequence") &&
        !selectedEvents
          .slice(0, index)
          .some(
            (prior) =>
              prior.narrativeRoles.includes("escalation") ||
              prior.narrativeRoles.includes("reveal") ||
              prior.narrativeRoles.includes("reversal")
          )
    )
  ) {
    issues.push("Consequence selected without visible cause.");
  }
  if (
    selectedEvents.some(
      (event, index) =>
        event.narrativeRoles.includes("rule") &&
        index > 0 &&
        !selectedEvents
          .slice(0, index)
          .some(
            (prior) =>
              prior.narrativeRoles.includes("evidence") ||
              prior.narrativeRoles.includes("setup")
          )
    )
  ) {
    issues.push("Rule selected without prior setup or evidence.");
  }
  for (let index = 1; index < selectedEvents.length; index += 1) {
    const current = selectedEvents[index];
    const previous = selectedEvents[index - 1];
    if (
      current !== undefined &&
      previous !== undefined &&
      current.chronologyIndex < previous.chronologyIndex
    ) {
      issues.push("Selected events are not in chronology.");
      break;
    }
  }
  return {
    status: issues.length > 0 ? "failed" : "passed",
    issues,
  };
}

function assessQuality(args: {
  readonly narrationText: string;
  readonly selectedEvents: readonly StoryEvent[];
  readonly beatPlan: ShortBeatPlan;
  readonly causalValidation: { readonly status: "passed" | "failed"; readonly issues: readonly string[] };
  readonly language: "en" | "de" | "es" | "fr" | "pt";
  readonly targetDurationSeconds: 30 | 45 | 60 | 75;
  readonly totalEventCount?: number;
}): ShortNarrationQualitySummary {
  const sentences = splitIntoSentences(args.narrationText).map((sentence) => normalize(sentence)).filter(Boolean);
  const classifications = sentences.map((sentence, index) => classifySentence(sentence, index, sentences.length));
  const abstractCount = classifications.filter((entry) => entry.kind === "abstract-commentary" || entry.kind === "editorial-commentary").length;
  const visualCount = classifications.filter((entry) => entry.kind === "physical-event" || entry.kind === "observable-evidence" || entry.kind === "character-decision" || entry.kind === "sensory-detail" || entry.kind === "rule" || entry.kind === "reversal" || entry.kind === "reveal").length;
  const storyStates = new Set(classifications.map((entry) => entry.storyState).filter(Boolean));
  const localeProfile = getLanguageProfile(args.language);
  const timingEstimate = resolveNarrationTimingEstimate({
    language: args.language,
    narrationText: args.narrationText,
  });
  const eventDensity = args.selectedEvents.length;
  const localeFluencyScore = Math.max(0, Math.min(1, 1 - detectLocalePenalty(args.narrationText, localeProfile.locale)));
  return {
    eventCount: args.totalEventCount ?? args.selectedEvents.length,
    selectedEventCount: args.selectedEvents.length,
    selectedEventIds: args.selectedEvents.map((event) => event.id),
    beatRoles: args.beatPlan.beats.map((beat) => beat.role),
    causalDependencyFailures: [...args.causalValidation.issues],
    eventDensity,
    abstractCommentaryRatio: sentences.length === 0 ? 0 : abstractCount / sentences.length,
    visualizabilityRatio: sentences.length === 0 ? 0 : visualCount / sentences.length,
    storyStateCount: storyStates.size,
    localeFluencyScore,
    estimatedDurationSeconds: Math.round(timingEstimate.totalDurationMs / 1000),
    timingEstimate,
    issues: buildQualityIssues({
      sentences,
      classifications,
      selectedEvents: args.selectedEvents,
      beatPlan: args.beatPlan,
      causalValidation: args.causalValidation,
      localeFluencyScore,
      language: args.language,
    }),
  };
}

function buildQualityIssues(args: {
  readonly sentences: readonly string[];
  readonly classifications: readonly SentenceProfile[];
  readonly selectedEvents: readonly StoryEvent[];
  readonly beatPlan: ShortBeatPlan;
  readonly causalValidation: { readonly status: "passed" | "failed"; readonly issues: readonly string[] };
  readonly localeFluencyScore: number;
  readonly language: "en" | "de" | "es" | "fr" | "pt";
}): readonly ShortNarrationQualityIssue[] {
  const issues: ShortNarrationQualityIssue[] = [];
  const abstractRatio = args.sentences.length === 0
    ? 0
    : args.classifications.filter((entry) => entry.kind === "abstract-commentary" || entry.kind === "editorial-commentary").length / args.sentences.length;
  const visualRatio = args.sentences.length === 0
    ? 0
    : args.classifications.filter((entry) => entry.kind === "physical-event" || entry.kind === "observable-evidence" || entry.kind === "character-decision" || entry.kind === "sensory-detail" || entry.kind === "rule" || entry.kind === "reversal" || entry.kind === "reveal").length / args.sentences.length;
  const repetition = detectSentenceRepetition(args.sentences);
  const selectedEventCoverage = args.selectedEvents.length === 0
    ? 0
    : args.selectedEvents.filter((event) => eventCoveredInNarration(event, args.sentences)).length / args.selectedEvents.length;
  const storyStateCount = new Set(args.classifications.map((entry) => entry.storyState)).size;
  const progressionThresholds = {
    30: 3,
    45: 4,
    60: 5,
    75: 6,
  } as const;
  const thresholds = {
    abstract: 0.3,
    visual: 0.75,
    density: {
      30: 3,
      45: 4,
      60: 6,
      75: 7,
    } as const,
  };
  if (abstractRatio > thresholds.abstract) {
    issues.push({
      code: "SHORT_ABSTRACT_COMMENTARY_HIGH",
      message: `Abstract or editorial commentary exceeds the allowed threshold (${Math.round(abstractRatio * 100)}%).`,
      severity: "error",
    });
  }
  if (visualRatio < thresholds.visual) {
    issues.push({
      code: "SHORT_VISUALIZABILITY_LOW",
      message: `Visualizability is below the required threshold (${Math.round(visualRatio * 100)}%).`,
      severity: "error",
    });
  }
  if (repetition.length > 0) {
    issues.push({
      code: "SHORT_SEMANTIC_REPETITION_HIGH",
      message: `Repeated story meaning detected across sentences ${repetition.map((entry) => `${entry[0] + 1}-${entry[1] + 1}`).join(", ")}.`,
      severity: "error",
      sentenceRefs: [...new Set(repetition.flat())],
    });
  }
  if (args.selectedEvents.length < thresholds.density[args.beatPlan.targetDurationSeconds]) {
    issues.push({
      code: "SHORT_EVENT_DENSITY_LOW",
      message: `Only ${args.selectedEvents.length} distinct events were selected for a ${args.beatPlan.targetDurationSeconds}-second short.`,
      severity: "error",
      eventIds: args.selectedEvents.map((event) => event.id),
    });
  }
  if (args.language === "en" && selectedEventCoverage < 0.75) {
    issues.push({
      code: "SHORT_SELECTED_EVENT_COVERAGE_LOW",
      message: `Only ${Math.round(selectedEventCoverage * 100)}% of selected events are reflected in the narration.`,
      severity: "error",
      eventIds: args.selectedEvents.map((event) => event.id),
    });
  }
  if (storyStateCount < progressionThresholds[args.beatPlan.targetDurationSeconds]) {
    issues.push({
      code: "SHORT_STORY_STATE_PROGRESSION_LOW",
      message: `Narration only advances through ${storyStateCount} distinct story states; the ${args.beatPlan.targetDurationSeconds}-second profile expects more progression.`,
      severity: "error",
    });
  }
  if (args.causalValidation.status === "failed") {
    issues.push({
      code: "SHORT_CAUSAL_COMPLETENESS_FAILED",
      message: "Selected beat plan has unresolved causal dependencies.",
      severity: "error",
      eventIds: args.selectedEvents.map((event) => event.id),
    });
  }
  if (args.localeFluencyScore < 0.7) {
    issues.push({
      code: "SHORT_LOCALE_FLUENCY_LOW",
      message: "Locale fluency is below the configured threshold.",
      severity: "warning",
    });
  }
  return issues;
}

function eventCoveredInNarration(event: StoryEvent, sentences: readonly string[]): boolean {
  const candidates = [
    event.statement,
    event.action,
    event.object ?? "",
    event.location ?? "",
    ...event.mandatoryFacts.slice(0, 2),
  ]
    .map((entry) => normalize(entry).toLowerCase())
    .filter(Boolean);
  if (candidates.length === 0) {
    return false;
  }
  return sentences.some((sentence) => {
    const normalizedSentence = normalize(sentence).toLowerCase();
    return candidates.some((candidate) => {
      if (candidate.length === 0) {
        return false;
      }
      if (normalizedSentence.includes(candidate)) {
        return true;
      }
      const candidateTokens = tokenize(candidate);
      if (candidateTokens.length === 0) {
        return false;
      }
      const matched = candidateTokens.filter((token) => normalizedSentence.includes(token));
      return matched.length >= Math.max(2, Math.ceil(candidateTokens.length * 0.6));
    });
  });
}

function detectSentenceRepetition(sentences: readonly string[]): readonly [number, number][] {
  const matches: Array<[number, number]> = [];
  for (let left = 0; left < sentences.length; left += 1) {
    for (let right = left + 1; right < sentences.length; right += 1) {
      const similarity = sentenceSimilarity(sentences[left] ?? "", sentences[right] ?? "");
      if (similarity >= 0.8) {
        matches.push([left, right]);
      }
    }
  }
  return matches;
}

function sentenceSimilarity(left: string, right: string): number {
  const leftTokens = new Set(contentTokens(left));
  const rightTokens = new Set(contentTokens(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const denominator = Math.max(leftTokens.size, rightTokens.size);
  return shared / denominator;
}

function contentTokens(text: string): readonly string[] {
  const stopwords = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "into",
    "under",
    "over",
    "then",
    "when",
    "while",
    "were",
    "was",
    "had",
    "have",
    "been",
    "there",
    "here",
    "what",
    "where",
    "who",
    "whom",
    "whose",
    "weil",
    "und",
    "der",
    "die",
    "das",
    "dass",
    "den",
    "dem",
    "denn",
  ]);
  return normalize(text)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 3 && !stopwords.has(entry));
}

function detectLocalePenalty(text: string, locale: string): number {
  const raw = normalize(text);
  const normalized = raw.toLowerCase();
  const locales: Record<string, { readonly requiredAny: readonly string[]; readonly forbidden: readonly string[] }> = {
    "de-DE": {
      requiredAny: [" der ", " die ", " das ", " und ", " nicht ", " war ", " mit "],
      forbidden: [
        " the ",
        " and ",
        " because ",
        " window ",
        " story ",
        " und damit endet die geschichte nicht ",
        " die angst wurde genauer ",
        " die geschichte blieb bestehen ",
      ],
    },
    "es-419": {
      requiredAny: [" el ", " la ", " que ", " de ", " y "],
      forbidden: [" the ", " and ", " window "],
    },
    "fr-FR": {
      requiredAny: [" le ", " la ", " les ", " et ", " dans "],
      forbidden: [" the ", " and ", " window "],
    },
    "pt-BR": {
      requiredAny: [" o ", " a ", " que ", " e ", " não "],
      forbidden: [" the ", " and ", " window "],
    },
    "en-US": {
      requiredAny: [" the ", " and ", " of ", " to ", " in "],
      forbidden: [],
    },
  };
  const profile = locales[locale] ?? locales["en-US"];
  if (!profile) {
    return 0;
  }
  const hasRequired = profile.requiredAny.some((entry) => normalized.includes(entry));
  const forbiddenHits = profile.forbidden.filter((entry) => normalized.includes(entry)).length;
  const repeatedFullNamePenalty =
    locale === "de-DE"
      ? Math.max(
          0,
          ((raw.match(/\b[A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)+\b/gu) ?? [])
            .length - 2) * 0.05
        )
      : 0;
  return (hasRequired ? 0 : 0.25) + forbiddenHits * 0.15 + repeatedFullNamePenalty;
}

export function buildShortStoryEventPlan(args: ShortStoryEventPlanInput): ShortStoryEventPlanResult {
  const events = buildEvents(args);
  const targetDurationSeconds = pickTargetDurationSeconds(args.outputConstraints);
  const selectedEventIds = pickSelectedEventIds({
    events,
    targetDurationSeconds,
  });
  const beatPlan = buildBeatPlan({
    events,
    selectedEventIds,
    targetDurationSeconds,
  });
  const causalValidation = causalValidate(events, selectedEventIds);
  const selectedEvents = selectedEventIds
    .map((eventId) => events.find((event) => event.id === eventId))
    .filter((event): event is StoryEvent => Boolean(event));
  const timingEstimate = resolveNarrationTimingEstimate({
    language: args.language,
    narrationText:
      selectedEvents.length > 0
        ? selectedEvents.map((event) => event.mandatoryFacts[0] ?? event.action).join(" ")
        : events.slice(0, 1).map((event) => event.mandatoryFacts[0] ?? event.action).join(" "),
    wordCount:
      selectedEvents.length > 0
        ? undefined
        : Math.max(1, selectedEventIds.length * 12),
  });
  return {
    events,
    selectedEventIds,
    beatPlan,
    causalValidation,
    timingEstimate,
  };
}

export function assessShortNarrationQuality(args: {
  readonly narrationText: string;
  readonly selectedEvents: readonly StoryEvent[];
  readonly beatPlan: ShortBeatPlan;
  readonly causalValidation: { readonly status: "passed" | "failed"; readonly issues: readonly string[] };
  readonly language: "en" | "de" | "es" | "fr" | "pt";
  readonly targetDurationSeconds: 30 | 45 | 60 | 75;
  readonly totalEventCount?: number;
}): ShortNarrationQualitySummary {
  return assessQuality(args);
}
