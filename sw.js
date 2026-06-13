// O nome do nosso "armazém" de memória (mude a versão quando atualizar o site)
const CACHE_NAME = 'portal-educacional-v2';

// Ficheiros que queremos guardar no telemóvel do aluno
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icone-192.png',
  './icone-512.png'
];

// Instalação: guarda os ficheiros base e ativa logo a nova versão
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// Ativação: apaga caches antigos para que a nova versão apareça
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(nomes => Promise.all(
      nomes.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
    )).then(() => self.clients.claim())
  );
});

// Estratégia: a página (index.html) tenta a internet primeiro (para ter sempre
// a versão mais nova) e usa a cache só se estiver offline. Os outros ficheiros
// usam a cache primeiro para abrir rápido.
self.addEventListener('fetch', event => {
  const req = event.request;
  const isPagina = req.mode === 'navigate' || (req.destination === 'document');

  if (isPagina) {
    event.respondWith(
      fetch(req)
        .then(resp => {
          const copia = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copia));
          return resp;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(resp => resp || fetch(req))
  );
});
