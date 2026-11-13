/* Service Worker: legt beim ersten Aufruf alle Dateien der Seite im Speicher des Geräts ab, danach läuft sie ohne Internet.
 * Zum Aktualisieren der Daten die Versionsnummer VERSION erhöhen. */
var VERSION = "brandenburg-10";
var DATEIEN = [
  "./", "index.html", "style.css", "profil.js", "eigene.js", "manifest.webmanifest", "icon-180.png", "icon-512.png",
  "lib/leaflet.js", "lib/leaflet.css", "lib/images/layers.png", "lib/images/layers-2x.png",
  "lib/images/marker-icon.png", "lib/images/marker-icon-2x.png", "lib/images/marker-shadow.png",
  "data/messstellen.js", "data/kreise.js", "data/oberhavel/daten.js", "data/ostprignitz-ruppin/daten.js"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(DATEIEN); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET" || e.request.url.indexOf("api.github.com") >= 0) return;
  // Geteilte Bohrungen: zuerst aus dem Netz (aktuell), ohne Internet aus dem Speicher
  if (e.request.url.indexOf("geteilte-bohrungen.json") >= 0) {
    e.respondWith(fetch(e.request).then(function (r) {
      var copy = r.clone(); caches.open(VERSION).then(function (c) { c.put(e.request.url.split("?")[0], copy); });
      return r;
    }).catch(function () { return caches.match("geteilte-bohrungen.json", { ignoreSearch: true }); }));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (hit) { return hit || fetch(e.request); }));
});
