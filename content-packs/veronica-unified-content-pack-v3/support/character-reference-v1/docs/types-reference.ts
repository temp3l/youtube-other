// Reference shape only. Adapt to repository conventions.
export interface CharacterIdentityManifest {
  readonly schemaVersion: 1;
  readonly characterId: string;
  readonly identityVersion: string;
  readonly canonicalSource: {
    readonly path: string;
    readonly sha256: string;
  };
  readonly references: readonly CharacterReference[];
}

export interface CharacterReference {
  readonly id: string;
  readonly path: string;
  readonly view:
    | 'front'
    | 'three-quarter-left'
    | 'three-quarter-right'
    | 'profile-left'
    | 'profile-right';
  readonly framing: 'headshot' | 'waist-up' | 'full-body';
  readonly expression: 'neutral' | 'smiling' | 'speaking' | 'gesturing';
  readonly source: 'canonical' | 'derived';
  readonly sha256: string;
}
