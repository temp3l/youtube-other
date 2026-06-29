# Multilingual Story Localization Settings

Runtime owner: `packages/story-localization/src/multilingual-story-localization-settings.ts`.

Use the relevant language section when generating or reviewing localized narrated stories. The loader extracts exactly one `## <Language> Localization` section for the requested locale; these sections are prompt guidance, not schema definitions and not story facts.

These settings are intended for creative localization, not sentence-by-sentence translation. Preserve story facts, causality, supernatural rules, callbacks, climax, and final payoff while rewriting the narration so it sounds native in the requested locale.

Implemented language codes are `en`, `de`, `es`, `fr`, and `pt`. Current default locale profiles are `en-US`, `de-DE`, `es-419`, `fr-FR`, and `pt-BR`. Unsupported primary language codes fail in the settings resolver and short-rewrite command.

Canonical source language is English. `stories rewrite-full` materializes an English canonical source under `episodes/<episode-slug>/source/<episode-number>-<episode-slug>-en-full.md`, generates or rewrites the English full story to `episodes/<episode-slug>/script.md`, and generates localized full stories only for requested non-English languages. `stories rewrite-short` consumes a validated generated full story by default and writes short-story artifacts separately.

The full-story localization prompt includes only source narration, immutable facts, character map, locale settings, target word/duration values, and optional production context. Metadata, audio generation, image generation, rendering, and upload concerns are separate stages and must not be added to localization prompts except where the response schema explicitly requires story-package metadata fields.

StoryIR and full-story contract validation are handled in TypeScript, not by this Markdown file. The implemented StoryIR includes genre, fictionality, narrative mode, entities, immutable facts, chronology, central threat, central rule mechanism, critical objects, written messages, climax, ending consequence, and allowed invention boundaries. Task 04 full-story contracts add genre-policy identity/version fields, deterministic `storyIrHash`, `contractHash`, `buildFingerprint`, policy registry version, and stable serializer version.

Configuration is resolved from CLI flags where available, then runtime config loaded from `.env` and process environment, then code defaults. Model examples in docs are examples only; use `MEDIAFORGE_OPENAI_STORY_MODEL`, `OPENAI_STORY_MODEL`, `MEDIAFORGE_OPENAI_LOCALIZATION_MODEL`, `OPENAI_LOCALIZATION_MODEL`, `MEDIAFORGE_OPENAI_SHORT_MODEL`, `OPENAI_SHORT_MODEL`, validator keys, and the corresponding reasoning/max-output-token keys to configure generation.

Resume behavior is artifact-aware. Full localization uses `.localization-cache` entries keyed by source hash and configuration hash. Short rewrite uses `episodes/<episode-slug>/manifests/short-rewrite-manifest.json` plus per-language Markdown/JSON sidecars and skips valid outputs when `--resume` is set. Batch localization uses the `stories:batches` commands and persisted batch index/manifests.

Retry and repair behavior is implemented in the services. Full localization can retry with configured retry max-output tokens and validator/repair settings. Short rewrite validates strict schema, word ranges, hook matching, thumbnail word limits, and editorial commentary, then uses a focused repair prompt for invalid results.

---

## English Localization

For English localization:

- Prefer idiomatic spoken English for the requested target locale over syntactic fidelity to the source.
- Explicitly target either `en-US` or `en-GB`; do not mix spelling, punctuation, vocabulary, or idioms from both variants.
- Write narration that sounds natural when spoken aloud, not like a literal translation or formal literary prose.
- Preserve the story’s meaning, dramatic function, supernatural rules, and causal sequence rather than its original sentence structure.
- Do not translate metaphors literally when they sound unnatural in English, such as direct equivalents of “lonely rooms,” “heavy silence,” or “the night held its breath.”
- Replace weak or culturally awkward source metaphors with concrete English imagery that fits the scene.
- Avoid excessive nominalizations, passive constructions, abstract commentary, and bureaucratic wording.
- Avoid phrases such as “no invitation was given” when a frightened character would naturally say “I didn’t invite you,” “You don’t have permission to enter,” or “Stay outside.”
- Use direct first-person dialogue where a frightened speaker would naturally do so.
- Do not invent technical expressions, forced compounds, or unnatural terminology for supernatural concepts such as “partial permission.”
- Express supernatural rules through concrete consequences, for example: “Every offer of help seemed to give them a little more access.”
- Use natural terms such as “security chain,” “neon sign,” “mountain road,” “peephole,” “front desk,” and “Room 4” where context requires them.
- Distinguish clearly between “enter,” “come inside,” “let in,” “cross the threshold,” and “get inside”; do not use them interchangeably when the supernatural rule depends on exact meaning.
- Split suspenseful discoveries and revelations into short spoken sentences.
- Use fragments sparingly and intentionally during moments of shock, recognition, or immediate danger.
- Avoid repeatedly starting sentences with “Then,” “But,” “Suddenly,” “For a moment,” or “That was when.”
- Avoid excessive repetition of words such as “strange,” “dark,” “heavy,” “terrifying,” “eerie,” “suddenly,” and “silence.”
- Avoid generic horror clichés unless they are made specific to the character, setting, or supernatural rule.
- Prefer observable action, dialogue, sound, physical evidence, and environmental change over explanatory phrases such as “he realized the danger had become personal.”
- Do not describe narrative function, scene purpose, audience reaction, escalation, evidence design, false calm, or the meaning of a reveal.
- Never refer to a named character as “the character,” “the survivor,” or “the protagonist” inside the narration.
- Ensure every pronoun has an unambiguous antecedent, especially in scenes involving multiple speakers.
- Keep singular and plural references consistent; do not switch from one protagonist to “they,” “the survivors,” or “everyone present.”
- Maintain consistent forms of address and dialogue register between characters.
- Preserve foreign proper names, road names, motel names, and addresses without translating them unnecessarily.
- Do not rewrite established street names such as “Maple Drive.”
- Format addresses naturally for the target English locale without changing their factual content.
- Preserve exact times, room numbers, names, and important quoted phrases unless a correction is required for continuity.
- Ensure any phrase quoted, remembered, or interpreted later was actually spoken earlier in the generated narration.
- If a callback phrase does not exist earlier in the source, repair the earlier dialogue or rewrite the later callback without changing the underlying rule.
- Do not preserve contradictions merely because they appear in the source.
- Repair impossible or unclear timing while preserving the intended sequence.
- Foreshadow any supernatural defense or counter-rule before the protagonist successfully uses it.
- Do not introduce a name, address, ritual, or ownership rule as a solution unless the story has established why it could work.
- Ensure every attempted solution follows from information currently available to the protagonist.
- If a defense fails, make the failure reveal a limitation of the established rule rather than introducing an unrelated mechanic.
- Do not reveal or paraphrase the final payoff in the opening.
- Prefer the central conflict, warning, deadline, or supernatural rule as the cold-open hook.
- Preserve the final image, final recording, or final consequence exclusively for the ending unless the source intentionally uses a framed narrative.
- Keep dialogue grounded and restrained; avoid lines that sound theatrical, dubbed, or unnaturally polished.
- Avoid melodramatic exclamations, exaggerated emotional labels, and excessive physical reactions such as repeated pounding hearts or crawling skin.
- Use sensory detail selectively; every detail should establish place, escalate the threat, reveal character, or clarify the supernatural rule.
- Do not preserve source paragraph boundaries. Rebuild paragraphs according to natural English rhythm, breathing, and scene progression.
- Use shorter paragraphs during escalation and the climax.
- Maintain a restrained, cinematic horror tone appropriate for native English narration.
- For `en-US`, use American spelling and vocabulary such as “color,” “center,” “apartment,” and “911 dispatcher.”
- For `en-GB`, use British spelling and vocabulary such as “colour,” “centre,” “flat,” and “999 operator,” unless the story is explicitly set in another country.
- Do not localize emergency numbers, institutions, road terminology, or official roles if doing so would contradict the established setting.
- Preserve the geographical and cultural setting even when adapting the narration for another English locale.
- Ensure the completed narration sounds like an original English horror story rather than a translated text.

---

## German Localization

For German localization:

- Prefer idiomatic spoken German over syntactic fidelity.
- Write narration that sounds natural when spoken aloud, not like a literal translation or formal literary prose.
- Do not translate English adjective metaphors literally, such as “lonely rooms,” “heavy silence,” or “the night held its breath.”
- Avoid excessive nominalizations, passive constructions, and bureaucratic phrasing.
- Avoid phrases such as “Keine Einladung wurde gegeben.”
- Use direct first-person dialogue where a frightened speaker would naturally do so.
- Do not invent hyphenated compounds such as “Teil-Erlaubnis.”
- Express supernatural rules through natural consequences instead of technical wording.
- Use “Türkette,” “Neonschild,” “Passstraße,” “Türspion,” “Rezeption,” and “Zimmer 4” where context requires them.
- Distinguish clearly between “eintreten,” “hereinkommen,” “hereinlassen,” “die Schwelle übertreten,” and “ins Zimmer gelangen.”
- Split suspenseful revelations into short spoken sentences.
- Use fragments sparingly and intentionally during moments of shock.
- Avoid repeated “doch,” “dann,” “plötzlich,” “für einen Moment,” and “schwer.”
- Avoid excessive repetition of words such as “seltsam,” “dunkel,” “unheimlich,” “schwer,” and “Stille.”
- Avoid dense subordinate clauses and excessive nesting.
- Ensure every pronoun has an unambiguous antecedent.
- Keep singular and plural references consistent.
- Maintain consistent forms of address and do not switch arbitrarily between “du” and “Sie.”
- Retain foreign proper names and addresses without forcing German street-order syntax.
- Do not translate established street names such as “Maple Drive.”
- Preserve exact times, room numbers, names, and important quoted phrases unless a continuity repair is required.
- Ensure any phrase quoted or remembered later was actually spoken earlier in the German narration.
- If a callback does not exist earlier, repair the earlier dialogue or rewrite the later callback.
- Prefer observable actions and sensory details over abstract commentary such as “die Gefahr wurde persönlich.”
- Never refer to a named character as “die Figur,” “der Überlebende,” or “der Protagonist” inside the narration.
- Repair contradictions and unclear timing rather than preserving them literally.
- Foreshadow supernatural defenses and counter-rules before they are used.
- Do not introduce an address, ritual, name, or ownership claim as a solution unless the narration establishes why it could work.
- Do not reveal or paraphrase the final payoff in the opening.
- Prefer the central conflict, supernatural rule, warning, or deadline as the hook.
- Keep the final image, recording, or consequence exclusively for the ending.
- Avoid melodramatic dialogue, excessive exclamations, and phrasing that sounds dubbed or overly literary.
- Do not preserve source paragraph boundaries. Rebuild paragraphs according to natural German rhythm and scene progression.
- Use shorter paragraphs during escalation and the climax.
- Maintain restrained, cinematic tension appropriate for native German horror narration.
- Ensure the completed narration sounds as though it was originally written in German.

---

## French Localization

For French localization:

- Prefer idiomatic spoken French for the target locale over syntactic fidelity to English.
- Write narration that sounds natural when spoken aloud, not formal literary prose or a direct translation.
- Do not translate English adjective metaphors literally, such as “lonely rooms,” “heavy silence,” or “the night held its breath.”
- Avoid excessive nominalizations, passive constructions, and overly formal phrasing.
- Avoid impersonal constructions such as “aucune invitation n’a été donnée” when a frightened character would naturally say “Je ne vous ai pas invités” or “Vous n’avez pas le droit d’entrer.”
- Use direct first-person dialogue where a frightened speaker would naturally do so.
- Do not invent unnatural compounds, calques, or abstract expressions to reproduce English concepts such as “partial permission.”
- Express supernatural rules through natural wording such as “chaque parole leur accordait un peu plus de pouvoir” rather than literal technical terminology.
- Use natural French terms such as “chaînette de sécurité,” “enseigne au néon,” “route de montagne,” “judas,” and “chambre 4” where context requires them.
- Use “entrer,” “rentrer,” “laisser entrer,” and “franchir le seuil” according to context; do not use them interchangeably without regard to meaning.
- Split suspenseful discoveries and revelations into short spoken sentences.
- Use fragments sparingly and intentionally during moments of shock or recognition.
- Avoid repeatedly starting sentences with “Puis,” “Alors,” “Soudain,” “Mais,” or “Pour un instant.”
- Avoid excessive repetition of words such as “étrange,” “lourd,” “sombre,” “terrifiant,” and “silence.”
- Avoid dense chains of subordinate clauses and excessive use of “qui,” “que,” and “dont” in narration intended for speech.
- Ensure every pronoun has an unambiguous antecedent, especially “il,” “elle,” “ils,” and “elles.”
- Use consistent register in dialogue; do not switch arbitrarily between “tu” and “vous.”
- Select “tu” or “vous” based on the relationship, social context, age, and intended emotional distance, then keep it consistent.
- Preserve foreign proper names, road names, motel names, and addresses without forcing them into French address order or translating them unnecessarily.
- Do not translate established English street names such as “Maple Drive.”
- Preserve precise times, room numbers, names, and quoted callbacks exactly unless localization requires a natural formatting change.
- Ensure any phrase recalled later in the story was actually spoken earlier in the French narration.
- Repair contradictions and unclear timing rather than translating them literally.
- Foreshadow supernatural defenses and counter-rules before they are used.
- Do not introduce an address, ritual, name, or ownership claim as a solution unless the narration establishes why it could work.
- Prefer concrete physical reactions and observable details over generic phrases such as “il comprit que quelque chose n’allait pas.”
- Do not reveal or paraphrase the final payoff in the opening.
- Prefer the central conflict, supernatural rule, warning, or deadline as the hook.
- Keep the final image, recording, or consequence exclusively for the ending.
- Avoid melodramatic exclamations and vocabulary that sounds dubbed, theatrical, or unnaturally elevated.
- Do not preserve source paragraph boundaries. Rebuild paragraphs according to natural French rhythm and scene flow.
- Use shorter paragraphs during escalation and the climax.
- Maintain restrained, cinematic tension appropriate for native French horror narration.
- Ensure the completed narration sounds as though it was originally written in French.

---

## Spanish Localization

For Spanish localization:

- Prefer idiomatic spoken Spanish for the requested target locale over syntactic fidelity to English.
- Write narration that sounds natural when spoken aloud, not like a literal translation or formal written prose.
- Use neutral international Spanish unless a specific regional locale is requested.
- Do not translate English adjective metaphors literally, such as “lonely rooms,” “heavy silence,” or “the night held its breath.”
- Avoid excessive nominalizations, passive constructions, and unnatural uses of the passive voice with “ser.”
- Prefer active or natural impersonal constructions where Spanish would normally use them.
- Avoid phrases such as “ninguna invitación fue dada.” Use natural dialogue such as “Yo no los invité,” “No tienen permiso para entrar,” or “No les he dado permiso.”
- Use direct first-person dialogue where a frightened speaker would naturally do so.
- Do not invent hyphenated expressions, technical calques, or unnatural compounds for concepts such as “partial permission.”
- Express supernatural rules naturally, for example: “Cada palabra parecía darles un poco más de acceso” or “Cada concesión les permitía acercarse más.”
- Use natural terms such as “cadena de seguridad,” “letrero de neón,” “carretera de montaña,” “mirilla,” “habitación 4,” and “recepción” where context requires them.
- Distinguish naturally between “entrar,” “dejar entrar,” “pasar,” “meterse,” and “cruzar el umbral.”
- Split suspenseful revelations into short spoken sentences.
- Use sentence fragments only when they sound intentional and natural in narration.
- Avoid repeatedly starting sentences with “Entonces,” “Pero,” “De repente,” “Luego,” or “Por un momento.”
- Avoid overusing words such as “extraño,” “oscuro,” “pesado,” “aterrador,” “escalofriante,” and “silencio.”
- Avoid unnecessary subject pronouns when the verb form already makes the subject clear.
- Include names or explicit nouns whenever omitting the subject would create ambiguity.
- Ensure pronouns such as “él,” “ella,” “ellos,” “lo,” “la,” “le,” and “se” have clear antecedents.
- Avoid ambiguous “su” constructions; repeat the person’s name or noun when ownership could be misunderstood.
- Maintain consistent forms of address and do not switch arbitrarily between “tú,” “usted,” “vosotros,” and “ustedes.”
- For neutral international narration, prefer “ustedes” over “vosotros” unless the target locale is specifically Spain.
- Preserve foreign proper names, road names, motel names, and addresses without translating them or forcing Spanish street-order conventions.
- Do not translate established street names such as “Maple Drive.”
- Format times naturally for the target locale while preserving the exact story time.
- Ensure any phrase quoted or remembered later was actually spoken earlier in the Spanish narration.
- Repair contradictions and unclear timing rather than translating them literally.
- Foreshadow supernatural defenses and counter-rules before they are used.
- Do not introduce an address, ritual, name, or ownership claim as a solution unless the narration establishes why it could work.
- Prefer observable action and sensory detail over generic statements such as “se dio cuenta de que todo había cambiado.”
- Do not reveal or paraphrase the final payoff in the opening.
- Prefer the central conflict, supernatural rule, warning, or deadline as the hook.
- Keep the final image, recording, or consequence exclusively for the ending.
- Avoid melodramatic interjections, exaggerated adjectives, and dialogue that sounds like dubbed television.
- Do not preserve source paragraph boundaries. Rebuild paragraphs according to natural Spanish rhythm and scene progression.
- Use shorter paragraphs during escalation and the climax.
- Maintain restrained, cinematic tension appropriate for native Spanish horror narration.
- Ensure the completed narration sounds as though it was originally written in Spanish.

---

## Portuguese Localization

For Portuguese localization:

- Prefer idiomatic spoken Portuguese for the requested target locale over syntactic fidelity to English.
- Explicitly target either `pt-BR` or `pt-PT`; do not mix vocabulary, pronouns, verb forms, spelling, or address conventions from both variants.
- Write narration that sounds natural when spoken aloud, not like a literal translation or formal literary prose.
- Do not translate English adjective metaphors literally, such as “lonely rooms,” “heavy silence,” or “the night held its breath.”
- Avoid excessive nominalizations, passive constructions, gerund chains, and formal bureaucratic phrasing.
- Avoid expressions such as “nenhum convite foi dado.” Use natural dialogue such as “Eu não convidei vocês,” “Vocês não têm permissão para entrar,” or the appropriate `pt-PT` equivalent.
- Use direct first-person dialogue where a frightened speaker would naturally do so.
- Do not invent hyphenated compounds, technical calques, or unnatural expressions for concepts such as “partial permission.”
- Express supernatural rules naturally, for example: “Cada palavra parecia dar a eles um pouco mais de acesso” or “Cada concessão permitia que chegassem mais perto.”
- For `pt-BR`, prefer natural terms such as “corrente de segurança,” “placa de neon,” “estrada de montanha,” “olho mágico,” “quarto 4,” and “recepção” where context requires them.
- For `pt-PT`, use locally natural equivalents such as “corrente de segurança,” “letreiro de néon,” “estrada de montanha,” “óculo da porta,” “quarto 4,” and “receção.”
- Distinguish naturally between “entrar,” “deixar entrar,” “passar,” “atravessar a soleira,” and “meter-se,” according to locale and context.
- Split suspenseful discoveries and revelations into short spoken sentences.
- Use fragments sparingly and intentionally during moments of shock.
- Avoid repeatedly starting sentences with “Então,” “Mas,” “De repente,” “Depois,” or “Por um momento.”
- Avoid excessive repetition of words such as “estranho,” “pesado,” “sombrio,” “assustador,” “sinistro,” and “silêncio.”
- Avoid unnecessary subject pronouns, but repeat the character’s name whenever omission would cause ambiguity.
- Ensure pronouns and possessives have unambiguous antecedents, especially “ele,” “ela,” “eles,” “seu,” “sua,” “dele,” and “dela.”
- Prefer “dele” or “dela” when “seu” or “sua” could refer to more than one person.
- Maintain consistent forms of address.
- For `pt-BR`, do not switch arbitrarily between “você,” “vocês,” “tu,” and regional conjugations.
- For `pt-PT`, maintain consistent use of “tu,” “você,” third-person forms, or omitted forms according to the characters and social context.
- Preserve foreign proper names, road names, motel names, and addresses without translating them or forcing Portuguese address order.
- Do not translate established street names such as “Maple Drive.”
- Preserve exact times, room numbers, names, and dialogue callbacks while formatting them naturally for the target locale.
- Ensure any phrase recalled or quoted later was actually spoken earlier in the Portuguese narration.
- Repair contradictions and unclear timing rather than translating them literally.
- Foreshadow supernatural defenses and counter-rules before they are used.
- Do not introduce an address, ritual, name, or ownership claim as a solution unless the narration establishes why it could work.
- Prefer concrete actions, sounds, and physical reactions over generic phrases such as “ele percebeu que algo estava errado.”
- Do not reveal or paraphrase the final payoff in the opening.
- Prefer the central conflict, supernatural rule, warning, or deadline as the hook.
- Keep the final image, recording, or consequence exclusively for the ending.
- Avoid melodramatic exclamations and dialogue that sounds artificially dubbed or overly literary.
- Do not preserve source paragraph boundaries. Rebuild paragraphs according to natural Portuguese rhythm and scene progression.
- Use shorter paragraphs during escalation and the climax.
- Maintain restrained, cinematic tension appropriate for native Portuguese horror narration.
- Ensure the completed narration sounds as though it was originally written in the selected Portuguese locale.

---

## Runtime Integration Requirements

When adopting these settings:

1. Select exactly one language section from the requested target locale.
2. Inject the selected section into the localization prompt without duplicating other language sections.
3. Use only implemented primary language codes: `en`, `de`, `es`, `fr`, `pt`.
4. Treat `en-US`, `de-DE`, `es-419`, `fr-FR`, and `pt-BR` as the current default runtime locale profiles.
5. Do not document or request additional language support until `languageCodes`, `LANGUAGE_PROFILES`, schemas, CLI normalization, and tests are updated.
6. Treat these settings as localization guidance, not story facts.
7. Story facts, rules, critical events, callbacks, and the final reveal must come from the validated canonical English source, StoryIR, or full-story contract.
8. Do not allow these settings to override immutable facts, source-language provenance, written-message preservation, genre-policy boundaries, or full-story contract constraints.
9. Validate callback consistency, chronology, names, times, room numbers, locations, written messages, central rules, and ending completeness in code before persistence.
10. Calculate word counts, estimated duration, hashes, and fingerprints programmatically rather than asking the model to self-report them as authoritative.
11. Regenerate or repair invalid outputs through the implemented retry/repair flow; do not mechanically truncate story text, thumbnail text, or generated JSON.

## Artifact Conventions

- Canonical materialized source: `episodes/<episode-slug>/source/<episode-number>-<episode-slug>-en-full.md`.
- Canonical English full story: `episodes/<episode-slug>/script.md`.
- Localized full stories: `episodes/<episode-slug>/<language>/full/script.md`.
- Short rewrite canonical Markdown: `episodes/<episode-slug>/<language>/short/<episode-number>-<episode-slug>-<language>-short.md`.
- Short rewrite canonical JSON: `episodes/<episode-slug>/<language>/short/<episode-number>-<episode-slug>-<language>-short.json`.
- Short rewrite compatibility Markdown/JSON: `episodes/<episode-slug>/<language>/short/script.md` and adjacent compatibility JSON.
- Short rewrite manifest: `episodes/<episode-slug>/manifests/short-rewrite-manifest.json`.
- Full localization cache: `episodes/<episode-slug>/.localization-cache/`.
- Story production artifacts and stage state: `episodes/<episode-slug>/story-production/`.
