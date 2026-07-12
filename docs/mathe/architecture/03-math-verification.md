# Mathematische Verifikation

## Empfehlung

Ein isolierter Python-SymPy-Worker mit versioniertem JSON-Protokoll und strikt typisiertem
TypeScript-Adapter.

Der Sprachmodell-Output ist nur eine Spezifikation. Das Sprachmodell darf nicht allein
seine eigenen Rechnungen validieren.

## Zu prüfen

- arithmetische Ergebnisse
- Äquivalenz jedes Umformungsschritts
- Bruchkürzung und Vorzeichen
- Gleichungs- und Gleichungssystemlösungen
- Einheiten und Dimensionen
- Graphpunkte, Steigung und Funktionswerte
- Flächen-, Umfangs-, Oberflächen- und Volumenformeln
- trigonometrische Beziehungen
- Wahrscheinlichkeiten, Pfadsummen und Vierfeldertafeln
- Challenge-Aufgabe und Bildschirmdarstellung

## Protokoll

```ts
interface MathVerificationResult {
  schemaVersion: 1;
  verified: boolean;
  checks: Array<{
    checkId: string;
    status: 'passed' | 'failed' | 'unsupported';
    expected?: string;
    actual?: string;
    message?: string;
  }>;
  verifierVersion: string;
  inputHash: string;
}
```

`failed` und `unsupported` blockieren die Produktion, solange die Aufgabe nicht explizit
von einem unterstützten Prüfer übernommen wurde.
