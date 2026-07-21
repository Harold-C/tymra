# Tymra Release 1.5 Customer Funnel Requirements

Last updated: 2026-07-16

Status: **Product-approved baseline. Core new-visitor funnel implemented and verified locally; remaining hardening is tracked in `traceability.md`.**

This document turns the product discussion about anonymous value, email verification, customer
accounts and abuse prevention into an implementable Release 1.5 baseline. It amends the Release 1
public flow without changing the completed Release 1 evidence. If this document conflicts with the
Release 1 implementation, this document describes the intended Release 1.5 behaviour only.

## 1. Product Objective

Tymra must let a new visitor experience useful value before asking for an email address, then use a
single secure email interaction to verify identity, create or resume a customer account, start the
costly formal analysis and protect the resulting report.

The target funnel is:

```text
Anonymous supported OTA listing URL
  -> low-cost rough analysis
  -> useful rough result
  -> email unlock request
  -> one-time magic link
  -> verified customer session
  -> formal Price Check
  -> authenticated report
```

## 2. Product Principles

1. **Value before identity:** an anonymous visitor receives a genuine rough result before email is
   requested.
2. **Listing-first input:** anonymous analysis starts only from a valid supported OTA listing URL;
   a property name or natural address cannot directly trigger pricing analysis.
3. **Zero configuration for new visitors:** the anonymous flow does not ask for dates, guest count
   or room type and instead captures the URL context or OTA default display context.
4. **Honest progressive disclosure:** the rough result is useful but clearly less precise than the
   formal report.
5. **Verify before cost:** expensive provider collection starts only after email verification.
6. **Customer, never Admin:** automatic account creation grants customer access only and cannot
   create or elevate an administrator.
7. **Minimal email:** one verification email is normal; a second completion email is conditional.
8. **Real progress:** motion represents actual application states and never fabricates collection.
9. **Layered abuse controls:** low-risk users are not interrupted; higher risk progressively receives
   caching, cooldown, challenge or rejection.
10. **No hidden registration:** the email form states that verification creates or resumes a Tymra
   customer account.

## 3. Scope

### 3.1 In scope

- Anonymous supported OTA listing resolution and rough result.
- Automatic use of URL-supplied pricing context or the OTA's observed default display context.
- Low-cost cached or aggregate rough analysis.
- Email verification through a one-time magic link.
- Automatic creation or resumption of a customer account after verification.
- Authenticated customer sessions and account-owned Price Checks.
- Formal Price Check started only after verification.
- Authenticated report history and result access.
- Conditional result-ready email.
- Rate limits, quotas, risk decisions, idempotency and challenge escalation.
- English and Chinese copy, responsive behaviour, accessibility and reduced motion.
- Migration away from the four-email Release 1 happy path.

### 3.2 Out of scope

- Automatic Admin access or Admin role assignment.
- Team membership, invitations and organisation roles.
- Exclusive property ownership claims.
- PMS or Channel Manager ownership verification.
- Billing, subscriptions or paid quota upgrades.
- Public report sharing by default.
- Password authentication.
- Property-name or natural-address input that directly starts pricing analysis.
- Mandatory date, guest-count or room-type selection in the new-visitor flow.
- Unapproved OTA scraping or unrestricted raw competitor export.

## 4. End-to-End User Flow

### 4.1 New visitor

1. The visitor pastes a supported New Zealand OTA listing URL. The form does not request dates,
   guest count or room type.
2. Tymra sanitizes and normalizes the URL, identifies the OTA and stable listing ID, validates that
   the listing is supported and evaluates abuse risk before starting work.
3. When the URL contains supported pricing context, Tymra uses it without asking the visitor to
   confirm it. Otherwise Tymra uses the configuration shown by the OTA's default listing view.
4. Tymra records the configuration actually observed, including any available dates, guest count,
   room or unit, rate plan, currency, tax treatment, source and capture time.
5. Tymra resolves the property and reads a recent approved cached or aggregate market snapshot for
   the normalized listing and observed context.
6. The page presents real progress stages while the rough result is prepared.
7. Tymra shows the rough result without requiring an email address.
8. The visitor selects **Unlock the formal report**.
9. The form explains that email verification will create or resume a Tymra customer account.
10. The visitor enters an email and accepts service-message and account terms. Marketing consent is
   separate, optional and off by default.
11. Tymra sends one `VERIFY_AND_SIGN_IN` email and shows a neutral confirmation response.
12. The visitor clicks the one-time magic link.
13. Tymra verifies the token, creates or finds the customer, binds the anonymous check to that
    customer, creates a session and removes the token from the browser URL.
14. Tymra starts the formal Price Check and opens its authenticated progress page.
15. If the visitor remains present, the page transitions directly to the formal report.
16. If the terminal result is not acknowledged in-page during the notification grace period, Tymra
    sends one terminal result email.

### 4.2 Returning customer

1. A returning customer may request another magic link from the same unlock or sign-in form.
2. The public response must not reveal whether the email already has an account.
3. After verification, the customer resumes the existing account and sees account-owned checks.
4. Existing unexpired sessions should not require another email for each eligible formal check.

### 4.3 Supported listing URL and default-context contract

A URL is valid for anonymous analysis only when all of the following are true:

- its hostname and URL shape belong to a configured supported OTA;
- Tymra can extract and normalize a stable listing ID;
- the listing is active, publicly resolvable and in a supported market;
- an approved provider or permitted data path can observe the listing's default display context;
- the observed context contains enough quote evidence to produce the rough result honestly.

URL handling rules:

- Remove tracking, referral, authentication and unrelated query parameters before persistence,
  logging, caching or analytics.
- Preserve only supported pricing-context fields embedded in the URL. The visitor is not required to
  review or confirm those fields.
- When supported pricing-context fields are absent, use the configuration actually returned by the
  OTA's default listing view.
- When multiple rooms or units exist, use the room or unit selected or displayed by that default
  view. Do not imply that the rough result covers every room type.
- Record the actual observed context and capture time so later results remain explainable even when
  the OTA default changes.
- URL syntax alone is not sufficient. An inaccessible, inactive, unsupported or non-price-bearing
  listing cannot start rough pricing analysis.
- A property name or natural address may support a future discovery experience, but the visitor must
  select a valid supported OTA listing before analysis starts.

### 4.4 Unsupported or insufficient rough data

- Unsupported markets show the actual coverage state and do not imply that formal analysis will
  produce a result.
- Natural addresses, property names, malformed links and unsupported OTA links show a specific input
  state and do not start pricing work.
- When the OTA default view exposes no valid quote or no identifiable default room/unit, Tymra shows
  `NO_DEFAULT_QUOTE` or an equivalent honest state and does not fabricate a price.
- When the property is identified but the rough evidence is insufficient, Tymra says so explicitly
  and may still offer a verified formal check.
- Rough failure must not be disguised as an animation timeout or a fabricated estimate.

## 5. Rough Result Contract

### 5.1 Allowed anonymous output

The rough result may include:

- matched property name and locality;
- current market coverage state;
- qualitative price position: `POSSIBLY_LOW`, `NEAR_RANGE`, or `UNCLEAR`;
- a broad estimated gap band, never false precision;
- a count or range of dates that may deserve review, without revealing the exact dates;
- preliminary confidence: `LOW`, `MEDIUM`, or `INSUFFICIENT`;
- snapshot age and a visible rough-result limitation;
- the OTA source, capture time and a concise summary of the observed default configuration;
- a clear explanation of what the formal report adds.

### 5.2 Reserved for the formal report

The anonymous result must not expose:

- exact priority dates;
- complete daily target and comparable values;
- detailed comparable evidence;
- raw provider observations;
- downloadable formal reports;
- private historical checks from any customer account.

### 5.3 Cost and freshness rules

- Rough analysis uses approved cached or aggregate evidence and must not start the formal provider
  pipeline.
- Equivalent platform, listing ID and observed pricing-context inputs reuse a server-side rough
  snapshot for six hours by default.
- Freshness and confidence are visible. A stale or insufficient snapshot produces an honest limited
  state instead of an estimate.
- The six-hour cache duration is configurable.

## 6. Customer Identity And Account Rules

### 6.1 Customer model

The customer identity is separate from `AdminUser` and should use an explicit model such as
`CustomerUser`.

Recommended customer states:

```text
ACTIVE -> SUSPENDED | DELETED
```

`PENDING` belongs to `VerificationStatus`, not to an active `CustomerUser` record.

The initial customer role is `OPERATOR`. Release 1.5 has no customer role that grants `/admin`
access.

### 6.2 Creation point

- Email submission creates a pending verification request, not an active customer account.
- Successful magic-link verification creates or resumes the customer account.
- Account creation, anonymous-check ownership transfer, session creation and formal-check enqueueing
  must be idempotent and transactionally consistent.
- Replaying the same verification request cannot create duplicate users or duplicate formal checks.

### 6.3 Property relationship

- A customer owns their Price Check records and reports, not the public property identity.
- Multiple customers may analyse the same public property.
- No Release 1.5 action claims exclusive operational ownership of a property.

## 7. Magic Link And Session Security

### 7.1 Magic link

- Generate at least 32 cryptographically random bytes.
- Store only a keyed token hash.
- Default lifetime: 15 minutes, configurable.
- Single use; successful consumption revokes it immediately.
- Bind it to the intended action and pending verification request.
- Do not put the complete token in logs, analytics, page titles, exception payloads or screenshots.
- After consumption, exchange it for a customer session and redirect to a URL without the token.
- Invalid, expired, used or revoked tokens reveal no account or property details.

### 7.2 Session

- Use an opaque server-side session with an HttpOnly, Secure and SameSite=Lax cookie.
- Default lifetime: 30 days, configurable.
- Rotate the session identifier after login and revoke it on sign-out, account suspension or deletion.
- Customer and Admin cookies, guards and authorization checks remain separate.
- Every customer report query verifies ownership server-side.

### 7.3 Account enumeration

Email submission returns the same status, timing class and user-facing message for new, existing,
blocked or unknown customer identities wherever operationally possible.

## 8. Formal Price Check And Report Access

- Formal provider collection starts only after successful verification or from an existing eligible
  authenticated session.
- Each formal check belongs to exactly one customer account.
- A customer can view only their own checks and reports.
- Formal result routes are session-protected and do not rely on a durable report token in the URL.
- Public sharing is disabled in Release 1.5. A future share link must be explicit, read-only,
  expiring and revocable.
- Existing Release 1 secure result tokens remain supported only for a bounded migration period.

Recommended customer routes:

```text
/{locale}/sign-in
/{locale}/auth/verify
/{locale}/account
/{locale}/account/checks
/{locale}/account/checks/{checkId}
```

## 9. Email Policy

### 9.1 Normal email count

A successful flow sends one email normally and no more than two when the formal result is not
acknowledged in-page during the notification grace period.

| Email | Trigger | Suppression rule |
| --- | --- | --- |
| `VERIFY_AND_SIGN_IN` | Valid unlock or sign-in request passes abuse controls | Cooldown and idempotency prevent duplicates |
| `RESULT_READY` | Formal report completes and no authenticated page acknowledges rendering it during the notification grace period | Suppress after authenticated in-page delivery is acknowledged |
| `PARTIAL_RESULT` | Formal terminal outcome is partial | Replaces `RESULT_READY` |
| `INSUFFICIENT_DATA` | Formal terminal outcome has insufficient evidence | Replaces `RESULT_READY` |
| `CHECK_FAILED` | Formal check fails terminally | Replaces `RESULT_READY` |

### 9.2 Removed happy-path triggers

- Do not send `CHECK_RECEIVED` immediately after form submission.
- Do not send `CONFIRMATION_REQUIRED` while the customer is already on the confirmation screen.
- Do not send `CHECK_PROCESSING` for a normal short-running check.
- A future long-running reminder requires a documented time threshold and a separate decision.

### 9.3 In-page delivery acknowledgement

- Publication starts a configurable two-minute notification grace period instead of immediately
  sending `RESULT_READY`.
- After the authenticated result page successfully renders the terminal result, it records an
  idempotent in-page delivery acknowledgement.
- The notification job sends the terminal email only when that acknowledgement is absent at the end
  of the grace period.
- A visibility heartbeat alone is not sufficient for suppression because an open tab may not have
  rendered the result.

### 9.4 Consent

- Verification, sign-in and report delivery are service messages.
- Marketing consent is separate, optional and unchecked by default.
- The account-creation disclosure and relevant terms are visible before email submission.

## 10. Abuse Prevention And Cost Controls

All limits are server-side, configurable and measured with privacy-preserving identifiers. A device
identifier is a first-party random cookie, not an invasive browser fingerprint. IP alone must not be
the only blocking signal because hotels and offices may share an outbound address.

### 10.1 Recommended initial limits

| Action | Initial limit | Escalation |
| --- | --- | --- |
| Rough checks per device | 5/hour and 15/day | Challenge, then cooldown |
| Rough checks per IP | 10/hour and 30/day | Challenge before block |
| Equivalent rough computation | One computation per property/query per 6 hours | Serve cached result |
| Magic-link sends per email | One per 60 seconds and 3/hour | Neutral cooldown response |
| Magic-link sends per IP | 10/hour | Challenge or temporary block |
| Formal checks per customer | First check included; then 1/day and 5/rolling 30 days during pilot | Quota response, no enqueue |

### 10.2 Risk signals

Risk evaluation may use:

- request velocity and burst patterns;
- one device cycling through many emails;
- one email cycling through many devices;
- property enumeration patterns;
- repeated unused magic links;
- disposable-email reputation as a signal, not an automatic rejection;
- challenge failures;
- prior abuse decisions and active cooldowns.

### 10.3 Risk outcomes

```text
LOW    -> allow
MEDIUM -> require challenge
HIGH   -> cooldown or reject without starting work
```

Every expensive action uses an idempotency key. Duplicate submissions cannot enqueue duplicate
provider jobs or send duplicate emails.

## 11. Motion And Interaction Requirements

Recommended rough-analysis stages:

```text
Validating the OTA listing
Capturing the default listing context
Checking market coverage
Matching the market range
Generating preliminary signals
Rough result ready
```

- Stages reflect real server state or a real completed subtask.
- Do not delay a ready result merely to finish decorative animation.
- Target perceived completion is 2-5 seconds when cached evidence is available.
- At eight seconds, replace staged motion with an honest continuing state and recovery guidance.
- Refresh and deep links restore the persisted state.
- `prefers-reduced-motion` removes non-essential movement without removing progress information.
- Animation failure cannot block the result or primary action.
- English, Chinese, keyboard, screen-reader and 320-1920px layouts are required.

## 12. Proposed State Models

Keep anonymous, verification and formal processing states separate.

```text
AnonymousCheckStatus
  CREATED -> VALIDATING_LISTING -> CAPTURING_CONTEXT -> ROUGH_ANALYSING -> ROUGH_READY
  terminal alternatives: INVALID_INPUT | UNSUPPORTED | NO_DEFAULT_QUOTE | INSUFFICIENT | FAILED | EXPIRED

VerificationStatus
  PENDING -> CONSUMED
  terminal alternatives: EXPIRED | REVOKED | BLOCKED

CustomerStatus
  ACTIVE
  terminal alternatives: SUSPENDED | DELETED

Formal PriceCheckStatus
  QUEUED -> COLLECTING -> NORMALIZING -> ANALYSING -> PUBLISHED
  terminal alternatives: PARTIAL | INSUFFICIENT_DATA | SOURCE_UNAVAILABLE | FAILED | CANCELLED
```

## 13. Proposed Data Additions

The detailed schema remains an implementation decision, but Release 1.5 needs equivalent records:

- `CustomerUser`: customer identity, encrypted email, email hash and lifecycle state.
- `CustomerSession`: opaque session hash, expiry, revocation and activity metadata.
- `MagicLink`: hashed token, purpose, expiry, consumption and risk decision.
- `AnonymousCheck`: source platform, normalized listing ID, sanitized pricing context, rough status,
  snapshot reference, expiry and optional owner.
- `RoughResult`: aggregate output, observed default configuration, capture time, confidence,
  freshness, cache key and limitations.
- `UsageLedger`: quota consumption by action and privacy-preserving subject.
- `AbuseDecision`: signals, outcome, challenge state, cooldown and audit metadata.
- `PriceCheck.customerUserId`: required for new formal checks after migration.

No table stores a plaintext magic token, plaintext long-lived session identifier, complete submitted
listing URL or unrelated OTA query parameters.

## 14. Data Retention

Recommended defaults pending privacy approval:

| Data | Default retention |
| --- | --- |
| Anonymous rough check and result | 7 days, then delete or de-identify |
| Pending verification and unused magic link | 24 hours |
| Consumed/expired token security metadata | 30 days without plaintext token |
| Rate-limit and abuse hashes | 30-90 days according to risk purpose |
| Active customer reports | Until account deletion or approved product retention limit |
| Marketing consent | According to the approved consent and withdrawal policy |

Deletion and de-identification must preserve only the minimum non-personal operational and audit
history required for security and integrity.

## 15. Analytics And Funnel Metrics

Analytics must never include email, complete natural address, complete submitted listing URL, OTA
query parameters, magic token, session identifier or secure report content.

Required aggregate events:

- `rough_check_started`
- `rough_check_completed`
- `rough_result_viewed`
- `formal_unlock_requested`
- `verification_email_queued`
- `verification_completed`
- `customer_session_created`
- `formal_check_queued`
- `formal_result_viewed`
- `abuse_challenge_required`
- `quota_reached`

Primary funnel metrics:

1. supported listing URL submission to rough-result completion;
2. rough result to unlock request;
3. unlock request to verified email;
4. verification to formal-result completion;
5. formal result to repeat authenticated check;
6. cost per rough and formal check;
7. abuse challenge, rejection and false-positive rates.

## 16. Acceptance Criteria

Each criterion remains `not_verified` until its named implementation and evidence exist. Current
criterion status is maintained in `traceability.md` so partially completed hardening is not confused
with the verified core funnel.

| ID | Acceptance criterion | Required evidence |
| --- | --- | --- |
| R15-FLOW-001 | A fresh visitor obtains a rough result without submitting an email | EN/ZH desktop/mobile E2E |
| R15-FLOW-002 | The rough result visibly distinguishes rough from formal evidence | Copy and result-contract tests |
| R15-INPUT-001 | Only a valid supported OTA listing URL can start anonymous pricing analysis; names, natural addresses and unsupported links cannot | Input contract and EN/ZH browser tests |
| R15-INPUT-002 | A new visitor is not asked to select dates, guest count or room type; supported URL context is used first and the OTA default display context otherwise | Browser and resolver integration tests |
| R15-INPUT-003 | Tymra records and discloses the observed default context and returns an honest terminal state when no valid default quote is available | Provider fixture, persistence and result-contract tests |
| R15-COST-001 | Anonymous rough work never starts the formal provider pipeline | Worker/API integration test |
| R15-ID-001 | Email submission does not activate a customer before verification | Database/API integration test |
| R15-ID-002 | A valid magic link creates or resumes one customer and one session | Auth integration and E2E |
| R15-ID-003 | Customer identity cannot access or receive Admin privileges | Authorization tests |
| R15-SEC-001 | Magic links are hashed, single-use, 15-minute and removed from the URL | Security integration and browser test |
| R15-SEC-002 | Invalid links and neutral email responses do not enumerate accounts | API and timing-class tests |
| R15-SEC-003 | Customer sessions rotate, expire, revoke and remain isolated from Admin sessions | Session lifecycle and authorization tests |
| R15-OWN-001 | A formal check is visible only to its owning customer | Cross-account authorization test |
| R15-EMAIL-001 | Happy path sends one verification email and at most one conditional terminal email | Email integration and Mailpit E2E |
| R15-EMAIL-002 | An authenticated in-page render acknowledgement suppresses the conditional terminal email within the grace period | Delivery-acknowledgement/notification integration test |
| R15-CONSENT-001 | Email unlock discloses account creation and keeps marketing opt-in separate and off | EN/ZH form, API and consent persistence tests |
| R15-ABUSE-001 | Duplicate requests do not duplicate compute, jobs, accounts or email | Idempotency integration tests |
| R15-ABUSE-002 | Configured limits produce allow, challenge and cooldown outcomes | Abuse decision table tests |
| R15-QUOTA-001 | Formal quota is enforced before provider enqueueing | Usage-ledger integration test |
| R15-MOTION-001 | Progress maps to real states and reduced motion remains complete | Browser and reduced-motion E2E |
| R15-RET-001 | Anonymous and verification records expire under the retention policy | Scheduled cleanup integration test |
| R15-AN-001 | Funnel analytics contain no email, complete address or listing URL, OTA query parameters, auth token, session ID or report content | Event contract and redaction tests |
| R15-MIG-001 | Existing Release 1 result links remain bounded and do not grant customer ownership | Migration/security test |

## 17. Migration From Release 1

1. Preserve existing Release 1 checks and immutable result versions.
2. Introduce customer identity and anonymous-check records without retroactively assigning ownership.
3. Add the anonymous rough flow alongside the current flow behind a development feature flag.
4. Add magic-link authentication and authenticated report routes.
5. Start new formal checks only after verification.
6. Replace the Release 1 four-email happy path with the Release 1.5 email policy.
7. Keep old secure result links for their existing bounded lifetime; do not silently convert a bearer
   link into customer ownership.
8. Remove or archive the legacy unauthenticated creation path after migration acceptance passes.

## 18. Product Decisions Still Requiring Approval

The recommended defaults above can drive implementation, but these external product decisions need
explicit approval before production launch:

- final customer-account disclosure and terms copy;
- final privacy retention periods;
- challenge provider selection;
- pilot quotas after observing real provider cost and false positives;
- whether the included first formal check becomes a permanent free entitlement;
- future billing, team accounts, property verification and report sharing.

The supported-OTA-link and automatic default-context input contract is product-approved in D-025.
It remains `not_implemented` and requires the R15-INPUT acceptance evidence above.

Until approval and implementation evidence exist, this entire Release 1.5 baseline is
`not_implemented` and `not_verified`.
