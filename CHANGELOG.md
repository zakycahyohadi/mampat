# Catatan Perubahan

Semua perubahan penting dicatat di sini. Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/),
dan nomor versi mengikuti [Semantic Versioning](https://semver.org/lang/id/):
`MAYOR.MINOR.PATCH` (mayor = perubahan besar, minor = fitur baru, patch = perbaikan).

## [2.2.0] - 2026-10-08

### Diubah
- Struktur repo dirapikan: semua isi web ada di `public/` (alamat web tetap sama),
  CSS di `public/assets/css/`, JavaScript di `public/assets/js/`, ikon di `public/assets/icons/`.
- Nama file kode memakai bahasa Inggris yang konsisten: `core.js`, `pdf-tools.js`, `zip-writer.js`,
  `ttf-subset.js`, `docx-to-pdf.js`, `pdf-to-docx.js`, `main.css`.
- Workflow GitHub Actions menjalankan uji otomatis dulu; deploy hanya jalan kalau semua uji lulus.

### Ditambahkan
- Uji otomatis end-to-end (`npm test`) untuk kedelapan alat, beserta file contoh dan skrip pembuatnya.
- `LICENSE` (MIT), `CHANGELOG.md`, `.editorconfig`, `package.json`.

## [2.1.0] - 2026-10-08

### Ditambahkan
- Alat **Word ke PDF**: teks tetap bisa dipilih dan dicari, link bisa diklik, font kembaran Calibri/Times/Arial ditanam.
- Alat **PDF ke Word**: paragraf, tebal/miring, warna, link, subscript, tab untuk kolom, dan gambar.
- Semua alat PDF bisa membuka PDF berkata sandi dan PDF yang dikunci izin.
- Gabung PDF membawa bookmark (daftar isi) setiap file.

### Diperbaiki
- PDF ke Word 7× lebih cepat untuk dokumen panjang.
- Service worker mengambil file situs terbaru lebih dulu, supaya HTML dan JavaScript selalu cocok setelah update.

## [2.0.0] - 2026-10-07

### Ditambahkan
- Mampat menjadi situs berisi beberapa alat: Kompres, Gabung, Pisah, Atur Halaman, Gambar ke PDF, PDF ke Gambar.
- Beranda, menu antar-alat, mode offline untuk semua alat, dan statistik GoatCounter per alat.

## [1.0.0] - 2026-10-07

### Ditambahkan
- Kompres PDF ke ukuran yang ditentukan sendiri, langsung di browser.

[2.2.0]: https://github.com/zakycahyohadi/mampat/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/zakycahyohadi/mampat/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/zakycahyohadi/mampat/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/zakycahyohadi/mampat/releases/tag/v1.0.0
