import { buildCropFilter } from "./crop.js";
import {
  buildBoxBlurFilter,
  buildEqFilter,
  buildFadeFilter,
  buildFormatFilter,
  buildNoiseFilter,
  buildRotateFilter,
  buildSetPtsFilter,
  buildVignetteFilter,
} from "./effects.js";
import { buildOverlayFilter } from "./overlay.js";
import { buildPadFilter, buildScaleFilter } from "./scale.js";
import { buildDrawTextFilter } from "./text.js";
import { buildCrossFadeFilter } from "./transitions.js";
import { buildZoomPanFilter } from "./zoompan.js";
import {
  FilterBuilderError,
  type FilterGraph,
  type StreamLabel,
  type VideoFilterOperation,
} from "./types.js";

const LABEL_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/u;

export function validateStreamLabel(label: StreamLabel): void {
  if (!LABEL_PATTERN.test(label)) {
    throw new FilterBuilderError({
      operationKind: "graph",
      field: "streamLabel",
      expected: "a safe label matching [A-Za-z0-9_][A-Za-z0-9_.-]{0,63}",
    });
  }
}

function labels(values: readonly StreamLabel[]): string {
  return values.map((value) => `[${value}]`).join("");
}

function expectedInputCount(operation: VideoFilterOperation): number {
  switch (operation.kind) {
    case "overlay":
    case "xfade":
      return 2;
    case "scale":
    case "crop":
    case "zoompan":
    case "boxblur":
    case "eq":
    case "noise":
    case "vignette":
    case "fade":
    case "drawtext":
    case "setpts":
    case "rotate":
    case "format":
    case "pad":
      return 1;
  }
}

export function buildFilter(operation: VideoFilterOperation): string {
  switch (operation.kind) {
    case "scale":
      return buildScaleFilter(operation);
    case "crop":
      return buildCropFilter(operation);
    case "zoompan":
      return buildZoomPanFilter(operation);
    case "overlay":
      return buildOverlayFilter(operation);
    case "boxblur":
      return buildBoxBlurFilter(operation);
    case "eq":
      return buildEqFilter(operation);
    case "noise":
      return buildNoiseFilter(operation);
    case "vignette":
      return buildVignetteFilter(operation);
    case "fade":
      return buildFadeFilter(operation);
    case "drawtext":
      return buildDrawTextFilter(operation);
    case "xfade":
      return buildCrossFadeFilter(operation);
    case "setpts":
      return buildSetPtsFilter(operation);
    case "rotate":
      return buildRotateFilter(operation);
    case "format":
      return buildFormatFilter(operation);
    case "pad":
      return buildPadFilter(operation);
  }
}

export function buildFilterChain(
  operations: readonly VideoFilterOperation[]
): string {
  return operations.map((operation) => buildFilter(operation)).join(",");
}

export function buildFilterComplex(graph: FilterGraph): string {
  const available = new Set<StreamLabel>();
  for (const inputLabel of graph.inputLabels) {
    validateStreamLabel(inputLabel);
    if (available.has(inputLabel)) {
      throw new FilterBuilderError({
        operationKind: "graph",
        field: "inputLabels",
        expected: "unique input labels",
      });
    }
    available.add(inputLabel);
  }

  const produced = new Set<StreamLabel>();
  const parts = graph.nodes.map((node) => {
    const expectedInputs = expectedInputCount(node.operation);
    if (node.inputLabels.length !== expectedInputs) {
      throw new FilterBuilderError({
        operationKind: node.operation.kind,
        field: "inputLabels",
        expected: `${expectedInputs} input label${expectedInputs === 1 ? "" : "s"}`,
      });
    }
    for (const inputLabel of node.inputLabels) {
      validateStreamLabel(inputLabel);
      if (!available.has(inputLabel)) {
        throw new FilterBuilderError({
          operationKind: node.operation.kind,
          field: "inputLabels",
          expected: `label ${inputLabel} to be declared or produced earlier`,
        });
      }
    }
    validateStreamLabel(node.outputLabel);
    if (available.has(node.outputLabel) || produced.has(node.outputLabel)) {
      throw new FilterBuilderError({
        operationKind: node.operation.kind,
        field: "outputLabel",
        expected: "a unique output label",
      });
    }
    produced.add(node.outputLabel);
    available.add(node.outputLabel);
    return `${labels(node.inputLabels)}${buildFilter(node.operation)}[${node.outputLabel}]`;
  });

  if (graph.outputLabels !== undefined) {
    for (const outputLabel of graph.outputLabels) {
      validateStreamLabel(outputLabel);
      if (!available.has(outputLabel)) {
        throw new FilterBuilderError({
          operationKind: "graph",
          field: "outputLabels",
          expected: `label ${outputLabel} to be produced or declared`,
        });
      }
    }
  }

  return parts.join(";");
}
