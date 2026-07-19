// Widget flutuante de suporte via IA (Fase C, item 9) — incluído via
// <script src="support-widget.js" defer> nas 7 telas do painel do
// profissional (index/alunos/treinos/avaliacoes/nutri/perfil/relatorios).
// Autocontido de propósito: cria o próprio client Supabase (mesmo padrão
// de duplicar SUPABASE_URL/ANON_KEY que cada página já usa) em vez de
// depender do `supa` global de cada página — assim não importa a ordem
// de carregamento nem a estrutura de cada arquivo.
//
// Reusa os tokens de design (--primary, --card-grad, --radius-lg etc.) já
// definidos no :root de cada página — não redefine paleta, só injeta a UI.

(function () {
  const SUPABASE_URL = 'https://yumqmramxbahkfxsthtt.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1bXFtcmFteGJhaGtmeHN0aHR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NzQxNTgsImV4cCI6MjA5ODQ1MDE1OH0.7br_PYBCn1h7lUrCfpJ3VP3HOxMXmoVFyo-GTwVf3Zc';
  const STORAGE_KEY = 'mp_support_chat_v1';
  const CONV_ID_KEY = 'mp_support_conversation_id';

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  const style = document.createElement('style');
  style.textContent = `
    #supportFab { position:fixed; right:16px; bottom:20px; width:52px; height:52px; border-radius:50%; background:var(--primary,#2D6BE4); color:#fff; border:none; box-shadow:0 8px 20px -6px rgba(20,30,45,.4); display:flex; align-items:center; justify-content:center; cursor:pointer; z-index:500; transition:transform .15s ease; }
    #supportFab:active { transform:scale(.94); }
    #supportFab svg { width:24px; height:24px; }
    #supportFab.has-nav { bottom:80px; }
    #supportOverlay { position:fixed; inset:0; background:rgba(15,20,28,.55); z-index:600; display:none; align-items:flex-end; justify-content:center; }
    #supportOverlay.show { display:flex; }
    #supportPanel { width:100%; max-width:480px; height:min(78vh, 640px); background:var(--bg,#F8F9FA); border-radius:20px 20px 0 0; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 -10px 30px rgba(20,30,45,.25); }
    #supportHeader { display:flex; align-items:center; justify-content:space-between; padding:14px 16px; background:var(--card,#fff); border-bottom:1px solid var(--line,#E9EBEF); }
    #supportHeader h3 { margin:0; font-size:15px; font-weight:700; color:var(--text,#1E2A3A); font-family:var(--font,sans-serif); }
    #supportHeader p { margin:2px 0 0; font-size:11px; color:var(--muted,#63707F); font-family:var(--font,sans-serif); }
    #supportCloseBtn { background:none; border:none; cursor:pointer; color:var(--muted,#63707F); padding:6px; display:flex; }
    #supportCloseBtn svg { width:20px; height:20px; }
    #supportMessages { flex:1; overflow-y:auto; padding:14px 16px; display:flex; flex-direction:column; gap:10px; }
    .support-msg { max-width:82%; padding:9px 12px; border-radius:14px; font-size:13.5px; line-height:1.45; font-family:var(--font,sans-serif); white-space:pre-wrap; }
    .support-msg.user { align-self:flex-end; background:var(--primary,#2D6BE4); color:#fff; border-bottom-right-radius:4px; }
    .support-msg.assistant { align-self:flex-start; background:var(--card,#fff); color:var(--text,#1E2A3A); border:1px solid var(--line,#E9EBEF); border-bottom-left-radius:4px; }
    .support-msg.error { align-self:flex-start; background:#FDEDEC; color:#C0392B; }
    .support-typing { align-self:flex-start; display:flex; gap:4px; padding:10px 12px; }
    .support-typing span { width:6px; height:6px; border-radius:50%; background:var(--muted,#94A0AF); opacity:.5; animation:supportTypingBlink 1s infinite; }
    .support-typing span:nth-child(2) { animation-delay:.15s; }
    .support-typing span:nth-child(3) { animation-delay:.3s; }
    @keyframes supportTypingBlink { 0%,80%,100%{opacity:.3} 40%{opacity:1} }
    #supportEmpty { color:var(--muted,#63707F); font-size:13px; text-align:center; padding:24px 12px; font-family:var(--font,sans-serif); }
    #supportForm { display:flex; gap:8px; padding:12px; border-top:1px solid var(--line,#E9EBEF); background:var(--card,#fff); }
    #supportInput { flex:1; border:1px solid var(--line,#E9EBEF); border-radius:12px; padding:10px 12px; font-size:13.5px; font-family:var(--font,sans-serif); resize:none; max-height:90px; color:var(--text,#1E2A3A); background:var(--bg,#F8F9FA); }
    #supportSendBtn { background:var(--primary,#2D6BE4); color:#fff; border:none; border-radius:12px; width:42px; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; }
    #supportSendBtn:disabled { opacity:.5; cursor:default; }
    #supportSendBtn svg { width:18px; height:18px; }
  `;
  document.head.appendChild(style);

  const fab = document.createElement('button');
  fab.id = 'supportFab';
  fab.type = 'button';
  fab.setAttribute('aria-label', 'Suporte');
  fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  if (document.querySelector('.bottom-nav')) fab.classList.add('has-nav');
  document.body.appendChild(fab);

  const overlay = document.createElement('div');
  overlay.id = 'supportOverlay';
  overlay.innerHTML = `
    <div id="supportPanel">
      <div id="supportHeader">
        <div>
          <h3>Suporte</h3>
          <p>Resposta na hora — sem fila</p>
        </div>
        <button id="supportCloseBtn" type="button" aria-label="Fechar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div id="supportMessages"></div>
      <form id="supportForm">
        <textarea id="supportInput" rows="1" placeholder="Digite sua dúvida..." maxlength="4000"></textarea>
        <button id="supportSendBtn" type="submit" aria-label="Enviar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </form>
    </div>`;
  document.body.appendChild(overlay);

  const messagesEl = overlay.querySelector('#supportMessages');
  const formEl = overlay.querySelector('#supportForm');
  const inputEl = overlay.querySelector('#supportInput');
  const sendBtn = overlay.querySelector('#supportSendBtn');

  let history = [];
  try { history = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]'); } catch { history = []; }
  let conversationId = sessionStorage.getItem(CONV_ID_KEY) || null;

  function persist() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-60))); } catch {}
  }

  function renderMessages() {
    if (!history.length) {
      messagesEl.innerHTML = '<div id="supportEmpty">Dúvida sobre o Meu Protocolo? Pergunte aqui — respondo na hora.</div>';
      return;
    }
    messagesEl.innerHTML = history.map((m) =>
      `<div class="support-msg ${m.role === 'user' ? 'user' : (m.error ? 'error' : 'assistant')}">${escapeHtml(m.content)}</div>`
    ).join('');
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function setTyping(on) {
    let el = messagesEl.querySelector('.support-typing');
    if (on && !el) {
      el = document.createElement('div');
      el.className = 'support-typing';
      el.innerHTML = '<span></span><span></span><span></span>';
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    } else if (!on && el) {
      el.remove();
    }
  }

  function openPanel() {
    overlay.classList.add('show');
    renderMessages();
    setTimeout(() => inputEl.focus(), 50);
  }
  function closePanel() { overlay.classList.remove('show'); }

  fab.addEventListener('click', openPanel);
  overlay.querySelector('#supportCloseBtn').addEventListener('click', closePanel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closePanel(); });

  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(90, inputEl.scrollHeight) + 'px';
  });
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); formEl.requestSubmit(); }
  });

  let sending = false;
  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = inputEl.value.trim();
    if (!text || sending) return;

    sending = true;
    sendBtn.disabled = true;
    inputEl.value = '';
    inputEl.style.height = 'auto';

    history.push({ role: 'user', content: text });
    persist();
    renderMessages();
    setTyping(true);

    try {
      const supa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: { session } } = await supa.auth.getSession();
      if (!session) throw new Error('Sessão expirada — recarregue a página e faça login de novo.');

      const { data, error } = await supa.functions.invoke('support-chat', {
        body: { conversation_id: conversationId, message: text },
      });

      setTyping(false);

      if (error || data?.error) {
        let motivo = data?.error || error?.message || 'erro desconhecido';
        if (error?.context?.json) {
          try { const body = await error.context.json(); if (body?.error) motivo = body.error; } catch {}
        }
        history.push({ role: 'assistant', content: 'Não consegui responder agora (' + motivo + '). Tenta de novo em instantes ou me manda um e-mail em suporte@meuprotocolo.app.', error: true });
      } else {
        if (data.conversation_id && data.conversation_id !== conversationId) {
          conversationId = data.conversation_id;
          try { sessionStorage.setItem(CONV_ID_KEY, conversationId); } catch {}
        }
        history.push({ role: 'assistant', content: data.reply });
      }
    } catch (err) {
      setTyping(false);
      history.push({ role: 'assistant', content: err instanceof Error ? err.message : String(err), error: true });
    }

    persist();
    renderMessages();
    sending = false;
    sendBtn.disabled = false;
  });
})();
