# dLogicAI Usage & Quota Specification
## Reservation principle
Usage must be reserved before calling an external LLM.

## Lifecycle
`reserved → completed` or `reserved → refunded/failed`

## Requirements
- Atomic quota enforcement.
- Idempotent request settlement.
- Tenant/project/provider/model dimensions.
- Input/output token accounting.
- Provider cost and customer charge.
- Streaming and non-streaming parity.
- No charge for failed requests unless explicitly defined by policy.
