# dLogicAI Testing Specification
Required automated coverage:
- authentication
- tenant isolation
- role authorization
- API-key lifecycle
- BYOK encryption
- provider routing
- language handling
- usage reservation
- credit reservation/rollback
- streaming settlement
- pricing/overages
- Stripe webhook idempotency
- connector usage
- critical frontend/API integration paths

Business accounting invariants should have deterministic unit tests plus integration tests against D1.
