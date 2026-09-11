# dLogicAI Solution Architecture
```text
Web / Mobile Applications
          |
          v
   Astro / Web UI
          |
          v
 Cloudflare Worker + Hono
          |
  +-------+------------------------------+
  |       |        |        |            |
 Auth   Core     AI       Usage       Billing
 Tenant Services Engine   Quota       Pricing
  |       |        |        |            |
  +-------+--------+--------+------------+
          |
     D1 / R2 / KV / Queues
          |
   +------+----------------+
   |                       |
AI Providers          External Systems
OpenAI/Gemini         Connectors/Stripe
```
Cross-cutting: security, observability, auditability, tenant isolation and configurable policy.
