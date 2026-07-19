// Onboarding do aluno via dica contextual (Fase C, item 11 — redefinido
// 2026-07-19). Mesmo padrão autocontido de assistant-hints.js/support-widget.js:
// client Supabase próprio, reaproveita os tokens de design já definidos
// no :root de aluno.html.
//
// Primeiro conteúdo: guia de instalação do PWA. Detecção de plataforma é
// puramente client-side (servidor não tem como saber o navegador) — só o
// resultado ('ios' | 'chromium' | 'none') é mandado pro get_next_student_hint.
//
// Hook de navegação: sem função central de "depois de trocar de tela" no
// app do aluno (showScreen só troca a classe .active) — este arquivo
// envolve window.showScreen pra checar dica a cada troca, EXCETO nas telas
// do fluxo de treino (overview/exec/finish), onde interromper com uma
// dica seria péssima UX (tem timer de descanso rodando, etc.).

(function () {
  const SUPABASE_URL = 'https://yumqmramxbahkfxsthtt.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1bXFtcmFteGJhaGtmeHN0aHR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NzQxNTgsImV4cCI6MjA5ODQ1MDE1OH0.7br_PYBCn1h7lUrCfpJ3VP3HOxMXmoVFyo-GTwVf3Zc';
  const supa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const BLOCKED_SCREENS = ['overview', 'exec', 'finish'];

  const ICONS = {
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
  };

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  const style = document.createElement('style');
  style.textContent = `
    #studentHintCard { position:fixed; left:12px; right:12px; max-width:496px; margin:0 auto; bottom:calc(var(--nav-h,64px) + env(safe-area-inset-bottom) + 10px); background:var(--card-grad,#fff); border:1px solid rgba(20,30,45,.06); box-shadow:var(--shadow-card,0 4px 16px rgba(0,0,0,.15)); border-radius:var(--radius-lg,16px); padding:14px 16px; z-index:70; display:none; font-family:var(--font,sans-serif); }
    #studentHintCard.show { display:block; animation:studentHintIn .2s ease; }
    @keyframes studentHintIn { from{opacity:0; transform:translateY(8px);} to{opacity:1; transform:translateY(0);} }
    #studentHintCard .sh-close { position:absolute; top:8px; right:8px; background:none; border:none; cursor:pointer; color:var(--muted,#94A0AF); padding:5px; display:flex; }
    #studentHintCard .sh-close svg { width:14px; height:14px; display:block; }
    #studentHintCard p.sh-msg { margin:0 20px 10px 0; font-size:13px; line-height:1.45; color:var(--text,#1E2A3A); }
    #studentHintCard .sh-steps { display:flex; flex-direction:column; gap:8px; margin-bottom:12px; }
    #studentHintCard .sh-step { display:flex; align-items:center; gap:10px; font-size:12.5px; color:var(--text,#1E2A3A); }
    #studentHintCard .sh-step .sh-num { flex-shrink:0; width:22px; height:22px; border-radius:50%; background:var(--primary,#2D6BE4); color:#fff; font-weight:800; font-size:11px; display:flex; align-items:center; justify-content:center; }
    #studentHintCard .sh-step svg { width:17px; height:17px; flex-shrink:0; color:var(--primary,#2D6BE4); }
    #studentHintCard .sh-actions { display:flex; gap:8px; flex-wrap:wrap; }
    #studentHintCard .sh-btn { background:var(--primary,#2D6BE4); color:#fff; border:none; border-radius:9px; padding:7px 12px; font-size:12.5px; font-weight:700; cursor:pointer; font-family:var(--font,sans-serif); }
    #studentHintCard .sh-btn.secondary { background:var(--bg,#F8F9FA); color:var(--text,#1E2A3A); border:1px solid var(--line,#E9EBEF); }
  `;
  document.head.appendChild(style);

  const card = document.createElement('div');
  card.id = 'studentHintCard';
  document.body.appendChild(card);

  let currentKey = null;
  let checking = false;
  let deferredInstallPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    checkHint(); // pode já estar na Home esperando — reavalia assim que o navegador confirmar suporte
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

  function logHintEvent(key, event) {
    return supa.rpc('mark_student_hint_event', { p_hint_key: key, p_event: event }).then(({ error }) => {
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
      <div class="sh-step">
        <span class="sh-num">${i + 1}</span>
        ${ICONS[s.icon] || ''}
        <span>${escapeHtml(s.label)}</span>
      </div>`).join('');

    const buttonsHtml = (hint.buttons || []).map((b) => {
      const cls = b.action === 'dismiss' ? 'sh-btn secondary' : 'sh-btn';
      return `<button type="button" class="${cls}" data-action="${escapeHtml(b.action)}">${escapeHtml(b.label)}</button>`;
    }).join('');

    card.innerHTML = `
      <button type="button" class="sh-close" aria-label="Fechar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <p class="sh-msg">${escapeHtml(hint.message)}</p>
      ${stepsHtml ? `<div class="sh-steps">${stepsHtml}</div>` : ''}
      <div class="sh-actions">${buttonsHtml}</div>
    `;
    card.classList.add('show');

    card.querySelector('.sh-close').addEventListener('click', () => {
      const key = currentKey;
      hide();
      logHintEvent(key, 'dismissed');
    });

    card.querySelectorAll('.sh-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const key = currentKey;
        const action = btn.dataset.action;
        hide();
        await logHintEvent(key, 'clicked');
        if (action === 'install' && deferredInstallPrompt) {
          deferredInstallPrompt.prompt();
          deferredInstallPrompt = null;
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
      if (platform !== 'none') {
        const { data, error } = await supa.rpc('get_next_student_hint', { p_platform: platform }).maybeSingle();
        if (!error && data && data.hint_key) render(data);
      }
    } catch {
      // silencioso — uma dica que falha não pode quebrar o app do aluno
    }
    checking = false;
  }

  // Envolve showScreen (definida no <script> principal de aluno.html) pra
  // checar dica a cada troca de tela, sem tocar no arquivo original — nunca
  // durante overview/exec/finish (fluxo de treino em andamento).
  function wrapShowScreen() {
    if (typeof window.showScreen !== 'function' || window.showScreen.__hintWrapped) return false;
    const original = window.showScreen;
    const wrapped = function (id) {
      original(id);
      if (BLOCKED_SCREENS.includes(id)) {
        hide();
      } else {
        checkHint();
      }
    };
    wrapped.__hintWrapped = true;
    window.showScreen = wrapped;
    return true;
  }

  // showScreen só existe depois que o <script> principal (inline, sem defer)
  // rodar — como este arquivo carrega via defer, isso já deveria ter
  // acontecido, mas o boot() do app é assíncrono (aguarda sessão/consentimento
  // LGPD) então a primeira troca de tela real pode demorar. Tentana hora;
  // se não achar ainda, tenta de novo em 1s (só uma vez, é só uma rede de segurança).
  if (!wrapShowScreen()) setTimeout(wrapShowScreen, 1000);
})();
