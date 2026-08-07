import { describe, expect, it } from "vitest";
import {
  assessMultilingualAudioCapability,
  strategicPublicationBlockedByCapability,
} from "./multilingual-audio-capability.js";

describe("multilingual audio capability", () => {
  it("reports unknown alternate-audio support without provider evidence", () => {
    const report = assessMultilingualAudioCapability({
      preferredModel: "single-video-with-reviewed-audio-tracks",
    });
    expect(report.alternateAudioTracks).toBe("unknown");
    expect(report.separatePublicVideos).toBe("unsupported");
    expect(report.notes.some((note) => note.includes("does not claim"))).toBe(true);
    expect(strategicPublicationBlockedByCapability(report)).toContain(
      "STRATEGIC_ALTERNATE_AUDIO_CAPABILITY_UNKNOWN",
    );
  });

  it("uses explicit provider evidence when available", () => {
    const supported = assessMultilingualAudioCapability({
      preferredModel: "single-video-with-reviewed-audio-tracks",
      apiEvidenceAvailable: true,
      channelReportedAlternateAudio: true,
    });
    expect(supported.alternateAudioTracks).toBe("supported");
    expect(strategicPublicationBlockedByCapability(supported)).toEqual([]);

    const unsupported = assessMultilingualAudioCapability({
      preferredModel: "single-video-with-reviewed-audio-tracks",
      apiEvidenceAvailable: true,
      channelReportedAlternateAudio: false,
    });
    expect(unsupported.alternateAudioTracks).toBe("unsupported");
    expect(strategicPublicationBlockedByCapability(unsupported)).toContain(
      "STRATEGIC_ALTERNATE_AUDIO_UNSUPPORTED",
    );
  });
});
