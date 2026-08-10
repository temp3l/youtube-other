# Veronica Benini Character Reference Pack v1

This pack is intended for the Veronica/VeronicaBenini video image-generation pipeline.

## Contents

- `source/veronica-original.webp` - canonical identity source supplied by the user.
- `reference-board.png` - generated planning/contact sheet.
- `references/*.png` - cropped derived references for angle/expression selection.
- `manifest.json` - machine-readable identity manifest.
- `docs/implementation-prompt.md` - Codex implementation + calibration prompt.

## Critical identity rule

The original photograph is the canonical identity anchor.

Derived references exist only to improve angle, expression, and pose coverage. They must not silently redefine the subject. The generator must not treat the red dress, bracelet, white background, pose, or lighting as immutable identity features.

## Runtime policy

When a semantic scene explicitly includes `characterId: "veronica-benini"` with identity required:

1. Resolve the character manifest.
2. Select the canonical source plus at most one useful derived reference when supported by the provider.
3. Keep identity instructions separate from wardrobe/style/scene instructions.
4. Include character identity version and selected reference hashes in generation fingerprints.
5. Run identity-drift QA after generation.
6. Use the same identity pack for both 16:9 full videos and 9:16 shorts.

Do not attach character references to scenes where Veronica is not visible.

## Recommended calibration

Activate behind a Veronica-only feature flag, regenerate one representative short episode, produce a review pack, and inspect identity consistency before globally enabling it for all Veronica production.
