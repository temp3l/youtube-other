export interface HistoryRouteV32 {
  readonly id: string;
  readonly origin: { readonly id: string; readonly label: string; readonly coordinates?: readonly [number, number] };
  readonly destination: { readonly id: string; readonly label: string; readonly coordinates?: readonly [number, number] };
  readonly routeType: "maritime" | "overland" | "military" | "disease-transmission";
  readonly label: string;
  readonly movingActorId?: string;
  readonly carrierId?: string;
  readonly pathogenId?: string;
  readonly supportingClaimIds: readonly string[];
}
export interface HistoryGeoDiagnosticV32 { readonly code: string; readonly severity: "error" | "warning"; readonly message: string; readonly affectedIds: readonly string[]; }

export function validateHistoryRoutesV32(routes: readonly HistoryRouteV32[]): HistoryGeoDiagnosticV32[] {
  const diagnostics: HistoryGeoDiagnosticV32[] = [];
  for (const route of routes) {
    const issue = (code: string, message: string) => diagnostics.push({ code, severity: "error", message, affectedIds: [route.id] });
    if (route.origin.id === route.destination.id) issue("MAP_IDENTITY_ROUTE", "A route must have distinct origin and destination.");
    if (!route.origin.coordinates || !route.destination.coordinates) issue("MAP_ENDPOINT_UNRENDERABLE", "Map endpoints require explicit renderable coordinates.");
    if (!route.supportingClaimIds.length) issue("MAP_MOVEMENT_CLAIM_MISSING", "A movement route requires a supporting claim.");
    if (route.routeType === "maritime" && /overland|road|land route/iu.test(route.label)) issue("MAP_ROUTE_LABEL_CONTRADICTION", "A maritime route cannot carry an overland label.");
    if (route.routeType === "overland" && /maritime|sea route|ship/iu.test(route.label)) issue("MAP_ROUTE_LABEL_CONTRADICTION", "An overland route cannot carry a maritime label.");
    if (route.pathogenId && route.movingActorId === route.pathogenId) issue("MAP_PATHOGEN_ROLE_CONFLICT", "A pathogen is a transmitted condition, not the moving actor or carrier.");
  }
  return diagnostics;
}

export function selectHistoryDiagramFallbackV32(input: { readonly hasVerifiedDiagramEvidence: boolean; readonly hasMap: boolean; readonly hasTimeline: boolean; readonly hasQuotation: boolean }): "diagram" | "map" | "timeline" | "quotation" | "archival-evidence" | "no-diagram" {
  if (input.hasVerifiedDiagramEvidence) return "diagram";
  if (input.hasMap) return "map";
  if (input.hasTimeline) return "timeline";
  if (input.hasQuotation) return "quotation";
  return "archival-evidence";
}
