/* Banner "novidades desta atualização" — autocontido, mesmo padrão de support-widget.js.
   Versão + changelog por superfície (profissional/aluno); localStorage guarda a última
   versão vista por superfície, então o banner só aparece de novo quando a versão muda. */
(function () {
  var IS_ALUNO = /aluno\.html/i.test(location.pathname);
  var SURFACE = IS_ALUNO ? 'aluno' : 'profissional';

  var CHANGELOG = {
    profissional: {
      version: '1.8.0',
      items: [
        'Novo: notificações push no sino ficam disponíveis também pra você, não só pro aluno — ative em Notificações, dentro do sino.',
        'Novo: crie exercícios que não estão na biblioteca, direto na busca ao montar um treino — fica só na sua conta, nunca compartilhado com outros profissionais.',
        'Novo: vincule uma imagem própria (além do vídeo do YouTube) a qualquer exercício, com recorte quadrado ou paisagem.',
        'Novo: "Comparativos" em Avaliação física — escolha 2 avaliações e o app monta sozinho as fotos lado a lado e a tabela de variação de medidas; publique quando quiser que o aluno veja.',
        'Novo: botão pra remover uma foto de avaliação física sem precisar substituir por outra.',
        'Corrigido: upload de fotos de avaliação física, que às vezes não subia sem mostrar nenhum erro.',
        'Fotos de avaliação física agora aparecem como miniatura de verdade (antes só mostrava "enviada").',
        'Novo: sino de notificações fixo no topo de toda tela, com histórico de mensagem nova de aluno e aluno que respondeu a anamnese.',
        '"Sair" saiu do topo (onde sumia em algumas telas) e agora fica dentro do menu ☰ lateral, igual nas 9 telas do painel.',
        'Novo: ao cadastrar um aluno, aparece um banner com o WhatsApp preenchido e um botão "Enviar convite" — dá pra mandar na hora ou fechar e enviar depois.'
      ]
    },
    aluno: {
      version: '1.3.0',
      items: [
        'Novo: quando seu personal publica um comparativo de avaliação física, ele aparece na tela de Avaliação física — fotos antes/depois e a variação de cada medida.',
        'Novo: as fotos da sua avaliação física agora aparecem na tela de Avaliação física.',
        'Nova aba "Financeiro" no menu lateral — veja o status da sua mensalidade e o Pix do seu personal, quando disponibilizado.',
        'Novo: um card na Início lembra de responder a anamnese de saúde antes de começar a usar o app, se ainda não tiver respondido.'
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

  if (document.body) render();
  else document.addEventListener('DOMContentLoaded', render);
})();
