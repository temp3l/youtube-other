# Episode 036 Story Rewrite

Summary: The initial canonical scripts were populated from existing optimized artifacts after the first provider call failed; that fallback is not a valid fresh rewrite. A later escalated retry reached the provider and returned a stronger English response, but deterministic validation rejected it before any localized output was written.

Changed paths: `episodes/036-the-house-of-voices/languages/script-{en,de,es,fr,pt}.md`; generated source and debug artifacts under `episodes/036-the-house-of-voices/{source,.localization-cache,debug}`; this report.

Checks: rewrite dry-run confirmed all five planned output locales. `episode inspect` found the Episode 036 source pack. The canonical English authored source resolved successfully in `episode validate`; full validation remains incomplete because no production manifests exist. The escalated provider retry returned English narration, then failed validation for a word-range overrun and false character/message preservation checks.

Risks/follow-up: the retained locale scripts are old artifacts, not fresh provider output. The current validator falsely extracts `Once Nina` as a person and then rejects compliant renamed narration; repair that validation path before retrying localization. Generate manifests only after story review approval.
