/* Mampat · pembantu bersama untuk alat PDF (gabung, pisah, atur halaman, gambar ↔ PDF):
   pilih file + tarik-lepas, buka PDF dengan pesan error yang jelas, thumbnail halaman,
   urutkan dengan drag, rentang halaman, serta tampilan "sedang diproses" dan "selesai". */
(function () {
  "use strict";
  const M = window.Mampat;
  const $ = (id) => document.getElementById(id);
  const I = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  const ICON = {
    left: I('<path d="m15 6-6 6 6 6"/>'),
    right: I('<path d="m9 6 6 6-6 6"/>'),
    rotL: I('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
    rotR: I('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'),
    trash: I('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    undo: I('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
    grip: I('<path d="M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01"/>'),
    plus: I('<path d="M12 5v14M5 12h14"/>'),
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
    save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/></svg>',
  };
  const isPdf = (f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf";
  const isImage = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(f.name);

  // ---------- pilih file: klik, tarik-lepas ke halaman, atau tempel ----------
  function pickFiles(opts) {
    const { drop, input, accept, onFiles, kind } = opts;
    let ov = $("dragov");
    if (!ov) { ov = document.createElement("div"); ov.id = "dragov"; ov.className = "dragov"; ov.hidden = true; ov.innerHTML = "<div></div>"; document.body.appendChild(ov); }
    const give = (list) => {
      const all = [...list], ok = all.filter(accept);
      if (all.length && !ok.length) { M.toast("Itu bukan " + kind + ". Pilih file " + kind + " ya.", true); return; }
      if (ok.length < all.length) M.toast((all.length - ok.length) + " file dilewati karena bukan " + kind + ".");
      if (ok.length) onFiles(input.multiple ? ok : ok.slice(0, 1));
    };
    if (drop) {
      drop.addEventListener("click", () => input.click());
      drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
    }
    input.addEventListener("change", () => { const f = [...input.files]; input.value = ""; give(f); });
    let depth = 0;
    window.addEventListener("dragenter", (e) => { if (opts.enabled && !opts.enabled()) return; if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { depth++; ov.firstChild.textContent = "Lepaskan " + kind + "-nya"; ov.hidden = false; } });
    window.addEventListener("dragleave", () => { depth = Math.max(0, depth - 1); if (!depth) ov.hidden = true; });
    window.addEventListener("dragover", (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) e.preventDefault(); });
    window.addEventListener("drop", (e) => { if (!e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); depth = 0; ov.hidden = true; if (opts.enabled && !opts.enabled()) return; give(e.dataTransfer.files); });
    window.addEventListener("paste", (e) => { const f = [...(e.clipboardData ? e.clipboardData.files : [])].filter(accept); if (f.length && (!opts.enabled || opts.enabled())) give(f); });
  }

  // ---------- buka PDF ----------
  // pdf.js untuk tampilan, pdf-lib untuk mengubah. Error dilempar dengan pesan yang ramah (err.userMsg).
  async function openPdf(file, needEdit) {
    let bytes = new Uint8Array(await file.arrayBuffer());
    // PDF terkunci: minta kata sandi / buka kunci izin dulu, lalu lanjut seperti PDF biasa
    const u = await M.unlockPdf(bytes, file.name);
    bytes = u.bytes; M.unlockNote(u.unlocked);
    try {
      await M.loadLibs(needEdit ? ["pdfjs", "pdflib"] : ["pdfjs"]);
      const view = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      let edit = null;
      if (needEdit) {
        try { edit = await PDFLib.PDFDocument.load(bytes, { updateMetadata: false }); }
        catch (e) { view.destroy(); throw e; }
      }
      return { file, bytes, view, edit, n: view.numPages };
    } catch (err) {
      console.error(err);
      const e = new Error(M.pdfError(err)); e.userMsg = e.message; throw e;
    }
  }

  // ---------- thumbnail halaman (dirender satu per satu, hanya yang terlihat) ----------
  const queue = [];
  let pumping = false;
  const seen = new WeakSet();
  const io = "IntersectionObserver" in window ? new IntersectionObserver((ents) => {
    for (const en of ents) if (en.isIntersecting) { io.unobserve(en.target); const job = en.target._thumbJob; if (job) { queue.push(job); pump(); } }
  }, { rootMargin: "400px 0px" }) : null;
  async function pump() {
    if (pumping) return; pumping = true;
    while (queue.length) {
      const job = queue.shift();
      if (!job.canvas.isConnected && !job.force) continue;
      try { await renderInto(job); } catch (e) {}
    }
    pumping = false;
  }
  async function renderInto(job) {
    const { doc, pageNo, canvas, box, rotate } = job;
    const page = await doc.getPage(pageNo);
    const rot = ((((page.rotate || 0) + (rotate || 0)) % 360) + 360) % 360;
    const vp1 = page.getViewport({ scale: 1, rotation: rot });
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const s = Math.min(box / vp1.width, box / vp1.height) * ratio;
    const vp = page.getViewport({ scale: s, rotation: rot });
    canvas.width = Math.max(1, Math.round(vp.width)); canvas.height = Math.max(1, Math.round(vp.height));
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    page.cleanup();
    canvas.dataset.done = "1";
  }
  // gambar thumbnail halaman ke canvas saat mendekati layar; rotate = putaran tambahan (derajat)
  function thumb(doc, pageNo, canvas, opts) {
    opts = opts || {};
    const job = { doc, pageNo, canvas, box: opts.box || 220, rotate: opts.rotate || 0 };
    canvas._thumbJob = job;
    if (io && !opts.now) { if (seen.has(canvas)) io.unobserve(canvas); seen.add(canvas); io.observe(canvas); }
    else { job.force = true; queue.push(job); pump(); }
  }
  // render ulang sekarang (misalnya setelah diputar)
  function rethumb(canvas, rotate) {
    const job = canvas._thumbJob; if (!job) return;
    job.rotate = rotate;
    if (canvas.dataset.done) { queue.unshift(Object.assign({}, job, { force: true })); pump(); }
  }

  // ---------- urutkan dengan drag (mouse & sentuh) ----------
  // container berisi item (selector), drag dimulai dari handle. onChange() dipanggil setelah urutan berubah.
  function sortable(container, opts) {
    const itemSel = opts.items, handleSel = opts.handle;
    container.addEventListener("pointerdown", (e) => {
      const h = e.target.closest(handleSel);
      if (!h || !container.contains(h) || e.button > 0 || e.target.closest("button:not(" + handleSel + ")")) return;
      const item = h.closest(itemSel);
      if (!item) return;
      e.preventDefault();
      const r0 = item.getBoundingClientRect(), dx = e.clientX - r0.left, dy = e.clientY - r0.top;
      let ghost = null, moved = false, lastY = e.clientY, raf = 0;
      const startX = e.clientX, startY = e.clientY;
      const begin = () => {
        ghost = item.cloneNode(true);
        const src = item.querySelectorAll("canvas"), dst = ghost.querySelectorAll("canvas");
        src.forEach((c, i) => { dst[i].width = c.width; dst[i].height = c.height; dst[i].getContext("2d").drawImage(c, 0, 0); });
        ghost.classList.add("drag-ghost"); ghost.style.width = r0.width + "px"; ghost.removeAttribute("id");
        document.body.appendChild(ghost);
        item.classList.add("lift");
        const scroll = () => { const edge = 70; if (lastY < edge) window.scrollBy(0, -Math.ceil((edge - lastY) / 4)); else if (lastY > innerHeight - edge) window.scrollBy(0, Math.ceil((lastY - innerHeight + edge) / 4)); raf = requestAnimationFrame(scroll); };
        raf = requestAnimationFrame(scroll);
      };
      const move = (ev) => {
        lastY = ev.clientY;
        if (!ghost) { if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return; begin(); }
        ghost.style.left = ev.clientX - dx + "px"; ghost.style.top = ev.clientY - dy + "px";
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const over = el && el.closest(itemSel);
        if (over && over !== item && container.contains(over)) {
          const r = over.getBoundingClientRect();
          const after = ev.clientY > r.bottom ? true : ev.clientY < r.top ? false : ev.clientX > r.left + r.width / 2;
          const ref = after ? over.nextSibling : over;
          if (ref !== item && item.nextSibling !== ref) { container.insertBefore(item, ref); moved = true; }
        }
      };
      const end = () => {
        window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end);
        cancelAnimationFrame(raf);
        if (ghost) ghost.remove();
        item.classList.remove("lift");
        if (moved) opts.onChange();
      };
      // didengarkan di window: item dipindah di DOM selama drag, jadi pointer capture di elemen akan lepas
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", end); window.addEventListener("pointercancel", end);
    });
  }
  // pindahkan item satu langkah (tombol ← →, untuk keyboard dan yang tidak bisa drag)
  function moveBy(item, dir, itemSel) {
    if (dir < 0) { let p = item.previousElementSibling; while (p && !p.matches(itemSel)) p = p.previousElementSibling; if (p) p.before(item); return !!p; }
    let n = item.nextElementSibling; while (n && !n.matches(itemSel)) n = n.nextElementSibling; if (n) n.after(item); return !!n;
  }

  // ---------- rentang halaman: "1-3, 5, 8-" ----------
  function parseRanges(text, n) {
    const s = String(text || "").replace(/[–—]/g, "-").replace(/\s+/g, "");
    if (!s) throw new Error("Tulis halaman yang mau diambil, misalnya 1-3, 5.");
    const out = [];
    for (const part of s.split(/[,;]+/).filter(Boolean)) {
      const m = /^(\d+)?(-)?(\d+)?$/.exec(part);
      if (!m || (!m[1] && !m[3])) throw new Error('"' + part + '" bukan nomor halaman. Contoh yang benar: 1-3, 5');
      let a = m[1] ? +m[1] : 1, b = m[2] ? (m[3] ? +m[3] : n) : a;
      if (a < 1 || b < 1) throw new Error("Nomor halaman mulai dari 1.");
      if (a > n || b > n) throw new Error("PDF ini cuma punya " + n + " halaman. Halaman " + Math.max(a, b) + " tidak ada.");
      if (a > b) [a, b] = [b, a];
      out.push([a, b]);
    }
    return out;
  }
  const rangeLabel = (ranges) => ranges.map(([a, b]) => (a === b ? String(a) : a + "-" + b)).join("_");
  // [1,2,3,5] → "1-3, 5"
  function compactRanges(pages) {
    const out = []; let i = 0;
    while (i < pages.length) { let j = i; while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++; out.push(i === j ? String(pages[i]) : pages[i] + "-" + pages[j]); i = j + 1; }
    return out.join(", ");
  }
  const pad = (i, n) => String(i).padStart(String(n).length, "0");

  // ---------- tampilan: pilih → atur → proses → selesai ----------
  const PRESS = '<svg class="press" viewBox="0 0 180 170" aria-hidden="true"><g class="plate-t"><rect x="20" y="14" width="140" height="16" rx="4" fill="var(--ink)"/><rect x="84" y="0" width="12" height="16" fill="var(--ink)"/></g><g class="sheet"><rect x="50" y="48" width="80" height="74" rx="6" fill="var(--accent)" stroke="var(--ink)" stroke-width="2"/><path d="M64 70h52M64 85h38M64 100h46" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/></g><g class="plate-b"><rect x="20" y="140" width="140" height="16" rx="4" fill="var(--ink)"/></g></svg>';
  function views(ids) {
    const work = $("vWork"), done = $("vDone");
    if (work && !work.firstChild) work.innerHTML = '<div class="work">' + PRESS + '<div class="big" id="wPct">0%</div><div class="pbar"><i id="wBar"></i></div><div class="what" id="wWhat">Menyiapkan…</div><button id="wCancel" class="ghost" type="button">Batalkan</button></div>';
    if (done && !done.firstChild) done.innerHTML = '<div class="done"><span class="pill good" id="dPill"></span><div class="res-num"><span class="big" id="dBig"></span><span class="from" id="dFrom"></span></div><div id="dNote"></div><div class="acts"><button id="dSave" class="cta" type="button">' + ICON.save + '<span id="dSaveTxt">Simpan</span></button><button id="dBack" class="ghost" type="button">Ubah lagi</button><button id="dNew" class="ghost" type="button">File lain</button></div><p class="note savehint" id="dHint"></p></div>';
    const api = {
      show(id) { ids.forEach((v) => { $(v).hidden = v !== id; }); if (id === "vWork" || id === "vDone") $("tool").scrollIntoView({ block: "nearest", behavior: "smooth" }); },
      cancelled: false,
      work(frac, what) { const p = Math.max(0, Math.min(100, Math.round(frac * 100))); $("wPct").textContent = p + "%"; $("wBar").style.width = p + "%"; if (what) $("wWhat").textContent = what; },
      done(o) {
        $("dPill").innerHTML = ICON.ok + (o.pill || "Selesai");
        $("dBig").textContent = o.big; $("dFrom").textContent = o.from || "";
        $("dNote").innerHTML = o.note ? '<p class="note">' + o.note + "</p>" : "";
        $("dSaveTxt").textContent = o.saveText || "Simpan";
        $("dHint").textContent = M.saveHint();
        api.show("vDone");
        setTimeout(() => $("dSave").focus({ preventScroll: true }), 50);
      },
    };
    if ($("wCancel")) $("wCancel").addEventListener("click", () => { api.cancelled = true; $("wWhat").textContent = "Membatalkan…"; });
    return api;
  }

  window.PdfTools = { $, ICON, isPdf, isImage, pickFiles, openPdf, thumb, rethumb, sortable, moveBy, parseRanges, rangeLabel, compactRanges, pad, views };
})();
