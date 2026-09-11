// Keep provider URLs and raw provider errors behind this adapter. Tokens never
// leave server-side code and must never be included in exception text or logs.
export async function telegramCall<T>(token: string, method: "getManagedBotToken" | "setWebhook" | "getMe" | "getWebhookInfo", body: Record<string, unknown> = {}): Promise<T> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    const data = await response.json() as { ok?: boolean; result?: T };
    if (!response.ok || !data.ok || data.result === undefined) throw new Error();
    return data.result;
  } catch { throw new Error("Telegram connection could not be completed. Please retry."); }
}

export function managedBotLink(manager: string) {
  return `https://t.me/newbot/${encodeURIComponent(manager)}/MySupportBot?name=Customer%20Support`;
}
