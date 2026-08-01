// Service worker do PWA — só cacheia assets estáticos same-origin (rede-primeiro,
// cache como fallback). Nunca intercepta chamadas ao Supabase: auth e dados do
// aluno sempre precisam ser requisição de rede real, nunca resposta velha de cache.
//
// CACHE_NAME também é o gatilho do "força atualização" (ver <script> de
// registro em cada página, listener de controllerchange): o navegador só
// percebe que este arquivo mudou (e reativa um SW novo) se os BYTES dele
// mudarem — por isso, sempre que uma mudança valer a pena forçar o
// recarregamento de abas já abertas, bump este número junto do deploy.
const CACHE_NAME = 'meu-protocolo-v20';
const PRECACHE_URLS = ['/aluno.html', '/manifest.json', '/icons/icon-192-v2.png', '/icons/icon-512-v2.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.hostname.endsWith('supabase.co')) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('push', (event) => {
  // url decide pra onde o clique leva — o mesmo SW atende aluno.html e as 9
  // páginas do painel do profissional (2026-07-28), então não dá mais pra
  // supor que todo push é sempre pro app do aluno.
  let data = { title: 'Meu Protocolo', body: '', url: 'aluno.html' };
  try { data = { ...data, ...event.data.json() }; } catch { /* payload sem JSON, mantém default */ }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Meu Protocolo', {
      body: data.body || '',
      icon: 'icons/icon-192-v2.png',
      badge: 'icons/icon-192-v2.png',
      data: { url: data.url || 'aluno.html' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  const targetUrl = (event.notification.data && event.notification.data.url) || 'aluno.html';
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
