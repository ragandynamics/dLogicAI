# dLogicAI BYOK Specification
Tenants may provide their own OpenAI/Gemini credentials. An active tenant credential is available to all projects created by that tenant.

## Rules
- Encrypt credentials at rest.
- Never expose stored plaintext keys.
- Validate provider credentials before activation where possible.
- BYOK is optional and not the primary product positioning.
- Charge subscription plus a minimal configurable API-call/service fee according to plan.
- When a tenant has an active LLM credential, eligible paid subscriptions use the configured fixed BYOK plan price automatically.
