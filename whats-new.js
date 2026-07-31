/* Banner "novidades desta atualização" — autocontido, mesmo padrão de support-widget.js.
   Versão + changelog por superfície (profissional/aluno); localStorage guarda a última
   versão vista por superfície, então o banner só aparece de novo quando a versão muda. */
(function () {
  var IS_ALUNO = /aluno\.html/i.test(location.pathname);
  var SURFACE = IS_ALUNO ? 'aluno' : 'profissional';

  var CHANGELOG = {
    profissional: {
      version: '1.11.0',
      items: [
        'Novo: painel de ranking em Perfil > Alunos — veja o placar mensal dos seus alunos (treinos, medalhas, recordes) mesmo com o ranking ainda desligado pra eles.',
        'Novo: campo de gênero (opcional) no cadastro do aluno — usado só pra calibrar o treino gerado por IA, nunca aparece pro aluno.',
        'Painel de edição do aluno simplificado: um único botão "Salvar edição" pra nota, WhatsApp, gênero e mensalidade — antes eram 2 botões separados, fácil de confundir. "Marcar pago hoje" ganhou espaço próprio, separado da edição.',
        'Botão "Editar" de cada aluno ganhou destaque — agora é um botão azul fixo no canto superior direito do card, e fecha sozinho assim que você salva a edição.',
        'Corrigido: a foto de perfil do aluno recarregava do zero toda vez que você trocava de página — agora fica em cache e abre na hora.',
        'Corrigido: treino gerado por IA podia incluir exercício fora de contexto (ex: exercício de glúteo aparecendo num treino de peito/tríceps sem motivo).',
        'Corrigido: logo recortada em formato Quadrado aparecia redonda no app do aluno.',
        'Novo: diário alimentar do aluno (aba Nutri) — ele registra o que comeu e você acompanha, sem precisar configurar nada. A meta de calorias/macros fica travada até você preencher os dados de uma consulta real com nutricionista parceira (é exigência legal, não falha do app).',
        'Gifs de exercício ficaram mais rápidos e confiáveis — migramos a hospedagem pra um servidor dedicado.'
      ]
    },
    aluno: {
      version: '1.6.0',
      items: [
        'Novo: durante o treino, botão "Lista" mostra todos os exercícios com check nos concluídos — toque em qualquer um pra pular direto pra ele. Útil quando a máquina do próximo exercício está ocupada: faz outro primeiro e volta depois sem perder o controle.',
        'Corrigido: sua foto de perfil recarregava do zero toda vez que você reabria o app — agora fica em cache e aparece na hora.',
        'Novo: diário alimentar em Nutri — registre o que você comeu (busque ou cadastre o alimento) e veja o total de calorias e macros do dia, direto no app.',
        'A meta de calorias/macros aparece quando seu personal liberar, depois de uma consulta com a nutricionista parceira dele.',
        'Gifs de exercício ficaram mais rápidos e confiáveis.'
      ]
    }
  };

  var entry = CHANGELOG[SURFACE];
  if (!entry || !entry.items || !entry.items.length) return;

  var STORAGE_KEY = 'mp_whats_new_seen_' + SURFACE;
  var seenVersion = null;
  try { seenVersion = localStorage.getItem(STORAGE_KEY); } catch (e) {}
  if (seenVersion === entry.version) return;

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Virou modal flutuante em tela cheia (2026-07-28) — antes era uma faixa fixa
  // no topo, com pouco espaço pra texto e sem rolagem. Mesmo padrão visual do
  // help-banner.js (overlay escuro + card centralizado com scroll interno),
  // agora com espaço de sobra pra changelog longo e um botão de fechar bem
  // visível, não só um × pequeno no canto.
  function injectStyle() {
    var style = document.createElement('style');
    style.textContent = [
      '#whatsNewOverlay{position:fixed;inset:0;z-index:650;background:rgba(15,20,28,.6);',
      'display:none;align-items:center;justify-content:center;padding:24px;',
      'opacity:0;transition:opacity .2s ease;}',
      '#whatsNewOverlay.show{display:flex;opacity:1}',
      '#whatsNewCard{width:100%;max-width:420px;max-height:80vh;display:flex;flex-direction:column;',
      'background:var(--card,#fff);border-radius:var(--radius-lg,18px);',
      'box-shadow:0 20px 50px -12px rgba(20,30,45,.35);',
      'font-family:var(--font,"Inter",sans-serif);color:var(--text,#1E2A3A);}',
      '#whatsNewCard .wn-header{padding:22px 22px 4px;flex-shrink:0}',
      '#whatsNewCard .wn-title{font-weight:800;font-size:17px}',
      '#whatsNewCard .wn-list-wrap{overflow-y:auto;padding:10px 22px;flex:1}',
      '#whatsNewCard .wn-list{margin:0;padding-left:18px;font-size:13.5px;color:var(--muted,#63707F);line-height:1.6}',
      '#whatsNewCard .wn-list li{margin-bottom:8px}',
      '#whatsNewCard .wn-list li:last-child{margin-bottom:0}',
      '#whatsNewCard .wn-footer{padding:14px 22px 22px;flex-shrink:0}',
      '#whatsNewCard .wn-close{display:block;width:100%;background:var(--primary,#2D6BE4);color:#fff;',
      'border:none;border-radius:var(--radius,10px);padding:12px;font-size:14px;font-weight:700;',
      'font-family:inherit;cursor:pointer}'
    ].join('');
    document.head.appendChild(style);
  }

  function render() {
    injectStyle();
    var overlay = document.createElement('div');
    overlay.id = 'whatsNewOverlay';
    overlay.innerHTML =
      '<div id="whatsNewCard">' +
        '<div class="wn-header"><div class="wn-title">Novidades desta atualização</div></div>' +
        '<div class="wn-list-wrap"><ul class="wn-list">' +
          entry.items.map(function (t) { return '<li>' + escapeHtml(t) + '</li>'; }).join('') +
        '</ul></div>' +
        '<div class="wn-footer"><button class="wn-close" type="button">Entendi</button></div>' +
      '</div>';
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('show'); });

    function close() {
      overlay.classList.remove('show');
      try { localStorage.setItem(STORAGE_KEY, entry.version); } catch (e) {}
      setTimeout(function () { overlay.remove(); }, 220);
    }
    overlay.querySelector('.wn-close').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  }

  // Espera um instante antes de pintar — dá tempo do boot() da própria
  // página confirmar que a sessão é mesmo desta superfície antes do banner
  // aparecer. Sem isso, uma sessão de ALUNO abrindo `index.html` por engano
  // (ex: PWA instalado com start_url errado — atalho antigo apontando pra
  // index.html em vez de aluno.html) mostra o changelog do PROFISSIONAL por
  // um instante, antes do redirect pra aluno.html acontecer (2026-07-31,
  // relatado pelo usuário: "vi o banner do profissional por um momento
  // dentro do PWA do aluno"). A página que sabe que vai redirecionar
  // deve setar `window.__mpSuppressWhatsNew = true` antes de navegar —
  // ver index.html/aluno.html boot().
  function maybeRender() {
    if (window.__mpSuppressWhatsNew) return;
    render();
  }
  function schedule() {
    setTimeout(maybeRender, 350);
  }
  if (document.body) schedule();
  else document.addEventListener('DOMContentLoaded', schedule);
})();
