// A version number for our cache. Change this string to force an update.
const CACHE_NAME = 'Bug-And-Moss-Soundboard-v015'; 

// The list of files that make up the "app shell".
const urlsToCache = [
  './soundboard.html',
  // Add icon files to make sure they are available offline too
  './android-chrome-192x192.png',
  './android-chrome-512x512.png'
];

// The 'install' event is fired when the service worker is first registered.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache and caching app shell');
        return cache.addAll(urlsToCache);
      })
  );
});

// The 'activate' event is fired after install. It's a good place to clean up old caches.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // If a cache's name is old (not our current CACHE_NAME), delete it.
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// The 'fetch' event intercepts all network requests.
self.addEventListener('fetch', event => {
  // We only apply our special logic for navigation requests (i.e., for HTML pages).
  if (event.request.mode === 'navigate') {
    // For any page navigation, always respond with the cached app shell.
    event.respondWith(
      caches.match('./soundboard.html').then(response => {
        return response || fetch(event.request);
      })
    );
    return;
  }

  // For all other requests (like images, etc.), use a standard "cache-first" strategy.
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});