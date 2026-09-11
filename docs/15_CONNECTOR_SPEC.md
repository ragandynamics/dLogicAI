# dLogicAI Connector Specification
Connector framework should support external systems such as CRM, ERP, REST/GraphQL APIs, databases and collaboration/storage systems.

## Requirements
- Connector definitions.
- Encrypted credentials/secrets.
- Scoped permissions.
- Execution abstraction.
- Usage tracking.
- Included API-call allowance.
- Billable overage.
- Retries and asynchronous execution where appropriate.

## Business runtime implementation scope (2026-09-10)

The user selected HubSpot as the first native CRM. The runtime also supports a tenant-operated Business API bridge. Existing marketplace adapters remain placeholders. Messaging delivery adapters remain separate from business connectors.

### Ownership and response access

- Installations belong to a tenant and project; project ownership separates development and production.
- Owners/admins configure encrypted credentials, explicitly selected customer-visible fields, operations and freshness. Real read verification is required before activation. Verification does not claim write-scope validation.
- Chat Services explicitly attach installations and optionally enable live lookup. Widgets may disable business data and flow-generated business actions. Widget presentation templates cannot grant connector access.
- Anonymous conversations can retrieve only public bridge records. HubSpot profiles are always customer-private. Customer identity is issued only to project server API keys, after the tenant backend authenticates its customer; subject IDs are mapped per installation, not globally across CRM accounts.
- Five-minute signed identity assertions bind tenant, project, service, conversation and installation-specific customer IDs. A widget session cannot change customer or downgrade to anonymous after using private context. The tenant site renews assertions through its own authenticated backend.
- Reference data is bounded and explicitly treated as untrusted material. Live failures are disclosed; expired records are excluded. Private fields are never selected by the language model. Contact field selection is a disclosure decision, not just an indexing preference.

### Incoming data

- HubSpot: bounded, paginated contact sync and live contact-ID lookup, using the configured property allowlist. The native adapter never uses a visitor's message or claimed email as proof of contact ownership.
- Business API bridge: signed, timestamped event batches; public/customer visibility; subject filtering; record versions; source/freshness metadata; delete tombstones; atomic event deduplication and record writes.
- Scheduled sync processes at most three due installations, one page each per tick, and backs off on failure. A configured scheduler is required. Manual page imports are also available.
- A configured record cap bounds the index. Tombstones count toward that cap; resetting configuration clears the index and requires reverification. This is deliberate rather than silently discarding deletion history.
- The existing document knowledge pipeline remains keyword-based. Business records use bounded keyword matching; this change does not introduce embeddings or semantic ranking.

### Outgoing data

- Named validated operations: create a contact, create a support ticket, and bridge-only booking requests. HubSpot contact requirements map to an explicitly configured text property. Ticket pipeline/stage IDs are configured, never guessed.
- A trusted tenant backend, owner/admin, or configured dialog outcome can prepare an encrypted action proposal. An owner/admin must inspect and approve it before a queue consumer sends it.
- A flow outcome action has type `business_connector`, `connector_id`, `operation`, and an `input_slots` object mapping operation fields to collected slot names. Missing/invalid fields or revoked bindings cannot produce executable actions.
- Queue delivery and approval retries do not repeat a business write. Read calls may retry once. A write timeout or ambiguous response remains unknown, with its allowance held; it is not automatically retried.
- Owners/admins can reconcile a run after 15 minutes using verified external evidence. Acknowledged/accepted requests must not be described as completed bookings, payments or notifications. This implementation creates CRM records; it does not send customer messages or execute payments.

### Usage and observability

- A shared Business API entitlement (`conn_business_api`) currently covers HubSpot and bridge calls. Missing entitlements deny execution; there is no default business price.
- Atomic tenant/month reservations enforce the included-call hard limit across parallel calls. Successful logical calls settle once into `billing_usage_events`; unsuccessful reads release their reservations. A read retry is not a second customer charge. Provider attempts are tracked separately.
- The price and allowance snapshot are stored at reservation time. Overage is calculated in settlement order from completed calls, so failed reservations do not consume included calls. This is separate from AI credit reservation/settlement.
- Audits record actors, action/resource IDs and status without raw requests or secrets. Operation results and outgoing inputs are encrypted. Recent activity exposes only safe metadata. Replay results expire after seven days while idempotency metadata remains.

Deployment and protocol details: [27_BUSINESS_CONNECTORS_RUNBOOK.md](27_BUSINESS_CONNECTORS_RUNBOOK.md).
