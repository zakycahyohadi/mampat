// Service worker Mampat: simpan semua alat supaya tetap jalan tanpa internet.
const CACHE = "mampat-v8";
const PAGES = ["./", "./kompres/", "./gabung/", "./pisah/", "./atur-halaman/", "./gambar-ke-pdf/", "./pdf-ke-gambar/", "./word-ke-pdf/", "./pdf-ke-word/"];
const CORE = [...PAGES,
  "./assets/css/main.css", "./assets/js/core.js", "./assets/js/pdf-tools.js", "./assets/js/zip-writer.js",
  "./assets/js/docx-to-pdf.js", "./assets/js/ttf-subset.js", "./assets/js/pdf-to-docx.js",
  "./manifest.webmanifest", "./assets/icons/icon-192.png", "./assets/icons/icon-512.png", "./assets/icons/favicon-32.png", "./assets/icons/apple-touch-icon.png",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
  "https://cdn.jsdelivr.net/npm/docx-preview@0.4.1/dist/docx-preview.min.js"];
// font pengganti untuk Word ke PDF disimpan saat pertama kali dipakai (lewat cabang "simpanan" di bawah)
const SKIP = /googletagmanager|google-analytics|analytics\.google|goatcounter|gc\.zgo\.at/;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// alamat halaman tanpa ?query dan tanpa index.html, supaya /gabung/, /gabung/index.html, /gabung/?x sama
function pageKey(url) {
  const u = new URL(url);
  return u.origin + u.pathname.replace(/index\.html$/, "");
}
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || SKIP.test(req.url)) return;
  if (req.mode === "navigate") {
    // halaman: ambil versi terbaru kalau online, pakai simpanan halaman yang sama kalau offline
    const key = pageKey(req.url);
    e.respondWith(fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); } return r; })
      .catch(() => caches.match(key).then((hit) => hit || caches.match(new URL("./", self.registration.scope).href))));
    return;
  }
  // file situs sendiri (assets/, ikon, manifest): ambil terbaru kalau online supaya selalu cocok dengan halamannya
  if (new URL(req.url).origin === self.location.origin) {
    e.respondWith(fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return r; })
      .catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }
  // library & font dari CDN (alamatnya berversi, isinya tidak berubah): pakai simpanan, perbarui di belakang layar
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((r) => { if (r && (r.ok || r.type === "opaque")) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
