self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open('dm-bk-cache-advice-v-advice-2025-08-09').then(cache=>cache.addAll([
    './','./index.html','./app.js','./sw.js','./manifest.webmanifest',
    './icon-192.png','./icon-512.png'
  ])));
});
self.addEventListener('fetch', (event)=>{
  event.respondWith(caches.match(event.request).then(resp=> resp || fetch(event.request)));
});