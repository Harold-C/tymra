# Membership server modules

This folder owns customer authentication, entitlements and usage, abuse/risk controls, Magic Link
support used by member workflows, customer check projections and Stripe billing reconciliation.
Route handlers remain thin callers of these modules. General Price Check orchestration stays in the
parent `server` folder and crosses this boundary through explicit membership services.

