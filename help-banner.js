/* Ícones de dúvida (?) no painel do profissional — banner de explicação sob demanda,
   sem sujar a UI principal com texto longo hardcoded. Autocontido, mesmo padrão de
   support-widget.js/whats-new.js: um arquivo só, incluído nas páginas que precisam
   (alunos.html, treinos.html, avaliacoes.html, nutri.html, relatorios.html,
   financeiro.html), evita duplicar a lógica do modal em cada uma.

   Uso: window.showHelpBanner('Título', 'corpo em HTML') — chamado direto de um
   onclick no ícone "?" (SVG help-circle, mesmo já usado no item "Tirar dúvidas"
   do menu lateral) ao lado do título/label relevante. O corpo é HTML de propósito
   (listas/negrito) — sempre texto fixo nosso, nunca dado de aluno/profissional,
   então não precisa passar por escapeHtml. */
(function () {
  const style = document.createElement('style');
  style.textContent = `
    .help-q-btn { display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:50%; border:1.5px solid var(--muted,#94A0AF); color:var(--muted,#94A0AF); background:none; cursor:pointer; padding:0; margin-left:6px; vertical-align:middle; flex-shrink:0; }
    .help-q-btn svg { width:13px; height:13px; }
    .help-q-btn:hover { border-color:var(--primary,#2D6BE4); color:var(--primary,#2D6BE4); }
    #helpBannerOverlay { position:fixed; inset:0; background:rgba(15,20,28,.55); z-index:700; display:none; align-items:center; justify-content:center; padding:20px; }
    #helpBannerOverlay.show { display:flex; }
    #helpBannerCard { width:100%; max-width:380px; max-height:80vh; overflow-y:auto; background:var(--card,#fff); border-radius:var(--radius-lg,16px); padding:22px; box-shadow:var(--shadow-card,0 10px 30px rgba(20,30,45,.2)); font-family:var(--font,'Inter',sans-serif); }
    #helpBannerCard h3 { font-size:16px; font-weight:800; margin:0 0 10px; color:var(--text,#1E2A3A); }
    #helpBannerBody { font-size:13.5px; line-height:1.55; color:var(--text,#1E2A3A); }
    #helpBannerBody p { margin:0 0 10px; }
    #helpBannerBody p:last-child { margin-bottom:0; }
    #helpBannerBody ul { margin:0 0 10px; padding-left:18px; }
    #helpBannerBody li { margin-bottom:6px; }
    #helpBannerBody li:last-child { margin-bottom:0; }
    #helpBannerBody strong { color:var(--text,#1E2A3A); }
    #helpBannerCloseBtn { display:block; width:100%; margin-top:16px; background:var(--primary,#2D6BE4); color:#fff; border:none; border-radius:10px; padding:10px; font-size:13.5px; font-weight:700; font-family:var(--font,'Inter',sans-serif); cursor:pointer; }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'helpBannerOverlay';
  overlay.innerHTML = `
    <div id="helpBannerCard">
      <h3 id="helpBannerTitle"></h3>
      <div id="helpBannerBody"></div>
      <button id="helpBannerCloseBtn" type="button">Entendi</button>
    </div>`;
  document.body.appendChild(overlay);

  function close() { overlay.classList.remove('show'); }

  window.showHelpBanner = function (titulo, corpoHtml) {
    overlay.querySelector('#helpBannerTitle').textContent = titulo || '';
    overlay.querySelector('#helpBannerBody').innerHTML = corpoHtml || '';
    overlay.classList.add('show');
  };

  overlay.querySelector('#helpBannerCloseBtn').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
})();
