// Local-only browser fixture: renders the actual page markup/scripts with mocked
// workspace APIs. It never connects to a real tenant, Telegram or AI provider.
import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
let widget = null;
let telegramStatus = 'pending';
let cssFile = (await readdir(new URL('dist/client/_astro/', root))).find((name) => name.startsWith('AppLayout.') && name.endsWith('.css'));
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:4321');
  cssFile = (await readdir(new URL('dist/client/_astro/', root))).find((name) => name.startsWith('AppLayout.') && name.endsWith('.css'));
  const send = (data, code = 200, type = 'application/json') => { response.writeHead(code, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(typeof data === 'string' ? data : JSON.stringify(data)); };
  try {
    let raw = ''; for await (const chunk of request) { raw += chunk; if (raw.length > 20000) { send({}, 413); return; } }
    const body = raw ? JSON.parse(raw) : {};
    if (url.pathname === '/embed.js') return send(await readFile(new URL('public/embed.js', root), 'utf8'), 200, 'text/javascript');
    if (url.pathname === '/fixture.css') return send(await readFile(new URL(`dist/client/_astro/${cssFile}`, root), 'utf8'), 200, 'text/css');
    if (url.pathname === '/api/v1/projects') return send({ projects: [{ id: 'project', name: 'Demo workspace' }] });
    if (url.pathname.endsWith('/chat-services')) return send({ chat_services: [{ id: 'service', name: 'Customer support' }] });
    if (url.pathname.endsWith('/web-widget')) { if (request.method === 'PUT') widget = { id: 'widget_fixture', status: widget?.status || 'draft', config: body }; return send({ widget }); }
    if (url.pathname.endsWith('/web-widget/status')) { widget.status = body.status; return send({ status: widget.status }); }
    if (url.pathname.endsWith('/web-widget/preview')) return send({ output_text: 'Fixture reply from your selected Chat Service.' });
    if (url.pathname.includes('/widgets/')) {
      if (widget?.status !== 'active') return send({ error: { message: 'Chat is inactive.' } }, 403);
      return send(url.pathname.endsWith('/sessions') ? { token: 'fixture', config: widget.config } : { output_text: 'Fixture customer reply.' });
    }
    if (url.pathname.endsWith('/telegram-connect')) { if (request.method === 'POST') { telegramStatus = 'pending'; return send({ id: 'pending_fixture', url: '/mock-telegram?step=link' }); } return send({ available: true }); }
    if (url.pathname.endsWith('/pending_fixture/confirm')) { telegramStatus = 'ready'; return send({ create_url: '/mock-telegram?step=create' }); }
    if (url.pathname.endsWith('/pending_fixture')) return send({ status: telegramStatus, telegram_name: telegramStatus === 'pending' ? null : 'demo_user', telegram_user_id: telegramStatus === 'pending' ? null : '123', create_url: '/mock-telegram?step=create', installation_id: telegramStatus === 'completed' ? 'fixture_install' : null });
    if (url.pathname.endsWith('/activate')) return send({ activated: true });
    if (url.pathname === '/mock-telegram') { telegramStatus = url.searchParams.get('step') === 'link' ? 'linked' : 'completed'; return send('<h1>Local Telegram fixture confirmed</h1><p>Return to the setup tab and check the connection.</p>', 200, 'text/html'); }
    if (url.pathname === '/customer') return send('<!doctype html><html><body><h1>Customer website fixture</h1><script async src="/embed.js" data-widget="widget_fixture"></script></body></html>', 200, 'text/html');
    const pages = { '/dashboard/webchat': 'webchat', '/dashboard/telegram-connect': 'telegram-connect' };
    if (!pages[url.pathname]) return send('Not found', 404, 'text/plain');
    const source = await readFile(new URL(`src/pages/dashboard/${pages[url.pathname]}.astro`, root), 'utf8');
    const markup = source.replace(/^---[\s\S]*?---\s*/, '').replace(/<AppLayout[^>]*>/, '').replace('</AppLayout>', '');
    return send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body class="bg-slate-50"><main class="mx-auto max-w-6xl p-6"><p class="mb-4 text-sm text-amber-700">Local interface fixture — no real accounts or provider calls</p>${markup}</main></body></html>`, 200, 'text/html');
  } catch { send({ error: { message: 'Fixture request failed' } }, 500); }
});
server.listen(4321, '127.0.0.1', () => console.log('Channel UI fixture ready at http://127.0.0.1:4321/dashboard/webchat'));
