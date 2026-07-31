# Duplication and Divergence

| Finding                                     | Evidence                                                                    | Consequence                                                          | Planned resolution                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| three broad workflow models                 | generic workflow engine; story workflow store; math legacy/canonical stores | status/resume/approval meanings differ                               | relational canonical engine; read-only legacy import/projection     |
| Dark Truth monolithic vs staged production  | `prepareEpisodeLanguage` vs story localization/audio/images/render commands | behavior and gates can drift                                         | characterization, operator choice of canonical behavior, bind tasks |
| API/CLI composition gap                     | CLI constructs registries/providers; API does not                           | direct package calls would duplicate orchestration                   | shared application composition root                                 |
| nested CLI wrappers                         | story audio/images invoke packaged CLI                                      | untyped protocol, inherited environment, weak cancellation           | typed transitional adapter then delete                              |
| active legacy vs stronger generic publisher | `uploadYoutubeEpisode` vs `publishYoutubeMedia`                             | active path lacks intermediate durable checkpoints/approval strength | one publication use case and effect journal                         |
| multiple batch stores                       | workflow, story, image, math batch lifecycles                               | orphan provider work and inconsistent retries                        | canonical batch/job records; provider adapters only                 |
| path compatibility fallbacks                | shared resolver and metadata/image readers accept old layouts               | ambiguous identity and migration complexity                          | opaque assets; compatibility importer; no public paths              |
| renderer entry points                       | CLI construction, remote scripts, educational renderer executable           | scheduling/security policy duplicated                                | typed render port and isolated worker                               |
| validation/approval artifacts               | profile/package-specific gates plus generic approvals                       | cannot query one trustworthy gate status                             | common envelope with profile-owned typed evidence                   |
| observability stores                        | general execution JSON plus math-specific events and workflow JSONL         | no distributed trace/audit authority                                 | normalized IDs/telemetry and separate audit ledger                  |

Every row is **Verified** from the cited source families; the consequences are **Inferred** and resolutions **Recommended**.

## Do not “genericize” domain behavior

The shared layer owns command lifecycle, identity, tenancy, orchestration, assets, validation envelopes, approvals, jobs, and publications. Dark Truth continues to own story bible, supernatural/canonical facts, references, narrative quality, and horror repair. Mathematics continues to own curriculum, grade/difficulty, exact verification, lesson/exercise semantics, presets, and retained chalkboard state.

## Elimination rule

For each workflow instance, exactly one adapter is writable. Migration changes the authority marker from `filesystem-legacy` to `database-v1` after import validation. Compatibility JSON becomes an export projection; its failure is repairable and cannot make it authoritative again. Old entry points delegate to the use case or become read-only before removal.
