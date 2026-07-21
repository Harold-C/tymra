# Tymra product baseline

This directory is the canonical local project memory for the five product documents migrated from
Google Drive under `nbc/tymra`. The complete Google Docs content was exported to Markdown on
2026-07-21 and verified against a fresh export before cloud deletion was attempted.

The migration preserves the full text. Local files add only the conventional final newline required
for text files. Future baseline changes must be made in this directory first and reflected in
`docs/decisions.md` and `docs/traceability.md`; the Google Docs are no longer an authority or
fallback.

## Authority and scope

The four Release 1 v1.2 documents retain their stated precedence:

1. `requirements.md` defines product scope and fixed technical defaults.
2. `business-rules.md` defines executable business objects, states and decisions.
3. `page-structure.md` defines routes, page regions and user flows.
4. `visual-interaction.md` defines visual tokens, components and interaction behaviour.

`core-strategy.md` is the separate data-collection and price-analysis strategy baseline. Where its
long-term nationwide direction exceeds a currently approved release, the release baseline,
`docs/decisions.md` and `docs/traceability.md` determine what is implemented and verified now.

## Migration manifest

All source documents were native Google Docs in folder `nbc/tymra`
(`1Ie2s71OEXTRbQcFg4_PHVIXitA1ehQ-W`). `Local SHA-256` is calculated from the checked-in-style local
Markdown bytes, including the normalized final newline.

| Source title | Local document | Source file ID | Last source modification (UTC) | Lines | Bytes | Local SHA-256 |
| --- | --- | --- | --- | ---: | ---: | --- |
| 页面结构 | [page-structure.md](./page-structure.md) | `10YlMPCDNF4m5vubrmgG9V2HWmixvb_3uUQfj1XCt0Tk` | 2026-07-16 00:56:35.543 | 432 | 22,766 | `f36cf308ebc47116cd4a987cf41c79d9fdf5fb326856e236d1991985dfa8c1b2` |
| 业务规则 | [business-rules.md](./business-rules.md) | `1-sPq5TvX9lIyso4E7VLuRJVIYHCcrCl7Aai_8J7B0oo` | 2026-07-16 00:56:04.927 | 456 | 25,736 | `ae4051762e4faea9ef0977d418ed0fd8af1137ec6682aa6fb3399eec761d7761` |
| 需求说明 | [requirements.md](./requirements.md) | `1-ePHdytmvCYGi-IKGLoWsRWfFxIXIkJqA2WcW30MlZo` | 2026-07-16 00:56:02.272 | 443 | 32,715 | `9cbe23b669767692174bc689237f604e477609926b10e459d55ec634ed8ad4cb` |
| 视觉交互 | [visual-interaction.md](./visual-interaction.md) | `1-hEfGQ9oIYCZ5dLGKnC7tOh6resmG9SJowP0ctp7hmM` | 2026-07-16 00:57:55.642 | 491 | 28,664 | `6a3a3d71eae186069eac066c411c7d86377cf82008aac6820f440533cd14a579` |
| 核心策略 | [core-strategy.md](./core-strategy.md) | `12bGKYt_uugDL85t7QH1LlQEMVFrnmcWUNdv0ZTUqCWU` | 2026-07-17 23:07:57.506 | 570 | 60,188 | `f93e0ab8bf00321990d6d29863c7452e6d4b8d11b1baa67c2e3dd684f52a1ab3` |

Migration total: five documents, 2,392 lines and 170,069 local bytes. Each local file matched a
fresh `text/markdown` Drive export after final-newline normalization.

## Cloud lifecycle

The local migration and cloud cleanup are complete. The first connector deletion attempt returned
`403 appNotAuthorizedToFile`, so the five verified targets were instead moved to trash and
permanently deleted through the authenticated Google Drive UI on 2026-07-21. Post-deletion checks
confirmed that the source folder lists no files and all five recorded source IDs return `404 Not
Found` from Drive metadata lookup. Same-named documents under other Drive folders were outside this
migration and were not deleted.
