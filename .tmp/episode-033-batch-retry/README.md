# Episode 033 Batch Retry

Prepared corrected retry input for failed source batch `slb-20260710192405075-001`.

- canonical English full uses `gpt-5.6-sol`
- English short and de/es/fr/pt localizations use `gpt-5.6-terra`
- mixed-model submission failed validation because OpenAI batches require one model
- split retry batches were submitted with `OPENAI_API_KEY` loaded from `.env`
- `gpt-5.6-sol`: `batch_6a535639c2f08190b6b2cd6d15d3fa3f`
- `gpt-5.6-terra`: `batch_6a53563b313c8190b7751913b243420e`
- latest checked status: both batches `in_progress`
