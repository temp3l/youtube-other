import { type CurriculumSkill, type ExactValue, type ExpressionNode, type VerificationCheck } from "../domain/index.js";
import { canonicalHash } from "../verification/canonical-json.js";
import { DATA_DIAGRAM_CONTENT_VERSION, LESSON_CONTENT_CONTRACT_VERSION, productionLessonContentSchema, type ProductionLessonContent } from "./production-content.js";

type DataDiagramCheck = Extract<VerificationCheck, { kind: "data-diagram-domain" }>;
const integer = (value: string): ExpressionNode => ({ kind: "integer", value });
const tuple = (...items: ExpressionNode[]): ExpressionNode => ({ kind: "tuple", items });
const scalar = (expression: ExpressionNode): ExactValue => ({ kind: "scalar", expression });

interface DerivedFact { readonly factId: string; readonly display: string; readonly semantic: ExactValue; }
interface TaskDefinition {
  readonly taskId: "example-main" | "transfer-main";
  readonly prompt: string;
  readonly sourceDisplay: string;
  readonly answerDisplay: string;
  readonly sourceSemantic: ExactValue;
  readonly answerSemantic: ExactValue;
  readonly derivedFacts: readonly DerivedFact[];
  readonly check: DataDiagramCheck;
}
interface ContentDefinition {
  readonly skillId: "M5-DZ-001" | "M5-DZ-002";
  readonly curriculumSkillHash: string;
  readonly learningObjective: string;
  readonly prerequisiteSkillIds: readonly ("M5-DZ-001" | "M5-DZ-002")[];
  readonly priorKnowledge: readonly string[];
  readonly misconception: string;
  readonly conceptIds: readonly [string, string];
  readonly modelVisual: "data-table" | "bar-chart";
  readonly practiceVisual: "data-table" | "bar-chart";
  readonly example: TaskDefinition;
  readonly transfer: TaskDefinition;
}

const dataset = (datasetId: string, unitLabel: string, categories: readonly { category: string; count: number }[]) => {
  const payload = {
    datasetId,
    unitLabel,
    duplicatePolicy: "reject" as const,
    rawValues: categories.flatMap(({ category, count }) => Array.from({ length: count }, () => category)),
    categories: categories.map(({ category, count }) => ({ category, count: integer(String(count)), tallyGroups: [...Array(Math.floor(count / 5)).fill(5), ...(count % 5 === 0 ? [] : [count % 5])] })),
  };
  return { ...payload, datasetHash: canonicalHash(payload) };
};
const check = (checkId: string, sourceExpression: ExpressionNode, expression: ExpressionNode, evidence: DataDiagramCheck["evidence"]): DataDiagramCheck => ({ checkId, kind: "data-diagram-domain", sourceExpression, expression, evidence, critical: true });
const task = (taskId: TaskDefinition["taskId"], sourceDisplay: string, answerDisplay: string, sourceSemantic: ExactValue, answerSemantic: ExactValue, derivedFacts: readonly DerivedFact[], taskCheck: DataDiagramCheck): TaskDefinition => ({ taskId, prompt: `Untersuche [[fact:${taskId}-source]] und begründe [[fact:${taskId}-answer]].`, sourceDisplay, answerDisplay, sourceSemantic, answerSemantic, derivedFacts, check: taskCheck });
const countFacts = (prefix: "example" | "transfer", entries: readonly { category: string; count: number }[]): DerivedFact[] => entries.map(({ category, count }) => ({ factId: `${prefix}-category-${category.toLocaleLowerCase("de").replaceAll("ß", "ss")}`, display: `${category}: ${count}`, semantic: scalar(integer(String(count))) }));
const chartFacts = (prefix: "example" | "transfer", entries: readonly { category: string; count: number }[], axisMaximum: number, tick: number): DerivedFact[] => [
  ...countFacts(prefix, entries),
  ...entries.map(({ category, count }) => ({ factId: `${prefix}-bar-${category.toLocaleLowerCase("de").replaceAll("ß", "ss")}`, display: `Säule ${category}: ${count}`, semantic: scalar(integer(String(count))) })),
  { factId: `${prefix}-axis-origin`, display: "Achsenanfang 0", semantic: scalar(integer("0")) },
  { factId: `${prefix}-axis-maximum`, display: `Achsenmaximum ${axisMaximum}`, semantic: scalar(integer(String(axisMaximum))) },
  { factId: `${prefix}-axis-tick`, display: `Schrittweite ${tick}`, semantic: scalar(integer(String(tick))) },
];

const tallyExampleEntries = [{ category: "Apfel", count: 4 }, { category: "Birne", count: 3 }, { category: "Banane", count: 5 }] as const;
const tallyTransferEntries = [{ category: "Bus", count: 6 }, { category: "Rad", count: 4 }, { category: "Fuss", count: 5 }] as const;
const chartExampleEntries = [{ category: "Rot", count: 4 }, { category: "Blau", count: 7 }, { category: "Gruen", count: 5 }] as const;
const chartTransferEntries = [{ category: "A", count: 3 }, { category: "B", count: 6 }, { category: "C", count: 9 }] as const;
const tallyExampleDataset = dataset("dataset-obst", "Nennungen", tallyExampleEntries);
const tallyTransferDataset = dataset("dataset-schulweg", "Kinder", tallyTransferEntries);
const chartExampleDataset = dataset("dataset-farben", "Kinder", chartExampleEntries);
const chartTransferDataset = dataset("dataset-buecher", "Buecher", chartTransferEntries);

const definitions: readonly ContentDefinition[] = [
  {
    skillId: "M5-DZ-001",
    curriculumSkillHash: "38c3c50d60cf80fdfb227ab4c8abe23ecb115de94e686beff6f2a8443a94f2c3",
    learningObjective: "Daten in Ur- und Strichlisten erfassen",
    prerequisiteSkillIds: [],
    priorKnowledge: ["Gleichartige Nennungen Kategorien zuordnen"],
    misconception: "Der fünfte Strich eines Fünferblocks wird nicht mitgezählt oder eine Kategorie ausgelassen.",
    conceptIds: ["tally-list", "category-total"],
    modelVisual: "data-table",
    practiceVisual: "data-table",
    example: task("example-main", "Apfel 4; Birne 3; Banane 5", "insgesamt 12; Maximum Banane", scalar(tuple(integer("4"), integer("3"), integer("5"))), scalar(integer("12")), countFacts("example", tallyExampleEntries), check("check-example-main", tuple(integer("4"), integer("3"), integer("5")), integer("12"), { mode: "tally-list", dataset: tallyExampleDataset, expectedTotal: integer("12"), derivedOrder: ["Apfel", "Birne", "Banane"], maximumCategory: "Banane" })),
    transfer: task("transfer-main", "Bus 6; Rad 4; Fuss 5", "insgesamt 15; Maximum Bus", scalar(tuple(integer("6"), integer("4"), integer("5"))), scalar(integer("15")), countFacts("transfer", tallyTransferEntries), check("check-transfer-main", tuple(integer("6"), integer("4"), integer("5")), integer("15"), { mode: "tally-list", dataset: tallyTransferDataset, expectedTotal: integer("15"), derivedOrder: ["Bus", "Rad", "Fuss"], maximumCategory: "Bus" })),
  },
  {
    skillId: "M5-DZ-002",
    curriculumSkillHash: "77f2cd9d55bf18d778d7f57b0029832c1db805db5b35eaac8f365f993488e409",
    learningObjective: "Säulen- und Balkendiagramme lesen und erstellen",
    prerequisiteSkillIds: ["M5-DZ-001"],
    priorKnowledge: ["Kategorietotale aus Listen bestimmen"],
    misconception: "Säulenbreite, Zwischenräume oder eine wechselnde Skala werden als Messwert gelesen.",
    conceptIds: ["bar-chart", "axis-scale"],
    modelVisual: "bar-chart",
    practiceVisual: "bar-chart",
    example: task("example-main", "Rot 4; Blau 7; Gruen 5", "Maximum Blau: 7", scalar(tuple(integer("4"), integer("7"), integer("5"))), scalar(integer("7")), chartFacts("example", chartExampleEntries, 8, 2), check("check-example-main", tuple(integer("4"), integer("7"), integer("5")), integer("7"), { mode: "bar-chart", dataset: chartExampleDataset, expectedMaximum: integer("7"), chart: { orientation: "column", axisOrigin: integer("0"), axisMaximum: integer("8"), tickInterval: integer("2"), unitLabel: "Kinder", categoryOrder: ["Rot", "Blau", "Gruen"], bars: chartExampleEntries.map(({ category, count }) => ({ category, height: integer(String(count)), categoryFactId: `example-category-${category.toLowerCase()}`, barFactId: `example-bar-${category.toLowerCase()}` })), accessibleEncoding: { colorIndependentCue: "Muster und sichtbare Wertbeschriftung", visibleValueLabels: true } } })),
    transfer: task("transfer-main", "A 3; B 6; C 9", "Maximum C: 9", scalar(tuple(integer("3"), integer("6"), integer("9"))), scalar(integer("9")), chartFacts("transfer", chartTransferEntries, 10, 2), check("check-transfer-main", tuple(integer("3"), integer("6"), integer("9")), integer("9"), { mode: "bar-chart", dataset: chartTransferDataset, expectedMaximum: integer("9"), chart: { orientation: "bar", axisOrigin: integer("0"), axisMaximum: integer("10"), tickInterval: integer("2"), unitLabel: "Buecher", categoryOrder: ["A", "B", "C"], bars: chartTransferEntries.map(({ category, count }) => ({ category, height: integer(String(count)), categoryFactId: `transfer-category-${category.toLowerCase()}`, barFactId: `transfer-bar-${category.toLowerCase()}` })), accessibleEncoding: { colorIndependentCue: "Muster und sichtbare Wertbeschriftung", visibleValueLabels: true } } })),
  },
] as const;

const sceneFunctions = ["hook", "objective", "model", "worked-example", "mistake", "guided-practice", "think-pause", "solution", "recap"] as const;
const scenePurposes = ["Datensatz und Leitfrage öffnen.", "Das überprüfbare Lernziel transparent machen.", "Liste oder Diagramm aus dem gebundenen Datensatz modellieren.", "Ableitungen und Lösung geordnet erklären.", "Eine kurze Fehlvorstellungsfrage stellen, entscheiden lassen und fachlich korrigieren.", "Ein zweites Beispiel mit verändertem Muster zur selbstständigen Bearbeitung öffnen.", "Die zweite Aufgabe ohne Lösungshinweis mit Denkzeit bearbeiten lassen.", "Die geprüfte Transferlösung auflösen.", "Eine abschließende Abruffrage ohne unmittelbare Lösungshilfe stellen."] as const;
const sceneDurations = [20, 20, 35, 30, 25, 30, 35, 25, 20] as const;

function buildTask(definition: TaskDefinition, sourceHash: string) {
  const lineage = { contentContractVersion: LESSON_CONTENT_CONTRACT_VERSION, sourceContentHash: sourceHash, sourceTaskId: definition.taskId };
  const sourceFactId = `${definition.taskId}-source`;
  const answerFactId = `${definition.taskId}-answer`;
  return {
    task: { exampleId: definition.taskId, prompt: definition.prompt, steps: [{ stepId: `step-${definition.taskId}-model`, explanation: "Binde Kategorien, Zellen und Werte an den strukturierten Datensatz.", factId: sourceFactId }, { stepId: `step-${definition.taskId}-result`, explanation: "Leite Totale, Maximum und Skala unabhängig ab.", factId: answerFactId }], solutionFactId: answerFactId },
    facts: [
      { factId: sourceFactId, semantic: definition.sourceSemantic, displayLatex: definition.sourceDisplay, checkIds: [definition.check.checkId], lineage },
      { factId: answerFactId, semantic: definition.answerSemantic, displayLatex: definition.answerDisplay, checkIds: [definition.check.checkId], lineage },
      ...definition.derivedFacts.map((fact) => ({ factId: fact.factId, semantic: fact.semantic, displayLatex: fact.display, checkIds: [definition.check.checkId], lineage })),
    ],
  };
}

function buildSpecification(definition: ContentDefinition): ProductionLessonContent {
  const exampleHash = canonicalHash(definition.example);
  const transferHash = canonicalHash(definition.transfer);
  const example = buildTask(definition.example, exampleHash);
  const transfer = buildTask(definition.transfer, transferHash);
  const exampleDerived = definition.example.derivedFacts.map((fact) => fact.factId);
  const transferDerived = definition.transfer.derivedFacts.map((fact) => fact.factId);
  const sceneFacts = [[], [], ["example-main-source", ...exampleDerived], ["example-main-source", "example-main-answer"], ["example-main-answer"], ["transfer-main-source", ...transferDerived], ["transfer-main-source"], ["transfer-main-answer"], []];
  const draft = {
    artifactVersion: "data-diagrams-lesson-content.v1" as const, contractVersion: LESSON_CONTENT_CONTRACT_VERSION, contentVersion: DATA_DIAGRAM_CONTENT_VERSION, locale: "de-DE" as const, skillId: definition.skillId, variant: "standard" as const, learningObjective: definition.learningObjective, prerequisiteSkillIds: [...definition.prerequisiteSkillIds], prerequisiteReviewStatus: "proposed-unreviewed" as const, priorKnowledge: [...definition.priorKnowledge], misconceptions: [{ misconceptionId: "misconception-main", description: definition.misconception, correctionFactId: "example-main-answer" }], conceptIds: definition.conceptIds, promise: "Datensätze exakt erfassen, auswerten und zugänglich darstellen", targetAudience: "Lernende der Regelanforderungen in Klasse fünf", modelVisual: definition.modelVisual, practiceVisual: definition.practiceVisual, workedExamples: [example.task], transferTask: transfer.task,
    formativeChecks: [{ formativeCheckId: "formative-example", prompt: "Erkläre [[fact:example-main-source]] und das geprüfte Ergebnis [[fact:example-main-answer]].", factIds: ["example-main-source", "example-main-answer"], verifierCheckId: definition.example.check.checkId, answerFactId: "example-main-answer" }, { formativeCheckId: "formative-transfer", prompt: "Werte [[fact:transfer-main-source]] aus.", factIds: ["transfer-main-source"], verifierCheckId: definition.transfer.check.checkId, answerFactId: "transfer-main-answer" }],
    answerKey: [{ taskId: example.task.exampleId, sourceTaskHash: exampleHash, solutionFactId: example.task.solutionFactId, orderedStepIds: example.task.steps.map((step) => step.stepId) }, { taskId: transfer.task.exampleId, sourceTaskHash: transferHash, solutionFactId: transfer.task.solutionFactId, orderedStepIds: transfer.task.steps.map((step) => step.stepId) }], facts: [...example.facts, ...transfer.facts], checks: [definition.example.check, definition.transfer.check], scenes: sceneFunctions.map((sceneFunction, index) => ({ sceneId: `scene-${String(index + 1).padStart(3, "0")}`, sceneFunction, purpose: scenePurposes[index]!, factIds: sceneFacts[index]!, processCompetencies: index === 2 || index === 5 ? (["REP"] as const) : [], visualComponent: index === 2 ? definition.modelVisual : index === 5 ? definition.practiceVisual : index === 6 ? ("teacher" as const) : ("formula" as const), plannedDurationSeconds: sceneDurations[index]! })), expectedDurationSeconds: 240 as const,
    sourceIdentity: { curriculumReleaseId: "de-gems-5-10-v1" as const, curriculumVersion: "1.0.0-draft.1" as const, curriculumReleaseHash: "9afb5e2c0ed7a10628df7f5d1d589739995910900d66b5b479894a3a95360b31" as const, curriculumSkillHash: definition.curriculumSkillHash, sourceIds: ["kmk-2022-math"], sourceSection: "normalized synthesis; exact source mapping pending external review", sourceReviewStatus: "pending" as const }, reviewStatus: "pending-external-review" as const,
  };
  return productionLessonContentSchema.parse({ ...draft, contentHash: canonicalHash(draft) });
}

const specifications = definitions.map(buildSpecification);
const bySkill = new Map(specifications.map((specification) => [specification.skillId, specification]));
export const DATA_DIAGRAM_STANDARD_SKILL_IDS = Object.freeze(specifications.map((specification) => specification.skillId));
export function loadDataDiagramStandardContent(skill: CurriculumSkill): ProductionLessonContent | null {
  const specification = bySkill.get(skill.skillId);
  if (!specification) return null;
  if (canonicalHash(skill) !== specification.sourceIdentity.curriculumSkillHash || skill.learningObjective !== specification.learningObjective) throw new Error(`Lesson content is bound to a stale curriculum identity for ${skill.skillId}.`);
  return productionLessonContentSchema.parse(structuredClone(specification));
}
export function loadAllDataDiagramStandardContent(): ProductionLessonContent[] { return specifications.map((specification) => productionLessonContentSchema.parse(structuredClone(specification))); }
export function dataDiagramConceptIds(skillId: string): readonly [string, string] | null { return bySkill.get(skillId)?.conceptIds ?? null; }
