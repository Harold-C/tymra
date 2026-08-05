# Christchurch priority sources acceptance - 2026-08-04

## Scope

- Christchurch City Council What's On
- Ara academic calendar
- Ravensdown Canterbury A&P Show
- ASICS Christchurch Marathon

School Sport NZ, School Sport Canterbury and Ticketek were excluded from Tymra execution after
ordinary HTTP probes returned Cloudflare/Akamai access-control responses. They are assigned to
Argus in `docs/collection/argus-priority-source-prompt.md`.

## Direct-source verification

The bounded live providers suite passed 41/41 tests. All four direct pages returned usable ordinary
HTTP content. No Argus execution was submitted.

CCC collection reads listing cards and pagination only. Ara retains demand-relevant academic rows.
The annual source retained the 2026 Canterbury A&P Show and its published 70,000 annual visitors;
the 2027 Christchurch Marathon parser passed but remained outside the bounded Show acceptance
window and has no promoted impact without current attendance evidence.

## Two-pass database acceptance

| Source | Pass 1 run | Pass 2 run | Persisted rows | Pass 2 unchanged |
| --- | --- | --- | ---: | ---: |
| `christchurch_council_events` | `cmse4f6pd0001l110qjfg4mo8` | `cmse4ffxa0001p610kjqid65e` | 2 events / 2 occurrences | 2 |
| `ara_academic_dates` | `cmse4f6pd0001qv12utekjfjh` | `cmse4ffxe0001p90zo4obv6m4` | 1 signal | 1 |
| `canterbury_major_annual_events` | `cmse4f6pd0001mo10wuvsejk1` | `cmse4ffxa0001rp107qki7brk` | 1 event / 1 occurrence | 1 |

All six runs succeeded with zero failures. Source event, occurrence and signal counts matched their
lineage-link counts exactly. The second pass created no new standard or lineage rows.

## Runtime and schedule state

- New source registry rows and disabled schedule definitions were applied through the application
  seed.
- Enabled schedule count remained zero.
- `https://tymra.test/en` returned 200, `https://ops.tymra.test/admin` returned the expected 307
  login redirect, and worker readiness returned 200 after recreation on the new image.
- Readiness reported database, Redis and Argus healthy.

## Test evidence

- Root unit/contract: 92 passed, 4 explicitly skipped live probes.
- Worker unit: 45 passed.
- Integration: 53 passed.
- Bounded live provider probe: 41 passed.
- Providers, database and worker typechecks passed; project lint and worker build passed.
