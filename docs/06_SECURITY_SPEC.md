# dLogicAI Security Specification
## Requirements
- Secure password hashing.
- Secure random API-key generation.
- Store API-key hashes, never plaintext secrets.
- Encrypt BYOK credentials at rest.
- Secure, HttpOnly session cookies.
- Explicit production CORS allowlist.
- Tenant isolation on every tenant-owned query.
- Role-based authorization for corporate administration.
- Never expose provider credential material.
- Never return raw upstream provider error bodies.
- Audit sensitive administrative and billing operations.
- Apply rate limiting and abuse controls at appropriate boundaries.

Analytics requirements:
- Google Analytics 4 is optional and configured through `PUBLIC_GA_MEASUREMENT_ID`.
- GA4 must not load before explicit analytics consent.
- Essential authentication/session cookies must work without analytics consent.
