# dLogicAI deployment flow

## Pull request

`ci.yml` runs on pull requests to `develop` and `main`:

1. Checkout
2. Install pnpm 10.12.4 dependencies from the lockfile
3. Typecheck/build the API
4. Run Astro checks
5. Build the web application

## UAT

A push to `develop` runs `deploy-uat.yml`:

1. Build API
2. Generate UAT Wrangler config with the GitHub environment D1 ID
3. Apply D1 migrations to UAT
4. Deploy `dlogicai-api-uat`
5. Sync UAT Worker secrets
6. Build Astro using UAT `PUBLIC_API_BASE_URL`
7. Deploy `apps/web/dist` to the UAT Pages project

## Production

A push to `main` runs `deploy-production.yml`:

1. Build API
2. Apply production D1 migrations
3. Deploy `dlogicai-api`
4. Sync production Worker secrets
5. Build Astro using production `PUBLIC_API_BASE_URL`
6. Deploy `apps/web/dist` to the production Pages project

Production should use a protected GitHub Environment with required reviewers.
