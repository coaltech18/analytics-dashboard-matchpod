/*
 * Service worker for the MatchPod metrics dashboard.
 *
 * THE RULE THAT MATTERS: this caches the app shell, never the numbers.
 *
 * A metrics dashboard that serves a cached figure is worse than one that fails
 * to load — a stale number looks exactly like a fresh one, and you would make
 * decisions on it. So every request to Supabase (auth, and the metrics edge
 * function) is passed straight through to the network and never stored. If you
 * are offline, the page opens and tells you it cannot reach the function. That
 * is the correct behaviour.
 *
 * What IS cached is the shell: the HTML, the hashed JS/CSS bundle, the icons.
 * That makes it installable and makes a warm launch instant.
 *
 * No build step generates this file, so there is no hardcoded list of hashed
 * filenames to keep in sync. Assets are cached as they are first fetched.
 */

const VERSION = 'mp-metrics-v1';
const SHELL = `${VERSION}-shell`;

// Bump VERSION to invalidate everything on the next deploy.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll(['./', './index.html', './manifest.webmanifest']))
      // A failed precache must not block installation — the fetch handler
      // fills the cache anyway on first use.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Anything not on this origin — above all supabase.co — goes to the network
  // untouched. Never cache auth or metrics responses.
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, so a fresh deploy is picked up immediately.
  // Falls back to the cached shell only when the network is genuinely gone.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r ?? Response.error())),
    );
    return;
  }

  // Static assets are content-hashed by Vite, so a hit is always correct and
  // cache-first is the fast path. A miss is fetched and stored.
  event.respondWith(
    caches.match(req).then((hit) => hit ?? fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put(req, copy));
      }
      return res;
    })),
  );
});
