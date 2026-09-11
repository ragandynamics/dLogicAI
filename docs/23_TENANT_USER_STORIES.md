# dLogicAI Tenant User Stories

## Purpose

These stories translate the approved tenant, channel, interaction-engine,
governance, and subscription requirements into testable product behavior. They
describe intended behavior; implementation status remains tracked in
`PROJECT_STATE.md` and `docs/21_SPEC_COMPLIANCE_MATRIX.md`.

## Terminology and decisions

- **Tenant** and **workspace** refer to the same organization boundary.
- The first subscriber becomes the tenant **super admin**. In the current data
  model this maps to the `owner` role; user-facing copy may say “Super admin”.
- Supported tenant roles are `super_admin`, `admin`, `developer`, `billing`, and
  `sales_operations`.
- Only the super admin may change subscription plans, change tenant account
  status, terminate the tenant, transfer ownership, or change another user's
  email address. This resolves the conflicting source statements about admin
  billing and termination rights.
- An admin may manage users, services, channels, knowledge, flows, and operating
  configuration, but not subscription or tenant account status.
- A **channel** is a customer-facing or knowledge input capability. An
  **adapter** is its configured tenant instance. A Chat Service supplies the
  conversational policy used by one or more adapters.
- “Transactions” means tenant-scoped channel or connector interaction records,
  not necessarily payment transactions.

## Role permissions

| Capability | Super admin | Admin | Developer | Billing | Sales operations |
|---|---:|---:|---:|---:|---:|
| Manage subscription and tenant status | Yes | No | No | View only | View expiry only |
| Invite users and assign non-owner roles | Yes | Yes | No | No | No |
| Change another user's email | Yes | No | No | No | No |
| Create/configure adapters and flows | Yes | Yes | Yes | No | No |
| Obtain development API keys | Yes | Yes | Yes | No | No |
| Promote to staging/production | Approve | Request/manage | Request/manage | No | No |
| View billing transactions and audit | Yes | Yes | No | Yes | No |
| View operational dashboards | Yes | Yes | Yes | Limited | Yes |
| Manually respond to conversations | Yes | Yes | Optional by grant | No | Yes |
| Delete conversations | Yes | Yes | Only if granted | No | Only if granted |

Role enforcement must occur in the API. Hiding a control in the frontend is not
authorization.

## Epic A — Tenant onboarding and access

### US-TEN-001 — Create the initial tenant

As a new subscriber, I want registration to create my workspace and make me its
super admin so that I can configure the tenant immediately.

Acceptance criteria:

- Registration creates one user, tenant, super-admin membership, Free
  subscription, initial AI-credit account, and tenant-bound session.
- The operation is atomic and does not leave partial tenant state.
- The user is directed to a role-aware Getting Started journey.

### US-TEN-002 — Invite tenant users

As a super admin or admin, I want to invite people as admin, developer, billing,
or sales operations users so that each person receives appropriate access.

Acceptance criteria:

- Invitations are tenant-scoped, expire, and can be listed, resent, and revoked.
- A new recipient can register or sign in, accept the invitation, and enter the
  invited workspace without losing the invitation token.
- An existing user is notified and must accept before membership is activated.
- The API prevents assigning or creating another super admin through a normal
  invitation.

### US-TEN-003 — Manage tenant users

As a super admin, I want to update a tenant user's email and manage their role so
that tenant access remains accurate.

Acceptance criteria:

- Only the super admin can change another user's email.
- Email changes require uniqueness checks, re-verification, audit evidence, and
  invalidation of outstanding verification/reset tokens.
- Super admins and admins may change non-owner roles or remove users, subject to
  plan limits and ownership safeguards.
- The last super admin cannot be removed or deactivated without transferring
  ownership or terminating the tenant.

### US-TEN-004 — Work across multiple tenants

As a user belonging to multiple tenants, I want to select and switch my active
workspace so that every action occurs in the intended tenant.

Acceptance criteria:

- Login requires an explicit tenant selection when multiple memberships exist.
- Tenant names—not internal IDs—are displayed.
- The application shell displays and switches the active tenant.
- Switching validates membership and refreshes role, plan, and tenant-scoped
  data; tenant IDs supplied by clients are never blindly trusted.

### US-TEN-005 — Control tenant lifecycle

As a super admin, I want to manage subscription and tenant account status so that
I control commercial and lifecycle decisions.

Acceptance criteria:

- Only the super admin can change plans, suspend/reactivate the tenant, transfer
  ownership, or terminate the tenant.
- Destructive actions require explicit confirmation and are audited.
- User-account deactivation, leaving a tenant, and tenant termination are
  distinct actions.

## Epic B — Channel and knowledge catalogue

### US-CHN-001 — Browse channel groups

As an admin or developer, I want a tile-based catalogue grouped by capability so
that I can quickly find the integration I need.

Acceptance criteria:

- Top-level tiles include Interaction, Commerce, Social & Engagement, Voice,
  Input, Knowledge Sources, and Business Systems.
- Selecting a group displays only its supported channel types and clearly marks
  Available, Beta, Coming soon, and plan-restricted items.
- Search and filtering use accessible names and do not imply that unavailable
  adapters are operational.

Channel catalogue:

| Group | Channel types |
|---|---|
| Interaction | WhatsApp, Email, Web Chat, Messenger, Telegram, SMS |
| Commerce | Shopee, Lazada, TikTok Shop, Shopify, WooCommerce |
| Social & Engagement | Instagram, Facebook, LinkedIn, TikTok |
| Voice | Phone, IVR, Voice, Video |
| Input | Contact, Enquiry, Quote, Booking, Support forms |
| Knowledge Sources | FAQ, SOP, Policies, Documents, Manuals, Product/Service knowledge |
| Business Systems | CRM, ERP, Accounting, Booking, Inventory, Payment, extensible operational systems |

### US-CHN-002 — Configure an adapter

As an admin or developer, I want one consistent adapter-creation workflow so that
WhatsApp, Web Chat, Telegram, TikTok, Shopee, Lazada, and later adapters are easy
to configure.

Acceptance criteria:

- The flow is: select group → select channel → name adapter → configure
  credentials/settings → select or create Chat Service → select or customize a
  dialog-flow template → attach knowledge → validate → preview → save.
- Credentials are encrypted, write-only, tenant/project scoped, and never shown
  again.
- Saving creates a testing/inactive adapter; activation or promotion is a
  separate authorized action.
- Each adapter may use its own dialog flow and knowledge attachments.
- Platform-specific configuration remains behind the adapter abstraction.

### US-CHN-003 — Integrate a configured adapter

As a developer, I want an adapter key, working example, integration code, and
emulator so that I can reach a successful test quickly.

Acceptance criteria:

- The adapter exposes only the least-privileged public or server-side credential
  appropriate to that channel.
- Copyable examples identify where secrets must remain server-side.
- The emulator runs against the saved testing configuration and displays
  validation, response, latency, and safe diagnostic information.
- The adapter shows inactive, testing, active, degraded, or disabled status.

### US-CHN-004 — Promote an adapter

As a developer, I want to test and request promotion to staging or production so
that releases follow tenant approval controls.

Acceptance criteria:

- A saved version is immutable for promotion and has validation/test evidence.
- Plan entitlements and required approvals are checked before promotion.
- Production promotion requires super-admin/admin approval according to tenant
  policy and records actor, version, environment, and time.
- Rollback restores a previously approved version without exposing credentials.

### US-CHN-005 — Release channels incrementally

As the platform operator, I want channel groups and adapters feature-flagged so
that new capabilities can be released safely without affecting existing tenants.

Acceptance criteria:

- Availability can be controlled by environment, plan, tenant, and beta cohort.
- Disabled capabilities reject runtime traffic consistently and retain existing
  configuration.

## Epic C — Interaction engine and outcomes

### US-INT-001 — Determine the next action

As a tenant operator, I want the Interaction Engine to combine customer identity,
conversation context, knowledge, goals, journeys, templates, and business rules
so that each response advances the intended outcome.

Acceptance criteria:

- Resolution is tenant-, project-, Chat-Service-, and adapter-scoped.
- Provider behavior stays behind the provider abstraction.
- Knowledge provenance, dialog state, applied rules, and outcome evidence are
  traceable without exposing prompts, secrets, or sensitive customer data.
- Usage and credits are reserved before external AI invocation and settle
  idempotently afterward.

### US-INT-002 — Measure outcomes

As a tenant operator, I want interactions classified through Engage → Qualify →
Act → Transact → Support → Retain so that business value can be measured.

Acceptance criteria:

- Each configured flow defines its relevant stages, milestones, and terminal
  outcomes rather than forcing every conversation through every stage.
- Outcome transitions record evidence, timestamp, conversation, adapter, and
  actor/system source.
- Dashboards aggregate conversion and drop-off without crossing tenant boundaries.

### US-INT-003 — Design and preview flows

As an admin or developer, I want a distinct full-page flow designer with multiple
templates and live preview so that I can build and validate channel experiences.

Acceptance criteria:

- The designer supports states, transitions, slots, validation rules, business
  actions, milestones, and outcomes.
- Templates are available by channel and common business scenario.
- Developers can clone and customize templates without changing the source
  template.
- Live preview clearly identifies simulated versus real external actions.

### US-INT-004 — Protect interaction inputs

As a tenant security administrator, I want input validation and prompt-injection
controls so that untrusted channel content cannot override system policy or
expose tenant data.

Acceptance criteria:

- Size, type, schema, and encoding validation occurs before orchestration.
- Untrusted content is separated from system instructions and retrieved
  knowledge.
- Tool/connector actions use allowlists, scoped authorization, and server-side
  validation; model output alone cannot authorize a sensitive action.
- Suspected injection and blocked actions generate safe security events.

## Epic D — Operations, monitoring, and governance

### US-OPS-001 — Monitor tenant operations

As a sales operations user, I want graphical near-real-time dashboards so that I
can monitor transactions, adapter/service status, and subscription expiry.

Acceptance criteria:

- Dashboards show scoped volumes, outcomes, failures, response times, active
  adapters, service health, and plan expiry/renewal state.
- Data freshness and time zone are visible.
- Sales operations users cannot access secrets or mutate billing configuration.

### US-OPS-002 — Take over conversations

As a sales operations user, I want to pause automation and respond directly so
that a person can handle sensitive or high-value queries.

Acceptance criteria:

- Authorized users can pause/resume automation and send a tenant-scoped reply.
- Manual replies identify the actor and channel-delivery result.
- Automation cannot race with a paused conversation.

### US-OPS-003 — Track transactions and logs

As an authorized tenant user, I want searchable channel transactions, delivery
state, token usage, and operational logs so that I can diagnose activity.

Acceptance criteria:

- Records include request/transaction ID, adapter, channel, service, outcome,
  status, latency, input/output tokens, timestamps, and safe error classification.
- Sensitive credentials, raw provider errors, and unnecessary message content are
  excluded or redacted.
- Tenant-configured tags can group adapters for dashboard reporting.

### US-OPS-004 — Delete conversations safely

As an authorized tenant user, I want to delete a conversation so that I can meet
customer or governance requirements.

Acceptance criteria:

- Permission is explicit by role or tenant policy.
- Deletion covers or tombstones messages, attachments, derived intelligence, and
  searchable indexes according to the retention policy.
- The action is auditable without retaining prohibited conversation content.

### US-GOV-001 — Apply retention and archival

As a tenant governance user, I want predictable retention so that operational
data is controlled and audit evidence is preserved.

Acceptance criteria:

- Channel transaction data moves to tenant-scoped R2 archival storage after 90
  days and is removed from the operational store after successful archival.
- Operational logs are deleted after 90 days unless a stricter legal hold or
  configured policy applies.
- Audit records are retained for three years, remain tamper-evident, and are
  tenant scoped.
- The tenant can view the effective governance policy and archive status.

### US-GOV-002 — Delete knowledge sources after indexing

As an authorized tenant administrator, I want original knowledge documents
deleted after successful indexing so that storage and data exposure are reduced.

Acceptance criteria:

- Deletion is opt-in and occurs only after extraction/index verification.
- Chunks, provenance metadata, checksum, and audit evidence remain according to
  policy; the original file is no longer downloadable.
- Failed processing never deletes the source.

### US-GOV-003 — Audit tenant administration

As a super admin or billing user, I want tenant audit history so that I can review
security, billing, user, configuration, promotion, and deletion actions.

Acceptance criteria:

- Audit events identify tenant, actor, action, target, timestamp, request ID, and
  safe before/after metadata.
- Billing users have read-only access; exports are access-controlled and audited.

## Epic E — Plans, billing, and entitlements

### US-BIL-001 — Enforce plan capabilities

As a tenant subscriber, I want the plan to clearly govern my capabilities so
that limits and upgrade requirements are predictable.

Acceptance criteria:

- Configurable entitlements include channel/adaptor counts, API keys, features,
  storage, knowledge limits, AI credits, per-transaction token limits, and
  transaction safeguards.
- Limits are checked atomically where concurrency could overspend an allowance.
- The UI shows current use, remaining allowance, and upgrade options using the
  same canonical pricing/entitlement data as the API.

### US-BIL-002 — Handle expired subscriptions

As a tenant subscriber, I want controlled behavior after subscription expiry so
that existing data is safe while further consumption is prevented.

Acceptance criteria:

- An expired tenant cannot create new resources, activate/promote adapters, or
  initiate billable AI/connector work.
- Existing resources remain readable according to a configurable grace policy.
- Super admins and billing users can still access billing, export, and renewal
  functions.
- Renewal restores entitled operations without duplicating allowances.

### US-BIL-003 — Review billing history

As a billing user, I want transaction history, usage logs, invoices, credits, and
audit evidence so that I can reconcile charges.

Acceptance criteria:

- Billing data is read-only for the billing role and scoped to the active tenant.
- Provider cost, customer charge, credit reservation/settlement/refund, channel
  charges, and connector charges reconcile by request or transaction ID.
- Only the super admin can initiate a plan change or tenant termination.

### US-BIL-004 — Track configurable usage

As a tenant administrator, I want input/output token and transaction limits
configured by plan so that usage remains within commercial and safety bounds.

Acceptance criteria:

- Token and transaction limits are configuration-driven, versioned, and enforced
  before provider invocation where applicable.
- Streaming and non-streaming accounting converge on the same settlement rules.
- Limit failures are clear, do not call the provider unnecessarily, and leave no
  stuck reservation.

## Delivery scope

### MVP release gate

- Tenant creation with super-admin ownership and explicit active tenant.
- Admin/developer/billing/sales-operations authorization model and role-aware UI.
- Complete invitation acceptance and workspace switching journeys.
- Tile catalogue with only actually available adapters marked available.
- Text-only Web Chat, Telegram, and WhatsApp adapters behind activation gates.
- Adapter configuration, testing status, dialog-flow/knowledge attachment, safe
  example, and preview.
- Core operational dashboard, manual conversation takeover, plan enforcement,
  accounting reconciliation, and audit events.
- Input validation, tenant isolation, prompt/tool safety, and documented
  retention behavior.

### Incremental releases

- Email, Messenger, and SMS interaction adapters.
- Commerce adapters: Shopee, Lazada, TikTok Shop, Shopify, WooCommerce.
- Social, voice/video, structured input-form, and business-system adapters.
- Automated R2 archival, full three-year audit lifecycle, advanced outcome
  analytics, and generalized promotion approvals.

## Traceability to submitted requirements

| Requirement numbers | Stories |
|---|---|
| 1–7, 16, 20–24, 27, 34–36, 41–42 | US-CHN-001 through US-CHN-005; US-INT-003 |
| 8–9 | US-INT-001, US-INT-002 |
| 10, 12–15, 18–19 | US-TEN-001 through US-TEN-005; US-OPS-001/002; US-BIL-003 |
| 26, 28–29, 31, 33, final conversation deletion | US-OPS-003/004; US-GOV-001 through US-GOV-003 |
| 30, 32, 38, 40 | US-BIL-001 through US-BIL-004; US-OPS-001 |
| 37 | US-CHN-004, US-CHN-005 |
| 39 | US-INT-004 |

