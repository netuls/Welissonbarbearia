const CACHE_NAME = 'wellisson-barbearia-v1';

// Arquivos essenciais para funcionar offline
const STATIC_ASSETS = [
  './index.html',
  './style.css',
  './app.js',
  './manifest-client.json',
  './logo_emblema.png',
  './logo.png',
  'https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,600;0,700;0,900;1,700&family=Roboto:wght@300;400;500&display=swap',
];

// Instala e faz cache dos arquivos estáticos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { mode: 'no-cors' })));
    }).then(() => self.skipWaiting())
  );
});

// Remove caches antigos ao ativar nova versão
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Estratégia: Network First para o Firebase (sempre tenta online),
// Cache First para assets estáticos (CSS, fontes, HTML)
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Firebase e APIs externas: sempre tenta a rede, sem cache
  if (
    url.includes('firestore.googleapis.com') ||
    url.includes('firebase') ||
    url.includes('googleapis.com/firestore') ||
    url.includes('wa.me')
  ) {
    event.respondWith(fetch(event.request).catch(() => new Response('Offline', { status: 503 })));
    return;
  }

  // Assets estáticos: Cache First (carrega mais rápido)
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Salva no cache só respostas válidas
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
