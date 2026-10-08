"""Membuat dokumen Word contoh untuk uji otomatis (tests/fixtures/).

Jalankan: python3 tests/tools/make-docx-fixtures.py
Butuh: pip install python-docx
"""
from pathlib import Path

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


def add_link(paragraph, url, text):
    rel = paragraph.part.relate_to(url, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", is_external=True)
    link = OxmlElement("w:hyperlink")
    link.set(qn("r:id"), rel)
    run = OxmlElement("w:r")
    props = OxmlElement("w:rPr")
    color = OxmlElement("w:color")
    color.set(qn("w:val"), "0563C1")
    underline = OxmlElement("w:u")
    underline.set(qn("w:val"), "single")
    props.append(color)
    props.append(underline)
    run.append(props)
    text_el = OxmlElement("w:t")
    text_el.text = text
    run.append(text_el)
    link.append(run)
    paragraph._p.append(link)


def make_report():
    doc = Document()
    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(11)
    section = doc.sections[0]
    section.page_width, section.page_height = Cm(21), Cm(29.7)
    for side in ("left_margin", "right_margin", "top_margin", "bottom_margin"):
        setattr(section, side, Cm(2.5))
    section.header.paragraphs[0].text = "Universitas Contoh · Fakultas Teknik"
    section.header.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
    section.footer.paragraphs[0].text = "Laporan Praktikum Mampat — dokumen uji"
    section.footer.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER

    body = ("Jaringan komputer adalah kumpulan perangkat yang saling terhubung untuk berbagi data dan sumber daya. "
            "Pada praktikum ini kita mengamati cara kerja alamat IP, subnetting, dan pengujian konektivitas menggunakan perintah ping. ")
    doc.add_heading("Laporan Praktikum Jaringan Komputer", 0)
    p = doc.add_paragraph()
    p.add_run("Nama: ").bold = True
    p.add_run("Zaky Cahyo Hadi   ")
    p.add_run("NIM: ").bold = True
    p.add_run("12345678")
    doc.add_heading("1. Pendahuluan", 1)
    doc.add_paragraph(body * 2).alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    p = doc.add_paragraph()
    p.add_run("Teks tebal, ")
    p.add_run("miring, ").italic = True
    p.add_run("bergaris bawah, ").underline = True
    p.add_run("berwarna merah").font.color.rgb = RGBColor(0xC0, 0x00, 0x00)
    p.add_run(", ukuran ")
    p.add_run("16 pt").font.size = Pt(16)
    p.add_run(", dan H")
    p.add_run("2").font.subscript = True
    p.add_run("O.")
    add_link(doc.add_paragraph("Rujukan: "), "https://zakycahyohadi.github.io/mampat/", "zakycahyohadi.github.io/mampat")
    doc.add_heading("2. Langkah Kerja", 1)
    for step in ["Nyalakan komputer dan router.", "Atur alamat IP setiap komputer.", "Uji koneksi dengan perintah ping.", "Catat hasilnya pada tabel."]:
        doc.add_paragraph(step, style="List Number")
    for item in ["Kabel UTP kategori 6", "Switch 8 port", "Dua buah laptop"]:
        doc.add_paragraph(item, style="List Bullet")
    doc.add_heading("3. Hasil Pengamatan", 1)
    table = doc.add_table(rows=1, cols=3)
    table.style = "Table Grid"
    for i, head in enumerate(["Perangkat", "Alamat IP", "Status ping"]):
        cell = table.rows[0].cells[i]
        cell.text = head
        cell.paragraphs[0].runs[0].bold = True
    for row in [("Laptop A", "192.168.1.10", "Berhasil"), ("Laptop B", "192.168.1.11", "Berhasil"), ("Printer", "192.168.1.20", "Gagal")]:
        cells = table.add_row().cells
        for i, value in enumerate(row):
            cells[i].text = value
    doc.add_paragraph()
    doc.add_picture(str(FIXTURES / "foto.jpg"), width=Cm(12))
    caption = doc.add_paragraph("Gambar 1. Lokasi praktikum")
    caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
    caption.runs[0].italic = True
    doc.add_heading("4. Pembahasan", 1)
    for i in range(9):
        doc.add_paragraph(f"Paragraf pembahasan {i + 1}. " + body * 3).alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    serif = doc.add_paragraph("Paragraf ini memakai Times New Roman 12 pt untuk menguji font serif.")
    serif.runs[0].font.name, serif.runs[0].font.size = "Times New Roman", Pt(12)
    sans = doc.add_paragraph("Paragraf ini memakai Arial tebal.")
    sans.runs[0].font.name, sans.runs[0].bold = "Arial", True
    doc.add_paragraph("Font tidak dikenal: Comic Sans MS.").runs[0].font.name = "Comic Sans MS"
    doc.add_paragraph("Huruf non-latin: 東京 dan émoji ✓ dan simbol → ±.")
    doc.add_page_break()
    doc.add_heading("5. Kesimpulan", 1)
    doc.add_paragraph("Semua perangkat terhubung kecuali printer. Halaman ini dimulai dengan page break.")
    doc.save(FIXTURES / "laporan-praktikum.docx")


def make_letter():
    doc = Document()
    section = doc.sections[0]
    section.orientation = WD_ORIENT.LANDSCAPE
    section.page_width, section.page_height = Cm(33), Cm(21.5)
    doc.styles["Normal"].font.name = "Cambria"
    doc.styles["Normal"].font.size = Pt(12)
    doc.add_heading("Surat Pernyataan (F4 mendatar)", 1)
    doc.add_paragraph("Yang bertanda tangan di bawah ini menyatakan bahwa data yang saya isi adalah benar.")
    doc.save(FIXTURES / "surat-f4.docx")


if __name__ == "__main__":
    make_report()
    make_letter()
    print("selesai:", ", ".join(sorted(p.name for p in FIXTURES.iterdir())))
