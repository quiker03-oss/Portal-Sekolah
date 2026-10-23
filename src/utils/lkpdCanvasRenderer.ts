// Canvas-based High-DPI A4 Image Renderer for Visual LKPD
import { LkpdData, LkpdHalaman, LkpdAktivitasItem } from '../types';

export interface RenderLkpdOptions {
  schoolName?: string;
  themeColor?: string; // e.g. '#2563EB'
  width?: number; // default: 1240 (A4 at approx 150 DPI)
  height?: number; // default: 1754
}

/**
 * Loads an image (data URI, SVG data URI, or URL) into an HTMLImageElement
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => {
      // Create a fallback blank image to prevent canvas breaking
      const fallback = new Image();
      fallback.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%23e2e8f0"/><text x="50" y="50" font-size="12" text-anchor="middle" fill="%2364748b">Ilustrasi</text></svg>';
      fallback.onload = () => resolve(fallback);
      fallback.onerror = () => reject(new Error('Failed to load image'));
    };
    img.src = src;
  });
}

/**
 * Wraps text onto multiple lines within a max width
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

/**
 * Draws rounded rectangle
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number = 8
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Renders a single LKPD page to a high-resolution PNG Data URI
 */
export async function renderLkpdPageToPng(
  lkpd: LkpdData,
  halaman: LkpdHalaman,
  options: RenderLkpdOptions = {}
): Promise<string> {
  const width = options.width || 1240; // A4 standard proportional 1:1.414
  const height = options.height || 1754;
  const schoolName = options.schoolName || 'PORTAL SEKOLAH';
  const theme = lkpd.warnaAksen || options.themeColor || '#1E40AF'; // Deep royal blue

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context not available');
  }

  // 1. Background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Decorative border
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 4;
  ctx.strokeRect(36, 36, width - 72, height - 72);

  // Inner colorful frame
  ctx.strokeStyle = theme;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(42, 42, width - 84, height - 84);

  // 2. Header Banner
  const headerHeight = 130;
  const bannerGrad = ctx.createLinearGradient(42, 42, width - 42, 42 + headerHeight);
  bannerGrad.addColorStop(0, theme);
  bannerGrad.addColorStop(1, '#3B82F6');
  ctx.fillStyle = bannerGrad;
  roundRect(ctx, 42, 42, width - 84, headerHeight, 10);
  ctx.fill();

  // Header texts
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // School name / Sub-badge
  ctx.font = 'bold 15px sans-serif';
  ctx.letterSpacing = '1px';
  ctx.fillText(schoolName.toUpperCase() + '  •  KURIKULUM PEMBELAJARAN', width / 2, 54);

  // Main Title
  ctx.font = '900 28px sans-serif';
  ctx.fillText('LEMBAR KERJA PESERTA DIDIK (LKPD)', width / 2, 78);

  // Subject and Topic Tag
  ctx.font = 'bold 16px sans-serif';
  const subtitle = `${lkpd.mataPelajaran || 'Mata Pelajaran'}  |  ${lkpd.kelas || 'Semua Kelas'}  |  Topik: ${lkpd.topikMateri || lkpd.judulLkpd}`;
  ctx.fillText(subtitle, width / 2, 116);

  // Page indicator badge (top right of header)
  ctx.fillStyle = '#FEF08A'; // soft yellow
  ctx.strokeStyle = '#CA8A04';
  ctx.lineWidth = 1.5;
  roundRect(ctx, width - 210, 52, 145, 34, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#854D0E';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`HALAMAN ${halaman.nomorHalaman || 1}`, width - 138, 62);

  let currentY = 186;

  // 3. Student Identity Box (Only on page 1 or compact on subsequent pages)
  if (halaman.nomorHalaman === 1) {
    ctx.fillStyle = '#F8FAFC';
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1.5;
    roundRect(ctx, 50, currentY, width - 100, 78, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#1E293B';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';

    // Col 1: Nama & Kelas
    ctx.fillText('Nama Siswa :', 68, currentY + 18);
    ctx.font = '14px sans-serif';
    ctx.strokeStyle = '#94A3B8';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(165, currentY + 32);
    ctx.lineTo(440, currentY + 32);
    ctx.stroke();

    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('Kelas / No. :', 68, currentY + 48);
    ctx.beginPath();
    ctx.moveTo(165, currentY + 62);
    ctx.lineTo(440, currentY + 62);
    ctx.stroke();

    // Col 2: Tanggal & Waktu
    ctx.fillText('Hari / Tgl  :', 465, currentY + 18);
    ctx.beginPath();
    ctx.moveTo(555, currentY + 32);
    ctx.lineTo(820, currentY + 32);
    ctx.stroke();

    ctx.fillText('Waktu / Jam :', 465, currentY + 48);
    ctx.beginPath();
    ctx.moveTo(555, currentY + 62);
    ctx.lineTo(820, currentY + 62);
    ctx.stroke();
    ctx.setLineDash([]); // Reset line dash

    // Col 3: Box Nilai & Paraf
    ctx.fillStyle = '#EFF6FF';
    ctx.strokeStyle = theme;
    ctx.lineWidth = 1.5;
    roundRect(ctx, 845, currentY + 8, 175, 62, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = theme;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NILAI & PARAF GURU', 845 + 175 / 2, currentY + 14);

    // Inner empty stamp area
    ctx.strokeStyle = '#93C5FD';
    ctx.setLineDash([2, 2]);
    ctx.strokeRect(855, currentY + 32, 155, 30);
    ctx.setLineDash([]);

    currentY += 92;

    // 4. Instructions & Objectives box
    if (lkpd.petunjukPengerjaan && lkpd.petunjukPengerjaan.length > 0) {
      ctx.fillStyle = '#FEF3C7'; // warm amber tint
      ctx.strokeStyle = '#FDE68A';
      roundRect(ctx, 50, currentY, width - 100, 52, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#92400E';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('💡 PETUNJUK PENGERJAAN:', 66, currentY + 10);

      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#78350F';
      const petunjukCombined = lkpd.petunjukPengerjaan.slice(0, 2).join('  •  ');
      ctx.fillText(petunjukCombined, 66, currentY + 30);

      currentY += 62;
    }
  } else {
    // Compact identity header on page > 1
    ctx.fillStyle = '#F1F5F9';
    roundRect(ctx, 50, currentY, width - 100, 36, 6);
    ctx.fill();

    ctx.fillStyle = '#475569';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Nama Siswa: ______________________  |  Kelas: ____________  |  Halaman ${halaman.nomorHalaman}`, 66, currentY + 12);
    currentY += 46;
  }

  // 5. Render Activities
  const maxY = height - 90; // Leave room for footer
  const aktivitasList = halaman.aktivitas || [];

  for (let i = 0; i < aktivitasList.length; i++) {
    const act = aktivitasList[i];
    if (currentY > maxY - 120) break; // prevent overflowing off-screen

    currentY = await renderAktivitasItem(ctx, act, currentY, width, theme);
    currentY += 16; // spacing between activities
  }

  // 6. Page Footer
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(50, height - 60);
  ctx.lineTo(width - 50, height - 60);
  ctx.stroke();

  ctx.fillStyle = '#64748B';
  ctx.font = 'italic 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('🌱 "Belajarlah dengan gembira, teliti dalam mengerjakan, dan raih prestasi terbaikmu!"', 60, height - 42);

  ctx.textAlign = 'right';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText(`Dokumen Pembelajaran  •  Halaman ${halaman.nomorHalaman || 1}`, width - 60, height - 42);

  return canvas.toDataURL('image/png', 1.0);
}

/**
 * Draws an individual activity item
 */
async function renderAktivitasItem(
  ctx: CanvasRenderingContext2D,
  act: LkpdAktivitasItem,
  startY: number,
  canvasWidth: number,
  themeColor: string
): Promise<number> {
  const contentWidth = canvasWidth - 100;
  const leftX = 50;
  let y = startY;

  // Activity Number Badge & Instruction Title
  ctx.fillStyle = themeColor;
  roundRect(ctx, leftX, y, 32, 28, 6);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${act.nomor || 1}`, leftX + 16, y + 6);

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'left';
  const instructionLines = wrapText(ctx, act.instruksi || 'Lakukan kegiatan berikut dengan cermat:', contentWidth - 45);
  instructionLines.forEach((line, idx) => {
    ctx.fillText(line, leftX + 42, y + 6 + (idx * 20));
  });
  y += Math.max(34, 10 + (instructionLines.length * 20));

  // If question text exists
  if (act.pertanyaan) {
    ctx.fillStyle = '#334155';
    ctx.font = '14px sans-serif';
    const qLines = wrapText(ctx, act.pertanyaan, contentWidth - 20);
    qLines.forEach((line, idx) => {
      ctx.fillText(line, leftX + 10, y + (idx * 19));
    });
    y += (qLines.length * 19) + 8;
  }

  // Type-specific rendering
  if (act.tipe === 'tanya_gambar' || act.gambar) {
    if (act.gambar) {
      try {
        const img = await loadImage(act.gambar);
        // Draw image frame
        const maxImgWidth = Math.min(380, contentWidth - 40);
        const imgScale = Math.min(maxImgWidth / img.width, 180 / img.height, 1);
        const drawW = img.width * imgScale;
        const drawH = img.height * imgScale;
        const imgX = leftX + (contentWidth - drawW) / 2;

        ctx.fillStyle = '#F8FAFC';
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 1;
        roundRect(ctx, imgX - 6, y - 4, drawW + 12, drawH + 8, 8);
        ctx.fill();
        ctx.stroke();

        ctx.drawImage(img, imgX, y, drawW, drawH);
        y += drawH + 12;

        if (act.gambarCaption) {
          ctx.fillStyle = '#64748B';
          ctx.font = 'italic 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`Gambar: ${act.gambarCaption}`, canvasWidth / 2, y);
          y += 18;
        }
      } catch (err) {
        console.warn('Failed to render activity image', err);
      }
    }

    // Draw answer writing lines or answer box
    const linesCount = act.garisJawaban || 3;
    ctx.strokeStyle = '#CBD5E1';
    ctx.setLineDash([4, 4]);
    for (let l = 0; l < linesCount; l++) {
      ctx.beginPath();
      ctx.moveTo(leftX + 20, y + 20 + (l * 28));
      ctx.lineTo(leftX + contentWidth - 20, y + 20 + (l * 28));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    y += (linesCount * 28) + 12;
  } else if (act.tipe === 'cocokkan' && act.pilihanKiri && act.pilihanKanan) {
    // Matching columns with connection dots
    const leftItems = act.pilihanKiri;
    const rightItems = act.pilihanKanan;
    const rowCount = Math.max(leftItems.length, rightItems.length);
    const colWidth = (contentWidth - 100) / 2;

    for (let r = 0; r < rowCount; r++) {
      const rowY = y + (r * 44);

      // Left Item Box
      if (leftItems[r]) {
        ctx.fillStyle = '#F1F5F9';
        ctx.strokeStyle = '#94A3B8';
        ctx.lineWidth = 1;
        roundRect(ctx, leftX + 10, rowY, colWidth - 20, 36, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#1E293B';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(leftItems[r], leftX + 22, rowY + 11);

        // Connection dot (right side of left item)
        ctx.fillStyle = themeColor;
        ctx.beginPath();
        ctx.arc(leftX + colWidth - 10, rowY + 18, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Right Item Box
      if (rightItems[r]) {
        const rightX = leftX + colWidth + 80;
        // Connection dot (left side of right item)
        ctx.fillStyle = themeColor;
        ctx.beginPath();
        ctx.arc(rightX - 10, rowY + 18, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#F1F5F9';
        ctx.strokeStyle = '#94A3B8';
        ctx.lineWidth = 1;
        roundRect(ctx, rightX, rowY, colWidth - 20, 36, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#1E293B';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(rightItems[r], rightX + 12, rowY + 11);
      }
    }
    y += (rowCount * 44) + 12;
  } else if (act.tipe === 'hitung_objek' && act.objekHitung) {
    // Counting exercise with visual badges and answer boxes
    const gridCols = Math.min(3, act.objekHitung.length);
    const boxW = (contentWidth - ((gridCols - 1) * 20)) / gridCols;
    let rowIdx = 0;

    for (let i = 0; i < act.objekHitung.length; i++) {
      const item = act.objekHitung[i];
      const colIdx = i % gridCols;
      if (i > 0 && colIdx === 0) rowIdx++;
      const itemX = leftX + (colIdx * (boxW + 20));
      const itemY = y + (rowIdx * 110);

      // Card container
      ctx.fillStyle = '#F8FAFC';
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1;
      roundRect(ctx, itemX, itemY, boxW, 100, 8);
      ctx.fill();
      ctx.stroke();

      // Object visual representation
      ctx.fillStyle = '#0284C7';
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      const shapeEmoji = item.emojiOrShape || '⭐';
      // Repeat shape up to 10 for illustration
      const displaySymbols = Array(Math.min(item.jumlah || 5, 8)).fill(shapeEmoji).join(' ');
      ctx.fillText(displaySymbols, itemX + (boxW / 2), itemY + 22);

      // Label & Answer box
      ctx.fillStyle = '#334155';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(item.nama, itemX + (boxW / 2), itemY + 56);

      // Small blank square for student answer
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = themeColor;
      ctx.lineWidth = 2;
      roundRect(ctx, itemX + (boxW / 2) - 24, itemY + 70, 48, 24, 4);
      ctx.fill();
      ctx.stroke();
    }
    y += ((rowIdx + 1) * 110) + 12;
  } else if (act.tipe === 'urutkan' && act.itemUrutan) {
    // Sorting / Ordering activity
    const items = act.itemUrutan;
    const boxW = Math.min(220, (contentWidth - (items.length * 15)) / items.length);

    for (let idx = 0; idx < items.length; idx++) {
      const itX = leftX + 10 + (idx * (boxW + 15));
      ctx.fillStyle = '#F1F5F9';
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1.5;
      roundRect(ctx, itX, y, boxW, 80, 8);
      ctx.fill();
      ctx.stroke();

      // Text inside
      ctx.fillStyle = '#0F172A';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      const itLines = wrapText(ctx, items[idx].teks, boxW - 16);
      itLines.forEach((l, lIdx) => {
        ctx.fillText(l, itX + (boxW / 2), y + 14 + (lIdx * 16));
      });

      // Bottom circle for student ordering number: [  ]
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = themeColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(itX + (boxW / 2), y + 64, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    y += 94;
  } else if (act.tipe === 'tabel_pengamatan' && act.kolomTabel) {
    // Structured observation table
    const headers = act.kolomTabel;
    const rows = act.barisTabel || Array(3).fill(headers.map(() => ''));
    const colW = (contentWidth - 20) / headers.length;

    // Header row
    ctx.fillStyle = themeColor;
    ctx.fillRect(leftX + 10, y, contentWidth - 20, 32);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    headers.forEach((h, hIdx) => {
      ctx.fillText(h, leftX + 10 + (hIdx * colW) + (colW / 2), y + 10);
    });
    y += 32;

    // Blank or prefilled data rows
    ctx.font = '12px sans-serif';
    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const rY = y + (rIdx * 30);
      ctx.fillStyle = rIdx % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
      ctx.fillRect(leftX + 10, rY, contentWidth - 20, 30);
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1;
      ctx.strokeRect(leftX + 10, rY, contentWidth - 20, 30);

      // Vertical separators
      for (let cIdx = 1; cIdx < headers.length; cIdx++) {
        ctx.beginPath();
        ctx.moveTo(leftX + 10 + (cIdx * colW), rY);
        ctx.lineTo(leftX + 10 + (cIdx * colW), rY + 30);
        ctx.stroke();
      }

      // Value if present
      const rowData = rows[rIdx];
      if (rowData) {
        ctx.fillStyle = '#1E293B';
        rowData.forEach((val, vIdx) => {
          if (val) ctx.fillText(val, leftX + 10 + (vIdx * colW) + (colW / 2), rY + 9);
        });
      }
    }
    y += (rows.length * 30) + 12;
  } else {
    // Default: Ruled writing lines / Answer box
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    roundRect(ctx, leftX + 10, y, contentWidth - 20, 75, 6);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#E2E8F0';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(leftX + 20, y + 26);
    ctx.lineTo(leftX + contentWidth - 20, y + 26);
    ctx.moveTo(leftX + 20, y + 50);
    ctx.lineTo(leftX + contentWidth - 20, y + 50);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#94A3B8';
    ctx.font = 'italic 11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Tuliskan jawabanmu di atas baris...', leftX + contentWidth - 30, y + 62);
    y += 88;
  }

  return y;
}
