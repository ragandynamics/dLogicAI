# dLogicAI Technical Architecture
## Runtime
- Cloudflare Workers
- Hono HTTP framework
- D1 for relational transactional state
- R2 for object/blob storage where required
- KV for low-latency configuration/cache where justified
- Queues for asynchronous processing
- Analytics/telemetry for operational visibility

## Domain Layers
1. HTTP/routes
2. Authentication/authorization
3. Domain services
4. Provider/connector adapters
5. Persistence
6. Billing/usage ledger
7. Background processing

## Design Rule
HTTP handlers must not become the long-term home of domain accounting logic; provider, billing and authorization rules should be isolated behind services.
