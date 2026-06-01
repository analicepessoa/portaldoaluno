// O nome do nosso "armazém" de memória
const CACHE_NAME = 'portal-educacional-v1';

// Ficheiros que queremos guardar no telemóvel do aluno
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icone-192.png',
  './icone-512.png'
];

// Instalação do motor: Guarda os ficheiros base
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Ficheiros guardados na cache com sucesso!');
        return cache.addAll(urlsToCache);
      })
  );
});

// A magia a acontecer: Quando o aluno abre a app, tentamos dar a versão rápida da cache primeiro
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Se encontrou na cache, devolve imediatamente. Se não, vai buscar à internet.
        return response || fetch(event.request);
      })
  );
});
