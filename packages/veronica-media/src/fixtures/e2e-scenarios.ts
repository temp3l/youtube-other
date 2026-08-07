import {
  createFixturePdf,
  createFixturePng,
  createFixturePptx,
  createFixtureSvg,
  VERONICA_PILOT_NARRATION,
} from "./pilot.js";

export const VERONICA_E2E_SCENARIO_VERSION = "veronica-media.e2e-scenarios.v1" as const;

export interface VeronicaE2eScenario {
  readonly scenarioId: string;
  readonly description: string;
  readonly narration: {
    readonly original: string;
    readonly revised: string;
  };
  readonly supplementalFiles: readonly {
    readonly assetId: string;
    readonly filename: string;
    readonly bytes: Uint8Array;
    readonly declaredMimeType: string;
  }[];
  readonly targetLanguage: string;
  readonly overrides?: Readonly<
    Record<
      string,
      {
        readonly requirement?: "required" | "preferred" | "optional";
        readonly candidateId?: string;
      }
    >
  >;
  readonly expectations: {
    readonly landscapeAspectRatio: "16:9";
    readonly portraitAspectRatio: "9:16";
    readonly requiresApprovalReview: boolean;
    readonly allowsFallback: boolean;
    readonly includesTranslatedVisibleText: boolean;
    readonly includesDenseSlide: boolean;
    readonly includesRepeatedSourceAsset: boolean;
    readonly includesExplicitOverride: boolean;
  };
}

export const VERONICA_E2E_SCENARIOS: readonly VeronicaE2eScenario[] = [
  {
    scenarioId: "narration-pdf-pptx-image",
    description: "Baseline narration with PDF, PPTX, and image sources.",
    narration: VERONICA_PILOT_NARRATION,
    supplementalFiles: [
      {
        assetId: "deck",
        filename: "deck.pptx",
        bytes: createFixturePptx(3),
        declaredMimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      },
      {
        assetId: "handout",
        filename: "handout.pdf",
        bytes: createFixturePdf(2),
        declaredMimeType: "application/pdf",
      },
      {
        assetId: "chart",
        filename: "chart.png",
        bytes: createFixturePng("chart"),
        declaredMimeType: "image/png",
      },
    ],
    targetLanguage: "it",
    expectations: {
      landscapeAspectRatio: "16:9",
      portraitAspectRatio: "9:16",
      requiresApprovalReview: true,
      allowsFallback: true,
      includesTranslatedVisibleText: false,
      includesDenseSlide: false,
      includesRepeatedSourceAsset: false,
      includesExplicitOverride: false,
    },
  },
  {
    scenarioId: "translated-visible-text",
    description: "SVG overlay with translated visible text for portrait adaptation.",
    narration: {
      original: "Benvenuti. La slide mostra il percorso di reinvenzione.",
      revised: "Welcome. The slide shows the reinvention path.",
    },
    supplementalFiles: [
      {
        assetId: "translated-diagram",
        filename: "framework.svg",
        bytes: createFixtureSvg("Percorso di reinvenzione / Reinvention path"),
        declaredMimeType: "image/svg+xml",
      },
      {
        assetId: "portrait-photo",
        filename: "portrait.png",
        bytes: createFixturePng("portrait"),
        declaredMimeType: "image/png",
      },
    ],
    targetLanguage: "en",
    expectations: {
      landscapeAspectRatio: "16:9",
      portraitAspectRatio: "9:16",
      requiresApprovalReview: true,
      allowsFallback: true,
      includesTranslatedVisibleText: true,
      includesDenseSlide: false,
      includesRepeatedSourceAsset: false,
      includesExplicitOverride: false,
    },
  },
  {
    scenarioId: "dense-slide",
    description: "Dense multi-slide PPTX deck exercises page-raster extraction.",
    narration: VERONICA_PILOT_NARRATION,
    supplementalFiles: [
      {
        assetId: "dense-deck",
        filename: "dense-deck.pptx",
        bytes: createFixturePptx(8),
        declaredMimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      },
    ],
    targetLanguage: "it",
    expectations: {
      landscapeAspectRatio: "16:9",
      portraitAspectRatio: "9:16",
      requiresApprovalReview: true,
      allowsFallback: false,
      includesTranslatedVisibleText: false,
      includesDenseSlide: true,
      includesRepeatedSourceAsset: false,
      includesExplicitOverride: false,
    },
  },
  {
    scenarioId: "repeated-source-asset",
    description: "The same PNG asset appears twice to validate deduplicated planning.",
    narration: VERONICA_PILOT_NARRATION,
    supplementalFiles: [
      {
        assetId: "shared-chart-a",
        filename: "chart-a.png",
        bytes: createFixturePng("shared-chart"),
        declaredMimeType: "image/png",
      },
      {
        assetId: "shared-chart-b",
        filename: "chart-b.png",
        bytes: createFixturePng("shared-chart"),
        declaredMimeType: "image/png",
      },
    ],
    targetLanguage: "it",
    expectations: {
      landscapeAspectRatio: "16:9",
      portraitAspectRatio: "9:16",
      requiresApprovalReview: true,
      allowsFallback: true,
      includesTranslatedVisibleText: false,
      includesDenseSlide: false,
      includesRepeatedSourceAsset: true,
      includesExplicitOverride: false,
    },
  },
  {
    scenarioId: "explicit-override",
    description: "Operator override pins a specific extracted candidate.",
    narration: VERONICA_PILOT_NARRATION,
    supplementalFiles: [
      {
        assetId: "override-deck",
        filename: "override-deck.pptx",
        bytes: createFixturePptx(4),
        declaredMimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      },
    ],
    targetLanguage: "it",
    overrides: {
      "override-deck": { requirement: "required", candidateId: "override-deck-slide-2" },
    },
    expectations: {
      landscapeAspectRatio: "16:9",
      portraitAspectRatio: "9:16",
      requiresApprovalReview: true,
      allowsFallback: false,
      includesTranslatedVisibleText: false,
      includesDenseSlide: false,
      includesRepeatedSourceAsset: false,
      includesExplicitOverride: true,
    },
  },
  {
    scenarioId: "fallback-case",
    description: "Optional placement may defer to narration-only fallback card.",
    narration: VERONICA_PILOT_NARRATION,
    supplementalFiles: [
      {
        assetId: "optional-chart",
        filename: "optional.png",
        bytes: createFixturePng("optional"),
        declaredMimeType: "image/png",
      },
    ],
    targetLanguage: "it",
    overrides: {
      "optional-chart": { requirement: "optional" },
    },
    expectations: {
      landscapeAspectRatio: "16:9",
      portraitAspectRatio: "9:16",
      requiresApprovalReview: true,
      allowsFallback: true,
      includesTranslatedVisibleText: false,
      includesDenseSlide: false,
      includesRepeatedSourceAsset: false,
      includesExplicitOverride: false,
    },
  },
  {
    scenarioId: "approval-required",
    description: "Mixed sensitive sources require editorial approval before render.",
    narration: VERONICA_PILOT_NARRATION,
    supplementalFiles: [
      {
        assetId: "approval-deck",
        filename: "approval-deck.pptx",
        bytes: createFixturePptx(2),
        declaredMimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      },
      {
        assetId: "approval-handout",
        filename: "approval-handout.pdf",
        bytes: createFixturePdf(3),
        declaredMimeType: "application/pdf",
      },
    ],
    targetLanguage: "it",
    expectations: {
      landscapeAspectRatio: "16:9",
      portraitAspectRatio: "9:16",
      requiresApprovalReview: true,
      allowsFallback: true,
      includesTranslatedVisibleText: false,
      includesDenseSlide: false,
      includesRepeatedSourceAsset: false,
      includesExplicitOverride: false,
    },
  },
] as const;

export function listVeronicaE2eScenarioIds(): readonly string[] {
  return VERONICA_E2E_SCENARIOS.map((scenario) => scenario.scenarioId);
}
