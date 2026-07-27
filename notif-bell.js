// Sino de notificações do profissional (2026-07-27) — substitui o botão
// "Sair" que ficava ao lado do hambúrguer (inconsistente entre páginas,
// sumia em relatorios.html/perfil.html) por um ponto fixo e igual nas 9
// páginas do painel. "Sair" virou item do drawer (ver <button
// id="drawerLogoutBtn"> em cada página).
//
// Autocontido, mesmo padrão de support-widget.js/whats-new.js: cria o
// próprio client Supabase, não depende de nada específico de cada página
// além de um <span id="notifBellSlot"></span> no header (que este script
// substitui pelo botão de verdade) — se a página não tiver o slot, não faz
// nada.
//
// Fonte: tabela professional_notifications (supabase_45), povoada por
// gatilhos server-side (mensagem nova do aluno, aluno respondeu anamnese
// pela 1ª vez) — não é só o badge de mensagem não lida que já existia
// (get_professional_unread_message_count, no item "Mensagens" do drawer),
// é um log mais amplo, com histórico.
(function () {
  const SUPABASE_URL = 'https://yumqmramxbahkfxsthtt.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1bXFtcmFteGJhaGtmeHN0aHR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NzQxNTgsImV4cCI6MjA5ODQ1MDE1OH0.7br_PYBCn1h7lUrCfpJ3VP3HOxMXmoVFyo-GTwVf3Zc';

  const slot = document.getElementById('notifBellSlot');
  if (!slot) return;

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  const supa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const style = document.createElement('style');
  style.textContent = `
    #notifBellBtn { position:relative; background:none; border:none; color:var(--text,#1E2A3A); padding:6px; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    #notifBellBtn svg { width:21px; height:21px; }
    #notifBellDot { position:absolute; top:4px; right:4px; width:9px; height:9px; border-radius:50%; background:#C0392B; border:2px solid var(--card,#fff); display:none; }
    #notifOverlay { position:fixed; inset:0; z-index:600; display:none; }
    #notifOverlay.show { display:block; }
    #notifPanel { position:fixed; top:64px; right:16px; width:calc(100% - 32px); max-width:340px; max-height:70vh; background:var(--card,#fff); border:1px solid var(--line,#E9EBEF); border-radius:var(--radius-lg,18px); box-shadow:0 14px 34px -12px rgba(20,30,45,.28); overflow:hidden; display:flex; flex-direction:column; font-family:var(--font,sans-serif); }
    #notifPanelHeader { padding:14px 16px; border-bottom:1px solid var(--line,#E9EBEF); font-weight:700; font-size:14px; color:var(--text,#1E2A3A); }
    #notifPanelList { overflow-y:auto; padding:6px; }
    .notif-item { padding:10px 12px; border-radius:10px; }
    .notif-item.unread { background:var(--bg,#F8F9FA); }
    .notif-item .ni-title { font-size:13px; font-weight:700; color:var(--text,#1E2A3A); margin-bottom:2px; }
    .notif-item .ni-body { font-size:12.5px; color:var(--muted,#63707F); margin-bottom:4px; line-height:1.4; }
    .notif-item .ni-date { font-size:11px; color:var(--muted,#63707F); }
    #notifPanelEmpty { padding:26px 16px; text-align:center; font-size:13px; color:var(--muted,#63707F); }
  `;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.id = 'notifBellBtn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Notificações');
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg><span id="notifBellDot"></span>`;
  slot.replaceWith(btn);

  const overlay = document.createElement('div');
  overlay.id = 'notifOverlay';
  const panel = document.createElement('div');
  panel.id = 'notifPanel';
  panel.innerHTML = `<div id="notifPanelHeader">Notificações</div><div id="notifPanelList"></div>`;
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closePanel(); });

  let notifications = [];

  function updateDot() {
    const hasUnread = notifications.some((n) => !n.read_at);
    document.getElementById('notifBellDot').style.display = hasUnread ? 'block' : 'none';
  }

  function renderPanel() {
    const list = document.getElementById('notifPanelList');
    if (!notifications.length) {
      list.innerHTML = `<div id="notifPanelEmpty">Nenhuma notificação ainda.</div>`;
      return;
    }
    list.innerHTML = notifications.map((n) => {
      const d = new Date(n.created_at);
      const dataStr = `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      return `
        <div class="notif-item ${n.read_at ? '' : 'unread'}">
          <div class="ni-title">${escapeHtml(n.title)}</div>
          ${n.body ? `<div class="ni-body">${escapeHtml(n.body)}</div>` : ''}
          <div class="ni-date">${dataStr}</div>
        </div>`;
    }).join('');
  }

  async function loadNotifications() {
    const { data, error } = await supa
      .from('professional_notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) { console.error('Falha ao carregar notificações:', error.message); return; }
    notifications = data || [];
    updateDot();
  }

  async function openPanel() {
    overlay.classList.add('show');
    renderPanel();
    const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length) {
      const now = new Date().toISOString();
      await supa.from('professional_notifications').update({ read_at: now }).in('id', unreadIds);
      notifications.forEach((n) => { if (!n.read_at) n.read_at = now; });
      updateDot();
    }
  }
  function closePanel() { overlay.classList.remove('show'); }

  btn.addEventListener('click', () => {
    overlay.classList.contains('show') ? closePanel() : openPanel();
  });

  loadNotifications();
})();
