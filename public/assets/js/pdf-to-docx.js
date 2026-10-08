/* Mampat · mesin PDF → Word (.docx), semuanya di browser.
   1. pdf.js membaca setiap potongan teks: posisi, ukuran, dan nama font (tebal/miring)
   2. potongan disusun jadi baris → paragraf (rata kiri/tengah/kanan/rata kanan-kiri, indentasi, jarak)
   3. gambar diambil dari PDF dalam resolusi asli dan ditaruh di urutan yang sama
   4. halaman hasil scan (tanpa teks) dimasukkan sebagai gambar
   5. ditulis jadi .docx standar (ZIP berisi XML) dengan assets/js/zip-writer.js */
(function () {
  "use strict";
  const PT = 20, EMU = 12700; // 1 pt = 20 twip = 12700 EMU
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

  // ---------- nama font PDF → font Word ----------
  const FAMILY = [
    [/calibri/i, "Calibri"], [/cambria/i, "Cambria"], [/times|tinos|liberationserif/i, "Times New Roman"], [/arial|helvetica|arimo|liberationsans/i, "Arial"],
    [/courier|cousine|consolas|mono/i, "Courier New"], [/georgia/i, "Georgia"], [/verdana/i, "Verdana"], [/tahoma/i, "Tahoma"], [/garamond/i, "Garamond"],
    [/segoe/i, "Segoe UI"], [/carlito/i, "Calibri"], [/caladea/i, "Cambria"], [/bookman/i, "Bookman Old Style"], [/century/i, "Century Gothic"],
  ];
  function fontInfo(raw, fallbackFamily) {
    const name = String(raw || "").replace(/^[A-Z]{6}\+/, "");
    let family = null;
    for (const [re, f] of FAMILY) if (re.test(name)) { family = f; break; }
    if (!family) {
      const base = name.split(/[-,]/)[0].replace(/(PS)?MT$|PSMT$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
      family = base && base.length > 1 && !/^(F\d+|T\d|TT\d)/.test(base) ? base : fallbackFamily === "serif" ? "Times New Roman" : fallbackFamily === "monospace" ? "Courier New" : "Calibri";
    }
    return { family, bold: /bold|black|heavy|semibold|demi|,b(old)?$/i.test(name), italic: /italic|oblique|,i(talic)?$/i.test(name) };
  }

  // ---------- baca satu halaman ----------
  async function readPage(page, opts) {
    const vp = page.getViewport({ scale: 1 });
    const W = vp.width, H = vp.height, U = window.pdfjsLib.Util;
    const ops = await page.getOperatorList();
    const tc = await page.getTextContent();
    const items = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.length) continue;
      const t = U.transform(vp.transform, it.transform);
      const size = Math.hypot(t[2], t[3]) || Math.hypot(t[0], t[1]);
      if (size < 1) continue;
      if (Math.abs(t[1]) > 0.2 * size || Math.abs(t[2]) > 0.2 * size) continue; // teks miring/vertikal dilewati
      let font = null; try { font = page.commonObjs.has(it.fontName) ? page.commonObjs.get(it.fontName) : null; } catch (e) { font = null; }
      const st = tc.styles[it.fontName] || {};
      const fi = fontInfo(font && (font.name || font.loadedName), st.fontFamily);
      if (font && font.bold) fi.bold = true;
      if (font && font.italic) fi.italic = true;
      const w = it.width * (vp.scale || 1);
      items.push({ str: it.str, x: t[4], y: t[5], w, size, ...fi, eol: it.hasEOL });
    }
    // gambar: lacak matriks (CTM) di daftar operasi
    const OPS = window.pdfjsLib.OPS, imgs = [];
    let ctm = [1, 0, 0, 1, 0, 0]; const stack = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], a = ops.argsArray[i];
      if (fn === OPS.save) stack.push(ctm.slice());
      else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.transform) ctm = U.transform(ctm, a);
      else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintJpegXObject) {
        const m = U.transform(vp.transform, ctm);
        const xs = [m[4], m[0] + m[4], m[2] + m[4], m[0] + m[2] + m[4]], ys = [m[5], m[1] + m[5], m[3] + m[5], m[1] + m[3] + m[5]];
        const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
        if (box.w < 18 || box.h < 18) continue;
        imgs.push({ id: fn === OPS.paintInlineImageXObject ? null : a[0], inline: fn === OPS.paintInlineImageXObject ? a[0] : null, m, box });
      }
    }
    // link: anotasi URL di halaman
    const links = [];
    try {
      for (const an of await page.getAnnotations()) {
        if (an.subtype !== "Link" || !an.url) continue;
        const r = vp.convertToViewportRectangle(an.rect);
        links.push({ url: an.url, x0: Math.min(r[0], r[2]), x1: Math.max(r[0], r[2]), y0: Math.min(r[1], r[3]), y1: Math.max(r[1], r[3]) });
      }
    } catch (e) {}
    const pix = opts.colors !== false && items.length ? await renderPixels(page) : null;
    return { W, H, items: splitItems(items, links, pix), imgs, page };
  }

  // satu potongan teks bisa berisi beberapa warna atau sebagian link ("Rujukan: <link>"):
  // posisi tiap huruf diperkirakan dari lebar huruf, lalu warna & link dicek per huruf
  const measureCtx = document.createElement("canvas").getContext("2d");
  function charEdges(it) {
    const generic = /Times|Cambria|Georgia|Garamond|Bookman|Serif/i.test(it.family) ? "serif" : /Courier|Mono/i.test(it.family) ? "monospace" : "sans-serif";
    measureCtx.font = (it.italic ? "italic " : "") + (it.bold ? "bold " : "") + "100px " + generic;
    const chars = [...it.str], edges = [0];
    let acc = 0; for (const ch of chars) { acc += measureCtx.measureText(ch).width || 50; edges.push(acc); }
    const k = acc ? it.w / acc : 0;
    return { chars, edges: edges.map((e) => it.x + e * k) };
  }
  function splitItems(items, links, pix) {
    if (!links.length && !pix) return items;
    const out = [];
    for (const it of items) {
      if (!it.str.trim()) { out.push(it); continue; }
      const { chars, edges } = charEdges(it);
      const bg = pix ? bgColor(pix, it.x, it.x + it.w, it.y - it.size * 0.75, it.y) : null;
      const info = chars.map((ch, i) => {
        if (/\s/.test(ch)) return null;
        const cx = (edges[i] + edges[i + 1]) / 2, cy = it.y - it.size * 0.3;
        const l = links.find((k) => cx >= k.x0 && cx <= k.x1 && cy >= k.y0 - 2 && cy <= k.y1 + 2);
        return { url: l ? l.url : undefined, color: pix ? inkColor(pix, edges[i], edges[i + 1], it.y - it.size * 0.75, it.y, bg) : undefined };
      });
      // warna & link ditentukan per kata (suara terbanyak hurufnya): perkiraan posisi huruf bisa meleset sedikit di ujung kata
      for (let i = 0; i < chars.length;) {
        if (!info[i]) { i++; continue; }
        // kata = deretan huruf/angka; tanda baca dihitung terpisah (koma setelah kata berwarna tetap warnanya sendiri)
        const isWord = (ch) => /[\p{L}\p{N}]/u.test(ch), cls = isWord(chars[i]);
        let j = i; while (j < chars.length && info[j] && isWord(chars[j]) === cls) j++;
        const vote = (key) => { const n = new Map(); for (let k = i; k < j; k++) n.set(info[k][key], (n.get(info[k][key]) || 0) + 1); return [...n].sort((x, y) => y[1] - x[1])[0][0]; };
        const color = vote("color"), url = vote("url");
        for (let k = i; k < j; k++) info[k] = { color, url };
        i = j;
      }
      // spasi ikut gaya huruf sebelumnya
      for (let i = 0; i < info.length; i++) if (!info[i]) info[i] = info[i - 1] || info.slice(i).find(Boolean) || {};
      let start = 0;
      for (let i = 1; i <= chars.length; i++) {
        if (i < chars.length && info[i].url === info[start].url && info[i].color === info[start].color) continue;
        out.push({ ...it, str: chars.slice(start, i).join(""), x: edges[start], w: edges[i] - edges[start], url: info[start].url, color: info[start].color });
        start = i;
      }
    }
    return out;
  }

  // warna teks: pdf.js tidak memberi warna, jadi diambil dari piksel halaman yang dirender
  async function renderPixels(page) {
    const s = 2, v2 = page.getViewport({ scale: s });
    const c = document.createElement("canvas"); c.width = Math.ceil(v2.width); c.height = Math.ceil(v2.height);
    const x = c.getContext("2d", { willReadFrequently: true }); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: x, viewport: v2 }).promise;
    const pix = { data: x.getImageData(0, 0, c.width, c.height).data, W: c.width, H: c.height, s };
    c.width = c.height = 0;
    return pix;
  }
  function box(p, x0, x1, y0, y1) { return [Math.max(0, Math.floor(x0 * p.s)), Math.min(p.W - 1, Math.ceil(x1 * p.s)), Math.max(0, Math.floor(y0 * p.s)), Math.min(p.H - 1, Math.ceil(y1 * p.s))]; }
  // latar = warna terbanyak di kotak teks (sampel tiap 2 piksel, 4096 kotak warna)
  const hist = new Uint32Array(4096);
  function bgColor(p, x0, x1, y0, y1) {
    const [a, b, c, d] = box(p, x0, x1, y0, y1);
    hist.fill(0);
    let bk = 0xFFF, bn = 0;
    for (let yy = c; yy <= d; yy += 2) for (let xx = a; xx <= b; xx += 2) {
      const i = (yy * p.W + xx) * 4, k = (p.data[i] >> 4) << 8 | (p.data[i + 1] >> 4) << 4 | (p.data[i + 2] >> 4), n = ++hist[k];
      if (n > bn) { bn = n; bk = k; }
    }
    return [((bk >> 8) & 15) * 17, ((bk >> 4) & 15) * 17, (bk & 15) * 17];
  }
  // tinta = piksel yang paling jauh dari latar; abu-abu gelap = hitam yang tepinya halus → tanpa warna (otomatis)
  function inkColor(p, x0, x1, y0, y1, bg) {
    const [a, b, c, d] = box(p, x0, x1, y0, y1);
    let best = null, bestD = 0;
    for (let yy = c; yy <= d; yy++) for (let xx = a; xx <= b; xx++) {
      const i = (yy * p.W + xx) * 4, dd = Math.abs(p.data[i] - bg[0]) + Math.abs(p.data[i + 1] - bg[1]) + Math.abs(p.data[i + 2] - bg[2]);
      if (dd > bestD) { bestD = dd; best = [p.data[i], p.data[i + 1], p.data[i + 2]]; }
    }
    if (!best || bestD < 60) return undefined;
    // warna netral (hitam/abu-abu, termasuk garis tabel tipis) → otomatis (hitam)
    const sat = Math.max(...best) - Math.min(...best);
    return sat > 36 ? best.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase() : undefined;
  }

  // gambar asli → PNG/JPEG (arah mengikuti matriks di PDF)
  async function imageBytes(pg, im, maxSide) {
    let obj = im.inline;
    // gambar yang dipakai di banyak halaman disimpan pdf.js di commonObjs (id "g_…"); batas waktu supaya tidak pernah macet
    if (!obj) {
      const store = /^g_/.test(im.id) ? pg.page.commonObjs : pg.page.objs;
      obj = await Promise.race([
        new Promise((res) => { try { if (store.has(im.id)) res(store.get(im.id)); else store.get(im.id, res); } catch (e) { res(null); } }),
        new Promise((res) => setTimeout(() => res(null), 4000)),
      ]);
    }
    if (!obj) return null;
    const iw = obj.width, ih = obj.height;
    let src;
    if (obj.bitmap) src = obj.bitmap;
    else if (obj.data) {
      const c = document.createElement("canvas"); c.width = iw; c.height = ih;
      const x = c.getContext("2d"), id = x.createImageData(iw, ih), d = obj.data;
      if (obj.kind === 3) id.data.set(d.subarray(0, iw * ih * 4));
      else if (obj.kind === 2) { for (let i = 0, j = 0; i < iw * ih; i++) { id.data[j++] = d[i * 3]; id.data[j++] = d[i * 3 + 1]; id.data[j++] = d[i * 3 + 2]; id.data[j++] = 255; } }
      else if (obj.kind === 1) { const rb = (iw + 7) >> 3; for (let yy = 0; yy < ih; yy++) for (let xx = 0; xx < iw; xx++) { const bit = (d[yy * rb + (xx >> 3)] >> (7 - (xx & 7))) & 1, v = bit ? 255 : 0, j = (yy * iw + xx) * 4; id.data[j] = id.data[j + 1] = id.data[j + 2] = v; id.data[j + 3] = 255; } }
      else return null;
      x.putImageData(id, 0, 0); src = c;
    } else return null;
    // kanvas seukuran kotak gambar di halaman (resolusi asli, maksimal maxSide)
    const sc = Math.min(maxSide / Math.max(im.box.w, im.box.h), Math.max(iw / im.box.w, ih / im.box.h, 1));
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(im.box.w * sc)); c.height = Math.max(1, Math.round(im.box.h * sc));
    const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
    x.setTransform(sc, 0, 0, sc, -im.box.x * sc, -im.box.y * sc);
    x.transform(im.m[0], im.m[1], im.m[2], im.m[3], im.m[4], im.m[5]);
    x.translate(0, 1); x.scale(1 / iw, -1 / ih);
    x.drawImage(src, 0, 0);
    const jpg = obj.kind !== 1 && iw * ih > 250000;
    const blob = await new Promise((r) => c.toBlob(r, jpg ? "image/jpeg" : "image/png", 0.9));
    if (!blob) return null;
    return { data: new Uint8Array(await blob.arrayBuffer()), ext: jpg ? "jpeg" : "png", w: im.box.w, h: im.box.h };
  }
  // halaman scan: seluruh halaman sebagai gambar
  async function pageImage(pg, dpi) {
    const vp = pg.page.getViewport({ scale: dpi / 72 });
    const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
    await pg.page.render({ canvasContext: x, viewport: vp }).promise;
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
    c.width = c.height = 0;
    return { data: new Uint8Array(await blob.arrayBuffer()), ext: "jpeg", w: pg.W, h: pg.H };
  }

  // ---------- potongan → baris → paragraf ----------
  function lines(items) {
    // kelompokkan per garis dasar: kata miring, huruf besar, dan subscript tetap di baris yang sama
    const sorted = items.slice().sort((a, b) => a.y - b.y || a.x - b.x), out = [];
    for (const it of sorted) {
      const ln = out.find((l) => Math.abs(l.base - it.y) < Math.max(l.size, it.size) * 0.45);
      if (ln) { ln.items.push(it); if (it.size > ln.size) { ln.size = it.size; ln.base = it.y; } }
      else out.push({ base: it.y, size: it.size, items: [it] });
    }
    out.sort((a, b) => a.base - b.base);
    for (const l of out) {
      l.items.sort((a, b) => a.x - b.x);
      // potongan ganda (teks tebal palsu yang ditulis dua kali) dibuang
      l.items = l.items.filter((it, i, arr) => !(i && arr[i - 1].str === it.str && Math.abs(arr[i - 1].x - it.x) < it.size * 0.2));
      l.y = l.base; l.x0 = l.items[0].x; l.x1 = Math.max(...l.items.map((it) => it.x + it.w));
      // subscript / superscript: lebih kecil dan bergeser dari garis dasar
      for (const it of l.items) if (it.size < l.size * 0.85) { const dy = it.y - l.base; if (dy > l.size * 0.08) it.va = "subscript"; else if (dy < -l.size * 0.15) it.va = "superscript"; }
      const runs = []; let prev = null;
      l.tabs = [];
      // pdf.js mengisi jarak antar kolom dengan potongan "spasi" yang lebar: jadikan penanda tab
      const tabGap = Math.max(l.size * 1.6, 14);
      let pendTab = false, pendSpace = false;
      const words = [];
      for (const it of l.items) {
        if (!it.str.trim()) { if (it.w > tabGap) pendTab = true; else pendSpace = true; continue; }
        words.push({ ...it, tabBefore: pendTab, spaceBefore: pendSpace }); pendTab = pendSpace = false;
      }
      l.items = words;
      if (!words.length) { l.runs = []; l.text = ""; continue; }
      l.x0 = words[0].x; l.x1 = Math.max(...words.map((it) => it.x + it.w));
      for (const it of l.items) {
        let str = it.str;
        if (prev) {
          const gap = it.x - (prev.x + prev.w);
          // jarak lebar (kolom tabel, nilai di kanan) → tab, supaya kolom tetap sejajar di Word
          if (it.tabBefore || gap > tabGap) { runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, ""); str = "\t" + str.replace(/^\s+/, ""); l.tabs.push(it.x); }
          else if ((it.spaceBefore || gap > it.size * 0.18) && !/\s$/.test(runs[runs.length - 1].text) && !/^\s/.test(str)) str = " " + str;
        }
        const last = runs[runs.length - 1];
        if (last && sameStyle(last, it)) last.text += str;
        else runs.push({ text: str, bold: it.bold, italic: it.italic, family: it.family, size: it.va ? l.size : it.size, color: it.color, url: it.url, va: it.va });
        prev = it;
      }
      l.runs = runs; l.text = runs.map((r) => r.text).join("");
    }
    return out.filter((l) => l.text.trim());
  }
  const sameStyle = (a, b) => a.bold === b.bold && a.italic === b.italic && a.family === b.family && Math.abs(a.size - (b.va ? a.size : b.size)) < 0.6 && a.color === b.color && a.url === b.url && a.va === b.va;
  const LIST = /^\s*([•●▪◦‣\-–—*]|\(?\d{1,3}[.)]|\(?[a-zA-Z][.)]|[ivxIVX]{1,4}[.)])\s/;
  function paragraphs(ls, marginL, marginR) {
    const paras = [];
    let cur = null;
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i], prev = ls[i - 1];
      let start = !cur;
      if (cur && prev) {
        const gap = l.y - prev.y, sz = Math.max(l.size, prev.size);
        const prevShort = prev.x1 < marginR - sz * 3 && cur.lines.length >= 1;
        if (gap > sz * 1.65 || gap < sz * 0.5) start = true;
        else if (Math.abs(l.size - prev.size) > 1.2) start = true;
        else if (LIST.test(l.text)) start = true;
        else if (prevShort && !(cur.lines.length === 1 && l.x0 < prev.x0 - sz)) start = true;
        else if (Math.abs(l.x0 - cur.left) > sz * 1.2 && !(cur.lines.length === 1 && l.x0 < prev.x0)) start = true;
      }
      if (start) { cur = { lines: [], left: l.x0, firstX: l.x0, gapBefore: prev ? l.y - prev.y : null, size: l.size }; paras.push(cur); }
      else cur.left = Math.min(cur.left, l.x0);
      cur.lines.push(l);
    }
    for (const p of paras) {
      const ls2 = p.lines, sz = p.size;
      const lefts = ls2.map((l) => l.x0 - marginL), rights = ls2.map((l) => marginR - l.x1);
      const centered = ls2.every((l, i) => Math.abs(lefts[i] - rights[i]) < sz * 1.2 && lefts[i] > sz * 2);
      const right = ls2.every((l, i) => rights[i] < sz * 0.8 && lefts[i] > sz * 4);
      const justified = ls2.length > 1 && ls2.slice(0, -1).every((l, i) => rights[i] < sz * 1.2);
      p.align = centered ? "center" : right ? "right" : justified ? "both" : "left";
      p.indent = p.align === "left" || p.align === "both" ? Math.max(0, p.left - marginL) : 0;
      p.firstLine = p.align === "left" || p.align === "both" ? p.firstX - p.left : 0;
      const gaps = []; for (let i = 1; i < ls2.length; i++) gaps.push(ls2[i].y - ls2[i - 1].y);
      p.lineGap = gaps.length ? gaps.sort((a, b) => a - b)[gaps.length >> 1] : sz * 1.2;
      // gabungkan baris: kata terpotong tanda hubung di akhir baris disambung
      const runs = [];
      ls2.forEach((l, i) => {
        l.runs.forEach((r, j) => {
          let text = r.text;
          if (i > 0 && j === 0) { const last = runs[runs.length - 1]; if (last && /[A-Za-z]-$/.test(last.text) && /^[a-z]/.test(text)) last.text = last.text.slice(0, -1); else text = (last && /\s$/.test(last.text) ? "" : " ") + text.replace(/^\s+/, ""); }
          const last = runs[runs.length - 1];
          if (last && sameStyle(last, r)) last.text += text;
          else runs.push({ ...r, text });
        });
      });
      p.runs = runs;
      p.tabs = [...new Set(ls2.flatMap((l) => l.tabs || []).map((x) => Math.round(x - marginL)))].filter((x) => x > 0).sort((a, b) => a - b);
    }
    return paras;
  }

  // ---------- tulis .docx ----------
  function runXml(r, linkRid) {
    const sz = Math.max(2, Math.round(r.size * 2));
    const color = r.color || (linkRid ? "0563C1" : null);
    const rpr = '<w:rPr><w:rFonts w:ascii="' + esc(r.family) + '" w:hAnsi="' + esc(r.family) + '" w:cs="' + esc(r.family) + '"/>' + (r.bold ? "<w:b/>" : "") + (r.italic ? "<w:i/>" : "") +
      (color ? '<w:color w:val="' + color + '"/>' : "") + '<w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz + '"/>' + (linkRid ? '<w:u w:val="single"/>' : "") + (r.va ? '<w:vertAlign w:val="' + r.va + '"/>' : "") + "</w:rPr>";
    const xml = r.text.split("\t").map((t, i) => (i ? "<w:r>" + rpr + "<w:tab/></w:r>" : "") + (t ? "<w:r>" + rpr + '<w:t xml:space="preserve">' + esc(t) + "</w:t></w:r>" : "")).join("");
    return linkRid ? '<w:hyperlink r:id="' + linkRid + '">' + xml + "</w:hyperlink>" : xml;
  }
  function paraXml(p, linkRid, breakBefore) {
    const before = p.gapBefore == null ? 0 : Math.max(0, Math.round((p.gapBefore - p.lineGap) * PT));
    const line = Math.round(Math.min(480, Math.max(200, (240 * p.lineGap) / (p.size * 1.17))));
    const ind = p.indent || p.firstLine ? '<w:ind w:left="' + Math.round(p.indent * PT) + '"' + (p.firstLine > 0 ? ' w:firstLine="' + Math.round(p.firstLine * PT) + '"' : p.firstLine < 0 ? ' w:hanging="' + Math.round(-p.firstLine * PT) + '"' : "") + "/>" : "";
    const tabs = p.tabs && p.tabs.length ? "<w:tabs>" + p.tabs.map((x) => '<w:tab w:val="left" w:pos="' + Math.round(x * PT) + '"/>').join("") + "</w:tabs>" : "";
    return '<w:p><w:pPr>' + (breakBefore ? "<w:pageBreakBefore/>" : "") + tabs + '<w:spacing w:before="' + (breakBefore ? 0 : Math.min(before, 1440)) + '" w:after="0" w:line="' + line + '" w:lineRule="auto"/>' + ind + (p.align !== "left" ? '<w:jc w:val="' + p.align + '"/>' : "") + "</w:pPr>" + p.runs.map((r) => runXml(r, r.url ? linkRid(r.url) : null)).join("") + "</w:p>";
  }
  function imageXml(rid, n, wPt, hPt, align, maxW, breakBefore) {
    const s = Math.min(1, maxW / wPt), cx = Math.round(wPt * s * EMU), cy = Math.round(hPt * s * EMU);
    return '<w:p><w:pPr>' + (breakBefore ? "<w:pageBreakBefore/>" : "") + '<w:spacing w:before="120" w:after="120"/>' + (align !== "left" ? '<w:jc w:val="' + align + '"/>' : "") + "</w:pPr><w:r><w:drawing>" +
      '<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:docPr id="' + n + '" name="Gambar ' + n + '"/>' +
      '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic><pic:nvPicPr><pic:cNvPr id="' + n + '" name="gambar' + n + '"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  }

  async function convert(pdf, opts, onProg, isCancelled) {
    opts = opts || {};
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      if (isCancelled && isCancelled()) throw new Error("cancelled");
      onProg && onProg((i - 1) / pdf.numPages * 0.5, "Membaca halaman " + i + " dari " + pdf.numPages);
      pages.push(await readPage(await pdf.getPage(i), opts));
    }
    // margin dokumen dari teks semua halaman
    const first = pages[0], all = pages.flatMap((p) => p.items.map((it) => ({ ...it, W: p.W })));
    const pct = (arr, q) => { const s = arr.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 72; };
    const marginL = Math.min(144, Math.max(28, pct(all.map((it) => it.x), 0.03) || 72));
    const marginR = Math.max(first.W - 144, Math.min(first.W - 28, pct(all.map((it) => it.x + it.w), 0.97) || first.W - 72));
    const marginT = 56, maxImgW = first.W - marginL - (first.W - marginR);
    const media = [], body = [], stats = { pages: pages.length, scanned: 0, images: 0, paragraphs: 0, links: 0 };
    const linkMap = new Map();
    const linkRid = (url) => { if (!linkMap.has(url)) { linkMap.set(url, "rIdLink" + (linkMap.size + 1)); stats.links++; } return linkMap.get(url); };
    let imgN = 0;
    for (let pi = 0; pi < pages.length; pi++) {
      if (isCancelled && isCancelled()) throw new Error("cancelled");
      onProg && onProg(0.5 + pi / pages.length * 0.45, "Menyusun halaman " + (pi + 1) + " dari " + pages.length);
      const pg = pages[pi];
      const chars = pg.items.reduce((s, it) => s + it.str.trim().length, 0);
      const bigImg = pg.imgs.some((im) => im.box.w * im.box.h > pg.W * pg.H * 0.5);
      const blocks = [];
      if ((bigImg && chars < 30) || chars === 0) {
        // halaman scan (gambar besar tanpa teks) atau halaman tanpa teks sama sekali (misalnya grafik)
        const im = await pageImage(pg, 150);
        if (bigImg) stats.scanned++; else stats.graphicPages = (stats.graphicPages || 0) + 1;
        blocks.push({ y: 0, img: im, align: "center", full: true });
      } else {
        const ls = lines(pg.items);
        for (const p of paragraphs(ls, marginL, marginR)) blocks.push({ y: p.lines[0].y - p.size, para: p });
        for (const im of pg.imgs) {
          const b = await imageBytes(pg, im, 1600).catch(() => null);
          if (!b) continue;
          const cx = im.box.x + im.box.w / 2, align = Math.abs(cx - pg.W / 2) < pg.W * 0.08 ? "center" : im.box.x > pg.W * 0.5 ? "right" : "left";
          blocks.push({ y: im.box.y, img: b, align });
        }
      }
      blocks.sort((a, b) => a.y - b.y);
      // halaman baru: paragraf pertama diberi "mulai di halaman baru" (tanpa paragraf kosong tambahan)
      blocks.forEach((bl, bi) => {
        const brk = bi === 0 && pi > 0 && opts.pageBreaks !== false;
        if (bl.para) {
          body.push(paraXml(bl.para, linkRid, brk)); stats.paragraphs++;
        } else {
          imgN++; stats.images++;
          const name = "image" + imgN + "." + bl.img.ext, rid = "rIdImg" + imgN;
          media.push({ name, data: bl.img.data, rid });
          body.push(imageXml(rid, imgN, bl.img.w, bl.img.h, bl.align, maxImgW, brk));
        }
      });
    }
    onProg && onProg(0.97, "Membuat file Word…");
    const tw = (v) => Math.round(v * PT);
    const sect = '<w:sectPr><w:pgSz w:w="' + tw(first.W) + '" w:h="' + tw(first.H) + '"' + (first.W > first.H ? ' w:orient="landscape"' : "") + '/><w:pgMar w:top="' + tw(marginT) + '" w:right="' + tw(first.W - marginR) + '" w:bottom="' + tw(marginT) + '" w:left="' + tw(marginL) + '" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
    const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ' + NS + "><w:body>" + (body.join("") || "<w:p/>") + sect + "</w:body></w:document>";
    const stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="id-ID"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>';
    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      media.map((m) => '<Relationship Id="' + m.rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + m.name + '"/>').join("") +
      [...linkMap].map(([url, rid]) => '<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="' + esc(url) + '" TargetMode="External"/>').join("") + "</Relationships>";
    const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + esc(opts.title || "") + '</dc:title><dc:creator>Mampat</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + now + "</dcterms:modified></cp:coreProperties>";
    const app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Mampat · PDF ke Word</Application></Properties>';
    const types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
    const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
    const enc = new TextEncoder();
    const files = [
      { name: "[Content_Types].xml", data: enc.encode(types) }, { name: "_rels/.rels", data: enc.encode(rootRels) },
      { name: "docProps/core.xml", data: enc.encode(core) }, { name: "docProps/app.xml", data: enc.encode(app) },
      { name: "word/document.xml", data: enc.encode(documentXml) }, { name: "word/styles.xml", data: enc.encode(stylesXml) },
      { name: "word/_rels/document.xml.rels", data: enc.encode(rels) },
      ...media.map((m) => ({ name: "word/media/" + m.name, data: m.data })),
    ];
    const blob = window.ZipWriter.zip(files);
    return { blob: new Blob([blob], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), stats };
  }
  window.PdfToDocx = { convert, fontInfo };
})();
