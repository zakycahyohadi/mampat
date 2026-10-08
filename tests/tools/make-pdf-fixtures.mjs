// Membuat PDF & gambar contoh untuk uji otomatis (tests/fixtures/).
// Jalankan: node tests/tools/make-pdf-fixtures.mjs
// Butuh: Node 18+ (fetch). Opsional: Ghostscript (gs) untuk PDF terkunci & berbookmark.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
// pdf-lib versi yang sama dengan situs, diunduh ke folder sementara lalu dimuat seperti modul biasa
const libFile = path.join(os.tmpdir(), "mampat-pdf-lib-1.17.1.js");
if (!fs.existsSync(libFile)) fs.writeFileSync(libFile, await (await fetch("https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js")).text());
const { PDFDocument, StandardFonts, rgb, degrees } = createRequire(import.meta.url)(libFile);

const jpg = fs.readFileSync(path.join(dir, "foto.jpg"));
async function make(name, pages, opts = {}) {
  const d = await PDFDocument.create();
  const font = await d.embedFont(StandardFonts.HelveticaBold);
  const img = opts.photo ? await d.embedJpg(jpg) : null;
  for (let i = 1; i <= pages; i++) {
    const p = d.addPage(opts.landscape ? [841.89, 595.28] : [595.28, 841.89]);
    const { width, height } = p.getSize();
    if (img && (opts.photo === "all" || i === 2)) p.drawImage(img, { x: 40, y: 140, width: width - 80, height: (width - 80) / 1.5 });
    p.drawText(opts.label + " · Halaman " + i, { x: 40, y: height - 80, size: 34, font, color: rgb(0.05, 0.06, 0.08) });
    p.drawRectangle({ x: 40, y: 40, width: 60, height: 20, color: rgb(1, 0.82, 0.17) }); // penanda pojok untuk cek rotasi
    if (opts.rotateSecond && i === 2) p.setRotation(degrees(90));
  }
  fs.writeFileSync(path.join(dir, name), await d.save());
}
await make("dokumen-a.pdf", 3, { label: "Dokumen A", photo: true });
await make("dokumen-b.pdf", 2, { label: "Dokumen B", landscape: true, rotateSecond: true });
await make("Laporan Keuangan 東京 ñ.pdf", 4, { label: "Laporan" }); // sengaja: nama non-latin & berspasi
await make("dua-belas.pdf", 12, { label: "Dua belas" });
fs.writeFileSync(path.join(dir, "rusak.pdf"), Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(4000, 7)]));

// foto HP dengan EXIF Orientation = 6: data mentah mendatar, tampil tegak
const exif = Buffer.from([0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0]);
const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 255]), exif]);
fs.writeFileSync(path.join(dir, "foto-hp-tegak.jpg"), Buffer.concat([jpg.subarray(0, 2), app1, jpg.subarray(2)]));

// PDF terkunci & berbookmark (butuh Ghostscript)
try {
  const gs = (args) => execFileSync("gs", ["-q", "-dNOPAUSE", "-dBATCH", "-sDEVICE=pdfwrite", ...args], { cwd: dir });
  gs(["-sOwnerPassword=pemilik", "-sUserPassword=rahasia", "-dEncryptionR=3", "-dKeyLength=128", "-sOutputFile=terkunci.pdf", "dokumen-a.pdf"]);
  gs(["-sOwnerPassword=pemilik", "-dEncryptionR=3", "-dKeyLength=128", "-dPermissions=-3904", "-sOutputFile=izin-terkunci.pdf", "dokumen-a.pdf"]);
  fs.writeFileSync(path.join(dir, "bookmark.ps"), "[/Title (Bab 1 Pendahuluan) /Page 1 /Count 2 /OUT pdfmark\n[/Title (1.1 Latar belakang) /Page 1 /OUT pdfmark\n[/Title (1.2 Tujuan) /Page 2 /OUT pdfmark\n[/Title (Bab 2 Hasil) /Page 3 /OUT pdfmark\n");
  gs(["-sOutputFile=berbookmark.pdf", "dokumen-a.pdf", "bookmark.ps"]);
  fs.unlinkSync(path.join(dir, "bookmark.ps"));
} catch (e) { console.warn("Ghostscript tidak ada: PDF terkunci & berbookmark dilewati"); }
console.log("selesai:", fs.readdirSync(dir).join(", "));
