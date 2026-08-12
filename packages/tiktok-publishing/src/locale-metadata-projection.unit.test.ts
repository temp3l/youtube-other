import { describe, expect, it } from "vitest";

import {
  TIKTOK_METADATA_BCP47_LOCALES,
  TikTokMetadataPolicyViolationError,
  deriveTikTokDisclosureDeclarations,
  projectTikTokMetadataRevision,
  validateTikTokMetadataPolicy,
} from "@mediaforge/domain";
import { projectTikTokLocaleMetadataBundle } from "./locale-metadata-projection.js";

const createdAt = "2026-08-12T12:00:00.000Z";
const episodeId = "episode.e001";
const episodeRevisionId = "rev.episode.e001.v3";
const metadataProfileVersion = 2;

const localeEditorialFixtures = {
  "en-US": {
    captionBody:
      "She saw the message seven minutes before it happened. #SevenMinutesAhead",
    hashtags: ["#SevenMinutesAhead", "#Microdrama", "#SciFi"],
    coverText: "Seven minutes",
  },
  "de-DE": {
    captionBody:
      "Sie sah die Nachricht sieben Minuten bevor es passierte. #SiebenMinutenVoraus",
    hashtags: ["#SiebenMinutenVoraus", "#Microdrama", "#SciFi"],
    coverText: "Sieben Minuten",
  },
  "es-ES": {
    captionBody:
      "Vio el mensaje siete minutos antes de que ocurriera. #SieteMinutosAntes",
    hashtags: ["#SieteMinutosAntes", "#Microdrama", "#CienciaFiccion"],
    coverText: "Siete minutos",
  },
  "pt-BR": {
    captionBody:
      "Ela viu a mensagem sete minutos antes de acontecer. #SeteMinutosAntes",
    hashtags: ["#SeteMinutosAntes", "#Microdrama", "#FiccaoCientifica"],
    coverText: "Sete minutos",
  },
} as const;

const providerPolicy = {
  privacy: "private" as const,
  interactionSettings: {
    allowComments: false,
    allowDuet: false,
    allowStitch: false,
  },
};

const mediaProvenance = {
  syntheticVoiceUsed: true,
  syntheticVisualsUsed: false,
  sponsoredContent: false,
  paidPartnership: false,
};

function projectFixture(locale: (typeof TIKTOK_METADATA_BCP47_LOCALES)[number]) {
  const editorial = localeEditorialFixtures[locale];
  return projectTikTokLocaleMetadataBundle({
    metadataRevisionId: `meta.rev.${locale.toLowerCase()}`,
    revision: 1,
    episodeId,
    episodeRevisionId,
    locale,
    metadataProfileId: `meta.profile.${locale.toLowerCase()}`,
    metadataProfileVersion,
    editorial: {
      locale,
      captionBody: editorial.captionBody,
      hashtags: editorial.hashtags,
      ctaUrl: `https://example.invalid/${locale}`,
      coverText: editorial.coverText,
    },
    providerPolicy,
    mediaProvenance,
    createdAt,
  });
}

describe("TikTok locale metadata projection", () => {
  it.each([...TIKTOK_METADATA_BCP47_LOCALES])(
    "projects revision-bound metadata for %s",
    (locale) => {
      const revision = projectFixture(locale);

      expect(revision.locale).toBe(locale);
      expect(revision.provider).toBe("tiktok");
      expect(revision.episodeRevisionId).toBe(episodeRevisionId);
      expect(revision.metadataProfileVersion).toBe(metadataProfileVersion);
      expect(revision.editorial.caption).toContain(
        localeEditorialFixtures[locale].captionBody.split(".")[0]!
      );
      expect(revision.editorial.hashtags).toEqual(
        localeEditorialFixtures[locale].hashtags
      );
      expect(revision.providerPolicy).toEqual(providerPolicy);
      expect(revision.disclosure.derivationSource).toBe("media_provenance");
      expect(revision.disclosure.aiContentDeclared).toBe(true);
      expect(revision.disclosure.commercialContentDeclared).toBe(false);
      expect(revision.contentHash).toMatch(/^[a-f0-9]{64}$/u);
    }
  );

  it("derives disclosure from media provenance, not translated caption text", () => {
    const revision = projectTikTokLocaleMetadataBundle({
      metadataRevisionId: "meta.rev.disclosure",
      revision: 1,
      episodeId,
      episodeRevisionId,
      locale: "en-US",
      metadataProfileId: "meta.profile.en-us",
      metadataProfileVersion,
      editorial: {
        locale: "en-US",
        captionBody:
          "#ad #sponsored AI generated commercial partnership paid promotion",
        hashtags: ["#SevenMinutesAhead"],
      },
      providerPolicy,
      mediaProvenance: {
        syntheticVoiceUsed: false,
        syntheticVisualsUsed: false,
        sponsoredContent: false,
        paidPartnership: false,
      },
      createdAt,
    });

    expect(revision.disclosure.aiContentDeclared).toBe(false);
    expect(revision.disclosure.commercialContentDeclared).toBe(false);
    expect(revision.disclosure).toEqual(
      deriveTikTokDisclosureDeclarations(revision.mediaProvenance)
    );
  });

  it("keeps editorial metadata separate from provider policy fields", () => {
    const revision = projectFixture("de-DE");
    const revised = projectTikTokMetadataRevision({
      metadataRevisionId: revision.metadataRevisionId,
      revision: revision.revision + 1,
      episodeId: revision.episodeId,
      episodeRevisionId: revision.episodeRevisionId,
      locale: revision.locale,
      metadataProfileId: revision.metadataProfileId,
      metadataProfileVersion: revision.metadataProfileVersion,
      editorial: {
        ...revision.editorial,
        caption: "Neue Bildunterschrift ohne Richtlinienänderung.",
        hashtags: ["#Neu", "#Microdrama"],
        ctaLabel: "Jetzt ansehen",
      },
      providerPolicy: revision.providerPolicy,
      mediaProvenance: revision.mediaProvenance,
      createdAt,
    });

    expect(revised.editorial.caption).not.toBe(revision.editorial.caption);
    expect(revised.providerPolicy).toEqual(revision.providerPolicy);
    expect(revised.disclosure).toEqual(revision.disclosure);
  });

  it("rejects disclosure declarations that do not match media provenance", () => {
    const editorialRevision = projectFixture("es-ES");
    const mismatchedDisclosure = {
      ...editorialRevision.disclosure,
      commercialContentDeclared: true,
    };

    expect(() =>
      validateTikTokMetadataPolicy({
        ...editorialRevision,
        disclosure: mismatchedDisclosure,
      })
    ).toThrow(TikTokMetadataPolicyViolationError);
  });
});
