// Document exporter for Soal Ulangan, Modul Ajar (RPP), and Visual LKPD
// Supports real Word (.docx) and PDF (.pdf) with embedded illustrations and images
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx';
import jsPDF from 'jspdf';
import { NaskahUjianAI, ModulAjarAI, BahanAjarAI, LkpdData } from '../types';

/**
 * Converts a base64 / dataURI or SVG data URI to a Uint8Array for docx ImageRun,
 * or rasterizes SVG to PNG on an in-memory canvas if necessary.
 */
async function dataUriToImageUint8Array(dataUri: string): Promise<Uint8Array | null> {
  if (!dataUri) return null;
  try {
    if (dataUri.startsWith('data:image/svg+xml')) {
      // Rasterize SVG onto an off-screen canvas to convert to PNG buffer for Word docx compatibility
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = dataUri;
      });
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, 600, 400);
      ctx.drawImage(img, 0, 0, 600, 400);
      const pngUri = canvas.toDataURL('image/png');
      const base64Part = pngUri.split(',')[1];
      const binaryString = atob(base64Part);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    } else if (dataUri.startsWith('data:image/')) {
      const base64Part = dataUri.split(',')[1];
      const binaryString = atob(base64Part);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    }
    return null;
  } catch (err) {
    console.error('Error converting image data URI to docx buffer:', err);
    return null;
  }
}

/**
 * Triggers browser download of a Blob
 */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// =========================================================================
// 1. EXPORT SOAL ULANGAN (WORD .DOCX & PDF)
// =========================================================================

export async function exportSoalToDocx(naskah: NaskahUjianAI, withAnswerKey: boolean, schoolName: string = 'PORTAL SEKOLAH') {
  const paragraphs: Paragraph[] = [];

  // 1. Header Kop
  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: schoolName.toUpperCase(), bold: true, size: 28, font: 'Arial' }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: `${naskah.jenisUjian.toUpperCase()} - ${naskah.kurikulum.toUpperCase()}`, bold: true, size: 22, font: 'Arial' }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: `MATA PELAJARAN: ${naskah.mataPelajaran.toUpperCase()} | KELAS: ${naskah.kelas.toUpperCase()}`, size: 20, font: 'Arial' }),
      ],
    }),
    new Paragraph({
      text: '_________________________________________________________________________________',
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  // 2. Student Identity Box
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'Nama Lengkap : ______________________________     Nomor Peserta : ____________', font: 'Arial', size: 20 }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Hari / Tanggal: ______________________________     Alokasi Waktu : ${naskah.durasiMenit || 60} Menit`, font: 'Arial', size: 20 }),
      ],
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'PETUNJUK UMUM:', bold: true, font: 'Arial', size: 20 }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: naskah.petunjukUmum || '1. Berdoalah sebelum mengerjakan. 2. Periksa kembali pekerjaan sebelum diserahkan.', font: 'Arial', size: 19 }),
      ],
      spacing: { after: 300 },
    })
  );

  // 3. Pilihan Ganda Section
  if (naskah.pilihanGanda && naskah.pilihanGanda.length > 0) {
    paragraphs.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [
          new TextRun({ text: 'I. PILIHAN GANDA', bold: true, font: 'Arial', size: 22 }),
        ],
        spacing: { before: 200, after: 150 },
      })
    );

    for (let i = 0; i < naskah.pilihanGanda.length; i++) {
      const q = naskah.pilihanGanda[i];
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${i + 1}. `, bold: true, font: 'Arial', size: 20 }),
            new TextRun({ text: q.pertanyaan, font: 'Arial', size: 20 }),
          ],
          spacing: { before: 100, after: 60 },
        })
      );

      // Embedded Question Image
      if (q.gambar) {
        const imgBuffer = await dataUriToImageUint8Array(q.gambar);
        if (imgBuffer) {
          paragraphs.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new ImageRun({
                  data: imgBuffer,
                  transformation: { width: 320, height: 210 },
                  type: 'png',
                }),
              ],
              spacing: { after: 60 },
            })
          );
          if (q.gambarCaption) {
            paragraphs.push(
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: `Gambar: ${q.gambarCaption}`, italics: true, size: 17, font: 'Arial' }),
                ],
                spacing: { after: 80 },
              })
            );
          }
        }
      }

      // Options
      const optKeys = ['A', 'B', 'C', 'D', 'E'];
      for (const k of optKeys) {
        const optText = q.pilihan[k];
        if (optText) {
          paragraphs.push(
            new Paragraph({
              indent: { left: 400 },
              children: [
                new TextRun({ text: `${k}. `, bold: true, font: 'Arial', size: 19 }),
                new TextRun({ text: optText, font: 'Arial', size: 19 }),
              ],
              spacing: { after: 40 },
            })
          );
        }
      }

      // Teacher view
      if (withAnswerKey) {
        paragraphs.push(
          new Paragraph({
            indent: { left: 400 },
            children: [
              new TextRun({ text: `[Kunci Jawaban: ${q.kunciJawaban}] `, bold: true, color: '15803D', font: 'Arial', size: 19 }),
              new TextRun({ text: q.pembahasan ? `Pembahasan: ${q.pembahasan}` : '', italics: true, color: '334155', font: 'Arial', size: 18 }),
            ],
            spacing: { before: 60, after: 120 },
          })
        );
      }
    }
  }

  // 4. Esai Section
  if (naskah.esai && naskah.esai.length > 0) {
    paragraphs.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [
          new TextRun({ text: 'II. URAIAN / ESAI', bold: true, font: 'Arial', size: 22 }),
        ],
        spacing: { before: 300, after: 150 },
      })
    );

    for (let i = 0; i < naskah.esai.length; i++) {
      const q = naskah.esai[i];
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${i + 1}. `, bold: true, font: 'Arial', size: 20 }),
            new TextRun({ text: q.pertanyaan, font: 'Arial', size: 20 }),
          ],
          spacing: { before: 100, after: 80 },
        })
      );

      if (q.gambar) {
        const imgBuffer = await dataUriToImageUint8Array(q.gambar);
        if (imgBuffer) {
          paragraphs.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new ImageRun({
                  data: imgBuffer,
                  transformation: { width: 320, height: 210 },
                  type: 'png',
                }),
              ],
              spacing: { after: 60 },
            })
          );
        }
      }

      // Space for student answer in test sheet
      if (!withAnswerKey) {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({ text: 'Jawab: _________________________________________________________________________________\n_________________________________________________________________________________________', color: '94A3B8', size: 19 }),
            ],
            spacing: { after: 160 },
          })
        );
      } else {
        paragraphs.push(
          new Paragraph({
            indent: { left: 400 },
            children: [
              new TextRun({ text: `Pedoman Penskoran / Kunci: `, bold: true, color: '15803D', font: 'Arial', size: 19 }),
              new TextRun({ text: `${q.pedomanPenskoran || q.kunciJawaban}`, font: 'Arial', size: 19 }),
            ],
            spacing: { after: 140 },
          })
        );
      }
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const typeTag = withAnswerKey ? 'Kunci-Guru' : 'Naskah-Siswa';
  downloadBlob(blob, `Soal-${naskah.mataPelajaran.replace(/\s+/g, '_')}-${naskah.kelas}-${typeTag}.docx`);
}

export async function exportSoalToPdf(naskah: NaskahUjianAI, withAnswerKey: boolean, schoolName: string = 'PORTAL SEKOLAH') {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const margin = 16;
  const contentWidth = pageWidth - (margin * 2);
  let y = 18;

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > 280) {
      doc.addPage();
      y = 18;
    }
  };

  // 1. Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(schoolName.toUpperCase(), pageWidth / 2, y, { align: 'center' });
  y += 6;

  doc.setFontSize(11);
  doc.text(`${naskah.jenisUjian.toUpperCase()} - ${naskah.kurikulum.toUpperCase()}`, pageWidth / 2, y, { align: 'center' });
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Mata Pelajaran: ${naskah.mataPelajaran}  |  Kelas: ${naskah.kelas}  |  Waktu: ${naskah.durasiMenit || 60} Menit`, pageWidth / 2, y, { align: 'center' });
  y += 4;

  doc.setLineWidth(0.6);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // Student info bar
  doc.setFontSize(9);
  doc.text('Nama Siswa : __________________________________', margin, y);
  doc.text('Hari / Tanggal : _______________________', margin + 110, y);
  y += 5;
  doc.text('No. Absen  : ____________', margin, y);
  doc.text(`Tingkat Kesulitan: ${naskah.tingkatKesulitan || 'Sedang'}`, margin + 110, y);
  y += 6;

  // 2. Pilihan Ganda
  if (naskah.pilihanGanda && naskah.pilihanGanda.length > 0) {
    checkPageBreak(12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text('I. PILIHAN GANDA', margin, y);
    y += 5;

    for (let i = 0; i < naskah.pilihanGanda.length; i++) {
      const q = naskah.pilihanGanda[i];
      checkPageBreak(25);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      const qText = `${i + 1}. ${q.pertanyaan}`;
      const splitQ = doc.splitTextToSize(qText, contentWidth);
      doc.text(splitQ, margin, y);
      y += splitQ.length * 4.2;

      // Draw embedded question image
      if (q.gambar) {
        checkPageBreak(45);
        try {
          const imgH = 38;
          const imgW = 60;
          doc.addImage(q.gambar, 'PNG', (pageWidth - imgW) / 2, y, imgW, imgH);
          y += imgH + 2;
          if (q.gambarCaption) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(8);
            doc.text(`Gambar: ${q.gambarCaption}`, pageWidth / 2, y, { align: 'center' });
            y += 4;
          }
        } catch (e) {
          console.warn('Could not add image to PDF', e);
        }
      }

      // Options
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const optKeys = ['A', 'B', 'C', 'D', 'E'];
      for (const k of optKeys) {
        const val = q.pilihan[k];
        if (val) {
          checkPageBreak(6);
          const optLine = `${k}. ${val}`;
          const splitOpt = doc.splitTextToSize(optLine, contentWidth - 8);
          doc.text(splitOpt, margin + 5, y);
          y += splitOpt.length * 4;
        }
      }

      if (withAnswerKey) {
        checkPageBreak(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(21, 128, 61); // Green
        doc.text(`[Kunci: ${q.kunciJawaban}]`, margin + 5, y);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(51, 65, 85);
        if (q.pembahasan) {
          const splitPemb = doc.splitTextToSize(`Pembahasan: ${q.pembahasan}`, contentWidth - 30);
          doc.text(splitPemb, margin + 28, y);
          y += splitPemb.length * 3.8;
        } else {
          y += 4;
        }
        doc.setTextColor(0, 0, 0);
      }
      y += 2.5;
    }
  }

  // 3. Esai
  if (naskah.esai && naskah.esai.length > 0) {
    checkPageBreak(15);
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text('II. URAIAN / ESAI', margin, y);
    y += 5;

    for (let i = 0; i < naskah.esai.length; i++) {
      const q = naskah.esai[i];
      checkPageBreak(25);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      const qText = `${i + 1}. ${q.pertanyaan}`;
      const splitQ = doc.splitTextToSize(qText, contentWidth);
      doc.text(splitQ, margin, y);
      y += splitQ.length * 4.2;

      if (q.gambar) {
        checkPageBreak(45);
        try {
          const imgH = 38;
          const imgW = 60;
          doc.addImage(q.gambar, 'PNG', (pageWidth - imgW) / 2, y, imgW, imgH);
          y += imgH + 3;
        } catch (e) {
          console.warn('Could not add image to PDF', e);
        }
      }

      if (!withAnswerKey) {
        y += 2;
        doc.setDrawColor(203, 213, 225);
        doc.line(margin + 5, y + 6, pageWidth - margin, y + 6);
        doc.line(margin + 5, y + 14, pageWidth - margin, y + 14);
        doc.setDrawColor(0, 0, 0);
        y += 18;
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(21, 128, 61);
        const splitAns = doc.splitTextToSize(`Pedoman/Kunci: ${q.pedomanPenskoran || q.kunciJawaban}`, contentWidth - 10);
        doc.text(splitAns, margin + 5, y);
        y += splitAns.length * 4.2 + 2;
        doc.setTextColor(0, 0, 0);
      }
    }
  }

  const typeTag = withAnswerKey ? 'Kunci-Guru' : 'Naskah-Siswa';
  doc.save(`Soal-${naskah.mataPelajaran.replace(/\s+/g, '_')}-${naskah.kelas}-${typeTag}.pdf`);
}

// =========================================================================
// 2. EXPORT MODUL AJAR / RPP (WORD .DOCX & PDF)
// =========================================================================

export async function exportModulAjarToDocx(modul: ModulAjarAI, schoolName: string = 'PORTAL SEKOLAH') {
  const paragraphs: (Paragraph | Table)[] = [];

  // Title & Header
  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: modul.judul.toUpperCase(), bold: true, size: 26, font: 'Arial' }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: `${schoolName.toUpperCase()}  •  ${modul.kurikulum || 'KURIKULUM MERDEKA'}`, bold: true, size: 20, font: 'Arial', color: '1E40AF' }),
      ],
      spacing: { after: 250 },
    })
  );

  // Section 1: Informasi Umum Table
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'A. INFORMASI UMUM', bold: true, size: 22, font: 'Arial' }),
      ],
      spacing: { before: 100, after: 100 },
    })
  );

  const infoRows = [
    ['Penyusun / Guru', modul.guruName || 'Guru Mata Pelajaran'],
    ['Instansi / Sekolah', schoolName],
    ['Mata Pelajaran', modul.mataPelajaran],
    ['Fase / Kelas', modul.faseKelas],
    ['Alokasi Waktu', modul.alokasiWaktu || '2 JP (2 x 35 Menit)'],
    ['Model Pembelajaran', modul.modelPembelajaran || 'Problem Based Learning (PBL)'],
    ['Profil Pelajar Pancasila', (modul.targetProfilPelajar || []).join(', ') || 'Mandiri, Bernalar Kritis, Gotong Royong'],
    ['Sarana & Prasarana', (modul.saranaPrasarana || []).join(', ') || 'Laptop, Proyektor, LKPD, Benda Konkret'],
  ];

  paragraphs.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: infoRows.map(row => (
        new TableRow({
          children: [
            new TableCell({
              width: { size: 30, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [new TextRun({ text: row[0], bold: true, size: 19, font: 'Arial' })] })],
            }),
            new TableCell({
              width: { size: 70, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [new TextRun({ text: row[1], size: 19, font: 'Arial' })] })],
            }),
          ],
        })
      )),
    })
  );

  // Section 2: Komponen Inti
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'B. KOMPONEN INTI', bold: true, size: 22, font: 'Arial' }),
      ],
      spacing: { before: 250, after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: '1. Tujuan Pembelajaran (TP):', bold: true, size: 20, font: 'Arial' }),
      ],
    })
  );

  (modul.tujuanPembelajaran || []).forEach(tp => {
    paragraphs.push(
      new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun({ text: tp, size: 19, font: 'Arial' })],
      })
    );
  });

  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: '2. Pemahaman Bermakna:', bold: true, size: 20, font: 'Arial' }),
      ],
      spacing: { before: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: modul.pemahamanBermakna || '-', size: 19, font: 'Arial' })],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: '3. Pertanyaan Pemantik:', bold: true, size: 20, font: 'Arial' }),
      ],
      spacing: { before: 100 },
    })
  );

  (modul.pertanyaanPemantik || []).forEach(pp => {
    paragraphs.push(
      new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun({ text: pp, size: 19, font: 'Arial' })],
      })
    );
  });

  // Section 3: Kegiatan Pembelajaran
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'C. LANGKAH-LANGKAH KEGIATAN PEMBELAJARAN', bold: true, size: 22, font: 'Arial' }),
      ],
      spacing: { before: 250, after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'a. Kegiatan Pendahuluan (10 Menit):', bold: true, size: 20, font: 'Arial' })],
    })
  );
  (modul.kegiatanPembelajaran?.pendahuluan || []).forEach(p => {
    paragraphs.push(
      new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun({ text: p, size: 19, font: 'Arial' })],
      })
    );
  });

  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: 'b. Kegiatan Inti (50 Menit):', bold: true, size: 20, font: 'Arial' })],
      spacing: { before: 100 },
    })
  );
  (modul.kegiatanPembelajaran?.inti || []).forEach(p => {
    paragraphs.push(
      new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun({ text: p, size: 19, font: 'Arial' })],
      })
    );
  });

  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: 'c. Kegiatan Penutup (10 Menit):', bold: true, size: 20, font: 'Arial' })],
      spacing: { before: 100 },
    })
  );
  (modul.kegiatanPembelajaran?.penutup || []).forEach(p => {
    paragraphs.push(
      new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun({ text: p, size: 19, font: 'Arial' })],
      })
    );
  });

  // Section 4: Asesmen
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'D. ASESMEN & EVALUASI PEMBELAJARAN', bold: true, size: 22, font: 'Arial' }),
      ],
      spacing: { before: 250, after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `• Asesmen Diagnostik: `, bold: true, size: 19, font: 'Arial' }),
        new TextRun({ text: modul.asesmen?.diagnostik || 'Tanya jawab apersepsi di awal pembelajaran', size: 19, font: 'Arial' }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `• Asesmen Formatif: `, bold: true, size: 19, font: 'Arial' }),
        new TextRun({ text: modul.asesmen?.formatif || 'Observasi keaktifan diskusi dan pengerjaan LKPD', size: 19, font: 'Arial' }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `• Asesmen Sumatif: `, bold: true, size: 19, font: 'Arial' }),
        new TextRun({ text: modul.asesmen?.sumatif || 'Tes tertulis / unjuk kerja pemahaman konsep di akhir materi', size: 19, font: 'Arial' }),
      ],
    })
  );

  if (modul.asesmen?.rubrik) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Rubrik Penilaian & KKTP:', bold: true, size: 19, font: 'Arial' }),
        ],
        spacing: { before: 100 },
      }),
      new Paragraph({
        children: [new TextRun({ text: modul.asesmen.rubrik, size: 18, font: 'Arial' })],
      })
    );
  }

  const doc = new Document({
    sections: [{ properties: {}, children: paragraphs }],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `Modul-Ajar-${modul.mataPelajaran.replace(/\s+/g, '_')}-${modul.faseKelas.replace(/\s+/g, '_')}.docx`);
}

export async function exportModulAjarToPdf(modul: ModulAjarAI, schoolName: string = 'PORTAL SEKOLAH') {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const margin = 16;
  const contentWidth = pageWidth - (margin * 2);
  let y = 18;

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > 280) {
      doc.addPage();
      y = 18;
    }
  };

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(modul.judul.toUpperCase(), pageWidth / 2, y, { align: 'center' });
  y += 6;

  doc.setFontSize(10.5);
  doc.setTextColor(30, 64, 175);
  doc.text(`${schoolName.toUpperCase()}  •  ${modul.kurikulum || 'KURIKULUM MERDEKA'}`, pageWidth / 2, y, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 5;

  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // A. Informasi Umum
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('A. INFORMASI UMUM', margin, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const infoLines = [
    `Penyusun: ${modul.guruName || 'Guru Mata Pelajaran'}  |  Mata Pelajaran: ${modul.mataPelajaran}`,
    `Fase / Kelas: ${modul.faseKelas}  |  Alokasi Waktu: ${modul.alokasiWaktu}`,
    `Model Pembelajaran: ${modul.modelPembelajaran || 'Problem Based Learning (PBL)'}`,
    `Target Profil Pelajar: ${(modul.targetProfilPelajar || []).join(', ')}`,
    `Sarana & Prasarana: ${(modul.saranaPrasarana || []).join(', ')}`,
  ];
  infoLines.forEach(line => {
    const split = doc.splitTextToSize(line, contentWidth);
    doc.text(split, margin, y);
    y += split.length * 4.2;
  });
  y += 3;

  // B. Komponen Inti
  checkPageBreak(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('B. KOMPONEN INTI', margin, y);
  y += 5;

  doc.setFontSize(9.5);
  doc.text('1. Tujuan Pembelajaran (TP):', margin, y);
  y += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  (modul.tujuanPembelajaran || []).forEach(tp => {
    const split = doc.splitTextToSize(`• ${tp}`, contentWidth - 4);
    checkPageBreak(split.length * 4.2);
    doc.text(split, margin + 4, y);
    y += split.length * 4.2;
  });
  y += 2;

  checkPageBreak(15);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('2. Pemahaman Bermakna & Pertanyaan Pemantik:', margin, y);
  y += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const pmbSplit = doc.splitTextToSize(`Makna: ${modul.pemahamanBermakna || '-'}`, contentWidth - 4);
  doc.text(pmbSplit, margin + 4, y);
  y += pmbSplit.length * 4.2 + 1;

  (modul.pertanyaanPemantik || []).forEach(pp => {
    const split = doc.splitTextToSize(`? ${pp}`, contentWidth - 4);
    checkPageBreak(split.length * 4.2);
    doc.text(split, margin + 4, y);
    y += split.length * 4.2;
  });
  y += 3;

  // C. Kegiatan Pembelajaran
  checkPageBreak(25);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('C. LANGKAH-LANGKAH KEGIATAN PEMBELAJARAN', margin, y);
  y += 5;

  const renderSteps = (title: string, steps: string[]) => {
    checkPageBreak(12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(title, margin, y);
    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    (steps || []).forEach((st, idx) => {
      const split = doc.splitTextToSize(`${idx + 1}. ${st}`, contentWidth - 4);
      checkPageBreak(split.length * 4.2);
      doc.text(split, margin + 4, y);
      y += split.length * 4.2;
    });
    y += 2;
  };

  renderSteps('a. Kegiatan Pendahuluan (10 Menit)', modul.kegiatanPembelajaran?.pendahuluan || []);
  renderSteps('b. Kegiatan Inti (50 Menit)', modul.kegiatanPembelajaran?.inti || []);
  renderSteps('c. Kegiatan Penutup (10 Menit)', modul.kegiatanPembelajaran?.penutup || []);

  // D. Asesmen
  checkPageBreak(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('D. ASESMEN & EVALUASI', margin, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const asLines = [
    `• Diagnostik: ${modul.asesmen?.diagnostik || '-'}`,
    `• Formatif  : ${modul.asesmen?.formatif || '-'}`,
    `• Sumatif   : ${modul.asesmen?.sumatif || '-'}`,
  ];
  asLines.forEach(l => {
    const split = doc.splitTextToSize(l, contentWidth);
    checkPageBreak(split.length * 4.2);
    doc.text(split, margin, y);
    y += split.length * 4.2;
  });

  doc.save(`Modul-Ajar-${modul.mataPelajaran.replace(/\s+/g, '_')}-${modul.faseKelas.replace(/\s+/g, '_')}.pdf`);
}

// =========================================================================
// 3. EXPORT VISUAL LKPD (WORD .DOCX & PDF WITH EMBEDDED HIGH-RES IMAGES)
// =========================================================================

export async function exportLkpdToDocx(bahanAjar: BahanAjarAI) {
  const lkpd = bahanAjar.lkpdData;
  if (!lkpd || !lkpd.halamanList || lkpd.halamanList.length === 0) {
    throw new Error('Data LKPD tidak memiliki halaman gambar visual yang siap diekspor.');
  }

  const paragraphs: Paragraph[] = [];

  for (let i = 0; i < lkpd.halamanList.length; i++) {
    const hal = lkpd.halamanList[i];
    if (hal.pngDataUri) {
      const imgBuffer = await dataUriToImageUint8Array(hal.pngDataUri);
      if (imgBuffer) {
        paragraphs.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                data: imgBuffer,
                // Proportional A4 in word: 580 x 820 approx
                transformation: { width: 595, height: 842 },
                type: 'png',
              }),
            ],
            spacing: { after: 200 },
          })
        );
      }
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 }, // 0.5 inch margins
          },
        },
        children: paragraphs,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `LKPD-Visual-${lkpd.mataPelajaran.replace(/\s+/g, '_')}-${lkpd.kelas.replace(/\s+/g, '_')}.docx`);
}

export function exportLkpdToPdf(bahanAjar: BahanAjarAI) {
  const lkpd = bahanAjar.lkpdData;
  if (!lkpd || !lkpd.halamanList || lkpd.halamanList.length === 0) {
    throw new Error('Data LKPD tidak memiliki halaman gambar visual yang siap diekspor.');
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;

  lkpd.halamanList.forEach((hal, idx) => {
    if (idx > 0) doc.addPage();
    if (hal.pngDataUri) {
      // Fit full A4 page cleanly
      doc.addImage(hal.pngDataUri, 'PNG', 0, 0, pageWidth, pageHeight);
    }
  });

  doc.save(`LKPD-Visual-${lkpd.mataPelajaran.replace(/\s+/g, '_')}-${lkpd.kelas.replace(/\s+/g, '_')}.pdf`);
}
