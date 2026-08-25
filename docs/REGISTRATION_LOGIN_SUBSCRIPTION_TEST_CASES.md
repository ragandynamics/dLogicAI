# dLogicAI Registration, Login, and Subscription Test Cases

## Test metadata

- Scope: registration, login, session cookies, tenant isolation, subscription checkout, billing portal, Stripe webhook handling
- Environments: local or UAT
- Required configuration: migrated D1 database, API and web running, configured Stripe test keys and webhook secret for Stripe cases
- Test account convention: use unique email addresses such as `qa+<case-id>@example.test`
- Expected API error shape: `{ "error": { "code": "...", "message": "..." } }`

## Execution notes

1. Start the API and web applications using the commands in the repository README.
2. Open the web application origin in a private browser window.
3. Use Stripe test mode only. Never place real credentials or payment data in this document.
4. Capture the actual URL, response status, and relevant database state for every failed case.

## Test cases

| ID | Priority | Area | Test |
|---|---|---|---|
| REG-001 | P0 | Registration | Create an account with a valid name, unique email, and password of at least 10 characters. Verify a 201 response, session cookie, user, tenant, owner membership, Free subscription, and initial credits. |
| REG-002 | P1 | Registration | Submit malformed JSON or invalid fields. Verify a 400 `INVALID_JSON` or `INVALID_REQUEST` response and no user, tenant, membership, subscription, or session is created. |
| REG-003 | P1 | Registration | Register with an existing email using different letter casing. Verify a 409 `EMAIL_EXISTS` response and no second account is created. |
| REG-004 | P0 | Registration and checkout | Register while Stripe is configured. Verify the browser is redirected to Stripe Checkout for the Developer plan with a 7-day trial, then return to `/dashboard/billing?checkout=success` after successful test payment. |
| REG-005 | P1 | Registration recovery | Register while Stripe Checkout is unavailable or the price is not configured. Verify the account remains usable, the browser reaches `/dashboard/billing?checkout=unavailable`, and retrying Developer checkout preserves the 7-day trial. |
| LOG-001 | P0 | Login | Sign in with valid credentials. Verify a new session cookie is issued and `/dashboard` loads authenticated data. |
| LOG-002 | P1 | Login | Sign in with an incorrect password or unknown email. Verify a 401 `INVALID_CREDENTIALS` response and no authenticated session. |
| LOG-003 | P1 | Login | Sign in with email casing and surrounding whitespace differences. Verify normalization allows the valid account to authenticate. |
| LOG-004 | P0 | Session isolation | Create two tenants and memberships for one user in the database. Verify the available tenant-selection workflow binds the session to the selected tenant and never resolves a tenant by arbitrary membership ordering. If tenant selection is unavailable, mark the case `BLOCKED` against the pending organization-switching work rather than accepting arbitrary selection. |
| LOG-005 | P1 | Logout | Sign in, call logout, then reload `/dashboard` and call `/v1/me`. Verify the session is rejected and `/v1/me` returns 401. |
| BILL-001 | P0 | Billing authorization | As an owner, open the subscription page and load the subscription and catalog. Verify both authenticated requests succeed and only the active tenant's subscription is returned. |
| BILL-002 | P0 | Billing authorization | As an admin, change from Free to a paid plan. Verify the API returns `checkout_required` and does not directly activate the paid plan before Stripe confirmation. |
| BILL-003 | P0 | Billing authorization | As a member, attempt subscription change, Stripe Checkout, and billing portal requests. Verify each returns 403 `FORBIDDEN` and no billing state changes. |
| BILL-004 | P1 | Billing authorization | Without a session, request subscription, Checkout, and portal endpoints. Verify each returns 401 `UNAUTHORIZED`. |
| BILL-005 | P0 | Checkout URL validation | Submit Checkout success/cancel URLs from an unconfigured origin, a different path, or a non-HTTP scheme. Verify the API returns 400 `INVALID_URL` and does not create a Stripe Checkout session. |
| BILL-006 | P1 | Checkout | Submit configured billing-page URLs and a valid paid plan as owner/admin. Verify the response contains a Stripe Checkout URL and session ID. |
| BILL-007 | P1 | Portal | As owner/admin with a Stripe customer, submit the configured billing-page return URL. Verify a billing portal URL is returned. Reject an unconfigured return URL with 400 `INVALID_URL`. |
| BILL-008 | P0 | Webhook | Send a valid signed `checkout.session.completed` test event. Verify the tenant subscription is updated with the plan, customer, subscription ID, and trial/active status. |
| BILL-009 | P0 | Webhook idempotency | Send the same successfully processed event twice. Verify the second request returns `duplicate: true` and does not create duplicate state changes. |
| BILL-010 | P0 | Webhook retry | Cause a signed event to fail processing, then resend the same event after correcting the cause. Verify the stored event transitions from `failed` to `received` and is processed successfully on retry. |
| BILL-011 | P1 | Webhook security | Send an invalid or expired Stripe signature. Verify a 400 `INVALID_SIGNATURE` response and no database changes. |
| BILL-012 | P1 | Subscription UI | Cancel Checkout and return to `/dashboard/billing?checkout=cancelled`. Verify the page reports cancellation and the subscription remains unchanged. |
| BILL-013 | P1 | Subscription UI | Complete Checkout and return before the webhook is observed. Verify the page communicates that Stripe confirmation is pending and does not claim activation solely from the query string. |
| BILL-015 | P0 | Checkout confirmation | Complete Checkout and return with `session_id`. Verify the authenticated confirmation request validates the session tenant, updates the subscription, and the Developer plan becomes the current plan after the page reloads. |
| BILL-016 | P0 | Upgrade options | With Free active, verify Developer, Pro, and Business are enabled while Free is disabled. With Developer active, verify Free and Developer are disabled while Pro and Business are enabled. With Pro active, verify Free, Developer, and Pro are disabled while Business is enabled. With Business active, verify every plan button is disabled. |
| BILL-017 | P1 | Upgrade API protection | Directly request a plan at or below the current configured monthly price. Verify the API returns 409 `PLAN_NOT_UPGRADE` and does not change the subscription. |
| BILL-018 | P0 | Subscription period | After a new subscription Checkout completes, verify the billing page current period start matches the Stripe subscription start date and the end matches its expiry/current period end. After renewal, verify both dates refresh from the renewal webhook. |
| BILL-019 | P0 | Existing subscription upgrade | With an existing Stripe subscription active, select a higher plan. Verify a new Stripe Checkout subscription is created, the old subscription is canceled only after successful Checkout, and the local current plan refreshes to the selected plan. |
| BILL-020 | P0 | Upgrade period start | Upgrade an existing subscription and verify the displayed current period start equals the upgrade date/time, while the current period end remains the Stripe subscription expiry. Verify a later renewal advances the period start and end. |
| BILL-021 | P0 | Replacement subscription cleanup | Complete a Checkout flow that creates a new Stripe subscription for a tenant with an existing Stripe subscription. Verify the old subscription is canceled, the new subscription ID is stored, and retrying the webhook does not fail if the old subscription is already canceled. |
| BILL-022 | P1 | Plans endpoint compatibility | Request `/v1/plans` and `/v1/billing/catalog`. Verify both return the configured plans and the frontend service uses the canonical catalog endpoint. |
| BILL-023 | P0 | Trial activation timing | Register with the Developer trial. Immediately after Checkout, verify Free remains the current plan, Developer is marked trial pending, and the trial expiry is displayed. After Stripe reports the trial as ended, verify Developer becomes the current plan. |
| BILL-024 | P0 | Trial expiry date | Verify the Developer trial expiry uses Stripe's `trial_end` timestamp and never displays `1/1/1970` when Stripe has not supplied a valid trial end. |
| BILL-025 | P0 | Free trial period display | During a pending Developer trial, verify the active Free plan current period starts on the subscription date and ends seven days later, matching the trial expiry rather than the default 30-day Free period. |
| BILL-026 | P1 | RAG plan entitlements | Verify billing catalog and plan cards expose configurable knowledge-base, document, storage-byte, and vector-chunk limits. Zero values display as `Not included`; configured values display with readable units. |
| BILL-014 | P1 | Migration | Apply all local migrations to a clean local D1 database. Verify billing columns, Stripe event storage, and session `tenant_id` exist and no migration fails because an index precedes its column. |
| SEC-001 | P0 | CORS | Send credentialed requests from an origin listed in `CORS_ORIGINS` and from an unlisted origin. Verify only configured origins receive the matching CORS response headers. |
| SEC-002 | P0 | Tenant isolation | Authenticate as Tenant A and request Tenant B subscription, credits, or dashboard resources without changing the session tenant. Verify Tenant B data is never returned or modified. |
| SEC-003 | P1 | Analytics consent | Configure `PUBLIC_GA_MEASUREMENT_ID`. Verify GA4 does not load before consent, loads after acceptance, and remains unloaded after rejection while authentication continues to work. |
| SEC-004 | P1 | API key lifecycle | Create a key, verify the secret is shown once, deactivate it, verify it is listed as revoked, and verify it can no longer authenticate API requests. |
| SEC-005 | P1 | Account lifecycle | Deactivate an account with explicit confirmation, verify all sessions are revoked, future login is rejected, and tenant-owned data remains unchanged. |
| SEC-006 | P1 | Password policy | Reject registration passwords missing length, lowercase, uppercase, number, or special-character requirements; accept a valid password and verify the show/hide control does not alter its value. |

## Minimum release gate

A release must not proceed if any P0 case fails. For Stripe cases, record the Stripe test event ID and avoid recording secrets, payment details, or raw provider response bodies.

## Result record

| ID | Result (`PASS`/`FAIL`/`BLOCKED`) | Evidence or defect reference |
|---|---|---|
| REG-001 |  |  |
| REG-002 |  |  |
| REG-003 |  |  |
| REG-004 |  |  |
| REG-005 |  |  |
| LOG-001 |  |  |
| LOG-002 |  |  |
| LOG-003 |  |  |
| LOG-004 |  |  |
| LOG-005 |  |  |
| BILL-001 |  |  |
| BILL-002 |  |  |
| BILL-003 |  |  |
| BILL-004 |  |  |
| BILL-005 |  |  |
| BILL-006 |  |  |
| BILL-007 |  |  |
| BILL-008 |  |  |
| BILL-009 |  |  |
| BILL-010 |  |  |
| BILL-011 |  |  |
| BILL-012 |  |  |
| BILL-013 |  |  |
| BILL-014 |  |  |
| BILL-015 |  |  |
| BILL-016 |  |  |
| BILL-017 |  |  |
| BILL-018 |  |  |
| BILL-019 |  |  |
| BILL-020 |  |  |
| BILL-021 |  |  |
| BILL-022 |  |  |
| BILL-023 |  |  |
| BILL-024 |  |  |
| BILL-025 |  |  |
| BILL-026 |  |  |
| SEC-001 |  |  |
| SEC-002 |  |  |
| SEC-003 |  |  |
