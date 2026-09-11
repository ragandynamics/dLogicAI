# Business connectors — local release and integration guide

This bundle is local. Do not deploy the pending API/tenant/staff bundle or apply migrations remotely without the separately authorised release. Apply migration 033 after the existing migrations, including 027. It creates connector state and adds widget identity binding. No credentials, tenants, pricing entitlements or remote infrastructure are provisioned by the migration.

## HubSpot setup

1. In the tenant Integrations screen select the intended project and HubSpot. Supply that account's private app access token through the password field. It is encrypted and never returned by list APIs.
2. Grant the app contact read access; contact/ticket write access is needed only for operations you enable. Configure only customer-visible contact properties. The default is firstname, lastname and company. A successful connection test establishes contact read access, not write permissions or permissions for every custom property.
3. To create contacts, configure an existing HubSpot text property to store customer requirements. To create tickets, configure the actual pipeline and stage internal IDs. No booking operation is available for HubSpot.
4. Configure a `billing_connector_entitlements` row for the tenant's active plan version and `connector_id='conn_business_api'`. Set included_api_calls, overage_enabled, hard_limit and overage_unit_price_micros using approved business pricing. No row means calls are denied, including connection tests. HubSpot and bridge installations currently share this entitlement and a calendar-month counter.
5. Test the connection, attach the intended Chat Service, choose whether live lookup is enabled, and activate. Import contacts in pages of 50 or choose a sync interval. Customer records never become public knowledge.
6. Saving configuration or rotating credentials returns the installation to configured, clears its old record index and resets verification. Retest before activation. Existing audit/billing history remains.

The native adapter is pinned to HubSpot's documented `/crm/objects/2026-09/contacts` and `/tickets` interfaces. It uses a fixed `https://api.hubapi.com` origin, bounded responses and no redirects. It supports contact reads/import, contact creation and ticket creation; it does not implement OAuth installation, marketing subscriptions, CRM associations, ticket-history retrieval, or native HubSpot webhook subscriptions. Polling/live reads provide native incoming data; a tenant bridge may push the normalised signed event protocol below. The bridge signing secret is not a HubSpot app client secret.

Primary API contracts checked on 2026-09-10: [Contacts](https://developers.hubspot.com/docs/api-reference/latest/crm/objects/contacts/guide), [Tickets](https://developers.hubspot.com/docs/api-reference/latest/crm/objects/tickets/guide), [Authentication](https://developers.hubspot.com/docs/apps/legacy-apps/authentication/intro-to-auth). No live HubSpot account was queried or changed during implementation.

## Verified customer responses

Never expose a dLogicFlow server API key in an embed or browser. The tenant backend must authenticate its own customer and resolve that customer's HubSpot contact ID in the connected HubSpot account. Do not accept a caller-supplied contact ID/email as identity proof.

The backend calls `POST /v1/business-identity` with its project API key:

```json
{
  "service_id": "the-attached-service",
  "conversation_id": "the-widget-session-conversation",
  "subjects": { "the-connector-installation-id": "verified-hubspot-contact-id" }
}
```

It receives a five-minute token. The embed calls an optional `window.dLogicFlowIdentity({widgetId, conversationId})` asynchronous callback before each message. The host website should implement that callback by calling its own authenticated backend and returning the token. The backend must use its own trusted widget-to-service mapping. Never store assertions in public URLs or shared caches. Return no token for anonymous customers; once private data was used, that session requires the same verified customer until restarted.

Server-side `/v1/responses` accepts `business_identity` alongside the matching `chat_service_id` and `conversation_id`. Widget message requests accept the same assertion; customer IDs in ordinary messages or unrecognised body fields are never trusted. Native social-channel conversations remain public-only until a channel-specific customer verification flow exists.

## Business API bridge contract

Platform operators explicitly approve the bridge's exact HTTPS origin in `CONNECTOR_ALLOWED_ORIGINS` (comma-separated). Verify ownership, DNS and that the host cannot redirect/proxy credentials to internal or unrelated services. Localhost, literal IPs, URL credentials, paths, custom ports and redirects are rejected. The runtime never takes a URL from the model or a visitor. HubSpot uses its own fixed origin and does not need this setting.

Every bridge request is POST to `{origin}/dlogic/v1/{operation}`, with `Authorization: Bearer <encrypted-token>`, JSON and a stable server-generated `Idempotency-Key`.

| Operation | Input | Expected result |
|---|---|---|
| health | `{}` | `{ "ok": true, "protocol": "dlogic-business-v1" }` |
| query | `{ "query": "...", "subject": "verified-id-or-null" }` | records envelope |
| sync | `{ "cursor": "..." }` | records envelope, optional next_cursor |
| create_lead | name, email, requirements | external_id, status accepted/completed |
| create_ticket | title, description | external_id, status accepted/completed |
| request_booking | service, preferred_time, notes | external_id, status accepted/completed |

The bridge must enforce subject-level access and deduplicate writes itself as a second safeguard. Do not put provider secrets, internal notes or unrestricted record payloads in returned content. Return only fields the tenant has approved for customer responses. Responses have a 512 KB transport limit; envelopes contain at most 50 records. A logical call has at most two read attempts; writes have exactly one attempt. All have an eight-second per-attempt deadline.

```json
{
  "records": [{
    "id": "policy-shipping", "visibility": "public",
    "title": "Shipping policy", "content": "Approved customer-facing text",
    "version": 12, "updated_at": 1789000000000, "expires_at": 1789000300000,
    "deleted": false
  }],
  "next_cursor": "optional-next-page"
}
```

Timestamps are Unix milliseconds; example timestamps must be replaced with current values. A customer record uses visibility customer and a nonempty subject. Public records must omit subject. HubSpot bridge records must be customer-private and use the same numeric id and subject. Deletions use a higher version with deleted true. Older versions never overwrite newer records or tombstones. Source URLs, when provided, must be HTTPS. Freshness is additionally capped by the installation's max_age_seconds.

For pushed data use `POST /v1/business-connectors/{installationId}/incoming`. The exact JSON body is signed with the saved bridge secret:

- `X-Connector-Timestamp`: current Unix milliseconds (five-minute tolerance)
- `X-Connector-Event`: unique event ID, 1–200 letters/digits/dash/underscore/colon
- `X-Connector-Signature`: lowercase hex HMAC-SHA256 of `timestamp + '.' + eventId + '.' + rawBody`

The receipt and all record updates commit together. Repeated event IDs cannot introduce changed records. Per-installation record caps include tombstones to preserve deletion history. Expired content is excluded immediately, then redacted after a day by scheduled maintenance; minimal version metadata is retained.

## Outgoing approval and queues

`POST /v1/projects/{projectId}/business-connectors/{installationId}/actions` creates a proposal. It accepts service_id, optional conversation_id, operation, validated input and idempotency_key. Authentication is owner/admin or a project server API key. It never sends business data at proposal time.

The owner/admin reviews `GET .../business-connectors/actions/{actionId}` and then calls `POST .../actions/{actionId}/approve` with `{ "confirm": true }`. The UI provides both steps. Approvals publish a pointer (no customer input) to `BUSINESS_QUEUE`. The consumer rechecks active installation, service binding and allowed operation before decrypting the input and executing. If queue publication fails, the approved action remains visible and can be queued again without another external write.

A dialog outcome may define:

```json
{
  "type": "business_connector", "connector_id": "installation-id",
  "operation": "create_ticket",
  "input_slots": { "title": "issue_title", "description": "issue_description" }
}
```

Valid collected slots create a pending proposal exactly once for the conversation/flow/outcome/action index. This is not automatic execution. Widget business-data opt-out also disables these proposals. The existing flow designer API stores this mapping in outcome actions; this release does not add a dedicated visual action-mapping editor.

A write timeout, transport error or invalid response is treated as unknown. Never re-create the action under a new key merely to retry. Check HubSpot/the bridge first. After 15 minutes an owner/admin may call `POST .../business-connectors/runs/{runId}/reconcile` with confirm true, outcome completed/failed, and external_id containing the verified external record ID or investigation reference. Reconciliation settles/releases the held allowance and updates the related action. The same run cannot settle twice. A Worker crash before a receipt is persisted can also require this procedure; D1 and an external CRM do not share a transaction.

## Worker configuration and release checks

Add a Queue producer binding named `BUSINESS_QUEUE` and a consumer for that queue to the intended API Worker configuration. The existing queue handler dispatches `business.action` messages separately from channel messages. Use the organisation's queue naming/retention/DLQ policy; no queues were created remotely by this change.

Add a one-minute Cron Trigger to the API Worker for `scheduledBusinessSync`. The handler processes one page per due connector, at most three per tick, respects the configured interval (minimum five minutes), uses leases and exponential failure backoff, and runs data-expiry maintenance. Scheduled sync is disabled per installation by default. Without the trigger, manual sync/live reads still work but scheduled refresh and maintenance do not run.

Required release sequence: approve the bundle; apply migrations through 033 in the intended environment; configure plan entitlement, Queue and Cron; configure HubSpot token via the tenant UI; verify contact reads with a designated test contact; verify anonymous/wrong-customer denial; test opt-out; approve one designated test contact/ticket creation; verify its external ID; replay the same request and confirm no duplicate; reconcile connector billing and audit metadata. Test account writes and deployment are not performed by the local test suite.

Reversible rollout control: deactivate installations or remove service bindings to prevent new work. In-flight external calls may finish. Keep migrations additive; do not drop audit or billing tables to roll back the UI.
