import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ARTIFACT_SCHEMA_VERSION,
  type ArtifactRef,
} from "@mediaforge/domain";
import { describe, expect, it } from "vitest";

import {
  DARK_TRUTH_QUALITY_DIMENSIONS,
  assessReferenceReadiness,
  assessStoryBibleReadiness,
  buildDarkTruthQualityAssessment,
  darkTruthHardFailures,
  evaluateDarkTruthProductionGates,
  type DarkTruthHardFailureEvidence,
  type DarkTruthQualityDimension,
} from "./profile-quality.js";
import {
  bibleDocumentKinds,
  diffStoryBibles,
  referenceImageManifestSchema,
  storyBibleManifestSchema,
  type ReferenceImageManifest,
  type StoryBibleManifest,
} from "./profile-contracts.js";
import {
  DarkTruthProfileStore,
  importLegacyCharacterReferenceDraft,
  inspectDarkTruthMigrationStatus,
} from "./profile-store.js";
import { runDarkTruthDeterministicFixture } from "./profile-fixture.js";
import { createDarkTruthFingerprintMaterial } from "./profile-bindings.js";
import { createDarkTruthTaskRegistrations } from "./task-registry.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const NOW = "2026-07-14T10:00:00.000Z";
const FUTURE = "2027-07-14T10:00:00.000Z";

function approval(revision: string, contentHash = HASH_A) {
  return {
    decision: "approved" as const,
    actor: "operator@example.test",
    reason: "Reviewed against the Dark Truth profile.",
    createdAt: NOW,
    expiresAt: FUTURE,
    boundRevision: revision,
    contentHash,
  };
}

function storyBible(revision = "bible-r1"): StoryBibleManifest {
  return storyBibleManifestSchema.parse({
    schemaVersion: "darktruth.story-bible.v1",
    profileId: "dark-truth",
    episodeId: "001-fixture",
    revision,
    profileRevision: "profile-r1",
    workflowRevision: "workflow-r1",
    contentHash: HASH_A,
    createdAt: NOW,
    updatedAt: NOW,
    identityPolicy: {
      identity: "Restrained dark documentary",
      audience: "Adults seeking atmospheric supernatural stories",
      tone: ["restrained", "escalating"],
      themes: ["costly curiosity"],
      bannedCliches: ["it was all a dream"],
      bannedPhrases: ["little did he know"],
      supernaturalRulePolicy: "One clear rule with causal consequences.",
      characterRules: ["At most three central characters."],
      escalationRules: ["Escalate through sensory evidence."],
      endingRules: ["End with a memorable image or line."],
      thumbnailPolicy: "One focal subject and one threat.",
      audioPolicy: "Adult male narrator at 175-185 WPM.",
      localizationPolicy: "Preserve facts and pronunciation.",
      continuityPolicy: "Bind exact reference identities.",
      safetyBoundaries: ["Minors require explicit approval."],
    },
    episode: {
      title: "The Bell Below",
      logline: "A surveyor hears a bell beneath a sealed island bunker.",
      premise: "The bell answers only when someone lies about why they came.",
      protagonist: {
        id: "mara",
        name: "Mara Voss",
        role: "surveyor",
        motivation: "Prove the island is safe for her estranged brother.",
        appearance: "Weathered green coat and cropped dark hair.",
        continuityTraits: ["green coat", "brass compass"],
        isMinor: false,
      },
      supportingCharacters: [],
      threat: {
        id: "the-bell",
        name: "The Bell",
        nature: "An unseen listener beneath the bunker.",
        motivation: "Compel truthful sacrifice.",
        continuityTraits: ["wet iron resonance"],
      },
      location: {
        id: "island-bunker",
        name: "North Shoal Bunker",
        sensoryIdentity: ["salt mist", "wet concrete"],
        continuityTraits: ["red flood door"],
      },
      timeline: ["dusk arrival", "midnight descent", "dawn consequence"],
      supernaturalRule: "The bell rings after a lie and takes one true memory.",
      motivations: ["Mara wants reconciliation without admitting fault."],
      emotionalCost: "Mara must surrender her last memory of her mother.",
      revealStructure: ["sound", "rule evidence", "personal consequence"],
      escalationLadder: ["distant ring", "answered lie", "memory loss"],
      keyVisuals: ["Mara facing the red flood door"],
      ending: "Her brother recognizes her, but she no longer knows his name.",
      continuityConstraints: ["Mara keeps the green coat and brass compass."],
      requiredReferences: ["ref-protagonist"],
      prohibitedDeviations: ["Never show the bell itself."],
      pronunciation: { Mara: "MAH-rah" },
      adaptationNotes: {
        en: ["Keep the final line terse."],
        de: ["Preserve formal survey terminology."],
        es: ["Retain restrained register."],
        fr: ["Retain restrained register."],
        pt: ["Retain restrained register."],
      },
    },
    documents: bibleDocumentKinds.map((kind) => ({
      kind,
      revision: `${kind}-r1`,
      contentHash: HASH_A,
      relativePath: `bibles/${kind}.json`,
      lineage: [
        {
          revision: `${kind}-r1`,
          contentHash: HASH_A,
          source: "deterministic-fixture",
          createdAt: NOW,
        },
      ],
      approval: approval(`${kind}-r1`),
    })),
    approval: approval(revision),
  });
}

function references(
  bibleRevision = "bible-r1"
): ReferenceImageManifest {
  return referenceImageManifestSchema.parse({
    schemaVersion: "darktruth.reference-manifest.v1",
    id: "references-r1",
    episodeId: "001-fixture",
    profileId: "dark-truth",
    revision: "references-r1",
    bibleRevision,
    workflowRevision: "workflow-r1",
    requiredCoverage: {
      full: ["protagonist"],
      short: ["protagonist", "short-specific-set"],
    },
    entries: [
      {
        id: "ref-protagonist",
        role: "protagonist",
        classification: "canonical",
        relativePath: "shared/images/character-references/mara.png",
        checksumSha256: HASH_A,
        width: 1024,
        height: 1536,
        aspectRatio: "2:3",
        subjectIdentity: "mara",
        continuityIdentity: "green-coat-brass-compass",
        promptVersion: "prompt-r1",
        promptHash: HASH_B,
        approval: approval("ref-protagonist"),
      },
      {
        id: "ref-short-set",
        role: "short-specific-set",
        classification: "canonical",
        relativePath: "shared/short/images/references/mara.png",
        checksumSha256: HASH_A,
        width: 1024,
        height: 1536,
        aspectRatio: "2:3",
        subjectIdentity: "mara",
        continuityIdentity: "green-coat-brass-compass",
        promptVersion: "prompt-r1",
        promptHash: HASH_B,
        approval: approval("ref-short-set"),
      },
    ],
    usageBindings: [
      {
        taskId: "darktruth.scene-images",
        variant: "full",
        sceneId: "scene-001",
        referenceIds: ["ref-protagonist"],
      },
    ],
    validation: { status: "passed", checkedAt: NOW, issues: [] },
    continuity: { status: "passed", checkedAt: NOW, issues: [] },
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function passingEvidence(): DarkTruthHardFailureEvidence {
  return {
    supernaturalRuleClear: true,
    bibleConsistent: true,
    templateRepetitionAbsent: true,
    characterIdentityConsistent: true,
    emotionalCostPresent: true,
    endingBehaviorCausal: true,
    referenceSetPresent: true,
    referenceSetApproved: true,
    visualContinuityPassed: true,
    evidence: ["deterministic fixture evidence"],
  };
}

describe("Dark Truth bible and reference contracts", () => {
  it("requires every bible layer and complete episode-bible fields", () => {
    const complete = storyBible();
    expect(assessStoryBibleReadiness(complete, new Date(NOW)).ready).toBe(true);
    expect(
      storyBibleManifestSchema.safeParse({
        ...complete,
        documents: complete.documents.slice(1),
      }).success
    ).toBe(false);
    expect(
      storyBibleManifestSchema.safeParse({
        ...complete,
        episode: { ...complete.episode, emotionalCost: "" },
      }).success
    ).toBe(false);
  });

  it("diffs exact bible revisions and explains stale bindings", () => {
    const before = storyBible();
    const changed = storyBible("bible-r2");
    const after = storyBibleManifestSchema.parse({
      ...changed,
      episode: { ...changed.episode, ending: "A changed final image." },
      approval: approval("bible-r2"),
    });
    expect(diffStoryBibles(before, after)).toMatchObject({
      fromRevision: "bible-r1",
      toRevision: "bible-r2",
      episodeChanged: true,
    });
    expect(
      assessReferenceReadiness({
        bible: after,
        references: references("bible-r1"),
        variant: "full",
        taskId: "darktruth.scene-images",
        now: new Date(NOW),
      })
    ).toMatchObject({
      ready: false,
      hardFailureCodes: expect.arrayContaining([
        "DARKTRUTH_BIBLE_CONTRADICTION",
      ]),
    });
  });

  it("enforces full/Short coverage, approval, integrity, and scoped overrides", () => {
    const bible = storyBible();
    const manifest = references();
    expect(
      assessReferenceReadiness({
        bible,
        references: manifest,
        variant: "short",
        taskId: "darktruth.scene-images",
        verifiedChecksums: {
          "ref-protagonist": HASH_A,
          "ref-short-set": HASH_A,
        },
        now: new Date(NOW),
      }).ready
    ).toBe(true);

    const broken = referenceImageManifestSchema.parse({
      ...manifest,
      entries: manifest.entries.map((entry) =>
        entry.id === "ref-protagonist"
          ? { ...entry, approval: undefined }
          : entry
      ),
    });
    const blocked = assessReferenceReadiness({
      bible,
      references: broken,
      variant: "full",
      taskId: "darktruth.scene-images",
      verifiedChecksums: { "ref-protagonist": HASH_B },
      now: new Date(NOW),
    });
    expect(blocked.hardFailureCodes).toEqual(
      expect.arrayContaining([
        "DARKTRUTH_REFERENCE_SET_UNAPPROVED",
        "ARTIFACT_INVALID",
      ])
    );
    expect(
      assessReferenceReadiness({
        bible,
        references: broken,
        variant: "full",
        taskId: "darktruth.scene-images",
        now: new Date(NOW),
        override: {
          actor: "operator@example.test",
          reason: "One-scene emergency review with explicit evidence.",
          taskIds: ["darktruth.scene-images"],
          createdAt: NOW,
          expiresAt: FUTURE,
          boundBibleRevision: bible.revision,
          boundReferenceRevision: broken.revision,
        },
      }).overrideApplied
    ).toBe(true);
  });

  it("persists revisions, invalidates only dependants, and reports legacy migration", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "darktruth-profile-"));
    const store = new DarkTruthProfileStore(root);
    await store.writeStoryBible(storyBible());
    const updated = await store.writeStoryBible(storyBible("bible-r2"));
    expect(updated.invalidatedTaskIds).toContain("darktruth.rewrite-full");
    expect(updated.invalidatedTaskIds).not.toContain("darktruth.concept-select");

    const initial = references("bible-r2");
    await store.writeReferences(initial);
    const replacement = referenceImageManifestSchema.parse({
      ...initial,
      revision: "references-r2",
      entries: initial.entries.map((entry) =>
        entry.id === "ref-protagonist"
          ? {
              ...entry,
              id: "ref-protagonist-r2",
              replacesReferenceId: "ref-protagonist",
              approval: approval("ref-protagonist-r2"),
            }
          : entry
      ),
      usageBindings: initial.usageBindings.map((binding) => ({
        ...binding,
        referenceIds: ["ref-protagonist-r2"],
      })),
    });
    const replaced = await store.writeReferences(replacement);
    expect(replaced.invalidatedTaskIds).toEqual(
      expect.arrayContaining([
        "darktruth.scene-images",
        "darktruth.render",
        "darktruth.publish-dry-run",
      ])
    );
    expect(replaced.invalidatedTaskIds).not.toContain("darktruth.rewrite-full");

    const legacyRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "darktruth-legacy-")
    );
    await fs.mkdir(path.join(legacyRoot, "shared"), { recursive: true });
    await fs.writeFile(
      path.join(legacyRoot, "shared", "characters.json"),
      JSON.stringify({
        characters: [{ id: "mara", referenceStatus: "approved" }],
      })
    );
    const status = await inspectDarkTruthMigrationStatus(
      legacyRoot,
      () => new Date(NOW)
    );
    expect(status).toMatchObject({
      status: "migration-required",
      legacyApprovedReferenceCount: 1,
      blockers: [
        "DARKTRUTH_STORY_BIBLE_MISSING",
        "DARKTRUTH_REFERENCE_SET_MISSING",
      ],
    });
    expect(status.actions.join(" ")).toContain("Import 1 approved legacy");
  });

  it("imports legacy references as review-required evidence without fabricating approval", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "darktruth-import-"));
    const imagePath = path.join(root, "shared", "references", "mara.svg");
    await fs.mkdir(path.dirname(imagePath), { recursive: true });
    await fs.writeFile(
      imagePath,
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="black"/></svg>'
    );
    await fs.writeFile(
      path.join(root, "shared", "characters.json"),
      JSON.stringify({
        characters: [
          {
            id: "mara",
            name: "Mara Voss",
            continuityTraits: ["green coat", "brass compass"],
            referenceImagePath: "shared/references/mara.svg",
            referenceStatus: "approved",
          },
        ],
      })
    );
    const imported = await importLegacyCharacterReferenceDraft({
      unitRoot: root,
      bible: storyBible(),
      now: new Date(NOW),
    });
    expect(imported.entries).toHaveLength(1);
    expect(imported.entries[0]).toMatchObject({
      id: "ref-mara",
      role: "protagonist",
      classification: "canonical",
    });
    expect(imported.entries[0]?.approval).toBeUndefined();
    expect(imported.validation.status).toBe("pending");
  });
});

describe("Dark Truth quality and release gates", () => {
  it.each([
    ["supernaturalRuleClear", "DARKTRUTH_SUPERNATURAL_RULE_UNCLEAR"],
    ["bibleConsistent", "DARKTRUTH_BIBLE_CONTRADICTION"],
    ["templateRepetitionAbsent", "DARKTRUTH_TEMPLATE_REPETITION"],
    ["characterIdentityConsistent", "DARKTRUTH_CHARACTER_IDENTITY_INCONSISTENT"],
    ["emotionalCostPresent", "DARKTRUTH_EMOTIONAL_COST_MISSING"],
    ["endingBehaviorCausal", "DARKTRUTH_ARBITRARY_ENDING_BEHAVIOR"],
    ["referenceSetPresent", "DARKTRUTH_REFERENCE_SET_MISSING"],
    ["referenceSetApproved", "DARKTRUTH_REFERENCE_SET_UNAPPROVED"],
    ["visualContinuityPassed", "DARKTRUTH_VISUAL_CONTINUITY_FAILED"],
  ] as const)("emits hard failure %s", (key, code) => {
    const input = { ...passingEvidence(), [key]: false };
    expect(darkTruthHardFailures(input).map((failure) => failure.code)).toEqual([
      code,
    ]);
  });

  it("applies weighted thresholds without letting aggregate score clear hard failures", () => {
    expect(
      DARK_TRUTH_QUALITY_DIMENSIONS.reduce((sum, [, weight]) => sum + weight, 0)
    ).toBe(100);
    const artifact: ArtifactRef = {
      schemaVersion: ARTIFACT_SCHEMA_VERSION,
      unitId: "001-fixture" as ArtifactRef["unitId"],
      profileId: "dark-truth",
      locale: "en",
      variant: "full",
      kind: "full-script",
      artifactRevision: "script-r1",
      workflowRevision: "workflow-r1",
      policyRevision: "profile-r1",
    };
    const scores = Object.fromEntries(
      DARK_TRUTH_QUALITY_DIMENSIONS.map(([dimension]) => [dimension, 90])
    ) as Record<DarkTruthQualityDimension, number>;
    expect(
      buildDarkTruthQualityAssessment({
        artifact,
        scores,
        evidence: passingEvidence(),
        assessedAt: NOW,
      }).status
    ).toBe("READY");
    expect(
      buildDarkTruthQualityAssessment({
        artifact,
        scores,
        evidence: { ...passingEvidence(), referenceSetApproved: false },
        assessedAt: NOW,
      }).status
    ).toBe("BLOCKED");
  });

  it("blocks localization, media, metadata, and stale publish approval independently", () => {
    const gates = evaluateDarkTruthProductionGates(
      {
        localization: {
          fidelityPassed: true,
          nativeCharactersPassed: true,
          pronunciationPassed: false,
        },
        visual: {
          referencesReady: true,
          identityConsistent: true,
          continuityPassed: true,
        },
        thumbnail: {
          safe: true,
          compositionPassed: true,
          textPassed: true,
          identityConsistent: true,
        },
        audio: {
          streamValid: true,
          durationValid: true,
          pronunciationPassed: true,
          continuityPassed: true,
        },
        captions: { valid: true, timingPassed: true },
        audiovisual: {
          streamsValid: true,
          timingPassed: true,
          continuityPassed: true,
        },
        metadata: {
          titleValid: true,
          descriptionValid: true,
          policyPassed: true,
        },
        publish: {
          dryRunPassed: true,
          artifactHash: HASH_A,
          approval: {
            decision: "approved",
            artifactHash: HASH_B,
            boundRevision: "workflow-r0",
            currentRevision: "workflow-r1",
            expiresAt: "2026-01-01T00:00:00.000Z",
          },
        },
      },
      new Date(NOW)
    );
    expect(gates.find((gate) => gate.gate === "localization")?.status).toBe(
      "blocked"
    );
    expect(gates.find((gate) => gate.gate === "audio")?.status).toBe("passed");
    expect(gates.find((gate) => gate.gate === "publish")?.reasons).toHaveLength(
      3
    );
  });
});

describe("Dark Truth deterministic acceptance fixture", () => {
  it("binds exact bible/reference revisions and blocks downstream readiness", () => {
    const bible = storyBible();
    const referenceSet = references();
    const material = createDarkTruthFingerprintMaterial({
      bible,
      references: referenceSet,
    });
    expect(material["darktruth.rewrite-full"]).toMatchObject({
      bibleRevision: bible.revision,
      profile: { profileRevision: bible.profileRevision },
    });
    expect(material["darktruth.scene-images"]).toMatchObject({
      bibleRevision: bible.revision,
      referenceSetRevision: referenceSet.revision,
    });
    expect(material["darktruth.rewrite-full"]?.referenceSetRevision).toBeUndefined();

    const registrations = createDarkTruthTaskRegistrations({}, {
      bibleReady: false,
      bibleReasons: ["Bible approval is missing."],
      referencesReady: false,
      referenceReasons: ["Reference approval is missing."],
    });
    const rewrite = registrations.find(
      (item) => item.definition.id === "darktruth.rewrite-full"
    );
    const images = registrations.find(
      (item) => item.definition.id === "darktruth.scene-images"
    );
    const context = {
      profileId: "dark-truth" as const,
      completedTaskIds: new Set<never>(),
      availableArtifacts: [],
      approvedTaskIds: new Set<never>(),
    };
    expect(rewrite?.readiness?.(context)).toEqual([
      "Bible approval is missing.",
    ]);
    expect(images?.readiness?.(context)).toEqual([
      "Reference approval is missing.",
    ]);
  });

  it("traverses full and Short DAGs in every supported locale without providers", () => {
    const result = runDarkTruthDeterministicFixture();
    expect(result.status).toBe("passed");
    expect(result.providerCalls).toBe(0);
    expect(result.traversals).toHaveLength(10);
    expect(new Set(result.traversals.map((item) => item.locale))).toEqual(
      new Set(["en", "de", "es", "fr", "pt"])
    );
    expect(
      result.traversals
        .filter((item) => item.variant === "short")
        .every((item) => item.taskIds.includes("darktruth.quality-shorts"))
    ).toBe(true);
    expect(
      result.traversals
        .filter((item) => item.variant === "full")
        .every((item) => !item.taskIds.includes("darktruth.quality-shorts"))
    ).toBe(true);
  });
});
