import { afterEach, expect, it, vi } from "vitest";
import { callGemini } from "../src/services/providers";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("reports the upstream HTTP status without retaining private error bodies", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("private upstream fixture detail", { status: 429 })));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(callGemini({} as never, "fixture", "gemini-3.5-flash-lite", "hello", "auto", false, 10))
    .rejects.toThrow("Gemini request failed (429)");
  expect(log).toHaveBeenCalledWith("DLOGICAI_UPSTREAM_FAILURE", { provider: "google", status: 429 });
});
