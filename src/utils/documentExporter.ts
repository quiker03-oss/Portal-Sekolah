// Document exporter for Soal Ulangan, Modul Ajar (RPP), and Visual LKPD
// Supports real Word (.docx) and PDF (.pdf) with embedded illustrations and images
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx';
import jsPDF from 'jspdf';
import { ModulAjarAI, BahanAjarAI, LkpdData, AiReaderSessionRecord } from '../types';

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

// =========================================================================
// 4. EXPORT AI PEMBACA SOAL OTOMATIS (WORD .DOCX & PDF .PDF)
// =========================================================================

function normalizeTextForPdf(input: string): string {
  return String(input || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2022/g, '-')
    .replace(/\u00D7/g, 'x')
    .replace(/\u00F7/g, '/')
    .replace(/\u2264/g, '<=')
    .replace(/\u2265/g, '>=')
    .replace(/\u2260/g, '!=')
    .replace(/\u00B1/g, '+/-')
    .replace(/\u221A/g, 'akar ')
    .replace(/\u00B2/g, '^2')
    .replace(/\u00B3/g, '^3')
    .replace(/\u00B0/g, ' derajat')
    .replace(/\u2192/g, '->')
    .replace(/\u03C0/g, 'pi')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, ' ');
}

export async function exportAiReaderToDocx(
  session: AiReaderSessionRecord,
  schoolName?: string
) {
  if (!session || !Array.isArray(session.soalList) || session.soalList.length === 0) {
    throw new Error('Tidak ada daftar soal yang dapat diekspor ke Word.');
  }

  const children: Paragraph[] = [
    new Paragraph({
      text: session.judul || 'HASIL PEMBACAAN & PEMBAHASAN SOAL AI',
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `${schoolName ? `${schoolName} · ` : ''}Sumber: ${session.namaFiles.join(', ') || '-'} · Total: ${session.soalList.length} Soal`,
          size: 20,
          color: '475569',
        }),
      ],
      spacing: { after: 280 },
    }),
  ];

  for (const q of session.soalList) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `NOMOR SOAL: ${q.nomor}`,
            bold: true,
            size: 24,
            color: '1E3A8A',
          }),
          ...(q.sumberFile
            ? [
                new TextRun({
                  text: `  (${q.sumberFile}${q.halaman ? ` · Hal. ${q.halaman}` : ''})`,
                  size: 18,
                  color: '64748B',
                }),
              ]
            : []),
        ],
        spacing: { before: 220, after: 80 },
      })
    );

    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'PERTANYAAN:', bold: true, size: 22 })],
        spacing: { after: 40 },
      })
    );

    q.pertanyaan.split('\n').forEach((line) => {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: line || ' ', size: 22 })],
          spacing: { after: 40 },
        })
      );
    });

    if (q.previewGambarDataUri) {
      const imgBuffer = await dataUriToImageUint8Array(q.previewGambarDataUri);
      if (imgBuffer) {
        children.push(
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [
              new ImageRun({
                data: imgBuffer,
                transformation: { width: 320, height: 220 },
                type: 'jpg',
              }),
            ],
            spacing: { before: 60, after: 80 },
          })
        );
      }
    }

    if (q.pilihan && Object.keys(q.pilihan).length > 0) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: 'PILIHAN JAWABAN:', bold: true, size: 22 })],
          spacing: { before: 80, after: 40 },
        })
      );
      (['A', 'B', 'C', 'D', 'E'] as const).forEach((key) => {
        const opt = q.pilihan?.[key];
        if (opt) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: `${key}. ${opt}`, size: 22 })],
              indent: { left: 280 },
              spacing: { after: 30 },
            })
          );
        }
      });
    }

    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'JAWABAN: ', bold: true, size: 22, color: '047857' }),
          new TextRun({
            text: q.jawaban || '(Belum dijawab)',
            bold: Boolean(q.jawaban),
            size: 22,
          }),
        ],
        spacing: { before: 80, after: 60 },
      })
    );

    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'PEMBAHASAN:', bold: true, size: 22 })],
        spacing: { after: 40 },
      })
    );

    const pembahasanText = q.pembahasan || '(Belum ada pembahasan)';
    pembahasanText.split('\n').forEach((line) => {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: line || ' ', size: 21, color: '1E293B' })],
          spacing: { after: 40 },
        })
      );
    });

    if (Array.isArray(q.langkahMatematika) && q.langkahMatematika.length > 0) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: 'Langkah Penyelesaian:', bold: true, size: 21 })],
          spacing: { before: 60, after: 30 },
        })
      );
      q.langkahMatematika.forEach((step, sIdx) => {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `${sIdx + 1}. ${step}`, size: 21 })],
            indent: { left: 280 },
            spacing: { after: 30 },
          })
        );
      });
    }

    children.push(
      new Paragraph({
        border: {
          bottom: { color: 'CBD5E1', space: 4, style: BorderStyle.SINGLE, size: 6 },
        },
        spacing: { before: 100, after: 140 },
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 960, bottom: 960, left: 1080, right: 1080 },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const safeName = (session.judul || 'Pembaca_Soal_AI').replace(/[^a-zA-Z0-9_-]+/g, '_');
  downloadBlob(blob, `${safeName}.docx`);
}

export function exportAiReaderToPdf(
  session: AiReaderSessionRecord,
  schoolName?: string
) {
  if (!session || !Array.isArray(session.soalList) || session.soalList.length === 0) {
    throw new Error('Tidak ada daftar soal yang dapat diekspor ke PDF.');
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = 18;

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > pageHeight - 16) {
      doc.addPage();
      y = 18;
    }
  };

  const writeWrapped = (
    rawText: string,
    options: { fontSize?: number; bold?: boolean; indent?: number; color?: [number, number, number]; lineHeight?: number } = {}
  ) => {
    const fontSize = options.fontSize ?? 10;
    const indent = options.indent ?? 0;
    const lineHeight = options.lineHeight ?? 4.8;
    const color = options.color ?? [30, 41, 59];

    doc.setFont('helvetica', options.bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(color[0], color[1], color[2]);

    const normalized = normalizeTextForPdf(rawText);
    const lines = doc.splitTextToSize(normalized, contentWidth - indent);
    for (const line of lines) {
      ensureSpace(lineHeight + 2);
      doc.text(line, margin + indent, y);
      y += lineHeight;
    }
  };

  // Document Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  const titleLines = doc.splitTextToSize(
    normalizeTextForPdf(session.judul || 'HASIL PEMBACAAN & PEMBAHASAN SOAL AI'),
    contentWidth
  );
  titleLines.forEach((line: string) => {
    doc.text(line, pageWidth / 2, y, { align: 'center' });
    y += 5.5;
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  const metaLine = normalizeTextForPdf(
    `${schoolName ? `${schoolName} | ` : ''}Sumber: ${session.namaFiles.join(', ') || '-'} | Total: ${session.soalList.length} Soal`
  );
  const metaLines = doc.splitTextToSize(metaLine, contentWidth);
  metaLines.forEach((line: string) => {
    doc.text(line, pageWidth / 2, y, { align: 'center' });
    y += 4.2;
  });
  y += 3;
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // Questions
  session.soalList.forEach((q) => {
    ensureSpace(22);
    writeWrapped(`NOMOR SOAL: ${q.nomor}`, {
      fontSize: 10.5,
      bold: true,
      color: [30, 58, 138],
      lineHeight: 5.2,
    });
    y += 0.5;

    writeWrapped('PERTANYAAN:', { fontSize: 9.5, bold: true, color: [15, 23, 42] });
    writeWrapped(q.pertanyaan, { fontSize: 10, color: [15, 23, 42] });
    y += 1.5;

    if (q.pilihan && Object.keys(q.pilihan).length > 0) {
      writeWrapped('PILIHAN JAWABAN:', { fontSize: 9.5, bold: true, color: [15, 23, 42] });
      (['A', 'B', 'C', 'D', 'E'] as const).forEach((key) => {
        const opt = q.pilihan?.[key];
        if (opt) {
          writeWrapped(`${key}. ${opt}`, { fontSize: 9.8, indent: 4, color: [30, 41, 59] });
        }
      });
      y += 1.5;
    }

    writeWrapped(`JAWABAN: ${q.jawaban || '(Belum dijawab)'}`, {
      fontSize: 10,
      bold: true,
      color: [4, 120, 87],
    });
    y += 1;

    writeWrapped('PEMBAHASAN:', { fontSize: 9.5, bold: true, color: [15, 23, 42] });
    writeWrapped(q.pembahasan || '(Belum ada pembahasan)', {
      fontSize: 9.5,
      color: [51, 65, 85],
    });

    if (Array.isArray(q.langkahMatematika) && q.langkahMatematika.length > 0) {
      y += 1;
      writeWrapped('Langkah Penyelesaian:', { fontSize: 9.5, bold: true, color: [15, 23, 42] });
      q.langkahMatematika.forEach((step, idx) => {
        writeWrapped(`${idx + 1}. ${step}`, { fontSize: 9.3, indent: 4, color: [51, 65, 85] });
      });
    }

    y += 3;
    ensureSpace(6);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;
  });

  const safeName = (session.judul || 'Pembaca_Soal_AI').replace(/[^a-zA-Z0-9_-]+/g, '_');
  doc.save(`${safeName}.pdf`);
}
