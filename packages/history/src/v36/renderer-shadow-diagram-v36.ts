import type { DiagramIntentV36 } from "./compiler-shadow-contract-v36.js";
import {
  HISTORY_RENDERER_SHADOW_SCHEMA_V36,
  HISTORY_RENDERER_SHADOW_VERSION_V36,
  renderSpecIdV36,
  type DiagramRenderSpecV36,
  type RenderEdgeV36,
  type RenderPointV36,
  type RendererRuleV36,
} from "./renderer-shadow-contract-v36.js";

const WIDTH = 1200 as const;
const HEIGHT = 675 as const;

function rule(intent: DiagramIntentV36): RendererRuleV36 {
  return `diagram-${intent.relationKind}-svg.v1`;
}

function refId(label: string, index: number): string {
  return `node-${index}-${label.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/gu, "-")}`;
}

export function adaptDiagramIntentToRenderSpecV36(
  intent: DiagramIntentV36
): DiagramRenderSpecV36 {
  let labels: readonly string[];
  let roles: readonly string[];
  let statuses: readonly (string | undefined)[];
  let edgeType: string | undefined;
  let edgeLabel: string | undefined;
  let legend: readonly string[];
  switch (intent.relationKind) {
    case "causal":
      labels = [intent.cause.canonicalLabel, intent.effect.canonicalLabel];
      roles = ["cause", "effect"];
      statuses = [undefined, intent.causalAssertionStatus];
      edgeType = "causes";
      edgeLabel = `causal · ${intent.causalAssertionStatus}`;
      legend = [`cause → effect`, `assertion: ${intent.causalAssertionStatus}`];
      break;
    case "dependency":
      labels = [intent.dependency.canonicalLabel, intent.dependent.canonicalLabel];
      roles = ["dependency", "dependent"];
      statuses = [];
      edgeType = "depends-on-requirement";
      edgeLabel = "requires · not causality";
      legend = ["dependency → dependent", "not causality"];
      break;
    case "process":
      labels = intent.steps.map((step) => step.canonicalLabel);
      roles = labels.map((_, index) => `process-step-${index + 1}`);
      statuses = [];
      edgeType = "process-order-not-causality";
      edgeLabel = "next process step";
      legend = [intent.orderSemantics];
      break;
    case "temporal-sequence":
      labels = intent.steps.map((step) => step.canonicalLabel);
      roles = labels.map((_, index) => `chronology-${index + 1}`);
      statuses = [];
      edgeType = "chronology-not-causality";
      edgeLabel = "then · not cause";
      legend = [intent.orderSemantics];
      break;
    case "policy-response":
      labels = [intent.condition.canonicalLabel, intent.response.canonicalLabel];
      roles = ["condition", "response"];
      statuses = [
        intent.conditionAssertionStatus,
        intent.responseAssertionStatus,
      ];
      edgeType = "policy-response";
      edgeLabel = "response to condition";
      legend = [
        `condition: ${intent.conditionAssertionStatus}`,
        `response: ${intent.responseAssertionStatus}`,
        intent.provenance.proof
          ? "proof-backed"
          : "proof: not supplied",
      ];
      break;
    case "evidence-set":
      labels = [
        ...(intent.subject ? [intent.subject.canonicalLabel] : []),
        ...intent.evidence.map((member) => member.canonicalLabel),
      ];
      roles = [
        ...(intent.subject ? ["evidence-subject"] : []),
        ...intent.evidence.map(() => "unordered-evidence-member"),
      ];
      statuses = [];
      edgeType = undefined;
      edgeLabel = undefined;
      legend = ["unordered evidence set", "no semantic member edges"];
      break;
  }
  const points: RenderPointV36[] = labels.map((label, index) => {
    const isEvidence = intent.relationKind === "evidence-set";
    const columns = isEvidence ? Math.min(3, labels.length) : labels.length;
    const row = isEvidence ? Math.floor(index / columns) : 0;
    const column = isEvidence ? index % columns : index;
    return {
      id: refId(label, index),
      label,
      x: isEvidence
        ? 170 + column * (860 / Math.max(columns - 1, 1))
        : 150 + column * (900 / Math.max(labels.length - 1, 1)),
      y: isEvidence ? 240 + row * 190 : 340,
      role: roles[index]!,
      ...(statuses[index] ? { status: statuses[index] } : {}),
    };
  });
  const edges: readonly RenderEdgeV36[] = edgeType
    ? points.slice(1).map((point, index) => ({
        from: points[index]!.id,
        to: point.id,
        semanticType: edgeType,
        directed: true,
        ...(edgeLabel ? { label: edgeLabel } : {}),
      }))
    : [];
  return {
    schemaVersion: HISTORY_RENDERER_SHADOW_SCHEMA_V36,
    rendererVersion: HISTORY_RENDERER_SHADOW_VERSION_V36,
    disposition: "RENDER_SPEC",
    renderSpecId: renderSpecIdV36({
      compilerIntentId: intent.compilerIntentId,
      semanticPayload: intent,
    }),
    compilerIntentId: intent.compilerIntentId,
    relationId: intent.relationId,
    relationKind: intent.relationKind,
    episodeId: intent.episodeId,
    rendererRule: rule(intent),
    shadowOnly: true,
    provenance: intent.provenance,
    width: WIDTH,
    height: HEIGHT,
    renderTarget: "DIAGRAM_SVG",
    semanticPayload: intent,
    points,
    edges,
    legend,
  };
}

function escape(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function wrap(value: string, max = 28): readonly string[] {
  const words = value.split(/\s+/u);
  const lines: string[] = [];
  for (const word of words) {
    const last = lines.at(-1);
    if (!last || `${last} ${word}`.length > max) lines.push(word);
    else lines[lines.length - 1] = `${last} ${word}`;
  }
  return lines.slice(0, 3);
}

export function renderDiagramSpecSvgV36(spec: DiagramRenderSpecV36): string {
  const byId = new Map(spec.points.map((point) => [point.id, point]));
  const evidence = spec.relationKind === "evidence-set";
  const edges = spec.edges
    .map((edge) => {
      const from = byId.get(edge.from)!;
      const to = byId.get(edge.to)!;
      const color = edge.semanticType === "causes" ? "#9e3f35" : "#315f6b";
      const labelX = (from.x + to.x) / 2;
      return `<g><line x1="${from.x + 125}" y1="${from.y}" x2="${to.x - 125}" y2="${to.y}" stroke="${color}" stroke-width="4" marker-end="url(#arrow)"/><text x="${labelX}" y="${from.y - 24}" text-anchor="middle" font-size="17" font-family="system-ui,sans-serif" fill="#4c443b">${escape(edge.label ?? edge.semanticType)}</text></g>`;
    })
    .join("");
  const points = spec.points
    .map((point) => {
      const lines = wrap(point.label);
      return `<g><rect x="${point.x - 125}" y="${point.y - 62}" width="250" height="124" rx="14" fill="#fffdf7" stroke="#244f5a" stroke-width="3"/><text x="${point.x}" y="${point.y - (lines.length - 1) * 13}" text-anchor="middle" font-size="21" font-family="system-ui,sans-serif" fill="#17130f">${lines.map((line, index) => `<tspan x="${point.x}" dy="${index === 0 ? 0 : 27}">${escape(line)}</tspan>`).join("")}</text><text x="${point.x}" y="${point.y + 48}" text-anchor="middle" font-size="15" font-family="system-ui,sans-serif" fill="#766b5e">${escape(point.status ? `${point.role} · ${point.status}` : point.role)}</text></g>`;
    })
    .join("");
  const legend = spec.legend.map(escape).join(" · ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}" viewBox="0 0 ${spec.width} ${spec.height}"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#315f6b"/></marker></defs><rect width="100%" height="100%" fill="#f4f1e8"/>${evidence ? '<rect x="55" y="145" width="1090" height="450" rx="18" fill="#e7eadc" stroke="#778066" stroke-width="3" stroke-dasharray="10 8"/>' : ""}<rect x="28" y="22" width="1144" height="58" rx="8" fill="#17130f"/><text x="48" y="58" font-size="22" font-family="system-ui,sans-serif" fill="#f4f1e8">${escape(spec.relationKind)} · ${legend}</text>${edges}${points}</svg>\n`;
}
