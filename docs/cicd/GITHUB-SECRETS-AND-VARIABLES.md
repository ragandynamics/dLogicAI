# dLogicAI GitHub Actions configuration

The workflows use two GitHub Environments: `uat` and `production`.

## Required secrets

Create these as **Environment secrets** in both environments:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `SESSION_SECRET`
- `MASTER_KEY`
- `OPENAI_API_KEY` (optional if all tenants use BYOK, otherwise recommended)
- `GEMINI_API_KEY` (optional)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Cloudflare recommends storing the account ID and API token in CI/CD secrets and scoping the API token as narrowly as possible.

## Required variables

### UAT environment variables

- `CLOUDFLARE_UAT_D1_DATABASE_ID` = the D1 database ID for the UAT database
- `CLOUDFLARE_PAGES_PROJECT` = `dlogicai-web-uat` (or your actual Pages project name)
- `PUBLIC_API_BASE_URL` = the UAT API URL, e.g. `https://dlogicai-api-uat.<your-subdomain>.workers.dev`
- `STRIPE_SUCCESS_URL` = UAT Stripe success redirect URL
- `STRIPE_CANCEL_URL` = UAT Stripe cancel redirect URL

### Production environment variables

- `CLOUDFLARE_PAGES_PROJECT` = `dlogicai-web` (or your actual Pages project name)
- `PUBLIC_API_BASE_URL` = the production API URL, e.g. `https://api.example.com`
- `STRIPE_SUCCESS_URL` = production Stripe success redirect URL
- `STRIPE_CANCEL_URL` = production Stripe cancel redirect URL

## GitHub environment protection

For `production`, enable:

- Required reviewers
- Prevent deployment from unprotected branches
- Optional deployment wait timer

For `uat`, allow the `develop` branch.

## Cloudflare API token permissions

Use a dedicated token for CI/CD. Scope it to the target Cloudflare account. It needs permission to deploy Workers and manage the resources used by this pipeline (Worker, Pages, and D1 migrations). Do not use the global Cloudflare API key.
