# dLogicAI Cloudflare UAT / Production setup

## Resources

Create separate resources for UAT and production:

| Resource | UAT | Production |
|---|---|---|
| Worker | `dlogicai-api-uat` | `dlogicai-api` |
| D1 | `dlogicai-uat` | `dialogicai-prod` (current config) |
| Pages | `dlogicai-web-uat` | `dlogicai-web` |

Do not share production D1 or production secrets with UAT.

## UAT D1

Create the UAT database and put its ID into the GitHub Environment variable:

`CLOUDFLARE_UAT_D1_DATABASE_ID`

The UAT workflow generates `apps/api/wrangler.uat.jsonc` from `wrangler.uat.jsonc.template` during CI, so the database ID does not need to be committed to the repository.

## Production Worker

The current production Wrangler configuration is `apps/api/wrangler.jsonc` and points to the existing production D1 database:

- Worker: `dlogicai-api`
- D1 database: `dialogicai-prod`
- Binding: `DB`

Verify that the database ID in that file matches the production D1 database in the Cloudflare dashboard before enabling the production workflow.

## Pages

The frontend is Astro with the Cloudflare adapter and `output: 'server'`. The workflow builds `apps/web` and deploys `apps/web/dist` to a Cloudflare Pages project using Wrangler.

Set the Pages project name in the GitHub Environment variable `CLOUDFLARE_PAGES_PROJECT`.

## Worker secrets

The workflows synchronize the following secrets to the Worker after deployment:

- `SESSION_SECRET`
- `MASTER_KEY`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Stripe success/cancel URLs are not secrets. The workflows pass them as non-secret Worker variables from the GitHub Environment variables `STRIPE_SUCCESS_URL` and `STRIPE_CANCEL_URL`.

## Important: rotate exposed development credentials

The previous source package contained real-looking values in `apps/api/.dev.vars`. Those values must not be reused. Delete them from Git history if they were ever committed, rotate the corresponding OpenAI/Gemini/Stripe credentials, and create fresh GitHub/Cloudflare secrets.

## Migration preflight

The current source contains two migration files beginning with `002_` (`002_billing_and_ai_credits.sql` and `002_stripe_billing.sql`). D1 migrations are versioned by the number in the filename and are tracked in `d1_migrations`. Before enabling automated production migrations, run:

```bash
cd apps/api
npx wrangler d1 migrations list dialogicai-prod --remote
```

Do not rename already-applied migration files blindly; that can cause the migration tracker to see a new migration. Resolve the migration history against the actual production `d1_migrations` table first.
