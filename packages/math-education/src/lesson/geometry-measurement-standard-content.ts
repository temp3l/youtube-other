import {
  type CurriculumSkill,
  type ExactValue,
  type ExpressionNode,
  type UnitExpression,
  type VerificationCheck,
} from "../domain/index.js";
import { canonicalHash } from "../verification/canonical-json.js";
import {
  GEOMETRY_MEASUREMENT_CONTENT_VERSION,
  LESSON_CONTENT_CONTRACT_VERSION,
  productionLessonContentSchema,
  type ProductionLessonContent,
} from "./production-content.js";

type GeometryMeasurementCheck = Extract<VerificationCheck, { kind: "geometry-measurement-domain" }>;
const integer = (value: string): ExpressionNode => ({ kind: "integer", value });
const decimal = (unscaled: string, scale: number): ExpressionNode => ({ kind: "decimal", unscaled, scale });
const tuple = (...items: ExpressionNode[]): ExpressionNode => ({ kind: "tuple", items });
const scalar = (expression: ExpressionNode): ExactValue => ({ kind: "scalar", expression });
const unit = (symbol: string, numerator: string, denominator: string, dimensions: Record<string, number>): UnitExpression => ({ symbol, scale: { numerator, denominator }, dimensions });
const measurement = (value: ExpressionNode, valueUnit: UnitExpression): ExactValue => ({ kind: "measurement", value, unit: valueUnit });
const exactTuple = (...values: ExactValue[]): ExactValue => ({ kind: "tuple", values });
const point = (x: string, y: string) => ({ x: integer(x), y: integer(y) });
const line = (x1: string, y1: string, x2: string, y2: string) => ({ from: point(x1, y1), to: point(x2, y2) });

const metre = unit("m", "1", "1", { length: 1 });
const centimetre = unit("cm", "1", "100", { length: 1 });
const kilogram = unit("kg", "1", "1", { mass: 1 });
const gram = unit("g", "1", "1000", { mass: 1 });
const hour = unit("h", "3600", "1", { time: 1 });
const minute = unit("min", "60", "1", { time: 1 });
const euro = unit("€", "1", "1", { currency: 1 });
const cent = unit("ct", "1", "100", { currency: 1 });
const squareCentimetre = unit("cm²", "1", "10000", { length: 2 });
const cubicCentimetre = unit("cm³", "1", "1000000", { length: 3 });
const degree: UnitExpression = { symbol: "degree", scale: { numerator: "1", denominator: "1" }, dimensions: { angle: 1 }, angle: "degree" };

interface TaskDefinition {
  readonly taskId: "example-main" | "transfer-main";
  readonly prompt: string;
  readonly sourceDisplay: string;
  readonly answerDisplay: string;
  readonly sourceSemantic: ExactValue;
  readonly answerSemantic: ExactValue;
  readonly check: GeometryMeasurementCheck;
}
interface ContentDefinition {
  readonly skillId: `M5-${"GM" | "RF"}-${string}`;
  readonly curriculumSkillHash: string;
  readonly learningObjective: string;
  readonly prerequisiteSkillIds: readonly `M5-${"GM" | "RF"}-${string}`[];
  readonly priorKnowledge: readonly string[];
  readonly misconception: string;
  readonly conceptIds: readonly [string, string];
  readonly modelVisual: "formula" | "geometry" | "measurement";
  readonly practiceVisual: "formula" | "geometry" | "measurement";
  readonly example: TaskDefinition;
  readonly transfer: TaskDefinition;
}
const check = (checkId: string, sourceExpression: ExpressionNode, expression: ExpressionNode, evidence: GeometryMeasurementCheck["evidence"]): GeometryMeasurementCheck => ({ checkId, kind: "geometry-measurement-domain", sourceExpression, expression, evidence, critical: true });
const task = (taskId: TaskDefinition["taskId"], sourceDisplay: string, answerDisplay: string, sourceSemantic: ExactValue, answerSemantic: ExactValue, taskCheck: GeometryMeasurementCheck): TaskDefinition => ({ taskId, prompt: `Bearbeite [[fact:${taskId}-source]] und begründe das geprüfte Ergebnis.`, sourceDisplay, answerDisplay, sourceSemantic, answerSemantic, check: taskCheck });
const rectangleVisual = (width: ExpressionNode, height: ExpressionNode) => ({ width, height, scaleMode: "not-to-scale" as const, visibleLabel: "nicht maßstabsgetreu" as const, colorIndependentCues: ["Seitenmarken und Textbeschriftung"] });
const volumeVisual = { scaleMode: "not-to-scale" as const, visibleLabel: "nicht maßstabsgetreu" as const, colorIndependentCues: ["Kantenmuster und Textbeschriftung"] };

const definitions: readonly ContentDefinition[] = [
  {
    skillId: "M5-GM-001", curriculumSkillHash: "1e1ff0631d32ac0167ddddc937cb1fd20ba0b7fe599b4b7bb40c1bc0e77dbb63", learningObjective: "Längen-, Massen-, Zeit- und Geldeinheiten umrechnen", prerequisiteSkillIds: [], priorKnowledge: ["Größen und Einheiten unterscheiden"], misconception: "Ein Umrechnungsfaktor wird ohne Prüfung der Dimension auf jede Einheit übertragen.", conceptIds: ["unit-conversion", "dimension"], modelVisual: "measurement", practiceVisual: "measurement",
    example: task("example-main", "2 m; 3 kg", "200 cm; 3000 g", exactTuple(measurement(integer("2"), metre), measurement(integer("3"), kilogram)), exactTuple(measurement(integer("200"), centimetre), measurement(integer("3000"), gram)), check("check-example-main", tuple(integer("2"), integer("3")), tuple(integer("200"), integer("3000")), { mode: "unit-conversion", conversions: [{ sourceValue: integer("2"), sourceUnit: metre, targetValue: integer("200"), targetUnit: centimetre }, { sourceValue: integer("3"), sourceUnit: kilogram, targetValue: integer("3000"), targetUnit: gram }] })),
    transfer: task("transfer-main", "2 h; 3,50 €", "120 min; 350 ct", exactTuple(measurement(integer("2"), hour), measurement(decimal("350", 2), euro)), exactTuple(measurement(integer("120"), minute), measurement(integer("350"), cent)), check("check-transfer-main", tuple(integer("2"), decimal("350", 2)), tuple(integer("120"), integer("350")), { mode: "unit-conversion", conversions: [{ sourceValue: integer("2"), sourceUnit: hour, targetValue: integer("120"), targetUnit: minute }, { sourceValue: decimal("350", 2), sourceUnit: euro, targetValue: integer("350"), targetUnit: cent }] })),
  },
  {
    skillId: "M5-GM-002", curriculumSkillHash: "1b769af8a5bc7159d80300048ac738e637b9376890bdafd84a133f7e0aca3c1e", learningObjective: "Umfang von Rechteck und Quadrat berechnen", prerequisiteSkillIds: [], priorKnowledge: ["Seitenlängen addieren"], misconception: "Beim Umfang werden nur zwei Seiten addiert oder Flächeneinheiten verwendet.", conceptIds: ["perimeter", "rectangle"], modelVisual: "geometry", practiceVisual: "formula",
    example: task("example-main", "Rechteck 8 cm × 5 cm", "26 cm", scalar(tuple(integer("8"), integer("5"))), measurement(integer("26"), centimetre), check("check-example-main", tuple(integer("8"), integer("5")), integer("26"), { mode: "rectangle-measure", quantity: "perimeter", width: integer("8"), height: integer("5"), lengthUnit: centimetre, resultUnit: centimetre, visual: rectangleVisual(integer("8"), integer("5")) })),
    transfer: task("transfer-main", "Quadrat 6 cm × 6 cm", "24 cm", scalar(tuple(integer("6"), integer("6"))), measurement(integer("24"), centimetre), check("check-transfer-main", tuple(integer("6"), integer("6")), integer("24"), { mode: "rectangle-measure", quantity: "perimeter", width: integer("6"), height: integer("6"), lengthUnit: centimetre, resultUnit: centimetre, visual: rectangleVisual(integer("6"), integer("6")) })),
  },
  {
    skillId: "M5-GM-003", curriculumSkillHash: "24999b23a3f88bef96286b70e67ade0dd2ea2b37a92aaf5df921286b4bce7a8b", learningObjective: "Flächeninhalt von Rechteck und Quadrat berechnen", prerequisiteSkillIds: [], priorKnowledge: ["Länge und Breite multiplizieren"], misconception: "Umfang und Fläche werden verwechselt oder die Quadrateinheit geht verloren.", conceptIds: ["area", "square-unit"], modelVisual: "geometry", practiceVisual: "formula",
    example: task("example-main", "Rechteck 8 cm × 5 cm", "40 cm²", scalar(tuple(integer("8"), integer("5"))), measurement(integer("40"), squareCentimetre), check("check-example-main", tuple(integer("8"), integer("5")), integer("40"), { mode: "rectangle-measure", quantity: "area", width: integer("8"), height: integer("5"), lengthUnit: centimetre, resultUnit: squareCentimetre, visual: rectangleVisual(integer("8"), integer("5")) })),
    transfer: task("transfer-main", "Quadrat 7 cm × 7 cm", "49 cm²", scalar(tuple(integer("7"), integer("7"))), measurement(integer("49"), squareCentimetre), check("check-transfer-main", tuple(integer("7"), integer("7")), integer("49"), { mode: "rectangle-measure", quantity: "area", width: integer("7"), height: integer("7"), lengthUnit: centimetre, resultUnit: squareCentimetre, visual: rectangleVisual(integer("7"), integer("7")) })),
  },
  {
    skillId: "M5-RF-001", curriculumSkillHash: "4fcf5a78a598d699309c1d46e59527eb143c7f8bddf71fd69924d65d0766a406", learningObjective: "Punkt, Strecke, Gerade, parallel und senkrecht unterscheiden", prerequisiteSkillIds: [], priorKnowledge: ["Punkte in einem Koordinatengitter lesen"], misconception: "Parallelität oder Rechtwinkligkeit wird nur nach dem Farbeindruck beurteilt.", conceptIds: ["parallel", "perpendicular"], modelVisual: "geometry", practiceVisual: "geometry",
    example: task("example-main", "Zwei Geraden mit Richtung (4;0)", "parallel", scalar(integer("1")), scalar(integer("1")), check("check-example-main", integer("1"), integer("1"), { mode: "spatial-relations", entities: ["point", "segment", "line"], lines: [line("0", "0", "4", "0"), line("0", "2", "4", "2")], relation: "parallel", scaleMode: "to-scale" })),
    transfer: task("transfer-main", "Waagerechte und senkrechte Gerade", "senkrecht", scalar(integer("1")), scalar(integer("1")), check("check-transfer-main", integer("1"), integer("1"), { mode: "spatial-relations", entities: ["point", "segment", "line"], lines: [line("0", "0", "4", "0"), line("2", "-2", "2", "3")], relation: "perpendicular", scaleMode: "to-scale" })),
  },
  {
    skillId: "M5-RF-002", curriculumSkillHash: "d2706b597203afebc1f9b32e6a3a000ca6fa31780e517b76a82deb00a890a447", learningObjective: "Winkelarten erkennen und benennen", prerequisiteSkillIds: [], priorKnowledge: ["Winkel als Drehung zwischen zwei Strahlen deuten"], misconception: "Die Schenkellänge oder Farbe bestimmt die Winkelart.", conceptIds: ["angle", "angle-type"], modelVisual: "geometry", practiceVisual: "geometry",
    example: task("example-main", "45°", "spitzer Winkel", scalar(integer("45")), measurement(integer("45"), degree), check("check-example-main", integer("45"), integer("45"), { mode: "angle", degrees: integer("45"), angleType: "acute", rays: [line("0", "0", "1", "0"), line("0", "0", "1", "1")], scaleMode: "to-scale" })),
    transfer: task("transfer-main", "135°", "stumpfer Winkel", scalar(integer("135")), measurement(integer("135"), degree), check("check-transfer-main", integer("135"), integer("135"), { mode: "angle", degrees: integer("135"), angleType: "obtuse", rays: [line("0", "0", "1", "0"), line("0", "0", "-1", "1")], scaleMode: "to-scale" })),
  },
  {
    skillId: "M5-RF-003", curriculumSkillHash: "470edaf519acaa150c1a33dac5d89a12dd0309805ae996b86b05256eb935486e", learningObjective: "Winkel messen und zeichnen", prerequisiteSkillIds: ["M5-RF-002"], priorKnowledge: ["Winkelarten sicher unterscheiden"], misconception: "Am falschen Nullpunkt oder an der falschen Skala wird abgelesen.", conceptIds: ["angle-measurement", "degree"], modelVisual: "measurement", practiceVisual: "geometry",
    example: task("example-main", "rechter Winkel", "90°", scalar(integer("90")), measurement(integer("90"), degree), check("check-example-main", integer("90"), integer("90"), { mode: "angle", degrees: integer("90"), angleType: "right", rays: [line("0", "0", "1", "0"), line("0", "0", "0", "1")], scaleMode: "to-scale" })),
    transfer: task("transfer-main", "spitzer Winkel", "45°", scalar(integer("45")), measurement(integer("45"), degree), check("check-transfer-main", integer("45"), integer("45"), { mode: "angle", degrees: integer("45"), angleType: "acute", rays: [line("0", "0", "1", "0"), line("0", "0", "1", "1")], scaleMode: "to-scale" })),
  },
  {
    skillId: "M5-RF-004", curriculumSkillHash: "3b3e42b8ea10a30ab64f24323f674c0829cd561d2f3734cb7641a9367b9fcfd4", learningObjective: "Dreiecke und Vierecke klassifizieren", prerequisiteSkillIds: [], priorKnowledge: ["Seiten und Winkel als Eigenschaften nutzen"], misconception: "Eine gedrehte Figur wird nach ihrer Lage statt ihren Eigenschaften klassifiziert.", conceptIds: ["polygon", "classification"], modelVisual: "geometry", practiceVisual: "geometry",
    example: task("example-main", "Dreieck (0;0),(3;0),(0;4)", "rechtwinkliges Dreieck", scalar(integer("1")), scalar(integer("1")), check("check-example-main", integer("1"), integer("1"), { mode: "polygon-classification", classification: "right-triangle", vertices: [point("0", "0"), point("3", "0"), point("0", "4")], scaleMode: "to-scale" })),
    transfer: task("transfer-main", "Viereck (0;0),(4;0),(4;2),(0;2)", "Rechteck", scalar(integer("1")), scalar(integer("1")), check("check-transfer-main", integer("1"), integer("1"), { mode: "polygon-classification", classification: "rectangle", vertices: [point("0", "0"), point("4", "0"), point("4", "2"), point("0", "2")], scaleMode: "to-scale" })),
  },
  {
    skillId: "M5-RF-005", curriculumSkillHash: "c419af9c42c0a67dcf05bbc085da879bac89b61eaba4088c9237eb419823de9c", learningObjective: "Achsensymmetrische Figuren erkennen und ergänzen", prerequisiteSkillIds: [], priorKnowledge: ["Abstände zu einer Geraden vergleichen"], misconception: "Spiegelpunkte werden verschoben, ohne den senkrechten Abstand zur Achse zu erhalten.", conceptIds: ["axial-symmetry", "mirror-axis"], modelVisual: "geometry", practiceVisual: "geometry",
    example: task("example-main", "Achse x=0; (-3;2) ↔ (3;2)", "achsensymmetrisch", scalar(integer("1")), scalar(integer("1")), check("check-example-main", integer("1"), integer("1"), { mode: "axial-symmetry", axisX: integer("0"), pairs: [{ left: point("-3", "2"), right: point("3", "2") }, { left: point("-1", "5"), right: point("1", "5") }], colorIndependentCues: ["gestrichelte Spiegelachse", "gleiche Abstandsmarken"] })),
    transfer: task("transfer-main", "Achse x=2; (0;1) ↔ (4;1)", "achsensymmetrisch", scalar(integer("1")), scalar(integer("1")), check("check-transfer-main", integer("1"), integer("1"), { mode: "axial-symmetry", axisX: integer("2"), pairs: [{ left: point("0", "1"), right: point("4", "1") }, { left: point("1", "4"), right: point("3", "4") }], colorIndependentCues: ["gestrichelte Spiegelachse", "gleiche Abstandsmarken"] })),
  },
  {
    skillId: "M5-RF-006", curriculumSkillHash: "a18b19c804d6a6443cc7beb6175b1bf81a93a11a356a37d4c40d37e54109990a", learningObjective: "Würfel- und Quadernetze erkennen", prerequisiteSkillIds: [], priorKnowledge: ["Flächen über gemeinsame Kanten verbinden"], misconception: "Sechs beliebige oder überlappende Flächen werden automatisch als Netz akzeptiert.", conceptIds: ["solid-net", "face"], modelVisual: "geometry", practiceVisual: "geometry",
    example: task("example-main", "Würfelnetz mit sechs eindeutigen Flächen", "gültig", scalar(integer("1")), scalar(integer("1")), check("check-example-main", integer("1"), integer("1"), { mode: "net-validity", solid: "cube", faces: [{ x: 1, y: 0, faceLabel: "A" }, { x: 0, y: 1, faceLabel: "B" }, { x: 1, y: 1, faceLabel: "C" }, { x: 2, y: 1, faceLabel: "D" }, { x: 1, y: 2, faceLabel: "E" }, { x: 1, y: 3, faceLabel: "F" }], colorIndependentCues: ["eindeutige Buchstaben", "sichtbare Faltkanten"] })),
    transfer: task("transfer-main", "Quadernetz mit sechs eindeutigen Flächen", "gültig", scalar(integer("1")), scalar(integer("1")), check("check-transfer-main", integer("1"), integer("1"), { mode: "net-validity", solid: "cuboid", faces: [{ x: 0, y: 0, faceLabel: "V" }, { x: 1, y: 0, faceLabel: "W" }, { x: 2, y: 0, faceLabel: "X" }, { x: 3, y: 0, faceLabel: "Y" }, { x: 1, y: 1, faceLabel: "Z" }, { x: 1, y: -1, faceLabel: "U" }], colorIndependentCues: ["eindeutige Buchstaben", "sichtbare Faltkanten"] })),
  },
  {
    skillId: "M5-GM-004", curriculumSkillHash: "52e0c6957e53ca433944d7cb16362fc8afd752d852758ffa26f1a64d62d6bf62", learningObjective: "Volumen mit Einheitswürfeln bestimmen", prerequisiteSkillIds: [], priorKnowledge: ["Würfel in Schichten zählen"], misconception: "Nur sichtbare Würfel oder nur eine Schicht werden gezählt.", conceptIds: ["unit-cube", "volume"], modelVisual: "geometry", practiceVisual: "formula",
    example: task("example-main", "3 × 2 × 4 Einheitswürfel", "24 Einheitswürfel", scalar(tuple(integer("3"), integer("2"), integer("4"))), scalar(integer("24")), check("check-example-main", tuple(integer("3"), integer("2"), integer("4")), integer("24"), { mode: "unit-cube-volume", length: integer("3"), width: integer("2"), height: integer("4"), cubeCount: integer("24") })),
    transfer: task("transfer-main", "5 × 3 × 2 Einheitswürfel", "30 Einheitswürfel", scalar(tuple(integer("5"), integer("3"), integer("2"))), scalar(integer("30")), check("check-transfer-main", tuple(integer("5"), integer("3"), integer("2")), integer("30"), { mode: "unit-cube-volume", length: integer("5"), width: integer("3"), height: integer("2"), cubeCount: integer("30") })),
  },
  {
    skillId: "M5-GM-005", curriculumSkillHash: "2d3dd4c7c761eddcdb48df84d1243cd4ab7a245c4ef3a2ec7b5c5154aef4e02c", learningObjective: "Volumen eines Quaders berechnen", prerequisiteSkillIds: ["M5-GM-004"], priorKnowledge: ["Volumen als Zahl von Einheitswürfeln deuten"], misconception: "Nur zwei Kanten werden multipliziert oder die Kubikeinheit geht verloren.", conceptIds: ["cuboid-volume", "cubic-unit"], modelVisual: "geometry", practiceVisual: "formula",
    example: task("example-main", "8 cm × 5 cm × 3 cm", "120 cm³", scalar(tuple(integer("8"), integer("5"), integer("3"))), measurement(integer("120"), cubicCentimetre), check("check-example-main", tuple(integer("8"), integer("5"), integer("3")), integer("120"), { mode: "cuboid-volume", length: integer("8"), width: integer("5"), height: integer("3"), lengthUnit: centimetre, resultUnit: cubicCentimetre, visual: volumeVisual })),
    transfer: task("transfer-main", "6 cm × 4 cm × 5 cm", "120 cm³", scalar(tuple(integer("6"), integer("4"), integer("5"))), measurement(integer("120"), cubicCentimetre), check("check-transfer-main", tuple(integer("6"), integer("4"), integer("5")), integer("120"), { mode: "cuboid-volume", length: integer("6"), width: integer("4"), height: integer("5"), lengthUnit: centimetre, resultUnit: cubicCentimetre, visual: volumeVisual })),
  },
] as const;

const sceneFunctions = ["hook", "objective", "model", "worked-example", "mistake", "guided-practice", "think-pause", "solution", "recap"] as const;
const scenePurposes = ["Vorwissen aktivieren und die Leitfrage öffnen.", "Das überprüfbare Lernziel transparent machen.", "Die semantische Darstellung am geprüften Beispiel modellieren.", "Den Lösungsweg in fachlich geordneter Folge erklären.", "Eine kurze Fehlvorstellungsfrage stellen, entscheiden lassen und fachlich korrigieren.", "Ein zweites Beispiel mit verändertem Muster zur selbstständigen Bearbeitung öffnen.", "Die zweite Aufgabe ohne Lösungshinweis mit Denkzeit bearbeiten lassen.", "Die geprüfte Transferlösung auflösen und begründen.", "Eine abschließende Abruffrage ohne unmittelbare Lösungshilfe stellen."] as const;
const sceneDurations = [20, 20, 35, 30, 25, 30, 35, 25, 20] as const;

function buildTask(definition: TaskDefinition, sourceHash: string) {
  const sourceFactId = `${definition.taskId}-source`;
  const answerFactId = `${definition.taskId}-answer`;
  const lineage = { contentContractVersion: LESSON_CONTENT_CONTRACT_VERSION, sourceContentHash: sourceHash, sourceTaskId: definition.taskId };
  return {
    task: { exampleId: definition.taskId, prompt: definition.prompt, steps: [{ stepId: `step-${definition.taskId}-model`, explanation: "Ordne Angaben, Einheiten und Relationen der semantischen Darstellung zu.", factId: sourceFactId }, { stepId: `step-${definition.taskId}-result`, explanation: "Prüfe Rechnung, Dimension und visuelle Behauptung unabhängig.", factId: answerFactId }], solutionFactId: answerFactId },
    facts: [{ factId: sourceFactId, semantic: definition.sourceSemantic, displayLatex: definition.sourceDisplay, checkIds: [definition.check.checkId], lineage }, { factId: answerFactId, semantic: definition.answerSemantic, displayLatex: definition.answerDisplay, checkIds: [definition.check.checkId], lineage }],
  };
}

function buildSpecification(definition: ContentDefinition): ProductionLessonContent {
  const exampleHash = canonicalHash(definition.example);
  const transferHash = canonicalHash(definition.transfer);
  const example = buildTask(definition.example, exampleHash);
  const transfer = buildTask(definition.transfer, transferHash);
  const sceneFacts = [[], [], ["example-main-source"], ["example-main-source", "example-main-answer"], ["example-main-answer"], ["transfer-main-source"], ["transfer-main-source"], ["transfer-main-answer"], []];
  const draft = {
    artifactVersion: "geometry-measurement-lesson-content.v1" as const, contractVersion: LESSON_CONTENT_CONTRACT_VERSION, contentVersion: GEOMETRY_MEASUREMENT_CONTENT_VERSION, locale: "de-DE" as const, skillId: definition.skillId, variant: "standard" as const, learningObjective: definition.learningObjective, prerequisiteSkillIds: [...definition.prerequisiteSkillIds], prerequisiteReviewStatus: "proposed-unreviewed" as const, priorKnowledge: [...definition.priorKnowledge], misconceptions: [{ misconceptionId: "misconception-main", description: definition.misconception, correctionFactId: "example-main-answer" }], conceptIds: definition.conceptIds, promise: "Geometrische Beziehungen und Größen exakt darstellen, prüfen und begründen", targetAudience: "Lernende der Regelanforderungen in Klasse fünf", modelVisual: definition.modelVisual, practiceVisual: definition.practiceVisual, workedExamples: [example.task], transferTask: transfer.task,
    formativeChecks: [{ formativeCheckId: "formative-example", prompt: "Erkläre den geprüften Übergang von [[fact:example-main-source]] zu [[fact:example-main-answer]].", factIds: ["example-main-source", "example-main-answer"], verifierCheckId: definition.example.check.checkId, answerFactId: "example-main-answer" }, { formativeCheckId: "formative-transfer", prompt: "Löse [[fact:transfer-main-source]] und vergleiche mit dem gesicherten Ergebnis.", factIds: ["transfer-main-source"], verifierCheckId: definition.transfer.check.checkId, answerFactId: "transfer-main-answer" }],
    answerKey: [{ taskId: example.task.exampleId, sourceTaskHash: exampleHash, solutionFactId: example.task.solutionFactId, orderedStepIds: example.task.steps.map((step) => step.stepId) }, { taskId: transfer.task.exampleId, sourceTaskHash: transferHash, solutionFactId: transfer.task.solutionFactId, orderedStepIds: transfer.task.steps.map((step) => step.stepId) }], facts: [...example.facts, ...transfer.facts], checks: [definition.example.check, definition.transfer.check],
    scenes: sceneFunctions.map((sceneFunction, index) => ({ sceneId: `scene-${String(index + 1).padStart(3, "0")}`, sceneFunction, purpose: scenePurposes[index]!, factIds: sceneFacts[index]!, processCompetencies: index === 2 || index === 5 ? (["REP"] as const) : [], visualComponent: index === 2 ? definition.modelVisual : index === 5 ? definition.practiceVisual : index === 6 ? ("teacher" as const) : ("formula" as const), plannedDurationSeconds: sceneDurations[index]! })), expectedDurationSeconds: 240 as const,
    sourceIdentity: { curriculumReleaseId: "de-gems-5-10-v1" as const, curriculumVersion: "1.0.0-draft.1" as const, curriculumReleaseHash: "9afb5e2c0ed7a10628df7f5d1d589739995910900d66b5b479894a3a95360b31" as const, curriculumSkillHash: definition.curriculumSkillHash, sourceIds: ["kmk-2022-math"], sourceSection: "normalized synthesis; exact source mapping pending external review", sourceReviewStatus: "pending" as const }, reviewStatus: "pending-external-review" as const,
  };
  return productionLessonContentSchema.parse({ ...draft, contentHash: canonicalHash(draft) });
}

const specifications = definitions.map(buildSpecification);
const specificationsBySkill = new Map(specifications.map((specification) => [specification.skillId, specification]));
export const GEOMETRY_MEASUREMENT_STANDARD_SKILL_IDS = Object.freeze(specifications.map((specification) => specification.skillId));
export function loadGeometryMeasurementStandardContent(skill: CurriculumSkill): ProductionLessonContent | null {
  const specification = specificationsBySkill.get(skill.skillId);
  if (!specification) return null;
  if (canonicalHash(skill) !== specification.sourceIdentity.curriculumSkillHash || skill.learningObjective !== specification.learningObjective) throw new Error(`Lesson content is bound to a stale curriculum identity for ${skill.skillId}.`);
  return productionLessonContentSchema.parse(structuredClone(specification));
}
export function loadAllGeometryMeasurementStandardContent(): ProductionLessonContent[] { return specifications.map((specification) => productionLessonContentSchema.parse(structuredClone(specification))); }
export function geometryMeasurementConceptIds(skillId: string): readonly [string, string] | null { return specificationsBySkill.get(skillId)?.conceptIds ?? null; }
