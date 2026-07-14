i have run a really big refactoring after the audit was created, i assume many items are already obsolete or have changed, write a prompt to todo-prompts/math in order to refresh the audit and create new tasks in order to finish the implementation

› are all tasks finished from: docs/mathe/audits/

• No.

The current audit state under docs/mathe/audits/remediation-backlog.md is still incomplete, and the main audit verdict is still FAIL in docs/mathe/audits/post-implementation-verification.md.

What is clearly true from the latest reports:

- A-001 looks implemented, but its report still says “proceed to A-002 only after A-001 acceptance” in docs/reports/codex-runs/2026-07-13-a001-packaged-cli.md.
- A-002 has an acceptance recommendation for the tested Linux platform in docs/reports/codex-runs/2026-07-13-a002-offline-sympy.md.
- A-003 is explicitly still blocked in docs/reports/codex-runs/2026-07-13-a003-review-packet.md.
- A-008 is explicitly “not release-accepted” in docs/reports/codex-runs/2026-07-13-a008-release-gates.md.
- A-009 cannot be considered done because the backlog requires A-001 through A-008 first, and the audit says “Complete A-001 through A-008 … then execute A-009” in docs/mathe/audits/post-implementation-verification.md:266.

So the shortest accurate answer is: some remediation work has been done, but the audit backlog is not fully finished or fully accepted.

---

• For class 5, the math pipeline would produce the grade-5 skills in curriculum seedOrder from packages/math-education/data/curriculum/v1/skills.json, and the batch planner preserves the order of the skills it is given in
packages/math-education/src/orchestration/batch-planner.ts. The prerequisite/DAG logic also uses seedOrder as the stable tie-breaker in packages/math-education/src/curriculum/dag.ts:116.

In order, class 5 is:

1. M5-ZO-001 Natürliche Zahlen im Stellenwertsystem lesen und schreiben
2. M5-ZO-002 Natürliche Zahlen vergleichen und ordnen
3. M5-ZO-003 Natürliche Zahlen sinnvoll runden
4. M5-ZO-004 Rechenergebnisse überschlagen und mit einer Probe prüfen
5. M5-ZO-005 Natürliche Zahlen schriftlich addieren
6. M5-ZO-006 Natürliche Zahlen schriftlich subtrahieren
7. M5-ZO-007 Natürliche Zahlen schriftlich multiplizieren
8. M5-ZO-008 Natürliche Zahlen schriftlich dividieren
9. M5-ZO-009 Punkt-vor-Strich und Klammern anwenden
10. M5-ZO-010 Rechengesetze zum vorteilhaften Rechnen nutzen
11. M5-ZO-011 Rechenterme aus Texten aufstellen
12. M5-ZO-012 Einfache Termwerte durch Einsetzen berechnen
13. M5-ZO-013 Teiler und Vielfache bestimmen
14. M5-ZO-014 Teilbarkeitsregeln für 2, 5 und 10 anwenden
15. M5-ZO-015 Teilbarkeitsregeln für 3 und 9 anwenden
16. M5-ZO-016 Potenzen als verkürzte Multiplikation verstehen
17. M5-ZO-017 Brüche als Anteil eines Ganzen verstehen
18. M5-ZO-018 Zähler, Nenner und Bruchstrich sicher verwenden
19. M5-ZO-019 Brüche auf dem Zahlenstrahl darstellen
20. M5-ZO-020 Gleichwertige Brüche erkennen
21. M5-ZO-021 Brüche erweitern
22. M5-ZO-022 Brüche kürzen
23. M5-ZO-023 Dezimalzahlen lesen und im Stellenwertsystem darstellen
24. M5-ZO-024 Dezimalzahlen vergleichen und ordnen
25. M5-GM-001 Längen-, Massen-, Zeit- und Geldeinheiten umrechnen
26. M5-GM-002 Umfang von Rechteck und Quadrat berechnen
27. M5-GM-003 Flächeninhalt von Rechteck und Quadrat berechnen
28. M5-GM-004 Punkt, Strecke, Gerade, parallel und senkrecht unterscheiden
29. M5-GM-005 Winkelarten erkennen und benennen
30. M5-GM-006 Winkel messen und zeichnen
31. M5-GM-007 Dreiecke und Vierecke klassifizieren
32. M5-GM-008 Achsensymmetrische Figuren erkennen und ergänzen
33. M5-GM-009 Würfel- und Quadernetze erkennen
34. M5-GM-010 Volumen mit Einheitswürfeln bestimmen
35. M5-GM-011 Volumen eines Quaders berechnen
36. M5-DS-001 Daten in Ur- und Strichlisten erfassen
37. M5-DS-002 Säulen- und Balkendiagramme lesen und erstellen

If you want, I can also turn that into the exact pnpm mediaforge math ... command input for class 5.
