// public/sw.js
// Service worker do Botão da Resenha.
// Por enquanto só existe para o app ser instalável. Não guarda cache de páginas.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));