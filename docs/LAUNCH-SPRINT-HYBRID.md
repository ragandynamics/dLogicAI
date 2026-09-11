# dLogicAI Hybrid Launch Sprint

**Decision:** Ship MVP (non-streaming) on 2026-09-06, then Phase 2 adds streaming (DLA-004) by 2026-09-20  
**Strategy:** Launch with proven non-streaming billing, de-risk streaming separately  
**Target:** 100+ early adopter sign-ups, revenue baseline, product-market fit validation

---

## Sprint Schedule (6 Days: Sept 1-6)

### Day 1 (Sept 1 — TODAY)
**Status:** ✅ FEATURES ALREADY IMPLEMENTED — Focus on testing & verification

**Great news:** 2FA enforcement, Stripe Checkout, and email delivery are ALREADY IN PRODUCTION CODE!

- [x] **1.1 — 2FA Login Enforcement** ✅ ALREADY DONE
  - Status: `POST /v1/auth/login` checks for enrolled TOTP and returns TWO_FACTOR_REQUIRED if needed
  - Verification task: Test full 2FA flow (enroll → login → challenge → verify code)
  - File: `apps/api/src/index.ts` lines 2565-2582
  - Effort: 2 hours (test only, no coding)
  - Acceptance: TOTP-enrolled user cannot login without code; code challenge expires after 5 minutes

- [x] **1.2 — Stripe Checkout & Webhook** ✅ ALREADY DONE
  - Status: `POST /v1/billing/stripe/checkout` creates sessions, webhook handler at `/v1/billing/stripe/webhook`
  - Verification task: Test end-to-end Checkout → confirm → webhook with sandbox API
  - Files: `apps/api/src/billing.ts` lines 282-406
  - Effort: 3 hours (test only, no coding)
  - Acceptance: Sandbox Checkout creates session, webhook signature validation passes, subscription created

- [x] **1.3 — Invite Email Delivery** ✅ ALREADY DONE
  - Status: `sendEmail()` function implemented with Resend API integration
  - Verification task: Test invite email delivery (invite created → email sent → link works)
  - Files: `apps/api/src/index.ts` lines 556-578, tenant-invitations.ts
  - Effort: 1.5 hours (test only, no coding)
  - Acceptance: Invite emails delivered within 2s, acceptance link creates membership

**End of Day 1:** All 3 features verified working, configuration checklist started

---

### Day 2 (Sept 2)
**Focus:** Comprehensive testing on staging (Stripe mode already decided; email domain deferred to Day 5 gate)

- [x] **2.1 — Stripe Configuration** — DECIDED: Sandbox mode. `.dev.vars` already has `STRIPE_SECRET_KEY=sk_test_...`, verified working during Day 1. No further action until a deliberate post-launch live-mode switch.

- [ ] **2.2 — Resend Email Configuration** — DEFERRED to Day 5 gate (domain verification will be done later, per decision). For now, staging runs on the sandbox sender `onboarding@resend.dev` verified during Day 1. Nothing to do today.

- [ ] **2.3 — Deploy to staging (UAT environment)**
  - Run `apps/api/migrations` against the UAT D1 database (`dlogicai-uat`, `wrangler.jsonc` env.uat)
  - Deploy API + web to the `uat` environment
  - Effort: 1-2 hours

- [ ] **2.4 — Comprehensive Feature Testing on staging** (repeat Day 1's verification against the deployed UAT environment, not just local)
  - 2FA: Enroll TOTP → logout → login without code (rejected) → login with code (success)
  - Billing: Create subscription → verify Stripe session created → webhook delivery
  - Invites: Create invite → verify email sent (sandbox sender) → verify acceptance link works
  - Non-streaming: Make API request with stream=false → verify credit charged → verify ledger entry
  - Effort: 3 hours
  - Acceptance: All flows working end-to-end on the actual deployed UAT environment, not just `wrangler dev`

**End of Day 2:** Staging deployed and re-verified (not just local), ready for Day 3 UAT/regression pass.

---

### Day 3 (Sept 3)
**Focus:** UAT + Regression Testing

- [ ] **3.1 — Core User Flows (Full E2E)**
  - Registration flow (email → verify → password setup → first project)
  - Login flow (email/password → 2FA challenge → session created)
  - API usage flow (create API key → make streaming-disabled request → verify credit charged)
  - Billing flow (subscribe to paid plan → Stripe Checkout → confirmation webhook)
  - Invite flow (invite user → verify email → accept → new user login)
  - Knowledge base (upload document → verify storage → retrieve by search)
  - Dialog flow (create flow from template → save → list)
  - Conversation (create conversation → multi-turn → verify ledger entries)

- [ ] **3.2 — Regression Testing (Non-streaming only)**
  - Non-streaming requests with different models (GPT-5, Gemini)
  - BYOK provider (tenant key usage, bypass managed pricing)
  - Failed requests (billing refunds, error handling)
  - Tenant isolation (verify cross-tenant access denied)
  - Plan enforcement (Free tier limits enforced)
  - Edge cases (large input, rapid-fire requests, concurrent API calls)

- [ ] **3.3 — Dashboard Verification**
  - Getting Started page loads and completes
  - Project dashboard shows API keys, usage, billing
  - Conversation history displays correctly
  - Knowledge base documents listed and searchable
  - Dialog flow designer loads without errors

**End of Day 3:** All flows UAT-ready, zero blocking issues, regression tests pass

---

### Day 4 (Sept 4)
**Focus:** Production Deployment Preparation

- [ ] **4.1 — Environment Configuration (Production)**
  - Finalize wrangler.toml with production values:
    - STRIPE_SECRET_KEY (live or sandbox)
    - STRIPE_WEBHOOK_SECRET (from Stripe dashboard)
    - RESEND_API_KEY (verified domain)
    - EMAIL_FROM (verified sender address)
    - APP_BASE_URL (production domain)
    - CORS_ORIGINS (explicit allowlist: app.dlogicai.com, www.dlogicai.com, etc.)
    - TURNSTILE_SECRET_KEY (Cloudflare Turnstile if enabling CAPTCHA)
  - Verify all secrets in Cloudflare Workers Secrets UI (never committed)
  - Document: Environment checklist completed

- [ ] **4.2 — Database Migration on Production**
  - Prepare D1 production database (empty state)
  - Run all migrations: 0001_initial.sql through 024_knowledge_cost_controls.sql
  - Verify schema created correctly
  - Test rollback procedure (manual process documented)

- [ ] **4.3 — Monitoring & Alerting Setup**
  - Configure Cloudflare Analytics Engine:
    - Request rate by endpoint
    - Error rate by status code
    - API latency (P50, P95, P99)
  - Configure D1 monitoring:
    - Query execution times
    - Lock contention detection
  - Set up alerts:
    - Error rate > 1% → page-on-call
    - D1 lock timeout → page-on-call
    - Email delivery failure → page-on-call
    - Stripe webhook failures → page-on-call

- [ ] **4.4 — Security & Compliance**
  - [ ] CORS whitelist finalized (only necessary origins)
  - [ ] Rate limiting configured (100 requests/min per API key)
  - [ ] Session cookie secure flag: HTTPS only + SameSite=Lax
  - [ ] TURNSTILE_ENABLED: true (CAPTCHA protection on public contact form)
  - [ ] API keys: Hashed before storage ✅ (already done)
  - [ ] Sensitive errors: Never expose provider keys or full error bodies ✅ (already done)
  - [ ] OpenAPI spec: Current and published to /docs
  - [ ] Privacy policy: Published to app
  - [ ] Terms of service: Published to app

**End of Day 4:** Production ready, all systems configured, rollback plan tested

---

### Day 5 (Sept 5)
**Focus:** Final validation + launch prep

- [ ] **5.1 — Staging → Production Dry Run**
  - Deploy to production with rollback plan ready
  - Verify all routes responding
  - Test critical paths:
    - User registration
    - Project creation
    - API key generation
    - Non-streaming request with billing
    - Stripe Checkout redirect

- [ ] **5.2 — Smoke Tests**
  - Registration flow
  - Login flow (with 2FA)
  - Project/API key CRUD
  - `/v1/responses` (non-streaming only, with stream=false enforcement)
  - Conversation retrieval
  - Knowledge base upload
  - Dialog flow CRUD

- [ ] **5.3 — Documentation Finalization**
  - OpenAPI spec current
  - README.md shows launch status
  - Getting Started page live on dashboard
  - API rate limits documented
  - Billing FAQ published

- [ ] **5.4 — Support & Communication**
  - Support team trained on:
    - Billing model (Free/$2/$15/$50/$200)
    - Tenant isolation (separate organizations)
    - Non-streaming only (no SSE requests yet)
    - Common issues (TOTP setup, API key rotation, credit limits)
  - Postman collection published (API examples)
  - Slack/Discord for early users

**End of Day 5:** All systems green, launch approved

---

### Day 6 (Sept 6)
**Focus:** LAUNCH + monitoring

- [ ] **6.1 — Production Deployment**
  - Deploy to `dlogicai-api.rdproducts-adm1.workers.dev` (or production domain)
  - Deploy Astro frontend to `dlogicai.rdproducts-adm1.workers.dev` (or production domain)
  - Verify health check responding
  - Confirm D1 database accessible

- [ ] **6.2 — Monitoring & Incident Response**
  - Watch error rates (target < 0.1%)
  - Monitor billing settlement (100% success rate)
  - Check email delivery (Resend logs)
  - Track API latency (P95 < 2s)
  - Alert on any unusual patterns

- [ ] **6.3 — Launch Communication**
  - Announce: "dLogicAI is live!"
  - Share sign-up link
  - Invite early adopters to beta
  - Publish blog post / social media

- [ ] **6.4 — Continuous Observation (First 48 Hours)**
  - Monitor error logs
  - Track sign-ups and API usage
  - Respond to support requests
  - Watch for billing issues
  - Zero-touch deployment (ready to hotfix if needed)

**End of Day 6:** 🚀 LIVE

---

## Phase 2: Streaming (Sept 7-20)

### Parallel Track During Phase 1
**While Day 1-3 ops/testing happening:**
- QA team executes DLA-004 test plan (Phase 3a: unit tests)
- Developers review streaming code for edge cases
- DevOps prepares staging environment for streaming tests

### Phase 2 Timeline
- **Sept 7-9:** DLA-004 unit + integration tests (3 days)
- **Sept 10-12:** DLA-004 edge cases + load tests (3 days)
- **Sept 13-14:** UAT deployment + monitoring (2 days)
- **Sept 15:** Soft launch (streaming enabled for beta users)
- **Sept 16-20:** Monitoring + iteration

### Feature Gate
```
STREAMING_SETTLEMENT_ENABLED=false  // Production launch
STREAMING_SETTLEMENT_ENABLED=true   // Phase 2 enable
```

---

## MVP Launch Scope

### ✅ INCLUDED (Day 6)
**Authentication**
- Email/password registration
- Email verification
- Password reset
- Login with 2FA (TOTP)
- Session management
- Multi-tenant organization switching

**Projects & API Keys**
- Project CRUD
- API key generation (create, list, revoke)
- Secret hashing & idempotency

**AI Conversations**
- Non-streaming requests only: `POST /v1/responses?stream=false`
- Multi-turn conversation threading
- OpenAI (GPT-5 Mini) + Gemini (2.5 Flash-Lite) + BYOK
- Response language selection
- Conversation pause/resume (takeover)

**Billing & Credits**
- Credit reservation (atomic)
- Non-streaming settlement (actual tokens)
- Refunds for failed requests
- Stripe Checkout integration
- Plan enforcement (Free tier: 10 requests/month, paid plans proportional)
- Credit ledger tracking
- Usage analytics

**Knowledge Bases**
- Upload (text, CSV, HTML, JSON)
- Automatic extraction to R2
- D1 chunking (overlapping, bounded)
- Retrieval by similarity
- Plan-enforced storage limits
- Chat Service attachment

**Dialog Flows**
- Visual drag/drop state designer
- 7 business templates
- Versioned configuration
- Slot extraction & milestone tracking
- Outcome evidence
- Chat Service binding

**Observability**
- Request/response logging
- Error tracking
- Audit logs (basic)
- Dashboard telemetry
- Google Analytics 4 (consent-gated)

### ❌ NOT INCLUDED (Defer to Phase 2)
- Streaming requests (DLA-004 pending testing)
- 2FA recovery codes (can add post-launch)
- Multi-environment promotion (single prod env)
- Channel adaptors (Telegram/WhatsApp/Shopee outbound)
- Advanced analytics dashboards
- PDF/DOCX knowledge base extraction
- Vectorize retrieval
- Conversation Intelligence deeper analysis
- Connector runtime (Commerce/CRM/ERP)

---

## Success Criteria (Launch)

| Metric | Target | How to Measure |
|--------|--------|----------------|
| **Launch Day Deployment** | Zero critical errors | Error rate < 0.1% |
| **Billing Accuracy** | 100% settlement success | Ledger reconciliation queries |
| **User Experience** | < 2s API latency (P95) | Cloudflare Analytics / APM |
| **Sign-ups (First Week)** | 100+ users | Dashboard user count |
| **API Requests (First Week)** | 1000+ requests | Usage analytics |
| **System Uptime** | > 99.5% | Monitoring dashboard |
| **Support Response** | < 4 hour resolution | Support ticket tracking |

---

## Rollback Plan

**If critical issue discovered:**

1. **Immediate:** Set `LAUNCH_STATUS=rollback` feature flag
2. **Behavior:** API returns 503 "Service temporarily unavailable"
3. **Duration:** Until hotfix merged and re-deployed
4. **Communication:** Post on status page + email affected users
5. **Hotfix:** Priority debugging + deploy within 2 hours

**After hotfix verified:**
- Re-enable `LAUNCH_STATUS=live`
- Monitor for 4 hours before full launch resume

---

## Deployment Commands

### Production Deploy (Day 6)
```bash
cd c:\CloudFlare\dlogicai\apps\api
pnpm exec wrangler deploy --env production

cd c:\CloudFlare\dlogicai\apps\web
pnpm build
pnpm exec wrangler deploy --env production
```

### Monitoring (Post-Deploy)
```bash
# Tail logs
pnpm exec wrangler tail --env production

# Check deployments
pnpm exec wrangler deployments list --env production

# Test health
curl https://dlogicai-api.rdproducts-adm1.workers.dev/health
```

---

## Communication Timeline

### Pre-Launch (Days 1-5)
- Internal: Sprint status updates
- Team: Deploy readiness checklist
- Stakeholders: Launch confirmed for Sept 6

### Launch Day (Sept 6)
- **9:00 AM:** Deploy to production
- **10:00 AM:** Verify all systems live
- **11:00 AM:** Announce on social media / email list
- **Throughout day:** Monitor error logs, respond to issues

### Post-Launch (Sept 7+)
- Daily standup on sign-ups, API usage, issues
- Weekly retrospective on Phase 1
- Phase 2 sprint planning (streaming)

---

## Team Assignments

| Role | Day 1 | Day 2 | Day 3 | Day 4 | Day 5 | Day 6 |
|------|-------|-------|-------|-------|-------|-------|
| **Backend Dev** | 2FA + Stripe setup | 2FA merge + Stripe live | Billing tests | Migrations + secrets | Dry run testing | Deploy API |
| **DevOps/SRE** | Environment prep | Staging deploy | Monitoring setup | Production checklist | Deployment prep | Deploy + monitor |
| **QA** | Test planning | Feature testing | Regression testing | Smoke tests | Final validation | Launch monitoring |
| **Product** | Launch docs | API documentation | Postman collection | FAQ / support materials | Go-live readiness | Announcement |
| **DLA-004 Track** | Unit test planning | Write unit tests | Run unit tests | Integration tests | Edge case tests | Baseline metrics |

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Stripe webhook failures** | Lost orders | Setup retry logic, alert on failures, test thoroughly |
| **Email delivery failures** | Lost invites | Use Resend logs, test with multiple addresses, manual fallback |
| **D1 lock contention** | API timeouts | Connection pooling, timeout tuning, max 3s per request |
| **Auth session issues** | Users locked out | Test cookie secure flags, SameSite=Lax, CORS headers |
| **Billing edge cases** | Revenue leakage | Manual ledger reconciliation, daily usage reports, alert on anomalies |
| **Support overload** | Poor UX | Comprehensive FAQ, Getting Started page, Postman examples |

---

## Post-Launch (Sept 7+)

### Immediate Actions (First Week)
- [ ] Monitor error logs 24/7
- [ ] Track sign-ups + engagement
- [ ] Respond to support tickets within 4 hours
- [ ] Fix any critical bugs same-day
- [ ] Gather early user feedback

### Phase 2 Kickoff (Sept 7)
- [ ] Start DLA-004 testing (unit tests)
- [ ] Plan streaming feature release communication
- [ ] Prepare feature gate rollout strategy

### Billing Validation (First 30 Days)
- [ ] Reconcile actual charges vs. ledger
- [ ] Verify no negative balances
- [ ] Audit credit grants / refunds
- [ ] Monitor Stripe payment events

---

## Success Definition

**Launch is successful when:**
1. ✅ All 6 days completed on schedule
2. ✅ Zero critical issues preventing operation
3. ✅ 100+ sign-ups in first week
4. ✅ 1000+ API requests processed
5. ✅ Billing 100% accurate (no disputes)
6. ✅ < 4% daily churn
7. ✅ System uptime > 99.5%
8. ✅ Team ready for Phase 2 (streaming)

If all criteria met → Phase 2 starts immediately (parallel to production support)  
If issues found → Fix + re-launch within 48 hours
