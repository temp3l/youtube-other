import {
  type CurriculumSkill,
  type ExpressionNode,
  type VerificationCheck,
} from "../domain/index.js";
import { canonicalHash } from "../verification/canonical-json.js";
import {
  LESSON_CONTENT_CONTRACT_VERSION,
  NUMBER_OPERATIONS_CONTENT_VERSION,
  productionLessonContentSchema,
  type ProductionLessonContent,
} from "./production-content.js";

type IntegerDomainCheck = Extract<
  VerificationCheck,
  { kind: "integer-domain" }
>;

const integer = (value: string): ExpressionNode => ({ kind: "integer", value });
const symbol = (name: string): ExpressionNode => ({ kind: "symbol", name });
const tuple = (...items: ExpressionNode[]): ExpressionNode => ({
  kind: "tuple",
  items,
});
const sum = (...operands: ExpressionNode[]): ExpressionNode => ({
  kind: "sum",
  operands,
});
const product = (...operands: ExpressionNode[]): ExpressionNode => ({
  kind: "product",
  operands,
});
const power = (
  left: ExpressionNode,
  right: ExpressionNode
): ExpressionNode => ({
  kind: "power",
  left,
  right,
});
const relation = (
  operator: "eq" | "lt" | "lte" | "gt" | "gte",
  left: ExpressionNode,
  right: ExpressionNode
): ExpressionNode => ({ kind: "relation", operator, left, right });

interface TaskDefinition {
  readonly taskId: `example-${string}` | `transfer-${string}`;
  readonly prompt: string;
  readonly sourceDisplay: string;
  readonly answerDisplay: string;
  readonly check: IntegerDomainCheck;
}

interface ContentDefinition {
  readonly skillId: `M5-ZO-${string}`;
  readonly curriculumSkillHash: string;
  readonly learningObjective: string;
  readonly prerequisiteSkillIds: readonly `M5-ZO-${string}`[];
  readonly priorKnowledge: readonly string[];
  readonly misconception: string;
  readonly conceptIds: readonly [string, string];
  readonly modelVisual:
    | "formula"
    | "place-value-chart"
    | "number-line"
    | "data-table";
  readonly practiceVisual:
    | "formula"
    | "place-value-chart"
    | "number-line"
    | "data-table";
  readonly example: TaskDefinition;
  readonly transfer: TaskDefinition;
}

const check = (
  checkId: string,
  sourceExpression: ExpressionNode,
  expression: ExpressionNode,
  evidence: IntegerDomainCheck["evidence"]
): IntegerDomainCheck => ({
  checkId,
  kind: "integer-domain",
  sourceExpression,
  expression,
  evidence,
  critical: true,
});

const task = (
  taskId: TaskDefinition["taskId"],
  sourceDisplay: string,
  answerDisplay: string,
  taskCheck: TaskDefinition["check"]
): TaskDefinition => ({
  taskId,
  prompt: `Bearbeite [[fact:${taskId}-source]] und begründe dein Ergebnis.`,
  sourceDisplay,
  answerDisplay,
  check: taskCheck,
});

const definitions: readonly ContentDefinition[] = [
  {
    skillId: "M5-ZO-001",
    curriculumSkillHash:
      "8bc80f8f4f6dd9007de594e86793ad242199ca20080e60d92032e3cc860894ca",
    learningObjective:
      "Natürliche Zahlen im Stellenwertsystem lesen und schreiben",
    prerequisiteSkillIds: [],
    priorKnowledge: [
      "Ziffern sicher lesen",
      "Bündelungen im Zehnersystem erkennen",
    ],
    misconception: "Nullen zwischen besetzten Stellen werden ausgelassen.",
    conceptIds: ["place-value", "digit"],
    modelVisual: "place-value-chart",
    practiceVisual: "number-line",
    example: task(
      "example-main",
      "700000+30000+400+5",
      "730405",
      check(
        "check-example-main",
        sum(integer("700000"), integer("30000"), integer("400"), integer("5")),
        integer("730405"),
        {
          mode: "place-value",
          value: integer("730405"),
          placeValues: [
            integer("700000"),
            integer("30000"),
            integer("400"),
            integer("5"),
          ],
        }
      )
    ),
    transfer: task(
      "transfer-main",
      "600000+4000+70",
      "604070",
      check(
        "check-transfer-main",
        sum(integer("600000"), integer("4000"), integer("70")),
        integer("604070"),
        {
          mode: "place-value",
          value: integer("604070"),
          placeValues: [integer("600000"), integer("4000"), integer("70")],
        }
      )
    ),
  },
  {
    skillId: "M5-ZO-002",
    curriculumSkillHash:
      "1c201c398788c64ce6bd08fd0fcb2e737e737e4f741e66762056a1bf8ac9bf08",
    learningObjective: "Natürliche Zahlen vergleichen und ordnen",
    prerequisiteSkillIds: ["M5-ZO-001"],
    priorKnowledge: ["Stellenwerte von links nach rechts lesen"],
    misconception: "Es wird nur die letzte Ziffer verglichen.",
    conceptIds: ["comparison", "place-value"],
    modelVisual: "number-line",
    practiceVisual: "place-value-chart",
    example: task(
      "example-main",
      "478920<479002",
      "478920<479002",
      check(
        "check-example-main",
        relation("lt", integer("478920"), integer("479002")),
        relation("lt", integer("478920"), integer("479002")),
        {
          mode: "comparison",
          left: integer("478920"),
          right: integer("479002"),
          operator: "lt",
        }
      )
    ),
    transfer: task(
      "transfer-main",
      "802110>802101",
      "802110>802101",
      check(
        "check-transfer-main",
        relation("gt", integer("802110"), integer("802101")),
        relation("gt", integer("802110"), integer("802101")),
        {
          mode: "comparison",
          left: integer("802110"),
          right: integer("802101"),
          operator: "gt",
        }
      )
    ),
  },
  {
    skillId: "M5-ZO-003",
    curriculumSkillHash:
      "0c53cddc5ef0826e6e3e0f76b61b82bc1d6e14eb285ebcff2a409b861c8bf113",
    learningObjective: "Natürliche Zahlen sinnvoll runden",
    prerequisiteSkillIds: ["M5-ZO-001"],
    priorKnowledge: ["Stellenwerte und Nachbarzahlen bestimmen"],
    misconception:
      "Es wird an einer beliebigen Stelle statt am genannten Stellenwert gerundet.",
    conceptIds: ["rounding", "place-value"],
    modelVisual: "number-line",
    practiceVisual: "formula",
    example: task(
      "example-main",
      "(7462;100)",
      "7500",
      check(
        "check-example-main",
        tuple(integer("7462"), integer("100")),
        integer("7500"),
        {
          mode: "rounding",
          value: integer("7462"),
          place: integer("100"),
          rule: "half-up",
        }
      )
    ),
    transfer: task(
      "transfer-main",
      "(123449;1000)",
      "123000",
      check(
        "check-transfer-main",
        tuple(integer("123449"), integer("1000")),
        integer("123000"),
        {
          mode: "rounding",
          value: integer("123449"),
          place: integer("1000"),
          rule: "half-up",
        }
      )
    ),
  },
  {
    skillId: "M5-ZO-004",
    curriculumSkillHash:
      "42d584800e52b8c865a7374b2207c4f44e6a8d9cc7c033ca70514ece78b05a3d",
    learningObjective:
      "Rechenergebnisse überschlagen und mit einer Probe prüfen",
    prerequisiteSkillIds: ["M5-ZO-003"],
    priorKnowledge: [
      "Natürliche Zahlen runden",
      "Grundrechenarten sicher deuten",
    ],
    misconception:
      "Beim Überschlag werden die Operanden auf unpassende Stellen gerundet.",
    conceptIds: ["estimate", "rounding"],
    modelVisual: "formula",
    practiceVisual: "number-line",
    example: task(
      "example-main",
      "(398;604)",
      "1000",
      check(
        "check-example-main",
        tuple(integer("398"), integer("604")),
        integer("1000"),
        {
          mode: "estimation",
          operation: "add",
          operands: [integer("398"), integer("604")],
          roundingPlaces: [integer("100"), integer("100")],
          rule: "half-up",
        }
      )
    ),
    transfer: task(
      "transfer-main",
      "398+604",
      "1002",
      check(
        "check-transfer-main",
        sum(integer("398"), integer("604")),
        integer("1002"),
        {
          mode: "integer-operation",
          operation: "add",
          operands: [integer("398"), integer("604")],
        }
      )
    ),
  },
  {
    skillId: "M5-ZO-005",
    curriculumSkillHash:
      "5d982ae06b8980c576d7e5f4d2b13584086928b9b32c928cc57674760b32f72a",
    learningObjective: "Natürliche Zahlen schriftlich addieren",
    prerequisiteSkillIds: ["M5-ZO-001"],
    priorKnowledge: ["Stellenwerte spaltengerecht anordnen"],
    misconception: "Ein Übertrag wird in der nächsten Spalte vergessen.",
    conceptIds: ["addition", "carry"],
    modelVisual: "place-value-chart",
    practiceVisual: "formula",
    example: task(
      "example-main",
      "45876+27948",
      "73824",
      check(
        "check-example-main",
        sum(integer("45876"), integer("27948")),
        integer("73824"),
        {
          mode: "integer-operation",
          operation: "add",
          operands: [integer("45876"), integer("27948")],
        }
      )
    ),
    transfer: task(
      "transfer-main",
      "306709+89596",
      "396305",
      check(
        "check-transfer-main",
        sum(integer("306709"), integer("89596")),
        integer("396305"),
        {
          mode: "integer-operation",
          operation: "add",
          operands: [integer("306709"), integer("89596")],
        }
      )
    ),
  },
  {
    skillId: "M5-ZO-006",
    curriculumSkillHash:
      "d1116e13e58a1ea1ed6b353260d7e2b9b79c1008b2e5957eb0eee74ff6e864b4",
    learningObjective: "Natürliche Zahlen schriftlich subtrahieren",
    prerequisiteSkillIds: ["M5-ZO-001", "M5-ZO-002"],
    priorKnowledge: [
      "Stellenwerte spaltengerecht anordnen",
      "Größere und kleinere Zahl unterscheiden",
    ],
    misconception:
      "Beim Entbündeln über mehrere Nullstellen wird nur einmal entliehen.",
    conceptIds: ["subtraction", "borrow"],
    modelVisual: "place-value-chart",
    practiceVisual: "formula",
    example: task(
      "example-main",
      "70003-28675",
      "41328",
      check(
        "check-example-main",
        sum(integer("70003"), { kind: "negate", operand: integer("28675") }),
        integer("41328"),
        {
          mode: "integer-operation",
          operation: "subtract",
          operands: [integer("70003"), integer("28675")],
        }
      )
    ),
    transfer: task(
      "transfer-main",
      "500000-178946",
      "321054",
      check(
        "check-transfer-main",
        sum(integer("500000"), { kind: "negate", operand: integer("178946") }),
        integer("321054"),
        {
          mode: "integer-operation",
          operation: "subtract",
          operands: [integer("500000"), integer("178946")],
        }
      )
    ),
  },
  {
    skillId: "M5-ZO-007",
    curriculumSkillHash:
      "b590eff69963687d5fb3ad515335ed4c6512c87c4aafb97dfd0c04d93dbfff4f",
    learningObjective: "Natürliche Zahlen schriftlich multiplizieren",
    prerequisiteSkillIds: ["M5-ZO-005"],
    priorKnowledge: ["Einmaleins und Stellenwerte sicher verwenden"],
    misconception: "Teilprodukte werden nicht stellenrichtig versetzt.",
    conceptIds: ["multiplication", "partial-product"],
    modelVisual: "place-value-chart",
    practiceVisual: "formula",
    example: task(
      "example-main",
      "324\\cdot57",
      "18468",
      check(
        "check-example-main",
        product(integer("324"), integer("57")),
        integer("18468"),
        {
          mode: "integer-operation",
          operation: "multiply",
          operands: [integer("324"), integer("57")],
        }
      )
    ),
    transfer: task(
      "transfer-main",
      "1206\\cdot43",
      "51858",
      check(
        "check-transfer-main",
        product(integer("1206"), integer("43")),
        integer("51858"),
        {
          mode: "integer-operation",
          operation: "multiply",
          operands: [integer("1206"), integer("43")],
        }
      )
    ),
  },
  {
    skillId: "M5-ZO-008",
    curriculumSkillHash:
      "60d470710c65d92a71da6648fed5e2b9297b439584717ca9d1f9b86d8eed3110",
    learningObjective: "Natürliche Zahlen schriftlich dividieren",
    prerequisiteSkillIds: ["M5-ZO-006", "M5-ZO-007"],
    priorKnowledge: ["Multiplikation als Umkehroperation nutzen"],
    misconception: "Der Rest wird als weitere Quotientenziffer notiert.",
    conceptIds: ["division", "remainder"],
    modelVisual: "formula",
    practiceVisual: "place-value-chart",
    example: task(
      "example-main",
      "9876:24",
      "(411;12)",
      check(
        "check-example-main",
        tuple(integer("9876"), integer("24")),
        tuple(integer("411"), integer("12")),
        {
          mode: "integer-operation",
          operation: "divide",
          operands: [integer("9876"), integer("24")],
        }
      )
    ),
    transfer: task(
      "transfer-main",
      "15025:32",
      "(469;17)",
      check(
        "check-transfer-main",
        tuple(integer("15025"), integer("32")),
        tuple(integer("469"), integer("17")),
        {
          mode: "integer-operation",
          operation: "divide",
          operands: [integer("15025"), integer("32")],
        }
      )
    ),
  },
  {
    skillId: "M5-ZO-009",
    curriculumSkillHash:
      "afb2aef830be3ac0c11dc28e22fc12866e6fb138ebbc7e68583ff0998b5c4a58",
    learningObjective: "Punkt-vor-Strich und Klammern anwenden",
    prerequisiteSkillIds: ["M5-ZO-005", "M5-ZO-007"],
    priorKnowledge: ["Grundrechenarten und Klammern unterscheiden"],
    misconception:
      "Operationen werden immer nur von links nach rechts ausgeführt.",
    conceptIds: ["operator-precedence", "parentheses"],
    modelVisual: "formula",
    practiceVisual: "formula",
    example: task(
      "example-main",
      "18+6\\cdot4",
      "42",
      check(
        "check-example-main",
        sum(integer("18"), product(integer("6"), integer("4"))),
        integer("42"),
        {
          mode: "order-of-operations",
          sourceExpression: sum(
            integer("18"),
            product(integer("6"), integer("4"))
          ),
        }
      )
    ),
    transfer: task(
      "transfer-main",
      "(18+6)\\cdot4",
      "96",
      check(
        "check-transfer-main",
        product(sum(integer("18"), integer("6")), integer("4")),
        integer("96"),
        {
          mode: "order-of-operations",
          sourceExpression: product(
            sum(integer("18"), integer("6")),
            integer("4")
          ),
        }
      )
    ),
  },
  {
    skillId: "M5-ZO-010",
    curriculumSkillHash:
      "4f422de4d61983e8f6aed799ea3ab3a87ec33c0a1e9eff981cbc083410d9d773",
    learningObjective: "Rechengesetze zum vorteilhaften Rechnen nutzen",
    prerequisiteSkillIds: ["M5-ZO-005", "M5-ZO-007", "M5-ZO-009"],
    priorKnowledge: ["Klammern und Grundrechenarten sicher auswerten"],
    misconception:
      "Ein Rechengesetz wird angewendet, obwohl sich der Termwert ändert.",
    conceptIds: ["arithmetic-law", "distributive-law"],
    modelVisual: "formula",
    practiceVisual: "formula",
    example: task(
      "example-main",
      "25\\cdot(16+4)=25\\cdot16+25\\cdot4",
      "500=500",
      check(
        "check-example-main",
        relation(
          "eq",
          product(integer("25"), sum(integer("16"), integer("4"))),
          sum(
            product(integer("25"), integer("16")),
            product(integer("25"), integer("4"))
          )
        ),
        relation(
          "eq",
          product(integer("25"), sum(integer("16"), integer("4"))),
          sum(
            product(integer("25"), integer("16")),
            product(integer("25"), integer("4"))
          )
        ),
        {
          mode: "arithmetic-law",
          law: "distributive",
          operands: [integer("25"), integer("16"), integer("4")],
        }
      )
    ),
    transfer: task(
      "transfer-main",
      "48\\cdot125=125\\cdot48",
      "6000=6000",
      check(
        "check-transfer-main",
        relation(
          "eq",
          product(integer("48"), integer("125")),
          product(integer("125"), integer("48"))
        ),
        relation(
          "eq",
          product(integer("48"), integer("125")),
          product(integer("125"), integer("48"))
        ),
        {
          mode: "arithmetic-law",
          law: "commutative-multiply",
          operands: [integer("48"), integer("125")],
        }
      )
    ),
  },
  {
    skillId: "M5-ZO-011",
    curriculumSkillHash:
      "5069a4151c6483b48c38178d7c9cdcd572c86364a46352156c1c86e706205da1",
    learningObjective: "Rechenterme aus Texten aufstellen",
    prerequisiteSkillIds: ["M5-ZO-009"],
    priorKnowledge: ["Operationswörter eindeutig Rechenarten zuordnen"],
    misconception:
      "Die sprachliche Reihenfolge wird ungeprüft als Rechenreihenfolge übernommen.",
    conceptIds: ["expression", "wording"],
    modelVisual: "formula",
    practiceVisual: "formula",
    example: task(
      "example-main",
      "(12+8)\\cdot5",
      "100",
      check(
        "check-example-main",
        product(sum(integer("12"), integer("8")), integer("5")),
        integer("100"),
        {
          mode: "text-expression",
          template: "add-then-multiply",
          values: [integer("12"), integer("8"), integer("5")],
          interpretationCount: 1,
        }
      )
    ),
    transfer: task(
      "transfer-main",
      "7\\cdot9+11",
      "74",
      check(
        "check-transfer-main",
        sum(product(integer("7"), integer("9")), integer("11")),
        integer("74"),
        {
          mode: "text-expression",
          template: "multiply-then-add",
          values: [integer("7"), integer("9"), integer("11")],
          interpretationCount: 1,
        }
      )
    ),
  },
  {
    skillId: "M5-ZO-012",
    curriculumSkillHash:
      "fc828c303223d6fdf6f4c91435c4ab7606198e317607c324fac73e2a0462eeda",
    learningObjective: "Einfache Termwerte durch Einsetzen berechnen",
    prerequisiteSkillIds: ["M5-ZO-011"],
    priorKnowledge: [
      "Variablen als Platzhalter lesen",
      "Punkt-vor-Strich anwenden",
    ],
    misconception:
      "Der eingesetzte Wert ersetzt nur ein beliebig ausgewähltes Vorkommen.",
    conceptIds: ["substitution", "variable"],
    modelVisual: "formula",
    practiceVisual: "data-table",
    example: task(
      "example-main",
      "3\\cdot x+7\\;\\text{für}\\;x=12",
      "43",
      check(
        "check-example-main",
        sum(product(integer("3"), symbol("x")), integer("7")),
        integer("43"),
        {
          mode: "substitution",
          sourceExpression: sum(
            product(integer("3"), symbol("x")),
            integer("7")
          ),
          variable: "x",
          value: integer("12"),
        }
      )
    ),
    transfer: task(
      "transfer-main",
      "5\\cdot x+4\\;\\text{für}\\;x=20",
      "104",
      check(
        "check-transfer-main",
        sum(product(integer("5"), symbol("x")), integer("4")),
        integer("104"),
        {
          mode: "substitution",
          sourceExpression: sum(
            product(integer("5"), symbol("x")),
            integer("4")
          ),
          variable: "x",
          value: integer("20"),
        }
      )
    ),
  },
  {
    skillId: "M5-ZO-013",
    curriculumSkillHash:
      "cb271bd0e77bf91e08fe0aa1713e9c21037c6c8e0cba7bf69b0231ef71e25d43",
    learningObjective: "Teiler und Vielfache bestimmen",
    prerequisiteSkillIds: ["M5-ZO-007", "M5-ZO-008"],
    priorKnowledge: [
      "Multiplikation und Division als Umkehroperationen nutzen",
    ],
    misconception: "Teiler und Vielfache werden vertauscht.",
    conceptIds: ["divisor", "multiple"],
    modelVisual: "number-line",
    practiceVisual: "formula",
    example: task(
      "example-main",
      "(36;6)",
      "1",
      check(
        "check-example-main",
        tuple(integer("36"), integer("6")),
        integer("1"),
        {
          mode: "divisibility",
          dividend: integer("36"),
          divisor: integer("6"),
          allowedDivisors: [integer("6"), integer("8")],
        }
      )
    ),
    transfer: task(
      "transfer-main",
      "(42;8)",
      "0",
      check(
        "check-transfer-main",
        tuple(integer("42"), integer("8")),
        integer("0"),
        {
          mode: "divisibility",
          dividend: integer("42"),
          divisor: integer("8"),
          allowedDivisors: [integer("6"), integer("8")],
        }
      )
    ),
  },
  {
    skillId: "M5-ZO-014",
    curriculumSkillHash:
      "e2b277a961a2e71a558993d26740cd5da7e8be1c6000cb880e9b5ac850eda897",
    learningObjective: "Teilbarkeitsregeln für 2, 5 und 10 anwenden",
    prerequisiteSkillIds: ["M5-ZO-013"],
    priorKnowledge: ["Endziffer und Teilbarkeit unterscheiden"],
    misconception:
      "Eine passende Ziffer irgendwo in der Zahl wird statt der Endziffer geprüft.",
    conceptIds: ["divisibility", "final-digit"],
    modelVisual: "place-value-chart",
    practiceVisual: "formula",
    example: task(
      "example-main",
      "(3470;10)",
      "1",
      check(
        "check-example-main",
        tuple(integer("3470"), integer("10")),
        integer("1"),
        {
          mode: "divisibility",
          dividend: integer("3470"),
          divisor: integer("10"),
          allowedDivisors: [integer("2"), integer("5"), integer("10")],
        }
      )
    ),
    transfer: task(
      "transfer-main",
      "(9135;2)",
      "0",
      check(
        "check-transfer-main",
        tuple(integer("9135"), integer("2")),
        integer("0"),
        {
          mode: "divisibility",
          dividend: integer("9135"),
          divisor: integer("2"),
          allowedDivisors: [integer("2"), integer("5"), integer("10")],
        }
      )
    ),
  },
  {
    skillId: "M5-ZO-015",
    curriculumSkillHash:
      "c09040dc6d80d073007db38bd67ce4eed36785edf4988d339c36e19dc027368d",
    learningObjective: "Teilbarkeitsregeln für 3 und 9 anwenden",
    prerequisiteSkillIds: ["M5-ZO-013"],
    priorKnowledge: [
      "Ziffernsummen bilden",
      "Teilbarkeit als Restfreiheit deuten",
    ],
    misconception: "Die Zahl selbst wird statt ihrer Ziffernsumme geprüft.",
    conceptIds: ["digit-sum", "divisibility"],
    modelVisual: "place-value-chart",
    practiceVisual: "formula",
    example: task(
      "example-main",
      "(729;9)",
      "1",
      check(
        "check-example-main",
        tuple(integer("729"), integer("9")),
        integer("1"),
        {
          mode: "divisibility",
          dividend: integer("729"),
          divisor: integer("9"),
          allowedDivisors: [integer("3"), integer("9")],
        }
      )
    ),
    transfer: task(
      "transfer-main",
      "(1246;3)",
      "0",
      check(
        "check-transfer-main",
        tuple(integer("1246"), integer("3")),
        integer("0"),
        {
          mode: "divisibility",
          dividend: integer("1246"),
          divisor: integer("3"),
          allowedDivisors: [integer("3"), integer("9")],
        }
      )
    ),
  },
  {
    skillId: "M5-ZO-016",
    curriculumSkillHash:
      "424c048f1c44515f72aec85c919b09e856f57dd64c95c220b48bdfb8765a7003",
    learningObjective: "Potenzen als verkürzte Multiplikation verstehen",
    prerequisiteSkillIds: ["M5-ZO-007", "M5-ZO-009"],
    priorKnowledge: ["Wiederholte Multiplikation erkennen"],
    misconception: "Basis und Exponent werden miteinander multipliziert.",
    conceptIds: ["power", "exponent"],
    modelVisual: "formula",
    practiceVisual: "formula",
    example: task(
      "example-main",
      "4^3",
      "64",
      check(
        "check-example-main",
        power(integer("4"), integer("3")),
        integer("64"),
        {
          mode: "power",
          base: integer("4"),
          exponent: integer("3"),
        }
      )
    ),
    transfer: task(
      "transfer-main",
      "10^5",
      "100000",
      check(
        "check-transfer-main",
        power(integer("10"), integer("5")),
        integer("100000"),
        {
          mode: "power",
          base: integer("10"),
          exponent: integer("5"),
        }
      )
    ),
  },
] as const;

const sceneFunctions = [
  "hook",
  "objective",
  "model",
  "worked-example",
  "mistake",
  "guided-practice",
  "think-pause",
  "solution",
  "recap",
] as const;
const scenePurposes = [
  "Vorwissen aktivieren und die Leitfrage öffnen.",
  "Das überprüfbare Lernziel transparent machen.",
  "Die mathematische Darstellung am geprüften Beispiel modellieren.",
  "Den Lösungsweg in fachlich geordneter Folge erklären.",
  "Die Fehlvorstellung sichtbar machen und fachlich korrigieren.",
  "Das Verfahren auf die Transferaufgabe anwenden.",
  "Eine eigenständige Entscheidung mit Denkzeit einfordern.",
  "Die geprüfte Transferlösung auflösen und begründen.",
  "Verfahren, Prüfung und Ergebnis knapp sichern.",
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
        {
          stepId: `step-${definition.taskId}-model`,
          explanation:
            "Ordne die Angaben der passenden mathematischen Darstellung zu.",
          factId: sourceFactId,
        },
        {
          stepId: `step-${definition.taskId}-result`,
          explanation:
            "Leite das Ergebnis her und prüfe es am Ausgangsausdruck.",
          factId: answerFactId,
        },
      ],
      solutionFactId: answerFactId,
    },
    facts: [
      {
        factId: sourceFactId,
        semantic: {
          kind: "scalar" as const,
          expression: definition.check.sourceExpression,
        },
        displayLatex: definition.sourceDisplay,
        checkIds: [definition.check.checkId],
        lineage: {
          contentContractVersion: LESSON_CONTENT_CONTRACT_VERSION,
          sourceContentHash: sourceHash,
          sourceTaskId: definition.taskId,
        },
      },
      {
        factId: answerFactId,
        semantic: {
          kind: "scalar" as const,
          expression: definition.check.expression,
        },
        displayLatex: definition.answerDisplay,
        checkIds: [definition.check.checkId],
        lineage: {
          contentContractVersion: LESSON_CONTENT_CONTRACT_VERSION,
          sourceContentHash: sourceHash,
          sourceTaskId: definition.taskId,
        },
      },
    ],
  };
}

function buildSpecification(
  definition: ContentDefinition
): ProductionLessonContent {
  const exampleHash = canonicalHash(definition.example);
  const transferHash = canonicalHash(definition.transfer);
  const example = buildTask(definition.example, exampleHash);
  const transfer = buildTask(definition.transfer, transferHash);
  const sceneFacts = [
    [],
    [],
    [`${definition.example.taskId}-source`],
    [
      `${definition.example.taskId}-source`,
      `${definition.example.taskId}-answer`,
    ],
    [`${definition.example.taskId}-answer`],
    [`${definition.transfer.taskId}-source`],
    [`${definition.transfer.taskId}-source`],
    [`${definition.transfer.taskId}-answer`],
    [
      `${definition.example.taskId}-answer`,
      `${definition.transfer.taskId}-answer`,
    ],
  ];
  const draft = {
    artifactVersion: "number-operations-lesson-content.v1" as const,
    contractVersion: LESSON_CONTENT_CONTRACT_VERSION,
    contentVersion: NUMBER_OPERATIONS_CONTENT_VERSION,
    locale: "de-DE" as const,
    skillId: definition.skillId,
    variant: "standard" as const,
    learningObjective: definition.learningObjective,
    prerequisiteSkillIds: [...definition.prerequisiteSkillIds],
    prerequisiteReviewStatus: "proposed-unreviewed" as const,
    priorKnowledge: [...definition.priorKnowledge],
    misconceptions: [
      {
        misconceptionId: "misconception-main",
        description: definition.misconception,
        correctionFactId: `${definition.example.taskId}-answer`,
      },
    ],
    conceptIds: definition.conceptIds,
    promise: "Selbstständig anwenden, exakt prüfen und begründen",
    targetAudience: "Lernende der Regelanforderungen in Klasse fünf",
    modelVisual: definition.modelVisual,
    practiceVisual: definition.practiceVisual,
    workedExamples: [example.task],
    transferTask: transfer.task,
    formativeChecks: [
      {
        formativeCheckId: "formative-example",
        prompt: `Erkläre den geprüften Übergang von [[fact:${definition.example.taskId}-source]] zu [[fact:${definition.example.taskId}-answer]].`,
        factIds: [
          `${definition.example.taskId}-source`,
          `${definition.example.taskId}-answer`,
        ],
        verifierCheckId: definition.example.check.checkId,
        answerFactId: `${definition.example.taskId}-answer`,
      },
      {
        formativeCheckId: "formative-transfer",
        prompt: `Löse [[fact:${definition.transfer.taskId}-source]] und vergleiche mit dem gesicherten Ergebnis.`,
        factIds: [`${definition.transfer.taskId}-source`],
        verifierCheckId: definition.transfer.check.checkId,
        answerFactId: `${definition.transfer.taskId}-answer`,
      },
    ],
    answerKey: [example.task, transfer.task].map((item) => ({
      taskId: item.exampleId,
      sourceTaskHash:
        item.exampleId === definition.example.taskId
          ? exampleHash
          : transferHash,
      solutionFactId: item.solutionFactId,
      orderedStepIds: item.steps.map((step) => step.stepId),
    })),
    facts: [...example.facts, ...transfer.facts],
    checks: [definition.example.check, definition.transfer.check],
    scenes: sceneFunctions.map((sceneFunction, index) => ({
      sceneId: `scene-${String(index + 1).padStart(3, "0")}`,
      sceneFunction,
      purpose: scenePurposes[index]!,
      factIds: sceneFacts[index]!,
      processCompetencies: index === 2 || index === 5 ? (["REP"] as const) : [],
      visualComponent:
        index === 2
          ? definition.modelVisual
          : index === 5
            ? definition.practiceVisual
            : index === 6
              ? ("teacher" as const)
              : ("formula" as const),
      plannedDurationSeconds: sceneDurations[index]!,
    })),
    expectedDurationSeconds: 240 as const,
    sourceIdentity: {
      curriculumReleaseId: "de-gems-5-10-v1" as const,
      curriculumVersion: "1.0.0-draft.1" as const,
      curriculumReleaseHash:
        "9afb5e2c0ed7a10628df7f5d1d589739995910900d66b5b479894a3a95360b31" as const,
      curriculumSkillHash: definition.curriculumSkillHash,
      sourceIds: ["kmk-2022-math"],
      sourceSection:
        "normalized synthesis; exact source mapping pending external review",
      sourceReviewStatus: "pending" as const,
    },
    reviewStatus: "pending-external-review" as const,
  };
  return productionLessonContentSchema.parse({
    ...draft,
    contentHash: canonicalHash(draft),
  });
}

const specifications = definitions.map(buildSpecification);
const specificationsBySkill = new Map(
  specifications.map((specification) => [specification.skillId, specification])
);

export const NUMBER_OPERATIONS_STANDARD_SKILL_IDS = Object.freeze(
  specifications.map((specification) => specification.skillId)
);

export function loadNumberOperationsStandardContent(
  skill: CurriculumSkill
): ProductionLessonContent | null {
  const specification = specificationsBySkill.get(skill.skillId);
  if (!specification) return null;
  if (
    canonicalHash(skill) !== specification.sourceIdentity.curriculumSkillHash ||
    skill.learningObjective !== specification.learningObjective
  )
    throw new Error(
      `Lesson content is bound to a stale curriculum identity for ${skill.skillId}.`
    );
  return productionLessonContentSchema.parse(structuredClone(specification));
}

export function loadAllNumberOperationsStandardContent(): ProductionLessonContent[] {
  return specifications.map((specification) =>
    productionLessonContentSchema.parse(structuredClone(specification))
  );
}

export function numberOperationsConceptIds(
  skillId: string
): readonly [string, string] | null {
  return specificationsBySkill.get(skillId)?.conceptIds ?? null;
}
