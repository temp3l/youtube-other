import fs from "node:fs/promises";
import path from "node:path";
import { hashText } from "@mediaforge/shared";
import {
  pronunciationDictionarySchema,
  type PronunciationDictionary,
} from "./narration-schemas.js";
import type {
  EducationalSpeechLanguage,
  SpeechDeliveryProfile,
} from "./speech-delivery-profile.js";

export const EDUCATIONAL_PRONUNCIATION_CONFIG_DIRECTORY =
  "config/speech-profiles/education-natural-teacher/pronunciation" as const;

export function educationalPronunciationDictionaryPath(
  repositoryRoot: string,
  language: EducationalSpeechLanguage
): string {
  return path.join(
    repositoryRoot,
    EDUCATIONAL_PRONUNCIATION_CONFIG_DIRECTORY,
    `${language}.v1.json`
  );
}

export async function loadEducationalPronunciationDictionary(input: {
  readonly repositoryRoot: string;
  readonly profile: SpeechDeliveryProfile;
  readonly additionalPaths?: readonly string[];
}): Promise<readonly PronunciationDictionary[]> {
  const paths = [
    educationalPronunciationDictionaryPath(
      input.repositoryRoot,
      input.profile.language
    ),
    ...(input.additionalPaths ?? []),
  ];
  const dictionaries = await Promise.all(
    paths.map(async (filePath) => {
      const parsed: unknown = JSON.parse(await fs.readFile(filePath, "utf8"));
      const dictionary = pronunciationDictionarySchema.parse(parsed);
      if (
        dictionary.language !== "global" &&
        dictionary.language !== input.profile.language
      ) {
        throw new Error(
          `Pronunciation dictionary ${filePath} does not match ${input.profile.language}.`
        );
      }
      if (
        dictionary.profileId !== undefined &&
        dictionary.profileId !== input.profile.id
      ) {
        throw new Error(
          `Pronunciation dictionary ${filePath} targets ${dictionary.profileId}, not ${input.profile.id}.`
        );
      }
      if (
        filePath === paths[0] &&
        dictionary.dictionaryVersion !==
          input.profile.pronunciationDictionaryVersion
      ) {
        throw new Error(
          `Pronunciation dictionary version does not match ${input.profile.pronunciationDictionaryVersion}.`
        );
      }
      return pronunciationDictionarySchema.parse({
        ...dictionary,
        dictionaryFingerprint:
          dictionary.dictionaryFingerprint ??
          hashText(
            JSON.stringify({
              dictionaryVersion: dictionary.dictionaryVersion ?? null,
              language: dictionary.language,
              profileId: dictionary.profileId ?? null,
              episodeId: dictionary.episodeId ?? null,
              entries: dictionary.entries,
            })
          ),
      });
    })
  );
  return dictionaries;
}
