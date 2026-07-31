# External-effect Characterization

Task 02 records observed acceptance and recovery boundaries. All tests are deterministic fakes; no live provider mutation was performed.

## YouTube protocol evidence

The [official resumable-upload protocol](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol) requires retaining the session URI returned at initiation. It can later be queried with an empty `PUT`; a completed session returns its original completion response, while an incomplete session returns `308` plus the uploaded range. The current Google client path starts `videos.insert` with `uploadType: "resumable"`, but it does not persist the session URI before sending media.

`videos.list` requires a known video ID; it is not a marker-based upload recovery API. Although `search.list` can search terms and return snippets, it is not exact acceptance evidence. Therefore a post-upload timeout without a persisted session URI or returned video ID is `outcome_uncertain`, not retryable.

## Effect matrix

| Effect                    | Current acceptance boundary          | Recoverable identity/evidence                                | Retry classification                                             |
| ------------------------- | ------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| YouTube video             | `videos.insert` returns a video ID   | returned ID; resumable URI is not persisted                  | Reconcile before retry; otherwise never auto-retry               |
| Thumbnail                 | `thumbnails.set` resolves            | known video ID plus local report                             | Reconcile before retry                                           |
| Playlist item             | `playlistItems.insert` resolves      | known video ID and playlist ID; generic report has a receipt | Reconcile before retry                                           |
| YouTube verification      | `videos.list` resolves               | known video ID                                               | Safe retry only with known ID                                    |
| Text/AI generation        | provider response/artifact write     | request/cache fingerprint varies by adapter                  | Reconcile before retry                                           |
| TTS                       | provider audio result/artifact write | generated artifact hash and provider result where available  | Reconcile before retry                                           |
| Image generation          | image result/artifact write          | image artifact hash; batch custom ID where used              | Reconcile before retry                                           |
| Provider batch submission | provider accepts a batch             | provider batch ID/custom IDs are local-manifest checkpoints  | Reconcile before retry                                           |
| Render registration       | renderer reports output              | output hash/validation report                                | Safe retry before registration; reconcile after output may exist |

## Deterministic fault evidence

- `generic-media-publish.unit.test.ts` proves that a checkpoint failure immediately after an accepted `videos.insert` leaves a partial report with the returned video ID and halts subsequent mutations. Replaying that report does not call `videos.insert` again.
- The legacy uploader writes a `planned` report before its mutation sequence and writes the final report only after the sequence. Its `onSuccess` callback only accumulates request IDs in memory. A crash after provider acceptance and before final-report persistence loses the video ID and remains a duplicate-publication window.
- Existing image and story batch tests prove local manifest/custom-ID retries, but no adapter can prove a provider effect was absent after local timeout. Treat those effects as reconciliation-first.

## Decision

Task 15 must use a durable intent/effect journal, persist a resumable session URI before bytes are sent, and fail closed to `reconciliation_required` when exact recovery cannot establish one outcome. No implementation in this task alters provider behavior or authorizes a live publication retry.
