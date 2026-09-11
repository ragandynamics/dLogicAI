# dLogicAI — AGENTS.md

## Mandatory Context
Before modifying code:
1. Read `PROJECT_STATE.md`.
2. Read `NEXT_WORK.md`.
3. Read the specification referenced by the task.
4. Read relevant ADRs under `docs/adr/`.
5. Inspect the existing implementation.

## Work Selection
- Work on the task marked `TODAY` in `NEXT_WORK.md`.
- Do not start lower-priority work while a blocking P0 task remains unless explicitly instructed.
- Do not expand scope without approval.

## Specification Rules
- `docs/*.md` describe intended behavior.
- `PROJECT_STATE.md` describes current implementation state.
- `docs/21_SPEC_COMPLIANCE_MATRIX.md` tracks known gaps.
- Do not silently change specifications to make implementation easier.

## Architecture & Security
- Product name is `dLogicAI`.
- Preserve tenant isolation and Cloudflare Workers/Hono compatibility.
- Keep provider-specific behavior behind provider abstractions.
- Never expose secrets, BYOK credentials, or raw upstream provider error bodies.
- Production CORS must use an explicit allowlist.

## Billing & Usage
- Reserve usage before external AI invocation.
- Credit reservation must be atomic and cannot allow negative balances.
- Credit/usage settlement must be idempotent.
- Failed operations must follow the defined refund/failure path.
- Streaming and non-streaming accounting must converge.
- Pricing remains configurable; do not hard-code business pricing.

## Completion Workflow
Inspect → Plan → Implement → Test → Review → Update state/compliance → Update NEXT_WORK.
Never claim completion if required checks were not run; state limitations explicitly.
