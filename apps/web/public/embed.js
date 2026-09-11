(() => {
  const script = document.currentScript;
  function mount(target, config, send, floating = false) {
    const host = document.createElement('div');
    if (floating) { host.style.cssText = 'position:fixed;bottom:20px;z-index:2147483647;max-width:calc(100vw - 32px)'; }
    host.style.width = '350px'; if (!floating) host.style.maxWidth = '100%';
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `:host{font:14px system-ui;color:#0f172a}*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}button:disabled{opacity:.6;cursor:wait}.panel{width:350px;max-width:100%;background:white;border:1px solid #cbd5e1;border-radius:16px;overflow:hidden;box-shadow:0 12px 40px #0f172a22}.header{display:flex;justify-content:space-between;align-items:center;padding:16px;color:white;font-weight:700}.close{background:transparent;color:inherit;border:0;font-size:22px}.messages{height:280px;overflow:auto;padding:14px;white-space:pre-wrap;overflow-wrap:anywhere}.bubble{background:#f1f5f9;padding:10px;border-radius:10px;margin-bottom:10px}.user{background:#eff6ff;margin-left:24px}.form{display:flex;gap:8px;padding:12px;border-top:1px solid #e2e8f0}.input{min-width:0;flex:1;border:1px solid #cbd5e1;border-radius:8px;padding:10px}.send,.launcher{border:0;color:white;border-radius:8px;padding:10px 14px}.launcher{margin-top:12px;float:right;border-radius:99px}.status{padding:0 12px 10px;color:#b91c1c;font-size:12px}.hidden{display:none}`;
    root.append(style);
    const el = (tag, cls, text) => { const node = document.createElement(tag); node.className = cls; if (text) node.textContent = text; return node; };
    const panel = el('section', 'panel'); panel.setAttribute('aria-label', 'Customer chat');
    const header = el('header', 'header'); const title = el('span', '', config.title);
    const close = el('button', 'close', '\u00d7'); close.type = 'button'; close.setAttribute('aria-label', 'Close chat');
    header.append(title); if (floating) header.append(close);
    const messages = el('div', 'messages'); messages.setAttribute('role', 'log'); messages.setAttribute('aria-live', 'polite');
    const welcome = el('div', 'bubble', config.welcome); messages.append(welcome);
    for(const item of config.forms||[]){const link=el('a','bubble',item.title);link.href=new URL('/forms/'+encodeURIComponent(item.id),new URL(script.src).origin).href;link.target='_blank';link.rel='noopener noreferrer';link.style.display='block';messages.append(link);}
    const form = el('form', 'form'); const input = el('input', 'input'); input.required = true; input.maxLength = 4000; input.placeholder = 'Type a message'; input.setAttribute('aria-label', 'Message');
    const submit = el('button', 'send', 'Send'); submit.type = 'submit'; form.append(input, submit);
    const status = el('div', 'status'); status.setAttribute('role', 'status');
    panel.append(header, messages, form, status);
    const launcher = el('button', 'launcher', 'Chat'); launcher.type = 'button'; launcher.setAttribute('aria-expanded', 'false');
    root.append(panel); if (floating) { root.append(launcher); panel.classList.add('hidden'); }
    target.append(host);
    const toggle = () => { panel.classList.toggle('hidden'); const open = !panel.classList.contains('hidden'); launcher.setAttribute('aria-expanded', String(open)); if (open) input.focus(); else launcher.focus(); };
    launcher.onclick = toggle; close.onclick = toggle;
    root.addEventListener('keydown', (event) => { if (floating && event.key === 'Escape' && !panel.classList.contains('hidden')) toggle(); });
    const add = (text, user) => { messages.append(el('div', `bubble${user ? ' user' : ''}`, text)); messages.scrollTop = messages.scrollHeight; };
    let busy = false;
    form.onsubmit = async (event) => {
      event.preventDefault(); if (busy || !input.value.trim()) return;
      const text = input.value.trim(); busy = true; submit.disabled = true; input.disabled = true; status.textContent = '';
      add(text, true); input.value = '';
      try { add(await send(text), false); } catch (error) { status.textContent = error.message || 'Unable to send. Please try again.'; input.value = text; }
      finally { busy = false; submit.disabled = false; input.disabled = false; input.focus(); }
    };
    function update(next) {
      title.textContent = next.title; welcome.textContent = next.welcome;
      const color = /^#[a-f0-9]{6}$/i.test(next.color) ? next.color : '#2563eb';
      header.style.background = submit.style.background = launcher.style.background = color;
      if (floating) { host.style.left = next.position === 'left' ? '16px' : ''; host.style.right = next.position === 'left' ? '' : '16px'; }
    }
    update(config);
    return { update, destroy: () => host.remove() };
  }
  window.dlogicflowWidget = { mount };
  if (!script?.dataset.widget) return;
  const origin = new URL(script.src).origin;
  const widget = script.dataset.widget;
  let token;
  async function api(path, body) {
    const response = await fetch(`${origin}/api/v1/widgets/${encodeURIComponent(widget)}/${path}`, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || 'Chat is unavailable. Please reload to reconnect.');
    return data;
  }
  const start = async () => {
    try {
      const session = await api('sessions', {}); token = session.token;
      mount(document.body, session.config, async (input) => {
        const business_identity = typeof window.dLogicFlowIdentity === 'function' ? await window.dLogicFlowIdentity({widgetId:widget,conversationId:session.conversation_id}) : undefined;
        const data = await api('messages', { input, message_id: crypto.randomUUID(), ...(business_identity ? {business_identity} : {}) }); return data.output_text || 'No reply returned.';
      }, true);
    } catch { /* Inactive or unapproved websites must not display a working launcher. */ }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
