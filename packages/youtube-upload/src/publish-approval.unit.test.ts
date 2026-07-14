import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  approvePublishDryRun,
  assertCurrentPublishApproval,
  createPublishDryRunEvidence,
} from "./publish-approval.js";

async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "publish-approval-"));
  const video = path.join(root, "video.mp4");
  const thumbnail = path.join(root, "thumbnail.png");
  const metadata = path.join(root, "metadata.json");
  await Promise.all([
    fs.writeFile(video, "video"),
    fs.writeFile(thumbnail, "thumbnail"),
    fs.writeFile(metadata, '{"title":"Current"}'),
  ]);
  const input = {
    identity: { contentId: "episode-1", locale: "en", variant: "full" },
    target: { channelId: "channel-1", accountId: "account-1" },
    artifacts: [
      { kind: "render", revision: "render-r1", path: video },
      { kind: "thumbnail", revision: "thumbnail-r1", path: thumbnail },
    ],
    metadata: { revision: "metadata-r1", path: metadata },
    request: { privacy: "private", playlists: ["playlist-1"] },
  } as const;
  return { input, metadata };
}

describe("publish approval", () => {
  it("is deterministic and binds the complete dry-run evidence", async () => {
    const { input } = await setup();
    const first = await createPublishDryRunEvidence(input);
    const second = await createPublishDryRunEvidence(input);
    expect(second).toEqual(first);
    const approval = approvePublishDryRun({
      evidence: first,
      actor: "reviewer@example.test",
      approvedAt: "2026-07-14T12:00:00.000Z",
    });
    expect(
      assertCurrentPublishApproval({ evidence: second, approval })
    ).toEqual(approval);
  });

  it("rejects absent, stale, target-mismatched, and changed metadata approval", async () => {
    const { input, metadata } = await setup();
    const evidence = await createPublishDryRunEvidence(input);
    const approval = approvePublishDryRun({
      evidence,
      actor: "reviewer@example.test",
      approvedAt: "2026-07-14T12:00:00.000Z",
    });
    expect(() =>
      assertCurrentPublishApproval({ evidence, approval: undefined })
    ).toThrow(/current attributable/u);

    const wrongTarget = await createPublishDryRunEvidence({
      ...input,
      target: { ...input.target, channelId: "channel-2" },
    });
    expect(() =>
      assertCurrentPublishApproval({ evidence: wrongTarget, approval })
    ).toThrow(/stale|does not match/u);

    const wrongLocale = await createPublishDryRunEvidence({
      ...input,
      identity: { ...input.identity, locale: "de" },
    });
    expect(() =>
      assertCurrentPublishApproval({ evidence: wrongLocale, approval })
    ).toThrow(/stale|does not match/u);

    const wrongVariant = await createPublishDryRunEvidence({
      ...input,
      identity: { ...input.identity, variant: "short" },
    });
    expect(() =>
      assertCurrentPublishApproval({ evidence: wrongVariant, approval })
    ).toThrow(/stale|does not match/u);

    await fs.writeFile(metadata, '{"title":"Changed"}');
    const changed = await createPublishDryRunEvidence(input);
    expect(() =>
      assertCurrentPublishApproval({ evidence: changed, approval })
    ).toThrow(/stale|does not match/u);
  });
});
