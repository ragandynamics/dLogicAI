// Operator-only setup. Supply these values via your approved secret environment;
// never put bot tokens in command-line arguments or source control.
const { TELEGRAM_MANAGER_BOT_TOKEN: token, TELEGRAM_MANAGER_USERNAME: username,
  TELEGRAM_MANAGER_WEBHOOK_SECRET: secret, APP_BASE_URL: app } = process.env;
if (!token || !username || !secret || !app || !/^[A-Za-z0-9_-]{16,255}$/.test(secret)) {
  throw new Error('Configure the manager token, username, webhook secret (16–255 safe characters), and APP_BASE_URL.');
}
const callback = new URL('/api/v1/webhooks/telegram-manager', app);
if (callback.protocol !== 'https:') throw new Error('APP_BASE_URL must use HTTPS.');
async function call(method, body = {}) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error();
    return data.result;
  } catch { throw new Error('Telegram setup failed. Check the manager configuration and retry.'); }
}
const me = await call('getMe');
if (me.username?.toLowerCase() !== username.toLowerCase()) throw new Error('The manager username does not match its token.');
await call('setWebhook', { url: callback.href, secret_token: secret, allowed_updates: ['message', 'managed_bot'] });
const info = await call('getWebhookInfo');
if (info.url !== callback.href) throw new Error('Telegram callback verification failed.');
console.log('Telegram manager webhook registered and verified. Enable Bot Management Mode in BotFather before tenant onboarding.');
