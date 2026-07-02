# Canonical Episode Workspace Contract

## Directory structure

```text
episodes/
  <episode-slug>/
    languages/
      script-en.md
      script-de.md
      script-es.md
      short/
        script-en.md
        script-de.md
    source/
      ...
    locales/
      <locale>/
        full/
          ...
        short/
          ...
    state/
    shared/
    manifests/
```

## Rules

- `<episode-slug>` must pass the existing episode id pattern: lowercase alphanumeric and hyphen, no traversal.
- Language codes must pass `normalizeLocaleCode()` and reject legacy `sp`; the resolver should support the active project set from shared config.
- Variant values are exactly `full` or `short`.
- Authored full scripts live at `languages/script-<language>.md`.
- Authored Short scripts live at `languages/short/script-<language>.md` only when distinct.
- Generated files under `<language>/<variant>`, `locales/`, `source/`, `state/`, `shared/`, `audio/`, and `manifests/` are not authored script sources.
- No root `script.md` compatibility copy is canonical.

## Examples

```text
episodes/022-the-whistler-in-the-woods/languages/script-en.md
episodes/022-the-whistler-in-the-woods/languages/script-de.md
episodes/022-the-whistler-in-the-woods/languages/short/script-en.md
episodes/022-the-whistler-in-the-woods/languages/short/script-de.md
```

## Future status decisions

- `episodes/<slug>/script.md`: invalid active source; remove after migration.
- `episodes/<slug>/en/full/script.md`: generated output or legacy compatibility only; not canonical authored source.
- `episodes/<slug>/languages/script-en.md`: canonical English full authored script.
- `episodes/<slug>/languages/script-de.md`: canonical German full authored script.

## Invalid layouts and ambiguity

If both canonical and noncanonical files exist, the resolver must reject with an ambiguity error unless the request explicitly targets a generated-output reader that is not resolving authored scripts. It must not silently select English or fall back from Short to full.
