# History content-pack inventory

Verified repository input: `content-packs/youtube-history-10-video-story-pack/`.

The pack contains 12 regular files: one manifest, one editorial README, and ten Markdown episodes. SHA-256 checksums:

| File | SHA-256 |
| --- | --- |
| `01-bronze-age-collapse.md` | `fce9669e8bd0f91ed5d2a3c645837248edead20463c84aad605ee8a88cc4d81c` |
| `02-napoleons-invasion-of-russia.md` | `c71cbe1fbd48928081b8a6ba6a12f1dec993521e3b6b23442f5494ae1ad8a3c9` |
| `03-fall-of-the-roman-empire.md` | `9696ebe0df10ddc0d9d79bd0fd691d9bbf4ce982087c2c2be32d61a1aa34c713` |
| `04-black-death.md` | `1a5439dc6b80d7e4b4172f3ba7138ab0698b28115b767790c7da396885b4de6e` |
| `05-franklin-expedition.md` | `43d1aebf445bc6dd5d22978bcfeb7d8957857ad345381b7e2a13544e47f37d1c` |
| `06-mongol-war-machine.md` | `97d9d80b127b8e4cbb7550aec91d089b871f55971bdedf17e7e70c3dfe7a81bd` |
| `07-day-life-medieval-peasant.md` | `35528ff8b3b145c7abb8339e96fbb115f067705ea39d2f03069ad9d22c4e30c7` |
| `08-cuban-missile-crisis.md` | `4be91290575fe14146fb94ec720102d618db8504e4877adedd839b563077b305` |
| `09-cleopatra-beyond-legend.md` | `e1a4c07e848c35d5bc61235019c1db9ddf9e3bbfc8ff8d6f01ddab1c2d081476` |
| `10-titanic-decisions-disaster.md` | `02ca93ccc3eb1ffcab1f18ff9dc66dcc6c405f580a338b5ce575a9cf72f3c5ab` |
| `README.md` | `0034df28786423fe0e0bb8d58de9e9a3d8fdb3ed15ac5b055828bff59ac5bf20` |
| `manifest.json` | `b52bf5746d4f21e905951d3bf9c4c6bcef132182764bb7ca8465764a5b396f22` |

## Multi-agent file ownership

| Owner | Exclusive scope |
| --- | --- |
| `/root` | `packages/history/**`, History CLI wiring, imported `episodes/history-*`, History docs and reports |
| `/root/api_history` | `apps/api/src/contract*`, `packages/api-sdk/src/{index,v1-contract}*` |
| `/root/persistence_history` | History profile changes/tests in `packages/persistence/**` |
| Audit agents | Read-only pack, genre, importer, and publication-gate inspection |

The source pack is immutable. Checksums are persisted per imported episode; README, manifest, or episode-source changes trigger a revision and invalidate derived workflow tasks.
