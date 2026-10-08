/* Mampat · pemotong font TrueType kecil untuk PDF.
   Membaca TTF (glyf), menyimpan hanya bentuk huruf yang dipakai (nomor glyph tetap sama),
   lalu menanamnya ke PDF sebagai font CID Identity-H + peta Unicode (teks bisa dipilih & dicari).
   Dipakai karena fontkit bawaan pdf-lib gagal membaca beberapa font modern (Carlito, Arimo). */
(function (root) {
  "use strict";
  function parse(bytes) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tag = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
    const n = v.getUint16(4), tables = {};
    for (let i = 0; i < n; i++) { const o = 12 + i * 16; tables[tag(o)] = { off: v.getUint32(o + 8), len: v.getUint32(o + 12) }; }
    if (!tables.glyf || !tables.loca || !tables.cmap) throw new Error("font bukan TrueType (glyf)");
    const T = (t) => tables[t].off;
    const upm = v.getUint16(T("head") + 18), locFmt = v.getInt16(T("head") + 50);
    const bbox = [v.getInt16(T("head") + 36), v.getInt16(T("head") + 38), v.getInt16(T("head") + 40), v.getInt16(T("head") + 42)];
    const numGlyphs = v.getUint16(T("maxp") + 4), numH = v.getUint16(T("hhea") + 34);
    const ascent = v.getInt16(T("hhea") + 4), descent = v.getInt16(T("hhea") + 6);
    let capHeight = ascent * 0.7, italicAngle = 0, flagsItalic = false;
    if (tables["OS/2"]) { const o = T("OS/2"), ver = v.getUint16(o); if (ver >= 2 && tables["OS/2"].len >= 90) capHeight = v.getInt16(o + 88); flagsItalic = !!(v.getUint16(o + 62) & 1); }
    if (tables.post) italicAngle = v.getInt32(T("post") + 4) / 65536;
    const loca = (g) => (locFmt === 0 ? v.getUint16(T("loca") + g * 2) * 2 : v.getUint32(T("loca") + g * 4));
    const adv = (g) => v.getUint16(T("hmtx") + Math.min(g, numH - 1) * 4);
    // cmap: Unicode → glyph (format 12 atau 4)
    const cm = T("cmap"), nsub = v.getUint16(cm + 2);
    let sub12 = null, sub4 = null;
    for (let i = 0; i < nsub; i++) {
      const pid = v.getUint16(cm + 4 + i * 8), eid = v.getUint16(cm + 6 + i * 8), so = cm + v.getUint32(cm + 8 + i * 8), fmt = v.getUint16(so);
      if (fmt === 12 && (pid === 3 || pid === 0)) sub12 = so;
      if (fmt === 4 && ((pid === 3 && eid === 1) || pid === 0)) sub4 = so;
    }
    function glyphOf(cp) {
      if (sub12 != null) {
        const ng = v.getUint32(sub12 + 12);
        let lo = 0, hi = ng - 1;
        while (lo <= hi) { const mid = (lo + hi) >> 1, g = sub12 + 16 + mid * 12, s = v.getUint32(g), e = v.getUint32(g + 4);
          if (cp < s) hi = mid - 1; else if (cp > e) lo = mid + 1; else return v.getUint32(g + 8) + (cp - s); }
        return 0;
      }
      if (sub4 == null || cp > 0xFFFF) return 0;
      const segX2 = v.getUint16(sub4 + 6), ends = sub4 + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
      for (let i = 0; i < segX2 / 2; i++) {
        if (cp > v.getUint16(ends + i * 2)) continue;
        const s = v.getUint16(starts + i * 2); if (cp < s) return 0;
        const d = v.getInt16(deltas + i * 2), ro = v.getUint16(ranges + i * 2);
        if (!ro) return (cp + d) & 0xFFFF;
        const gi = v.getUint16(ranges + i * 2 + ro + (cp - s) * 2);
        return gi ? (gi + d) & 0xFFFF : 0;
      }
      return 0;
    }
    let name = "Font";
    if (tables.name) { // nama PostScript (id 6)
      const o = T("name"), cnt = v.getUint16(o + 2), so = o + v.getUint16(o + 4);
      for (let i = 0; i < cnt; i++) {
        const r = o + 6 + i * 12, pid = v.getUint16(r), nid = v.getUint16(r + 6), len = v.getUint16(r + 8), off = v.getUint16(r + 10);
        if (nid !== 6) continue;
        let s = ""; if (pid === 3 || pid === 0) for (let k = 0; k < len; k += 2) s += String.fromCharCode(v.getUint16(so + off + k)); else for (let k = 0; k < len; k++) s += String.fromCharCode(bytes[so + off + k]);
        if (s) { name = s.replace(/[^A-Za-z0-9-]/g, ""); break; }
      }
    }
    return { bytes, v, tables, upm, bbox, numGlyphs, ascent, descent, capHeight, italicAngle, italic: flagsItalic || italicAngle !== 0, name, loca, adv, glyphOf };
  }
  // komponen glyph gabungan (misalnya é = e + ´)
  function components(f, g) {
    const { v, tables } = f, s = tables.glyf.off + f.loca(g), e = tables.glyf.off + f.loca(g + 1), out = [];
    if (e - s < 10 || v.getInt16(s) >= 0) return out;
    let p = s + 10, flags;
    do {
      flags = v.getUint16(p); out.push(v.getUint16(p + 2)); p += 4;
      p += flags & 1 ? 4 : 2;
      if (flags & 8) p += 2; else if (flags & 0x40) p += 4; else if (flags & 0x80) p += 8;
    } while (flags & 0x20);
    return out;
  }
  const pad4 = (n) => (n + 3) & ~3;
  function checksum(b, off, len) { let s = 0; const v = new DataView(b.buffer, b.byteOffset); for (let i = 0; i < len; i += 4) s = (s + v.getUint32(off + i)) >>> 0; return s; }
  // file font baru: glyph yang tidak dipakai dikosongkan, nomor glyph tidak berubah
  function subset(f, used) {
    const keep = new Set([0, ...used]), stack = [...keep];
    while (stack.length) for (const c of components(f, stack.pop())) if (!keep.has(c) && c < f.numGlyphs) { keep.add(c); stack.push(c); }
    const glyfParts = [], loca = new Uint32Array(f.numGlyphs + 1);
    let pos = 0;
    for (let g = 0; g < f.numGlyphs; g++) {
      loca[g] = pos;
      if (!keep.has(g)) continue;
      const s = f.tables.glyf.off + f.loca(g), e = f.tables.glyf.off + f.loca(g + 1);
      if (e > s) { const len = pad4(e - s), part = new Uint8Array(len); part.set(f.bytes.subarray(s, e)); glyfParts.push(part); pos += len; }
    }
    loca[f.numGlyphs] = pos;
    const glyf = new Uint8Array(pos); let o = 0; for (const p of glyfParts) { glyf.set(p, o); o += p.length; }
    const locaB = new Uint8Array((f.numGlyphs + 1) * 4), lv = new DataView(locaB.buffer); loca.forEach((x, i) => lv.setUint32(i * 4, x));
    const copy = (t) => f.bytes.slice(f.tables[t].off, f.tables[t].off + f.tables[t].len);
    const head = copy("head"); new DataView(head.buffer).setUint32(8, 0); new DataView(head.buffer).setInt16(50, 1);
    const out = { cmap: copy("cmap"), glyf, head, hhea: copy("hhea"), hmtx: copy("hmtx"), loca: locaB, maxp: copy("maxp") };
    for (const t of ["OS/2", "cvt ", "fpgm", "prep", "name"]) if (f.tables[t]) out[t] = copy(t);
    if (f.tables.post) { const p = f.bytes.slice(f.tables.post.off, f.tables.post.off + 32); new DataView(p.buffer).setUint32(0, 0x00030000); out.post = p; }
    const tags = Object.keys(out).sort(), nt = tags.length;
    let size = 12 + nt * 16; tags.forEach((t) => { size += pad4(out[t].length); });
    const font = new Uint8Array(size), fv = new DataView(font.buffer);
    const es = Math.floor(Math.log2(nt)), sr = Math.pow(2, es) * 16;
    fv.setUint32(0, 0x00010000); fv.setUint16(4, nt); fv.setUint16(6, sr); fv.setUint16(8, es); fv.setUint16(10, nt * 16 - sr);
    let off = 12 + nt * 16, headOff = 0;
    tags.forEach((t, i) => {
      const d = 12 + i * 16, data = out[t];
      for (let k = 0; k < 4; k++) font[d + k] = t.charCodeAt(k);
      font.set(data, off);
      fv.setUint32(d + 4, checksum(font, off, pad4(data.length))); fv.setUint32(d + 8, off); fv.setUint32(d + 12, data.length);
      if (t === "head") headOff = off;
      off += pad4(data.length);
    });
    fv.setUint32(headOff + 8, (0xB1B0AFBA - checksum(font, 0, font.length)) >>> 0);
    return font;
  }

  // ---------- font PDF (dipakai bersama pdf-lib) ----------
  let tagSeq = 0;
  function pdfFont(doc, bytes) {
    const f = parse(bytes);
    const used = new Map(); // gid → teks Unicode
    const ref = doc.context.nextRef();
    const tagName = "MP" + String.fromCharCode(65 + (tagSeq % 26)) + String.fromCharCode(65 + (Math.floor(tagSeq / 26) % 26)) + "AA+" + f.name; tagSeq++;
    return {
      ref, metrics: f,
      has: (cp) => f.glyphOf(cp) !== 0,
      // teks → hex glyph untuk operator Tj; null kalau ada huruf yang tidak tersedia
      encode(text) {
        let hex = "";
        for (const ch of text) {
          const cp = ch.codePointAt(0), g = f.glyphOf(cp === 0xA0 ? 32 : cp);
          if (!g && !/\s/.test(ch)) return null;
          if (!used.has(g)) used.set(g, ch);
          hex += g.toString(16).padStart(4, "0");
        }
        return hex;
      },
      width(text, size) { let w = 0; for (const ch of text) w += f.adv(f.glyphOf(ch.codePointAt(0))); return (w / f.upm) * size; },
      finish() {
        const { PDFName, PDFString, PDFArray, PDFNumber } = root.PDFLib, ctx = doc.context;
        const gids = [...used.keys()].sort((a, b) => a - b);
        const sc = 1000 / f.upm;
        const file = subset(f, gids);
        const fileRef = ctx.register(ctx.flateStream(file, { Length1: file.length }));
        const desc = ctx.register(ctx.obj({
          Type: "FontDescriptor", FontName: tagName, Flags: 32 + (f.italic ? 64 : 0),
          FontBBox: f.bbox.map((x) => Math.round(x * sc)), ItalicAngle: f.italicAngle,
          Ascent: Math.round(f.ascent * sc), Descent: Math.round(f.descent * sc), CapHeight: Math.round(f.capHeight * sc), StemV: 80, FontFile2: fileRef,
        }));
        const W = ctx.obj([]);
        for (const g of gids) { W.push(PDFNumber.of(g)); W.push(ctx.obj([Math.round(f.adv(g) * sc)])); }
        const cid = ctx.register(ctx.obj({
          Type: "Font", Subtype: "CIDFontType2", BaseFont: tagName,
          CIDSystemInfo: { Registry: PDFString.of("Adobe"), Ordering: PDFString.of("Identity"), Supplement: 0 },
          FontDescriptor: desc, DW: 1000, W, CIDToGIDMap: "Identity",
        }));
        // peta Unicode: supaya teks bisa disalin & dicari
        const lines = [];
        for (const g of gids) { const u = used.get(g); if (!u || /\s/.test(u) && g === 0) continue; let hex = ""; for (const c of u) { const cp = c.codePointAt(0); if (cp > 0xFFFF) { const h = Math.floor((cp - 0x10000) / 0x400) + 0xD800, l = ((cp - 0x10000) % 0x400) + 0xDC00; hex += h.toString(16).padStart(4, "0") + l.toString(16).padStart(4, "0"); } else hex += cp.toString(16).padStart(4, "0"); } lines.push("<" + g.toString(16).padStart(4, "0") + "> <" + hex + ">"); }
        let cmap = "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n";
        for (let i = 0; i < lines.length; i += 100) { const chunk = lines.slice(i, i + 100); cmap += chunk.length + " beginbfchar\n" + chunk.join("\n") + "\nendbfchar\n"; }
        cmap += "endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend";
        const tu = ctx.register(ctx.flateStream(new TextEncoder().encode(cmap)));
        ctx.assign(ref, ctx.obj({ Type: "Font", Subtype: "Type0", BaseFont: tagName, Encoding: "Identity-H", DescendantFonts: [cid], ToUnicode: tu }));
      },
    };
  }
  root.TtfSubset = { parse, subset, pdfFont };
})(typeof window !== "undefined" ? window : globalThis);
