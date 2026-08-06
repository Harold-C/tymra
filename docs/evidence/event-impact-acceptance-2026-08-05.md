# Event impact v1 acceptance — 2026-08-05

## Scope

This is a development-only acceptance of the structured event-impact evidence boundary. Scheduler
state remained disabled and no production source configuration was changed.

## Automated evidence

- Domain tests cover invalid/legacy evidence, venue-capacity-only pending behaviour and the
  attendance promotion threshold.
- Worker integration runs two occurrences twice: a Te Pae capacity-only event remains
  `PENDING_EVIDENCE`; a Canterbury A&P Show attendance-backed event becomes `PROMOTED`; the second
  pass reports two unchanged occurrences.
- Full current-worktree results: 109 root tests plus 55 Worker tests passed; 63 database/API/Worker
  integration tests passed.

## Real-source two-pass acceptance

- Acceptance ID: `public-sources-2026-08-05T08:38:41.230Z-f46fcce2`
- Source: `canterbury_major_annual_events`
- Pass 1 job/run: `cmsfu4tbp0000oe2opc6ym7nm` / `cmsfu4tm20001oe0okomcpqrq`
- Pass 2 job/run: `cmsfu4vag0001oe2o2qw2lx3d` / `cmsfu4vh9000goe0ocgbz7uy9`
- Both jobs and runs succeeded; source configuration and schedules were unchanged; enabled schedules stayed
  at zero; no active acceptance execution remained.
- Pass 2 added zero source events, source occurrences, canonical links or signal links and reported
  two unchanged records.
- `canterbury-ap-show:2026` persisted `DATE` precision and the official source URL as its evidence
  reference. Source and canonical occurrences both recorded `PROMOTED`, score
  `0.8640633725134819`, confidence `0.96`, with one `EXPECTED_ATTENDANCE` item of 70,000 people.

## Source references

- Canterbury A&P Association official show page: `https://www.theshow.co.nz/`
- Te Pae official exhibition hall page: `https://www.tepae.co.nz/spaces/exhibition-hall`

The Te Pae capacity is retained only as a trusted venue enrichment. The promotion policy does not
treat venue capacity as attendance.
