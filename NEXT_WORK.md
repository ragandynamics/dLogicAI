# dLogicAI — NEXT WORK

> Daily execution pointer. Specifications define what the system should do; this file defines what should be worked on now.

## Current Sprint
**Billing & Credit Integrity — P0**

## TODAY

### DLA-001 — Implement Atomic AI Credit Reservation
**Status:** IMPLEMENTED — verification pending  
**Priority:** P0

**Specifications**
- `docs/13_AI_CREDITS_SPEC.md`
- `docs/11_USAGE_QUOTA_SPEC.md`

**Related**
- `PROJECT_STATE.md`
- `docs/21_SPEC_COMPLIANCE_MATRIX.md`

**Likely source areas**
- `apps/api/src/index.ts`
- D1 credit account/reservation migrations

### Acceptance Criteria
- [x] Reservation is atomic.
- [x] Concurrent requests cannot overspend.
- [x] Balance cannot become negative.
- [x] Reservation is idempotent.
- [x] Failed downstream reservation does not permanently consume credit.
- [x] Finalization/refund is safe and idempotent.
- [x] Ledger entries represent balance changes.
- [x] Tenant isolation is enforced.
- [ ] Tests cover accounting/concurrency invariants.
- [x] Typecheck passes; local D1 migration verification is blocked by a Miniflare internal error.

### Constraints
- Do not change the public API unnecessarily.
- Do not introduce hard-coded pricing.
- Preserve tenant isolation.
- Preserve Cloudflare Workers/D1 compatibility.
- Follow `docs/13_AI_CREDITS_SPEC.md`.

## NEXT
1. DLA-002 — Credit Reservation Rollback
2. DLA-003 — Credit Ledger Settlement
3. DLA-004 — Streaming Usage/Credit Settlement
4. DLA-005 — Billing API Integration
5. DLA-006 — Configurable Pricing
6. DLA-007 — Organization Active-Tenant and Role Authorization

## HOLD
- Chat Services runtime
- Conversation Intelligence runtime
- Connector runtime
- Advanced analytics

## After Completing TODAY
1. Add and run accounting/concurrency tests against D1.
2. Update `PROJECT_STATE.md` and `docs/21_SPEC_COMPLIANCE_MATRIX.md` with the verification result.
3. Mark DLA-001 complete.
4. Move DLA-002 into `TODAY`.
5. Record tests/checks performed.
6. Record any required migration or ADR.

## Daily Rule
When asked **"What should I work on today?"**, select the highest-priority `READY` task unless the user explicitly overrides it.
