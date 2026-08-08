/** Pre-registered page ownership slots for later YSAAS frontend tasks. */
export const SAAS_PAGE_MODULES = [
  { id: "portfolio", owner: "YSAAS-017", routePrefix: "/projects" },
  { id: "episode-workspace", owner: "YSAAS-017", routePrefix: "/projects/:project/episodes/:episode" },
  { id: "workflow-run", owner: "YSAAS-017", routePrefix: "/projects/:project/workflow-runs/:run" },
  { id: "configuration", owner: "YSAAS-018", routePrefix: "/settings" },
  { id: "developer", owner: "YSAAS-020", routePrefix: "/developer" },
  { id: "publishing", owner: "YSAAS-021", routePrefix: "/publishing" },
  { id: "onboarding", owner: "YSAAS-022", routePrefix: "/onboarding" },
] as const;

export const SAAS_GATEWAY_MODULE_OWNERSHIP = {
  platform: ["YSAAS-010", "YSAAS-020"],
  content: ["YSAAS-005", "YSAAS-017"],
  workflow: ["YSAAS-005", "YSAAS-017"],
  artifact: ["YSAAS-006", "YSAAS-017"],
  review: ["YSAAS-007", "YSAAS-017"],
} as const;
