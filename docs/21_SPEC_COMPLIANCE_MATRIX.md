# dLogicAI Specification Compliance Matrix

| Area | Specification | Source | Target |
|---|---|---|---|
| Product identity | dLogicAI | Mixed historical names may remain | Normalize |
| Auth | Required | Email verification, password reset, optional TOTP enrollment, password policy and account deactivation added | Enforce TOTP during login; add recovery codes and delivery verification |
| Multi-tenant | Required | Explicit session tenant and membership-validated active-tenant switching implemented | Add broader tenant lifecycle tests |
| Projects | Required | Implemented | Maintain |
| Tenant onboarding | Required | Getting Started page provides a development sample and live project/service/dialog/knowledge checklist | Add executable sample credentials and deployment promotion actions |
| API keys | Required | Implemented | Test |
| OpenAI | Required | Implemented; GPT-5 Mini is the configurable managed secondary provider | Formalize provider interface |
| Gemini | Required | Implemented; Gemini 2.5 Flash-Lite is the managed default provider | Formalize provider interface |
| BYOK | Required | Implemented | Harden |
| Multi-language | Required | Basic | Improve |
| Usage reservation | Required | Implemented | Atomic/idempotent |
| Streaming settlement | Required | Actual-token implementation and OpenAI/Gemini parser unit coverage added; disabled by default through `STREAMING_ENABLED=false` for the non-streaming MVP | Add settlement integration, cancellation, concurrency, provider-sandbox, and live D1 regression coverage before enabling |
| AI credits | Required | Atomic reservation, failure refund, and idempotent non-streaming settlement implemented; managed AI reconciles actual token charge and refunds unused reservation credits | Add live D1 regression coverage and converge streaming settlement on actual token usage |
| Configurable billing | Required | Subscription/catalog/Stripe routes registered; billing mutations require owner/admin; managed-AI USD allowances and markup are data-configured and locally migrated | Configure matching remote Stripe prices and verify checkout, portal, and webhook flows end-to-end |
| BYOK subscription offer | Required | Configurable discount entitlement, estimator support, and Stripe coupon hook added | Configure live Stripe coupon and verify discounted Checkout |
| Cost estimator | Required | Partial | Expose API/UI |
| Stripe | Optional/target | Checkout, portal, and webhook handlers wired | Configure prices/secrets and verify end-to-end |
| Organization/team | Required | Artifacts exist | Reconcile latest source |
| Chat Services | Target | Project-scoped CRUD, editable configuration, Web Chat binding, knowledge-base attachment, and versioned dialog-flow configuration added | Implement runtime invocation and remaining channel adapters |
| Service requests | Required | Tenant-scoped create/list/detail API and dashboard tracking added | Add external service-desk synchronization |
| Intelligence | Target | Tenant-scoped baseline runtime signals are recorded for completed non-streaming conversations | Add deeper model-based analysis and streaming coverage |
| Knowledge bases | Target | Tenant/project-scoped metadata, secure R2 lifecycle, text/CSV/HTML/JSON extraction, bounded D1 chunking, processing API, retrieval, dashboard controls, plan-enforced cost limits, and optional post-index source deletion added | Add PDF/DOCX extraction, Queue processing, Vectorize retrieval, and monthly ingestion metering |
| Dialog flows | Target | Full-page visual designer with drag/drop states, Chat Service attachment, seven business-scenario templates, versioned configuration, active-state evaluation, slot/milestone persistence, outcome evidence, and progress API added | Add richer extraction, runtime preview, and outcome action execution |
| Connectors | Target | Channel foundation plus environment-scoped commerce connector installations, encrypted credentials, credential tests, operation records, and marketplace UI added | Implement real marketplace API adapters, retries, Queue execution, and dialog-flow/CRM execution |
| Public contact capture | Required | D1 lead capture with configurable Turnstile validation and marketing footer form added | Add CRM handoff and lead notification workflow |
| R2/KV/Queues | Target | Partial/unverified | Adopt where justified |
| Observability | Required | Partial | Complete |
| CI/CD | Required | Docs/partial | Verify workflows |
| OpenAPI | Required | Stale relative to newer artifacts | Reconcile |
| Tests | Required | 53 API tests pass; API typecheck, Astro check/build, and local D1 migration application pass; CI now runs API tests and migration validation | Add deployed UAT registration/login/subscription and streaming settlement integration coverage |
