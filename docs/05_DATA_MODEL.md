# dLogicAI Data Model
Core entities:
- users
- tenants/organizations
- memberships/roles
- invitations
- projects
- API keys
- provider credentials
- conversations
- messages
- usage events
- plans/subscriptions
- pricing rules
- add-ons/overages
- credit accounts
- credit ledger
- credit reservations/purchases
- connectors
- connector usage
- chat services
- conversation intelligence
- audit/observability records

All tenant-owned entities require explicit tenant scoping and appropriate indexes.

Plan RAG entitlements are configurable through `plans.max_knowledge_bases`,
`plans.max_documents`, `plans.max_storage_bytes`, and `plans.max_vector_chunks`.
