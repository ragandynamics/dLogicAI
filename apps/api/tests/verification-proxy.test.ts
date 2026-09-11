import { beforeEach, describe, expect, it, vi } from "vitest";

const binding = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("cloudflare:workers", () => ({ env: { API: binding } }));
import { ALL } from "../../web/src/pages/api/[...path]";
import { GET } from "../../web/src/pages/v1/auth/email/verify";

describe("verification links through the web proxy", () => {
  beforeEach(() => binding.fetch.mockReset());
  it("redirects an old link with its query intact without invoking the API", async () => {
    const response = await GET({ request: new Request("https://web.test/v1/auth/email/verify?token=fixture_123") } as never);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/api/v1/auth/email/verify?token=fixture_123");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(binding.fetch).not.toHaveBeenCalled();
  });
  it("forwards verification token query parameters to the API service binding", async () => {
    binding.fetch.mockResolvedValue(new Response('{"verified":true}'));
    await ALL({ request: new Request("https://web.test/api/v1/auth/email/verify?token=fixture_123"), params: { path: "v1/auth/email/verify" } } as never);
    expect(binding.fetch).toHaveBeenCalledWith("https://api.internal/v1/auth/email/verify?token=fixture_123", expect.objectContaining({ method: "GET" }));
  });
});
