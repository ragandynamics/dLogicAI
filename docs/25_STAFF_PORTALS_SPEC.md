# Staff portals

User scope: three independent Cloudflare Workers for system administration, operations and billing. These are local implementation artifacts until a release is explicitly authorized.

## Authorization

Cloudflare Access application JWTs must be verified cryptographically against the configured team issuer and unique application audience. An explicit active platform_staff grant is also required. Tenant roles confer no staff privileges. A platformadmin can enter all portals; operations and billing can enter only their own portal. Each portal applies its own permission ceiling, even for a platformadmin visiting the billing portal. Mutations require same-origin JSON requests. No public staff signup or development authentication bypass.

## Capabilities

System admin controls platform feature availability and tenant feature restrictions; operations has read-only availability access. Planned runtimes cannot be activated. Changes are version-checked and audited. Runtime and retirement semantics are specified in [28_FEATURE_AVAILABILITY.md](28_FEATURE_AVAILABILITY.md).

All portals: cross-tenant usage summaries, tenant billing balances/subscription data, paginated tenant directory, problem reports and contact enquiry queues, case detail/history, assignment among platformadmin/operations/billing, status transitions and required progress notes. Tenant problem-report status/progress is synchronized; staff notes remain internal.

System admin and operations: channel guardrail configuration, persisted platform audit and system diagnostics (usage, delivery and channel event metadata). Billing: payment records, invoices, credit ledger and billing-event diagnostics. System admin only: global AI enable/disable and support contact settings, staff roster.

## Guardrails

Per Web Chat/Telegram/WhatsApp limits: enabled flag, maximum input characters, output tokens, reply items and output characters. Maximum outputs means top-level reply items (paragraphs or list entries), not repeated AI calls. Runtime caps apply before provider invocation and before persisting/delivering the answer. Existing token-based billing uses actual provider usage, including generated text removed by presentation caps. Global AI disable applies to new widget and social-channel AI calls. In-flight calls may complete.

## Data and workflow

Source records remain in service_requests and public_contact_leads. Staff assignment, status and version reside in platform_cases. Updates use optimistic concurrency; notes and audit events commit with the case change. Raw provider errors, credentials, webhook payloads and tokens are excluded from diagnostics. Payment views show recorded local billing data and currency where stored; they do not claim to be a live Stripe reconciliation or perform refunds/charges. Platform audit is persisted administrative history; system diagnostics are persisted application events, not a live Cloudflare log tail.

## Deployment

Migration 032 is additive and must precede staff/runtime release. Configure a distinct Access audience per Worker, Access policies with MFA at the identity provider, shared environment-specific D1 bindings and explicit staff grants. No default staff account is seeded. Direct requests lacking a valid Access assertion fail closed. Cloudflare reference: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
