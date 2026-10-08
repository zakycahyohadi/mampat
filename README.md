# Mampat

[![Uji & Deploy](https://github.com/zakycahyohadi/mampat/actions/workflows/deploy.yml/badge.svg)](https://github.com/zakycahyohadi/mampat/actions/workflows/deploy.yml)
[![Lisensi: MIT](https://img.shields.io/badge/lisensi-MIT-yellow.svg)](LICENSE)

Alat PDF yang jalan sepenuhnya di browser: **tanpa upload, tanpa batas, tanpa akun, tanpa iklan**,
dan tetap bisa dipakai offline setelah dibuka sekali.

**Coba langsung:** https://zakycahyohadi.github.io/mampat/

## Fitur

| Alat | Alamat | Fungsi |
|---|---|---|
| Kompres PDF | [`/kompres/`](https://zakycahyohadi.github.io/mampat/kompres/) | Kecilkan PDF ke ukuran yang kamu tentukan, teks dan link tetap utuh |
| Word ke PDF | [`/word-ke-pdf/`](https://zakycahyohadi.github.io/mampat/word-ke-pdf/) | `.docx` jadi PDF; teks bisa dipilih, link bisa diklik |
| PDF ke Word | [`/pdf-ke-word/`](https://zakycahyohadi.github.io/mampat/pdf-ke-word/) | PDF jadi `.docx` yang bisa diedit |
| Gabung PDF | [`/gabung/`](https://zakycahyohadi.github.io/mampat/gabung/) | Satukan beberapa PDF (urutan diatur dengan drag), bookmark ikut |
| Pisah PDF | [`/pisah/`](https://zakycahyohadi.github.io/mampat/pisah/) | Ambil halaman tertentu (`1-3, 5`) atau pisah per halaman (ZIP) |
| Atur Halaman | [`/atur-halaman/`](https://zakycahyohadi.github.io/mampat/atur-halaman/) | Putar, hapus, dan urutkan ulang halaman |
| Gambar ke PDF | [`/gambar-ke-pdf/`](https://zakycahyohadi.github.io/mampat/gambar-ke-pdf/) | JPG/PNG jadi satu PDF: A4, F4/Folio, Letter, atau ikuti gambar |
| PDF ke Gambar | [`/pdf-ke-gambar/`](https://zakycahyohadi.github.io/mampat/pdf-ke-gambar/) | Setiap halaman jadi JPG atau PNG |

Semua alat bisa membuka PDF berkata sandi (kata sandinya tidak dikirim ke mana pun).

## Privasi

File tidak pernah diunggah. Yang diunduh dari internet hanya kode aplikasi, library PDF, dan font;
setelah itu file dibaca, diproses, dan disimpan lagi di perangkat pengguna. Statistik (GoatCounter)
hanya mencatat event seperti `mampat/gabung/selesai`, tanpa nama atau isi file.

## Struktur folder

```
mampat/
├── public/                    # semua yang tayang di web (diunggah apa adanya ke GitHub Pages)
│   ├── index.html             # beranda
│   ├── kompres/ … pdf-ke-word/  # satu folder per alat, alamatnya = nama folder
│   ├── assets/
│   │   ├── css/main.css       # gaya bersama semua halaman
│   │   ├── js/                # kode bersama (core.js) & mesin tiap alat
│   │   └── icons/             # ikon situs & aplikasi
│   ├── manifest.webmanifest   # data aplikasi (PWA)
│   └── sw.js                  # service worker untuk offline (harus di akar situs)
├── tests/
│   ├── e2e.test.mjs           # uji otomatis semua alat
│   ├── lib/                   # server lokal & pengendali Chrome untuk uji
│   ├── fixtures/              # file contoh (PDF, Word, gambar)
│   └── tools/                 # skrip pembuat file contoh
├── .github/workflows/deploy.yml  # uji otomatis, lalu deploy kalau lulus
├── CHANGELOG.md · LICENSE · package.json · .editorconfig
```

| File di `public/assets/js/` | Isi |
|---|---|
| `core.js` | Pengaturan analytics, header & menu, simpan file, pemuat library, buka PDF terkunci, offline |
| `pdf-tools.js` | Pilih file, thumbnail, drag urutan, rentang halaman (dipakai alat PDF) |
| `zip-writer.js` | Penulis ZIP kecil (CRC32, nama file UTF-8); juga untuk menulis `.docx` |
| `ttf-subset.js` | Pemotong font TrueType untuk menanam font ke PDF |
| `docx-to-pdf.js` | Mesin Word ke PDF |
| `pdf-to-docx.js` | Mesin PDF ke Word |

Library pihak ketiga dimuat dari CDN: pdf-lib 1.17.1, pdf.js 3.11.174, JSZip 3.10.1 (cdnjs);
docx-preview 0.4.1, @cantoo/pdf-lib 2.11.1, dan font Carlito/Caladea/Tinos/Arimo/Cousine (jsDelivr).

## Menjalankan di komputer

Butuh [Node.js](https://nodejs.org) 22 atau lebih baru (tanpa `npm install`, tidak ada dependensi).

```bash
npm start      # buka http://127.0.0.1:8790
npm test       # jalankan semua uji otomatis (butuh Google Chrome)
```

Kalau Chrome tidak ditemukan otomatis, atur lokasinya: `CHROME_PATH=/lokasi/chrome npm test`.
File contoh di `tests/fixtures/` bisa dibuat ulang dengan `npm run fixtures`
(butuh `pip install python-docx` dan Ghostscript).

## Aturan kerja

**Penamaan**
- Folder alat & alamat web: bahasa Indonesia, huruf kecil, dipisah tanda hubung (`atur-halaman/`).
- File kode: bahasa Inggris, huruf kecil, dipisah tanda hubung (`pdf-to-docx.js`).
- Teks yang dilihat pengguna: bahasa Indonesia yang santai dan jelas.

**Pesan commit** mengikuti [Conventional Commits](https://www.conventionalcommits.org/id/v1.0.0/):

```
<jenis>: <ringkasan singkat dalam bahasa Indonesia>
```

| Jenis | Dipakai untuk |
|---|---|
| `feat` | fitur baru |
| `fix` | perbaikan bug |
| `perf` | membuat lebih cepat/ringan |
| `refactor` | merapikan kode tanpa mengubah perilaku |
| `test` | uji otomatis |
| `docs` | dokumentasi |
| `ci` | GitHub Actions |
| `chore` | pekerjaan rutin lain |

Contoh: `feat: tambah OCR untuk PDF hasil scan`, `fix: tombol simpan tidak muncul di iPhone`.

**Versi** mengikuti [Semantic Versioning](https://semver.org/lang/id/) dan dicatat di [CHANGELOG.md](CHANGELOG.md).
Setiap rilis diberi tag git, misalnya `v2.2.0`.

**Sebelum push**, jalankan `npm test`. GitHub Actions menjalankan uji yang sama dan hanya
men-deploy ke GitHub Pages kalau semuanya lulus. Setelah mengubah file di `public/`,
naikkan versi `CACHE` di `public/sw.js` supaya pengguna offline mendapat versi baru.

## Lisensi

[MIT](LICENSE) © 2026 Zaky Cahyo Hadi
