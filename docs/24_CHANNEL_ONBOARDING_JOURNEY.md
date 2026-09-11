# Web Chat and Telegram Connect

Implemented locally for the tenant onboarding request dated 2026-09-09. Deployment and live-provider verification are separate release gates.

## Web Chat tenant journey

Channels → Web Chat → choose project and Chat Service → configure HTTPS website origin, title, welcome text, color and launcher position → preview → save → copy the script → activate.

The instant preview uses the same renderer as the public embed. Demonstration replies are explicitly labelled. Opting into Live test invokes the selected service using the tenant's normal accounting; each preview message is an independent request.

The embed contains a public widget ID, never a project API key. Public sessions last 30 minutes and bind the widget, exact website origin and a server-created conversation. Tokens are stored hashed and held only in widget memory. Deactivation blocks subsequent messages from existing sessions; in-flight requests can finish. Changing the website origin returns an active widget to draft. Older channel records are not activated or migrated automatically.

The public namespace uses its own exact tenant-origin CORS allowlist without credentials. Rate limits use atomic D1 counters: 60 session creations/widget/minute, 120 messages/widget/minute and 10 messages/session/minute. Preview allows 10 requests/tenant/minute. Origin checks constrain browsers, not hostile non-browser clients; public sites may need additional abuse controls for their traffic. Messages are bounded to 4,000 characters and history to 12 messages. Only one request runs per visitor session. Existing AI, knowledge, dialog and reserve/settle/refund services are reused.

## Telegram tenant journey

Channels → Telegram → choose project and Chat Service → Connect with Telegram → open Telegram and press Start → return and Check connection → confirm the displayed Telegram account → create a managed bot in Telegram → Check connection → Activate → test a reply.

Onboarding transactions expire after 15 minutes. A verified manager webhook binds the Telegram identity; the authenticated tenant must confirm it before a managed bot can be attached. Credentials are encrypted, the bot webhook is registered server-side and installations remain in testing until explicitly activated. Duplicate completed manager updates do not create another installation. Management updates reporting a different owner deactivate the existing managed installation. Existing bot-token setup remains available as a fallback.

### Platform prerequisites

1. Create or select the platform manager bot and enable Bot Management Mode through BotFather.
2. Configure `TELEGRAM_MANAGER_USERNAME` and the web application's HTTPS `APP_BASE_URL` in the API Worker environment.
3. Store `TELEGRAM_MANAGER_BOT_TOKEN` and `TELEGRAM_MANAGER_WEBHOOK_SECRET` as API Worker secrets. The secret should contain 16–255 letters, numbers, underscores or hyphens.
4. Apply migration `027_webchat_telegram_onboarding.sql` and deploy the API/web changes to the intended environment.
5. Run `apps/api/scripts/setup-telegram-manager.mjs` from an operator environment containing the same four settings. It validates the bot identity, registers the manager webhook with `message` and `managed_bot` updates, and verifies the callback URL. It does not print tokens.
6. Complete one tenant onboarding and a live message/reply check. Presence of environment settings alone does not prove the manager webhook is registered.

Tokens should not be passed in command-line arguments, committed or pasted into tenant pages. Telegram bot token rotation/recovery after onboarding still requires operational handling. The user must supply the platform manager bot identity; this change does not create one automatically.

Official protocol references: [Managed Bots](https://core.telegram.org/bots/features#managed-bots), [ManagedBotUpdated](https://core.telegram.org/bots/api#managedbotupdated), [getManagedBotToken](https://core.telegram.org/bots/api#getmanagedbottoken).

## API surface

- `GET/PUT /v1/projects/:projectId/chat-services/:serviceId/web-widget`
- `POST .../web-widget/status` — active/inactive
- `POST .../web-widget/preview` — authenticated, billed live test
- `POST /v1/widgets/:widgetId/sessions` — allowed-origin visitor session
- `POST /v1/widgets/:widgetId/messages` — scoped bearer session, message UUID and input
- `GET/POST /v1/projects/:projectId/chat-services/:serviceId/telegram-connect`
- `GET .../telegram-connect/:pendingId` — creator-only status
- `POST .../telegram-connect/:pendingId/confirm` — confirm linked Telegram identity
- `POST /v1/webhooks/telegram-manager` — secret-verified manager updates

## Verification and release gates

API tests cover origin rejection, draft/active/inactive transitions, tenant permissions, visitor isolation, expiry, rate limits, encrypted Telegram credentials, identity confirmation, webhook signatures and duplicate setup. Widget accounting tests exercise actual SQLite reservation/settlement/refund SQL with a mocked upstream provider. Remote D1 concurrency and real provider correctness require UAT verification.

## Provider selection

Web Chat, Telegram and WhatsApp use the provider policy of their selected Chat Service. To use a configured Gemini tenant key, set **AI provider** to **Google Gemini** and **Provisioning** to **Use my tenant LLM key**. Resolution first uses the active tenant-wide Gemini credential and then supports an older active project-level Gemini credential. Managed provisioning remains separate and only uses the environment's managed provider key.

## Per-widget conversation and reply templates - 2026-09-10 (local only)

- Widgets independently store conversation_template, conversation_instructions (up to 2,000 characters), and output_template in existing config JSON. No new migration is required.
- Conversation options: existing Chat Service flow (backward-compatible default), customer support, lead qualification, booking enquiry, or custom conversation guidance. Non-default templates replace the service dialog runtime for that widget; provider and knowledge selection still use the selected service. Template flows are AI guidance, not deterministic state machines or booking integrations.
- Reply formats: conversational paragraphs (default), concise answer, plain-text bullet points, or numbered steps. These guide model output; they are not enforced JSON schemas or HTML templates. Rendering remains text-only.
- Current form selections drive the billed single-message preview. Public messages use stored widget settings only; visitors cannot override them. Public session responses expose appearance only, excluding conversation instructions.
- Validation: 120 API tests pass (2 opt-in remote tests skipped), API type check and full web build pass. Tests cover independent widgets, validation, preview settings, public override rejection, instruction non-disclosure, provider prompt propagation and unchanged success/failure accounting. Browser sample-data preview verified template selection, bullet replies and unsaved activation lock. Live UAT behavior is not verified; nothing deployed.

