import {
  type CurriculumSkill,
  type ExpressionNode,
  type VerificationCheck,
} from "../domain/index.js";
import { canonicalHash } from "../verification/canonical-json.js";
import {
  FRACTIONS_DECIMALS_CONTENT_VERSION,
  LESSON_CONTENT_CONTRACT_VERSION,
  productionLessonContentSchema,
  type ProductionLessonContent,
} from "./production-content.js";

type FractionDecimalCheck = Extract<
  VerificationCheck,
  { kind: "fraction-decimal-domain" }
>;

const integer = (value: string): ExpressionNode => ({ kind: "integer", value });
const rational = (numerator: string, denominator: string): ExpressionNode => ({
  kind: "rational",
  numerator,
  denominator,
});
const decimal = (unscaled: string, scale: number): ExpressionNode => ({
  kind: "decimal",
  unscaled,
  scale,
});
const tuple = (...items: ExpressionNode[]): ExpressionNode => ({ kind: "tuple", items });
const relation = (
  operator: "eq" | "lt" | "lte" | "gt" | "gte",
  left: ExpressionNode,
  right: ExpressionNode
): ExpressionNode => ({ kind: "relation", operator, left, right });

interface TaskDefinition {
  readonly taskId: "example-main" | "transfer-main";
  readonly prompt: string;
  readonly sourceDisplay: string;
  readonly answerDisplay: string;
  readonly check: FractionDecimalCheck;
}

interface ContentDefinition {
  readonly skillId: `M5-ZO-${string}`;
  readonly curriculumSkillHash: string;
  readonly learningObjective: string;
  readonly prerequisiteSkillIds: readonly `M5-ZO-${string}`[];
  readonly priorKnowledge: readonly string[];
  readonly misconception: string;
  readonly conceptIds: readonly [string, string];
  readonly modelVisual: "formula" | "place-value-chart" | "fraction-model" | "number-line";
  readonly practiceVisual: "formula" | "place-value-chart" | "fraction-model" | "number-line";
  readonly example: TaskDefinition;
  readonly transfer: TaskDefinition;
}

const check = (
  checkId: string,
  sourceExpression: ExpressionNode,
  expression: ExpressionNode,
  evidence: FractionDecimalCheck["evidence"]
): FractionDecimalCheck => ({
  checkId,
  kind: "fraction-decimal-domain",
  sourceExpression,
  expression,
  evidence,
  critical: true,
});

const task = (
  taskId: TaskDefinition["taskId"],
  sourceDisplay: string,
  answerDisplay: string,
  taskCheck: FractionDecimalCheck
): TaskDefinition => ({
  taskId,
  prompt: `Bearbeite [[fact:${taskId}-source]] und begründe dein Ergebnis.`,
  sourceDisplay,
  answerDisplay,
  check: taskCheck,
});

const definitions: readonly ContentDefinition[] = [
  {
    skillId: "M5-ZO-017",
    curriculumSkillHash: "92853323db86708e1b362f8822c2003c38858a386d920469c425c621b395bfcc",
    learningObjective: "Brüche als Anteil eines Ganzen verstehen",
    prerequisiteSkillIds: [],
    priorKnowledge: ["Ein Ganzes in gleich große Teile zerlegen"],
    misconception: "Die Zahl der schattierten Teile wird mit der Zahl der ungleich großen Flächen verglichen.",
    conceptIds: ["fraction", "whole"],
    modelVisual: "fraction-model",
    practiceVisual: "fraction-model",
    example: task("example-main", "3 von 8", "3/8", check("check-example-main", rational("3", "8"), rational("3", "8"), {
      mode: "fraction-part", fraction: rational("3", "8"), visual: { component: "fraction-model", totalParts: 8, shadedParts: 3 },
    })),
    transfer: task("transfer-main", "5 von 12", "5/12", check("check-transfer-main", rational("5", "12"), rational("5", "12"), {
      mode: "fraction-part", fraction: rational("5", "12"), visual: { component: "fraction-model", totalParts: 12, shadedParts: 5 },
    })),
  },
  {
    skillId: "M5-ZO-018",
    curriculumSkillHash: "c9c85568937ebaedc64964ac03471601adf34ac068760a15e4117e8082eb2017",
    learningObjective: "Zähler, Nenner und Bruchstrich sicher verwenden",
    prerequisiteSkillIds: ["M5-ZO-017"],
    priorKnowledge: ["Brüche als Anteil eines Ganzen deuten"],
    misconception: "Der Bruchstrich wird als Dekoration behandelt und Zähler sowie Nenner werden vertauscht.",
    conceptIds: ["numerator", "denominator"],
    modelVisual: "fraction-model",
    practiceVisual: "formula",
    example: task("example-main", "Zähler 4; Nenner 9", "4/9", check("check-example-main", rational("4", "9"), rational("4", "9"), {
      mode: "fraction-notation", fraction: rational("4", "9"), numerator: integer("4"), denominator: integer("9"),
    })),
    transfer: task("transfer-main", "Zähler 7; Nenner 10", "7/10", check("check-transfer-main", rational("7", "10"), rational("7", "10"), {
      mode: "fraction-notation", fraction: rational("7", "10"), numerator: integer("7"), denominator: integer("10"),
    })),
  },
  {
    skillId: "M5-ZO-019",
    curriculumSkillHash: "e8a28230729d7da47b7df72d1506c40e61214bec48dc6e905ae2279d07b183d0",
    learningObjective: "Brüche auf dem Zahlenstrahl darstellen",
    prerequisiteSkillIds: [],
    priorKnowledge: ["Zahlenstrahlen in gleich große Abschnitte teilen"],
    misconception: "Der Nenner wird als Punktnummer statt als Anzahl gleich großer Intervalle gelesen.",
    conceptIds: ["fraction", "number-line"],
    modelVisual: "number-line",
    practiceVisual: "number-line",
    example: task("example-main", "3/4 auf [0;1]", "3/4", check("check-example-main", rational("3", "4"), rational("3", "4"), {
      mode: "number-line", value: rational("3", "4"), visual: { component: "number-line", minimum: integer("0"), maximum: integer("1"), tickStep: rational("1", "4"), point: rational("3", "4"), label: rational("3", "4") },
    })),
    transfer: task("transfer-main", "7/6 auf [0;2]", "7/6", check("check-transfer-main", rational("7", "6"), rational("7", "6"), {
      mode: "number-line", value: rational("7", "6"), visual: { component: "number-line", minimum: integer("0"), maximum: integer("2"), tickStep: rational("1", "6"), point: rational("7", "6"), label: rational("7", "6") },
    })),
  },
  {
    skillId: "M5-ZO-020",
    curriculumSkillHash: "d63134fa8800c5a7e1b20cbf60ddc84505970f00f53dc6e6011ecd1c429ba1af",
    learningObjective: "Gleichwertige Brüche erkennen",
    prerequisiteSkillIds: ["M5-ZO-018"],
    priorKnowledge: ["Zähler und Nenner sicher benennen"],
    misconception: "Brüche werden durch direktes Vergleichen der Nenner als ungleich bewertet.",
    conceptIds: ["equivalent-fraction", "fraction"],
    modelVisual: "fraction-model",
    practiceVisual: "formula",
    example: task("example-main", "2/3 und 4/6", "2/3=4/6", check("check-example-main", tuple(rational("2", "3"), rational("4", "6")), relation("eq", rational("2", "3"), rational("4", "6")), {
      mode: "equivalence", left: rational("2", "3"), right: rational("4", "6"),
    })),
    transfer: task("transfer-main", "3/5 und 9/15", "3/5=9/15", check("check-transfer-main", tuple(rational("3", "5"), rational("9", "15")), relation("eq", rational("3", "5"), rational("9", "15")), {
      mode: "equivalence", left: rational("3", "5"), right: rational("9", "15"),
    })),
  },
  {
    skillId: "M5-ZO-021",
    curriculumSkillHash: "80bc0b529222a653712bd9d14ef8dbb69bffbb9b9f6dd45f90506e7460959c51",
    learningObjective: "Brüche erweitern",
    prerequisiteSkillIds: ["M5-ZO-020"],
    priorKnowledge: ["Gleichwertige Brüche erkennen"],
    misconception: "Nur der Zähler oder nur der Nenner wird mit dem Faktor multipliziert.",
    conceptIds: ["fraction-expansion", "equivalent-fraction"],
    modelVisual: "formula",
    practiceVisual: "fraction-model",
    example: task("example-main", "2/5 · 3/3", "6/15", check("check-example-main", rational("2", "5"), rational("6", "15"), {
      mode: "scale", operation: "expand", source: rational("2", "5"), target: rational("6", "15"), factor: integer("3"),
    })),
    transfer: task("transfer-main", "3/8 · 4/4", "12/32", check("check-transfer-main", rational("3", "8"), rational("12", "32"), {
      mode: "scale", operation: "expand", source: rational("3", "8"), target: rational("12", "32"), factor: integer("4"),
    })),
  },
  {
    skillId: "M5-ZO-022",
    curriculumSkillHash: "24eb412d645749c322de1a7129e96f16d83c8992b313b138f0bfafe4ae8bd8c1",
    learningObjective: "Brüche kürzen",
    prerequisiteSkillIds: ["M5-ZO-020"],
    priorKnowledge: ["Gemeinsame Teiler erkennen"],
    misconception: "Zähler und Nenner werden mit verschiedenen Faktoren oder über die Teilbarkeit hinaus gekürzt.",
    conceptIds: ["fraction-reduction", "equivalent-fraction"],
    modelVisual: "formula",
    practiceVisual: "fraction-model",
    example: task("example-main", "12/18 : 6/6", "2/3", check("check-example-main", rational("12", "18"), rational("2", "3"), {
      mode: "scale", operation: "reduce", source: rational("12", "18"), target: rational("2", "3"), factor: integer("6"),
    })),
    transfer: task("transfer-main", "28/42 : 14/14", "2/3", check("check-transfer-main", rational("28", "42"), rational("2", "3"), {
      mode: "scale", operation: "reduce", source: rational("28", "42"), target: rational("2", "3"), factor: integer("14"),
    })),
  },
  {
    skillId: "M5-ZO-023",
    curriculumSkillHash: "e9bf35624997abeb36b0b49b92a482c4560102d72ee35b6d31f67ad11a03c5ac",
    learningObjective: "Dezimalzahlen lesen und im Stellenwertsystem darstellen",
    prerequisiteSkillIds: [],
    priorKnowledge: ["Stellenwerte natürlicher Zahlen lesen"],
    misconception: "Eine Null in der Dezimaldarstellung wird gelöscht, obwohl sich dadurch der Stellenwert ändert.",
    conceptIds: ["decimal", "decimal-place"],
    modelVisual: "place-value-chart",
    practiceVisual: "formula",
    example: task("example-main", "12,305", "10+2+0,3+0,005", check("check-example-main", decimal("12305", 3), decimal("12305", 3), {
      mode: "decimal-place-value", value: decimal("12305", 3), placeValues: [integer("10"), integer("2"), decimal("3", 1), decimal("5", 3)], displayedScale: 3,
    })),
    transfer: task("transfer-main", "405,070", "400+5+0,07", check("check-transfer-main", decimal("405070", 3), decimal("405070", 3), {
      mode: "decimal-place-value", value: decimal("405070", 3), placeValues: [integer("400"), integer("5"), decimal("7", 2)], displayedScale: 3,
    })),
  },
  {
    skillId: "M5-ZO-024",
    curriculumSkillHash: "96f9181ad1585d0004ae3c6c40e80215b1bb7d1fffcc6a04bd2a807c55e0f5ad",
    learningObjective: "Dezimalzahlen vergleichen und ordnen",
    prerequisiteSkillIds: ["M5-ZO-023"],
    priorKnowledge: ["Dezimalstellen nach ihrem Stellenwert lesen"],
    misconception: "Die Zahl mit mehr Dezimalziffern wird automatisch für größer gehalten.",
    conceptIds: ["decimal-comparison", "decimal-place"],
    modelVisual: "place-value-chart",
    practiceVisual: "number-line",
    example: task("example-main", "0,5 und 0,50", "0,5=0,50", check("check-example-main", relation("eq", decimal("5", 1), decimal("50", 2)), relation("eq", decimal("5", 1), decimal("50", 2)), {
      mode: "decimal-comparison", left: decimal("5", 1), right: decimal("50", 2), operator: "eq",
    })),
    transfer: task("transfer-main", "3,405 und 3,45", "3,405<3,45", check("check-transfer-main", relation("lt", decimal("3405", 3), decimal("345", 2)), relation("lt", decimal("3405", 3), decimal("345", 2)), {
      mode: "decimal-comparison", left: decimal("3405", 3), right: decimal("345", 2), operator: "lt",
    })),
  },
] as const;

const sceneFunctions = ["hook", "objective", "model", "worked-example", "mistake", "guided-practice", "think-pause", "solution", "recap"] as const;
const scenePurposes = [
  "Vorwissen aktivieren und die Leitfrage öffnen.",
  "Das überprüfbare Lernziel transparent machen.",
  "Die exakte Darstellung am geprüften Beispiel modellieren.",
  "Den Lösungsweg in fachlich geordneter Folge erklären.",
  "Die Fehlvorstellung sichtbar machen und fachlich korrigieren.",
  "Das Verfahren auf die Transferaufgabe anwenden.",
  "Eine eigenständige Entscheidung mit Denkzeit einfordern.",
  "Die geprüfte Transferlösung auflösen und begründen.",
  "Darstellung, Prüfung und Ergebnis knapp sichern.",
] as const;
const sceneDurations = [20, 20, 35, 30, 25, 30, 35, 25, 20] as const;

function buildTask(definition: TaskDefinition, sourceHash: string) {
  const sourceFactId = `${definition.taskId}-source`;
  const answerFactId = `${definition.taskId}-answer`;
  return {
    task: {
      exampleId: definition.taskId,
      prompt: definition.prompt,
      steps: [
        { stepId: `step-${definition.taskId}-model`, explanation: "Ordne die Angaben der exakten mathematischen Darstellung zu.", factId: sourceFactId },
        { stepId: `step-${definition.taskId}-result`, explanation: "Leite das Ergebnis her und prüfe Form, Wert und Darstellung.", factId: answerFactId },
      ],
      solutionFactId: answerFactId,
    },
    facts: [
      { factId: sourceFactId, semantic: { kind: "scalar" as const, expression: definition.check.sourceExpression }, displayLatex: definition.sourceDisplay, checkIds: [definition.check.checkId], lineage: { contentContractVersion: LESSON_CONTENT_CONTRACT_VERSION, sourceContentHash: sourceHash, sourceTaskId: definition.taskId } },
      { factId: answerFactId, semantic: { kind: "scalar" as const, expression: definition.check.expression }, displayLatex: definition.answerDisplay, checkIds: [definition.check.checkId], lineage: { contentContractVersion: LESSON_CONTENT_CONTRACT_VERSION, sourceContentHash: sourceHash, sourceTaskId: definition.taskId } },
    ],
  };
}

function buildSpecification(definition: ContentDefinition): ProductionLessonContent {
  const exampleHash = canonicalHash(definition.example);
  const transferHash = canonicalHash(definition.transfer);
  const example = buildTask(definition.example, exampleHash);
  const transfer = buildTask(definition.transfer, transferHash);
  const sceneFacts = [[], [], ["example-main-source"], ["example-main-source", "example-main-answer"], ["example-main-answer"], ["transfer-main-source"], ["transfer-main-source"], ["transfer-main-answer"], ["example-main-answer", "transfer-main-answer"]];
  const draft = {
    artifactVersion: "fractions-decimals-lesson-content.v1" as const,
    contractVersion: LESSON_CONTENT_CONTRACT_VERSION,
    contentVersion: FRACTIONS_DECIMALS_CONTENT_VERSION,
    locale: "de-DE" as const,
    skillId: definition.skillId,
    variant: "standard" as const,
    learningObjective: definition.learningObjective,
    prerequisiteSkillIds: [...definition.prerequisiteSkillIds],
    prerequisiteReviewStatus: "proposed-unreviewed" as const,
    priorKnowledge: [...definition.priorKnowledge],
    misconceptions: [{ misconceptionId: "misconception-main", description: definition.misconception, correctionFactId: "example-main-answer" }],
    conceptIds: definition.conceptIds,
    promise: "Exakte Bruch- und Dezimaldarstellungen selbstständig prüfen und begründen",
    targetAudience: "Lernende der Regelanforderungen in Klasse fünf",
    modelVisual: definition.modelVisual,
    practiceVisual: definition.practiceVisual,
    workedExamples: [example.task],
    transferTask: transfer.task,
    formativeChecks: [
      { formativeCheckId: "formative-example", prompt: "Erkläre den geprüften Übergang von [[fact:example-main-source]] zu [[fact:example-main-answer]].", factIds: ["example-main-source", "example-main-answer"], verifierCheckId: definition.example.check.checkId, answerFactId: "example-main-answer" },
      { formativeCheckId: "formative-transfer", prompt: "Löse [[fact:transfer-main-source]] und vergleiche mit dem gesicherten Ergebnis.", factIds: ["transfer-main-source"], verifierCheckId: definition.transfer.check.checkId, answerFactId: "transfer-main-answer" },
    ],
    answerKey: [
      { taskId: example.task.exampleId, sourceTaskHash: exampleHash, solutionFactId: example.task.solutionFactId, orderedStepIds: example.task.steps.map((step) => step.stepId) },
      { taskId: transfer.task.exampleId, sourceTaskHash: transferHash, solutionFactId: transfer.task.solutionFactId, orderedStepIds: transfer.task.steps.map((step) => step.stepId) },
    ],
    facts: [...example.facts, ...transfer.facts],
    checks: [definition.example.check, definition.transfer.check],
    scenes: sceneFunctions.map((sceneFunction, index) => ({
      sceneId: `scene-${String(index + 1).padStart(3, "0")}`,
      sceneFunction,
      purpose: scenePurposes[index]!,
      factIds: sceneFacts[index]!,
      processCompetencies: index === 2 || index === 5 ? (["REP"] as const) : [],
      visualComponent: index === 2 ? definition.modelVisual : index === 5 ? definition.practiceVisual : index === 6 ? ("teacher" as const) : ("formula" as const),
      plannedDurationSeconds: sceneDurations[index]!,
    })),
    expectedDurationSeconds: 240 as const,
    sourceIdentity: {
      curriculumReleaseId: "de-gems-5-10-v1" as const,
      curriculumVersion: "1.0.0-draft.1" as const,
      curriculumReleaseHash: "9afb5e2c0ed7a10628df7f5d1d589739995910900d66b5b479894a3a95360b31" as const,
      curriculumSkillHash: definition.curriculumSkillHash,
      sourceIds: ["kmk-2022-math"],
      sourceSection: "normalized synthesis; exact source mapping pending external review",
      sourceReviewStatus: "pending" as const,
    },
    reviewStatus: "pending-external-review" as const,
  };
  return productionLessonContentSchema.parse({ ...draft, contentHash: canonicalHash(draft) });
}

const specifications = definitions.map(buildSpecification);
const specificationsBySkill = new Map(specifications.map((specification) => [specification.skillId, specification]));

export const FRACTIONS_DECIMALS_STANDARD_SKILL_IDS = Object.freeze(specifications.map((specification) => specification.skillId));

export function loadFractionsDecimalsStandardContent(skill: CurriculumSkill): ProductionLessonContent | null {
  const specification = specificationsBySkill.get(skill.skillId);
  if (!specification) return null;
  if (canonicalHash(skill) !== specification.sourceIdentity.curriculumSkillHash || skill.learningObjective !== specification.learningObjective)
    throw new Error(`Lesson content is bound to a stale curriculum identity for ${skill.skillId}.`);
  return productionLessonContentSchema.parse(structuredClone(specification));
}

export function loadAllFractionsDecimalsStandardContent(): ProductionLessonContent[] {
  return specifications.map((specification) => productionLessonContentSchema.parse(structuredClone(specification)));
}

export function fractionsDecimalsConceptIds(skillId: string): readonly [string, string] | null {
  return specificationsBySkill.get(skillId)?.conceptIds ?? null;
}
