// Uji otomatis Mampat: membuka setiap alat di Chrome headless, memakai file contoh di tests/fixtures/,
// lalu memeriksa isi file hasilnya. Jalankan: npm test   (atau: node tests/e2e.test.mjs)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { startServer } from "./lib/server.mjs";
import { launch } from "./lib/browser.mjs";

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const fx = (name) => path.join(FIX, name);
const TOOLS = ["kompres", "word-ke-pdf", "pdf-ke-word", "gabung", "pisah", "atur-halaman", "gambar-ke-pdf", "pdf-ke-gambar"];

// ---------- pembantu ----------
function assert(ok, msg) { if (!ok) throw new Error(msg); }
// pesan konsol yang wajar saat uji di komputer sendiri / file contoh yang sengaja rusak
const benign = (l) => /goatcounter|localhost|InvalidPDFException|Password|pdf\.worker/i.test(l);
// baca ZIP (metode store, seperti yang ditulis Mampat): nama, flag UTF-8, CRC cocok
function readZip(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert(end >= 0, "bukan file ZIP");
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    assert(buf.readUInt32LE(p) === 0x02014b50, "central directory rusak");
    const flags = buf.readUInt16LE(p + 8), crc = buf.readUInt32LE(p + 16), size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const dataStart = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const data = buf.subarray(dataStart, dataStart + size);
    entries.push({ name, utf8: !!(flags & 0x800), crcOk: zlib.crc32(data) === crc, data });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
// periksa PDF di halaman (pdf-lib & pdf.js sudah tersedia di situs)
async function inspectPdf(page, bytes) {
  return page.eval(`(async () => {
    await Mampat.loadLibs(["pdflib", "pdfjs"]);
    const b = Uint8Array.from(atob(${JSON.stringify(bytes.toString("base64"))}), (c) => c.charCodeAt(0));
    const d = await PDFLib.PDFDocument.load(b, { updateMetadata: false });
    const v = await pdfjsLib.getDocument({ data: b }).promise;
    const outline = (await v.getOutline()) || [];
    let text = ""; for (let i = 1; i <= Math.min(v.numPages, 3); i++) text += (await (await v.getPage(i)).getTextContent()).items.map((x) => x.str).join(" ") + " ";
    return { pages: d.getPageCount(), rotations: d.getPages().map((p) => p.getRotation().angle), sizes: d.getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())]),
      producer: d.getProducer(), outline: outline.map((o) => ({ title: o.title, kids: (o.items || []).length })), text };
  })()`);
}
async function pick(page, files) { await page.setFiles("#file", files.map(fx)); }
async function answerPassword(page, pw) {
  await page.waitFor(`!!document.querySelector(".pwbox input")`);
  await page.eval(`(() => { const i = document.querySelector(".pwbox input"); i.value = ${JSON.stringify(pw)}; document.querySelector(".pwbox form").requestSubmit(); })()`);
}
const toasts = (page) => page.eval(`[...document.querySelectorAll(".toast")].map((t) => t.textContent).join(" / ")`);

// ---------- daftar uji ----------
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
let base = "";
const shared = { wordPdf: null };

test("beranda: menu 8 alat, 7 kartu, rapi di HP & laptop", async (page) => {
  for (const [w, mobile] of [[320, true], [1280, false]]) {
    await page.viewport(w, 900, mobile);
    await page.goto(base + "/");
    const r = await page.eval(`({ menu: document.querySelectorAll(".tmenu a[data-tool]").length, cards: document.querySelectorAll(".card").length, overflow: document.documentElement.scrollWidth - innerWidth })`);
    assert(r.menu === 8 && r.cards === 7, "menu/kartu: " + JSON.stringify(r));
    assert(r.overflow === 0, "geser ke samping " + r.overflow + "px di lebar " + w);
  }
});

test("semua halaman alat terbuka tanpa error & rapi di 320px", async (page) => {
  await page.viewport(320, 800, true);
  for (const t of TOOLS) {
    await page.goto(base + "/" + t + "/");
    const r = await page.eval(`({ title: document.title, overflow: document.documentElement.scrollWidth - innerWidth, active: (document.querySelector(".tmenu [aria-current]") || {}).dataset?.tool })`);
    assert(r.overflow === 0, t + ": geser ke samping " + r.overflow + "px");
    assert(r.active === t, t + ": menu aktif salah (" + r.active + ")");
    const errs = page.logs.filter((l) => !benign(l));
    assert(!errs.length, t + ": " + errs.join(" | "));
  }
});

test("kompres: hasil di bawah target tapi tidak jauh (80–95%)", async (page) => {
  await page.goto(base + "/kompres/");
  await pick(page, ["dokumen-a.pdf"]);
  await page.waitFor(`window.__mampat && window.__mampat.anat && !document.getElementById("go").disabled`);
  await page.eval(`(() => { document.getElementById("uKB").click(); const t = document.getElementById("tNum"); t.value = "100"; t.dispatchEvent(new Event("input")); })()`);
  await page.eval(`document.getElementById("go").click()`);
  await page.waitFor(`!document.getElementById("sDone").hidden`, 120000);
  const pdf = await page.captureDownload("#save");
  assert(pdf.length <= 100 * 1024, "hasil " + pdf.length + " B > 100 KB");
  assert(pdf.length >= 80 * 1024 && pdf.length <= 95 * 1024, "hasil " + Math.round(pdf.length / 1024) + " KB, seharusnya ±86–93 KB");
  const info = await inspectPdf(page, pdf);
  assert(info.pages === 3, "halaman " + info.pages);
});

test("gabung: urutan, jumlah halaman, bookmark, event tanpa nama file", async (page) => {
  // catat event analytics sebelum halaman dimuat (skrip GoatCounter asli tidak boleh menimpanya)
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__ev = []; Object.defineProperty(window, "goatcounter", { value: { count: (o) => window.__ev.push(o.path) }, writable: false });` });
  await page.goto(base + "/gabung/");
  await pick(page, ["dokumen-b.pdf", "berbookmark.pdf", "rusak.pdf"]);
  await page.waitFor(`!document.getElementById("go").disabled`);
  assert(/rusak/.test(await toasts(page)), "PDF rusak tidak diberi tahu");
  await page.eval(`document.getElementById("go").click()`);
  await page.waitFor(`!document.getElementById("vDone").hidden`);
  const info = await inspectPdf(page, await page.captureDownload("#dSave"));
  assert(info.pages === 5, "halaman " + info.pages);
  assert(info.rotations[1] === 90, "rotasi asli hilang: " + info.rotations);
  assert(info.outline.length === 2 && info.outline[1].kids === 2, "bookmark: " + JSON.stringify(info.outline));
  const ev = await page.eval("window.__ev");
  assert(ev.includes("mampat/gabung/selesai") && ev.includes("mampat/gabung/unduh"), "event: " + ev);
  assert(!ev.some((e) => /dokumen|bookmark|\.pdf/i.test(e)), "event memuat nama file: " + ev);
});

test("pisah: rentang halaman & ZIP per halaman (nama UTF-8, CRC)", async (page) => {
  await page.goto(base + "/pisah/");
  await pick(page, ["dua-belas.pdf"]);
  await page.waitFor(`!document.getElementById("vEdit").hidden`);
  await page.eval(`(() => { const i = document.getElementById("range"); i.value = "1-3, 5"; i.dispatchEvent(new Event("input")); })()`);
  await page.eval(`document.getElementById("go").click()`);
  await page.waitFor(`!document.getElementById("vDone").hidden`);
  assert((await inspectPdf(page, await page.captureDownload("#dSave"))).pages === 4, "rentang 1-3, 5 harus 4 halaman");
  await pick(page, ["Laporan Keuangan 東京 ñ.pdf"]);
  await page.waitFor(`document.getElementById("fName").textContent.startsWith("Laporan") && !document.getElementById("vEdit").hidden`);
  await page.eval(`document.querySelector('[data-mode="semua"]').click(); document.getElementById("go").click()`);
  await page.waitFor(`!document.getElementById("vDone").hidden`);
  const zip = readZip(await page.captureDownload("#dSave"));
  assert(zip.length === 4, "isi ZIP " + zip.length);
  assert(zip.every((e) => e.utf8 && e.crcOk), "flag UTF-8 / CRC salah");
  assert(zip[0].name === "Laporan Keuangan 東京 ñ-hal-1.pdf", "nama: " + zip[0].name);
});

test("atur halaman: putar & hapus", async (page) => {
  await page.goto(base + "/atur-halaman/");
  await pick(page, ["dokumen-b.pdf"]);
  await page.waitFor(`!document.getElementById("go").disabled`);
  await page.eval(`(() => { const p = document.querySelectorAll("#grid .pg"); p[0].querySelector('[data-act="rotR"]').click(); p[1].querySelector('[data-act="del"]').click(); document.getElementById("go").click(); })()`);
  await page.waitFor(`!document.getElementById("vDone").hidden`);
  const info = await inspectPdf(page, await page.captureDownload("#dSave"));
  assert(info.pages === 1 && info.rotations[0] === 90, JSON.stringify(info.rotations));
});

test("gambar ke PDF: foto HP tetap tegak, kertas A4", async (page) => {
  await page.goto(base + "/gambar-ke-pdf/");
  await pick(page, ["foto-hp-tegak.jpg", "foto.jpg", "gambar-oranye.png"]);
  await page.waitFor(`!document.getElementById("go").disabled`);
  await page.eval(`document.getElementById("go").click()`);
  await page.waitFor(`!document.getElementById("vDone").hidden`);
  const info = await inspectPdf(page, await page.captureDownload("#dSave"));
  assert(JSON.stringify(info.sizes) === JSON.stringify([[595, 842], [842, 595], [595, 842]]), "ukuran: " + JSON.stringify(info.sizes));
});

test("PDF ke gambar: ZIP berisi JPG halaman terpilih", async (page) => {
  await page.goto(base + "/pdf-ke-gambar/");
  await pick(page, ["dua-belas.pdf"]);
  await page.waitFor(`!document.getElementById("go").disabled`);
  await page.eval(`(() => { document.querySelector('[data-sel="none"]').click(); document.querySelector('.pg[data-p="1"]').click(); document.querySelector('.pg[data-p="2"]').click(); document.getElementById("go").click(); })()`);
  await page.waitFor(`!document.getElementById("vDone").hidden`);
  const zip = readZip(await page.captureDownload("#dSave"));
  assert(zip.length === 2 && zip.every((e) => e.crcOk && e.data[0] === 0xff && e.data[1] === 0xd8), "ZIP JPG tidak valid");
});

test("Word ke PDF: halaman, teks bisa dicari, ukuran F4", async (page) => {
  await page.goto(base + "/word-ke-pdf/");
  await pick(page, ["laporan-praktikum.docx"]);
  await page.waitFor(`!document.getElementById("go").disabled`, 90000);
  await page.eval(`document.getElementById("go").click()`);
  await page.waitFor(`!document.getElementById("vDone").hidden`, 90000);
  const pdf = await page.captureDownload("#dSave");
  const info = await inspectPdf(page, pdf);
  assert(info.pages >= 4, "halaman " + info.pages);
  assert(/Laporan Praktikum Jaringan Komputer/.test(info.text) && /Nyalakan komputer/.test(info.text), "teks tidak bisa dicari");
  assert(info.producer === "Mampat", "producer " + info.producer);
  shared.wordPdf = path.join(os.tmpdir(), "mampat-uji-laporan.pdf");
  fs.writeFileSync(shared.wordPdf, pdf);
  await pick(page, ["surat-f4.docx"]);
  await page.waitFor(`/surat/.test(document.getElementById("fName").textContent) && !document.getElementById("go").disabled`, 90000);
  await page.eval(`document.getElementById("go").click()`);
  await page.waitFor(`!document.getElementById("vDone").hidden`, 90000);
  const f4 = await inspectPdf(page, await page.captureDownload("#dSave"));
  assert(JSON.stringify(f4.sizes[0]) === "[935,609]", "F4 mendatar: " + f4.sizes[0]);
});

test("PDF ke Word: .docx berisi teks, warna, link", async (page) => {
  assert(shared.wordPdf, "butuh hasil uji Word ke PDF");
  await page.goto(base + "/pdf-ke-word/");
  await page.setFiles("#file", [shared.wordPdf]);
  await page.waitFor(`!document.getElementById("go").disabled`);
  await page.eval(`document.getElementById("go").click()`);
  await page.waitFor(`!document.getElementById("vDone").hidden`, 90000);
  const zip = readZip(await page.captureDownload("#dSave"));
  assert(zip.every((e) => e.crcOk), "CRC .docx salah");
  const xml = zip.find((e) => e.name === "word/document.xml").data.toString("utf8");
  assert(xml.includes("Laporan Praktikum Jaringan Komputer"), "teks tidak ada");
  assert(xml.includes("<w:hyperlink") && xml.includes('w:val="C00000"') && xml.includes("subscript"), "link/warna/subscript hilang");
});

test("PDF terkunci: kata sandi salah lalu benar, kunci izin otomatis", async (page) => {
  await page.goto(base + "/pdf-ke-gambar/");
  await pick(page, ["terkunci.pdf"]);
  await answerPassword(page, "salah");
  await page.waitFor(`!!document.querySelector(".pwbox .err")`);
  await answerPassword(page, "rahasia");
  await page.waitFor(`!document.getElementById("go").disabled`);
  assert(/3 halaman/.test(await page.eval(`document.getElementById("fMeta").textContent`)), "PDF berkata sandi tidak terbuka");
  await pick(page, ["izin-terkunci.pdf"]);
  await page.waitFor(`/izin/.test(document.getElementById("fName").textContent) && !document.getElementById("go").disabled`);
  assert(/dikunci izin/.test(await toasts(page)), "tidak ada pemberitahuan kunci izin");
});

// ---------- jalankan ----------
const server = await startServer();
base = server.url;
console.log("Situs uji: " + base + "\n");
let failed = 0;
for (const t of tests) {
  const page = await launch();
  const t0 = Date.now();
  try { await page.viewport(1280, 900); await t.fn(page); console.log("  ✓ " + t.name + "  (" + ((Date.now() - t0) / 1000).toFixed(1) + " dtk)"); }
  catch (e) { failed++; console.log("  ✗ " + t.name + "\n      " + e.message.split("\n")[0]); }
  finally { await page.close(); }
}
server.close();
console.log("\n" + (tests.length - failed) + " dari " + tests.length + " uji lulus");
process.exit(failed ? 1 : 0);
