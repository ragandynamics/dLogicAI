# Interactive Forms

User-approved journey: service-scoped builder, templates, validated conditional fields, preview/test, immutable publication, activation, hosted customer completion/review/receipt and tenant submission review. Keep implementation local until an authorized release.

Forms use platform and tenant feature controls independently of publication and activation. New sessions pin a published version; existing sessions follow feature retirement policy, expire after one day and cannot bypass tenant denial or form deactivation. Preview sessions are authenticated, labelled tests and cannot trigger business actions. No AI is invoked or billed for deterministic form collection.

Owner/admin manages forms and views encrypted answers. Other tenant roles cannot read personal submissions. Public links reveal only published questions; random bearer session tokens authorize only that session, expire, are stored hashed and are never included in query strings. Review validates and saves answers; submit requires the saved revision and explicit confirmation. Duplicate submits return the original receipt. Hidden answers are discarded, not submitted. Retention is configured per published version and enforced on reads, with scheduled ciphertext removal.

Optional connector mappings prepare an encrypted pending business action only after an owner/admin reviews a real submission. Existing connector approval and Queue execution remain mandatory. A form receipt means information received, not a completed CRM action or booking.

Initial delivery is a hosted form, also linked from active web widgets. No file uploads, customer CRM prefill, automatic email, conversational form rendering on social channels, or visual dialog-trigger configuration is claimed. Published links may be shared manually through other channels. Form identity is separate from customer identity; a typed email does not authenticate a CRM customer.

## Setup and testing

Apply additive migration 034 after 032/033 in the intended environment only during an authorized release. It preserves any existing availability setting and otherwise seeds Forms as disabled. Enable Forms in System Admin → Feature availability and ensure the tenant is allowed. From a Chat Service select Interactive Forms, choose a template, save, create a test link, complete the test, publish and activate. Customer links use /forms/{id} on the web application host. Web widgets show links only when the published form opts in. The API/web bundle must be released together.

The standard scheduled handler removes up to 100 expired encrypted answer payloads per invocation. Configure a Cron Trigger for physical cleanup; reads exclude expired answers even without scheduled cleanup. Minimal session metadata remains for counts and receipts. Prepared business actions are separate records under the connector's retention rules; expiring form answers does not delete an already-created CRM record or connector action.

Submissions are paginated 50 per page. Form lists show the latest 100 configured forms. Counts distinguish starts and real submissions; this release does not add aggregate field-error analytics. Hosted form sessions are resumed on the same browser tab using session storage; no cross-device resume or draft autosave before the Review step is claimed.

Draft/review answers are available only to the bearer session holder. Tenant detail reveals answers only after confirmation; starts and statuses do not disclose unfinished answers.
