import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ auth: { tenantId: "tenant", userId: "owner", role: "owner" } as any, response: vi.fn(), telegram: vi.fn() }));
vi.mock("../src/utils/auth", () => ({ requireDashboard: async () => state.auth }));
vi.mock("../src/routes/responses", () => ({ executeResponse: (...args: any[]) => state.response(...args) }));
vi.mock("../src/integrations/telegram-management", async (original) => ({ ...await original<typeof import('../src/integrations/telegram-management')>(), telegramCall: (...args: any[]) => state.telegram(...args) }));
import { webWidgetRoutes } from "../src/routes/web-widgets";
import { telegramConnectRoutes } from "../src/routes/telegram-connect";
import { sha256 } from "../src/utils/crypto";
import { issueBusinessIdentity } from '../src/services/business-identity';
class Statement {
  values: any[] = [];
  constructor(readonly db: DatabaseSync, readonly sql: string) {}
  bind(...values: any[]) { this.values = values; return this; }
  async first() { return this.db.prepare(this.sql).get(...this.values) ?? null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.values) }; }
  async run() { return { meta: { changes: Number(this.db.prepare(this.sql).run(...this.values).changes) } }; }
}
class SqlDb {
  raw = new DatabaseSync(":memory:");
  prepare(sql: string) { return new Statement(this.raw, sql); }
  async batch(statements: Statement[]) { this.raw.exec("BEGIN"); try { const results = []; for (const s of statements) results.push(await s.run()); this.raw.exec("COMMIT"); return results; } catch (error) { this.raw.exec("ROLLBACK"); throw error; } }
}
let db: SqlDb;
let env: any;
const scope = "/v1/projects/project/chat-services/service";
const config = { origin: "https://customer.test", title: "Support", welcome: "Hello", color: "#2563eb", position: "right" };
function req(path: string, body?: unknown, headers: Record<string,string> = {}, method = "POST") {
  return webWidgetRoutes.request(path, { method, headers: { "Content-Type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, env);
}
async function saved() { await req(`${scope}/web-widget`, config, {}, "PUT"); return db.raw.prepare("SELECT * FROM web_widgets").get() as any; }
async function active() { const w = await saved(); await req(`${scope}/web-widget/status`, { status: "active" }); return w; }
async function session(w: any) { const response = await req(`/v1/widgets/${w.id}/sessions`, {}, { Origin: config.origin }); return await response.json() as any; }
const tg = (path: string, body?: any, method = 'POST', headers = {}) => telegramConnectRoutes.request(path, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, env);
const webhook = (body: any) => tg('/v1/webhooks/telegram-manager', body, 'POST', { 'X-Telegram-Bot-Api-Secret-Token': 'manager-secret' });
beforeEach(() => {
  db = new SqlDb();
  db.raw.exec(`CREATE TABLE audit_logs (id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, action TEXT, resource_type TEXT, resource_id TEXT, metadata_json TEXT, created_at INTEGER);
    CREATE TABLE chat_services (id TEXT PRIMARY KEY, tenant_id TEXT, project_id TEXT);
    INSERT INTO chat_services VALUES ('service','tenant','project');
    CREATE TABLE conversations (id TEXT PRIMARY KEY, tenant_id TEXT, project_id TEXT);
    CREATE TABLE messages (id TEXT, conversation_id TEXT, role TEXT, content TEXT, created_at INTEGER);
    CREATE TABLE channel_installations (id TEXT PRIMARY KEY, tenant_id TEXT, project_id TEXT, chat_service_id TEXT, channel TEXT, external_account_id TEXT, encrypted_credentials TEXT, webhook_secret_hash TEXT, status TEXT, created_at INTEGER, updated_at INTEGER, UNIQUE(project_id,channel,external_account_id));`);
  db.raw.exec(readFileSync(new URL('../migrations/027_webchat_telegram_onboarding.sql', import.meta.url), 'utf8'));
  db.raw.exec(readFileSync(new URL('../migrations/030_multiple_web_widgets.sql', import.meta.url), 'utf8'));
  db.raw.exec(readFileSync(new URL('../migrations/031_web_widget_names.sql', import.meta.url), 'utf8'));
  db.raw.exec(readFileSync(new URL('../migrations/032_staff_portals.sql', import.meta.url), 'utf8'));
  db.raw.exec('ALTER TABLE web_widget_sessions ADD COLUMN business_identity_hash TEXT');
  env = { DB: db, SESSION_SECRET: 'fixture-identity-secret', MASTER_KEY: '01'.repeat(32), APP_BASE_URL: 'https://app.test', TELEGRAM_MANAGER_USERNAME: 'ManagerBot', TELEGRAM_MANAGER_BOT_TOKEN: 'fixture-token', TELEGRAM_MANAGER_WEBHOOK_SECRET: 'manager-secret' };
  state.auth = { tenantId: 'tenant', userId: 'owner', role: 'owner' };
  state.response.mockReset(); state.response.mockImplementation(async (c) => c.json({ output_text: 'Hello from AI', usage: { private: true } }));
  state.telegram.mockReset(); state.telegram.mockImplementation(async (_token, method) => method === 'getManagedBotToken' ? 'bot-token' : method === 'getMe' ? { id: 42 } : true);
});
afterEach(() => db.raw.close());
describe('public Web Chat lifecycle', () => {
  it('requires renewed verification after private identity is bound and rejects switching customer in the same session',async()=>{
    const w=await active(),s=await session(w),headers={Origin:config.origin,Authorization:'Bearer '+s.token};
    const scope={tenant:'tenant',project:'project',service:'service',conversation:s.conversation_id};
    const identity=await issueBusinessIdentity(env.SESSION_SECRET,{...scope,subjects:{crm:'123'}});
    const send=(token?:string)=>req(`/v1/widgets/${w.id}/messages`,{input:'Hello',message_id:crypto.randomUUID(),...(token?{business_identity:token}:{})},headers);
    expect((await send(identity)).status).toBe(200);expect((await send()).status).toBe(401);
    expect((await send(await issueBusinessIdentity(env.SESSION_SECRET,{...scope,subjects:{crm:'456'}}))).status).toBe(401);
    expect((await send(identity)).status).toBe(200);expect(state.response).toHaveBeenCalledTimes(2);
  });
  it('saves independent widget templates and keeps instructions out of public sessions', async () => {
    const first = await (await req(`${scope}/web-widget`, { ...config, name: 'Support', conversation_template: 'support', output_template: 'bullets', conversation_instructions: 'Ask for the order reference.' })).json() as any;
    const second = await (await req(`${scope}/web-widget`, { ...config, name: 'Sales', conversation_template: 'leads', output_template: 'concise' })).json() as any;
    const list = await (await req(`${scope}/web-widget`, undefined, {}, 'GET')).json() as any;
    expect(list.widgets.find((w: any) => w.id === first.widget.id).config.output_template).toBe('bullets');
    expect(list.widgets.find((w: any) => w.id === second.widget.id).config.output_template).toBe('concise');
    await req(`${scope}/web-widget/${first.widget.id}/status`, { status: 'active' });
    const visitor = await session(first.widget);
    expect(JSON.stringify(visitor)).not.toContain('order reference');
    expect(visitor.config).not.toHaveProperty('conversation_instructions');
    await req(`/v1/widgets/${first.widget.id}/messages`, { input: 'Help', message_id: crypto.randomUUID(), behavior: { conversation_template: 'leads', output_template: 'steps' } }, { Origin: config.origin, Authorization: `Bearer ${visitor.token}` });
    expect(state.response.mock.calls[0][4].widgetBehavior).toMatchObject({ conversation_template: 'support', output_template: 'bullets', conversation_instructions: 'Ask for the order reference.' });
  });
  it('uses the current preview settings and validates templates before invoking AI', async () => {
    const behavior = { conversation_template: 'booking', output_template: 'steps', conversation_instructions: 'Ask for timezone.' };
    expect((await req(`${scope}/web-widget/preview`, { input: 'Hello', behavior })).status).toBe(200);
    expect(state.response.mock.calls[0][4].widgetBehavior).toEqual({ ...behavior, business_data_enabled: true });
    state.response.mockClear();
    expect((await req(`${scope}/web-widget/preview`, { input: 'Hello', behavior: { output_template: 'html' } })).status).toBe(400);
    expect((await req(`${scope}/web-widget`, { ...config, conversation_instructions: 'x'.repeat(2001) })).status).toBe(400);
    expect((await req(`${scope}/web-widget`, { ...config, conversation_template: 'unknown' })).status).toBe(400);
    expect(state.response).not.toHaveBeenCalled();
  });

  it('records widget actions without configuration secrets and records the actual legacy widget target', async () => {
    const widget = await saved();
    await req(`${scope}/web-widget/status`, { status: 'active' });
    const rows = db.raw.prepare("SELECT * FROM audit_logs ORDER BY created_at").all() as any[];
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.resource_id === widget.id && row.tenant_id === 'tenant')).toBe(true);
    expect(rows.map(row => row.action)).toContain('widget.status.active');
    expect(JSON.stringify(rows)).not.toContain(config.origin);
    expect(JSON.parse(rows[0].metadata_json).request_id).toMatch(/^request_/);
    expect((await req(`${scope}/web-widget/missing/status`, {status:'active'})).status).toBe(404);
    expect(db.raw.prepare("SELECT * FROM audit_logs").all()).toHaveLength(2);
  });

  it('creates and lists multiple widgets for one Chat Service', async () => {
    expect((await req(`${scope}/web-widget`, { ...config, name: 'Support widget' })).status).toBe(201);
    expect((await req(`${scope}/web-widget`, { ...config, name: 'Sales widget', origin: 'https://second.test', title: 'Sales' })).status).toBe(201);
    const response = await req(`${scope}/web-widget`, undefined, {}, 'GET');
    const data = await response.json() as any;
    expect(data.widgets).toHaveLength(2);
    expect(new Set(data.widgets.map((item: any) => item.id)).size).toBe(2);
    expect(data.widgets.map((item: any) => item.name)).toEqual(expect.arrayContaining(['Support widget', 'Sales widget']));
  });
  it('saves a draft without allowing traffic; activation enforces the exact website origin', async () => {
    const w = await saved(); expect(w.status).toBe('draft');
    expect((await req(`/v1/widgets/${w.id}/sessions`, {}, { Origin: config.origin })).status).toBe(403);
    await req(`${scope}/web-widget/status`, { status: 'active' });
    for (const origin of ['', 'https://evil.test', 'https://customer.test.evil.test', 'null']) expect((await req(`/v1/widgets/${w.id}/sessions`, {}, { Origin: origin })).status).toBe(403);
    const response = await req(`/v1/widgets/${w.id}/sessions`, {}, { Origin: config.origin });
    expect(response.status).toBe(200); expect(response.headers.get('Access-Control-Allow-Origin')).toBe(config.origin); expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    const preflight = await req(`/v1/widgets/${w.id}/sessions`, undefined, { Origin: config.origin }, 'OPTIONS'); expect(preflight.status).toBe(204);
  });
  it('rejects invalid domains and unauthorized configuration', async () => {
    for (const origin of ['http://customer.test','https://user:pass@customer.test']) expect((await req(`${scope}/web-widget`, { ...config, origin }, {}, 'PUT')).status).toBe(400);
    expect((await req(`${scope}/web-widget`, { ...config, origin: 'http://localhost:4321/demo' }, {}, 'PUT')).status).toBe(200);
    state.auth.role = 'billing'; expect((await req(`${scope}/web-widget`, config, {}, 'PUT')).status).toBe(403);
    state.auth.role = 'owner'; state.auth.tenantId = 'other'; expect((await req(`${scope}/web-widget`, config, {}, 'PUT')).status).toBe(404);
    state.auth = null; expect((await req(`${scope}/web-widget`, config, {}, 'PUT')).status).toBe(401);
  });
  it('keeps credentials server-side and binds messages to the widget visitor conversation', async () => {
    const w = await active(); const s = await session(w);
    const stored = db.raw.prepare('SELECT * FROM web_widget_sessions').get() as any;
    expect(stored.token_hash).toBe(await sha256(s.token)); expect(JSON.stringify(stored)).not.toContain(s.token);
    const response = await req(`/v1/widgets/${w.id}/messages`, { input: 'Hi', message_id: crypto.randomUUID(), tenant_id: 'other', conversation_id: 'stolen', stream: true }, { Origin: config.origin, Authorization: `Bearer ${s.token}` });
    expect(await response.json()).toEqual({ output_text: 'Hello from AI' });
    expect(state.response.mock.calls[0][1]).toMatchObject({ tenantId: 'tenant' });
    expect(state.response.mock.calls[0][2]).toBe('project');
    expect(state.response.mock.calls[0][3]).toEqual({ input: 'Hi', conversation_id: stored.conversation_id, chat_service_id: 'service', stream: false });
    expect((db.raw.prepare('SELECT locked_until FROM web_widget_sessions').get() as any).locked_until).toBe(0);
  });
  it('blocks expired sessions and sessions used for another widget, and deactivation stops existing visitors', async () => {
    const w = await active(); const s = await session(w); const headers = { Origin: config.origin, Authorization: `Bearer ${s.token}` }; const body = { input: 'Hi', message_id: crypto.randomUUID() };
    db.raw.exec(`INSERT INTO chat_services VALUES ('service2','tenant','project'); INSERT INTO web_widgets (id,tenant_id,project_id,chat_service_id,name,config_json,status,created_at,updated_at) SELECT 'other',tenant_id,project_id,'service2',name,config_json,status,created_at,updated_at FROM web_widgets;`);
    expect((await req('/v1/widgets/other/messages', body, headers)).status).toBe(401);
    db.raw.exec('UPDATE web_widget_sessions SET expires_at = 0'); expect((await req(`/v1/widgets/${w.id}/messages`, body, headers)).status).toBe(401);
    await req(`${scope}/web-widget/status`, { status: 'inactive' }); expect((await req(`/v1/widgets/${w.id}/messages`, body, headers)).status).toBe(403); expect(state.response).not.toHaveBeenCalled();
  });
  it('limits messages before provider work and releases the conversation lock on failure', async () => {
    const w = await active(); const s = await session(w); const headers = { Origin: config.origin, Authorization: `Bearer ${s.token}` };
    for (let i = 0; i < 10; i++) expect((await req(`/v1/widgets/${w.id}/messages`, { input: 'Hi', message_id: crypto.randomUUID() }, headers)).status).toBe(200);
    expect((await req(`/v1/widgets/${w.id}/messages`, { input: 'Hi', message_id: crypto.randomUUID() }, headers)).status).toBe(429); expect(state.response).toHaveBeenCalledTimes(10);
    db.raw.exec('DELETE FROM channel_rate_limits'); state.response.mockResolvedValue(new Response(JSON.stringify({ error: { code: 'PROVIDER_ERROR', message: 'Failed' } }), { status: 502 }));
    expect((await req(`/v1/widgets/${w.id}/messages`, { input: 'Hi', message_id: crypto.randomUUID() }, headers)).status).toBe(502);
    expect((db.raw.prepare('SELECT locked_until FROM web_widget_sessions').get() as any).locked_until).toBe(0);
  });
  it('changing website returns an active widget to draft', async () => { await active(); await req(`${scope}/web-widget`, { ...config, origin: 'https://new.test' }, {}, 'PUT'); expect((db.raw.prepare('SELECT status FROM web_widgets').get() as any).status).toBe('draft'); });
});
describe('Telegram managed connection', () => {
  it('requires platform setup without exposing credentials', async () => { env.TELEGRAM_MANAGER_BOT_TOKEN = ''; const response = await tg(`${scope}/telegram-connect`); expect(response.status).toBe(503); expect(state.telegram).not.toHaveBeenCalled(); });
  it('validates manager signatures before writing', async () => { const response = await tg('/v1/webhooks/telegram-manager', { update_id: 1 }); expect(response.status).toBe(401); expect(state.telegram).not.toHaveBeenCalled(); });
  it('links identity, requires dashboard confirmation and installs a managed bot idempotently in testing', async () => {
    const started = await (await tg(`${scope}/telegram-connect`)).json() as any; const token = new URL(started.url).searchParams.get('start');
    expect((await tg(`${scope}/telegram-connect/${started.id}/confirm`)).status).toBe(409);
    await webhook({ update_id: 1, message: { text: `/start ${token}`, chat: { type: 'private' }, from: { id: 123, username: 'tenant_user' } } });
    const managed = { update_id: 2, managed_bot: { user: { id: 123 }, bot: { id: 42, is_bot: true } } };
    await webhook(managed); expect(state.telegram).not.toHaveBeenCalled();
    state.auth.tenantId = 'other'; expect((await tg(`${scope}/telegram-connect/${started.id}/confirm`)).status).toBe(404); state.auth.tenantId = 'tenant';
    expect((await tg(`${scope}/telegram-connect/${started.id}/confirm`)).status).toBe(200);
    await webhook({ update_id: 3, managed_bot: { user: { id: 999 }, bot: { id: 42, is_bot: true } } });
    expect(state.telegram).not.toHaveBeenCalled();
    expect((await webhook(managed)).status).toBe(200);
    const installation = db.raw.prepare('SELECT * FROM channel_installations').get() as any;
    expect(installation.status).toBe('testing'); expect(installation.tenant_id).toBe('tenant'); expect(installation.encrypted_credentials).not.toContain('bot-token');
    expect(state.telegram).toHaveBeenCalledWith('fixture-token', 'getManagedBotToken', { user_id: 42 });
    expect(state.telegram).toHaveBeenCalledWith('bot-token', 'setWebhook', expect.objectContaining({ url: `https://app.test/api/v1/webhooks/channels/telegram/${installation.id}` }));
    const calls = state.telegram.mock.calls.length; await webhook(managed); expect(state.telegram).toHaveBeenCalledTimes(calls);
    const result = await (await tg(`${scope}/telegram-connect/${started.id}`, undefined, 'GET')).json() as any; expect(result.status).toBe('completed'); expect(JSON.stringify(result)).not.toContain('bot-token');
    await webhook({ update_id: 4, managed_bot: { user: { id: 999 }, bot: { id: 42, is_bot: true } } });
    expect((db.raw.prepare('SELECT status FROM channel_installations').get() as any).status).toBe('inactive');
  });
  it('retries webhook registration without duplicating the installation or changing its secret', async () => {
    const started = await (await tg(`${scope}/telegram-connect`)).json() as any;
    const token = new URL(started.url).searchParams.get('start');
    await webhook({ update_id: 1, message: { text: `/start ${token}`, chat: { type: 'private' }, from: { id: 123 } } });
    await tg(`${scope}/telegram-connect/${started.id}/confirm`);
    let failed = false;
    state.telegram.mockImplementation(async (_token, method) => {
      if (method === 'setWebhook' && !failed) { failed = true; throw new Error('private upstream detail'); }
      return method === 'getManagedBotToken' ? 'bot-token' : method === 'getMe' ? { id: 42 } : true;
    });
    const update = { update_id: 2, managed_bot: { user: { id: 123 }, bot: { id: 42, is_bot: true } } };
    const first = await webhook(update); expect(first.status).toBe(503); expect(await first.text()).not.toContain('private upstream');
    const saved = db.raw.prepare('SELECT encrypted_credentials FROM channel_installations').get() as any;
    expect((await webhook(update)).status).toBe(200);
    expect(db.raw.prepare('SELECT * FROM channel_installations').all()).toHaveLength(1);
    expect((db.raw.prepare('SELECT encrypted_credentials FROM channel_installations').get() as any).encrypted_credentials).toBe(saved.encrypted_credentials);
    expect((db.raw.prepare('SELECT status FROM telegram_onboarding').get() as any).status).toBe('completed');
  });
  it('rejects expired identity links', async () => {
    const started = await (await tg(`${scope}/telegram-connect`)).json() as any;
    db.raw.exec('UPDATE telegram_onboarding SET expires_at = 0');
    await webhook({ update_id: 1, message: { text: `/start ${new URL(started.url).searchParams.get('start')}`, chat: { type: 'private' }, from: { id: 123 } } });
    expect((await tg(`${scope}/telegram-connect/${started.id}/confirm`)).status).toBe(409);
    expect(state.telegram).not.toHaveBeenCalled();
  });
});
