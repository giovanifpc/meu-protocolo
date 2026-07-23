// Assistente proativo (dicas contextuais) — Fase C, itens 10/11 do roadmap.
// Especificação vinda de um documento do usuário (2026-07-19). MVP: motor
// de regras determinístico no banco (get_next_hint/mark_hint_event, ver
// supabase_21_assistant_hints.sql) — este arquivo só busca a dica aplicável
// e renderiza. Zero chamada à Claude aqui, custo de IA = zero.
//
// Autocontido como support-widget.js: cria o próprio client Supabase,
// reaproveita os tokens de design (--primary, --card-grad etc.) já
// definidos em cada página. Posicionado no canto inferior ESQUERDO de
// propósito, pra não colidir com o botão de suporte (inferior direito).
//
// Expõe window.__checkAssistantHint pra páginas chamarem manualmente logo
// após uma ação relevante (cadastrar aluno, salvar treino) — feedback
// imediato em vez de esperar o próximo carregamento de página.
//
// Guia de instalação do PWA (2026-07-19, mesmo comportamento do aluno em
// student-hints.js): detecção de plataforma é client-side (o servidor não
// sabe o navegador) — 'ios' | 'chromium' | 'none' é passado pra get_next_hint.

(function () {
  const SUPABASE_URL = 'https://yumqmramxbahkfxsthtt.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1bXFtcmFteGJhaGtmeHN0aHR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NzQxNTgsImV4cCI6MjA5ODQ1MDE1OH0.7br_PYBCn1h7lUrCfpJ3VP3HOxMXmoVFyo-GTwVf3Zc';
  const supa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const ICONS = {
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
  };

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  let deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    checkHint(); // pode já estar esperando na tela — reavalia assim que o navegador confirmar suporte
  });

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }
  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function detectPlatform() {
    if (isStandalone()) return 'none';
    if (isIOS()) return 'ios';
    if (deferredInstallPrompt) return 'chromium';
    return 'none';
  }

  const HINT_ACCENT = '#7C3AED';

  const style = document.createElement('style');
  style.textContent = `
    #hintCard { position:fixed; left:16px; bottom:calc(64px + env(safe-area-inset-bottom) + 12px); max-width:320px; background:var(--card-grad,#fff); border:1px solid rgba(20,30,45,.06); border-left:5px solid ${HINT_ACCENT}; box-shadow:0 4px 20px -4px rgba(124,58,237,.4), var(--shadow-card,0 4px 16px rgba(0,0,0,.15)); border-radius:var(--radius-lg,16px); padding:16px 18px; z-index:450; display:none; font-family:var(--font,sans-serif); }
    #hintCard.show { display:block; animation:hintIn .2s ease; }
    @keyframes hintIn { from{opacity:0; transform:translateY(8px);} to{opacity:1; transform:translateY(0);} }
    #hintCard .hint-close { position:absolute; top:10px; right:10px; background:none; border:none; cursor:pointer; color:var(--muted,#94A0AF); padding:5px; display:flex; }
    #hintCard .hint-close svg { width:15px; height:15px; display:block; }
    #hintCard .hint-tag { display:inline-block; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.5px; color:${HINT_ACCENT}; background:rgba(124,58,237,.12); padding:3px 9px; border-radius:20px; margin-bottom:8px; }
    #hintCard p { margin:0 20px 12px 0; font-size:15px; line-height:1.5; color:var(--text,#1E2A3A); font-weight:500; }
    #hintCard .hint-steps { display:flex; flex-direction:column; gap:10px; margin-bottom:14px; }
    #hintCard .hint-step { display:flex; align-items:center; gap:10px; font-size:14px; color:var(--text,#1E2A3A); }
    #hintCard .hint-step .hint-step-num { flex-shrink:0; width:24px; height:24px; border-radius:50%; background:${HINT_ACCENT}; color:#fff; font-weight:800; font-size:12px; display:flex; align-items:center; justify-content:center; }
    #hintCard .hint-step svg { width:18px; height:18px; flex-shrink:0; color:${HINT_ACCENT}; }
    #hintCard .hint-actions { display:flex; gap:8px; flex-wrap:wrap; }
    #hintCard .hint-btn { background:${HINT_ACCENT}; color:#fff; border:none; border-radius:9px; padding:9px 14px; font-size:14px; font-weight:700; cursor:pointer; font-family:var(--font,sans-serif); }
    #hintCard .hint-btn.secondary { background:var(--bg,#F8F9FA); color:var(--text,#1E2A3A); border:1px solid var(--line,#E9EBEF); }
  `;
  document.head.appendChild(style);

  const card = document.createElement('div');
  card.id = 'hintCard';
  document.body.appendChild(card);

  let currentKey = null;
  let checking = false;

  // supabase-js: um query/rpc builder só dispara a requisição de verdade
  // quando algo consome o "thenable" (await ou .then()) — chamar supa.rpc(...)
  // sozinho, sem await, NUNCA envia a chamada. Retorna a Promise pra quem
  // for navegar em seguida poder esperar o registro terminar antes —
  // navegar embora cancela uma requisição ainda em voo.
  function logHintEvent(key, event) {
    return supa.rpc('mark_hint_event', { p_hint_key: key, p_event: event }).then(({ error }) => {
      if (error) console.error('Falha ao registrar evento de dica:', error.message);
    });
  }

  function hide() {
    card.classList.remove('show');
    currentKey = null;
  }

  function render(hint) {
    currentKey = hint.hint_key;

    const stepsHtml = (hint.steps || []).map((s, i) => `
      <div class="hint-step">
        <span class="hint-step-num">${i + 1}</span>
        ${ICONS[s.icon] || ''}
        <span>${escapeHtml(s.label)}</span>
      </div>`).join('');

    const buttons = (hint.buttons || []).map((b) => {
      const cls = b.action === 'dismiss' ? 'hint-btn secondary' : 'hint-btn';
      return `<button type="button" class="${cls}" data-action="${escapeAttr(b.action)}" data-href="${escapeAttr(b.href || '')}">${escapeHtml(b.label)}</button>`;
    }).join('');

    card.innerHTML = `
      <button type="button" class="hint-close" aria-label="Fechar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <span class="hint-tag">Dica</span>
      <p>${escapeHtml(hint.message)}</p>
      ${stepsHtml ? `<div class="hint-steps">${stepsHtml}</div>` : ''}
      <div class="hint-actions">${buttons}</div>
    `;
    card.classList.add('show');

    card.querySelector('.hint-close').addEventListener('click', () => {
      logHintEvent(currentKey, 'dismissed');
      hide();
    });
    card.querySelectorAll('.hint-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const key = currentKey; // captura antes de hide() zerar currentKey
        const action = btn.dataset.action;
        const href = btn.dataset.href;
        hide();
        // espera o registro terminar antes de navegar/instalar — fazer
        // isso embora cancelaria a requisição em voo antes dela chegar
        // no servidor.
        await logHintEvent(key, 'clicked');
        if (action === 'install' && deferredInstallPrompt) {
          deferredInstallPrompt.prompt();
          deferredInstallPrompt = null;
        } else if (href) {
          window.location.href = href;
        }
      });
    });

    logHintEvent(currentKey, 'shown');
  }

  async function checkHint() {
    if (checking || card.classList.contains('show')) return;
    checking = true;
    try {
      const platform = detectPlatform();
      const { data, error } = await supa.rpc('get_next_hint', { p_platform: platform }).maybeSingle();
      if (!error && data && data.hint_key) render(data);
    } catch {
      // silencioso — uma dica que falha não pode quebrar a tela
    }
    checking = false;
  }

  window.__checkAssistantHint = checkHint;
  checkHint();
})();
