import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppContext, Env } from "../types";

export function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function now(): number {
  return Date.now();
}

export function jsonError(
  c: AppContext,
  code: string,
  message: string,
  status: ContentfulStatusCode = 400
): Response {
  return c.json(
    {
      error: {
        code,
        message,
      },
    },
    status
  );
}

/**
 * Local development:
 *   http://127.0.0.1:8787 -> do NOT use Secure
 *
 * Production:
 *   https://... -> Secure
 */
export function sessionCookie(
  c: AppContext,
  sessionId: string,
  maxAge: number
): string {
  const protocol = new URL(c.req.url).protocol;
  const secure = protocol === "https:";

  return [
    `dlogicai_session=${encodeURIComponent(sessionId)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};

  if (!header) {
    return out;
  }

  for (const part of header.split(";")) {
    const i = part.indexOf("=");

    if (i > 0) {
      const name = part.slice(0, i).trim();
      const value = part.slice(i + 1).trim();

      try {
        out[name] = decodeURIComponent(value);
      } catch {
        out[name] = value;
      }
    }
  }

  return out;
}

export function bearer(request: Request): string | null {
  const header = request.headers.get("Authorization");

  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token.trim();
}

export function appUrl(c: AppContext, path: string): string {
  return `${(c.env.APP_BASE_URL || new URL(c.req.url).origin).replace(/\/$/, "")}${path}`;
}

export function extractText(input: unknown): string {
  if (typeof input === "string") {
    return input;
  }

  if (Array.isArray(input)) {
    return input
      .map((message: any) => {
        if (typeof message?.content === "string") {
          return message.content;
        }

        if (Array.isArray(message?.content)) {
          return message.content
            .map((item: any) => item?.text || "")
            .join("");
        }

        return "";
      })
      .join("\n");
  }

  if (input && typeof input === "object") {
    return JSON.stringify(input);
  }

  return "";
}

export async function sendEmail(
  c: AppContext,
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  const apiKey = c.env.RESEND_API_KEY || "";
  const from = c.env.EMAIL_FROM || "";
  if (!apiKey || !from || apiKey === "re_xxxxxxxxx" || from.includes("example.com")) {
    console.warn("EMAIL_DELIVERY_NOT_CONFIGURED", {
      subject,
      hasApiKey: Boolean(apiKey),
      apiKeyLooksLikePlaceholder: apiKey === "re_xxxxxxxxx",
      hasFrom: Boolean(from),
      fromLooksLikePlaceholder: from.includes("example.com"),
    });
    return false;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: c.env.EMAIL_FROM,
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    console.error("EMAIL_DELIVERY_FAILED", {
      status: response.status,
      reason:
        response.status === 401
          ? "RESEND_API_KEY_REJECTED"
          : response.status === 403
            ? "RESEND_SENDER_NOT_AUTHORIZED_OR_API_KEY_REJECTED"
            : "RESEND_REQUEST_FAILED",
    });
    return false;
  }

  return true;
}
