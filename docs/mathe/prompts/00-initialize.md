# Codex Prompt: Dokumentation initialisieren

The ZIP contents have been extracted to `docs/mathe/`.

1. Verify that all Markdown files are readable and UTF-8 encoded.
2. Generate `docs/mathe/MANIFEST.generated.md` containing relative paths and SHA-256 hashes.
3. Validate the JSON fenced block in `curriculum/03-machine-readable-seed.md`.
4. Confirm that every curriculum skill ID is unique.
5. Confirm that every skill declares exactly the variants `foundation`, `standard`, `challenge`.
6. Confirm that all grades 5–10 are present.
7. Do not modify production code.
8. Do not call paid providers.
9. Report validation failures with exact file and field locations.
