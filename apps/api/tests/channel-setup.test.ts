import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ role: "developer", tenantId: "tenant-a" }));
vi.mock("../src/utils/auth", () => ({ requireDashboard: async () => auth }));
import { channelRoutes } from "../src/routes/channels";
import { chatServiceRoutes } from "../src/routes/chat-services";
import { sha256 } from "../src/utils/crypto";
const path = "/v1/projects/p/chat-services/s/channel-installations";
function database(service: unknown = { id: "s" }) {
  const run = vi.fn(async () => ({ meta: { changes: 1 } }));
  const bind = vi.fn(() => ({ first: async () => service, run }));
  return { db: { prepare: vi.fn(() => ({ bind })) }, bind, run };
}
describe("tenant channel setup", () => {
  beforeEach(() => { auth.role = "developer"; });
  it.each([
    ["telegram", {}],
    ["whatsapp", { app_secret: "app" }],
    ["whatsapp", { app_secret: "app", access_token: "token", phone_number_id: "   " }],
  ])("rejects incomplete %s credentials before writing", async (channel, credentials) => {
    const { db, run } = database();
    const response = await channelRoutes.request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel, external_account_id: "account", webhook_secret: "valid_secret_123456", credentials }) }, { DB: db } as never);
    expect(response.status).toBe(400); expect(run).not.toHaveBeenCalled();
  });
  it("does not create installations for an inaccessible service", async () => {
    const { db, bind, run } = database(null);
    const response = await channelRoutes.request(path, { method: "POST" }, { DB: db } as never);
    expect(response.status).toBe(404); expect(bind).toHaveBeenCalledWith("s", "p", "tenant-a"); expect(run).not.toHaveBeenCalled();
  });
  it("prevents billing users from changing web settings", async () => {
    auth.role = "billing";
    const { db } = database();
    const response = await chatServiceRoutes.request("/v1/projects/p/chat-services/s/channels/web", { method: "PUT" }, { DB: db } as never);
    expect(response.status).toBe(403); expect(db.prepare).not.toHaveBeenCalled();
  });
  it("verifies WhatsApp callbacks in testing without activating or writing", async () => {
    const { db, run } = database({ webhook_secret_hash: await sha256("setup-secret") });
    const response = await channelRoutes.request("/v1/webhooks/channels/whatsapp/i?hub.mode=subscribe&hub.verify_token=setup-secret&hub.challenge=123", {}, { DB: db } as never);
    expect(response.status).toBe(200); expect(await response.text()).toBe("123");
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("status IN ('testing', 'active')")); expect(run).not.toHaveBeenCalled();
    const invalid = await channelRoutes.request("/v1/webhooks/channels/whatsapp/i?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123", {}, { DB: db } as never);
    expect(invalid.status).toBe(403);
  });
});
