self.addEventListener('install',(e)=>{
  e.waitUntil(caches.open('dm-fullsite-cache-fullsite-v4-2025-08-10').then(cache=>cache.addAll([
    './','./index.html','./app.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'
  ])));
});
self.addEventListener('fetch',(event)=>{
  event.respondWith(caches.match(event.request).then(resp=>resp||fetch(event.request)));
});