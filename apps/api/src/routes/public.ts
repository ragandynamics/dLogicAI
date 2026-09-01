import { Hono } from "hono";
import { z } from "zod";
import type { AppContext, Env, HonoVariables } from "../types";
import { id, now, jsonError } from "../utils/common";

const router = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

router.get("/health", (c) =>
  c.json({
    ok: true,
    service: "dlogicai-api",
    version: "0.1.0",
  })
);

router.post("/v1/public/contact", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(120),
      company_name: z.string().trim().max(160).optional().default(""),
      country_code: z.string().trim().regex(/^\+[1-9][0-9]{0,3}$/),
      country: z.string().trim().min(2).max(100),
      mobile: z.string().trim().regex(/^[0-9][0-9]{6,14}$/),
      email: z.string().trim().email().max(255),
      enquiry_type: z.enum([
        "sales",
        "product",
        "support",
        "partnership",
        "other",
      ]),
      query: z.string().trim().min(3).max(5000),
      turnstile_token: z.string().max(4000).optional().default(""),
    })
    .safeParse(body);
  if (!parsed.success) {
    return jsonError(
      c,
      "INVALID_REQUEST",
      "Please provide your name, contact details, enquiry type, and message."
    );
  }
  const turnstileEnabled = c.env.TURNSTILE_ENABLED === "true";
  if (turnstileEnabled && !c.env.TURNSTILE_SECRET_KEY) {
    return jsonError(
      c,
      "CAPTCHA_NOT_CONFIGURED",
      "Contact form CAPTCHA is not configured.",
      503
    );
  }

  if (turnstileEnabled) {
    if (!parsed.data.turnstile_token) {
      return jsonError(
        c,
        "CAPTCHA_REQUIRED",
        "Please complete the CAPTCHA and try again.",
        400
      );
    }
    const verification = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: c.env.TURNSTILE_SECRET_KEY,
          response: parsed.data.turnstile_token,
          remoteip: c.req.header("CF-Connecting-IP") || undefined,
        }),
      }
    );
    const result = await verification
      .json<{ success?: boolean }>()
      .catch(() => ({ success: false }));
    if (!verification.ok || !result.success) {
      return jsonError(
        c,
        "CAPTCHA_FAILED",
        "Please complete the CAPTCHA and try again.",
        400
      );
    }
  }

  const leadId = id("lead");
  await c.env.DB.prepare(
    `INSERT INTO public_contact_leads
      (id,name,company_name,country_code,country,mobile,email,enquiry_type,query,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  )
    .bind(
      leadId,
      parsed.data.name,
      parsed.data.company_name,
      parsed.data.country_code,
      parsed.data.country,
      `${parsed.data.country_code}${parsed.data.mobile}`,
      parsed.data.email,
      parsed.data.enquiry_type,
      parsed.data.query,
      now()
    )
    .run();
  return c.json({ accepted: true, lead_id: leadId }, 201);
});

export const publicRoutes = router;
