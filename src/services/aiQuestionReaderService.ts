import mammoth from 'mammoth';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import {
  AiReaderQuestionItem,
  AiReaderStatusJawaban,
  AiReaderValidationReport,
} from '../types';
import { safeFetchJson } from '../utils/apiHelper';
import {
  extractEmbeddedChoicesFromStem,
  stripRedundantOptionLabel,
  stripRedundantQuestionNumber,
  validateUploadedFileHeader,
} from '../utils/questionFormatValidator';

export interface AiReaderPreviewPage {
  pageNumber: number;
  dataUri: string;
  base64: string;
  mimeType: string;
  digitalText?: string;
}

export interface AiReaderPreviewTable {
  sheetName: string;
  headers: string[];
  rows: string[][];
}

export interface AiReaderUploadedFilePreview {
  id: string;
  fileName: string;
  fileType: 'pdf' | 'doc' | 'docx' | 'xls' | 'xlsx' | 'image';
  sizeBytes: number;
  pageCount?: number;
  previewPages?: AiReaderPreviewPage[];
  previewHtml?: string;
  previewText?: string;
  previewTables?: AiReaderPreviewTable[];
  warnings: string[];
}

export interface AiReaderProgressState {
  phase: 'preparing' | 'reading' | 'answering' | 'validating';
  current: number;
  total: number;
  label: string;
}

const ACCEPTED_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'webp'];

export function getAcceptedExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

export function isSupportedAiReaderFile(file: File): boolean {
  const ext = getAcceptedExtension(file.name);
  if (ACCEPTED_EXTENSIONS.includes(ext)) return true;
  const mime = (file.type || '').toLowerCase();
  return (
    mime === 'application/pdf' ||
    mime.startsWith('image/') ||
    mime.includes('wordprocessingml') ||
    mime.includes('msword') ||
    mime.includes('spreadsheetml') ||
    mime.includes('ms-excel')
  );
}

// =========================================================================
// TEXT & HTML NORMALIZATION HELPERS
// =========================================================================

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    });
}

function expandWordOrderedListsForReader(root: HTMLElement): void {
  const docRef = root.ownerDocument || document;
  let globalQuestionCounter = 0;

  const insertPrefixIntoLi = (li: HTMLLIElement, prefix: string) => {
    const firstEl = li.firstElementChild;
    if (firstEl && (firstEl.tagName === 'P' || firstEl.tagName === 'DIV')) {
      firstEl.insertBefore(docRef.createTextNode(prefix), firstEl.firstChild);
    } else {
      li.insertBefore(docRef.createTextNode(prefix), li.firstChild);
    }
  };

  const processList = (ol: HTMLOListElement, isOptionList: boolean) => {
    const listType = (ol.getAttribute('type') || '').toLowerCase();
    const startAttr = parseInt(ol.getAttribute('start') || '', 10);
    if (!isOptionList && Number.isFinite(startAttr) && startAttr > globalQuestionCounter) {
      globalQuestionCounter = startAttr - 1;
    }

    const listItems = Array.from(ol.children).filter(
      (el): el is HTMLLIElement => el.tagName === 'LI'
    );
    const effectiveOptionList = isOptionList || listType === 'a' || listType === 'i';

    listItems.forEach((li, itemIdx) => {
      const nestedOls = Array.from(li.querySelectorAll(':scope > ol')) as HTMLOListElement[];
      nestedOls.forEach((nested) => processList(nested, true));

      const currentText = (li.textContent || '').trim();
      const alreadyHasNumber = /^(?:soal\s*|no\.?\s*)?\(?\d+[\.\)\:]/.test(currentText);
      const alreadyHasLetter = /^\(?[A-Ea-e][\.\)]/.test(currentText);

      if (effectiveOptionList) {
        if (!alreadyHasLetter && itemIdx < 5) {
          const letter = String.fromCharCode(65 + itemIdx);
          insertPrefixIntoLi(li, `${letter}. `);
        }
      } else {
        globalQuestionCounter++;
        if (!alreadyHasNumber && !alreadyHasLetter) {
          insertPrefixIntoLi(li, `${globalQuestionCounter}. `);
        }
      }
    });

    const div = docRef.createElement('div');
    while (ol.firstChild) {
      const child = ol.firstChild;
      if (child instanceof HTMLElement && child.tagName === 'LI') {
        const p = docRef.createElement('p');
        while (child.firstChild) p.appendChild(child.firstChild);
        div.appendChild(p);
        ol.removeChild(child);
      } else {
        div.appendChild(child);
      }
    }
    ol.replaceWith(div);
  };

  const allOls = Array.from(root.querySelectorAll('ol'));
  for (const ol of allOls) {
    if (!ol.isConnected || ol.parentElement?.closest('ol')) continue;

    let scanSibling: Element | null = ol.previousElementSibling;
    let highestManualBefore = 0;
    let steps = 0;
    while (scanSibling && steps < 40) {
      steps++;
      const t = (scanSibling.textContent || '').trim();
      const m = t.match(/^(?:soal\s*|no\.?\s*)?\(?(\d{1,3})[\.\)]/i);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > highestManualBefore && n < 500) highestManualBefore = n;
      }
      scanSibling = scanSibling.previousElementSibling;
    }
    if (highestManualBefore > globalQuestionCounter) {
      globalQuestionCounter = highestManualBefore;
    }

    const listType = (ol.getAttribute('type') || '').toLowerCase();
    const directLis = Array.from(ol.children).filter((el) => el.tagName === 'LI');
    const hasNestedOl = directLis.some((li) => Boolean(li.querySelector('ol')));

    let precededByNumberedQuestion = false;
    let probe: Element | null = ol.previousElementSibling;
    for (let step = 0; step < 3 && probe; step++) {
      const prevText = (probe.textContent || '').trim();
      if (!prevText || prevText.startsWith('[GAMBAR_DOCX_')) {
        probe = probe.previousElementSibling;
        continue;
      }
      if (/^(?:soal\s*|no\.?\s*)?\(?\d+[\.\)\:]/.test(prevText) || prevText.endsWith('?') || prevText.endsWith('...')) {
        precededByNumberedQuestion = true;
      }
      break;
    }

    const treatAsOptions =
      listType === 'a' ||
      (!hasNestedOl &&
        precededByNumberedQuestion &&
        directLis.length >= 2 &&
        directLis.length <= 5 &&
        directLis.every((li) => !/^\(?\d+[\.\)]/.test((li.textContent || '').trim())));

    processList(ol as HTMLOListElement, treatAsOptions);
  }
}

function formatLayoutTableRowsForReader(parsedRows: string[][]): string[] {
  const outLines: string[] = [];
  for (const cells of parsedRows) {
    const nonEmpty = cells.map((c) => c.trim()).filter(Boolean);
    if (nonEmpty.length === 0) continue;

    if (
      nonEmpty.length >= 4 &&
      nonEmpty.length % 2 === 0 &&
      /^\(?[A-Ea-e1-9][\.\)]?$/.test(nonEmpty[0]) &&
      /^\(?[A-Ea-e][\.\)]?$/.test(nonEmpty[2])
    ) {
      for (let idx = 0; idx < nonEmpty.length; idx += 2) {
        const prefix = /[\.\)]$/.test(nonEmpty[idx]) ? nonEmpty[idx] : `${nonEmpty[idx]}.`;
        outLines.push(`${prefix} ${nonEmpty[idx + 1] || ''}`.trim());
      }
    } else if (
      nonEmpty.length >= 2 &&
      (/^\d+[\.\)]?$/.test(nonEmpty[0]) || /^\(?[A-Ea-e][\.\)]?$/.test(nonEmpty[0]))
    ) {
      const prefix = /[\.\)]$/.test(nonEmpty[0]) ? nonEmpty[0] : `${nonEmpty[0]}.`;
      outLines.push(`${prefix} ${nonEmpty.slice(1).join('\n')}`);
    } else {
      outLines.push(...nonEmpty);
    }
  }
  return outLines;
}

function htmlTableToMarkdown(tableHtml: string): string {
  const rowMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  if (rowMatches.length === 0) return '';
  const matrix = rowMatches.map((row) => {
    const cells = row.match(/<(?:th|td)[\s\S]*?<\/(?:th|td)>/gi) || [];
    return cells.map((c) =>
      decodeHtmlEntities(c.replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\|/g, '\\|')
    );
  });
  const colCount = Math.max(...matrix.map((r) => r.length), 1);
  const padded = matrix.map((r) => {
    const copy = [...r];
    while (copy.length < colCount) copy.push('');
    return copy;
  });
  const header = `| ${padded[0].join(' | ')} |`;
  const divider = `| ${padded[0].map(() => '---').join(' | ')} |`;
  const body = padded.slice(1).map((r) => `| ${r.join(' | ')} |`);
  return `\n${[header, divider, ...body].join('\n')}\n`;
}

function htmlToStructuredTextWithTables(html: string): {
  text: string;
  inlineImages: Array<{ index: number; dataUri: string; base64: string; mimeType: string }>;
} {
  const inlineImages: Array<{ index: number; dataUri: string; base64: string; mimeType: string }> = [];

  if (typeof DOMParser !== 'undefined') {
    try {
      const parsedDoc = new DOMParser().parseFromString(html, 'text/html');
      const container = parsedDoc.body;
      const docRef = container.ownerDocument || document;

      container.querySelectorAll('img').forEach((img) => {
        const src = img.getAttribute('src') || '';
        const match = src.match(/^data:([^;]+);base64,(.+)$/i);
        if (match && match[2]) {
          const imgIndex = inlineImages.length + 1;
          inlineImages.push({
            index: imgIndex,
            dataUri: src,
            base64: match[2],
            mimeType: match[1].toLowerCase(),
          });
          img.replaceWith(docRef.createTextNode(`\n[GAMBAR_DOCX_${imgIndex}]\n`));
        } else {
          img.replaceWith(docRef.createTextNode('\n[Gambar dokumen]\n'));
        }
      });

      expandWordOrderedListsForReader(container);

      container.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6').forEach((el) => {
        el.appendChild(docRef.createTextNode('\n'));
      });
      container.querySelectorAll('br').forEach((el) => {
        el.replaceWith(docRef.createTextNode('\n'));
      });

      container.querySelectorAll('table').forEach((table) => {
        const parsedRows: string[][] = [];
        table.querySelectorAll('tr').forEach((tr) => {
          const cells: string[] = [];
          tr.querySelectorAll('th, td').forEach((td) => {
            const rawCell = (td.textContent || '')
              .split(/\r?\n/)
              .map((l) => l.replace(/[ \t]+/g, ' ').trim())
              .filter(Boolean)
              .join('\n');
            cells.push(rawCell);
          });
          if (cells.length > 0) parsedRows.push(cells);
        });

        const headerCells = parsedRows[0] || [];
        const looksLikeDataHeader =
          headerCells.length >= 2 &&
          headerCells.some((h) =>
            /^(?:no\.?|nama|nilai|jumlah|frekuensi|data|bulan|tahun|kelas|siswa|hasil|skor|keterangan|jenis|persentase|hari|tanggal|mata pelajaran|mapel|kunci)$/i.test(
              h.trim()
            )
          );
        const hasLayoutMarkers = parsedRows.some((cells) =>
          cells.some(
            (c) =>
              c.includes('[GAMBAR_DOCX_') ||
              /^(?:soal\s*)?\d+[\.\)]\s+/i.test(c) ||
              /^\(?[A-Ea-e][\.\)](?:\s|$)/.test(c)
          )
        );
        const hasStandaloneNumberCol =
          !looksLikeDataHeader && parsedRows.some((cells) => /^\d+[\.\)]?$/.test(cells[0] || ''));

        if (hasLayoutMarkers || hasStandaloneNumberCol) {
          table.replaceWith(
            docRef.createTextNode('\n' + formatLayoutTableRowsForReader(parsedRows).join('\n') + '\n')
          );
        } else {
          const mdRows: string[] = [];
          parsedRows.forEach((cells, rIdx) => {
            mdRows.push('| ' + cells.map((c) => c.replace(/\n+/g, ' ') || '-').join(' | ') + ' |');
            if (rIdx === 0) {
              mdRows.push('| ' + cells.map(() => '---').join(' | ') + ' |');
            }
          });
          if (mdRows.length > 0) {
            table.replaceWith(docRef.createTextNode('\n\n' + mdRows.join('\n') + '\n\n'));
          }
        }
      });

      const structured = (container.textContent || '')
        .replace(/\r/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      return { text: structured, inlineImages };
    } catch {
      // Fallback regex parser below
    }
  }

  let fallbackText = html.replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, (_m, src) => {
    const match = src.match(/^data:([^;]+);base64,(.+)$/i);
    if (match && match[2]) {
      const idx = inlineImages.length + 1;
      inlineImages.push({
        index: idx,
        dataUri: src,
        base64: match[2],
        mimeType: match[1].toLowerCase(),
      });
      return `\n[GAMBAR_DOCX_${idx}]\n`;
    }
    return '\n[Gambar dokumen]\n';
  });

  fallbackText = fallbackText.replace(/<table[\s\S]*?>([\s\S]*?)<\/table>/gi, (_, inner) =>
    htmlTableToMarkdown(inner)
  );

  let guard = 0;
  while (/<ol[^>]*>/i.test(fallbackText) && guard < 20) {
    guard++;
    const before = fallbackText;
    fallbackText = fallbackText.replace(
      /<ol([^>]*)>((?:(?!<ol[\s>])[\s\S])*?)<\/ol>/gi,
      (_m, attrs, inner) => {
        const isAlphaAttr = /type=["']?[aA]["']?/i.test(attrs);
        const liMatches = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
        const isShortAlphaCandidate =
          liMatches.length >= 2 &&
          liMatches.length <= 5 &&
          liMatches.every((lm) => {
            const plain = lm[1].replace(/<[^>]+>/g, ' ').trim();
            return plain.length < 180 && !/^\d+[\.\)]/.test(plain);
          });
        const useAlpha = isAlphaAttr || isShortAlphaCandidate;
        let idx = 0;
        return (
          '\n' +
          inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_lm: string, liContent: string) => {
            const clean = liContent
              .replace(/<\/(?:p|div)>/gi, '\n')
              .replace(/<[^>]+>/g, ' ')
              .replace(/[ \t]+/g, ' ')
              .trim();
            idx++;
            if (/^(?:\d+|[A-Ea-e])[\.\)]/.test(clean)) return `${clean}\n`;
            const prefix = useAlpha && idx <= 5 ? `${String.fromCharCode(64 + idx)}.` : `${idx}.`;
            return `${prefix} ${clean}\n`;
          }) +
          '\n'
        );
      }
    );
    if (before === fallbackText) break;
  }

  const withBreaks = fallbackText
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, '');

  return {
    text: decodeHtmlEntities(withBreaks)
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    inlineImages,
  };
}

function buildPdfPageText(items: any[]): string {
  if (!Array.isArray(items) || items.length === 0) return '';
  const positioned: Array<{ str: string; x: number; y: number }> = [];
  let minX = Infinity;
  let maxX = -Infinity;

  for (const item of items) {
    if (!item || typeof item.str !== 'string') continue;
    const str = item.str;
    if (!str) continue;
    const transform = Array.isArray(item.transform) ? item.transform : [1, 0, 0, 1, 0, 0];
    const x = Number(transform[4]) || 0;
    const y = Number(transform[5]) || 0;
    if (str.trim()) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    positioned.push({ str, x, y });
  }

  if (positioned.length === 0) return '';

  const collapseRows = (subset: Array<{ str: string; x: number; y: number }>): string[] => {
    const sorted = [...subset].sort((a, b) => {
      if (Math.abs(b.y - a.y) > 4) return b.y - a.y;
      return a.x - b.x;
    });

    const lines: string[] = [];
    let currentY: number | null = null;
    let rowItems: Array<{ str: string; x: number }> = [];

    const flushRow = () => {
      if (rowItems.length === 0) return;
      rowItems.sort((a, b) => a.x - b.x);
      let joined = '';
      let prevEndX: number | null = null;
      for (const r of rowItems) {
        if (
          prevEndX !== null &&
          r.x - prevEndX > 4 &&
          !joined.endsWith(' ') &&
          !r.str.startsWith(' ')
        ) {
          joined += ' ';
        }
        joined += r.str;
        prevEndX = r.x + r.str.length * 4;
      }
      const cleanLine = joined.replace(/[ \t]+/g, ' ').trim();
      if (cleanLine) lines.push(cleanLine);
      rowItems = [];
    };

    for (const it of sorted) {
      if (currentY !== null && Math.abs(it.y - currentY) > 4) {
        flushRow();
        currentY = it.y;
      } else if (currentY === null) {
        currentY = it.y;
      }
      rowItems.push({ str: it.str, x: it.x });
    }
    flushRow();
    return lines;
  };

  // Detect true 2-column exam pages so left and right columns never interleave
  const span = maxX - minX;
  if (span > 200) {
    const midX = minX + span * 0.48;
    const rightAll = positioned.filter((p) => p.x >= midX && p.str.trim());
    const leftAll = positioned.filter((p) => p.x < midX && p.str.trim());
    const qStartRe = /^\(?\d{1,3}[\.\)]/;

    if (rightAll.length > 0 && leftAll.length > 0) {
      const maxRightY = Math.max(...rightAll.map((p) => p.y));
      const minRightY = Math.min(...rightAll.map((p) => p.y));

      const headerItems = positioned.filter((p) => p.y > maxRightY + 6);
      const bodyLeft = leftAll.filter((p) => p.y <= maxRightY + 6);
      const kunciItem = bodyLeft.find((p) => p.y < minRightY - 4 && /\bkunci\b/i.test(p.str));
      const footerY = kunciItem ? kunciItem.y : -Infinity;

      const leftColItems = bodyLeft.filter((p) => p.y > footerY + 2);
      const footerItems = positioned.filter((p) => p.y <= footerY + 2);

      const leftQCount = collapseRows(leftColItems).filter((l) => qStartRe.test(l)).length;
      const rightQCount = collapseRows(rightAll).filter((l) => qStartRe.test(l)).length;

      if (leftQCount >= 2 && rightQCount >= 2) {
        return [
          ...collapseRows(headerItems),
          ...collapseRows(leftColItems),
          ...collapseRows(rightAll),
          ...collapseRows(footerItems),
        ].join('\n');
      }
    }
  }

  return collapseRows(positioned).join('\n');
}

function extractReadableTextFromLegacyDoc(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const segments: string[] = [];

  // 1. UTF-16LE scan (standard Word 97-2003 Unicode text stream)
  let currentU16 = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = bytes[i] | (bytes[i + 1] << 8);
    const isPrintable =
      (code >= 32 && code <= 126) ||
      code === 10 ||
      code === 13 ||
      code === 9 ||
      (code >= 0x00a0 && code <= 0x024f);
    if (isPrintable) {
      currentU16 += code === 13 ? '\n' : String.fromCharCode(code);
    } else {
      if (currentU16.trim().length >= 16) {
        segments.push(currentU16.trim());
      }
      currentU16 = '';
    }
  }
  if (currentU16.trim().length >= 16) segments.push(currentU16.trim());

  // 2. Fallback ASCII scan if UTF-16LE yielded minimal text
  if (segments.join('\n').length < 100) {
    let currentAscii = '';
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if ((b >= 32 && b <= 126) || b === 10 || b === 13 || b === 9) {
        currentAscii += b === 13 ? '\n' : String.fromCharCode(b);
      } else {
        if (currentAscii.trim().length >= 16) {
          segments.push(currentAscii.trim());
        }
        currentAscii = '';
      }
    }
    if (currentAscii.trim().length >= 16) segments.push(currentAscii.trim());
  }

  const noiseFilter = (s: string) => {
    if (/Root Entry|WordDocument|1Table|SummaryInformation|Microsoft Word|Normal\.dotm|Times New Roman|Calibri|Cambria/i.test(s) && s.length < 120) {
      return false;
    }
    const alphaCount = (s.match(/[a-zA-Z0-9]/g) || []).length;
    return alphaCount >= 8 && alphaCount / Math.max(1, s.length) > 0.35;
  };

  return Array.from(new Set(segments.filter(noiseFilter)))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// =========================================================================
// IMAGE / CANVAS COMPRESSION HELPERS
// =========================================================================

async function compressCanvasToJpegPayload(
  canvas: HTMLCanvasElement,
  maxBase64Chars = 850_000
): Promise<{ dataUri: string; base64: string; mimeType: string }> {
  let quality = 0.78;
  let dataUri = canvas.toDataURL('image/jpeg', quality);

  while (dataUri.length > maxBase64Chars && quality > 0.44) {
    quality -= 0.12;
    dataUri = canvas.toDataURL('image/jpeg', quality);
  }

  if (dataUri.length > maxBase64Chars && canvas.width > 900) {
    const scale = 900 / canvas.width;
    const resized = document.createElement('canvas');
    resized.width = Math.round(canvas.width * scale);
    resized.height = Math.round(canvas.height * scale);
    const rCtx = resized.getContext('2d');
    if (rCtx) {
      rCtx.fillStyle = '#FFFFFF';
      rCtx.fillRect(0, 0, resized.width, resized.height);
      rCtx.drawImage(canvas, 0, 0, resized.width, resized.height);
      dataUri = resized.toDataURL('image/jpeg', 0.72);
    }
  }

  const comma = dataUri.indexOf(',');
  return {
    dataUri,
    base64: comma >= 0 ? dataUri.slice(comma + 1) : dataUri,
    mimeType: 'image/jpeg',
  };
}

async function fileImageToPreviewPage(file: File): Promise<AiReaderPreviewPage> {
  const dataUriRaw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Gagal membaca gambar ${file.name}`));
    reader.readAsDataURL(file);
  });

  if (typeof document === 'undefined') {
    const comma = dataUriRaw.indexOf(',');
    return {
      pageNumber: 1,
      dataUri: dataUriRaw,
      base64: comma >= 0 ? dataUriRaw.slice(comma + 1) : dataUriRaw,
      mimeType: file.type || 'image/jpeg',
    };
  }

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Berkas gambar ${file.name} rusak atau tidak dapat dimuat.`));
    img.src = dataUriRaw;
  });

  const maxDim = 1800;
  let width = img.naturalWidth || 1200;
  let height = img.naturalHeight || 1600;
  if (width > maxDim || height > maxDim) {
    const ratio = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const compressed = await compressCanvasToJpegPayload(canvas, 1_100_000);
    return {
      pageNumber: 1,
      ...compressed,
    };
  }

  const comma = dataUriRaw.indexOf(',');
  return {
    pageNumber: 1,
    dataUri: dataUriRaw,
    base64: comma >= 0 ? dataUriRaw.slice(comma + 1) : dataUriRaw,
    mimeType: file.type || 'image/jpeg',
  };
}

// =========================================================================
// FILE PREPARATION & PREVIEW EXTRACTION
// =========================================================================

async function extractPdfPreview(file: File): Promise<AiReaderUploadedFilePreview> {
  const warnings: string[] = [];
  const arrayBuffer = await file.arrayBuffer();

  if (typeof (Promise as any).try !== 'function') {
    (Promise as any).try = function (fn: (...a: any[]) => any, ...args: any[]) {
      return new Promise((resolve) => resolve(fn(...args)));
    };
  }

  const pdfjs: any =
    typeof window === 'undefined'
      ? await import('pdfjs-dist/legacy/build/pdf.mjs')
      : await import('pdfjs-dist');

  if (typeof window !== 'undefined' && pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  }

  let pdf: any = null;
  try {
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(arrayBuffer.slice(0)),
      useWorkerFetch: false,
      useSystemFonts: true,
    });
    pdf = await loadingTask.promise;
  } catch (err1: any) {
    if (err1?.name === 'PasswordException' || /password/i.test(err1?.message || '')) {
      throw new Error(
        `Berkas PDF "${file.name}" terproteksi kata sandi. Simpan/ekspor ulang PDF tanpa password lalu unggah kembali.`
      );
    }
    try {
      const legacyPdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs').catch(() => pdfjs);
      if (legacyPdfjs.GlobalWorkerOptions) {
        legacyPdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      }
      const fallbackTask = legacyPdfjs.getDocument({
        data: new Uint8Array(arrayBuffer.slice(0)),
        disableWorker: true,
        useWorkerFetch: false,
        useSystemFonts: true,
      } as any);
      pdf = await fallbackTask.promise;
    } catch (err2: any) {
      if (err2?.name === 'PasswordException' || /password/i.test(err2?.message || '')) {
        throw new Error(
          `Berkas PDF "${file.name}" terproteksi kata sandi. Simpan/ekspor ulang PDF tanpa password lalu unggah kembali.`
        );
      }
      throw new Error(
        `Berkas PDF "${file.name}" rusak atau format internalnya tidak dapat dibaca (${err2?.message || 'PDF tidak valid'}).`
      );
    }
  }

  const pageCount = Number(pdf?.numPages || 0);
  if (pageCount === 0) {
    warnings.push(`${file.name}: Dokumen PDF tidak memiliki halaman.`);
  }

  const previewPages: AiReaderPreviewPage[] = [];
  const maxRenderPages = Math.min(pageCount, 60);
  if (pageCount > 60) {
    warnings.push(`${file.name}: PDF memiliki ${pageCount} halaman. Diproses 60 halaman pertama.`);
  }

  const textParts: string[] = [];

  for (let i = 1; i <= maxRenderPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const digitalText = buildPdfPageText(textContent.items as any[]);
      if (digitalText.trim()) {
        textParts.push(`--- Halaman ${i} ---\n${digitalText}`);
      }

      if (typeof document !== 'undefined') {
        const viewport = page.getViewport({ scale: 1.45 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport }).promise;
          const compressed = await compressCanvasToJpegPayload(canvas, 820_000);
          previewPages.push({
            pageNumber: i,
            ...compressed,
            digitalText: digitalText.trim() || undefined,
          });
        }
      }
    } catch (pageErr: any) {
      warnings.push(`${file.name} (Halaman ${i}): Gagal merender halaman (${pageErr?.message || 'error'}).`);
    }
  }

  return {
    id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fileName: file.name,
    fileType: 'pdf',
    sizeBytes: file.size,
    pageCount,
    previewPages,
    previewText: textParts.join('\n\n').trim() || undefined,
    warnings,
  };
}

async function extractDocxPreview(file: File, arrayBuffer: ArrayBuffer): Promise<AiReaderUploadedFilePreview> {
  const warnings: string[] = [];
  let previewHtml = '';
  let previewText = '';
  const previewPages: AiReaderPreviewPage[] = [];

  try {
    const htmlRes = await mammoth.convertToHtml(
      { arrayBuffer },
      {
        convertImage: (mammoth.images as any).imgElement((element: any) =>
          element.read('base64').then((imgBase64: string) => ({
            src: `data:${element.contentType};base64,${imgBase64}`,
          }))
        ),
      }
    );
    previewHtml = htmlRes.value || '';
    const extracted = htmlToStructuredTextWithTables(previewHtml);
    previewText = extracted.text;
    for (const img of extracted.inlineImages.slice(0, 30)) {
      if (img.base64 && img.base64.length < 1_600_000) {
        previewPages.push({
          pageNumber: img.index,
          dataUri: img.dataUri,
          base64: img.base64,
          mimeType: img.mimeType,
        });
      }
    }
  } catch (err: any) {
    warnings.push(`${file.name}: Pembacaan format HTML Word gagal (${err?.message || 'error'}), mencoba ekstraksi teks langsung.`);
  }

  if (!previewText.trim()) {
    try {
      const rawRes = await mammoth.extractRawText({ arrayBuffer });
      previewText = (rawRes.value || '').trim();
    } catch {
      // Fallback to OOXML below
    }
  }

  // Extract media images from ZIP if HTML missed them or text was empty
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    if (!previewText.trim()) {
      const docXmlFile = zip.file('word/document.xml');
      if (docXmlFile) {
        const xmlStr = await docXmlFile.async('string');
        previewText = decodeHtmlEntities(
          xmlStr
            .replace(/<\/w:p>/g, '\n')
            .replace(/<\/w:tr>/g, '\n')
            .replace(/<\/w:tc>/g, ' | ')
            .replace(/<[^>]+>/g, '')
        )
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }
    }

    if (previewPages.length === 0) {
      const mediaFiles = Object.keys(zip.files)
        .filter((name) => /^word\/media\/.+\.(png|jpe?g|webp|gif)$/i.test(name))
        .sort()
        .slice(0, 20);

      for (let i = 0; i < mediaFiles.length; i++) {
        const mName = mediaFiles[i];
        const ext = getAcceptedExtension(mName);
        const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        const base64 = await zip.file(mName)!.async('base64');
        if (base64 && base64.length < 1_600_000) {
          previewPages.push({
            pageNumber: i + 1,
            dataUri: `data:${mime};base64,${base64}`,
            base64,
            mimeType: mime,
          });
        }
      }
    }
  } catch {
    // Ignore zip error if already extracted via mammoth
  }

  if (!previewText.trim() && previewPages.length === 0) {
    warnings.push(`${file.name}: Dokumen Word tidak mengandung teks maupun gambar yang dapat dibaca.`);
  }

  return {
    id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fileName: file.name,
    fileType: 'docx',
    sizeBytes: file.size,
    previewHtml: previewHtml || undefined,
    previewText: previewText || undefined,
    previewPages: previewPages.length > 0 ? previewPages : undefined,
    warnings,
  };
}

async function extractSpreadsheetPreview(
  file: File,
  ext: 'xls' | 'xlsx'
): Promise<AiReaderUploadedFilePreview> {
  const warnings: string[] = [];
  const arrayBuffer = await file.arrayBuffer();
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(arrayBuffer, { type: 'array', raw: false });
  } catch (err: any) {
    throw new Error(
      `Berkas Excel "${file.name}" rusak atau formatnya tidak sesuai standar (${err?.message || 'gagal membaca workbook'}).`
    );
  }

  const previewTables: AiReaderPreviewTable[] = [];
  const textBlocks: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rawMatrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
    const cleanedRows = rawMatrix
      .map((row) => (Array.isArray(row) ? row.map((c) => String(c ?? '').trim()) : []))
      .filter((row) => row.some((c) => c.length > 0));

    if (cleanedRows.length === 0) continue;

    const colCount = Math.max(...cleanedRows.map((r) => r.length), 1);
    const normalizedRows = cleanedRows.map((r) => {
      const copy = [...r];
      while (copy.length < colCount) copy.push('');
      return copy;
    });

    const headers = normalizedRows[0];
    const bodyRows = normalizedRows.slice(1);
    previewTables.push({
      sheetName,
      headers,
      rows: bodyRows,
    });

    const mdLines = [
      `### Sheet: ${sheetName}`,
      `| ${headers.map((h) => h.replace(/\|/g, '\\|')).join(' | ')} |`,
      `| ${headers.map(() => '---').join(' | ')} |`,
      ...bodyRows.map((r) => `| ${r.map((c) => c.replace(/\n/g, ' ').replace(/\|/g, '\\|')).join(' | ')} |`),
    ];
    textBlocks.push(mdLines.join('\n'));
  }

  if (textBlocks.length === 0) {
    warnings.push(`${file.name}: Berkas Excel tidak berisi data tabel soal yang terbaca.`);
  }

  return {
    id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fileName: file.name,
    fileType: ext,
    sizeBytes: file.size,
    previewTables,
    previewText: textBlocks.join('\n\n').trim() || undefined,
    warnings,
  };
}

export async function prepareFilesForAiReader(
  files: File[],
  onProgress?: (state: AiReaderProgressState) => void
): Promise<AiReaderUploadedFilePreview[]> {
  const prepared: AiReaderUploadedFilePreview[] = [];

  for (let idx = 0; idx < files.length; idx++) {
    const file = files[idx];
    const ext = getAcceptedExtension(file.name);
    onProgress?.({
      phase: 'preparing',
      current: idx + 1,
      total: files.length,
      label: `Menyiapkan pratinjau ${file.name} (${idx + 1}/${files.length})...`,
    });

    const buffer = await file.arrayBuffer();
    const headerCheck = validateUploadedFileHeader(file.name, buffer, ACCEPTED_EXTENSIONS);
    if (!headerCheck.valid) {
      throw new Error(headerCheck.errorMessage || `Format berkas "${file.name}" tidak valid.`);
    }

    if (ext === 'pdf') {
      const pdfPrev = await extractPdfPreview(file);
      pdfPrev.warnings = Array.from(new Set([...headerCheck.warnings, ...pdfPrev.warnings]));
      prepared.push(pdfPrev);
    } else if (ext === 'docx') {
      const docxPrev = await extractDocxPreview(file, buffer);
      docxPrev.warnings = Array.from(new Set([...headerCheck.warnings, ...docxPrev.warnings]));
      prepared.push(docxPrev);
    } else if (ext === 'doc') {
      const header = new Uint8Array(buffer.slice(0, 4));
      const isZip = header[0] === 0x50 && header[1] === 0x4b;
      if (isZip) {
        const zipDocPrev = await extractDocxPreview(file, buffer);
        zipDocPrev.warnings = Array.from(new Set([...headerCheck.warnings, ...zipDocPrev.warnings]));
        prepared.push(zipDocPrev);
      } else {
        const legacyText = extractReadableTextFromLegacyDoc(buffer);
        const warnings: string[] = [...headerCheck.warnings];
        if (!legacyText) {
          warnings.push(`${file.name}: Format .doc biner tidak memiliki teks yang dapat diekstrak. Simpan ulang ke .docx atau .pdf.`);
        } else {
          warnings.push(`${file.name}: Berkas format .doc lama — gambar/persamaan biner mungkin tidak ikut terekstrak. Disarankan konversi ke .docx atau .pdf bila ada ilustrasi.`);
        }
        prepared.push({
          id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          fileName: file.name,
          fileType: 'doc',
          sizeBytes: file.size,
          previewText: legacyText || undefined,
          warnings,
        });
      }
    } else if (ext === 'xls' || ext === 'xlsx') {
      const xlsPrev = await extractSpreadsheetPreview(file, ext);
      xlsPrev.warnings = Array.from(new Set([...headerCheck.warnings, ...xlsPrev.warnings]));
      prepared.push(xlsPrev);
    } else {
      const page = await fileImageToPreviewPage(file);
      prepared.push({
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        fileName: file.name,
        fileType: 'image',
        sizeBytes: file.size,
        pageCount: 1,
        previewPages: [page],
        warnings: headerCheck.warnings,
      });
    }
  }

  return prepared;
}

// =========================================================================
// STAGED CHUNKING & AI QUESTION EXTRACTION
// =========================================================================

function splitTextIntoChunks(text: string, maxChars = 4200): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const chunks: string[] = [];
  const lines = clean.split('\n');
  let buffer = '';
  let activeTableHeader: string[] | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1];

    // Track active Markdown table header (useful for large Excel question banks)
    if (
      line.trim().startsWith('|') &&
      nextLine &&
      /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(nextLine.trim())
    ) {
      activeTableHeader = [line, nextLine];
    } else if (!line.trim().startsWith('|') && !line.trim().startsWith('### Sheet:')) {
      activeTableHeader = null;
    }

    const isQuestionStart = /^\s*\d{1,3}\s*[\.\)]\s+/.test(line);
    const shouldSplitForQuestion =
      buffer.length > maxChars * 0.65 &&
      isQuestionStart &&
      buffer.length + line.length + 1 > maxChars;
    const shouldSplitForSize =
      buffer.length + line.length + 1 > maxChars && buffer.trim().length > 0;

    if (shouldSplitForQuestion || shouldSplitForSize) {
      chunks.push(buffer.trim());
      if (activeTableHeader && line.trim().startsWith('|')) {
        buffer = `${activeTableHeader[0]}\n${activeTableHeader[1]}\n${line}`;
      } else {
        buffer = line;
      }
    } else {
      buffer = buffer ? `${buffer}\n${line}` : line;
    }
  }
  if (buffer.trim()) chunks.push(buffer.trim());
  return chunks;
}

function normalizeForComparison(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function mergeExtractedQuestions(
  existing: AiReaderQuestionItem[],
  incoming: AiReaderQuestionItem[]
): AiReaderQuestionItem[] {
  const result = [...existing];
  for (const item of incoming) {
    // Check last 3 items from same file in case page boundary overlapped or split a question
    const recentMatchIdx = (() => {
      for (let idx = result.length - 1; idx >= Math.max(0, result.length - 3); idx--) {
        if (result[idx].sumberFile === item.sumberFile && result[idx].nomor === item.nomor) {
          return idx;
        }
      }
      return -1;
    })();

    if (recentMatchIdx >= 0) {
      const prev = result[recentMatchIdx];
      const normPrev = normalizeForComparison(prev.pertanyaan);
      const normCurr = normalizeForComparison(item.pertanyaan);

      // Case 1: Orphan continuation or split options on next page -> merge!
      if (!prev.pilihan && item.pilihan) {
        const mergedQuestionText =
          !normCurr || normPrev.includes(normCurr)
            ? prev.pertanyaan
            : `${prev.pertanyaan}\n${item.pertanyaan}`.trim();
        result[recentMatchIdx] = {
          ...prev,
          tipe: 'pilihan_ganda',
          pertanyaan: mergedQuestionText,
          pilihan: item.pilihan,
          kunciAsliDokumen: prev.kunciAsliDokumen || item.kunciAsliDokumen,
          mengandungVisual: prev.mengandungVisual || item.mengandungVisual,
          previewGambarDataUri: prev.previewGambarDataUri || item.previewGambarDataUri,
        };
        continue;
      }

      // Case 2: Exact or near-exact duplicate on boundary -> skip duplicate
      if (
        normPrev === normCurr ||
        (normPrev.length > 20 && (normPrev.includes(normCurr) || normCurr.includes(normPrev)))
      ) {
        continue;
      }
    }

    // Skip orphan option-only items if no matching previous question exists
    if (!item.pertanyaan.trim() && item.statusTerbaca !== 'tidak_terbaca') {
      continue;
    }

    result.push(item);
  }
  return result;
}

export async function readQuestionsFromPreparedFiles(
  preparedFiles: AiReaderUploadedFilePreview[],
  onProgress?: (state: AiReaderProgressState) => void
): Promise<{
  judul: string;
  soalList: AiReaderQuestionItem[];
  validation: AiReaderValidationReport;
}> {
  if (!preparedFiles || preparedFiles.length === 0) {
    throw new Error('Belum ada berkas yang diunggah untuk dibaca.');
  }

  type ReadJob =
    | {
        kind: 'pages';
        file: AiReaderUploadedFilePreview;
        pages: AiReaderPreviewPage[];
        chunkLabel: string;
      }
    | {
        kind: 'text';
        file: AiReaderUploadedFilePreview;
        text: string;
        pages?: AiReaderPreviewPage[];
        chunkLabel: string;
      };

  const jobs: ReadJob[] = [];

  for (const file of preparedFiles) {
    if (
      (file.fileType === 'pdf' || file.fileType === 'image') &&
      file.previewPages &&
      file.previewPages.length > 0
    ) {
      const batchSize = 2;
      const totalBatches = Math.ceil(file.previewPages.length / batchSize);
      for (let i = 0; i < file.previewPages.length; i += batchSize) {
        const batchPages = file.previewPages.slice(i, i + batchSize);
        const startP = batchPages[0].pageNumber;
        const endP = batchPages[batchPages.length - 1].pageNumber;
        const pageLabel = startP === endP ? `Halaman ${startP}` : `Halaman ${startP}-${endP}`;
        jobs.push({
          kind: 'pages',
          file,
          pages: batchPages,
          chunkLabel: `${file.fileName} · ${pageLabel} (Batch ${Math.floor(i / batchSize) + 1}/${totalBatches})`,
        });
      }
    } else {
      const textChunks = splitTextIntoChunks(file.previewText || '', 4200);
      if (textChunks.length > 0) {
        textChunks.forEach((chunk, idx) => {
          // Attach any [GAMBAR_DOCX_N] images referenced inside this Word chunk (max 3 per batch)
          const referencedIndices = Array.from(chunk.matchAll(/\[GAMBAR_DOCX_(\d+)\]/g)).map((m) =>
            Number(m[1])
          );
          const attachedPages =
            referencedIndices.length > 0 && file.previewPages
              ? file.previewPages
                  .filter((p) => referencedIndices.includes(p.pageNumber))
                  .slice(0, 3)
              : undefined;

          jobs.push({
            kind: 'text',
            file,
            text: chunk,
            pages: attachedPages && attachedPages.length > 0 ? attachedPages : undefined,
            chunkLabel: `${file.fileName} · Bagian ${idx + 1}/${textChunks.length}`,
          });
        });
      }
      if ((file.previewText || '').trim().length < 120 && file.previewPages && file.previewPages.length > 0) {
        for (let i = 0; i < file.previewPages.length; i += 2) {
          const batchPages = file.previewPages.slice(i, i + 2);
          jobs.push({
            kind: 'pages',
            file,
            pages: batchPages,
            chunkLabel: `${file.fileName} · Gambar Sisipan ${i + 1}-${i + batchPages.length}`,
          });
        }
      }
    }
  }

  if (jobs.length === 0) {
    throw new Error('Tidak ditemukan konten teks maupun halaman gambar yang dapat diproses dari berkas yang diunggah.');
  }

  let detectedTitle = '';
  let allQuestions: AiReaderQuestionItem[] = [];
  const allWarnings: string[] = [];

  for (const f of preparedFiles) {
    if (f.warnings.length > 0) {
      allWarnings.push(...f.warnings);
    }
  }

  for (let idx = 0; idx < jobs.length; idx++) {
    const job = jobs[idx];
    onProgress?.({
      phase: 'reading',
      current: idx + 1,
      total: jobs.length,
      label: `Membaca soal: ${job.chunkLabel}...`,
    });

    const sameFilePrev = [...allQuestions]
      .reverse()
      .find((q) => q.sumberFile === job.file.fileName);

    const previousTailContext = sameFilePrev
      ? `Soal terakhir yang terbaca di bagian sebelumnya bernomor ${sameFilePrev.nomor} (${sameFilePrev.pilihan ? 'sudah punya pilihan A-D' : 'BELUM memiliki pilihan jawaban A-D lengkap'}): "${sameFilePrev.pertanyaan.slice(0, 140)}"`
      : undefined;

    const payload: Record<string, any> = {
      fileName: job.file.fileName,
      chunkLabel: job.chunkLabel,
      previousTailContext,
    };

    if (job.kind === 'pages') {
      payload.pages = job.pages.map((p) => ({
        pageNumber: p.pageNumber,
        imageBase64: p.base64,
        mimeType: p.mimeType,
      }));
      const combinedDigital = job.pages
        .filter((p) => p.digitalText && p.digitalText.trim().length > 0)
        .map((p) => `[Teks Halaman ${p.pageNumber}]\n${p.digitalText}`)
        .join('\n\n');
      if (combinedDigital) {
        payload.text = combinedDigital;
      }
    } else {
      payload.text = job.text;
      if (job.pages && job.pages.length > 0) {
        payload.pages = job.pages.map((p) => ({
          pageNumber: p.pageNumber,
          imageBase64: p.base64,
          mimeType: p.mimeType,
        }));
      }
    }

    const res = await safeFetchJson<{
      success: boolean;
      data?: {
        judul?: string;
        soalList: Array<any>;
        peringatanHalaman?: string[];
      };
      error?: string;
    }>('/api/ai-reader/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok || !res.data?.data) {
      const msg = res.error || `Gagal membaca ${job.chunkLabel}`;
      allWarnings.push(`${job.chunkLabel}: ${msg}`);
      if (res.status === 503 || res.status === 404 || (jobs.length === 1 && !res.ok)) {
        throw new Error(msg);
      }
      continue;
    }

    const batchData = res.data.data;
    if (!detectedTitle && batchData.judul) {
      detectedTitle = batchData.judul;
    }
    if (Array.isArray(batchData.peringatanHalaman)) {
      allWarnings.push(
        ...batchData.peringatanHalaman.map((w) =>
          w.includes(job.file.fileName) ? w : `${job.file.fileName}: ${w}`
        )
      );
    }

    let prevBatchNum = sameFilePrev?.nomor || 0;
    const mapped: AiReaderQuestionItem[] = (batchData.soalList || []).map((raw: any, qIdx: number) => {
      const pageNum =
        typeof raw.halaman === 'number' && raw.halaman > 0
          ? raw.halaman
          : job.kind === 'pages' && job.pages[0]
          ? job.pages[0].pageNumber
          : undefined;

      const docxImgMatch = String(raw.pertanyaan || '').match(/\[GAMBAR_DOCX_(\d+)\]/);
      const docxImgIdx = docxImgMatch ? Number(docxImgMatch[1]) : undefined;

      const matchedPage =
        docxImgIdx && job.file.previewPages
          ? job.file.previewPages.find((p) => p.pageNumber === docxImgIdx)
          : job.pages
          ? job.pages.find((p) => p.pageNumber === pageNum) || job.pages[0]
          : undefined;

      const statusTerbaca =
        raw.statusTerbaca === 'tidak_terbaca' || raw.statusTerbaca === 'kurang_jelas'
          ? raw.statusTerbaca
          : 'terbaca';

      const parsedNomor = Number(raw.nomor);
      const nomor =
        Number.isFinite(parsedNomor) && parsedNomor > 0
          ? Math.floor(parsedNomor)
          : prevBatchNum > 0
          ? prevBatchNum + 1
          : qIdx + 1;
      prevBatchNum = nomor;

      const rawPertanyaanStr = String(raw.pertanyaan || '')
        .replace(/\[GAMBAR_DOCX_\d+\]/g, '')
        .trim();

      let cleanPertanyaan = stripRedundantQuestionNumber(nomor, rawPertanyaanStr);
      let cleanedPilihan: Record<string, string> | undefined;
      if (raw.pilihan && typeof raw.pilihan === 'object') {
        const tmp: Record<string, string> = {};
        for (const k of ['A', 'B', 'C', 'D', 'E']) {
          const val = raw.pilihan[k] ?? raw.pilihan[k.toLowerCase()];
          if (typeof val === 'string' && val.trim().length > 0) {
            tmp[k] = stripRedundantOptionLabel(k, val);
          }
        }
        if (Object.keys(tmp).length >= 2) cleanedPilihan = tmp;
      }

      if (!cleanedPilihan && cleanPertanyaan) {
        const rescued = extractEmbeddedChoicesFromStem(cleanPertanyaan);
        if (rescued.extractedChoices) {
          cleanPertanyaan = stripRedundantQuestionNumber(nomor, rescued.cleanStem);
          cleanedPilihan = rescued.extractedChoices;
        }
      }

      const effectiveTipe: 'pilihan_ganda' | 'uraian' =
        raw.tipe === 'uraian' || !cleanedPilihan ? 'uraian' : 'pilihan_ganda';

      return {
        id: `air-q-${Date.now()}-${idx}-${qIdx}-${Math.random().toString(36).slice(2, 6)}`,
        nomor,
        nomorTeksAsli: raw.nomorTeksAsli || String(nomor),
        sumberFile: job.file.fileName,
        halaman: pageNum,
        tipe: effectiveTipe,
        pertanyaan: cleanPertanyaan,
        pilihan: cleanedPilihan,
        kunciAsliDokumen: raw.kunciAsliDokumen || undefined,
        statusTerbaca,
        statusJawaban: statusTerbaca === 'tidak_terbaca' ? 'tidak_terbaca' : 'belum_dijawab',
        catatanPembacaan: raw.catatanPembacaan || undefined,
        mengandungVisual: Boolean(raw.mengandungVisual || docxImgIdx),
        previewGambarDataUri:
          (Boolean(raw.mengandungVisual) || Boolean(docxImgIdx)) && matchedPage
            ? matchedPage.dataUri
            : undefined,
      };
    });

    allQuestions = mergeExtractedQuestions(allQuestions, mapped);
  }

  if (allQuestions.length === 0) {
    const firstWarning = allWarnings.find(Boolean);
    throw new Error(
      `Tidak ditemukan pola soal yang sesuai standar pada berkas yang diunggah (pastikan naskah memuat nomor soal seperti 1., 2., dan/atau pilihan A, B, C, D yang jelas).${firstWarning ? ` Catatan: ${firstWarning}` : ''}`
    );
  }

  onProgress?.({
    phase: 'validating',
    current: 1,
    total: 1,
    label: 'Memvalidasi kelengkapan & urutan nomor soal...',
  });

  const validation = validateAiReaderResult(allQuestions, allWarnings);
  const fallbackTitle =
    detectedTitle ||
    preparedFiles[0].fileName.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');

  return {
    judul: fallbackTitle,
    soalList: allQuestions,
    validation,
  };
}

// =========================================================================
// BATCH AI QUESTION ANSWERING & EXPLANATIONS
// =========================================================================

export async function answerQuestionsInBatches(
  soalList: AiReaderQuestionItem[],
  preparedFiles: AiReaderUploadedFilePreview[],
  onProgress?: (state: AiReaderProgressState) => void
): Promise<AiReaderQuestionItem[]> {
  if (!soalList || soalList.length === 0) {
    throw new Error('Belum ada soal yang siap dijawab.');
  }

  const batchSize = 6;
  const totalBatches = Math.ceil(soalList.length / batchSize);
  const updatedMap = new Map<string, AiReaderQuestionItem>();
  soalList.forEach((q) => updatedMap.set(q.id, { ...q }));

  for (let i = 0; i < soalList.length; i += batchSize) {
    const batchIndex = Math.floor(i / batchSize) + 1;
    const batch = soalList.slice(i, i + batchSize);

    onProgress?.({
      phase: 'answering',
      current: batchIndex,
      total: totalBatches,
      label: `Menjawab & membahas soal batch ${batchIndex}/${totalBatches} (Nomor ${batch[0].nomor}–${batch[batch.length - 1].nomor})...`,
    });

    // Attach unique source page images only for questions that reference visuals
    const pageImages: Array<{ pageNumber?: number; imageBase64: string; mimeType: string }> = [];
    const seenPageKeys = new Set<string>();

    for (const q of batch) {
      if (!q.mengandungVisual || !q.sumberFile || !q.halaman) continue;
      const key = `${q.sumberFile}::${q.halaman}`;
      if (seenPageKeys.has(key)) continue;
      const srcFile = preparedFiles.find((f) => f.fileName === q.sumberFile);
      const pageObj = srcFile?.previewPages?.find((p) => p.pageNumber === q.halaman);
      if (pageObj?.base64 && pageImages.length < 3) {
        seenPageKeys.add(key);
        pageImages.push({
          pageNumber: pageObj.pageNumber,
          imageBase64: pageObj.base64,
          mimeType: pageObj.mimeType,
        });
      }
    }

    const res = await safeFetchJson<{
      success: boolean;
      data?: {
        answers: Array<{
          id: string;
          jawaban: string;
          pembahasan: string;
          langkahMatematika?: string[];
          statusJawaban: AiReaderStatusJawaban;
        }>;
      };
      error?: string;
    }>('/api/ai-reader/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questions: batch.map((q) => ({
          id: q.id,
          nomor: q.nomor,
          tipe: q.tipe,
          pertanyaan: q.pertanyaan,
          pilihan: q.pilihan,
          kunciAsliDokumen: q.kunciAsliDokumen,
          statusTerbaca: q.statusTerbaca,
          mengandungVisual: q.mengandungVisual,
          catatanPembacaan: q.catatanPembacaan,
        })),
        pageImages: pageImages.length > 0 ? pageImages : undefined,
      }),
    });

    if (!res.ok || !res.data?.data) {
      throw new Error(
        res.error || `Gagal menjawab soal pada batch ${batchIndex}/${totalBatches}.`
      );
    }

    for (const ans of res.data.data.answers || []) {
      const current = updatedMap.get(ans.id);
      if (!current) continue;
      updatedMap.set(ans.id, {
        ...current,
        jawaban: ans.jawaban || undefined,
        pembahasan: ans.pembahasan || undefined,
        langkahMatematika:
          Array.isArray(ans.langkahMatematika) && ans.langkahMatematika.length > 0
            ? ans.langkahMatematika
            : undefined,
        statusJawaban: ans.statusJawaban || 'terjawab',
      });
    }
  }

  return soalList.map((q) => updatedMap.get(q.id) || q);
}

// =========================================================================
// VALIDATION ENGINE
// =========================================================================

export function validateAiReaderResult(
  soalList: AiReaderQuestionItem[],
  extraWarnings: string[] = []
): AiReaderValidationReport {
  const warnings = new Set<string>(extraWarnings.filter((w) => w && w.trim().length > 0));
  const nomorTerurut = soalList.map((q) => Number(q.nomor)).filter((n) => Number.isFinite(n) && n > 0);
  const nomorDuplikatSet = new Set<number>();
  const seenNumbers = new Set<number>();
  const seenQuestionTexts = new Map<string, number>();
  const kesesuaianJawabanIssues: string[] = [];

  let isAscending = true;
  let lastNum = 0;

  for (const q of soalList) {
    const num = Number(q.nomor);
    if (seenNumbers.has(num)) {
      nomorDuplikatSet.add(num);
    }
    seenNumbers.add(num);

    if (num < lastNum) {
      isAscending = false;
    }
    lastNum = num;

    const normQ = normalizeForComparison(q.pertanyaan);
    if (normQ.length >= 24) {
      const prevNum = seenQuestionTexts.get(normQ);
      if (prevNum !== undefined) {
        kesesuaianJawabanIssues.push(
          `Kemungkinan soal duplikat antara Nomor ${prevNum} dan Nomor ${num}.`
        );
      } else {
        seenQuestionTexts.set(normQ, num);
      }
    }

    if (!q.pertanyaan.trim() && q.statusTerbaca !== 'tidak_terbaca') {
      kesesuaianJawabanIssues.push(`Soal No. ${num}: Teks pertanyaan kosong atau terpisah.`);
    }

    if (q.tipe === 'pilihan_ganda' && q.pilihan) {
      const filledKeys = ['A', 'B', 'C', 'D', 'E'].filter((k) => Boolean(q.pilihan?.[k]?.trim()));
      if (filledKeys.length < 3) {
        kesesuaianJawabanIssues.push(
          `Soal No. ${num}: Pilihan jawaban tidak lengkap (hanya terbaca ${filledKeys.join(', ') || '-'}).`
        );
      } else {
        const order = ['A', 'B', 'C', 'D', 'E'];
        const maxIdx = Math.max(...filledKeys.map((k) => order.indexOf(k)));
        const missingOpt = order.slice(0, maxIdx + 1).filter((l) => !filledKeys.includes(l));
        if (missingOpt.length > 0) {
          kesesuaianJawabanIssues.push(
            `Soal No. ${num}: Urutan label pilihan melompat (opsi ${missingOpt.join(', ')} hilang).`
          );
        }
      }
      const normalizedVals = filledKeys
        .map((k) => normalizeForComparison(q.pilihan?.[k] || ''))
        .filter((v) => v.length >= 4);
      if (normalizedVals.length >= 2 && new Set(normalizedVals).size < normalizedVals.length) {
        kesesuaianJawabanIssues.push(
          `Soal No. ${num}: Terdapat isi pilihan jawaban yang ganda/identik antar opsi.`
        );
      }
    }

    if (q.statusJawaban === 'terjawab') {
      if (!q.jawaban || !q.jawaban.trim()) {
        kesesuaianJawabanIssues.push(`Soal No. ${num}: Status terjawab namun jawaban kosong.`);
      } else if (q.tipe === 'pilihan_ganda' && q.pilihan) {
        const optionKeys = Object.keys(q.pilihan).filter((k) => Boolean(q.pilihan?.[k]));
        const letterMatch = q.jawaban.trim().toUpperCase().match(/^([A-E])(?:[\.\)\s:]|$)/);
        if (!letterMatch) {
          kesesuaianJawabanIssues.push(
            `Soal No. ${num}: Jawaban pilihan ganda sebaiknya diawali huruf opsi (${optionKeys.join('/')}).`
          );
        } else if (!optionKeys.includes(letterMatch[1])) {
          kesesuaianJawabanIssues.push(
            `Soal No. ${num}: Huruf jawaban (${letterMatch[1]}) tidak ditemukan pada pilihan yang tersedia (${optionKeys.join(', ')}).`
          );
        } else if (q.kunciAsliDokumen) {
          const docMatch = q.kunciAsliDokumen.trim().toUpperCase().match(/^([A-E])(?:[\.\)\s:]|$)/);
          if (docMatch && docMatch[1] !== letterMatch[1]) {
            kesesuaianJawabanIssues.push(
              `Soal No. ${num}: Jawaban AI (${letterMatch[1]}) berbeda dengan kunci asli dokumen (${docMatch[1]}) — periksa kembali.`
            );
          }
        }
      }
    }
  }

  const nomorHilang: number[] = [];
  if (nomorTerurut.length > 0) {
    const minNomor = Math.min(...nomorTerurut);
    const maxNomor = Math.max(...nomorTerurut);
    const startCheck = minNomor <= 3 ? 1 : minNomor;
    if (minNomor > 3) {
      warnings.add(`Penomoran soal pada berkas dimulai dari nomor ${minNomor} (bukan dari nomor 1).`);
    }
    for (let n = startCheck; n <= maxNomor; n++) {
      if (!seenNumbers.has(n)) {
        nomorHilang.push(n);
      }
    }
  }

  const soalTidakTerbaca = soalList
    .filter((q) => q.statusTerbaca === 'tidak_terbaca' || q.statusJawaban === 'tidak_terbaca')
    .map((q) => q.nomor);

  const soalInformasiKurang = soalList
    .filter((q) => q.statusTerbaca === 'kurang_jelas' || q.statusJawaban === 'informasi_tidak_cukup')
    .map((q) => q.nomor);

  const nomorDuplikat = Array.from(nomorDuplikatSet).sort((a, b) => a - b);
  const urutanValid =
    soalList.length > 0 && isAscending && nomorHilang.length === 0 && nomorDuplikat.length === 0;

  return {
    totalSoal: soalList.length,
    urutanValid,
    nomorTerurut,
    nomorHilang,
    nomorDuplikat,
    soalTidakTerbaca,
    soalInformasiKurang,
    peringatanHalaman: Array.from(warnings),
    kesesuaianJawabanIssues,
  };
}
