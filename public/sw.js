const CACHE_NAME = 'notificador-v1';
// Lista de arquivos que formam a "casca" do app
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  'https://cdnjs.cloudflare.com/ajax/libs/materialize/1.0.0/css/materialize.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/materialize/1.0.0/js/materialize.min.js',
  'https://fonts.googleapis.com/icon?family=Material+Icons',
  'https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400&family=Roboto:wght@400&display=swap'
];

// Evento 1: Instalação
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache aberto');
        return cache.addAll(urlsToCache); // Baixa e salva os arquivos da "casca"
      })
  );
});

// Evento 2: Fetch (Intercepta requisições)
self.addEventListener('fetch', event => {
  // Nós só queremos cachear requisições GET (páginas, css, js, fontes)
  // As requisições de API (POST, /api/...) devem sempre ir para a rede.
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Estratégia: Cache-First
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Se o arquivo existir no cache, retorna ele
        if (response) {
          return response;
        }
        // Se não, busca na rede, retorna e salva no cache para a próxima vez
        return fetch(event.request).then(
          networkResponse => {
            // Verifica se a resposta é válida
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }
            // Clona a resposta para poder salvar no cache e retornar ao navegador
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            return networkResponse;
          }
        );
      })
  );
});