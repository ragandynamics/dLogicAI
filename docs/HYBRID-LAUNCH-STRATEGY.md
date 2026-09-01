# 🚀 dLogicAI Hybrid Launch Strategy — APPROVED

**Decision:** Launch MVP (non-streaming) on Sept 6, add streaming in Phase 2 (Sept 7-20)  
**Status:** Day 1 verification complete (Sept 1) — 2FA, Stripe Checkout, and email delivery confirmed working end-to-end against real local API, real Stripe test API, and real Resend API  
**Day 1 Result:** All 3 features verified live, not just code-reviewed. One real bug found and fixed (broken test fixture in `credit-integration.test.ts`), one real config gap found and fixed (email sender). See "Day 1 Verification Log" below.

---

## Why Hybrid Launch?

### Best of Both Worlds

**Fast & Safe:**
- Ship proven MVP in **6 days** with proven non-streaming billing
- Test streaming separately in parallel (DLA-004)
- No revenue risk (non-streaming billing 100% validated)
- Zero blocking issues for launch

**Competitive Advantage:**
- **Day 6:** Go live with multi-tenant API platform, full billing
- **Day 20:** Add streaming (20% additional feature lift)
- Competitors still in testing; you're taking revenue

**Lower Risk:**
- Launch without streaming complexity (9 days of testing)
- Streaming ships as Phase 2 update (users already paying, trust built)
- Time to reverse/fix critical issues: immediate if needed

---

## What Ships Sept 6 (MVP)

### Core Features ✅
- **Authentication:** Email/password + TOTP 2FA enforcement
- **Multi-tenant:** Organization switching, role-based access
- **Projects & API Keys:** Full CRUD with hashing
- **Non-streaming AI:** OpenAI (GPT-5 Mini) + Gemini (2.5 Flash-Lite) + BYOK
- **Billing:** Credit-based, 4 tiers (Free/$2/$15/$50/$200), Stripe Checkout integration
- **Credit Settlement:** Non-streaming settlement 100% accurate, atomic refunds
- **Knowledge Bases:** Upload (text/CSV/HTML/JSON), R2 storage, D1 retrieval
- **Dialog Flows:** Visual designer, 7 templates, versioned config
- **Observability:** Request logging, error tracking, basic dashboards

### What's Not Included ⏸️
- Streaming requests (DLA-004, ships Sept 20 as update)
- Multi-environment promotion (single prod env)
- PDF/DOCX extraction
- Vectorize retrieval
- Connector runtime

### Channels: Incremental, Not All-or-Nothing 🔄
Telegram/WhatsApp are **not** a Sept 6 blocker or a single big-bang release. Adapters, webhooks, and delivery queue already exist (Stage 0, shipped). They roll out in flagged stages alongside the MVP:
- **Stage 1 (Sept 8-10):** Telegram beta, feature-flagged to internal tenants, text-only, no KB/dialog wiring yet
- **Stage 2 (Sept 11-14):** Knowledge base + dialog flow wiring, expand to WhatsApp text
- **Stage 3 (Sept 15-18):** Test coverage, production queue tuning, flag removed for all paid tenants
- **Stage 4 (Sept 21+):** Media and approved templates (Phase 3)
- **Stage 1b, parallel (Sept 11-15):** Public embeddable Web Chat widget for intranet/internet sites — currently only an authenticated dashboard preview exists, not a real embed. Reuses Stage 1's AI-response wiring; needs a new `"web"` channel type, a public widget key, per-installation domain allowlisting (so a tenant can restrict embedding to an intranet-only origin or open it to the public internet), and abuse/rate-limit protection since the endpoint is unauthenticated. Folds into Stage 3 hardening for GA (~Sept 18-20).

See `NEXT_WORK.md` → "CHANNEL INTEGRATION — INCREMENTAL ROLLOUT" for the stage-by-stage task breakdown. None of this blocks the Sept 6 launch.

---

## 6-Day Sprint Overview

| Day | Focus | Effort | By End Of Day |
|-----|-------|--------|--------------|
| **1 (Sept 1)** | Verify 2FA/Stripe/Email (already coded) | 2-3 hrs testing | All features verified, configs locked |
| **2 (Sept 2)** | Deploy to staging, comprehensive testing | 4-5 hrs | Features UAT-ready, zero blockers |
| **3 (Sept 3)** | E2E testing, regression, edge cases | 4-5 hrs | Dashboard ready, user flows validated |
| **4 (Sept 4)** | Production prep, monitoring, security | 3-4 hrs | All systems configured, checklists complete |
| **5 (Sept 5)** | Staging → production dry run, smoke tests | 3-4 hrs | Launch approved, rollback plan ready |
| **6 (Sept 6)** | 🚀 **LAUNCH** + 48h monitoring | 8 hrs | **LIVE** with 100+ early users |

**Total effort:** ~23-26 hours (well-distributed across team)  
**Parallel:** DLA-004 testing (streaming) runs in background

---

## Team Distribution (6 Days)

### Backend/API (50 hours)
- Day 1-2: Feature verification + configuration
- Day 3-4: Billing/API regression testing + security review
- Day 5-6: Deployment + monitoring support

### QA/Testing (40 hours)
- Day 1-3: Comprehensive feature/regression testing
- Day 4-5: Smoke tests + launch readiness
- Day 6+: Launch monitoring (48 hours)
- Parallel: DLA-004 unit tests

### DevOps/SRE (30 hours)
- Day 1-2: Environment setup, secrets management
- Day 3-4: D1 migrations, monitoring/alerting
- Day 5-6: Production deployment + incident response

### Product/Support (15 hours)
- Day 1-3: Documentation, support training
- Day 4-5: FAQ, Postman collection, launch comms
- Day 6+: Early user support

**Total: ~135 team hours over 6 days**

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **2FA/Stripe/Email not working** | Can't launch | Already tested ✅, just verify |
| **Billing inaccurate** | Revenue leak | Non-streaming 100% proven, atomic settlement |
| **Users can't login** | Major incident | 2FA optional (fallback to password only) |
| **Database migrations fail** | Major incident | Rollback procedure documented, tested |
| **Stripe keys wrong** | Can't process payments | Sandbox mode safe default, live can be added post-launch |
| **Email not delivering** | Users lost | Resend has 99.95% uptime, fallback email retry |

**Contingency:** If critical issue found, 48-hour slip to fix (Sept 8 launch instead)

---

## Phase 2: Streaming (Sept 7-20)

**Parallel Track During Launch:**
- DLA-004 Phase 3 testing (unit + integration)
- Streaming code review & edge case validation
- Load testing (10+ concurrent streams)
- UAT deployment with feature flag

**Launch Streaming:**
- Sept 15: Soft launch (beta users, feature flag)
- Sept 16-20: Monitoring + iteration
- Oct 1: Full rollout (streaming on for all users)

**Benefit:** Existing customers see "new feature available" (update) vs. "had to wait for streaming to launch" (perception)

---

## Success Metrics (First Week)

| Metric | Target | How to Achieve |
|--------|--------|----------------|
| **Uptime** | > 99.5% | Monitoring alerts, on-call response < 15 min |
| **Sign-ups** | 100+ | Early adopter wave, technical community |
| **API Requests** | 1000+ | Active users making non-streaming requests |
| **Billing Accuracy** | 100% | Ledger reconciliation queries |
| **Support Response** | < 4 hours | Dedicated support team |
| **Zero Revenue Disputes** | 0 | Daily billing audit |

---

## Go-Live Announcement

### Day 6 Messaging
**"We're launching dLogicAI — a production-grade conversational AI platform for enterprises."**

**Key points:**
- Multi-tenant SaaS with tenant isolation
- Accurate AI credit billing (no overcharges)
- OpenAI + Gemini + BYOK support
- Knowledge base + dialog flows included
- $2-200/month tiers
- Free trial (7 days)
- Streaming coming in Phase 2 (already building)

**Target:** Technical founders, AI teams, enterprise developers

---

## Day 1 Verification Log (Sept 1 — completed, not just planned)

Ran against the real local API (`wrangler dev`), real Stripe test-mode API, and real Resend API — not mocked.

| Check | Result |
|---|---|
| Test suite | 2 pre-existing failures found in `credit-integration.test.ts` — both were broken hardcoded arithmetic in the test fixtures themselves (no call into production code). Fixed. **45/45 pass.** |
| 2FA enforcement | Verified full loop: register → enroll TOTP → login rejected with `TWO_FACTOR_REQUIRED` + challenge → correct code → session created. |
| Stripe Checkout | Verified live against Stripe's test API: real `cs_test_...` session + `checkout_url` returned. `allowedAppUrl()` correctly requires the success/cancel URL path to be `/dashboard/billing` — not a bug, just the actual contract. |
| Email delivery | Found real blocker: `EMAIL_FROM` was set to an unverified sender domain, and Resend also rejects sending to arbitrary recipient domains (e.g. `example.com`) until the domain is verified. **Fixed for local dev** by switching `EMAIL_FROM` to Resend's sandbox sender `onboarding@resend.dev` and testing against Resend's reserved test recipient `delivered@resend.dev`. Verification email and invite email both now send successfully (no `EMAIL_DELIVERY_FAILED`). |

**Still open, by design (per your "domain verification will be done later" call):** production `EMAIL_FROM` needs a verified domain in Resend before real user emails (not `delivered@resend.dev`) will deliver. This is a config/account task in the Resend dashboard, not a code fix — tracked as a Day 2-4 production-prep item, not a Sept 6 blocker.

## Decision Checklist (TODAY)

- [x] **Confirm hybrid launch approved** (leadership sign-off)
- [x] **Stripe mode:** Sandbox — decided. Launch runs on `sk_test_...` keys; live keys are a deliberate post-launch switch, not a Sept 6 requirement.
- [ ] **Email sender:** Verify a real domain in Resend (noreply@dlogicai.com or hello@) — domain verification deferred; using Resend sandbox sender for now, **to be verified before production go-live**
- [ ] **Production domain:** Decided and communicated to team? — **to be verified before production go-live**
- [ ] **Team assigned:** Backend, QA, DevOps, Product all allocated?
- [ ] **Communication:** All stakeholders notified of Sept 6 target?
- [ ] **DLA-004 testing:** QA resource allocated for parallel streaming work?

**Action:** Day 1 verification is done. Remaining items are configuration/business decisions,
not engineering blockers — but email domain verification and production domain naming are a
hard gate on Day 5, before Day 6 go-live, not something to skip.

---

## FAQ

**Q: Why not wait for streaming?**  
A: Streaming needs 9 days of testing (risk). Non-streaming is proven. Ship MVP, test streaming in parallel, add as Phase 2 update.

**Q: What if streaming testing finds a blocker?**  
A: No impact on Sept 6 launch (didn't depend on it). Slip Phase 2 to Oct if needed.

**Q: Can users request streaming before Phase 2?**  
A: Yes, add to waitlist/roadmap. Use as retention (Phase 2 update is new feature users asked for).

**Q: What about streaming revenue in Sept?**  
A: Non-streaming billing works fine. Phase 2 (Oct) adds streaming and revenue uplift.

**Q: Can we add streaming before launch if we rush?**  
A: No. 9 days of testing is minimum. Better to ship proven, test streaming, add as update.

---

## Next Steps

1. **TODAY (Sept 1):** Team confirms hybrid strategy, day 1 actions assigned
2. **Execute:** Follow `docs/LAUNCH-SPRINT-HYBRID.md` daily
3. **Sept 6:** 🚀 LAUNCH MVP to production
4. **Sept 7-20:** Phase 2 streaming testing in parallel
5. **Oct 1:** Phase 2 update (streaming enabled)

---

## Contact

- **Launch Lead:** [Ops Lead]
- **Technical Lead:** [Backend Lead]
- **Product Lead:** [Product Manager]
- **Support Lead:** [Support Manager]

**Daily standup:** 9:00 AM (all leads + critical path)

---

**Status: ✅ READY TO LAUNCH**

**All systems go. Execute the plan. 6 days to go-live.**
