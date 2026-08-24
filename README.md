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

# apps/api - npx wrangler dev
# Local: wrangler dev
# UAT: wrangler deploy --env uat
# Production: wrangler deploy --env production

# apps/web - pnpm dev
# Local execution
pnpm --filter @dlogicai/web dev
# UAT
pnpm --filter @dlogicai/web exec wrangler deploy --env uat
#Prod
pnpm --filter @dlogicai/web exec wrangler deploy --env production

# Deploy UAT
npx wrangler deploy --env uat
npx wrangler deployments list --env uat

# To query DB in UAT env
npx wrangler d1 execute DB --remote --env uat --command "PRAGMA table_info(credit_accounts);"

# Deploy web uat
C:\CloudFlare\dlogicai\apps\web
pnpm build
npx wrangler deploy --env uat

# Local Dev DB migrations - tables
cd apps/api
pnpm exec wrangler d1 migrations apply dlogicai-db --local

# Logs UAT API
pnpm exec wrangler tail --env uat

# Deploy UAT api
pnpm --dir apps/api exec wrangler deploy --env uat

# Deploy UAT web
$env:APP_ENV="uat"
$env:PUBLIC_API_BASE_URL="https://dlogicai-api-uat.rdproducts-adm1.workers.dev"

cd C:\CloudFlare\dlogicai

Remove-Item -Recurse -Force .\apps\web\dist -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .\apps\web\.astro -ErrorAction SilentlyContinue

pnpm --dir apps/web check

pnpm --dir apps/web build
pnpm --dir apps/web exec wrangler deploy --env uat

# test in local
apps/api - npx wrangler dev
apps/web - pnpm dev



