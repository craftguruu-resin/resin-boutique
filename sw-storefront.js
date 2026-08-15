/**
 * Lightweight service worker — cache-first for versioned static assets; network-first for HTML/API.
 */
"use strict";

var CACHE_NAME = "cg-storefront-static-v4";
var STATIC_RE = /\.(js|css|woff2?|png|jpe?g|webp|gif|svg|ico)(\?|$)/i;

self.addEventListener("install", function (ev) {
  self.skipWaiting();
  ev.waitUntil(Promise.resolve());
});

self.addEventListener("activate", function (ev) {
  ev.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (k) {
            return k.indexOf("cg-storefront-static-") === 0 && k !== CACHE_NAME;
          })
          .map(function (k) {
            return caches.delete(k);
          })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (ev) {
  var req = ev.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (/\.html$/.test(url.pathname) || url.pathname.indexOf("/api/") === 0) return;
  if (!STATIC_RE.test(url.pathname + url.search)) return;

  ev.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(req).then(function (cached) {
        if (cached) return cached;
        return fetch(req).then(function (res) {
          if (res && res.ok && res.status === 200) {
            try {
              cache.put(req, res.clone());
            } catch (_) {}
          }
          return res;
        });
      });
    })
  );
});
