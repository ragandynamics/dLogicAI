# dLogicAI release checklist

- [ ] UAT D1 database exists and its ID is set in GitHub `uat` environment variable `CLOUDFLARE_UAT_D1_DATABASE_ID`.
- [ ] UAT Pages project exists and `CLOUDFLARE_PAGES_PROJECT` is set.
- [ ] UAT `PUBLIC_API_BASE_URL`, `STRIPE_SUCCESS_URL`, and `STRIPE_CANCEL_URL` are set.
- [ ] Production Pages project exists and `CLOUDFLARE_PAGES_PROJECT` is set.
- [ ] Production `PUBLIC_API_BASE_URL`, `STRIPE_SUCCESS_URL`, and `STRIPE_CANCEL_URL` are set.
- [ ] Dedicated Cloudflare API token is created and stored as `CLOUDFLARE_API_TOKEN`.
- [ ] `CLOUDFLARE_ACCOUNT_ID` is configured in both GitHub environments.
- [ ] Fresh `SESSION_SECRET` and `MASTER_KEY` are configured.
- [ ] OpenAI/Gemini credentials are rotated if the old source package was ever committed or shared.
- [ ] Stripe UAT uses test-mode credentials; production uses live-mode credentials.
- [ ] Production GitHub Environment has required reviewers.
- [ ] Production D1 backup/restore procedure has been tested before the first schema migration.
- [ ] Existing production D1 migration state has been reviewed with `wrangler d1 migrations list dialogicai-prod --remote`.
- [ ] The duplicate `002_*` migration naming in the current source has been reviewed before the first automated production migration.
