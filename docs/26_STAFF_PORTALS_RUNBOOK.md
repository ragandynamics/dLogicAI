# dLogicAI staff portals

Three independent Worker entrypoints share the reviewed staff API and UI implementation:

| Portal | Package | Local port | Effective capabilities |
| --- | --- | --- | --- |
| System admin | apps/system-admin | 8791 | Usage, billing, issue workflow, guardrails, global channel AI switch, staff roster and diagnostics |
| Operations | apps/operations | 8792 | Usage, billing records, issue workflow, guardrails and diagnostics |
| Billing | apps/billing | 8793 | Usage, tenant balances, purchases, invoices, ledger, billing events and issue workflow |

The source-of-truth requirements are in [25_STAFF_PORTALS_SPEC.md](25_STAFF_PORTALS_SPEC.md). Staff notes remain internal; problem status/progress is also reflected in the tenant interface. Case histories show the latest 100 updates. Lists are paginated in groups of 50, with an All time period option.

## Local validation

From the repository root:

- `pnpm check:staff`: shared implementation and all entrypoints type-check.
- `pnpm --filter @dlogicflow/api test`: includes Access signature/claims, role boundaries, issue concurrency, audit rollback, source queries and guardrail/accounting tests.
- `pnpm build:staff`: three separate Wrangler dry builds. No deployment.
- Each package has a `dev` script. Its committed config uses a placeholder local D1 ID and empty Access configuration, so data access fails closed until configured. There is no production authentication bypass.

## Deployment prerequisites

Use the matching environment's application database, including existing migrations and additive migration 032. Do not apply the entire migration directory blindly to an existing environment. Review the existing applied migration history, particularly the earlier channel bundle.

Create three Cloudflare Access applications with separate audiences, covering each staff hostname. Enforce staff identity/MFA in Access policies and configure the Worker issuer/audience. The Worker independently validates the Access JWT signature, issuer, expiry and audience, then checks platform_staff on every request. Cloudflare documentation: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/

After an authorized database migration, explicitly grant the approved staff identity using the database administration process. For example, replacing STAFF_EMAIL with an approved Access identity:

```sql
INSERT INTO platform_staff (email,role,active,created_at)
VALUES ('STAFF_EMAIL','platformadmin',1,unixepoch()*1000);
```

Other roles are operations and billing. Revoke a grant by setting active=0 for that email; subsequent requests are rejected. No tenant role, environment email list or default account grants staff access. Staff provisioning remains an operator action, not a public registration route.

Prepare three reviewable release configs without deploying:

```text
node scripts/prepare-staff-release.mjs environment=uat database_id=<D1_UUID> database_name=<D1_NAME> issuer=https://<TEAM>.cloudflareaccess.com system-admin_audience=<ADMIN_AUD> operations_audience=<OPS_AUD> billing_audience=<BILLING_AUD> bucket=<EXISTING_ATTACHMENTS_BUCKET>
```

Files go under .tmp/staff-release/uat/. Access audience IDs and issuer are configuration, not payment credentials. The optional DATA_BUCKET binding enables authenticated, audited screenshot downloads from existing problem reports. Without it, screenshot requests report that storage is not configured. No platform payment secrets or provider keys are required by staff Workers.

Release only after reviewing the generated bindings and source, applying the approved additive migration, creating explicit staff grants and authorizing the deployment. Run signed-in smoke checks for each role and confirm tenant accounts cannot access staff routes. Verify that direct Worker requests without Access assertions fail.

## Operational limits

- Payment and invoice views display local platform records. They do not issue payments/refunds, expose card data, or claim live Stripe reconciliation. Credit-purchase source records lack currency; the UI labels their amounts as minor units rather than inventing a currency.
- System diagnostics expose stored request/channel/delivery statuses and codes. Platform/tenant audit views omit arbitrary metadata and raw provider errors. This is not a Cloudflare log-tail connection.
- Guardrails apply to new AI calls from Web Chat, Telegram and WhatsApp; in-flight requests may finish. Existing tenant API requests outside these channels retain their current behavior. Max output tokens is bounded by the existing managed-provider ceiling; increasing the staff setting does not bypass that ceiling.
- Reply item/character limits constrain delivered/persisted nonstreaming text. Actual provider token usage still determines accounting. Rich HTML, multi-completion generation and provider-specific structured-output schemas are not introduced.
- Platform support email is configuration metadata. Saving it sends no messages. Case notes are internal; this release does not email contacts or staff.
