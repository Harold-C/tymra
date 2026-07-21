# Non-OTA source status

**Status date:** 2026-07-21

Every configured non-OTA public source ID now has a concrete read-only transport, parser and raw-to-source/canonical persistence path. This means the configured channel implementations exist; it does not mean every institution in a broad channel category is covered. Production use is separately controlled by source approval, legal-rights review, runtime stability evidence and disabled-by-default schedules.

| Source ID | Current concrete provider/scope | Output | Development evidence |
| --- | --- | --- | --- |
| `public_holidays_nz` | Employment New Zealand, nationwide | market signals | two real bounded passes |
| `school_holidays_nz` | Ministry of Education, nationwide | market signals | two real bounded passes |
| `geonet` | GeoNet open GeoJSON, nationwide | disruption signals | two real bounded passes |
| `mbie` | MBIE Accommodation Data Programme CSV | tourism-demand signals | two real bounded passes |
| `stats_nz` | Stats NZ international travel data | tourism-demand signals | two real bounded passes |
| `metservice` | MetService CAP/RSS warnings, nationwide | weather/access signals | two real bounded passes, including a valid zero-alert feed |
| `nzta` | NZTA Journey Planner GeoJSON, nationwide | transport-disruption signals | two real bounded passes |
| `fx_rates` | Reserve Bank B1 public page | exchange-rate signals | two real bounded Browser Worker passes |
| `linz` | LINZ New Zealand Gazetteer search roster | raw geospatial reference data | two real bounded passes; no fabricated demand signal |
| `venue_calendars` | Auckland Live | canonical events | parser tests and two real bounded passes |
| `council_calendars` | Auckland Council OurAuckland | canonical events | parser tests and two real bounded passes |
| `university_calendars` | University of Auckland | canonical events | parser tests and two real bounded passes |
| `rto_calendars` | ChristchurchNZ | canonical events | parser tests and two real bounded passes |
| `airport_data` | Queenstown Airport arrivals/departures | transport-flow signals | parser tests and two real bounded passes |
| `port_and_cruise` | Port of Auckland cruise CSV | transport-flow signals | parser tests and two real bounded passes |
| `ticketmaster` | Five verified New Zealand city listing routes plus durable detail frontier | canonical events | detail implementation and automated two-pass persistence verified; latest bounded live detail runs safely entered cooldown on a persistent challenge |
| `eventfinda` | Nationwide listing plus durable detail frontier | canonical events | 187-page nationwide discovery, 2,821-target frontier and bounded detail persistence verified |

`manual-import` is also implemented with validated CSV/JSON parsing, canonical accommodation/rate persistence and automated database acceptance. A genuine operator export has not been supplied, so that external-file acceptance remains `not_verified`.

## Coverage Boundary

The venue, council, university, RTO, airport and port IDs each currently name a channel category but implement one explicit first provider. Adding Wellington venues, other councils, universities, RTOs, airports or ports is coverage expansion through additional provider definitions, not completion of a missing generic placeholder.

LINZ is reference data and intentionally does not emit a pricing-impact signal. Events remain `PENDING_EVIDENCE` until capacity, attendance or corroborating demand evidence exists. Transport and demand observations likewise retain source lineage and are not treated as causal pricing instructions by themselves.

## Runtime Boundary

- All seeded schedules are disabled in development.
- Every collector enforces an allowlist, response/request bounds and deterministic record limits.
- Browser sources use one concurrent task, request spacing, daily budgets, source locks and challenge stop without bypass.
- Local acceptance never changes approval, rights or schedule state.
- Most sources remain `PENDING` / `REVIEW`; implementation and local verification are not production authorization.
- Eventfinda's complete development frontier is stored, but deliberately paced detail batches have
  not hydrated all 2,821 targets in one local run; this is operating work, not a missing collector.
- OTA accommodation and live rate collection are outside this document and remain a separate implementation track.
