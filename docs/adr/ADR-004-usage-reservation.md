# ADR-004 — Reserve Before Provider Invocation

Quota/usage is reserved before external AI invocation. Settlement is idempotent; failures follow an explicit refund/failure path.
