(() => {
  const config = window.dlogicaiConfig || {};
  if (!config.apiKey || !config.apiOrigin) return;
  const button = document.createElement("button");
  button.textContent = "Chat";
  button.style.cssText = "position:fixed;right:24px;bottom:24px;z-index:2147483647;border:0;border-radius:999px;background:#2563eb;color:#fff;padding:12px 18px;font:600 14px system-ui;cursor:pointer";
  const panel = document.createElement("div");
  panel.style.cssText = "display:none;position:fixed;right:24px;bottom:76px;z-index:2147483647;width:min(360px,calc(100vw - 32px));height:460px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 20px 50px #0f172a33;overflow:hidden;font:14px system-ui";
  panel.innerHTML = '<div style="padding:14px 16px;border-bottom:1px solid #e2e8f0;font-weight:700">dLogicAI</div><div data-messages style="height:350px;padding:12px;overflow:auto"></div><form data-form style="display:flex;gap:8px;padding:12px;border-top:1px solid #e2e8f0"><input data-input required style="min-width:0;flex:1;padding:9px;border:1px solid #cbd5e1;border-radius:8px"><button style="padding:9px 12px;border:0;border-radius:8px;background:#2563eb;color:#fff">Send</button></form>';
  const messages = panel.querySelector("[data-messages]");
  const add = (text, user) => { const item = document.createElement("div"); item.textContent = text; item.style.cssText = `margin:0 0 8px ${user ? "32px" : "0"};padding:9px;border-radius:8px;background:${user ? "#eff6ff" : "#f1f5f9"}`; messages.appendChild(item); messages.scrollTop = messages.scrollHeight; };
  add("Welcome. How can we help?", false);
  button.onclick = () => { panel.style.display = panel.style.display === "none" ? "block" : "none"; };
  panel.querySelector("[data-form]").onsubmit = async (event) => { event.preventDefault(); const input = panel.querySelector("[data-input]"); const text = input.value.trim(); if (!text) return; input.value = ""; add(text, true); const response = await fetch(`${config.apiOrigin}/v1/responses`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` }, body: JSON.stringify({ input: text }) }); const data = await response.json().catch(() => ({})); add(response.ok ? data.output?.text || data.text || "No response returned." : data.error?.message || "Unable to reach dLogicAI.", false); };
  document.body.append(button, panel);
})();
