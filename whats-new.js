/* Banner "novidades desta atualização" — autocontido, mesmo padrão de support-widget.js.
   Versão + changelog por superfície (profissional/aluno); localStorage guarda a última
   versão vista por superfície, então o banner só aparece de novo quando a versão muda. */
(function () {
  var IS_ALUNO = /aluno\.html/i.test(location.pathname);
  var SURFACE = IS_ALUNO ? 'aluno' : 'profissional';

  var CHANGELOG = {
    profissional: {
      version: '1.3.0',
      items: [
        'Novos ícones de "?" em Alunos, Treinos, Avaliação, Nutri, Relatórios e Financeiro — explicam na hora os pontos mais técnicos (status do aluno, periodização, técnicas de intensificação, protocolos de avaliação, como a Receita é calculada) sem precisar sair da tela.',
        'Corrigido: o título do treino (ex: "Treino A — peito e tríceps") não fica mais escondido atrás do botão "Trocar exercícios" quando o nome é longo.',
        'Corrigido: o botão de vincular vídeo do YouTube agora aparece em praticamente todos os exercícios gerados por IA ou trocados — antes só aparecia em um ou dois por grupo, porque o sistema exigia um nome idêntico ao da biblioteca pra reconhecer o exercício.'
      ]
    },
    aluno: {
      version: '1.1.0',
      items: [
        'Nova aba "Financeiro" no menu lateral — veja o status da sua mensalidade e o Pix do seu personal, quando disponibilizado.'
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

  function injectStyle() {
    var style = document.createElement('style');
    style.textContent = [
      '#whatsNewBanner{position:fixed;top:0;left:0;right:0;z-index:650;',
      'background:var(--card,#fff);border-bottom:1px solid var(--line,#E9EBEF);',
      'box-shadow:0 6px 20px rgba(20,30,45,.10);',
      'padding:calc(env(safe-area-inset-top) + 14px) 16px 14px;',
      'font-family:var(--font,"Inter",sans-serif);color:var(--text,#1E2A3A);',
      'transform:translateY(-100%);transition:transform .3s cubic-bezier(.2,.8,.2,1);}',
      '#whatsNewBanner.show{transform:translateY(0)}',
      '#whatsNewBanner .wn-inner{max-width:720px;margin:0 auto;display:flex;align-items:flex-start;gap:12px}',
      '#whatsNewBanner .wn-body{flex:1;min-width:0}',
      '#whatsNewBanner .wn-title{font-weight:700;font-size:14px;margin-bottom:6px}',
      '#whatsNewBanner .wn-list{margin:0;padding-left:18px;font-size:13px;color:var(--muted,#63707F);line-height:1.5}',
      '#whatsNewBanner .wn-list li{margin-bottom:3px}',
      '#whatsNewBanner .wn-close{background:none;border:none;font-size:22px;line-height:1;',
      'color:var(--muted,#63707F);cursor:pointer;padding:2px 6px;flex-shrink:0}'
    ].join('');
    document.head.appendChild(style);
  }

  function render() {
    injectStyle();
    var el = document.createElement('div');
    el.id = 'whatsNewBanner';
    el.innerHTML =
      '<div class="wn-inner">' +
        '<div class="wn-body">' +
          '<div class="wn-title">Novidades desta atualização</div>' +
          '<ul class="wn-list">' + entry.items.map(function (t) { return '<li>' + escapeHtml(t) + '</li>'; }).join('') + '</ul>' +
        '</div>' +
        '<button class="wn-close" aria-label="Fechar">&times;</button>' +
      '</div>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    el.querySelector('.wn-close').addEventListener('click', function () {
      el.classList.remove('show');
      try { localStorage.setItem(STORAGE_KEY, entry.version); } catch (e) {}
      setTimeout(function () { el.remove(); }, 320);
    });
  }

  if (document.body) render();
  else document.addEventListener('DOMContentLoaded', render);
})();
