import { describe, expect, it } from "vitest";
import { type CharacterRenameMap } from "./character-rename.service.js";
import {
  buildStoryAffectRepairHistoryEntry,
  buildTargetedAffectRepairInstructions,
  repairShortBodyCanonicalNames,
  validateTargetedAffectRepairResult,
  type StoryAffectRepairLocks,
} from "./story-quality-repair.js";
import { STORY_AFFECT_ISSUE_CODES } from "./story-generation-contracts.js";
import { decideStoryAffectRepairRoute } from "./story-retry-routing.js";

describe("story quality repair", () => {
  it("repairs leaked original names using the authoritative rename map", () => {
    const renameMap: CharacterRenameMap = {
      version: 1,
      episodeId: "034",
      sourceHash: "source-hash",
      poolId: "test-pool",
      entries: [
        {
          characterId: "character-1",
          originalName: "Elena Marks",
          fictionalName: "Nora Vale",
          originalAliases: ["Elena Marks", "Elena"],
          fictionalAliases: ["Nora Vale", "Nora"],
          role: "protagonist",
        },
      ],
      hash: "0".repeat(64),
    };

    expect(
      repairShortBodyCanonicalNames(
        "Elena Marks checked the mirror. Elena saw it smile first.",
        renameMap
      )
    ).toBe("Nora Vale checked the mirror. Nora saw it smile first.");
  });

  it("Task 07 locks protected content and revalidates the complete repair contract", () => {
    const finding = {
      id: "cost-1",
      assessment: "weakness" as const,
      issueCode: STORY_AFFECT_ISSUE_CODES.LOCAL_COST_WEAKENED,
      paragraphSpans: [{ start: 3, end: 3 }],
      affectRefs: { beatIds: ["beat-003"] },
      repairScope: "beat" as const,
      modifiableBeatIds: ["beat-003"],
      protectedFacts: [
        {
          id: "fact-bell",
          statement: "Mara hears the bell after sealing the room.",
        },
      ],
    };
    const decision = decideStoryAffectRepairRoute({
      purpose: "canonical-short",
      findings: [finding],
      paragraphCount: 4,
      availableModifiableBeatIds: ["beat-003"],
      attemptNumber: 0,
      retryCap: 1,
    });
    if (decision.action !== "repair") {
      throw new Error(`Expected repair, received ${decision.action}.`);
    }
    const locks: StoryAffectRepairLocks = {
      parentHashes: {
        sourceHash: "a".repeat(64),
        storyIrHash: "b".repeat(64),
        contractHash: "c".repeat(64),
      },
      immutableFacts: [{ id: "fact-room", statement: "Mara seals the room." }],
      acceptedFinalLine: "Then the bell rang inside the wall.",
      renameMapHash: "d".repeat(64),
      unaffectedBeats: [
        { beatId: "beat-001", contentHash: "e".repeat(64) },
        { beatId: "beat-004", contentHash: "f".repeat(64) },
      ],
      selectedProjection: {
        kind: "short",
        projectionHash: "1".repeat(64),
        selectedIds: ["question-1", "beat-003", "payoff-1"],
      },
      wordBudget: { min: 155, max: 180 },
      durationBudget: { minSeconds: 50, maxSeconds: 65 },
      narrationOnly: true,
    };
    const instructions = buildTargetedAffectRepairInstructions({
      decision,
      findings: [finding],
      acceptedPlanFragments: [
        {
          beatId: "beat-003",
          instruction: "Restore the source-backed cost after Mara responds.",
        },
      ],
      locks,
    });

    expect(instructions.text).toContain("Modifiable beat IDs only: beat-003");
    expect(instructions.text).toContain(
      "Accepted final line (preserve byte-for-byte and keep last)"
    );
    expect(instructions.text).toContain(
      `Locked short projection hash: ${"1".repeat(64)}`
    );
    expect(
      validateTargetedAffectRepairResult({
        candidateNarration:
          "Mara sealed the room and lost the only recording. Then the bell rang inside the wall.",
        instructions,
        observedLocks: locks,
        applicableContractIssues: [],
      })
    ).toEqual([]);

    const changedProjection = {
      ...locks,
      selectedProjection: {
        ...locks.selectedProjection,
        projectionHash: "2".repeat(64),
      },
    };
    const validationIssues = validateTargetedAffectRepairResult({
      candidateNarration: "Mara chose another ending. The wall stayed quiet.",
      instructions,
      observedLocks: changedProjection,
      applicableContractIssues: ["Duration contract failed."],
    });
    expect(validationIssues).toEqual(
      expect.arrayContaining([
        "Duration contract failed.",
        "Accepted final line changed during targeted affect repair.",
        "Locked selected projection changed during targeted affect repair.",
      ])
    );

    const history = buildStoryAffectRepairHistoryEntry({
      attemptNumber: 1,
      instructions,
      outcome: "rejected",
      validationIssues,
    });
    expect(history).toMatchObject({
      attemptNumber: 1,
      issueIds: ["cost-1"],
      repairScope: "beat",
      affectedBeatIds: ["beat-003"],
      parentHashes: locks.parentHashes,
      outcome: "rejected",
    });
  });
});
