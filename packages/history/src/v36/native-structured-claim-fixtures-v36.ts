import {
  createNativeStructuredClaimSidecarV36,
  type NativeStructuredClaimProposalV36,
  type NativeStructuredClaimSidecarV36,
  type NativeStructuredClaimSourceV36,
  type NativeStructuredPropositionDraftV36,
} from "./native-structured-claim-generator-v36.js";

export const representativeNativeEpisodeFragmentsV36 = [
  "01-bronze-age-collapse",
  "04-black-death",
  "05-franklin-expedition",
  "36-spanish-armada-why-it-failed",
  "31-d-day-normandy-invasion",
  "20-1066-battle-that-changed-england",
  "10-titanic-decisions-disaster",
  "35-chernobyl-night-reactor-exploded",
] as const;

export const representativeNativeProcessClaimIdsV36 = [
  "claim-6c18dacd4ee9e8039e194b0d",
  "claim-6bbe9288262216a338a95084",
] as const;

export const representativeNativeTemporalClaimIdsV36 = [
  "claim-d62f5be40772900d03e6dd9e",
  "claim-368d72f941d735fc6da03526",
] as const;

interface FixtureClaimV36 {
  readonly claimText: string;
  readonly propositions: readonly NativeStructuredPropositionDraftV36[];
}

interface EpisodeFixtureV36 {
  readonly episodeFragment: (typeof representativeNativeEpisodeFragmentsV36)[number];
  readonly claims: readonly FixtureClaimV36[];
}

const concept = (label: string) => ({ kind: "claim-concept", label }) as const;
const entity = (canonicalLabel: string) => ({ kind: "canonical-entity", canonicalLabel }) as const;

export const representativeNativeFixturesV36: readonly EpisodeFixtureV36[] = [
  {
    episodeFragment: "01-bronze-age-collapse",
    claims: [
      {
        claimText: "The mystery remains because the evidence is fragmented and regional.",
        propositions: [{
          sourceText: "The mystery remains because the evidence is fragmented and regional.",
          participants: { evidence: concept("fragmented and regional evidence"), mystery: concept("the mystery remains") },
          subject: "evidence",
          predicate: "causes",
          object: "mystery",
          roles: [{ role: "cause", participant: "evidence" }, { role: "effect", participant: "mystery" }],
          assertionStatus: "asserted",
        }],
      },
      {
        claimText: "Reliefs at Medinet Habu show ships, warriors, families, and battle scenes.",
        propositions: ["ships", "warriors", "families", "battle scenes"].map((evidence) => ({
          sourceText: "Reliefs at Medinet Habu show ships, warriors, families, and battle scenes.",
          participants: { record: concept("Reliefs at Medinet Habu"), evidence: concept(evidence) },
          subject: "record",
          predicate: "contains-evidence-of" as const,
          object: "evidence",
          roles: [{ role: "evidence-target" as const, participant: "record" }, { role: "evidence-item" as const, participant: "evidence" }],
          assertionStatus: "asserted" as const,
        })),
      },
    ],
  },
  {
    episodeFragment: "04-black-death",
    claims: [
      {
        claimText: "In the silence left by the dead, labor became more valuable, institutions were tested, and medieval society was forced to rebuild with fewer people—and with memories that would shape every later outbreak.",
        propositions: [{
          sourceText: "In the silence left by the dead, labor became more valuable, institutions were tested, and medieval society was forced to rebuild with fewer people—and with memories that would shape every later outbreak.",
          participants: { demographicShock: concept("the silence left by the dead"), labor: concept("labor value") },
          subject: "demographicShock",
          predicate: "transforms",
          object: "labor",
          roles: [{ role: "subject", participant: "demographicShock" }, { role: "object", participant: "labor" }],
          assertionStatus: "asserted",
        }],
      },
      {
        claimText: "Survivors could demand higher wages or better terms, particularly where labor was mobile and land was available.",
        propositions: [{
          sourceText: "Survivors could demand higher wages or better terms, particularly where labor was mobile and land was available.",
          participants: { survivors: concept("survivors"), terms: concept("higher wages or better terms") },
          subject: "survivors",
          predicate: "demands",
          object: "terms",
          roles: [{ role: "actor", participant: "survivors" }, { role: "target", participant: "terms" }],
          assertionStatus: "uncertain",
        }],
      },
      {
        claimText: "In England, the Ordinance and Statute of Labourers attempted to restrict wages and compel work at pre-plague rates.",
        propositions: [{
          sourceText: "In England, the Ordinance and Statute of Labourers attempted to restrict wages and compel work at pre-plague rates.",
          participants: { authorities: concept("Ordinance and Statute of Labourers"), action: concept("wage restriction"), wages: concept("wages and work at pre-plague rates") },
          subject: "authorities",
          predicate: "restricts",
          object: "wages",
          roles: [{ role: "actor", participant: "authorities" }, { role: "action", participant: "action" }, { role: "target", participant: "wages" }],
          assertionStatus: "attempted",
        }],
      },
    ],
  },
  {
    episodeFragment: "05-franklin-expedition",
    claims: [
      {
        claimText: "In May 1845, two Royal Navy ships sailed from Britain to search for the Northwest Passage.",
        propositions: [
          {
            sourceText: "In May 1845, two Royal Navy ships sailed from Britain to search for the Northwest Passage.",
            participants: { ships: concept("two Royal Navy ships"), Britain: entity("Britain") },
            subject: "ships",
            predicate: "moves-from",
            object: "Britain",
            roles: [{ role: "actor", participant: "ships" }, { role: "origin", participant: "Britain" }],
            assertionStatus: "asserted",
            qualifiers: [{ kind: "time-anchor", value: "May 1845" }],
          },
          {
            sourceText: "In May 1845, two Royal Navy ships sailed from Britain to search for the Northwest Passage.",
            participants: { ships: concept("two Royal Navy ships"), objective: entity("Northwest Passage") },
            subject: "ships",
            predicate: "search-object",
            object: "objective",
            roles: [{ role: "actor", participant: "ships" }, { role: "objective", participant: "objective" }],
            assertionStatus: "intended",
          },
        ],
      },
      {
        claimText: "Searchers found the remains of the expedition’s winter camp from 1845 to 1846 and the graves of three sailors: John Torrington, John Hartnell, and William Braine.",
        propositions: [
          {
            sourceText: "Searchers found the remains of the expedition’s winter camp from 1845 to 1846 and the graves of three sailors: John Torrington, John Hartnell, and William Braine.",
            participants: { findings: concept("search findings"), camp: concept("remains of the expedition’s winter camp from 1845 to 1846") },
            subject: "findings",
            predicate: "contains-evidence-of",
            object: "camp",
            roles: [{ role: "evidence-target", participant: "findings" }, { role: "evidence-item", participant: "camp" }],
            assertionStatus: "asserted",
          },
          {
            sourceText: "Searchers found the remains of the expedition’s winter camp from 1845 to 1846 and the graves of three sailors: John Torrington, John Hartnell, and William Braine.",
            participants: { findings: concept("search findings"), graves: concept("graves of John Torrington, John Hartnell, and William Braine") },
            subject: "findings",
            predicate: "contains-evidence-of",
            object: "graves",
            roles: [{ role: "evidence-target", participant: "findings" }, { role: "evidence-item", participant: "graves" }],
            assertionStatus: "asserted",
            qualifiers: [
              { kind: "grouped-concept", value: "graves of three sailors" },
              { kind: "nested-entity", value: "John Torrington" },
              { kind: "nested-entity", value: "John Hartnell" },
              { kind: "nested-entity", value: "William Braine" },
            ],
          },
        ],
      },
      {
        claimText: "The ships had wintered there before sailing south through Peel Sound.",
        propositions: [{
          sourceText: "The ships had wintered there before sailing south through Peel Sound.",
          participants: {
            process: concept("Franklin expedition southward progression"),
            wintering: concept("the ships wintered there"),
            sailing: concept("the ships sailed south through Peel Sound"),
          },
          subject: "process",
          predicate: "process-sequence",
          roles: [
            { role: "process", participant: "process" },
            { role: "step", participant: "wintering" },
            { role: "step", participant: "sailing" },
          ],
          processSteps: [
            { participant: "wintering", stepOrder: 1 },
            { participant: "sailing", stepOrder: 2 },
          ],
          assertionStatus: "asserted",
        }],
      },
      {
        claimText: "The mystery endured partly because the people searching for answers did not always know which evidence to believe.",
        propositions: [{
          sourceText: "The mystery endured partly because the people searching for answers did not always know which evidence to believe.",
          participants: { uncertainty: concept("uncertainty about which evidence to believe"), mystery: concept("the mystery endured") },
          subject: "uncertainty",
          predicate: "contributes-to",
          object: "mystery",
          roles: [{ role: "cause", participant: "uncertainty" }, { role: "effect", participant: "mystery" }],
          assertionStatus: "asserted",
        }],
      },
    ],
  },
  {
    episodeFragment: "36-spanish-armada-why-it-failed",
    claims: [
      {
        claimText: "In May 1588, a vast Spanish fleet sailed from Lisbon.",
        propositions: [{
          sourceText: "In May 1588, a vast Spanish fleet sailed from Lisbon.",
          participants: { fleet: concept("Spanish fleet"), Lisbon: entity("Lisbon") },
          subject: "fleet",
          predicate: "moves-from",
          object: "Lisbon",
          roles: [{ role: "actor", participant: "fleet" }, { role: "origin", participant: "Lisbon" }],
          assertionStatus: "asserted",
          qualifiers: [{ kind: "time-anchor", value: "May 1588" }],
        }],
      },
      {
        claimText: "Its mission was to move through the English Channel, protect an army crossing from the Low Countries, and support the overthrow of Queen Elizabeth the First.",
        propositions: [{
          sourceText: "Its mission was to move through the English Channel, protect an army crossing from the Low Countries, and support the overthrow of Queen Elizabeth the First.",
          participants: { fleet: concept("Spanish fleet"), channel: entity("English Channel") },
          subject: "fleet",
          predicate: "moves-through",
          object: "channel",
          roles: [{ role: "actor", participant: "fleet" }, { role: "via", participant: "channel" }],
          assertionStatus: "intended",
        }],
      },
      {
        claimText: "The invasion failed because those requirements never aligned.",
        propositions: [{
          sourceText: "The invasion failed because those requirements never aligned.",
          participants: { misalignment: concept("requirements never aligned"), failure: concept("the invasion failed") },
          subject: "misalignment",
          predicate: "causes",
          object: "failure",
          roles: [{ role: "cause", participant: "misalignment" }, { role: "effect", participant: "failure" }],
          assertionStatus: "asserted",
        }],
      },
    ],
  },
  {
    episodeFragment: "31-d-day-normandy-invasion",
    claims: [
      {
        claimText: "The Allies chose Normandy rather than the shorter crossing to the Pas-de-Calais.",
        propositions: [{
          sourceText: "The Allies chose Normandy rather than the shorter crossing to the Pas-de-Calais.",
          participants: { Normandy: entity("Normandy"), PasDeCalais: entity("Pas-de-Calais") },
          subject: "Normandy",
          predicate: "compares-with",
          object: "PasDeCalais",
          roles: [{ role: "compared-place", participant: "Normandy" }, { role: "compared-place", participant: "PasDeCalais" }],
          assertionStatus: "asserted",
        }],
      },
      {
        claimText: "A vast deception operation attempted to convince Germany that the main invasion would strike near Calais.",
        propositions: [{
          sourceText: "A vast deception operation attempted to convince Germany that the main invasion would strike near Calais.",
          participants: { invasion: concept("main invasion"), Calais: entity("Calais") },
          subject: "invasion",
          predicate: "located-in",
          object: "Calais",
          roles: [{ role: "subject", participant: "invasion" }, { role: "location", participant: "Calais" }],
          assertionStatus: "intended",
        }],
      },
    ],
  },
  {
    episodeFragment: "20-1066-battle-that-changed-england",
    claims: [
      {
        claimText: "The traditional story emphasizes exhaustion: an army racing from one end of England to the other after a major battle.",
        propositions: [{
          sourceText: "The traditional story emphasizes exhaustion: an army racing from one end of England to the other after a major battle.",
          participants: { army: concept("an army"), England: entity("England") },
          subject: "army",
          predicate: "located-in",
          object: "England",
          roles: [{ role: "subject", participant: "army" }, { role: "location", participant: "England" }],
          assertionStatus: "reported",
          qualifiers: [{ kind: "location-context", value: "from one end of England to the other" }],
        }],
      },
      {
        claimText: "Days later, William landed at Pevensey and established a fortified base near Hastings.",
        propositions: [{
          sourceText: "Days later, William landed at Pevensey and established a fortified base near Hastings.",
          participants: { William: concept("William"), Pevensey: entity("Pevensey") },
          subject: "William",
          predicate: "located-in",
          object: "Pevensey",
          roles: [{ role: "subject", participant: "William" }, { role: "location", participant: "Pevensey" }],
          assertionStatus: "asserted",
          qualifiers: [{ kind: "time-anchor", value: "Days later" }],
        }],
      },
      {
        claimText: "Infantry advanced, followed by cavalry.",
        propositions: [{
          sourceText: "Infantry advanced, followed by cavalry.",
          participants: {
            process: concept("Norman combined attack"),
            infantry: concept("infantry advanced"),
            cavalry: concept("cavalry advanced"),
          },
          subject: "process",
          predicate: "process-sequence",
          roles: [
            { role: "process", participant: "process" },
            { role: "step", participant: "infantry" },
            { role: "step", participant: "cavalry" },
          ],
          processSteps: [
            { participant: "infantry", stepOrder: 1 },
            { participant: "cavalry", stepOrder: 2 },
          ],
          assertionStatus: "asserted",
        }],
      },
    ],
  },
  {
    episodeFragment: "10-titanic-decisions-disaster",
    claims: [
      {
        claimText: "One warning from the nearby Californian stated that it had stopped because of ice.",
        propositions: [{
          sourceText: "One warning from the nearby Californian stated that it had stopped because of ice.",
          participants: { ice: concept("ice"), stopped: concept("the Californian had stopped") },
          subject: "ice",
          predicate: "causes",
          object: "stopped",
          roles: [{ role: "cause", participant: "ice" }, { role: "effect", participant: "stopped" }],
          assertionStatus: "reported",
        }],
      },
      {
        claimText: "After the collision, shipbuilder Thomas Andrews inspected the damage and concluded that Titanic would sink.",
        propositions: [{
          sourceText: "After the collision, shipbuilder Thomas Andrews inspected the damage and concluded that Titanic would sink.",
          participants: {
            collision: concept("the collision"),
            inspection: concept("Thomas Andrews inspected the damage"),
          },
          subject: "collision",
          predicate: "precedes",
          object: "inspection",
          roles: [
            { role: "before", participant: "collision" },
            { role: "after", participant: "inspection" },
          ],
          assertionStatus: "asserted",
        }],
      },
    ],
  },
  {
    episodeFragment: "35-chernobyl-night-reactor-exploded",
    claims: [
      {
        claimText: "As cooling water turned to steam, the reactor could become more reactive rather than less.",
        propositions: [{
          sourceText: "As cooling water turned to steam, the reactor could become more reactive rather than less.",
          participants: { steam: concept("cooling water turning to steam"), reactivity: concept("increased reactor reactivity") },
          subject: "steam",
          predicate: "contributes-to",
          object: "reactivity",
          roles: [{ role: "cause", participant: "steam" }, { role: "effect", participant: "reactivity" }],
          assertionStatus: "uncertain",
        }],
      },
      {
        claimText: "The exact physical sequence has been refined through later investigation, but the central fact remains: the shutdown system contributed to the surge it was supposed to stop.",
        propositions: [{
          sourceText: "The exact physical sequence has been refined through later investigation, but the central fact remains: the shutdown system contributed to the surge it was supposed to stop.",
          participants: { shutdown: concept("shutdown system"), surge: concept("power surge") },
          subject: "shutdown",
          predicate: "contributes-to",
          object: "surge",
          roles: [{ role: "cause", participant: "shutdown" }, { role: "effect", participant: "surge" }],
          assertionStatus: "asserted",
        }],
      },
      {
        claimText: "Evacuation began on the afternoon of April 27, more than a day after the explosion.",
        propositions: [{
          sourceText: "Evacuation began on the afternoon of April 27, more than a day after the explosion.",
          participants: {
            explosion: concept("the explosion"),
            evacuation: concept("evacuation began"),
          },
          subject: "explosion",
          predicate: "precedes",
          object: "evacuation",
          roles: [
            { role: "before", participant: "explosion" },
            { role: "after", participant: "evacuation" },
          ],
          assertionStatus: "asserted",
          qualifiers: [{ kind: "time-anchor", value: "more than a day after" }],
        }],
      },
    ],
  },
] as const;

export function representativeNativeProposalsV36(
  source: NativeStructuredClaimSourceV36
): readonly NativeStructuredClaimProposalV36[] {
  const fixture = representativeNativeFixturesV36.find((item) => source.episodeId.includes(item.episodeFragment));
  if (!fixture) throw new Error(`No representative native fixture for ${source.episodeId}.`);
  return fixture.claims.map((fixtureClaim) => {
    const matches = source.claims.filter((claim) => claim.normalizedProposition === fixtureClaim.claimText);
    if (matches.length !== 1 || matches[0]!.narrationUnitIds.length !== 1) {
      throw new Error(`Native fixture claim did not resolve uniquely at the canonical boundary: ${fixtureClaim.claimText}`);
    }
    return {
      narrationUnitId: matches[0]!.narrationUnitIds[0]!,
      propositions: fixtureClaim.propositions,
    };
  });
}

export function createRepresentativeNativeStructuredSidecarV36(
  source: NativeStructuredClaimSourceV36
): NativeStructuredClaimSidecarV36 {
  return createNativeStructuredClaimSidecarV36({
    source,
    proposals: representativeNativeProposalsV36(source),
    providerIdentity: null,
    modelIdentity: null,
  });
}

export const representativeSemanticFamilyEvaluationV36 = {
  causal: "native fixture coverage",
  dependency: "accepted contract capability; no safe new insufficient-structure representative selected",
  movementLocation: "native fixture coverage with actual/intended and origin/objective controls",
  comparison: "native fixture coverage",
  policyAction: "native fixture coverage with attempted assertion",
  processSteps: "native process-sequence coverage with explicit source-ordered steps and direct atomic projection",
  temporalOrdering: "native precedes coverage with claim-local direction and direct atomic projection",
  evidenceMembership: "native fixture coverage with grouped/nested evidence",
} as const;
