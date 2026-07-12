# Domänenmodell

## Kernentitäten

```ts
type Grade = 5 | 6 | 7 | 8 | 9 | 10;
type LessonVariant = 'foundation' | 'standard' | 'challenge';
type Language = 'de' | 'en' | 'es' | 'fr' | 'pt';

interface CurriculumSource {
  id: string;
  jurisdiction: string;
  title: string;
  version: string;
  effectiveFrom?: string;
  status: 'current' | 'phasing_in' | 'phasing_out' | 'superseded' | 'unverified';
  officialUrl: string;
  contentHash?: string;
}

interface CurriculumSkill {
  id: string;
  canonicalGrade: Grade;
  domain: string;
  topic: string;
  skill: string;
  placementConfidence: 'high' | 'medium' | 'low';
  sourceMappings: SourceMapping[];
  prerequisites: string[];
}

interface LessonSpecification {
  id: string;
  skillId: string;
  variant: LessonVariant;
  learningObjective: string;
  promise: string;
  mathematicalSpecification: MathematicalSpecification;
  workedExamples: WorkedExample[];
  commonMistake?: CommonMistake;
  challenge: WorkedExample;
  scenes: VisualScene[];
  targetDurationSeconds: number;
}
```

## Exakte Werte

Zahlen dürfen nicht nur als lokalisierte Strings gespeichert werden.

```ts
type ExactValue =
  | { kind: 'integer'; value: string }
  | { kind: 'rational'; numerator: string; denominator: string }
  | { kind: 'decimal'; value: string }
  | { kind: 'algebraic'; expressionAst: ExpressionNode }
  | { kind: 'measurement'; value: ExactValue; unit: string };
```

Jeder Rechenschritt benötigt eine AST-Repräsentation, einen erwarteten Wert und einen
unabhängigen Verifikationsstatus.
