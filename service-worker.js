self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open('stock-monitor-cache').then(function(cache) {
      return cache.addAll([
        'index.html',
        'manifest.json',
        'icon_192.png',
        'icon_512.png'
      ]);
    })
  );
});

self.addEventListener('fetch', function(e) {
  e.respondWith(
    caches.match(e.request).then(function(response) {
      return response || fetch(e.request);
    })
  );
});
