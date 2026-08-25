# dLogicAI Specification Compliance Matrix

| Area | Specification | Source | Target |
|---|---|---|---|
| Product identity | dLogicAI | Mixed historical names may remain | Normalize |
| Auth | Required | Implemented; password policy and account deactivation added | Email verification, password reset, and 2FA remain |
| Multi-tenant | Required | Partial | Explicit session tenant added; active-tenant switching remains |
| Projects | Required | Implemented | Maintain |
| API keys | Required | Implemented | Test |
| OpenAI | Required | Implemented | Adapter |
| Gemini | Required | Implemented | Adapter |
| BYOK | Required | Implemented | Harden |
| Multi-language | Required | Basic | Improve |
| Usage reservation | Required | Implemented | Atomic/idempotent |
| Streaming settlement | Required | Incomplete | Fix |
| AI credits | Required | Atomic reservation and failure refund implemented | Complete settlement lifecycle and reconciliation |
| Configurable billing | Required | Subscription/catalog/Stripe routes registered; billing mutations require owner/admin | Verify checkout, portal, and webhook flows end-to-end |
| Cost estimator | Required | Partial | Expose API/UI |
| Stripe | Optional/target | Checkout, portal, and webhook handlers wired | Configure prices/secrets and verify end-to-end |
| Organization/team | Required | Artifacts exist | Reconcile latest source |
| Chat Services | Target | Partial; playground foundation added | Implement project-scoped runtime |
| Intelligence | Target | Schema-led | Implement runtime |
| Connectors | Target | Presentation/catalog options only | Implement encrypted credentials, adapters, execution, and CRM/internal integrations |
| R2/KV/Queues | Target | Partial/unverified | Adopt where justified |
| Observability | Required | Partial | Complete |
| CI/CD | Required | Docs/partial | Verify workflows |
| OpenAPI | Required | Stale relative to newer artifacts | Reconcile |
| Tests | Required | Journey test cases authored; automated coverage remains insufficient | Execute test pack and build automated registration/login/subscription regression suite |
