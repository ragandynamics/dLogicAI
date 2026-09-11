# Platform feature availability

User-approved scope: system administrators control whether experiences, channel adapters, capabilities and templates are available. This implementation remains local.

## Administration

System Admin → Feature availability lists implemented and planned features, platform availability, retirement policy, reason, version and last editor/time. Operations has read-only visibility. Billing has no configuration access. Cloudflare Access plus explicit staff grants remain required.

Implemented controls: Q&A, guided chat, Web Chat, Telegram, WhatsApp, outgoing business connector actions and Interactive Forms with contact/support starter templates. Forms remain disabled by default until explicitly activated. Questionnaires, surveys, scoring, calculations, submission uploads and advanced templates remain registered but cannot be enabled until implemented. Submission uploads are distinct from existing knowledge-document uploads. No feature switch provisions infrastructure or creates an experience. See [29_INTERACTIVE_FORMS.md](29_INTERACTIVE_FORMS.md) for form session retirement and delivery scope.

The same screen can load and update an explicit tenant allow/deny. Default tenant access preserves existing access; allow never overrides platform disable, existing plan limits, service configuration or connector permissions. This is an additional access restriction, not a replacement for billing entitlements. Automatic mapping of the new feature catalog to billing plan products is not included.

## Enforcement and retirement

Settings use the existing platform_settings table from migration 032; no new migration or seed grants are required. Absent overrides preserve implemented functionality. Missing storage or malformed settings fail closed rather than silently enabling a feature.

Immediate disable rejects subsequent experience calls. Finish-existing permits requests only for a persisted, tenant/project-owned conversation created before the server-recorded disable timestamp. Editing a disabled policy preserves that cutoff. New widget sessions are blocked when the channel is disabled. A widget session without a persisted conversation has not started an eligible conversation. Re-enabling restores availability without deleting saved data.

API and widget replies check the selected experience and web channel before external work. Social AI currently uses the Q&A runtime and checks Q&A plus the social channel. Channel activation and guided-flow publishing are checked. Queued social deliveries check channel availability before sending. Business writes and approval check connector action availability; this capability supports immediate disable only. A disabled queued write follows the existing failure path without an external call. Connector read/sync operations are unaffected by the outgoing-action switch.

Provider calls already sent may finish. Routine retirement is based on conversation creation, not a new session-version model; it does not promise a deadline for completing older conversations. Existing channel guardrails may independently block a conversation. Tenant deny takes effect on subsequent use regardless of the platform retirement policy.

## Tenant experience

Chat Services links to Feature availability. The authenticated /v1/features endpoint returns only effective availability and safe explanatory labels for the signed-in tenant, not staff identities or administrative reasons. Saved configurations remain readable and editable where supported; publishing/activation/execution is rejected where controlled. Individual creation controls are not all hidden; server validation is authoritative.

## Audit and release

Updates require same-origin JSON, system-admin portal access and the current version. Setting and before/after audit records commit atomically. Stale saves fail with 409. Platform audit retains the change history. The screen does not yet calculate impacted tenant/service counts.

Before an authorized release: ensure migration 032 exists, deploy the reviewed API and staff bundle together, verify each role, test disable/re-enable and tenant denial with designated conversations, and confirm no provider work occurs for denied requests. Nothing was deployed or modified remotely by this task.
