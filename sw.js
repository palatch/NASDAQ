self.addEventListener('install',(e)=>{
  e.waitUntil(caches.open('dm-fullsite-split-fullsite-split-v6-2025-08-10').then(cache=>cache.addAll([
    './','./index.html','./style.css','./app.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'
  ])));
});
self.addEventListener('fetch',(event)=>{
  event.respondWith(caches.match(event.request).then(resp=>resp||fetch(event.request)));
});