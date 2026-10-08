/* Mampat · penulis ZIP mini (metode "store", tanpa kompresi ulang).
   JPG/PNG/PDF sudah terkompres, jadi menyimpan apa adanya hampir sama kecil dan jauh lebih cepat.
   - CRC32 standar (polinomial 0xEDB88320) untuk setiap file
   - bit 11 (UTF-8) di header, supaya nama berhuruf non-latin / berspasi terbaca benar
   - extra field 0x7075 (Info-ZIP Unicode Path) sebagai cadangan untuk pembuka ZIP lama */
(function () {
  "use strict";
  const TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; TABLE[n] = c >>> 0; }
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function dosTime(d) {
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
  }
  // nama unik di dalam ZIP: "a.jpg", "a (2).jpg", ...
  function uniqueNames(names) {
    const seen = new Map();
    return names.map((n) => {
      const key = n.toLowerCase();
      if (!seen.has(key)) { seen.set(key, 1); return n; }
      const i = seen.get(key) + 1; seen.set(key, i);
      const dot = n.lastIndexOf(".");
      return dot > 0 ? n.slice(0, dot) + " (" + i + ")" + n.slice(dot) : n + " (" + i + ")";
    });
  }
  // files: [{ name, data: Uint8Array }] → Blob application/zip
  function zip(files, when) {
    const enc = new TextEncoder();
    const { time, date } = dosTime(when || new Date());
    const names = uniqueNames(files.map((f) => f.name));
    const parts = [], central = [];
    let offset = 0;
    files.forEach((f, i) => {
      const name = enc.encode(names[i]);
      const data = f.data, crc = crc32(data), size = data.length;
      if (offset + size > 0xFFFFFFFF - 1e6) throw new Error("ZIP lebih dari 4 GB belum didukung");
      // extra 0x7075: versi 1, CRC32 dari nama di header, lalu nama UTF-8
      const extra = new Uint8Array(4 + 5 + name.length), xv = new DataView(extra.buffer);
      xv.setUint16(0, 0x7075, true); xv.setUint16(2, 5 + name.length, true); extra[4] = 1; xv.setUint32(5, crc32(name), true); extra.set(name, 9);
      const lh = new Uint8Array(30), lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
      lv.setUint16(10, time, true); lv.setUint16(12, date, true); lv.setUint32(14, crc, true);
      lv.setUint32(18, size, true); lv.setUint32(22, size, true); lv.setUint16(26, name.length, true); lv.setUint16(28, extra.length, true);
      parts.push(lh, name, extra, data);
      const ch = new Uint8Array(46), cv = new DataView(ch.buffer);
      // "dibuat oleh" UNIX (seperti ZIP dari Mac/Linux/Python): pembuka ZIP lama tidak mengonversi nama dari kode halaman DOS
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 0x0314, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
      cv.setUint16(12, time, true); cv.setUint16(14, date, true); cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true); cv.setUint32(24, size, true); cv.setUint16(28, name.length, true); cv.setUint16(30, extra.length, true);
      cv.setUint16(32, 0, true); cv.setUint16(34, 0, true); cv.setUint16(36, 0, true); cv.setUint32(38, (0o100644 << 16) >>> 0, true); cv.setUint32(42, offset, true);
      central.push(ch, name, extra);
      offset += 30 + name.length + extra.length + size;
    });
    const cdSize = central.reduce((s, p) => s + p.length, 0);
    const end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: "application/zip" });
  }
  window.ZipWriter = { zip, crc32 };
})();
