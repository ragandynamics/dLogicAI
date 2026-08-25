# dLogicAI BYOK Specification
Tenants may provide their own OpenAI/Gemini credentials.

## Rules
- Encrypt credentials at rest.
- Never expose stored plaintext keys.
- Validate provider credentials before activation where possible.
- BYOK is optional and not the primary product positioning.
- Charge subscription plus a minimal configurable API-call/service fee according to plan.
