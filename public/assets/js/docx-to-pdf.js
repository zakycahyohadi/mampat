/* Mampat · mesin Word (.docx) → PDF, semuanya di browser.
   1. docx-preview menyusun dokumen jadi halaman HTML (sekaligus jadi pratinjau)
   2. nomor/bullet daftar (CSS ::before) diubah jadi teks sungguhan
   3. font Word diganti kembaran yang ukurannya sama (Calibri → Carlito, Times New Roman → Tinos, …)
   4. halaman yang kepanjangan dipecah per baris / per baris tabel
   5. teks, garis, latar, gambar, dan link digambar ulang ke PDF dengan pdf-lib:
      teks tetap bisa dipilih & dicari, font ditanam (subset, lewat assets/js/ttf-subset.js) supaya file kecil */
(function () {
  "use strict";
  const M = window.Mampat;

  // ---------- font kembaran (metrik sama dengan font Word) ----------
  const FONT_PKG = { carlito: "carlito@0.4.1", caladea: "caladea@0.4.2", tinos: "tinos@0.4.2", arimo: "arimo@0.4.3", cousine: "cousine@0.4.3" };
  const FONT_FILE = { carlito: "Carlito", caladea: "Caladea", tinos: "Tinos", arimo: "Arimo", cousine: "Cousine" };
  const FONT_FOR = {
    calibri: "carlito", "calibri light": "carlito", carlito: "carlito", candara: "carlito", corbel: "carlito", "segoe ui": "carlito", "segoe ui light": "carlito",
    cambria: "caladea", caladea: "caladea", "cambria math": "caladea",
    "times new roman": "tinos", times: "tinos", tinos: "tinos", "liberation serif": "tinos", georgia: "tinos", garamond: "tinos", "book antiqua": "tinos",
    "palatino linotype": "tinos", palatino: "tinos", "bookman old style": "tinos", century: "tinos", "century schoolbook": "tinos", serif: "tinos",
    arial: "arimo", helvetica: "arimo", arimo: "arimo", "liberation sans": "arimo", "arial narrow": "arimo", tahoma: "arimo", verdana: "arimo",
    "century gothic": "arimo", "trebuchet ms": "arimo", "comic sans ms": "arimo", "gill sans mt": "arimo", "franklin gothic book": "arimo", "sans-serif": "arimo",
    "courier new": "cousine", courier: "cousine", consolas: "cousine", "lucida console": "cousine", cousine: "cousine", monospace: "cousine",
  };
  function familyKey(cssFamily) {
    const names = String(cssFamily || "").split(",").map((n) => n.trim().replace(/^["']|["']$/g, "").toLowerCase()).filter(Boolean);
    for (const n of names) { if (n.startsWith("mp-")) return n.slice(3); if (FONT_FOR[n]) return FONT_FOR[n]; }
    const first = names[0] || "";
    if (/mono|courier|consol|code/.test(first)) return "cousine";
    if (/serif|roman|times|book|garamond|georgia|minion|baskerville|bodoni|didot/.test(first) && !/sans/.test(first)) return "tinos";
    return "carlito";
  }
  const variantDir = (bold, italic) => (bold ? "700Bold" : "400Regular") + (italic ? "_Italic" : "");
  const fontUrl = (key, bold, italic) => { const d = variantDir(bold, italic); return "https://cdn.jsdelivr.net/npm/@expo-google-fonts/" + FONT_PKG[key] + "/" + d + "/" + FONT_FILE[key] + "_" + d + ".ttf"; };
  const STD = { carlito: "Helvetica", arimo: "Helvetica", caladea: "TimesRoman", tinos: "TimesRoman", cousine: "Courier" };
  const loaded = new Map(); // "key|b|i" → { bytes, metrics } atau { failed: true }
  async function loadFont(key, bold, italic) {
    const id = key + "|" + (bold ? 1 : 0) + "|" + (italic ? 1 : 0);
    if (loaded.has(id)) return loaded.get(id);
    const rec = {};
    try {
      const res = await fetch(fontUrl(key, bold, italic));
      if (!res.ok) throw new Error("font " + res.status);
      rec.bytes = new Uint8Array(await res.arrayBuffer());
      const face = new FontFace("mp-" + key, rec.bytes, { weight: bold ? "700" : "400", style: italic ? "italic" : "normal" });
      await face.load(); document.fonts.add(face);
      rec.metrics = window.TtfSubset.parse(rec.bytes);
    } catch (e) { console.warn(e); rec.failed = true; }
    loaded.set(id, rec);
    return rec;
  }

  // ---------- 1. susun dokumen ----------
  async function render(bytes, host) {
    host.textContent = "";
    await M.loadLibs(["docx", "pdflib"]);
    await window.docx.renderAsync(bytes, host, null, {
      className: "docx", inWrapper: true, ignoreWidth: false, ignoreHeight: false, ignoreFonts: false,
      breakPages: true, ignoreLastRenderedPageBreak: false, renderHeaders: true, renderFooters: true,
      renderFootnotes: true, renderEndnotes: true, useBase64URL: true, experimental: true,
    });
    if (!host.querySelector("section.docx")) throw new Error("kosong");
    materialize(host);
    const missing = await useFonts(host);
    paginate(host);
    return { pages: host.querySelectorAll("section.docx").length, missingFonts: missing };
  }

  // ---------- 2. nomor & bullet dari CSS ::before jadi teks ----------
  const PUA = { "": "•", "": "▪", "": "➢", "": "✓", "": "❖", "": "◦", "": "➔", "": "o", "": "-", "": "—" };
  function roman(n) { const r = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]]; let s = ""; for (const [v, t] of r) while (n >= v) { s += t; n -= v; } return s; }
  function alpha(n) { let s = ""; while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); } return s; }
  function fmtCounter(n, style) {
    switch ((style || "decimal").trim()) {
      case "decimal-leading-zero": return (n < 10 ? "0" : "") + n;
      case "lower-alpha": case "lower-latin": return alpha(n);
      case "upper-alpha": case "upper-latin": return alpha(n).toUpperCase();
      case "lower-roman": return roman(n);
      case "upper-roman": return roman(n).toUpperCase();
      case "disc": return "•"; case "circle": return "◦"; case "square": return "▪"; case "none": return "";
      default: return String(n);
    }
  }
  // isi "content" CSS → teks (string, counter(), counters())
  function evalContent(c, counters) {
    let out = "", i = 0;
    while (i < c.length) {
      const ch = c[i];
      if (ch === '"' || ch === "'") {
        let j = i + 1, s = "";
        while (j < c.length && c[j] !== ch) {
          if (c[j] === "\\") {
            const m = /^[0-9a-fA-F]{1,6} ?/.exec(c.slice(j + 1));
            if (m) { s += String.fromCodePoint(parseInt(m[0], 16)); j += 1 + m[0].length; continue; }
            s += c[j + 1]; j += 2; continue;
          }
          s += c[j++];
        }
        out += s; i = j + 1;
      } else if (c.startsWith("counter(", i) || c.startsWith("counters(", i)) {
        const j = c.indexOf(")", i), args = c.slice(c.indexOf("(", i) + 1, j).split(",").map((x) => x.trim());
        const name = args[0], style = c.startsWith("counters(", i) ? args[2] : args[1];
        out += fmtCounter(counters.get(name) || 0, style);
        i = j + 1;
      } else i++;
    }
    return out;
  }
  function applyCounters(val, counters, reset) {
    if (!val || val === "none") return;
    const t = val.trim().split(/\s+/);
    for (let i = 0; i < t.length; i++) {
      const name = t[i]; let n = reset ? 0 : 1;
      if (i + 1 < t.length && /^-?\d+$/.test(t[i + 1])) n = +t[++i];
      counters.set(name, reset ? n : (counters.get(name) || 0) + n);
    }
  }
  const COPY = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "color", "textDecorationLine", "verticalAlign", "letterSpacing"];
  function materialize(root) {
    const counters = new Map(), todo = [];
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    for (let el = tw.currentNode; el; el = tw.nextNode()) {
      const cs = getComputedStyle(el);
      applyCounters(cs.counterReset, counters, true);
      applyCounters(cs.counterIncrement, counters, false);
      for (const pseudo of ["::before", "::after"]) {
        const ps = getComputedStyle(el, pseudo), c = ps.content;
        if (!c || c === "none" || c === "normal") continue;
        applyCounters(ps.counterReset, counters, true);
        applyCounters(ps.counterIncrement, counters, false);
        let text = evalContent(c, counters).replace(/[-]/g, (x) => PUA[x] || "•");
        const isList = /docx-num-/.test(el.className);
        // bullet Word (font Symbol/Wingdings) yang karakternya hilang
        if (isList && !text.replace(/[\s\t]/g, "") && /symbol|wingdings/i.test(ps.fontFamily)) text = "•" + text;
        const st = {}; COPY.forEach((k) => { st[k] = ps[k]; });
        if (/symbol|wingdings|webdings/i.test(st.fontFamily)) st.fontFamily = cs.fontFamily;
        todo.push({ el, pseudo, text, st, isList, indent: parseFloat(cs.textIndent) || 0 });
      }
    }
    for (const t of todo) {
      const span = document.createElement("span");
      span.className = "mp-pseudo";
      Object.assign(span.style, t.st);
      let text = t.text;
      // nomor + tab: teks lurus di indentasi gantung seperti di Word
      if (t.isList && /\t\s*$/.test(text) && t.indent < 0) { text = text.replace(/\t\s*$/, ""); span.style.display = "inline-block"; span.style.minWidth = -t.indent + "px"; span.style.textIndent = "0"; }
      span.textContent = text.replace(/\t/g, " ");
      if (t.pseudo === "::before") t.el.insertBefore(span, t.el.firstChild); else t.el.appendChild(span);
      t.el.classList.add(t.pseudo === "::before" ? "mp-nb" : "mp-na");
    }
    if (!document.getElementById("mp-pseudo-off")) {
      const s = document.createElement("style"); s.id = "mp-pseudo-off";
      s.textContent = ".mp-nb::before{content:none!important}.mp-na::after{content:none!important}";
      document.head.appendChild(s);
    }
  }

  // ---------- 3. font kembaran ----------
  async function useFonts(root) {
    const els = root.querySelectorAll("section.docx, section.docx *");
    const need = new Map();
    els.forEach((el) => {
      const cs = getComputedStyle(el), key = familyKey(cs.fontFamily);
      el.style.fontFamily = '"mp-' + key + '"';
      el.dataset.mpFont = key;
    });
    // varian yang benar-benar dipakai teks
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (!n.nodeValue.trim() || !n.parentElement || !n.parentElement.closest("section.docx")) continue;
      const cs = getComputedStyle(n.parentElement), key = n.parentElement.dataset.mpFont || familyKey(cs.fontFamily);
      const bold = (parseInt(cs.fontWeight, 10) || 400) >= 600, italic = cs.fontStyle !== "normal";
      need.set(key + "|" + bold + "|" + italic, [key, bold, italic]);
    }
    const res = await Promise.all([...need.values()].map(([k, b, i]) => loadFont(k, b, i).then((r) => (r.failed ? FONT_FILE[k] : null))));
    await document.fonts.ready;
    return [...new Set(res.filter(Boolean))];
  }

  // ---------- 4. pecah halaman yang kepanjangan ----------
  const pxPerPt = 96 / 72;
  function pageSize(sec) { return { w: parseFloat(sec.style.width) || 612, h: parseFloat(sec.style.minHeight) || 792 }; }
  function newPage(sec) {
    const ns = sec.cloneNode(false);
    for (const tag of ["header", "footer"]) { const h = sec.querySelector(":scope > " + tag); if (h) ns.appendChild(h.cloneNode(true)); }
    const art = document.createElement("article");
    const foot = ns.querySelector(":scope > footer");
    ns.insertBefore(art, foot || null);
    sec.after(ns);
    return { ns, art };
  }
  // offset karakter pertama di baris yang melewati batas bawah
  function splitPoint(block, limitY) {
    const texts = [], tw = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) if (n.nodeValue.length) texts.push(n);
    const r = document.createRange();
    let firstLineTop = null;
    for (const n of texts) {
      for (let i = 0; i < n.nodeValue.length; i++) {
        if (/\s/.test(n.nodeValue[i])) continue;
        r.setStart(n, i); r.setEnd(n, i + 1);
        const rc = r.getClientRects()[0];
        if (!rc) continue;
        if (firstLineTop === null) firstLineTop = rc.top;
        if (rc.bottom > limitY + 0.5) return rc.top <= firstLineTop + 1 ? null : { node: n, offset: i };
      }
    }
    return null;
  }
  function paginate(root) {
    let guard = 0;
    for (let sec = root.querySelector("section.docx"); sec && guard < 3000; sec = sec.nextElementSibling, guard++) {
      if (!sec.matches("section.docx")) continue;
      const { h } = pageSize(sec), hPx = h * pxPerPt;
      sec.style.height = hPx + "px";
      const art = sec.querySelector(":scope > article");
      if (!art) continue;
      const top = sec.getBoundingClientRect().top;
      const padB = parseFloat(getComputedStyle(sec).paddingBottom) || 0;
      const limit = top + hPx - padB;
      const kids = [...art.children];
      let cut = -1, split = null;
      for (let k = 0; k < kids.length; k++) {
        const rc = kids[k].getBoundingClientRect();
        if (rc.bottom <= limit + 0.5) continue;
        cut = k;
        const el = kids[k];
        if (rc.top < limit - 2) {
          if (el.tagName === "TABLE") split = { kind: "table", el };
          else if (el.textContent.trim()) split = { kind: "text", el };
        }
        break;
      }
      if (cut < 0) continue;
      const moving = kids.slice(cut + (split ? 1 : 0));
      let carry = null;
      if (split && split.kind === "text") {
        const pt = splitPoint(split.el, limit);
        if (pt) {
          const r = document.createRange(); r.setStart(pt.node, pt.offset); r.setEnd(split.el, split.el.childNodes.length);
          carry = split.el.cloneNode(false); carry.appendChild(r.extractContents());
          // lanjutan paragraf: tanpa nomor daftar & tanpa indentasi baris pertama
          carry.style.textIndent = "0"; carry.style.marginTop = "0"; split.el.style.marginBottom = "0";
        } else if (cut > 0) moving.unshift(split.el);
      } else if (split && split.kind === "table") {
        const rows = [...split.el.rows];
        const bad = rows.findIndex((tr) => tr.getBoundingClientRect().bottom > limit + 0.5);
        if (bad === -1) { /* semua baris muat, hanya garis bawah tabel yang lewat */ }
        else if (bad > 0) {
          carry = split.el.cloneNode(false);
          const cg = split.el.querySelector(":scope > colgroup"); if (cg) carry.appendChild(cg.cloneNode(true));
          const body = document.createElement("tbody"); carry.appendChild(body);
          rows.slice(bad).forEach((tr) => body.appendChild(tr));
        } else if (cut > 0) moving.unshift(split.el);
      } else if (!split && cut === 0 && moving.length === kids.length) moving.shift(); // satu blok lebih tinggi dari halaman: biarkan
      if (!carry && !moving.length) continue;
      const { art: nart } = newPage(sec);
      if (carry) nart.appendChild(carry);
      moving.forEach((el) => nart.appendChild(el));
    }
  }

  // ---------- 5. gambar ke PDF ----------
  function rgb(css) {
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(css || "");
    if (!m) return null;
    const a = m[4] === undefined ? 1 : +m[4];
    return a < 0.05 ? null : { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255, a };
  }
  async function convert(host, onProg, isCancelled) {
    const L = window.PDFLib, { PDFDocument, StandardFonts, rgb: RGB, PDFName, PDFString, PDFHexString, LineCapStyle } = L;
    const doc = await PDFDocument.create({ updateMetadata: false });
    const pdfFonts = new Map(), images = new Map(), ttfs = [];
    const stats = { images: 0, skippedImages: 0, rasterWords: 0 };
    async function pdfFont(key, bold, italic) {
      const id = key + "|" + bold + "|" + italic;
      if (pdfFonts.has(id)) return pdfFonts.get(id);
      const rec = await loadFont(key, bold, italic);
      let f;
      if (rec.failed) {
        const base = STD[key];
        const name = base === "Courier" ? (bold ? (italic ? "CourierBoldOblique" : "CourierBold") : italic ? "CourierOblique" : "Courier")
          : base === "TimesRoman" ? (bold ? (italic ? "TimesRomanBoldItalic" : "TimesRomanBold") : italic ? "TimesRomanItalic" : "TimesRoman")
          : bold ? (italic ? "HelveticaBoldOblique" : "HelveticaBold") : italic ? "HelveticaOblique" : "Helvetica";
        f = { pdf: await doc.embedFont(StandardFonts[name]), ttf: null, metrics: null };
      } else {
        const ttf = window.TtfSubset.pdfFont(doc, rec.bytes);
        ttfs.push(ttf);
        f = { ttf, metrics: ttf.metrics, res: "MP" + ttfs.length };
      }
      pdfFonts.set(id, f);
      return f;
    }
    async function embedImg(src) {
      if (images.has(src)) return images.get(src);
      let img = null;
      try {
        if (/^data:image\/jpe?g/i.test(src)) img = await doc.embedJpg(dataBytes(src));
        else if (/^data:image\/png/i.test(src)) img = await doc.embedPng(dataBytes(src));
        else {
          const el = new Image(); el.src = src; await el.decode();
          const c = document.createElement("canvas"); c.width = el.naturalWidth; c.height = el.naturalHeight;
          c.getContext("2d").drawImage(el, 0, 0);
          img = await doc.embedPng(await canvasBytes(c, "image/png"));
        }
      } catch (e) { img = null; }
      images.set(src, img);
      return img;
    }
    const secs = [...host.querySelectorAll("section.docx")];
    host.classList.add("mp-measure");
    try {
      for (let pi = 0; pi < secs.length; pi++) {
        if (isCancelled && isCancelled()) throw new Error("cancelled");
        onProg && onProg(pi / secs.length, "Halaman " + (pi + 1) + " dari " + secs.length);
        await drawPage(secs[pi]);
        await M.tick();
      }
    } finally { host.classList.remove("mp-measure"); }
    ttfs.forEach((t) => t.finish());
    doc.setProducer("Mampat"); doc.setCreator("Mampat · Word ke PDF");
    const bytes = await doc.save({ useObjectStreams: true });
    return { bytes, pages: secs.length, stats };

    async function drawPage(sec) {
      const size = pageSize(sec), sr = sec.getBoundingClientRect();
      const W = size.w, H = size.h, k = W / sr.width, fsk = W / sec.offsetWidth;
      const page = doc.addPage([W, H]);
      const X = (x) => (x - sr.left) * k, Y = (y) => H - (y - sr.top) * k;
      const inPage = (rc) => rc.bottom > sr.top && rc.top < sr.top + H / k && rc.right > sr.left && rc.left < sr.right;
      const els = [...sec.querySelectorAll("*")];
      // latar & garis tepi
      for (const el of els) {
        if (el.tagName === "IMG" || el.tagName === "BR") continue;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const bg = rgb(cs.backgroundColor);
        const inline = cs.display === "inline";
        const rects = inline ? [...el.getClientRects()] : [el.getBoundingClientRect()];
        for (const rc of rects) {
          if (!rc.width || !rc.height || !inPage(rc)) continue;
          if (bg && el !== sec && !el.matches(".docx-wrapper")) {
            page.drawRectangle({ x: X(rc.left), y: Y(rc.bottom), width: rc.width * k, height: rc.height * k, color: RGB(bg.r, bg.g, bg.b), opacity: bg.a });
          }
          if (inline) continue;
          for (const side of ["Top", "Right", "Bottom", "Left"]) {
            const w = parseFloat(cs["border" + side + "Width"]), st = cs["border" + side + "Style"], col = rgb(cs["border" + side + "Color"]);
            if (!w || !col || st === "none" || st === "hidden") continue;
            const t = w * k, c = RGB(col.r, col.g, col.b);
            const dash = st === "dashed" ? [t * 3, t * 2] : st === "dotted" ? [t, t * 1.5] : undefined;
            let x1, y1, x2, y2;
            if (side === "Top") { x1 = rc.left; x2 = rc.right; y1 = y2 = rc.top + w / 2; }
            else if (side === "Bottom") { x1 = rc.left; x2 = rc.right; y1 = y2 = rc.bottom - w / 2; }
            else if (side === "Left") { y1 = rc.top; y2 = rc.bottom; x1 = x2 = rc.left + w / 2; }
            else { y1 = rc.top; y2 = rc.bottom; x1 = x2 = rc.right - w / 2; }
            page.drawLine({ start: { x: X(x1), y: Y(y1) }, end: { x: X(x2), y: Y(y2) }, thickness: t, color: c, dashArray: dash, lineCap: dash ? LineCapStyle.Butt : LineCapStyle.Projecting });
          }
        }
      }
      // gambar
      for (const im of sec.querySelectorAll("img")) {
        const rc = im.getBoundingClientRect();
        if (!rc.width || !rc.height || !inPage(rc) || !im.getAttribute("src")) continue;
        const img = await embedImg(im.currentSrc || im.src);
        if (!img) { stats.skippedImages++; continue; }
        stats.images++;
        page.drawImage(img, { x: X(rc.left), y: Y(rc.bottom), width: rc.width * k, height: rc.height * k });
      }
      // teks
      const range = document.createRange(), usedRes = new Set();
      const tw = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        const v = n.nodeValue;
        if (!v.trim() || !n.parentElement || n.parentElement.closest("style,script,svg")) continue;
        const pe = n.parentElement, cs = getComputedStyle(pe);
        if (cs.visibility === "hidden" || cs.display === "none") continue;
        const col = rgb(cs.color) || { r: 0, g: 0, b: 0, a: 1 };
        const bold = (parseInt(cs.fontWeight, 10) || 400) >= 600, italic = cs.fontStyle !== "normal";
        const key = pe.dataset.mpFont || familyKey(cs.fontFamily);
        const font = await pdfFont(key, bold, italic);
        const sizePx = parseFloat(cs.fontSize) || 14, sizePt = sizePx * fsk;
        const deco = cs.textDecorationLine || "";
        const re = /\S+/g; let m;
        while ((m = re.exec(v))) {
          range.setStart(n, m.index); range.setEnd(n, m.index + m[0].length);
          const rects = [...range.getClientRects()].filter((r) => r.width > 0);
          if (!rects.length) continue;
          const pieces = rects.length === 1 ? [{ text: m[0], rc: rects[0] }] : perChar(n, m.index, m[0], range);
          const trail = v[m.index + m[0].length] === " " || v[m.index + m[0].length] === " " ? " " : "";
          for (let pi = 0; pi < pieces.length; pi++) {
            const { text, rc } = pieces[pi];
            if (!inPage(rc)) continue;
            const t = text.replace(/ /g, " ") + (pi === pieces.length - 1 ? trail : "");
            const base = baseline(font, rc, sizePx);
            let drawn = false;
            if (font.ttf) {
              const hex = font.ttf.encode(t);
              if (hex !== null) {
                if (!usedRes.has(font.res)) { page.node.setFontDictionary(PDFName.of(font.res), font.ttf.ref); usedRes.add(font.res); }
                page.pushOperators(L.setFillingRgbColor(col.r, col.g, col.b), L.beginText(), L.setFontAndSize(font.res, sizePt), L.setTextMatrix(1, 0, 0, 1, X(rc.left), Y(base)), L.showText(PDFHexString.of(hex)), L.endText());
                drawn = true;
              }
            } else {
              try { page.drawText(t, { x: X(rc.left), y: Y(base), size: sizePt, font: font.pdf, color: RGB(col.r, col.g, col.b), opacity: col.a }); drawn = true; } catch (e) { drawn = false; }
            }
            if (!drawn) { await rasterWord(page, text, cs, rc, X, Y, k); stats.rasterWords++; }
            if (/underline|line-through/.test(deco)) {
              const th = Math.max(0.5, sizePt / 16), c = RGB(col.r, col.g, col.b);
              if (deco.includes("underline")) { const y = Y(base) - sizePt * 0.12; page.drawLine({ start: { x: X(rc.left), y }, end: { x: X(rc.right) + (trail ? spaceW(font, sizePt) : 0), y }, thickness: th, color: c }); }
              if (deco.includes("line-through")) { const y = Y(base) + sizePt * 0.28; page.drawLine({ start: { x: X(rc.left), y }, end: { x: X(rc.right), y }, thickness: th, color: c }); }
            }
          }
        }
      }
      // link yang bisa diklik
      for (const a of sec.querySelectorAll("a[href]")) {
        const href = a.getAttribute("href");
        if (!/^(https?:|mailto:)/i.test(href)) continue;
        for (const rc of a.getClientRects()) {
          if (!rc.width || !inPage(rc)) continue;
          const annot = doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [X(rc.left), Y(rc.bottom), X(rc.right), Y(rc.top)], Border: [0, 0, 0], A: { Type: "Action", S: "URI", URI: PDFString.of(href) } });
          const ref = doc.context.register(annot);
          let annots = page.node.lookup(PDFName.of("Annots"));
          if (!annots) { annots = doc.context.obj([]); page.node.set(PDFName.of("Annots"), annots); }
          annots.push(ref);
        }
      }
    }
  }
  function perChar(node, start, word, range) {
    const out = [];
    for (let i = 0; i < word.length; i++) {
      range.setStart(node, start + i); range.setEnd(node, start + i + 1);
      const rc = range.getClientRects()[0];
      if (rc && rc.width) {
        const last = out[out.length - 1];
        if (last && Math.abs(last.rc.top - rc.top) < 1) { last.text += word[i]; last.rc = new DOMRect(last.rc.left, last.rc.top, rc.right - last.rc.left, Math.max(last.rc.height, rc.height)); }
        else out.push({ text: word[i], rc });
      }
    }
    return out;
  }
  // garis dasar teks: kotak font (ascent–descent) dipusatkan di kotak yang dibuat browser
  function baseline(font, rc, sizePx) {
    let asc = 0.8, desc = -0.2;
    if (font.metrics) { const u = font.metrics.upm; asc = font.metrics.ascent / u; desc = font.metrics.descent / u; }
    const content = (asc - desc) * sizePx;
    return rc.top + (rc.height - content) / 2 + asc * sizePx;
  }
  function spaceW(font, sizePt) { try { return font.ttf ? font.ttf.width(" ", sizePt) : font.pdf.widthOfTextAtSize(" ", sizePt); } catch (e) { return sizePt * 0.25; } }
  // karakter yang tidak ada di font (emoji, huruf Jepang, …): digambar sebagai gambar kecil memakai font perangkat
  async function rasterWord(page, text, cs, rc, X, Y, k) {
    const scale = 4, c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(rc.width * scale)); c.height = Math.max(1, Math.ceil(rc.height * scale));
    const x = c.getContext("2d");
    x.scale(scale, scale); x.textBaseline = "alphabetic"; x.fillStyle = cs.color;
    x.font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily + ", sans-serif";
    const mt = x.measureText(text), asc = mt.fontBoundingBoxAscent || parseFloat(cs.fontSize) * 0.8, desc = mt.fontBoundingBoxDescent || parseFloat(cs.fontSize) * 0.2;
    x.fillText(text, 0, (rc.height - (asc + desc)) / 2 + asc);
    const img = await page.doc.embedPng(await canvasBytes(c, "image/png"));
    page.drawImage(img, { x: X(rc.left), y: Y(rc.bottom), width: rc.width * k, height: rc.height * k });
  }
  function dataBytes(src) { const b = atob(src.slice(src.indexOf(",") + 1)); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function canvasBytes(c, type) { return new Promise((res, rej) => c.toBlob((b) => (b ? b.arrayBuffer().then((a) => res(new Uint8Array(a))) : rej(new Error("encode"))), type)); }

  window.DocxToPdf = { render, convert, familyKey };
})();
