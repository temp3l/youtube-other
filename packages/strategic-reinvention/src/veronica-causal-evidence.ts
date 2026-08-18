import type {
  VeronicaSemanticStateRelation,
  VisualBeatTreatmentV1,
} from "./positioning-visual-contracts.js";

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Uses finalized beat semantics and visible treatment fields; it never re-infers a new causal proposition. */
export function assessVeronicaRemovalConsequenceEvidence(
  beat: Pick<VisualBeatTreatmentV1, "coreMeaning" | "newInformation" | "viewerShouldUnderstand" | "visualThesis" | "subject" | "action" | "state" | "environment" | "composition">,
  semanticRelation?: VeronicaSemanticStateRelation,
) {
  const semantic = normalize(`${beat.coreMeaning} ${beat.newInformation} ${beat.viewerShouldUnderstand} ${beat.visualThesis} ${beat.state}`);
  const visible = normalize(`${beat.subject} ${beat.action} ${beat.environment} ${beat.composition.description}`);
  const relationCanBeCausal = semanticRelation === undefined
    || semanticRelation === "CAUSAL_BEFORE_AFTER"
    || semanticRelation === "SEQUENTIAL_PROGRESSION";
  const applies = relationCanBeCausal
    && /\b(?:obstacle|barrier|blockage|roadblock|bottleneck|friction|intermediate step|gate)\b/u.test(semantic)
    && (/\bremov(?:e|ed|es|ing|able)\b|\bno longer block/u.test(semantic)
      || /\b(?:clear|cleared|clears|clearing|open|opened|opens|opening)\s+(?:the\s+)?(?:route|path|gap|passage|barrier|gate|obstacle)\b/u.test(`${semantic} ${visible}`));
  const removalVisible = /\b(?:remove|removed|removes|removing|clear|cleared|clears|clearing|lift|lifted|open|opened|swung|aside|absent|no longer block)\b/u.test(visible);
  const buyerVisible = /\b(?:buyer|customer|client|user|person|visitor|recipient|participant)\b/u.test(visible);
  const buyerActionVisible = buyerVisible
    && /\b(?:choose|chooses|select|selects|take|takes|reach|reaches|use|uses|complete|completes|accept|accepts|commit|commits|receive|receives|arrive|arrives|cross|crosses|enter|enters|step|steps|pick|picks|grip|grips|lift|lifts|carry|carries|retrieve|retrieves|collect|collects|finish|finishes)\b/u.test(visible);
  const causalLinkVisible = /\b(?:after|because|once|then|now|thereby|allow|allows|allowing|enable|enables|enabling|with the .{0,40}(?:removed|open|clear))\b/u.test(visible);
  return {
    applies,
    removalVisible,
    buyerActionVisible,
    causalLinkVisible,
    passes: !applies || (removalVisible && buyerActionVisible && causalLinkVisible),
  } as const;
}
