export interface HistoryPurposeV32 { readonly id: string; readonly editorialFunction: string; readonly subject: string; readonly evidence: string; readonly changeOrUncertainty: string; readonly supportingClaimIds: readonly string[]; }
export interface HistoryEditorialMetricsV32 { readonly exactDuplicateRate: number; readonly prefixConcentration: number; readonly cosineClusterRate: number; readonly repeatedFunctionSubjectRate: number; readonly dominantCameraShare: number; readonly dominantTransitionShare: number; }
export interface HistoryEditorialDiagnosticV32 { readonly code: string; readonly severity: "warning" | "error"; readonly affectedIds: readonly string[]; }
const words = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/u).filter(Boolean);
const share = (items: readonly string[]) => items.length ? Math.max(...[...new Set(items)].map((item) => items.filter((value) => value === item).length)) / items.length : 0;
const cosine = (left: readonly string[], right: readonly string[]) => { const a = new Set(left), b = new Set(right); return [...a].filter((v) => b.has(v)).length / Math.sqrt(Math.max(1, a.size) * Math.max(1, b.size)); };
export function assessHistoryEditorialV32(input: { readonly purposes: readonly HistoryPurposeV32[]; readonly cameras: readonly string[]; readonly transitions: readonly string[] }): { metrics: HistoryEditorialMetricsV32; diagnostics: HistoryEditorialDiagnosticV32[] } {
  const texts = input.purposes.map((value) => `${value.subject} ${value.editorialFunction} ${value.evidence} ${value.changeOrUncertainty}`.trim());
  const normalized = texts.map((value) => words(value).join(" "));
  const exactDuplicateRate = normalized.length ? (normalized.length - new Set(normalized).size) / normalized.length : 0;
  const prefixConcentration = share(normalized.map((value) => words(value).slice(0, 5).join(" ")));
  const clustered = normalized.filter((value, index) => normalized.some((other, otherIndex) => index !== otherIndex && cosine(words(value), words(other)) >= 0.78));
  const cosineClusterRate = normalized.length ? clustered.length / normalized.length : 0;
  const repeatedFunctionSubjectRate = share(input.purposes.map((value) => `${value.editorialFunction}:${value.subject.toLocaleLowerCase()}`));
  const metrics = { exactDuplicateRate, prefixConcentration, cosineClusterRate, repeatedFunctionSubjectRate, dominantCameraShare: share(input.cameras), dominantTransitionShare: share(input.transitions) };
  const diagnostics: HistoryEditorialDiagnosticV32[] = [];
  const add = (code: string, rate: number, warning: number, block: number) => { if (rate > warning) diagnostics.push({ code, severity: rate > block ? "error" : "warning", affectedIds: input.purposes.map((value) => value.id) }); };
  add("EDITORIAL_EXACT_PURPOSE_DUPLICATION", exactDuplicateRate, 0.05, 0.15);
  add("EDITORIAL_PREFIX_CONCENTRATION", prefixConcentration, 0.1, 0.2);
  add("EDITORIAL_COSINE_CLUSTER", cosineClusterRate, 0.15, 0.3);
  add("EDITORIAL_CAMERA_DOMINANCE", metrics.dominantCameraShare, 0.2, 0.35);
  add("EDITORIAL_TRANSITION_DOMINANCE", metrics.dominantTransitionShare, 0.2, 0.35);
  return { metrics, diagnostics };
}
