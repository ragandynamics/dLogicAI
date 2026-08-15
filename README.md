# dLogicAI

Conversational AI infrastructure for web and mobile applications.

## Stack

- Astro dashboard
- Cloudflare Workers API
- Cloudflare D1
- Cloudflare Queues-ready usage architecture
- OpenAI Responses API
- Google Gemini REST API
- BYOK for OpenAI/Gemini
- Multi-tenant projects and API keys
- Multilingual conversations
- Usage metering
- Free / Developer / Pro / Business plans

## Important

This repository is a production-oriented MVP foundation. Before public launch, add:
- a managed identity provider or stronger account recovery/email verification
- Stripe Checkout + Billing Portal + signed webhooks
- Cloudflare WAF/rate-limit rules at the edge
- secret rotation/KMS strategy appropriate to your compliance requirements
- abuse detection and spend controls
- automated tests and CI/CD

## 1. Prerequisites

Node.js 20+ and pnpm.

```bash
corepack enable
corepack prepare pnpm@10.12.4 --activate
pnpm install
```

## 2. Create D1

```bash
npx wrangler login
npx wrangler d1 create dLogicAI-db
```

Copy the returned database ID into `apps/api/wrangler.jsonc`.

## 3. Configure secrets

Create `apps/api/.dev.vars`:

```env
SESSION_SECRET=replace-with-a-long-random-secret
MASTER_KEY=replace-with-a-32-byte-hex-key
OPENAI_API_KEY=
GEMINI_API_KEY=
```

Generate a master key:

```bash
openssl rand -hex 32
```

`MASTER_KEY` is used to encrypt customer BYOK credentials. Never commit it.

## 4. Run the first migration

```bash
pnpm db:migrate:local
```

For production:

```bash
pnpm db:migrate:remote
```

## 5. Start API

```bash
pnpm dev:api
```

API defaults to http://localhost:8787.

## 6. Start dashboard

```bash
pnpm dev:web
```

Dashboard defaults to http://localhost:4321.

Set `PUBLIC_API_URL` in `apps/web/.env` if the API is not at localhost:8787.

## API

### Register

```http
POST /v1/auth/register
Content-Type: application/json

{
  "name": "Rajesh",
  "email": "you@example.com",
  "password": "use-a-long-password"
}
```

### Login

```http
POST /v1/auth/login
Content-Type: application/json

{
  "email": "you@example.com",
  "password": "use-a-long-password"
}
```

### Create project

Use the returned session cookie:

```http
POST /v1/projects
Content-Type: application/json

{
  "name": "My App",
  "environment": "production"
}
```

### Create API key

```http
POST /v1/projects/PROJECT_ID/api-keys
Content-Type: application/json

{
  "name": "Production"
}
```

The secret is returned once.

### Chat

```http
POST /v1/responses
Authorization: Bearer sk_live_...
Content-Type: application/json

{
  "model": "auto",
  "input": "Hello in Tamil",
  "response_language": "ta-IN",
  "stream": false
}
```

### Streaming

Set `"stream": true`. The API emits SSE events.

## Billing modes

`managed`:
- dLogicAI pays the configured provider.
- Customer pays dLogicAI's managed AI charge.

`byok`:
- Customer's encrypted provider credential is used.
- Customer pays OpenAI/Gemini directly.
- dLogicAI charges only the platform request fee.

The request usage event records provider, model, tokens, billing mode, provider cost, and platform charge.

## Plan seed

Free:
- 10,000 requests/month
- $1 managed AI credit

Developer:
- $19/month
- 100,000 requests/month

Pro:
- $49/month
- 1,000,000 requests/month

Business:
- $199/month
- 10,000,000 requests/month

The pricing is stored in D1 so it can be changed without changing API logic.

## Security notes

- API secrets are shown once and only hashes are stored.
- Sessions use signed, HttpOnly, SameSite cookies.
- BYOK credentials are encrypted with AES-GCM.
- Tenant/project ownership is checked on every dashboard mutation.
- API tenant identity comes from the API key, not request body.
- Usage writes happen after the model call.
- Never log provider credentials or raw Authorization headers.
