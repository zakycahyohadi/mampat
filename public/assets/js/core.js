/* ============================================================
   ANALYTICS — isi salah satu (atau keduanya), lalu upload ulang.
   GA4_ID      : Measurement ID dari Google Analytics, contoh "G-AB12CD34EF"
   GOATCOUNTER : kode situs GoatCounter, contoh "mampat" (untuk mampat.goatcounter.com)
   Kosongkan ("") untuk mematikan.
   ============================================================ */
window.MAMPAT_CONFIG = {
  GA4_ID: "",
  GOATCOUNTER: "zaky",
  PWA: true
};

/* Mampat · bagian bersama semua halaman: analytics, header & menu alat, footer,
   simpan file, format ukuran, pemuat library, offline & pasang aplikasi. */
(function () {
  "use strict";
  const c = window.MAMPAT_CONFIG || {};
  const ROOT = new URL("../../", document.currentScript.src).href; // core.js ada di assets/js/
  const KB = 1024, MB = 1048576;

  // ---------- analytics ----------
  if (c.GA4_ID) {
    const s = document.createElement("script");
    s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(c.GA4_ID);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { dataLayer.push(arguments); };
    gtag("js", new Date());
    gtag("config", c.GA4_ID);
  }
  if (c.GOATCOUNTER) {
    const g = document.createElement("script");
    g.async = true; g.src = "https://gc.zgo.at/count.js";
    g.setAttribute("data-goatcounter", "https://" + c.GOATCOUNTER + ".goatcounter.com/count");
    document.head.appendChild(g);
  }
  // event: mampat/<alat>/<aksi>. Isinya hanya angka/kategori, tidak pernah nama atau isi file.
  function track(tool, action, params) {
    try {
      if (c.GA4_ID && window.gtag) window.gtag("event", tool + "_" + action, params || {});
      if (c.GOATCOUNTER && window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: "mampat/" + tool + "/" + action, title: tool + " · " + action, event: true });
    } catch (e) {}
  }
  function bucket(b) { return b < 200 * KB ? "<200KB" : b < MB ? "200KB-1MB" : b < 5 * MB ? "1-5MB" : b < 20 * MB ? "5-20MB" : b < 100 * MB ? "20-100MB" : ">100MB"; }

  // ---------- daftar alat (satu sumber untuk menu, footer, dan beranda) ----------
  const I = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  const TOOLS = [
    { slug: "kompres", name: "Kompres PDF", desc: "Kecilkan ke ukuran yang kamu tentukan", icon: I('<path d="M4 4h16M4 20h16M12 7v10m0 0-3-3m3 3 3-3"/>') },
    { slug: "word-ke-pdf", isNew: true, name: "Word ke PDF", desc: "Dokumen .docx jadi PDF rapi", icon: I('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M8.5 11.5l1.2 5 1.8-4 1.8 4 1.2-5"/>') },
    { slug: "pdf-ke-word", isNew: true, name: "PDF ke Word", desc: "PDF jadi .docx yang bisa diedit", icon: I('<path d="M4 7V5a2 2 0 0 1 2-2h7l5 5v3"/><path d="M13 3v5h5"/><path d="M4 13h16v8H4zM7 15.5l.8 3 1.2-2.4 1.2 2.4.8-3"/>') },
    { slug: "gabung", name: "Gabung PDF", desc: "Satukan beberapa PDF jadi satu", icon: I('<path d="M8 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h2M16 3h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2M12 8v8M8 12h8"/>') },
    { slug: "pisah", name: "Pisah PDF", desc: "Ambil halaman tertentu atau pisah per halaman", icon: I('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12"/>') },
    { slug: "atur-halaman", name: "Atur Halaman", desc: "Putar, hapus, dan urutkan ulang halaman", icon: I('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 17.5h7m-3-3 3 3-3 3"/>') },
    { slug: "gambar-ke-pdf", name: "Gambar ke PDF", desc: "JPG atau PNG jadi satu PDF", icon: I('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>') },
    { slug: "pdf-ke-gambar", name: "PDF ke Gambar", desc: "Setiap halaman jadi JPG atau PNG", icon: I('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="m8 18 3-3 2 2 3-3"/>') },
  ];
  const toolUrl = (slug) => ROOT + slug + "/";
  const LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="3" width="26" height="4.5" rx="1.5" fill="currentColor"/><rect x="3" y="24.5" width="26" height="4.5" rx="1.5" fill="currentColor"/><rect x="8" y="10.5" width="16" height="11" rx="1.5" fill="#ffd02b" stroke="currentColor" stroke-width="1.6"/><path d="M11 14.5h10M11 17.5h7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

  // <mampat-top data-tool="gabung"> → header dengan logo, menu alat, tombol pasang aplikasi
  class MampatTop extends HTMLElement {
    connectedCallback() {
      if (this.firstChild) return;
      const cur = this.dataset.tool || "";
      const items = TOOLS.map((t) => '<a href="' + toolUrl(t.slug) + '"' + (t.slug === cur ? ' aria-current="page"' : "") + ' data-tool="' + t.slug + '"><span class="ti">' + t.icon + "</span><b>" + t.name + "</b><small>" + t.desc + "</small></a>").join("");
      this.innerHTML =
        '<div class="top"><a class="logo" href="' + ROOT + '" aria-label="Mampat, ke beranda">' + LOGO + "<b>mampat</b></a>" +
        '<nav><div class="menu-wrap"><button class="tools-btn" type="button" aria-expanded="false" aria-haspopup="true" aria-controls="tmenu">' +
        I('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>') +
        "<span>Semua alat</span></button>" +
        '<div class="tmenu" id="tmenu" hidden>' + items + '<a class="home" href="' + ROOT + '"><span class="ti">' + LOGO + "</span><b>Beranda</b><small>Lihat semua alat Mampat</small></a></div></div>" +
        '<button id="installBtn" class="install" type="button">' + I('<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>') + "Pasang aplikasi</button>" +
        '<span class="badge"><i></i>Diproses di perangkatmu</span></nav></div>';
      const btn = this.querySelector(".tools-btn"), menu = this.querySelector(".tmenu");
      const close = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); };
      btn.addEventListener("click", (e) => { e.stopPropagation(); const open = menu.hidden; menu.hidden = !open; btn.setAttribute("aria-expanded", String(open)); if (open) (menu.querySelector("[aria-current]") || menu.querySelector("a")).focus(); });
      document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target)) close(); });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { close(); btn.focus(); } });
      setupInstall(this.querySelector("#installBtn"));
    }
  }
  // <mampat-foot data-tool="gabung"> → strip "alat lain" + footer
  class MampatFoot extends HTMLElement {
    connectedCallback() {
      if (this.firstChild) return;
      const cur = this.dataset.tool || "";
      const others = TOOLS.filter((t) => t.slug !== cur).map((t) => '<a href="' + toolUrl(t.slug) + '"><span class="ti">' + t.icon + "</span>" + t.name + "</a>").join("");
      this.innerHTML = (this.hasAttribute("data-no-others") ? "" : '<section class="others" aria-label="Alat lain"><h2>' + (cur ? "Alat lain" : "Semua alat") + "</h2><nav>" + others + "</nav></section>") +
        '<footer><span><b>Mampat</b> · alat PDF yang jalan di perangkatmu</span><span class="def">mam·pat <i>a</i> padat; rapat</span></footer>';
    }
  }

  // ---------- format & pesan ----------
  const nf = (d) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: d, minimumFractionDigits: 0 });
  function fmt(b) {
    if (b == null) return "—";
    if (b < KB) return Math.round(b) + " B";
    if (b < MB) return nf(b < 10 * KB ? 1 : 0).format(b / KB) + " KB";
    const m = b / MB;
    return nf(m < 10 ? 2 : m < 100 ? 1 : 0).format(m) + " MB";
  }
  function toast(msg, bad) {
    let box = document.getElementById("toasts");
    if (!box) { box = document.createElement("div"); box.id = "toasts"; box.className = "toasts"; box.setAttribute("aria-live", "assertive"); document.body.appendChild(box); }
    const t = document.createElement("div"); t.className = "toast" + (bad ? " bad" : ""); t.textContent = msg; box.appendChild(t); setTimeout(() => t.remove(), 4800);
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));
  // nama dasar file tanpa ekstensi, aman untuk Windows/Mac/iPhone
  function baseName(name, fallback) {
    const b = String(name || "").replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
    return (b || fallback || "dokumen").slice(0, 120);
  }
  // pesan yang jelas untuk PDF rusak / terkunci (dari pdf.js atau pdf-lib)
  function pdfError(err) {
    const name = err && err.name, msg = String((err && err.message) || "");
    if (name === "PasswordException") return "PDF ini dikunci kata sandi. Buka kuncinya dulu, lalu coba lagi.";
    if (/encrypt/i.test(msg)) return "PDF ini dikunci izin oleh pembuatnya, jadi tidak boleh diubah. Buka kuncinya dulu dengan aplikasi yang membuatnya.";
    if (/gagal memuat/i.test(msg)) return "Mesin PDF gagal dimuat. Periksa koneksi internet, lalu coba lagi.";
    return "PDF ini tidak bisa dibaca. Mungkin filenya rusak.";
  }

  // ---------- simpan file ----------
  // Android & laptop: unduhan biasa → langsung masuk folder Download.
  // iPhone/iPad yang memasang Mampat di layar utama: unduhan biasa sering hanya membuka pratinjau,
  // jadi dipakai lembar Bagikan iOS → "Simpan ke File".
  const ua = navigator.userAgent;
  const isIOS = /iP(hone|ad|od)/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isStandalone = () => navigator.standalone === true || !!(window.matchMedia && matchMedia("(display-mode: standalone)").matches);
  // petunjuk lokasi file sesuai perangkat (ditampilkan di bawah tombol Simpan)
  function saveHint() {
    if (isAndroid) return "File masuk ke folder Download. Buka lewat aplikasi Files (atau Galeri/Dokumen) › Download.";
    if (isIOS) return isStandalone() ? "Pilih \u201cSimpan ke File\u201d, lalu folder Unduhan. Filenya ada di aplikasi File." : "Ketuk Unduh kalau diminta. Filenya ada di aplikasi File › Unduhan.";
    return "File masuk ke folder Download di komputer ini.";
  }
  async function saveFile(blob, name) {
    let dl = null;
    try { dl = window.claude && window.claude.use ? await window.claude.use("downloads") : null; } catch (e) { dl = null; }
    if (dl) {
      try { await dl.save({ filename: name, data: blob }); toast("Tersimpan: " + name); return true; }
      catch (e) {
        if (e && e.code === "declined") toast("Tidak jadi disimpan.");
        else if (e && e.code === "rate_limited") toast("Jendela simpan sebelumnya masih terbuka.");
        else toast("Browser ini menolak menyimpan file.", true);
        return false;
      }
    }
    if (isIOS && isStandalone() && navigator.canShare) {
      const file = new File([blob], name, { type: blob.type || "application/octet-stream" });
      if (navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file] }); toast("Kalau tadi memilih \u201cSimpan ke File\u201d, filenya ada di aplikasi File."); return true; }
        catch (e) { if (e && e.name === "AbortError") { toast("Tidak jadi disimpan."); return false; } } // gagal lain: lanjut unduhan biasa
      }
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    toast(isAndroid ? "Tersimpan di folder Download: " + name : isIOS ? "Ketuk Unduh kalau diminta. Filenya masuk ke aplikasi File \u203a Unduhan." : "Mengunduh " + name + " ke folder Download.");
    return true;
  }

  // ---------- library dari cdnjs, dimuat saat dibutuhkan ----------
  const LIB = {
    pdfjs: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
    worker: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
    pdflib: "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js",
    // khusus Word ke PDF: pembaca ZIP dan penyusun dokumen .docx
    jszip: "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
    docx: "https://cdn.jsdelivr.net/npm/docx-preview@0.4.1/dist/docx-preview.min.js",
  };
  const LIB_GLOBAL = { pdfjs: "pdfjsLib", pdflib: "PDFLib", jszip: "JSZip", docx: "docx" };
  function loadScript(src) {
    return new Promise((res, rej) => {
      const el = document.createElement("script");
      el.src = src; el.async = true; el.crossOrigin = "anonymous";
      el.onload = res; el.onerror = () => rej(new Error("Gagal memuat " + src));
      document.head.appendChild(el);
    });
  }
  function whenIdle(fn) {
    const go = () => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 300));
    if (document.readyState === "complete") go(); else window.addEventListener("load", go, { once: true });
  }
  function preload(href) {
    const l = document.createElement("link"); l.rel = "preload"; l.as = "script"; l.href = href; l.crossOrigin = "anonymous"; document.head.appendChild(l);
  }
  const libPromises = {};
  // muat library yang diminta ("pdflib", "pdfjs"); aman dipanggil berkali-kali
  // "docx" butuh JSZip lebih dulu, jadi dimuat berurutan
  function loadLibs(names) {
    const one = (n) => {
      if (window[LIB_GLOBAL[n]]) return Promise.resolve();
      if (!libPromises[n]) libPromises[n] = (n === "docx" ? one("jszip") : Promise.resolve()).then(() => loadScript(LIB[n])).catch((e) => { delete libPromises[n]; throw e; });
      return libPromises[n];
    };
    return Promise.all(names.map(one)).then(() => { if (names.includes("pdfjs")) window.pdfjsLib.GlobalWorkerOptions.workerSrc = LIB.worker; });
  }
  // unduh library di awal tanpa diproses, lalu proses saat pengguna mulai berinteraksi
  function warmLibs(names, el) {
    whenIdle(() => names.forEach((n) => preload(LIB[n])));
    const warm = () => loadLibs(names).then(() => {
      if (names.includes("pdfjs")) whenIdle(() => { const l = document.createElement("link"); l.rel = "prefetch"; l.href = LIB.worker; l.crossOrigin = "anonymous"; document.head.appendChild(l); });
    }).catch(() => {});
    ["pointerdown", "keydown", "dragenter", "touchstart"].forEach((ev) => window.addEventListener(ev, warm, { once: true, passive: true }));
    if (el) ["pointerenter", "focus"].forEach((ev) => el.addEventListener(ev, warm, { once: true, passive: true }));
  }

  // ---------- PDF terkunci: buka kuncinya di perangkat ini ----------
  // pdf-lib biasa tidak bisa membaca PDF terenkripsi; @cantoo/pdf-lib (turunan pdf-lib) bisa mendekripsi.
  // Library ini (±600 KB) hanya diunduh kalau memang ada PDF terkunci.
  const CRYPT_LIB = "https://cdn.jsdelivr.net/npm/@cantoo/pdf-lib@2.11.1/dist/pdf-lib.min.js";
  let cryptLib = null;
  async function loadCrypt() {
    if (cryptLib) return cryptLib;
    const keep = window.PDFLib; // library ini juga memakai nama global PDFLib: simpan yang asli, lalu kembalikan
    try { await loadScript(CRYPT_LIB); cryptLib = window.PDFLib; } finally { if (keep) window.PDFLib = keep; else delete window.PDFLib; }
    return cryptLib;
  }
  function isEncrypted(bytes) {
    // cari "/Encrypt" (trailer) tanpa mengubah seluruh file jadi teks
    const pat = [47, 69, 110, 99, 114, 121, 112, 116];
    for (let i = bytes.length - pat.length; i >= 0; i--) {
      if (bytes[i] !== 47) continue;
      let ok = true; for (let k = 1; k < pat.length; k++) if (bytes[i + k] !== pat[k]) { ok = false; break; }
      if (!ok) continue;
      // harus diikuti referensi objek ("12 0 R") atau kamus ("<<"), seperti di trailer PDF terenkripsi
      let j = i + pat.length; while (j < bytes.length && (bytes[j] === 32 || bytes[j] === 10 || bytes[j] === 13)) j++;
      if ((bytes[j] >= 48 && bytes[j] <= 57) || (bytes[j] === 60 && bytes[j + 1] === 60)) return true;
    }
    return false;
  }
  // kotak kata sandi; hasil: teks kata sandi, atau null kalau dibatalkan
  function askPassword(name, wrong) {
    return new Promise((resolve) => {
      const d = document.createElement("div");
      d.className = "pwbox"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-labelledby", "pwT");
      d.innerHTML = '<form class="pwcard"><h2 id="pwT">PDF ini dikunci kata sandi</h2><p>Masukkan kata sandi untuk membuka <b></b>. Kata sandinya hanya dipakai di perangkat ini, tidak dikirim ke mana pun.</p>' +
        '<input class="inp" type="password" autocomplete="off" aria-label="Kata sandi PDF" placeholder="Kata sandi">' + (wrong ? '<p class="err">Kata sandi salah. Coba lagi.</p>' : "") +
        '<div class="pwacts"><button type="button" class="ghost" data-x>Batal</button><button type="submit" class="cta">Buka</button></div></form>';
      d.querySelector("b").textContent = name;
      document.body.appendChild(d);
      const inp = d.querySelector("input"); setTimeout(() => inp.focus(), 30);
      const done = (v) => { d.remove(); resolve(v); };
      d.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); done(inp.value); });
      d.querySelector("[data-x]").addEventListener("click", () => done(null));
      d.addEventListener("keydown", (e) => { if (e.key === "Escape") done(null); });
    });
  }
  // kembalikan { bytes, unlocked: null | "password" | "owner" } — bytes sudah tanpa enkripsi
  async function unlockPdf(bytes, name) {
    if (!isEncrypted(bytes)) return { bytes, unlocked: null };
    let C;
    try { C = await loadCrypt(); } catch (e) { throw Object.assign(new Error("lib"), { userMsg: "Alat pembuka kunci PDF gagal dimuat. Periksa koneksi internet, lalu coba lagi." }); }
    const open = async (pw) => (await (await C.PDFDocument.load(bytes, { password: pw, updateMetadata: false })).save({ useObjectStreams: true }));
    try { return { bytes: await open(""), unlocked: "owner" }; } catch (e) { if (!/password|encrypt/i.test(e.message || "")) throw Object.assign(e, { userMsg: "PDF terkunci ini tidak bisa dibuka. Mungkin filenya rusak atau memakai kunci yang belum didukung." }); }
    let wrong = false;
    for (;;) {
      const pw = await askPassword(name, wrong);
      if (pw === null) throw Object.assign(new Error("batal"), { userMsg: "Tidak jadi dibuka. PDF terkunci butuh kata sandinya.", cancelled: true });
      try { return { bytes: await open(pw), unlocked: "password" }; }
      catch (e) { if (/password/i.test(e.message || "")) { wrong = true; continue; } throw Object.assign(e, { userMsg: "PDF terkunci ini tidak bisa dibuka. Mungkin filenya rusak atau memakai kunci yang belum didukung." }); }
    }
  }
  function unlockNote(how) {
    if (how === "password") toast("Kunci PDF dibuka dengan kata sandimu. Hasilnya tidak lagi berkata sandi.");
    else if (how === "owner") toast("PDF ini dikunci izin oleh pembuatnya. Kuncinya dibuka di perangkatmu supaya bisa diproses. Pastikan kamu berhak mengubahnya.");
  }

  // ---------- offline & pasang aplikasi ----------
  // didaftarkan setelah halaman selesai dimuat & browser menganggur, supaya unduhan simpanan offline tidak berebut koneksi
  try {
    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol) && c.PWA) whenIdle(() => navigator.serviceWorker.register(ROOT + "sw.js", { scope: ROOT }).catch(() => {}));
  } catch (e) {}
  let installEvt = null;
  const installBtns = new Set();
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; installBtns.forEach((b) => b.classList.add("show")); });
  function setupInstall(btn) {
    if (!btn) return;
    installBtns.add(btn);
    if (installEvt) btn.classList.add("show");
    btn.addEventListener("click", async () => {
      if (!installEvt) return;
      installEvt.prompt();
      try { const r = await installEvt.userChoice; if (r.outcome === "accepted") track("situs", "pasang-aplikasi"); } catch (e) {}
      installEvt = null; installBtns.forEach((b) => b.classList.remove("show"));
    });
  }

  customElements.define("mampat-top", MampatTop);
  customElements.define("mampat-foot", MampatFoot);

  window.Mampat = { ROOT, KB, MB, TOOLS, toolUrl, track, bucket, nf, fmt, toast, tick, esc, baseName, pdfError, saveFile, saveHint, LIB, loadScript, whenIdle, loadLibs, warmLibs, unlockPdf, unlockNote };
})();
