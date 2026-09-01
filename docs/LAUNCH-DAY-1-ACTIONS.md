# Launch Checklist — Day 1 Actions

**Today (Sept 1): Verification + Planning (No coding required!)**

---

## ✅ Verification Track (2-3 hours)

### 1. Test 2FA Enforcement ✅
```
Status: Already implemented in code
Verification: Test the flow (no changes needed)
```

**Quick Test:**
1. Register new account at http://localhost:4321
2. Navigate to security settings
3. Enroll in TOTP (scan QR code with authenticator app)
4. Logout
5. Login with email/password
6. Verify API returns: `{"error": {"code": "TWO_FACTOR_REQUIRED", ...}, "challenge": "..."}`
7. Submit TOTP code to `/v1/auth/login/2fa`
8. Verify login succeeds and session created

**Expected:** User cannot login without TOTP code ✅

---

### 2. Test Stripe Checkout (Sandbox) ✅
```
Status: Already implemented in code
Verification: End-to-end flow with Stripe sandbox
```

**Quick Test:**
1. Export Stripe test secret key: `STRIPE_SECRET_KEY=sk_test_...`
2. Start API: `pnpm exec wrangler dev --env local`
3. Use Postman / curl to call:
   ```bash
   POST http://localhost:8787/v1/billing/stripe/checkout
   {
     "plan_id": "plan_pro",
     "success_url": "http://localhost:4321/billing",
     "cancel_url": "http://localhost:4321/billing"
   }
   ```
4. Verify response includes `checkout_url` (Stripe session created)
5. Simulate webhook with Stripe CLI:
   ```bash
   stripe listen --api-key sk_test_... --forward-to http://localhost:8787/v1/billing/stripe/webhook
   ```
6. Complete checkout in Stripe dashboard
7. Verify webhook received and subscription created

**Expected:** Checkout flow works, webhook verified ✅

---

### 3. Test Invite Email Delivery ✅
```
Status: Already implemented in code
Verification: Invite email delivery with Resend API
```

**Quick Test:**
1. Export Resend API key: `RESEND_API_KEY=re_...`
2. Register account, login
3. Create project
4. In project settings, invite user: `test@example.com`
5. Check email inbox (should arrive within 2 seconds)
6. Click verification link in email
7. Verify tenant membership created for invited user

**Expected:** Invite email sent and received, link works ✅

---

## 📋 Configuration Track (1-2 hours)

### Decision: Stripe Mode
- **Option A (Safer):** Launch with **Stripe Sandbox Mode** (test keys)
  - Requires: STRIPE_SECRET_KEY=sk_test_... (test key)
  - Billing not charged (test mode)
  - Can switch to live mode in Phase 2 update
  - **Recommended for Day 6 launch**

- **Option B (Live):** Launch with **Stripe Live Mode** (live keys)
  - Requires: Real Stripe account + live keys
  - Real charges (careful!)
  - Can process real customer payments
  - Requires Stripe account setup (business info, bank, etc.)

**Recommendation:** Start with sandbox mode for safety. If business ready for live billing, upgrade post-launch.

---

### Decision: Email Sender
- **Option A:** noreply@dlogicai.com (no-reply address)
  - Cannot receive responses
  - Standard for transactional emails
  - **Recommended**

- **Option B:** hello@dlogicai.com (customer service address)
  - Can receive user responses
  - Requires email forwarding
  - More personable

**Recommendation:** Use noreply@ for launch, add hello@ in Phase 2.

---

### Decision: Domain & CORS
- **For Launch (Sept 6):** Determine production domain
  - Will Stripe/Resend be configured for specific domain?
  - What are allowed origins for CORS?
  - Examples: `https://app.dlogicai.com`, `https://dlogicai.com`

**Action Required:** Team decides production domain

---

## 🚀 Team Assignments (Today)

| Task | Owner | Effort | By When |
|------|-------|--------|---------|
| Verify 2FA enforcement | QA | 30 min | 2:00 PM |
| Verify Stripe Checkout flow | Backend Lead | 1 hour | 3:00 PM |
| Verify Invite email delivery | QA or Backend | 45 min | 3:30 PM |
| Document findings | Tech Lead | 30 min | 4:00 PM |
| Decide Stripe mode | Product/Ops | 15 min | 2:30 PM |
| Decide email sender | Product | 10 min | 2:30 PM |
| Decide production domain | Ops | 15 min | 3:00 PM |

---

## ⚠️ Blockers to Identify Today

If any of the 3 features don't work as expected:
1. **2FA not enforcing:** Check `apps/api/src/index.ts` lines 2565-2582 (should be checking enrolled_at)
2. **Stripe not creating sessions:** Check STRIPE_SECRET_KEY configuration, API key format
3. **Email not delivering:** Check RESEND_API_KEY, domain verification status

**Action:** If blocker found, escalate to tech lead immediately.

---

## 📅 Next: Day 2 (Sept 2)

Once verification complete:
1. Lock environment configuration (production keys)
2. Deploy to staging
3. Begin comprehensive feature testing
4. Update Stripe webhook endpoint (if switching to live)
5. Verify email domain (if updating sender)

---

## 🎯 Success = All 3 Green

✅ 2FA enforcing at login  
✅ Stripe Checkout creating sessions  
✅ Invite emails delivering  

**If all green:** On track for Sept 6 launch 🚀  
**If any blocker:** Escalate and replans Day 2
