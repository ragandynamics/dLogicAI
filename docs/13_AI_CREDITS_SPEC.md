# dLogicAI AI Credits Specification
AI credits represent a defined billable allowance and must have an unambiguous unit.

## Lifecycle
- grant
- reserve
- consume
- refund
- expire (if policy requires)
- purchase
- adjustment

## Invariants
- Reservations are atomic.
- Balance cannot become negative.
- Every balance change has a ledger entry.
- Failed provider calls trigger the defined refund/settlement path.
- Credit accounting and usage accounting are reconcilable.
