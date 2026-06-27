export class ShortRewriteError extends Error {
  public override name = "ShortRewriteError";

  public constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
  }
}

export class StoryInputNotFoundError extends ShortRewriteError {
  public override name = "StoryInputNotFoundError";
}

export class AmbiguousStoryInputError extends ShortRewriteError {
  public override name = "AmbiguousStoryInputError";
}

export class UnsupportedStoryLanguageError extends ShortRewriteError {
  public override name = "UnsupportedStoryLanguageError";
}

export class ExistingArtifactError extends ShortRewriteError {
  public override name = "ExistingArtifactError";
}

export class ShortRewriteValidationError extends ShortRewriteError {
  public override name = "ShortRewriteValidationError";
}

export class OpenAIShortRewriteError extends ShortRewriteError {
  public override name = "OpenAIShortRewriteError";
}

export class ManifestUpdateError extends ShortRewriteError {
  public override name = "ManifestUpdateError";
}
