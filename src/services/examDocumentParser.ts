import mammoth from 'mammoth';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { KontenElemenSoal, SoalUjian, TipeSoalUjian } from '../types';
import { normalizeTrueFalseValue } from '../utils/examShuffleAndScore';
import {
  extractEmbeddedChoicesFromStem,
  isLikelyExamInstructionLine,
  isValidOptionProgression,
  parseOptionPrefix,
  parseQuestionNumberPrefix,
  splitInlineChoiceLine,
  stripRedundantOptionLabel,
  validateParsedQuestionsStructure,
  validateUploadedFileHeader,
} from '../utils/questionFormatValidator';

export interface ExtractedImageAsset {
  id: string;
  url: string;
  label: string;
  pageNumber?: number;
  source: 'docx' | 'pdf' | 'pdf-page' | 'clipboard';
}

export interface ParseDocumentResult {
  success: boolean;
  judul?: string;
  mataPelajaran?: string;
  kelas?: string;
  petunjukUmum?: string;
  soalList: SoalUjian[];
  error?: string;
  warning?: string;
  extractedImagesCount: number;
  failedImagesCount: number;
  imageWarnings: string[];
  extractedImages: ExtractedImageAsset[];
  originalText?: string;
  originalHtml?: string;
  pageCount?: number;
  kunciDitemukanCount: number;
  kunciBelumDitemukanCount: number;
  siapDiterbitkan: boolean;
}

/**
 * Checks whether an ArrayBuffer starts with ZIP signature ("PK") used by .docx files.
 */
function isZipDocxBuffer(arrayBuffer: ArrayBuffer): boolean {
  if (arrayBuffer.byteLength < 4) return false;
  const view = new Uint8Array(arrayBuffer, 0, 4);
  return view[0] === 0x50 && view[1] === 0x4b;
}

/**
 * Extracts readable ASCII & UTF-16LE text runs from legacy Word .doc (OLE2 binary) files.
 */
function extractReadableTextFromLegacyDoc(arrayBuffer: ArrayBuffer): string {
  const bytes = new Uint8Array(arrayBuffer);
  const chunks: string[] = [];

  // Extract ASCII printable sequences (min 6 chars)
  let asciiBuf = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if ((b >= 32 && b <= 126) || b === 10 || b === 13 || b === 9) {
      asciiBuf += String.fromCharCode(b);
    } else {
      if (asciiBuf.trim().length >= 6 && /[a-zA-Z0-9]{2,}/.test(asciiBuf)) {
        chunks.push(asciiBuf.trim());
      }
      asciiBuf = '';
    }
  }
  if (asciiBuf.trim().length >= 6) chunks.push(asciiBuf.trim());

  // Extract UTF-16LE sequences common in Word 97-2003 binaries
  let utf16Buf = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const lo = bytes[i];
    const hi = bytes[i + 1];
    const code = lo | (hi << 8);
    if (hi === 0 && ((lo >= 32 && lo <= 126) || lo === 10 || lo === 13)) {
      utf16Buf += String.fromCharCode(lo);
    } else if (code >= 0x00c0 && code <= 0x024f) {
      utf16Buf += String.fromCharCode(code);
    } else {
      if (utf16Buf.trim().length >= 6 && /[a-zA-Z0-9]{2,}/.test(utf16Buf)) {
        chunks.push(utf16Buf.trim());
      }
      utf16Buf = '';
    }
  }
  if (utf16Buf.trim().length >= 6) chunks.push(utf16Buf.trim());

  // Filter out common OLE2 metadata noise
  const noiseRegex = /^(Microsoft Word|Normal\.dot|Root Entry|WordDocument|1Table|0Table|SummaryInformation|DocumentSummaryInformation|Times New Roman|Calibri|Arial|Cambria)/i;
  const cleaned = chunks
    .filter((c) => !noiseRegex.test(c) && !/^[A-Z0-9_]{12,}$/.test(c))
    .join('\n')
    .replace(/\r/g, '\n');

  return cleaned;
}

/**
 * Extracts all embedded images from a Word DOCX file using JSZip.
 */
async function extractImagesFromDocx(
  arrayBuffer: ArrayBuffer
): Promise<{ imageMap: Record<string, string>; assets: ExtractedImageAsset[]; failedCount: number; warnings: string[] }> {
  const images: Record<string, string> = {};
  const assets: ExtractedImageAsset[] = [];
  const warnings: string[] = [];
  let failedCount = 0;

  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const mediaFiles = Object.keys(zip.files).filter(
      (path) => path.startsWith('word/media/') && !zip.files[path].dir
    );

    for (let idx = 0; idx < mediaFiles.length; idx++) {
      const path = mediaFiles[idx];
      try {
        const file = zip.files[path];
        const filename = path.split('/').pop() || `image_${idx + 1}.png`;
        const ext = filename.split('.').pop()?.toLowerCase() || 'png';
        if (ext === 'wmf' || ext === 'emf') {
          failedCount++;
          warnings.push(
            `Gambar "${filename}" menggunakan format vektor lama (${ext.toUpperCase()}) dari Word. Jika tidak tampil, konversikan ke PNG/JPG lalu tambahkan manual.`
          );
          continue;
        }
        const mime =
          ext === 'jpg' || ext === 'jpeg'
            ? 'image/jpeg'
            : ext === 'gif'
            ? 'image/gif'
            : ext === 'webp'
            ? 'image/webp'
            : 'image/png';
        const base64 = await file.async('base64');
        const dataUri = `data:${mime};base64,${base64}`;
        images[filename] = dataUri;
        images[path] = dataUri;
        assets.push({
          id: `docx_media_${idx + 1}`,
          url: dataUri,
          label: `Gambar Word (${filename})`,
          source: 'docx',
        });
      } catch {
        failedCount++;
        warnings.push(`Gagal membaca berkas gambar "${path}" dalam dokumen Word.`);
      }
    }
  } catch (err) {
    console.warn('[DocxParser] Gagal mengekstrak media internal docx:', err);
  }
  return { imageMap: images, assets, failedCount, warnings };
}

/**
 * Converts Word OOXML <m:oMath> / <m:oMathPara> equation blocks into readable inline/block math text
 * so equations are never silently dropped by Mammoth.
 */
function convertOmmlNodeToText(xmlChunk: string): string {
  if (!xmlChunk) return '';
  let out = xmlChunk;

  const extractPlain = (s: string): string => {
    const tokens: string[] = [];
    const re = /<m:t[^>]*>([\s\S]*?)<\/m:t>|<w:t[^>]*>([\s\S]*?)<\/w:t>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      tokens.push(m[1] ?? m[2] ?? '');
    }
    if (tokens.length > 0) return tokens.join('');
    return s.replace(/<[^>]+>/g, '');
  };

  // Fractions: <m:f> ... <m:num>A</m:num> <m:den>B</m:den> </m:f> -> (A)/(B)
  for (let pass = 0; pass < 4 && /<m:f\b/i.test(out); pass++) {
    out = out.replace(/<m:f\b[^>]*>([\s\S]*?)<\/m:f>/gi, (_m, inner) => {
      const numMatch = inner.match(/<m:num\b[^>]*>([\s\S]*?)<\/m:num>/i);
      const denMatch = inner.match(/<m:den\b[^>]*>([\s\S]*?)<\/m:den>/i);
      const num = numMatch ? convertOmmlNodeToText(numMatch[1]).trim() : '';
      const den = denMatch ? convertOmmlNodeToText(denMatch[1]).trim() : '';
      return `(${num})/(${den})`;
    });
  }

  // Radicals / square roots: <m:rad> ... <m:deg>n</m:deg> <m:e>x</m:e> </m:rad>
  for (let pass = 0; pass < 4 && /<m:rad\b/i.test(out); pass++) {
    out = out.replace(/<m:rad\b[^>]*>([\s\S]*?)<\/m:rad>/gi, (_m, inner) => {
      const degMatch = inner.match(/<m:deg\b[^>]*>([\s\S]*?)<\/m:deg>/i);
      const baseMatch = inner.match(/<m:e\b[^>]*>([\s\S]*?)<\/m:e>/i);
      const deg = degMatch ? convertOmmlNodeToText(degMatch[1]).trim() : '';
      const base = baseMatch ? convertOmmlNodeToText(baseMatch[1]).trim() : '';
      return deg ? `^{${deg}}√(${base})` : `√(${base})`;
    });
  }

  // Sub-superscript: <m:sSubSup>
  for (let pass = 0; pass < 4 && /<m:sSubSup\b/i.test(out); pass++) {
    out = out.replace(/<m:sSubSup\b[^>]*>([\s\S]*?)<\/m:sSubSup>/gi, (_m, inner) => {
      const eMatch = inner.match(/<m:e\b[^>]*>([\s\S]*?)<\/m:e>/i);
      const subMatch = inner.match(/<m:sub\b[^>]*>([\s\S]*?)<\/m:sub>/i);
      const supMatch = inner.match(/<m:sup\b[^>]*>([\s\S]*?)<\/m:sup>/i);
      const base = eMatch ? convertOmmlNodeToText(eMatch[1]).trim() : '';
      const sub = subMatch ? convertOmmlNodeToText(subMatch[1]).trim() : '';
      const sup = supMatch ? convertOmmlNodeToText(supMatch[1]).trim() : '';
      return `${base}${sub ? `_{${sub}}` : ''}${sup ? `^{${sup}}` : ''}`;
    });
  }

  // Superscript: <m:sSup>
  for (let pass = 0; pass < 4 && /<m:sSup\b/i.test(out); pass++) {
    out = out.replace(/<m:sSup\b[^>]*>([\s\S]*?)<\/m:sSup>/gi, (_m, inner) => {
      const eMatch = inner.match(/<m:e\b[^>]*>([\s\S]*?)<\/m:e>/i);
      const supMatch = inner.match(/<m:sup\b[^>]*>([\s\S]*?)<\/m:sup>/i);
      const base = eMatch ? convertOmmlNodeToText(eMatch[1]).trim() : '';
      const sup = supMatch ? convertOmmlNodeToText(supMatch[1]).trim() : '';
      return `${base}^{${sup}}`;
    });
  }

  // Subscript: <m:sSub>
  for (let pass = 0; pass < 4 && /<m:sSub\b/i.test(out); pass++) {
    out = out.replace(/<m:sSub\b[^>]*>([\s\S]*?)<\/m:sSub>/gi, (_m, inner) => {
      const eMatch = inner.match(/<m:e\b[^>]*>([\s\S]*?)<\/m:e>/i);
      const subMatch = inner.match(/<m:sub\b[^>]*>([\s\S]*?)<\/m:sub>/i);
      const base = eMatch ? convertOmmlNodeToText(eMatch[1]).trim() : '';
      const sub = subMatch ? convertOmmlNodeToText(subMatch[1]).trim() : '';
      return `${base}_{${sub}}`;
    });
  }

  // Delimiters: <m:d>
  for (let pass = 0; pass < 3 && /<m:d\b/i.test(out); pass++) {
    out = out.replace(/<m:d\b[^>]*>([\s\S]*?)<\/m:d>/gi, (_m, inner) => {
      const begMatch = inner.match(/<m:begChr\s+m:val="([^"]*)"/i);
      const endMatch = inner.match(/<m:endChr\s+m:val="([^"]*)"/i);
      const beg = begMatch ? begMatch[1] : '(';
      const end = endMatch ? endMatch[1] : ')';
      const eMatches = [...inner.matchAll(/<m:e\b[^>]*>([\s\S]*?)<\/m:e>/gi)].map((em) =>
        convertOmmlNodeToText(em[1]).trim()
      );
      return `${beg}${eMatches.join(', ')}${end}`;
    });
  }

  return extractPlain(out)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeXmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Rewrites Word .docx XML so embedded <m:oMathPara> and <m:oMath> equations become readable <w:r><w:t>
 * elements before mammoth converts the document to HTML.
 */
async function preprocessDocxEquations(arrayBuffer: ArrayBuffer): Promise<ArrayBuffer> {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const docFile = zip.file('word/document.xml');
    if (!docFile) return arrayBuffer;
    const xml = await docFile.async('string');
    if (!xml.includes('<m:oMath')) return arrayBuffer;

    let modified = xml.replace(/<m:oMathPara\b[^>]*>([\s\S]*?)<\/m:oMathPara>/gi, (full) => {
      const mathText = convertOmmlNodeToText(full);
      if (!mathText) return '';
      return `<w:r><w:t xml:space="preserve">[[FORMULA_BLOCK:${escapeXmlText(mathText)}]]</w:t></w:r>`;
    });

    modified = modified.replace(/<m:oMath\b[^>]*>([\s\S]*?)<\/m:oMath>/gi, (full) => {
      const mathText = convertOmmlNodeToText(full);
      if (!mathText) return '';
      return `<w:r><w:t xml:space="preserve"> ${escapeXmlText(mathText)} </w:t></w:r>`;
    });

    if (modified === xml) return arrayBuffer;
    zip.file('word/document.xml', modified);
    return await zip.generateAsync({ type: 'arraybuffer' });
  } catch {
    return arrayBuffer;
  }
}

/**
 * Helper to convert a pdfjs image object into a PNG Data URI.
 */
function pdfImageObjToDataUrl(imgObj: any): string | null {
  if (typeof document === 'undefined' || !imgObj) return null;
  try {
    const width = imgObj.width;
    const height = imgObj.height;
    if (!width || !height || width < 16 || height < 16) return null;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (
      (typeof HTMLImageElement !== 'undefined' && imgObj instanceof HTMLImageElement) ||
      (typeof HTMLCanvasElement !== 'undefined' && imgObj instanceof HTMLCanvasElement) ||
      (typeof ImageBitmap !== 'undefined' && imgObj instanceof ImageBitmap) ||
      imgObj.bitmap
    ) {
      ctx.drawImage(imgObj.bitmap || imgObj, 0, 0, width, height);
      return canvas.toDataURL('image/png');
    }

    if (imgObj.data) {
      const imageData = ctx.createImageData(width, height);
      const src = imgObj.data;
      const dst = imageData.data;

      if (src.length === width * height * 4) {
        dst.set(src);
      } else if (src.length === width * height * 3) {
        for (let s = 0, d = 0; s < src.length; s += 3, d += 4) {
          dst[d] = src[s];
          dst[d + 1] = src[s + 1];
          dst[d + 2] = src[s + 2];
          dst[d + 3] = 255;
        }
      } else if (src.length === width * height) {
        for (let s = 0, d = 0; s < src.length; s++, d += 4) {
          dst[d] = src[s];
          dst[d + 1] = src[s];
          dst[d + 2] = src[s];
          dst[d + 3] = 255;
        }
      } else {
        return null;
      }

      ctx.putImageData(imageData, 0, 0);
      return canvas.toDataURL('image/png');
    }
  } catch {
    return null;
  }
  return null;
}

function isGarbledPdfText(text: string): boolean {
  const clean = text.replace(/\s+/g, '');
  if (!clean) return false;
  const replacementChars = (clean.match(/\uFFFD/g) || []).length;
  const cidTokens = (text.match(/\bcid:\d+\b/gi) || []).length;
  return replacementChars / clean.length > 0.12 || cidTokens >= 3;
}

/**
 * Reconstructs clean reading-order lines from PDF.js textContent items using Y/X coordinates and width gaps.
 * Automatically detects true 2-column exam pages (numbered questions on both left and right halves)
 * while preserving side-by-side choices (A./B. and C./D.) on single-column exams.
 */
function buildPdfPageText(items: any[]): string {
  interface PdfItemPos {
    str: string;
    x: number;
    y: number;
    w: number;
    h: number;
    hasEOL: boolean;
  }

  const positioned: PdfItemPos[] = [];
  let minX = Infinity;
  let maxX = -Infinity;

  for (const item of items) {
    if (!('str' in item)) continue;
    const str = String(item.str || '');
    const x = Array.isArray(item.transform) ? Number(item.transform[4]) || 0 : 0;
    const y = Array.isArray(item.transform) ? Number(item.transform[5]) || 0 : 0;
    const rawH = Math.abs(
      Number(item.height) ||
        (Array.isArray(item.transform) ? Number(item.transform[0]) || Number(item.transform[3]) : 11) ||
        11
    );
    const h = rawH >= 4 && rawH <= 72 ? rawH : 11;
    const w = Math.max(0, Number(item.width) || 0);

    if (str.trim()) {
      if (x < minX) minX = x;
      const rightEdge = Math.max(x, x + w);
      if (rightEdge > maxX) maxX = rightEdge;
    }
    positioned.push({
      str,
      x,
      y,
      w,
      h,
      hasEOL: Boolean(item.hasEOL),
    });
  }

  if (positioned.length === 0) return '';

  const collapseRows = (subset: PdfItemPos[]): string[] => {
    const sorted = [...subset].sort((a, b) => {
      const tol = Math.max(3.5, Math.min(5.5, ((a.h + b.h) / 2) * 0.42));
      if (Math.abs(b.y - a.y) > tol) return b.y - a.y;
      return a.x - b.x;
    });

    const lines: string[] = [];
    let currentRowY: number | null = null;
    let currentRowTol = 4.2;
    let rowItems: PdfItemPos[] = [];

    const flushRow = () => {
      if (rowItems.length === 0) return;
      rowItems.sort((a, b) => a.x - b.x);
      const textItems: PdfItemPos[] = [];
      const imgParts: string[] = [];
      for (const item of rowItems) {
        if (item.str.includes('[[IMAGE_DATA:')) {
          imgParts.push(item.str.trim());
        } else if (item.str.length > 0) {
          textItems.push(item);
        }
      }

      let joinedText = '';
      let prevEndX: number | null = null;
      let prevEndsSpace = true;

      for (const item of textItems) {
        const chunk = item.str;
        if (!chunk) continue;
        const refSize = Math.max(7.5, Math.min(18, item.h || 11));

        if (!joinedText) {
          joinedText = chunk;
        } else if (prevEndX !== null) {
          const gap = item.x - prevEndX;
          const currStartsSpace = /^\s/.test(chunk);
          if (prevEndsSpace || currStartsSpace || gap <= refSize * 0.18) {
            joinedText += chunk;
          } else if (gap >= refSize * 1.6) {
            // Preserve column separation for side-by-side choices (A. ...   B. ...)
            joinedText += '   ' + chunk.trimStart();
          } else {
            joinedText += ' ' + chunk.trimStart();
          }
        } else {
          joinedText += chunk;
        }

        const estWidth = item.w > 0 ? item.w : chunk.length * refSize * 0.48;
        prevEndX = item.x + estWidth;
        prevEndsSpace = /\s$/.test(chunk);
      }

      joinedText = joinedText.replace(/\t+/g, '   ').replace(/ {4,}/g, '   ').trim();

      if (joinedText && imgParts.length > 0) {
        lines.push(`${joinedText} ${imgParts.join(' ')}`.trim());
      } else if (joinedText) {
        lines.push(joinedText);
      } else if (imgParts.length > 0) {
        lines.push(...imgParts);
      }
      rowItems = [];
    };

    for (const it of sorted) {
      if (!it.str.trim() && !it.str.includes('[[IMAGE_DATA:')) continue;
      const itemTol = Math.max(3.5, Math.min(5.5, it.h * 0.42));
      if (currentRowY !== null && Math.abs(it.y - currentRowY) > Math.max(currentRowTol, itemTol)) {
        flushRow();
        currentRowY = it.y;
        currentRowTol = itemTol;
      } else if (currentRowY === null) {
        currentRowY = it.y;
        currentRowTol = itemTol;
      }

      rowItems.push(it);
    }
    flushRow();
    return lines;
  };

  // Detect true 2-column exam layout (ignore top/bottom edge page numbers when finding column bounds)
  const span = maxX - minX;
  if (span > 200) {
    const midX = minX + span * 0.48;
    const isPageNumArtifact = (s: string) =>
      /^(?:hal(?:aman)?\.?\s*\d+(?:\s*(?:dari|\/|of)\s*\d+)?|page\s+\d+(?:\s+of\s+\d+)?|-\s*\d+\s*-|\d{1,3})$/i.test(
        s.trim()
      );
    const rightAll = positioned.filter((p) => p.x >= midX && p.str.trim());
    const rightContent = rightAll.filter((p) => !isPageNumArtifact(p.str));
    const leftAll = positioned.filter((p) => p.x < midX && p.str.trim());
    const qStartRe = /^\(?\d{1,3}\s*[\.\)]/;
    const optStartRe = /^\(?[A-Ea-e]\s*[\.\)]/;

    if (rightContent.length > 0 && leftAll.length > 0) {
      const maxRightY = Math.max(...rightContent.map((p) => p.y));
      const minRightY = Math.min(...rightContent.map((p) => p.y));

      const headerItems = positioned.filter((p) => p.y > maxRightY + 6);
      const bodyLeft = leftAll.filter((p) => p.y <= maxRightY + 6);

      // Keep any trailing KUNCI JAWABAN section below both columns in footer
      const kunciItem = bodyLeft.find(
        (p) => p.y < minRightY - 4 && /\bkunci\b/i.test(p.str)
      );
      const footerY = kunciItem ? kunciItem.y : -Infinity;

      const leftColItems = bodyLeft.filter((p) => p.y > footerY + 2);
      const rightColItems = rightAll.filter((p) => p.y <= maxRightY + 6 && p.y > footerY + 2);
      const footerItems = positioned.filter((p) => p.y <= footerY + 2);

      const leftLines = collapseRows(leftColItems);
      const rightLines = collapseRows(rightColItems);

      const leftQCount = leftLines.filter((l) => qStartRe.test(l)).length;
      const rightQCount = rightLines.filter((l) => qStartRe.test(l)).length;
      const leftOptCount = leftLines.filter((l) => optStartRe.test(l)).length;
      const rightOptCount = rightLines.filter((l) => optStartRe.test(l)).length;

      if (
        (leftQCount >= 2 && rightQCount >= 2) ||
        (leftQCount >= 1 && rightQCount >= 1 && leftOptCount >= 2 && rightOptCount >= 2)
      ) {
        return [
          ...collapseRows(headerItems),
          ...leftLines,
          ...rightLines,
          ...collapseRows(footerItems),
        ].join('\n');
      }
    }
  }

  return collapseRows(positioned).join('\n');
}

/**
 * Extracts text, embedded images, and scanned page snapshots from a PDF file using pdfjs-dist.
 * Uses locally hosted /pdf.worker.min.mjs (no external CDN dependency) with automatic fallback.
 */
export interface ScannedPdfPagePayload {
  pageNumber: number;
  imageBase64: string;
  mimeType: string;
}

async function extractFromPdf(arrayBuffer: ArrayBuffer): Promise<{
  text: string;
  pageCount: number;
  assets: ExtractedImageAsset[];
  pageImages: Record<number, string[]>;
  scannedPages: ScannedPdfPagePayload[];
  failedImagesCount: number;
  imageWarnings: string[];
}> {
  const assets: ExtractedImageAsset[] = [];
  const pageImages: Record<number, string[]> = {};
  const scannedPages: ScannedPdfPagePayload[] = [];
  const imageWarnings: string[] = [];
  let failedImagesCount = 0;

  try {
    if (typeof (Promise as any).try !== 'function') {
      (Promise as any).try = function (fn: (...a: any[]) => any, ...args: any[]) {
        return new Promise((resolve) => resolve(fn(...args)));
      };
    }

    const pdfjs: any =
      typeof window === 'undefined'
        ? await import('pdfjs-dist/legacy/build/pdf.mjs')
        : await import('pdfjs-dist');

    // Use local static worker in browser (public/pdf.worker.min.mjs) instead of external CDN
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
    } catch (workerErr) {
      // Retry with worker disabled or legacy build if worker loading failed in restricted browser
      console.warn('[PdfParser] Worker load gagal, mencoba mode tanpa worker:', workerErr);
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
    }

    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const extractedOnPage: string[] = [];
      const positionedImageItems: Array<{ str: string; transform: number[]; hasEOL: boolean }> = [];

      const multiplyMatrix = (m1: number[], m2: number[]): number[] => [
        m1[0] * m2[0] + m1[2] * m2[1],
        m1[1] * m2[0] + m1[3] * m2[1],
        m1[0] * m2[2] + m1[2] * m2[3],
        m1[1] * m2[2] + m1[3] * m2[3],
        m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
        m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
      ];

      if (typeof document !== 'undefined') {
        try {
          const opList = await page.getOperatorList();
          const OPS = pdfjs.OPS;
          const hasImageOps = opList.fnArray.some(
            (fn: number) =>
              fn === OPS.paintImageXObject ||
              fn === OPS.paintImageMaskXObject ||
              fn === OPS.paintInlineImageXObject
          );
          const prePageText = buildPdfPageText(textContent.items as any[]);
          const isLowTextPage = prePageText.trim().length < 80 || isGarbledPdfText(prePageText);

          if (hasImageOps || (isLowTextPage && i <= 25)) {
            const viewport = page.getViewport({ scale: 1.4 });
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(viewport.width);
            canvas.height = Math.round(viewport.height);
            const ctx = canvas.getContext('2d');

            if (ctx) {
              await page.render({ canvasContext: ctx, viewport }).promise;

              if (isLowTextPage || i <= 20) {
                const pageDataUrl = canvas.toDataURL('image/jpeg', 0.78);
                const commaIdx = pageDataUrl.indexOf(',');
                if (commaIdx !== -1) {
                  scannedPages.push({
                    pageNumber: i,
                    imageBase64: pageDataUrl.slice(commaIdx + 1),
                    mimeType: 'image/jpeg',
                  });
                }
                if (isLowTextPage || i <= 8) {
                  assets.push({
                    id: `pdf_page_${i}`,
                    url: pageDataUrl,
                    label: `Halaman PDF ${i} (Pratinjau / Scan)`,
                    pageNumber: i,
                    source: 'pdf-page',
                  });
                }
              }

              const seenObjIds = new Set<string>();
              let ctm = [1, 0, 0, 1, 0, 0];
              const ctmStack: number[][] = [];

              for (let opIdx = 0; opIdx < opList.fnArray.length; opIdx++) {
                const fn = opList.fnArray[opIdx];
                const args = opList.argsArray[opIdx];

                if (fn === OPS.save) {
                  ctmStack.push([...ctm]);
                } else if (fn === OPS.restore) {
                  ctm = ctmStack.pop() || [1, 0, 0, 1, 0, 0];
                } else if (fn === OPS.transform && Array.isArray(args) && args.length >= 6) {
                  ctm = multiplyMatrix(ctm, args.slice(0, 6).map(Number));
                } else if (fn === OPS.paintImageXObject || fn === OPS.paintImageMaskXObject) {
                  const objId = args?.[0];
                  if (!objId || seenObjIds.has(String(objId))) continue;
                  seenObjIds.add(String(objId));

                  try {
                    const imgObj = page.objs.has(objId)
                      ? page.objs.get(objId)
                      : page.commonObjs.has(objId)
                      ? page.commonObjs.get(objId)
                      : null;
                    const dataUrl = pdfImageObjToDataUrl(imgObj);
                    if (dataUrl) {
                      extractedOnPage.push(dataUrl);
                      const imgCenterX = ctm[4] + 0.5 * (ctm[0] + ctm[2]);
                      const imgTopY = Math.max(ctm[5], ctm[5] + ctm[3]);
                      const imgMidY = ctm[5] + 0.5 * (ctm[1] + ctm[3]);
                      const anchorY = Number.isFinite(imgTopY) ? imgTopY : Number.isFinite(imgMidY) ? imgMidY : 0;
                      positionedImageItems.push({
                        str: `[[IMAGE_DATA:${dataUrl}]]`,
                        transform: [1, 0, 0, 1, Number.isFinite(imgCenterX) ? imgCenterX : 0, anchorY],
                        hasEOL: true,
                      });
                      assets.push({
                        id: `pdf_p${i}_img_${extractedOnPage.length}`,
                        url: dataUrl,
                        label: `Gambar Halaman ${i} (#${extractedOnPage.length})`,
                        pageNumber: i,
                        source: 'pdf',
                      });
                    } else if (imgObj) {
                      failedImagesCount++;
                      imageWarnings.push(
                        `Sebuah objek gambar di halaman ${i} PDF memiliki format internal yang tidak dapat diekstrak langsung. Gunakan menu 'Atur / Crop' dari pratinjau halaman ${i}.`
                      );
                    }
                  } catch {
                    failedImagesCount++;
                    imageWarnings.push(
                      `Gambar pada halaman ${i} PDF gagal diekstrak otomatis. Silakan potong dari Halaman PDF ${i} di editor.`
                    );
                  }
                } else if (fn === OPS.paintInlineImageXObject) {
                  const inlineImg = args?.[0];
                  const dataUrl = pdfImageObjToDataUrl(inlineImg);
                  if (dataUrl) {
                    extractedOnPage.push(dataUrl);
                    const imgCenterX = ctm[4] + 0.5 * (ctm[0] + ctm[2]);
                    const imgTopY = Math.max(ctm[5], ctm[5] + ctm[3]);
                    positionedImageItems.push({
                      str: `[[IMAGE_DATA:${dataUrl}]]`,
                      transform: [1, 0, 0, 1, Number.isFinite(imgCenterX) ? imgCenterX : 0, Number.isFinite(imgTopY) ? imgTopY : 0],
                      hasEOL: true,
                    });
                    assets.push({
                      id: `pdf_p${i}_inline_${extractedOnPage.length}`,
                      url: dataUrl,
                      label: `Gambar Inline Halaman ${i} (#${extractedOnPage.length})`,
                      pageNumber: i,
                      source: 'pdf',
                    });
                  }
                }
              }
            }
          }
        } catch (renderErr) {
          console.warn(`[PdfParser] Gagal memproses gambar halaman ${i}:`, renderErr);
          failedImagesCount++;
          imageWarnings.push(`Gagal memproses elemen visual pada halaman ${i} PDF.`);
        }
      }

      if (extractedOnPage.length > 0) {
        pageImages[i] = extractedOnPage;
      }

      const combinedItems = [...(textContent.items as any[]), ...positionedImageItems];
      const pageTextWithSpatialImages = buildPdfPageText(combinedItems);
      fullText += `\n[--- HALAMAN ${i} ---]\n${pageTextWithSpatialImages}\n`;
    }

    return {
      text: fullText.trim(),
      pageCount: pdf.numPages,
      assets,
      pageImages,
      scannedPages,
      failedImagesCount,
      imageWarnings: Array.from(new Set(imageWarnings)),
    };
  } catch (err) {
    console.warn('[PdfParser] Pembacaan PDF via pdfjs-dist gagal:', err);
    return {
      text: '',
      pageCount: 0,
      assets: [],
      pageImages: {},
      scannedPages: [],
      failedImagesCount: 0,
      imageWarnings: [],
    };
  }
}

/**
 * Recursively transforms HTML <ol> lists (Microsoft Word auto-numbering & auto-lettering)
 * into explicit numbered questions (1., 2., 3.) and options (A., B., C., D., E.).
 */
function expandWordOrderedListsInDom(root: HTMLElement): void {
  const docRef = root.ownerDocument || document;
  let globalQuestionCounter = 0;

  const insertPrefixIntoLi = (li: HTMLLIElement, prefixText: string) => {
    const firstEl = li.firstElementChild;
    if (firstEl && (firstEl.tagName === 'P' || firstEl.tagName === 'DIV')) {
      firstEl.insertBefore(docRef.createTextNode(prefixText), firstEl.firstChild);
    } else {
      li.insertBefore(docRef.createTextNode(prefixText), li.firstChild);
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

    const effectiveOptionList =
      isOptionList || listType === 'a' || listType === 'i';

    listItems.forEach((li, itemIdx) => {
      const nestedOls = Array.from(li.querySelectorAll(':scope > ol')) as HTMLOListElement[];
      nestedOls.forEach((nested, nestedPos) => {
        const nestedType = (nested.getAttribute('type') || '').toLowerCase();
        const nestedLis = Array.from(nested.children).filter((el) => el.tagName === 'LI');
        const hasLetteredSiblingAfter = nestedOls.slice(nestedPos + 1).some((sib) => {
          const st = (sib.getAttribute('type') || '').toLowerCase();
          return st === 'a';
        });
        const looksLikeSubStatementList =
          nestedType !== 'a' &&
          (hasLetteredSiblingAfter ||
            nestedLis.length > 5 ||
            nestedLis.every((nl) => /^\(?\d+[\.\)]/.test((nl.textContent || '').trim())));
        processList(nested, !looksLikeSubStatementList);
      });

      const currentText = (li.textContent || '').trim();
      const alreadyHasNumber = /^(?:soal\s*|no\.?\s*)?\(?\d+[\.\)\:]/.test(currentText);
      const alreadyHasLetter = /^\(?[A-Ea-e][\.\)]/.test(currentText);

      if (effectiveOptionList) {
        if (!alreadyHasLetter && itemIdx < 5) {
          const letter = String.fromCharCode(65 + itemIdx); // A..E
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

  // Sync manual numbered paragraphs preceding any <ol> so mixed manual + auto-numbered docs continue sequentially
  const allOls = Array.from(root.querySelectorAll('ol'));
  for (const ol of allOls) {
    if (!ol.isConnected) continue;
    if (ol.parentElement?.closest('ol')) continue;

    // Scan preceding sibling blocks to detect highest manual question number seen so far
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
      if (!prevText || prevText.startsWith('[[IMAGE_DATA:')) {
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

/**
 * Formats structured Word/HTML columnar exam tables (No | Pertanyaan | A | B | C | D | E | Kunci | Pembahasan)
 * into clean sequential question text so columns are never scrambled.
 */
function tryFormatColumnarExamTable(parsedRows: string[][]): string[] | null {
  if (parsedRows.length < 2) return null;
  const header = parsedRows[0].map((c) => c.trim().toLowerCase());
  const qCol = header.findIndex((h) => /^(?:pertanyaan|soal|teks\s*soal|butir\s*soal|question)$/.test(h));
  if (qCol === -1) return null;

  const colMap: Record<string, number> = { pertanyaan: qCol };
  header.forEach((h, idx) => {
    if (/^(?:no|no\.?|nomor)$/.test(h)) colMap.no = idx;
    else if (/^(?:a|pilihan\s*a|opsi\s*a|jwb\s*a)$/.test(h)) colMap.A = idx;
    else if (/^(?:b|pilihan\s*b|opsi\s*b|jwb\s*b)$/.test(h)) colMap.B = idx;
    else if (/^(?:c|pilihan\s*c|opsi\s*c|jwb\s*c)$/.test(h)) colMap.C = idx;
    else if (/^(?:d|pilihan\s*d|opsi\s*d|jwb\s*d)$/.test(h)) colMap.D = idx;
    else if (/^(?:e|pilihan\s*e|opsi\s*e|jwb\s*e)$/.test(h)) colMap.E = idx;
    else if (/^(?:kunci|kunci\s*jawaban|jawaban|kj|answer)$/.test(h)) colMap.kunci = idx;
    else if (/^(?:pembahasan|penjelasan|rubrik|pedoman)$/.test(h)) colMap.pembahasan = idx;
  });

  if (colMap.A === undefined && colMap.B === undefined && colMap.kunci === undefined) {
    return null;
  }

  const lines: string[] = [];
  let autoNo = 0;
  for (let r = 1; r < parsedRows.length; r++) {
    const row = parsedRows[r];
    const qText = (row[colMap.pertanyaan] || '').trim();
    if (!qText) continue;
    autoNo++;
    const rawNo = colMap.no !== undefined ? (row[colMap.no] || '').replace(/[\.\)]$/, '').trim() : '';
    const num = /^\d+$/.test(rawNo) ? rawNo : String(autoNo);
    const hasNumPrefix = /^(?:soal\s*|no\.?\s*)?\(?\d+[\.\)]/.test(qText);
    lines.push(hasNumPrefix ? qText : `${num}. ${qText}`);

    (['A', 'B', 'C', 'D', 'E'] as const).forEach((letter) => {
      if (colMap[letter] !== undefined) {
        const val = (row[colMap[letter]] || '').trim();
        if (val) {
          const cleanOpt = stripRedundantOptionLabel(letter, val);
          lines.push(`${letter}. ${cleanOpt || val}`);
        }
      }
    });

    if (colMap.kunci !== undefined && row[colMap.kunci]?.trim()) {
      lines.push(`Kunci: ${row[colMap.kunci].trim()}`);
    }
    if (colMap.pembahasan !== undefined && row[colMap.pembahasan]?.trim()) {
      lines.push(`Pembahasan: ${row[colMap.pembahasan].trim()}`);
    }
  }
  return lines.length > 0 ? lines : null;
}

/**
 * Helper to expand layout table rows cleanly (including paired columns, columnar tables, and 2x2 A/C + B/D option grids).
 */
function formatLayoutTableRows(parsedRows: string[][]): string[] {
  const columnar = tryFormatColumnarExamTable(parsedRows);
  if (columnar) return columnar;

  // Detect 2x2 or 2xN vertical-first option grid (e.g. Row 1: ["A. ...", "C. ..."], Row 2: ["B. ...", "D. ..."])
  const nonEmptyRows = parsedRows
    .map((cells) => cells.map((c) => c.trim()).filter(Boolean))
    .filter((r) => r.length > 0);
  if (
    nonEmptyRows.length >= 2 &&
    nonEmptyRows[0].length === 2 &&
    /^\(?A[\.\)]/i.test(nonEmptyRows[0][0]) &&
    /^\(?C[\.\)]/i.test(nonEmptyRows[0][1]) &&
    /^\(?B[\.\)]/i.test(nonEmptyRows[1]?.[0] || '')
  ) {
    const col1: string[] = [];
    const col2: string[] = [];
    for (const r of nonEmptyRows) {
      if (r[0]) col1.push(r[0]);
      if (r[1]) col2.push(r[1]);
    }
    return [...col1, ...col2];
  }

  const outLines: string[] = [];
  for (const nonEmpty of nonEmptyRows) {
    // Case 1: Paired columns like ['A.', 'Jakarta', 'B.', 'Bandung'] or ['1.', 'Pertanyaan', 'Kunci', 'A']
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

/**
 * Distinguishes actual data tables inside a question stem (e.g. physics/math measurement tables)
 * from Word/HTML exam layout tables where column 1 holds question numbers and column 2+ holds stems/options.
 */
function isLayoutExamTable(parsedRows: string[][], hasThHeaderRow: boolean): boolean {
  if (parsedRows.length === 0) return false;
  const headerCells = parsedRows[0] || [];
  const headerJoined = headerCells.map((h) => h.trim().toLowerCase()).join(' | ');

  // Explicit layout header for question tables (e.g. "No | Soal | Pilihan A ...")
  const hasExplicitExamTableHeader =
    headerCells.length >= 2 &&
    (/\b(?:soal|pertanyaan|butir)\b/i.test(headerJoined) ||
      /\b(?:pilihan\s*a|opsi\s*a)\b/i.test(headerJoined));

  const looksLikeDataTableHeader =
    !hasExplicitExamTableHeader &&
    headerCells.length >= 2 &&
    (hasThHeaderRow ||
      headerCells.some((h) =>
        /^(?:no\.?|nama|nilai|jumlah|frekuensi|data|bulan|tahun|kelas|siswa|hasil|skor|keterangan|jenis|persentase|hari|tanggal|mata pelajaran|mapel|kunci|waktu|jarak|kecepatan|suhu|massa|berat|tinggi|panjang|lebar|luas|volume|harga|usia|umur|kota|negara|x|y|f\(x\))(?:\s*\([^)]+\))?$/i.test(
          h.trim()
        )
      ));

  if (looksLikeDataTableHeader) {
    return false;
  }

  const hasExplicitQuestionOrOptionLayout = parsedRows.some((cells) =>
    cells.some(
      (c) =>
        c.includes('[[IMAGE_DATA:') ||
        c.includes('[[IMAGE_ERROR:') ||
        /^(?:soal\s*)?\d+[\.\)]\s+/i.test(c) ||
        /^\(?[A-Ea-e][\.\)](?:\s|$)/.test(c)
    )
  );

  const hasStandaloneNumberColumn = parsedRows.some((cells) => {
    const first = (cells[0] || '').trim();
    const rest = cells.slice(1).join(' ').trim();
    if (!/^\d+[\.\)]?$/.test(first)) return false;
    // Short numeric/scalar cell in column 2+ indicates tabular data, not a question stem
    return rest.length >= 16 || /[?]|\.{3,}|\b[A-D][\.\)]\s+/.test(rest);
  });

  return hasExplicitQuestionOrOptionLayout || hasStandaloneNumberColumn;
}

const SUP_DIGIT_MAP: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};
const SUB_DIGIT_MAP: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
};

function formatSuperscriptText(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  if (/^[0-9]+$/.test(s)) {
    return s.split('').map((c) => SUP_DIGIT_MAP[c] || c).join('');
  }
  return `^{${s}}`;
}

function formatSubscriptText(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  if (/^[0-9]+$/.test(s)) {
    return s.split('').map((c) => SUB_DIGIT_MAP[c] || c).join('');
  }
  return `_{${s}}`;
}

/**
 * Converts HTML tables, Word <ol> numbering, <sup>/<sub>, and embedded <img> tags into structured lines.
 */
export function convertHtmlTablesToMarkdown(html: string): {
  cleanHtml: string;
  textWithTables: string;
  extractedImageUrls: string[];
  failedImageCount: number;
} {
  const extractedImageUrls: string[] = [];
  let failedImageCount = 0;

  if (typeof document === 'undefined') {
    // Fallback parsing when running in Node.js (e.g. unit/integration verification scripts without DOM)
    let text = html;
    text = text.replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, (_m, src) => {
      if (src && src.startsWith('data:image/')) {
        extractedImageUrls.push(src);
        return `\n[[IMAGE_DATA:${src}]]\n`;
      }
      failedImageCount++;
      return `\n[[IMAGE_ERROR:Sumber gambar tidak terbaca]]\n`;
    });

    text = text.replace(/<sup[^>]*>([\s\S]*?)<\/sup>/gi, (_m, inner) =>
      formatSuperscriptText(inner.replace(/<[^>]+>/g, ''))
    );
    text = text.replace(/<sub[^>]*>([\s\S]*?)<\/sub>/gi, (_m, inner) =>
      formatSubscriptText(inner.replace(/<[^>]+>/g, ''))
    );

    // Convert <ol> lists from innermost outward so nested question/option lists keep A-E & 1-N!
    let guard = 0;
    while (/<ol[^>]*>/i.test(text) && guard < 20) {
      guard++;
      const hadInner = text;
      text = text.replace(/<ol([^>]*)>((?:(?!<ol[\s>])[\s\S])*?)<\/ol>/gi, (fullMatch, attrs, inner, matchOffset) => {
        const isAlphaAttr = /type=["']?[aA]["']?/i.test(attrs);
        const liMatches = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
        const insideLi = text.lastIndexOf('<li', matchOffset) > text.lastIndexOf('</li>', matchOffset);
        const isShortAlphaCandidate =
          insideLi &&
          liMatches.length >= 2 &&
          liMatches.length <= 5 &&
          liMatches.every((lm) => {
            const plain = lm[1].replace(/<[^>]+>/g, ' ').trim();
            return (
              plain.length < 180 &&
              !/^\d+[\.\)]/.test(plain) &&
              !/\b[A-E]\.\s+/.test(plain) &&
              !/[?]$|\.{4,}/.test(plain)
            );
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
      });
      if (hadInner === text) break;
    }

    text = text.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_match, tableInner) => {
      const rowMatches = [...tableInner.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
      const parsedRows: string[][] = rowMatches.map((rm) => {
        const cellMatches = [...rm[1].matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)];
        return cellMatches.map((cm) =>
          cm[1]
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(?:p|div|li)>/gi, '\n')
            .replace(/<[^>]+>/g, ' ')
            .replace(/[ \t]+/g, ' ')
            .trim()
        );
      });

      const hasThHeaderRow = /<th[\s>]/i.test(tableInner);
      const isLayoutTable = isLayoutExamTable(parsedRows, hasThHeaderRow);

      if (isLayoutTable) {
        return '\n' + formatLayoutTableRows(parsedRows).join('\n') + '\n';
      }

      const mdRows: string[] = [];
      parsedRows.forEach((cells, rIdx) => {
        if (cells.length === 0) return;
        mdRows.push('| ' + cells.map((c) => c.replace(/\n+/g, ' ') || '-').join(' | ') + ' |');
        if (rIdx === 0) {
          mdRows.push('| ' + cells.map(() => '---').join(' | ') + ' |');
        }
      });
      return '\n\n' + mdRows.join('\n') + '\n\n';
    });

    text = text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>');

    return { cleanHtml: html, textWithTables: text, extractedImageUrls, failedImageCount };
  }

  const parsedDoc = new DOMParser().parseFromString(html, 'text/html');
  const container = parsedDoc.body;
  const docRef = container.ownerDocument || document;

  // Preserve all embedded images by converting them to unique structured markers
  const images = container.querySelectorAll('img');
  images.forEach((img) => {
    const src = img.getAttribute('src') || '';
    if (src && (src.startsWith('data:image/') || src.startsWith('http'))) {
      extractedImageUrls.push(src);
      const marker = docRef.createTextNode(`\n[[IMAGE_DATA:${src}]]\n`);
      img.replaceWith(marker);
    } else {
      failedImageCount++;
      img.replaceWith(docRef.createTextNode(`\n[[IMAGE_ERROR:Gambar tertanam tidak dapat dibaca]]\n`));
    }
  });

  // Preserve superscripts & subscripts before flattening DOM to text
  container.querySelectorAll('sup').forEach((sup) => {
    const val = formatSuperscriptText(sup.textContent || '');
    sup.replaceWith(docRef.createTextNode(val));
  });
  container.querySelectorAll('sub').forEach((sub) => {
    const val = formatSubscriptText(sub.textContent || '');
    sub.replaceWith(docRef.createTextNode(val));
  });

  // Expand Word auto-numbered / auto-lettered lists (<ol><li>) BEFORE flattening paragraphs
  expandWordOrderedListsInDom(container);

  // Preserve line breaks for paragraphs, list items, headings
  container.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6').forEach((el) => {
    el.appendChild(docRef.createTextNode('\n'));
  });
  container.querySelectorAll('br').forEach((el) => {
    el.replaceWith(docRef.createTextNode('\n'));
  });

  const tables = container.querySelectorAll('table');
  tables.forEach((table) => {
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
      if (cells.length > 0) {
        parsedRows.push(cells);
      }
    });

    const firstTr = table.querySelector('tr');
    const hasThHeaderRow = Boolean(firstTr && firstTr.querySelector('th'));
    const isLayoutTable = isLayoutExamTable(parsedRows, hasThHeaderRow);

    if (isLayoutTable) {
      table.replaceWith(docRef.createTextNode('\n' + formatLayoutTableRows(parsedRows).join('\n') + '\n'));
    } else {
      const rows: string[] = [];
      parsedRows.forEach((cells, rIdx) => {
        rows.push('| ' + cells.map((c) => c.replace(/\n+/g, ' ') || '-').join(' | ') + ' |');
        if (rIdx === 0) {
          rows.push('| ' + cells.map(() => '---').join(' | ') + ' |');
        }
      });

      if (rows.length > 0) {
        const tableMd = '\n\n' + rows.join('\n') + '\n\n';
        table.replaceWith(docRef.createTextNode(tableMd));
      }
    }
  });

  return {
    cleanHtml: html,
    textWithTables: container.textContent || html,
    extractedImageUrls,
    failedImageCount,
  };
}

/**
 * Splits lines that contain multiple choices horizontally (e.g. "A. Satu   B. Dua   C. Tiga   D. Empat")
 * into separate lines while keeping image markers intact.
 */
function splitInlineMultipleChoices(lines: string[]): string[] {
  const expanded: string[] = [];

  for (const line of lines) {
    if (line.includes('[[IMAGE_DATA:') || line.startsWith('|')) {
      expanded.push(line);
      continue;
    }
    const splitParts = splitInlineChoiceLine(line);
    if (splitParts.length > 1) {
      expanded.push(...splitParts);
    } else {
      expanded.push(line);
    }
  }

  return expanded;
}

/**
 * Extracts answer keys from a dedicated "KUNCI JAWABAN" section, table, or list.
 */
export function extractAnswerKeysFromSection(text: string): Record<number, string> {
  const keysMap: Record<number, string> = {};
  if (!text) return keysMap;

  // 1. Table format: "| 1 | A |" or "| 1 | BENAR |"
  const tableCellRegex = /\|\s*(\d+)\s*\|\s*(BENAR|SALAH|TRUE|FALSE|[A-Ea-e])\s*\|/gi;
  let match: RegExpExecArray | null;
  while ((match = tableCellRegex.exec(text)) !== null) {
    const num = parseInt(match[1], 10);
    const val = match[2].toUpperCase();
    if (num > 0 && num <= 500) {
      keysMap[num] = val;
    }
  }

  // 2. Standard list & inline format: "1. A", "1) B", "1=C", "1: Benar", "1. Salah"
  const listRegex = /(?:^|\s|\b)(\d+)\s*[\.\)\:\=\-]\s*(BENAR|SALAH|TRUE|FALSE|[A-Ea-e])\b/gi;
  while ((match = listRegex.exec(text)) !== null) {
    const num = parseInt(match[1], 10);
    const val = match[2].toUpperCase();
    if (num > 0 && num <= 500 && !keysMap[num]) {
      keysMap[num] = val;
    }
  }

  // 3. Space-delimited tabular copy-paste format inside key section ("1 A  2 B  3 Benar")
  const spacedRegex = /(?:^|\s)(\d{1,3})\s+(BENAR|SALAH|TRUE|FALSE|[A-E])(?=\s|$)/g;
  while ((match = spacedRegex.exec(text)) !== null) {
    const num = parseInt(match[1], 10);
    const val = match[2].toUpperCase();
    if (num > 0 && num <= 500 && !keysMap[num]) {
      keysMap[num] = val;
    }
  }

  return keysMap;
}

/**
 * Applies answer keys from raw text to an existing question list.
 */
export function applyAnswerKeysFromText(
  soalList: SoalUjian[],
  keyText: string
): { updatedSoalList: SoalUjian[]; appliedCount: number } {
  const extractedKeys = extractAnswerKeysFromSection(keyText);
  let appliedCount = 0;

  const updated = soalList.map((q) => {
    const rawKey = extractedKeys[q.nomor];
    if (rawKey) {
      let normalizedKey = rawKey;
      if (q.tipe === 'benar_salah') {
        const tfKey = normalizeTrueFalseValue(rawKey);
        if (tfKey) {
          normalizedKey = tfKey;
        }
      }
      appliedCount++;
      return {
        ...q,
        kunciJawaban: normalizedKey,
        perluVerifikasi: false,
        catatanVerifikasi: undefined,
      };
    }
    return q;
  });

  return { updatedSoalList: updated, appliedCount };
}

/**
 * Parses raw text into structured SoalUjian strictly preserving original text and inline images.
 */
export function parseQuestionsFromText(
  rawText: string,
  imageMap: Record<string, string> = {}
): {
  soalList: SoalUjian[];
  metadata: { judul?: string; mapel?: string; kelas?: string; petunjuk?: string };
  imageWarnings: string[];
  failedImagesCount: number;
} {
  const baseLines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const allLines = splitInlineMultipleChoices(baseLines);

  let judul = '';
  let mapel = '';
  let kelas = '';
  let petunjuk = '';
  const imageWarnings: string[] = [];
  let failedImagesCount = 0;

  // 1. Scan top 25 lines for metadata header
  const headerLines = allLines.slice(0, 25);
  for (const line of headerLines) {
    if (line.includes('[[IMAGE_DATA:')) continue;
    const lower = line.toLowerCase();
    if (
      !judul &&
      (lower.includes('penilaian') ||
        lower.includes('ujian') ||
        lower.includes('asesmen') ||
        lower.includes('ulangan') ||
        lower.includes('sumatif'))
    ) {
      judul = line.replace(/^[#*_\s]+|[#*_\s]+$/g, '');
    }
    if (!mapel && (lower.includes('mata pelajaran') || lower.includes('mapel'))) {
      const match = line.match(/(?:mata pelajaran|mapel)\s*[:=]\s*([^|,\n]+)/i);
      if (match) mapel = match[1].trim();
    }
    if (!kelas && (lower.includes('kelas') || lower.includes('tingkat') || lower.includes('fase'))) {
      const match = line.match(/(?:kelas|fase)\s*[:=]?\s*([0-9IVXivx]+(?:\s*[A-Za-z])?)/i);
      if (match) kelas = `Kelas ${match[1].trim()}`;
    }
    if (!petunjuk && (lower.includes('petunjuk') || lower.includes('perhatian'))) {
      petunjuk = line;
    }
  }

  // 2. Separate dedicated answer key appendix if located at the end of the document
  // Guard: NEVER split on per-question keys (e.g. "Kunci Jawaban: B") or when numbered MC questions continue below!
  const keyHeadingKeywords = [
    'kunci jawaban',
    'kunci jawaban soal',
    'pedoman kunci jawaban',
    'lampiran kunci jawaban',
    'kunci soal',
    'kunci jawaban pilihan ganda',
    'daftar kunci jawaban',
  ];

  let splitIndex = -1;
  for (let i = 2; i < allLines.length; i++) {
    const rawLine = allLines[i].trim();
    const isSingleQuestionKeyLine =
      /^(?:kunci(?:\s+jawaban)?|jawaban(?:\s+benar)?|kj)\s*[:=\-]\s*(?:\(?[A-Ea-e]\)?|benar|betul|salah|false|true|\d+|[^\n]{1,60})$/i.test(
        rawLine
      ) && !/1\s*[\.\:\)\=]\s*[A-E]/i.test(rawLine);

    if (isSingleQuestionKeyLine) continue;

    const cleanLine = rawLine.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const withoutPrefix = cleanLine.replace(/^(?:[ivx]{1,4}|[a-e]|bagian\s+[a-z0-9]+)\s+/, '').trim();
    const isTableKeyHeader = /^\|\s*no\.?\s*\|\s*kunci/i.test(rawLine);
    const isKeyHeading =
      isTableKeyHeader ||
      keyHeadingKeywords.some(
        (kw) =>
          cleanLine === kw ||
          withoutPrefix === kw ||
          ((cleanLine.startsWith(kw + ' ') || withoutPrefix.startsWith(kw + ' ')) &&
            rawLine.length <= 80 &&
            !/\?$/.test(rawLine))
      );

    if (isKeyHeading) {
      // Confirm the tail does NOT resume full multi-choice question stems (e.g. "1. Apa... \n A. ... B. ...")
      const tailSlice = allLines.slice(i + 1, i + 25);
      const hasFullQuestionAfter = tailSlice.some((tl, idx) => {
        const nextFew = tailSlice.slice(idx + 1, idx + 5).join('\n');
        return /^\(?\d{1,3}[\.\)]\s+\S{15,}/.test(tl) && /(?:^|\n)\s*[A-B][\.\)]\s+\S/.test(nextFew);
      });
      if (!hasFullQuestionAfter) {
        splitIndex = i;
        break;
      }
    }
  }

  let questionLines = allLines;
  let answerKeySectionText = '';

  if (splitIndex !== -1) {
    questionLines = allLines.slice(0, splitIndex);
    answerKeySectionText = allLines.slice(splitIndex).join('\n');
  }

  const trailingKeys = extractAnswerKeysFromSection(answerKeySectionText);

  // 3. Process question lines
  const imageUris = Array.from(new Set(Object.values(imageMap)));
  let nextImageIdx = 0;

  const soalList: SoalUjian[] = [];
  let currentSoal: Partial<SoalUjian> | null = null;
  let currentPilihan: Record<string, string> = {};
  let currentPilihanGambar: Record<string, string> = {};
  let currentPertanyaanLines: string[] = [];
  let currentStemImages: Array<{ url: string; caption?: string; posIndex: number }> = [];
  let currentElements: KontenElemenSoal[] = [];
  let pendingTableLines: string[] = [];
  let pendingImagePosIndex: number = -1;
  let currentPosisiGambar: 'atas' | 'tengah' | 'bawah' = 'atas';
  let currentUkuranGambar: 'kecil' | 'sedang' | 'besar' | 'asli' = 'sedang';
  let currentImageWarning: string | undefined = undefined;
  let currentImageStatus: 'ok' | 'warning' | 'error' | undefined = undefined;
  let activeOptionLetter: string | null = null;
  let justAttachedStemImage = false;
  let elemCounter = 0;
  let currentSectionType: TipeSoalUjian | null = null;

  const flushPendingTable = () => {
    if (pendingTableLines.length === 0) return;
    currentElements.push({
      id: `el_${Date.now()}_${++elemCounter}`,
      tipe: 'tabel',
      markdown: pendingTableLines.join('\n'),
    });
    pendingTableLines = [];
  };

  const pushStemTextLine = (txt: string) => {
    if (!txt) return;
    // Check if markdown table line
    if (/^\|.*\|$/.test(txt)) {
      pendingTableLines.push(txt);
      currentPertanyaanLines.push(txt);
      justAttachedStemImage = false;
      return;
    }

    flushPendingTable();

    // Check if standalone formula block marker [[FORMULA_BLOCK:...]]
    const formulaMatch = txt.match(/^\[\[FORMULA_BLOCK:([\s\S]+?)\]\]$/);
    if (formulaMatch) {
      const expr = formulaMatch[1].trim();
      currentElements.push({
        id: `el_${Date.now()}_${++elemCounter}`,
        tipe: 'rumus',
        isi: expr,
      });
      currentPertanyaanLines.push(expr);
      justAttachedStemImage = false;
      return;
    }

    // If an image was just added and this line is an explicit caption (e.g. "Gambar 1. ..."), attach caption cleanly
    if (
      justAttachedStemImage &&
      /^(?:gambar|gbr\.?|diagram|grafik|peta|ilustrasi|sumber)\s*\d*[\.\:\-]?\s+/i.test(txt) &&
      txt.length <= 160
    ) {
      const lastImgEl = [...currentElements].reverse().find((el) => el.tipe === 'gambar');
      if (lastImgEl && lastImgEl.tipe === 'gambar' && !lastImgEl.caption) {
        lastImgEl.caption = txt;
        if (currentStemImages.length > 0) {
          currentStemImages[currentStemImages.length - 1].caption = txt;
        }
        currentPertanyaanLines.push(txt);
        justAttachedStemImage = false;
        return;
      }
    }

    const cleanTxt = txt.replace(/\[\[FORMULA_BLOCK:([\s\S]+?)\]\]/g, '$1');
    currentPertanyaanLines.push(cleanTxt);
    const lastEl = currentElements[currentElements.length - 1];
    if (lastEl && lastEl.tipe === 'teks') {
      lastEl.isi = `${lastEl.isi}\n${cleanTxt}`;
    } else {
      currentElements.push({
        id: `el_${Date.now()}_${++elemCounter}`,
        tipe: 'teks',
        isi: cleanTxt,
      });
    }
    justAttachedStemImage = false;
  };

  const pushStemImage = (imgUrl: string) => {
    if (!imgUrl) return;
    flushPendingTable();
    const posIdx = currentPertanyaanLines.length;
    if (currentStemImages.length === 0) {
      pendingImagePosIndex = posIdx;
      currentPosisiGambar = posIdx === 0 ? 'atas' : 'tengah';
      currentImageStatus = 'ok';
    }
    currentStemImages.push({ url: imgUrl, posIndex: posIdx });
    currentElements.push({
      id: `el_${Date.now()}_${++elemCounter}`,
      tipe: 'gambar',
      url: imgUrl,
      ukuran: currentUkuranGambar,
    });
    justAttachedStemImage = true;
  };

  const finalizeSoal = () => {
    if (!currentSoal) return;
    flushPendingTable();

    let pertanyaanText = currentPertanyaanLines.join('\n').trim();
    if (
      !pertanyaanText &&
      Object.keys(currentPilihan).length === 0 &&
      currentStemImages.length === 0 &&
      Object.keys(currentPilihanGambar).length === 0
    ) {
      return;
    }

    // Rescue any inline A./B./C./D. options that stayed attached inside the question stem
    if (Object.keys(currentPilihan).length < 2 && pertanyaanText) {
      const rescued = extractEmbeddedChoicesFromStem(pertanyaanText);
      if (rescued.extractedChoices) {
        pertanyaanText = rescued.cleanStem;
        currentPilihan = rescued.extractedChoices;
        if (currentElements.length === 1 && currentElements[0].tipe === 'teks') {
          currentElements[0].isi = rescued.cleanStem;
        }
      }
    }

    // Clean any accidental double prefixes inside options (e.g. "A. Jakarta" -> "Jakarta")
    for (const optKey of Object.keys(currentPilihan)) {
      currentPilihan[optKey] = stripRedundantOptionLabel(optKey, currentPilihan[optKey]);
    }

    const optKeys = Object.keys(currentPilihan);
    const hasOptions = optKeys.length >= 2 || Object.keys(currentPilihanGambar).length >= 2;
    const isBinaryTrueFalseChoices =
      optKeys.length === 2 &&
      Boolean(currentPilihan.A && currentPilihan.B) &&
      /^(?:benar|betul|true|ya)$/i.test(currentPilihan.A.trim()) &&
      /^(?:salah|false|tidak)$/i.test(currentPilihan.B.trim());

    let rawKunci = (currentSoal.kunciJawaban || '').trim();
    const stemTrailingTfMatch = pertanyaanText.match(
      /\(\s*(Benar\s*\/\s*Salah|B\s*\/\s*S|True\s*\/\s*False)\s*\)\s*[\.\?]?$/i
    );

    let tipe: TipeSoalUjian;
    if (isBinaryTrueFalseChoices || (currentSectionType === 'benar_salah' && !hasOptions) || stemTrailingTfMatch) {
      tipe = 'benar_salah';
    } else if (hasOptions) {
      tipe = 'pilihan_ganda';
    } else if (
      currentSectionType === 'isian_singkat' ||
      /_{3,}/.test(pertanyaanText) ||
      (/\.{4,}/.test(pertanyaanText) && currentSectionType !== 'uraian') ||
      (rawKunci.length > 0 && rawKunci.length <= 60 && currentSectionType !== 'uraian')
    ) {
      tipe = 'isian_singkat';
    } else {
      tipe = 'uraian';
    }

    if (tipe === 'benar_salah') {
      currentPilihan = { A: 'Benar', B: 'Salah' };
    }

    const primaryImgObj = currentStemImages[0];
    const primaryImage = primaryImgObj?.url;
    const extraImages =
      currentStemImages.length > 1
        ? currentStemImages.slice(1).map((item) => ({
            url: item.url,
            caption: item.caption,
            posisi: (item.posIndex === 0
              ? 'atas'
              : item.posIndex < currentPertanyaanLines.length
              ? 'tengah'
              : 'bawah') as 'atas' | 'tengah' | 'bawah',
          }))
        : undefined;

    let finalPos: 'atas' | 'tengah' | 'bawah' = currentPosisiGambar;
    if (primaryImage && pendingImagePosIndex >= 0) {
      if (pendingImagePosIndex === 0) {
        finalPos = 'atas';
      } else if (pendingImagePosIndex < currentPertanyaanLines.length) {
        finalPos = 'tengah';
      } else {
        finalPos = 'bawah';
      }
    }

    let kunci = rawKunci;
    // Extract trailing inline key markers like "(Kunci: B)" or "[KJ: C]" in stem if key is still missing
    if (!kunci && pertanyaanText) {
      const stemInlineKey = pertanyaanText.match(
        /[\(\[]\s*(?:kunci(?:\s+jawaban)?|kj)\s*[:=\-]?\s*([A-Ea-e]|benar|betul|salah|true|false)\s*[\)\]][\.\?]?\s*$/i
      );
      if (stemInlineKey) {
        kunci = stemInlineKey[1].toUpperCase();
        pertanyaanText = pertanyaanText.slice(0, stemInlineKey.index).trim();
        if (currentElements.length > 0) {
          const lastTextEl = [...currentElements].reverse().find((el) => el.tipe === 'teks');
          if (lastTextEl && lastTextEl.tipe === 'teks') {
            lastTextEl.isi = lastTextEl.isi.slice(0, lastTextEl.isi.length - stemInlineKey[0].length).trim();
          }
        }
      }
    }

    if (tipe === 'pilihan_ganda' && !kunci) {
      for (const [k, v] of Object.entries(currentPilihan)) {
        if (
          /\[KUNCI\]|\(KUNCI\)|\(JAWABAN\)|^\*|[✓✔]/i.test(v) ||
          v.includes('*(Kunci)*')
        ) {
          kunci = k;
          currentPilihan[k] = v.replace(/\[KUNCI\]|\(KUNCI\)|\(JAWABAN\)|\*|\(kunci\)|[✓✔]/gi, '').trim();
          break;
        }
      }
    }

    const nomorSoal = soalList.length + 1;
    const docNomor = currentSoal.nomor || nomorSoal;
    let finalKunci = kunci || trailingKeys[docNomor] || trailingKeys[nomorSoal] || '';
    if (tipe === 'pilihan_ganda') {
      const m = finalKunci.trim().toUpperCase().match(/^[A-E]/);
      finalKunci = m ? m[0] : '';
    } else if (tipe === 'benar_salah') {
      finalKunci = normalizeTrueFalseValue(finalKunci, { pilihan: currentPilihan });
    }

    // Keep kontenElemen whenever question has multiple visual blocks, tables, formulas, or interleaved image+text
    const hasRichElements = currentElements.some(
      (el) => el.tipe === 'tabel' || el.tipe === 'rumus' || el.tipe === 'gambar'
    );

    const needsKeyVerification =
      (tipe === 'pilihan_ganda' || tipe === 'benar_salah' || tipe === 'isian_singkat') && !finalKunci;

    soalList.push({
      id: `soal-${Date.now()}-${nomorSoal}`,
      nomor: nomorSoal,
      tipe,
      pertanyaan:
        pertanyaanText ||
        (primaryImage ? '(Perhatikan gambar berikut)' : `Soal nomor ${nomorSoal}`),
      kontenElemen: hasRichElements ? [...currentElements] : undefined,
      pilihan: tipe === 'pilihan_ganda' || tipe === 'benar_salah' ? currentPilihan : undefined,
      pilihanGambar:
        tipe === 'pilihan_ganda' && Object.keys(currentPilihanGambar).length > 0
          ? currentPilihanGambar
          : undefined,
      kunciJawaban: finalKunci,
      bobot: currentSoal.bobot || (tipe === 'uraian' ? 2 : 1),
      gambar: primaryImage,
      gambarCaption: primaryImgObj?.caption,
      gambarTambahan: extraImages,
      gambarPosisi: primaryImage ? finalPos : undefined,
      gambarUkuran: primaryImage ? currentUkuranGambar : undefined,
      gambarStatus: currentImageStatus || (primaryImage ? 'ok' : undefined),
      gambarWarning: currentImageWarning,
      pedomanPenilaian:
        tipe === 'uraian'
          ? currentSoal.pedomanPenilaian ||
            'Kriteria: Kesesuaian konsep, kelengkapan uraian, ketepatan penalaran.'
          : undefined,
      pembahasan: currentSoal.pembahasan || undefined,
      perluVerifikasi: needsKeyVerification || currentImageStatus === 'warning' || currentImageStatus === 'error',
      catatanVerifikasi:
        currentImageWarning ||
        (needsKeyVerification
          ? 'Kunci jawaban belum ditentukan pada dokumen asli. Silakan pilih/isi kunci jawaban yang benar.'
          : undefined),
    });

    currentSoal = null;
    currentPilihan = {};
    currentPilihanGambar = {};
    currentPertanyaanLines = [];
    currentStemImages = [];
    currentElements = [];
    pendingTableLines = [];
    pendingImagePosIndex = -1;
    currentPosisiGambar = 'atas';
    currentUkuranGambar = 'sedang';
    currentImageWarning = undefined;
    currentImageStatus = undefined;
    activeOptionLetter = null;
    justAttachedStemImage = false;
    readingPembahasan = false;
    pembahasanStepNum = 0;
  };

  let inInstructionBlock = false;
  let sectionStarted = false;
  let justSawSectionHeader = false;
  let inSubStatementList = false;
  let subListLastNum = 0;
  let readingPembahasan = false;
  let pembahasanStepNum = 0;
  let justPassedPageBreak = false;

  const isExplicitSectionHeader = (lineText: string): boolean => {
    const clean = lineText.replace(/^[#*_\s]+|[#*_\s]+$/g, '').trim();
    if (!clean || clean.length > 110 || /\?$/.test(clean) || /_{3,}|\.{4,}/.test(clean)) return false;

    const prefixedSectionRe =
      /^(?:(?:[IVX]{1,4}|[A-E]|BAGIAN\s+[A-Z0-9]+|ROMAWI\s+[IVX]+)\s*[\.\:\)\-]\s*)(?:(?:SOAL\s+)?(?:PILIHAN\s+GANDA|BENAR\s*[\/\-]\s*SALAH|BENAR\s+(?:ATAU\s+)?SALAH|URAIAN(?:\s+SINGKAT)?|ESAI|ESSAY|ISIAN\s+SINGKAT|ISIAN)|PILIHLAH\s+(?:SALAH\s+)?SATU\s+JAWABAN|JAWABLAH\s+PERTANYAAN(?:-PERTANYAAN)?|LENGKAPI\s+(?:TITIK-TITIK|ISIAN|KALIMAT\s+DI\s+BAWAH|PERNYATAAN\s+BERIKUT))/i;
    if (prefixedSectionRe.test(clean)) return true;

    const standaloneHeadingRe =
      /^(?:(?:SOAL\s+)?(?:PILIHAN\s+GANDA|BENAR\s*[\/\-]\s*SALAH|BENAR\s+(?:ATAU\s+)?SALAH|URAIAN(?:\s+SINGKAT)?|ESAI|ESSAY|ISIAN\s+SINGKAT)|PILIHLAH\s+(?:SALAH\s+)?SATU\s+JAWABAN\s+(?:YANG\s+PALING\s+)?(?:BENAR|TEPAT)[!:\s]*|JAWABLAH\s+PERTANYAAN(?:-PERTANYAAN)?\s+(?:DI\s+BAWAH\s+INI|BERIKUT(?:\s+INI)?)\s*(?:DENGAN\s+(?:BENAR|SINGKAT|JELAS|TEPAT))?[!:\s]*)$/i;
    return standaloneHeadingRe.test(clean);
  };

  for (let i = 0; i < questionLines.length; i++) {
    const rawLine = questionLines[i];
    if (/^\[---\s*HALAMAN\s+\d+\s*---\]$/.test(rawLine)) {
      justPassedPageBreak = true;
      continue;
    }

    // Extract ALL inline image markers and image error markers on this line first
    const lineImages: string[] = [];
    const imgGlobalRegex = /\[\[IMAGE_DATA:([^\]]+)\]\]/g;
    let im: RegExpExecArray | null;
    while ((im = imgGlobalRegex.exec(rawLine)) !== null) {
      if (im[1]) lineImages.push(im[1]);
    }

    const lineErrRegex = /\[\[IMAGE_ERROR:([^\]]+)\]\]/g;
    let errMatch: RegExpExecArray | null;
    while ((errMatch = lineErrRegex.exec(rawLine)) !== null) {
      failedImagesCount++;
      const msg = errMatch[1] || 'Gambar tidak terbaca';
      imageWarnings.push(msg);
      if (currentSoal) {
        currentImageStatus = 'warning';
        currentImageWarning = msg;
      }
    }

    const line = rawLine
      .replace(/\[\[IMAGE_DATA:[^\]]+\]\]/g, '')
      .replace(/\[\[IMAGE_ERROR:[^\]]+\]\]/g, '')
      .trim();

    // Skip standalone PDF/Word page numbers or page footers right across page breaks
    if (
      line &&
      lineImages.length === 0 &&
      (/^(?:hal(?:aman)?\.?\s*\d+(?:\s*(?:dari|\/|of)\s*\d+)?|page\s+\d+(?:\s+of\s+\d+)?|-\s*\d+\s*-)$/i.test(
        line
      ) ||
        (justPassedPageBreak && /^\d{1,3}\.?$/.test(line)))
    ) {
      justPassedPageBreak = false;
      continue;
    }
    justPassedPageBreak = false;

    if (
      !line &&
      lineImages.length === 0 &&
      (rawLine.includes('[[IMAGE]]') || rawLine.includes('[IMAGE:') || rawLine.includes('[Gambar'))
    ) {
      if (currentSoal && currentStemImages.length === 0 && nextImageIdx < imageUris.length) {
        pushStemImage(imageUris[nextImageIdx++]);
      }
      continue;
    }

    // Detect Petunjuk Umum / Tata Tertib header before questions start
    if (
      !sectionStarted &&
      soalList.length === 0 &&
      !currentSoal &&
      /^(?:petunjuk(?:\s+umum|\s+pengerjaan|\s+soal)?|tata\s+tertib|aturan\s+ujian)\s*[:\-]?$/i.test(
        line.replace(/^[#*_\s]+|[#*_\s]+$/g, '')
      )
    ) {
      inInstructionBlock = true;
      continue;
    }

    // Track explicit Roman numeral / Bagian section headers (without false positives on normal questions!)
    if (isExplicitSectionHeader(line)) {
      finalizeSoal();
      inInstructionBlock = false;
      sectionStarted = true;
      justSawSectionHeader = true;
      inSubStatementList = false;
      subListLastNum = 0;
      const secUpper = line.toUpperCase();
      if (/BENAR\s*[\/\-]\s*SALAH|BENAR\s+(?:ATAU\s+)?SALAH/.test(secUpper)) {
        currentSectionType = 'benar_salah';
      } else if (/ISIAN\s+SINGKAT|SOAL\s+ISIAN|LENGKAPI|^ISIAN\b/.test(secUpper)) {
        currentSectionType = 'isian_singkat';
      } else if (/URAIAN|ESAI|ESSAY/.test(secUpper)) {
        currentSectionType = 'uraian';
      } else if (/PILIHAN\s+GANDA|PILIHLAH/.test(secUpper)) {
        currentSectionType = 'pilihan_ganda';
      } else if (/JAWABLAH/.test(secUpper) && currentSectionType === 'pilihan_ganda') {
        currentSectionType = 'uraian';
      }
      continue;
    }

    const qParsed = parseQuestionNumberPrefix(line);
    const optParsed = parseOptionPrefix(line);
    const keyMatch = line.match(/^(?:kunci(?:\s+jawaban)?|jawaban(?:\s+benar)?|kj)\s*[:=\-]\s*(.+)$/i);
    const pembahasanMatch = line.match(/^(?:pembahasan|penjelasan|penyelesaian|alasan)\s*[:=\-]\s*(.*)$/i);
    const pedomanMatch = line.match(/^(?:pedoman(?:\s+penilaian)?|rubrik(?:\s+penilaian)?)\s*[:=\-]\s*(.+)$/i);
    const bobotMatch = line.match(/^(?:bobot(?:\s+soal)?|skor(?:\s+maks(?:imal)?)?)\s*[:=\-]\s*(\d+(?:[\.,]\d+)?)/i);

    if (qParsed && !optParsed) {
      const parsedNum = qParsed.nomor;
      const delimiterChar = qParsed.delimiter;
      const cleanQText = qParsed.content;

      // Skip Petunjuk Umum / Tata Tertib numbered rules at the top of exam sheets,
      // but automatically exit instruction mode as soon as an actual exam question starts!
      if (!sectionStarted && soalList.length === 0 && !currentSoal) {
        if (isLikelyExamInstructionLine(cleanQText)) {
          continue;
        }
        const hasDirectChoiceOrKeyBeforeNextQ = (fromIdx: number): boolean => {
          const limit = Math.min(questionLines.length, fromIdx + 7);
          for (let j = fromIdx; j < limit; j++) {
            const nl = questionLines[j].replace(/\[\[IMAGE_DATA:[^\]]+\]\]/g, '').trim();
            if (!nl) continue;
            if (isExplicitSectionHeader(nl)) break;
            if (parseQuestionNumberPrefix(nl)) break;
            if (parseOptionPrefix(nl) || /^(?:kunci(?:\s+jawaban)?|kj|pembahasan)\s*[:=\-]/i.test(nl)) {
              return true;
            }
          }
          return false;
        };

        if (inInstructionBlock) {
          const upcomingHasChoicesOrKey = hasDirectChoiceOrKeyBeforeNextQ(i + 1);
          const looksLikeRealFirstQ =
            (parsedNum === 1 && cleanQText.length > 0) ||
            /[?\…]$|\.\.\.$|_{3,}/.test(cleanQText) ||
            upcomingHasChoicesOrKey;
          if (!looksLikeRealFirstQ) {
            continue;
          }
          inInstructionBlock = false;
        }
      }

      // If currently reading Pembahasan, treat numbered solution steps (1., 2., 3.) as explanation text
      // unless this line directly carries choices/keys of the next main question before any other numbered line
      if (readingPembahasan && currentSoal) {
        let upcomingHasDirectChoiceOrKey = false;
        const limit = Math.min(questionLines.length, i + 7);
        for (let j = i + 1; j < limit; j++) {
          const nl = questionLines[j].replace(/\[\[IMAGE_DATA:[^\]]+\]\]/g, '').trim();
          if (!nl) continue;
          if (isExplicitSectionHeader(nl) || parseQuestionNumberPrefix(nl)) break;
          if (parseOptionPrefix(nl) || /^(?:kunci(?:\s+jawaban)?|kj)\s*[:=\-]/i.test(nl)) {
            upcomingHasDirectChoiceOrKey = true;
            break;
          }
        }
        const nextMainNum = (currentSoal.nomor || soalList.length + 1) + 1;
        const isMathStep =
          !upcomingHasDirectChoiceOrKey &&
          (parsedNum === 1 ||
            (pembahasanStepNum > 0 && parsedNum === pembahasanStepNum + 1 && parsedNum !== nextMainNum));
        if (isMathStep) {
          pembahasanStepNum = parsedNum;
          currentSoal.pembahasan = currentSoal.pembahasan
            ? `${currentSoal.pembahasan}\n${line}`
            : line;
          continue;
        }
      }

      // Guard against numbered statements inside a question ("Perhatikan pernyataan: 1) ... 2) ...")
      const hasChoicesInCurrent = Object.keys(currentPilihan).length >= 2;
      const lastStemLine = currentPertanyaanLines[currentPertanyaanLines.length - 1] || '';
      const stemLeadsIntoList =
        /[:：]$|(?:berikut(?:\s+ini)?|di\s*bawah\s+ini|pernyataan|ciri-?ciri|sifat-?sifat|langkah-?langkah|hal-?hal|pasangan)\s*[:\.\-]?$/i.test(
          lastStemLine
        );
      const isParenDelimiter = delimiterChar === ')' || /^\(\d+\)/.test(line);
      const currentDocNum = currentSoal?.nomor || 0;

      // If parsedNum matches the next main question (currentDocNum + 1) AND looks like a full question stem after >=3 sub-statements, start the new question instead of swallowing it!
      const looksLikeNextMainQuestion =
        parsedNum === currentDocNum + 1 &&
        !isParenDelimiter &&
        subListLastNum >= 2 &&
        (/[?\…]$|\.\.\.$/.test(cleanQText) || cleanQText.length >= 45);

      const startsSubList =
        Boolean(currentSoal) &&
        !hasChoicesInCurrent &&
        !justSawSectionHeader &&
        !looksLikeNextMainQuestion &&
        ((stemLeadsIntoList && (parsedNum === 1 || parsedNum <= currentDocNum)) ||
          (isParenDelimiter && (parsedNum === 1 || parsedNum <= currentDocNum)));

      const continuesSubList =
        Boolean(currentSoal) &&
        !hasChoicesInCurrent &&
        inSubStatementList &&
        !looksLikeNextMainQuestion &&
        parsedNum === subListLastNum + 1 &&
        parsedNum <= 8;

      if ((startsSubList || continuesSubList) && currentSoal) {
        inSubStatementList = true;
        subListLastNum = parsedNum;
        pushStemTextLine(line);
        continue;
      }

      finalizeSoal();
      inInstructionBlock = false;
      sectionStarted = true;
      justSawSectionHeader = false;
      inSubStatementList = false;
      subListLastNum = 0;

      const num = parsedNum;
      currentSoal = {
        nomor: num,
        kunciJawaban: '',
        bobot: 1,
      };
      activeOptionLetter = null;
      if (cleanQText) {
        pushStemTextLine(cleanQText);
      }

      if (lineImages.length > 0) {
        for (const imgUri of lineImages) {
          pushStemImage(imgUri);
        }
      } else if (currentStemImages.length === 0 && nextImageIdx < imageUris.length) {
        const lowerQ = cleanQText.toLowerCase();
        if (
          rawText.indexOf('[[IMAGE_DATA:') === -1 &&
          (lowerQ.includes('gambar') ||
            lowerQ.includes('tabel') ||
            lowerQ.includes('diagram') ||
            lowerQ.includes('grafik') ||
            lowerQ.includes('ilustrasi') ||
            lowerQ.includes('peta'))
        ) {
          pushStemImage(imageUris[nextImageIdx++]);
          currentImageStatus = 'warning';
          currentImageWarning =
            'Gambar dipasangkan otomatis berdasarkan konteks teks; harap periksa kecocokan gambar dengan soal.';
          imageWarnings.push(`Soal ${num}: Periksa kecocokan gambar yang dipasangkan otomatis.`);
        }
      }
      continue;
    }

    if (
      optParsed &&
      currentSoal &&
      isValidOptionProgression(Object.keys(currentPilihan), optParsed.letter)
    ) {
      inSubStatementList = false;
      subListLastNum = 0;
      readingPembahasan = false;
      pembahasanStepNum = 0;
      const letter = optParsed.letter;
      let optText = optParsed.content;

      if (
        currentPilihan[letter] &&
        isExplicitSectionHeader(optText)
      ) {
        finalizeSoal();
        continue;
      }

      // Extract trailing inline key e.g. "D. Surabaya (Kunci: B)" or "D. Surabaya   Kunci: B"
      const optInlineKey = optText.match(
        /(?:\s+[\(\[]?|\s{2,})(?:kunci(?:\s+jawaban)?|kj)\s*[:=\-]\s*([A-Ea-e])[\)\]]?\s*$/i
      );
      if (optInlineKey) {
        if (!currentSoal.kunciJawaban) {
          currentSoal.kunciJawaban = optInlineKey[1].toUpperCase();
        }
        optText = optText.slice(0, optInlineKey.index).trim();
      }

      activeOptionLetter = letter;
      currentPilihan[letter] = optText || (lineImages.length > 0 ? `(Gambar Pilihan ${letter})` : '');

      if (lineImages.length > 0) {
        currentPilihanGambar[letter] = lineImages[0];
      }
      continue;
    }

    if (keyMatch && currentSoal) {
      readingPembahasan = false;
      pembahasanStepNum = 0;
      const rawKeyStr = keyMatch[1].trim();
      const singleLetter = rawKeyStr.match(/^\(?([A-Ea-e])\)?[\.]?$/);
      currentSoal.kunciJawaban = singleLetter ? singleLetter[1].toUpperCase() : rawKeyStr;
      continue;
    }

    if (pembahasanMatch && currentSoal) {
      readingPembahasan = true;
      pembahasanStepNum = 0;
      const val = pembahasanMatch[1].trim();
      if (val) {
        currentSoal.pembahasan = currentSoal.pembahasan
          ? `${currentSoal.pembahasan}\n${val}`
          : val;
      }
      continue;
    }

    if (pedomanMatch && currentSoal) {
      readingPembahasan = false;
      pembahasanStepNum = 0;
      currentSoal.pedomanPenilaian = pedomanMatch[1].trim();
      continue;
    }

    if (bobotMatch && currentSoal) {
      const parsedBobot = Number(bobotMatch[1].replace(',', '.'));
      if (Number.isFinite(parsedBobot) && parsedBobot > 0) {
        currentSoal.bobot = parsedBobot;
      }
      continue;
    }

    if (currentSoal) {
      if (line) {
        if (readingPembahasan) {
          currentSoal.pembahasan = currentSoal.pembahasan
            ? `${currentSoal.pembahasan}\n${line}`
            : line;
        } else if (Object.keys(currentPilihan).length === 0) {
          // If a closing prompt line follows sub-statements ("Pernyataan yang benar adalah..."), close the sub-statement run
          if (inSubStatementList && !/[:：]$/.test(line)) {
            inSubStatementList = false;
          }
          pushStemTextLine(line);
        } else if (activeOptionLetter) {
          let contLine = line;
          const contKeyMatch = contLine.match(
            /(?:\s+[\(\[]?|\s{2,})(?:kunci(?:\s+jawaban)?|kj)\s*[:=\-]\s*([A-Ea-e])[\)\]]?\s*$/i
          );
          if (contKeyMatch) {
            if (!currentSoal.kunciJawaban) {
              currentSoal.kunciJawaban = contKeyMatch[1].toUpperCase();
            }
            contLine = contLine.slice(0, contKeyMatch.index).trim();
          }
          if (contLine) {
            currentPilihan[activeOptionLetter] = `${currentPilihan[activeOptionLetter]} ${contLine}`.trim();
          }
        }
      }

      if (lineImages.length > 0) {
        for (const imgUri of lineImages) {
          if (Object.keys(currentPilihan).length > 0 && activeOptionLetter) {
            if (!currentPilihanGambar[activeOptionLetter]) {
              currentPilihanGambar[activeOptionLetter] = imgUri;
            }
          } else {
            pushStemImage(imgUri);
          }
        }
      }
    }
  }

  finalizeSoal();

  return {
    soalList,
    metadata: {
      judul: judul || undefined,
      mapel: mapel || undefined,
      kelas: kelas || undefined,
      petunjuk: petunjuk || undefined,
    },
    imageWarnings: Array.from(new Set(imageWarnings)),
    failedImagesCount,
  };
}

/**
 * Helper to call backend Gemini parser safely (only when running in browser with relative origin, or skips cleanly in unit tests).
 */
async function callBackendParserFallback(payload: {
  text?: string;
  fileBase64?: string;
  mimeType?: string;
  fileName: string;
  pages?: ScannedPdfPagePayload[];
}): Promise<{
  success: boolean;
  status?: number;
  data?: any;
  error?: string;
}> {
  if (typeof window === 'undefined') {
    return { success: false, error: 'Layanan AI backend hanya dipanggil di lingkungan browser/server.' };
  }

  try {
    const resp = await fetch('/api/ujian/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const json = await resp.json().catch(() => null);
    if (resp.ok && json?.success && json?.data && Array.isArray(json.data.soalList)) {
      return { success: true, status: resp.status, data: json.data };
    }
    return {
      success: false,
      status: resp.status,
      error:
        resp.status === 413
          ? 'Ukuran dokumen melebihi batas request server (4.5MB). Memecah per halaman...'
          : json?.error || `Server merespons status ${resp.status}`,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Gagal menghubungi server parser.' };
  }
}

/**
 * Splits page images into Vercel-safe <= 2.2 MB JSON request batches and merges questions in exact order.
 */
async function callBackendParserInBatches(
  pages: ScannedPdfPagePayload[],
  fileName: string
): Promise<{
  success: boolean;
  data?: { judul?: string; mataPelajaran?: string; kelas?: string; petunjukUmum?: string; soalList: any[] };
  error?: string;
}> {
  if (!pages || pages.length === 0) {
    return { success: false, error: 'Tidak ada halaman gambar untuk diproses.' };
  }

  const MAX_BATCH_BASE64_CHARS = 2_100_000; // ~2.1MB payload safely below Vercel's 4.5MB hard edge limit
  const MAX_PAGES_PER_BATCH = 3;

  const batches: ScannedPdfPagePayload[][] = [];
  let currentBatch: ScannedPdfPagePayload[] = [];
  let currentSize = 0;

  for (const page of pages) {
    const pageSize = page.imageBase64.length;
    if (
      currentBatch.length > 0 &&
      (currentSize + pageSize > MAX_BATCH_BASE64_CHARS || currentBatch.length >= MAX_PAGES_PER_BATCH)
    ) {
      batches.push(currentBatch);
      currentBatch = [];
      currentSize = 0;
    }
    currentBatch.push(page);
    currentSize += pageSize;
  }
  if (currentBatch.length > 0) batches.push(currentBatch);

  let mergedJudul: string | undefined;
  let mergedMapel: string | undefined;
  let mergedKelas: string | undefined;
  let mergedPetunjuk: string | undefined;
  const mergedSoal: any[] = [];
  let lastError: string | undefined;

  for (const batch of batches) {
    const res = await callBackendParserFallback({
      pages: batch,
      fileName,
    });
    if (res.success && res.data) {
      if (!mergedJudul && res.data.judul) mergedJudul = res.data.judul;
      if (!mergedMapel && res.data.mataPelajaran) mergedMapel = res.data.mataPelajaran;
      if (!mergedKelas && res.data.kelas) mergedKelas = res.data.kelas;
      if (!mergedPetunjuk && res.data.petunjukUmum) mergedPetunjuk = res.data.petunjukUmum;
      if (Array.isArray(res.data.soalList)) {
        mergedSoal.push(...res.data.soalList);
      }
    } else if (res.error) {
      lastError = res.error;
    }
  }

  if (mergedSoal.length > 0) {
    const renumbered = mergedSoal.map((q, idx) => ({ ...q, nomor: idx + 1 }));
    return {
      success: true,
      data: {
        judul: mergedJudul,
        mataPelajaran: mergedMapel,
        kelas: mergedKelas,
        petunjukUmum: mergedPetunjuk,
        soalList: renumbered,
      },
    };
  }

  return {
    success: false,
    error: lastError || 'OCR halaman tidak menemukan soal yang terbaca.',
  };
}

/**
 * Checks whether regex-extracted questions look coherent and trustworthy compared to raw text.
 */
function areRegexParsedQuestionsTrustworthy(soalList: SoalUjian[], rawText: string): boolean {
  if (!Array.isArray(soalList) || soalList.length === 0) return false;
  const cleanLen = rawText.replace(/\s+/g, ' ').trim().length;
  if (cleanLen > 600 && soalList.length < 2) return false;

  const placeholderCount = soalList.filter((q) => /^Soal nomor \d+$/i.test(q.pertanyaan.trim())).length;
  if (placeholderCount > Math.max(1, Math.floor(soalList.length * 0.25))) return false;

  const veryShortCount = soalList.filter((q) => q.pertanyaan.trim().length < 10 && !q.gambar).length;
  if (veryShortCount > Math.max(1, Math.floor(soalList.length * 0.35))) return false;

  // Detect severe truncation (e.g. raw document contains questions 1..20, yet only a small fraction extracted)
  const docNums = new Set<number>();
  const numLineRe = /(?:^|\n)\s*(\d{1,3})\s*[\.\)]\s+\S{8,}/g;
  let nm: RegExpExecArray | null;
  while ((nm = numLineRe.exec(rawText)) !== null) {
    const val = parseInt(nm[1], 10);
    if (val >= 1 && val <= 150) docNums.add(val);
  }
  if (docNums.size >= 5 && soalList.length < Math.floor(docNums.size * 0.55)) {
    return false;
  }

  // If raw document clearly contains many A./B./C./D. options, ensure extracted PG choices aren't mostly broken
  const optionMarkersInDoc = (rawText.match(/(?:^|\n|\s)[A-D][\.\)]\s+\S/g) || []).length;
  const pgCount = soalList.filter((q) => q.tipe === 'pilihan_ganda').length;
  if (optionMarkersInDoc >= 12 && pgCount === 0) return false;

  // Check if many PG questions ended up with < 3 choices despite doc having options
  const brokenPgCount = soalList.filter(
    (q) => q.tipe === 'pilihan_ganda' && Object.keys(q.pilihan || {}).length < 3
  ).length;
  if (pgCount >= 3 && brokenPgCount > Math.floor(pgCount * 0.4)) return false;

  return true;
}

/**
 * Applies final structural validation & annotates question verification flags on minor pattern issues.
 */
export function finalizeValidatedParseResult(
  baseResult: Omit<ParseDocumentResult, 'kunciDitemukanCount' | 'kunciBelumDitemukanCount' | 'siapDiterbitkan'>,
  rawTextForCheck?: string
): ParseDocumentResult {
  const structure = validateParsedQuestionsStructure(baseResult.soalList, rawTextForCheck);

  if (!structure.isValidFormat) {
    return {
      ...baseResult,
      success: false,
      soalList: [],
      kunciDitemukanCount: 0,
      kunciBelumDitemukanCount: 0,
      siapDiterbitkan: false,
      error: structure.fatalError || baseResult.error || 'Format soal pada dokumen tidak sesuai pola standar.',
    };
  }

  const annotatedSoal = baseResult.soalList.map((q) => {
    const qIssues = structure.questionIssues.get(q.nomor);
    if (!qIssues || qIssues.length === 0) return q;
    const combinedNote = [q.catatanVerifikasi, ...qIssues].filter(Boolean).join(' | ');
    return {
      ...q,
      perluVerifikasi: true,
      catatanVerifikasi: combinedNote,
    };
  });

  const objQuestions = annotatedSoal.filter(
    (s) => s.tipe === 'pilihan_ganda' || s.tipe === 'benar_salah' || s.tipe === 'isian_singkat'
  );
  const kunciDitemukanCount = objQuestions.filter((s) => Boolean(s.kunciJawaban?.trim())).length;
  const kunciBelumDitemukanCount = objQuestions.length - kunciDitemukanCount;

  const mergedWarnings = Array.from(
    new Set([...(baseResult.imageWarnings || []), ...structure.warnings])
  );

  return {
    ...baseResult,
    success: true,
    soalList: annotatedSoal,
    imageWarnings: mergedWarnings,
    kunciDitemukanCount,
    kunciBelumDitemukanCount,
    siapDiterbitkan: kunciBelumDitemukanCount === 0,
  };
}

/**
 * Splits long text into <= 4,200 char question-boundary batches when calling Gemini fallback.
 */
async function callBackendParserTextInBatches(
  rawText: string,
  fileName: string
): Promise<{
  success: boolean;
  data?: { judul?: string; mataPelajaran?: string; kelas?: string; petunjukUmum?: string; soalList: any[] };
  error?: string;
}> {
  const clean = rawText.trim();
  if (!clean) return { success: false, error: 'Teks kosong.' };
  if (clean.length <= 4200) {
    return await callBackendParserFallback({ text: clean, fileName });
  }

  const lines = clean.split('\n');
  const chunks: string[] = [];
  let buf = '';
  for (const line of lines) {
    const isQ = /^\s*\d{1,3}\s*[\.\)]\s+/.test(line);
    if (buf.length > 2600 && isQ && buf.length + line.length + 1 > 4200) {
      chunks.push(buf.trim());
      buf = line;
    } else if (buf.length + line.length + 1 > 4200 && buf.trim()) {
      chunks.push(buf.trim());
      buf = line;
    } else {
      buf = buf ? `${buf}\n${line}` : line;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());

  let mergedJudul: string | undefined;
  let mergedMapel: string | undefined;
  let mergedKelas: string | undefined;
  let mergedPetunjuk: string | undefined;
  const mergedSoal: any[] = [];
  let lastError: string | undefined;

  for (const chunk of chunks) {
    const prevQ = mergedSoal[mergedSoal.length - 1];
    const tailCtx = prevQ
      ? `Soal terakhir sebelumnya bernomor ${prevQ.nomor}: "${String(prevQ.pertanyaan || '').slice(0, 120)}"`
      : undefined;
    const res = await callBackendParserFallback({
      text: chunk,
      fileName,
      ...(tailCtx ? { previousTailContext: tailCtx } : {}),
    } as any);

    if (res.success && res.data) {
      if (!mergedJudul && res.data.judul) mergedJudul = res.data.judul;
      if (!mergedMapel && res.data.mataPelajaran) mergedMapel = res.data.mataPelajaran;
      if (!mergedKelas && res.data.kelas) mergedKelas = res.data.kelas;
      if (!mergedPetunjuk && res.data.petunjukUmum) mergedPetunjuk = res.data.petunjukUmum;
      if (Array.isArray(res.data.soalList)) mergedSoal.push(...res.data.soalList);
    } else if (res.error) {
      lastError = res.error;
    }
  }

  if (mergedSoal.length > 0) {
    return {
      success: true,
      data: {
        judul: mergedJudul,
        mataPelajaran: mergedMapel,
        kelas: mergedKelas,
        petunjukUmum: mergedPetunjuk,
        soalList: mergedSoal.map((q, idx) => ({ ...q, nomor: idx + 1 })),
      },
    };
  }
  return { success: false, error: lastError || 'AI text parser tidak menemukan soal.' };
}

/**
 * Downscales an uploaded image file so base64 stays safely under Vercel's 4.5MB body limit.
 */
async function prepareImageFileForUpload(
  file: File | { name: string; arrayBuffer: () => Promise<ArrayBuffer> },
  arrayBuffer: ArrayBuffer
): Promise<{ base64: string; mimeType: string; dataUri: string }> {
  const name = file.name.toLowerCase();
  const fallbackMime = name.endsWith('.png')
    ? 'image/png'
    : name.endsWith('.webp')
    ? 'image/webp'
    : 'image/jpeg';

  const uint8Array = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < uint8Array.byteLength; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  const rawBase64 = typeof btoa !== 'undefined' ? btoa(binary) : Buffer.from(uint8Array).toString('base64');
  const rawDataUri = `data:${fallbackMime};base64,${rawBase64}`;

  if (rawBase64.length <= 2_400_000 || typeof document === 'undefined') {
    return { base64: rawBase64, mimeType: fallbackMime, dataUri: rawDataUri };
  }

  return await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1800;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        const scale = Math.min(maxDim / w, maxDim / h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ base64: rawBase64, mimeType: fallbackMime, dataUri: rawDataUri });
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const compressedDataUri = canvas.toDataURL('image/jpeg', 0.82);
      const comma = compressedDataUri.indexOf(',');
      resolve({
        base64: comma !== -1 ? compressedDataUri.slice(comma + 1) : rawBase64,
        mimeType: 'image/jpeg',
        dataUri: compressedDataUri,
      });
    };
    img.onerror = () => resolve({ base64: rawBase64, mimeType: fallbackMime, dataUri: rawDataUri });
    img.src = rawDataUri;
  });
}

/**
 * Formats AI-parsed questions into SoalUjian objects with full 4-type support, pembahasan, and verification flags.
 */
function formatAiParsedSoalList(rawList: any[], isOcr = false): SoalUjian[] {
  return rawList.map((q: any, idx: number) => {
    const mentionsVisual = /gambar|diagram|grafik|tabel|peta|ilustrasi/i.test(q.pertanyaan || '');
    const rawTipe = typeof q.tipe === 'string' ? q.tipe.trim().toLowerCase() : '';
    const hasChoicesObj = q.pilihan && typeof q.pilihan === 'object' && Object.keys(q.pilihan).length >= 2;
    const isBinaryTf =
      hasChoicesObj &&
      Object.keys(q.pilihan).length === 2 &&
      /^(?:benar|betul|true|ya)$/i.test(String(q.pilihan.A || '').trim()) &&
      /^(?:salah|false|tidak)$/i.test(String(q.pilihan.B || '').trim());

    let tipe: TipeSoalUjian;
    if (rawTipe === 'benar_salah' || isBinaryTf) {
      tipe = 'benar_salah';
    } else if (hasChoicesObj || rawTipe === 'pilihan_ganda') {
      tipe = 'pilihan_ganda';
    } else if (rawTipe === 'isian_singkat' || rawTipe === 'isian') {
      tipe = 'isian_singkat';
    } else if (rawTipe === 'uraian' || rawTipe === 'esai' || rawTipe === 'essay') {
      tipe = 'uraian';
    } else if (/_{3,}|\.{4,}/.test(String(q.pertanyaan || ''))) {
      tipe = 'isian_singkat';
    } else {
      tipe = 'uraian';
    }

    const finalPilihan =
      tipe === 'benar_salah'
        ? hasChoicesObj
          ? q.pilihan
          : { A: 'Benar', B: 'Salah' }
        : tipe === 'pilihan_ganda'
        ? q.pilihan
        : undefined;

    const finalKunci =
      tipe === 'benar_salah'
        ? normalizeTrueFalseValue(String(q.kunciJawaban || ''), { pilihan: finalPilihan })
        : String(q.kunciJawaban || '').trim();

    const isObj = tipe === 'pilihan_ganda' || tipe === 'benar_salah' || tipe === 'isian_singkat';
    const needsKey = isObj && !finalKunci;

    return {
      id: `soal-${isOcr ? 'ocr' : 'ai'}-${Date.now()}-${idx + 1}`,
      nomor: q.nomor || idx + 1,
      tipe,
      pertanyaan: q.pertanyaan || '',
      pilihan: finalPilihan,
      kunciJawaban: finalKunci,
      bobot: q.bobot || (tipe === 'uraian' ? 2 : 1),
      pembahasan: typeof q.pembahasan === 'string' && q.pembahasan.trim() ? q.pembahasan.trim() : undefined,
      pedomanPenilaian:
        tipe === 'uraian'
          ? q.pedomanPenilaian || 'Kriteria: Kesesuaian konsep, kelengkapan uraian, ketepatan penalaran.'
          : q.pedomanPenilaian,
      gambarStatus: mentionsVisual ? 'warning' : undefined,
      gambarWarning: mentionsVisual
        ? 'Soal ini merujuk pada gambar/tabel di dokumen. Gunakan "Tambah Gambar -> Gambar Tersedia / Crop" untuk melampirkannya bila belum terpasang.'
        : undefined,
      perluVerifikasi: needsKey || mentionsVisual,
      catatanVerifikasi: mentionsVisual
        ? 'Soal merujuk visual: periksa atau lampirkan gambar yang sesuai.'
        : needsKey
        ? 'Kunci jawaban belum ditemukan di dokumen. Silakan tentukan kunci jawaban.'
        : undefined,
    };
  });
}

/**
 * Main parser entry point.
 * Reads Word (.docx/.doc), PDF (digital & scan), and plain text documents reliably.
 */
export async function parseExamDocument(
  file: File | { name: string; arrayBuffer: () => Promise<ArrayBuffer>; text?: () => Promise<string> }
): Promise<ParseDocumentResult> {
  try {
    const filename = file.name.toLowerCase();
    const arrayBuffer = await file.arrayBuffer();

    const precheck = validateUploadedFileHeader(file.name, arrayBuffer, [
      'docx',
      'doc',
      'pdf',
      'xlsx',
      'xls',
      'txt',
      'csv',
      'jpg',
      'jpeg',
      'png',
      'webp',
    ]);
    if (!precheck.valid) {
      return {
        success: false,
        soalList: [],
        extractedImagesCount: 0,
        failedImagesCount: 0,
        imageWarnings: precheck.warnings,
        extractedImages: [],
        kunciDitemukanCount: 0,
        kunciBelumDitemukanCount: 0,
        siapDiterbitkan: false,
        error: precheck.errorMessage || 'Format berkas tidak valid atau tidak didukung.',
      };
    }

    // ------------------------------------------------------------------------
    // 1. WORD (.DOCX & LEGACY .DOC) PARSER
    // ------------------------------------------------------------------------
    if (filename.endsWith('.docx') || filename.endsWith('.doc')) {
      const isZip = isZipDocxBuffer(arrayBuffer);

      // Handle legacy Word 97-2003 binary (.doc that is NOT an OOXML ZIP)
      if (!isZip && filename.endsWith('.doc')) {
        const legacyText = extractReadableTextFromLegacyDoc(arrayBuffer);
        const { soalList, metadata } = parseQuestionsFromText(legacyText);

        if (soalList.length > 0 && areRegexParsedQuestionsTrustworthy(soalList, legacyText)) {
          return finalizeValidatedParseResult(
            {
              success: true,
              judul: metadata.judul,
              mataPelajaran: metadata.mapel,
              kelas: metadata.kelas,
              petunjukUmum: metadata.petunjuk,
              soalList,
              extractedImagesCount: 0,
              failedImagesCount: 0,
              imageWarnings: [
                ...precheck.warnings,
                'Berkas terdeteksi sebagai format lama (.doc 97-2003). Untuk pembacaan gambar & tabel maksimal, disarankan menyimpannya sebagai .docx atau .pdf.',
              ],
              extractedImages: [],
              originalText: legacyText,
            },
            legacyText
          );
        }

        if (legacyText.trim().length > 40) {
          const aiRes = await callBackendParserFallback({ text: legacyText, fileName: file.name });
          if (aiRes.success && aiRes.data?.soalList?.length > 0) {
            const formatted = formatAiParsedSoalList(aiRes.data.soalList, false);
            return finalizeValidatedParseResult(
              {
                success: true,
                judul: aiRes.data.judul,
                mataPelajaran: aiRes.data.mataPelajaran,
                kelas: aiRes.data.kelas,
                petunjukUmum: aiRes.data.petunjukUmum,
                soalList: formatted,
                extractedImagesCount: 0,
                failedImagesCount: 0,
                imageWarnings: [
                  ...precheck.warnings,
                  ...(Array.isArray(aiRes.data.validationWarnings) ? aiRes.data.validationWarnings : []),
                ],
                extractedImages: [],
                originalText: legacyText,
              },
              legacyText
            );
          }
        }

        return {
          success: false,
          soalList: [],
          extractedImagesCount: 0,
          failedImagesCount: 0,
          imageWarnings: [],
          extractedImages: [],
          originalText: legacyText,
          kunciDitemukanCount: 0,
          kunciBelumDitemukanCount: 0,
          siapDiterbitkan: false,
          error:
            'Berkas menggunakan format Microsoft Word lama (.doc 97-2003) biner yang tidak mendukung ekstraksi XML modern. Buka di Word lalu pilih "Save As -> Word Document (.docx)" atau "PDF (.pdf)", lalu unggah ulang.',
        };
      }

      // Standard OOXML .DOCX processing
      const { imageMap, assets: docxAssets, failedCount: zipFailedCount, warnings: zipWarnings } =
        await extractImagesFromDocx(arrayBuffer);

      const preprocessedDocxBuffer = await preprocessDocxEquations(arrayBuffer);

      let rawDocxText = '';
      let rawDocxHtml = '';
      let htmlFailedImages = 0;

      const isNodeRuntime =
        typeof process !== 'undefined' &&
        Boolean((process as any)?.versions?.node) &&
        typeof Buffer !== 'undefined';
      const mammothInput: any = isNodeRuntime
        ? { buffer: Buffer.from(preprocessedDocxBuffer) }
        : { arrayBuffer: preprocessedDocxBuffer };

      try {
        const mammothResult = await mammoth.extractRawText(mammothInput);
        rawDocxText = mammothResult.value;
      } catch (err) {
        console.warn('[DocxParser] extractRawText warning:', err);
      }

      try {
        const mammothOptions = {
          convertImage: (mammoth.images as any).imgElement((element: any) => {
            return element.read('base64').then((imageBuffer: string) => {
              const mime = element.contentType || 'image/png';
              return {
                src: `data:${mime};base64,${imageBuffer}`,
              };
            });
          }),
        };
        const htmlResult = await mammoth.convertToHtml(mammothInput, mammothOptions);
        rawDocxHtml = htmlResult.value;

        const { textWithTables, failedImageCount } = convertHtmlTablesToMarkdown(rawDocxHtml);
        htmlFailedImages = failedImageCount;
        if (textWithTables && textWithTables.trim().length > 0) {
          rawDocxText = textWithTables;
        }
      } catch (err) {
        console.warn('[DocxParser] convertToHtml warning:', err);
      }

      // Direct OOXML fallback via JSZip if mammoth missed text (e.g. Word TextBoxes <w:txbxContent>, shapes, or VML images)
      try {
        const fallbackZip = await JSZip.loadAsync(preprocessedDocxBuffer);
        const docXmlFile = fallbackZip.file('word/document.xml');
        const docXml = docXmlFile ? await docXmlFile.async('string') : '';
        const hasHiddenShapesOrTextboxes =
          docXml.includes('<w:txbxContent') || docXml.includes('<v:imagedata');

        if (docXml && (!rawDocxText || rawDocxText.trim().length < 20 || hasHiddenShapesOrTextboxes)) {
          const relsXmlFile = fallbackZip.file('word/_rels/document.xml.rels');
          const relIdToTarget: Record<string, string> = {};
          if (relsXmlFile) {
            const relsXml = await relsXmlFile.async('string');
            const relRe = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/gi;
            let rm: RegExpExecArray | null;
            while ((rm = relRe.exec(relsXml)) !== null) {
              const filename = rm[2].split('/').pop() || rm[2];
              if (imageMap[filename]) relIdToTarget[rm[1]] = imageMap[filename];
              else if (imageMap[`word/${rm[2]}`]) relIdToTarget[rm[1]] = imageMap[`word/${rm[2]}`];
            }
          }

          const cleanXmlText = (chunk: string) => {
            const withImgs = chunk
              .replace(/<a:blip\b[^>]*r:embed="([^"]+)"[^>]*\/?>/gi, (_bm, rId) =>
                relIdToTarget[rId] ? `\n[[IMAGE_DATA:${relIdToTarget[rId]}]]\n` : ''
              )
              .replace(/<v:imagedata\b[^>]*r:id="([^"]+)"[^>]*\/?>/gi, (_bm, rId) =>
                relIdToTarget[rId] ? `\n[[IMAGE_DATA:${relIdToTarget[rId]}]]\n` : ''
              );
            return withImgs
              .replace(/<\/w:p>/gi, '\n')
              .replace(/<w:tab\s*\/?>/gi, ' ')
              .replace(/<w:br\s*\/?>/gi, '\n')
              .replace(/<[^>]+>/g, '')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/[ \t]+/g, ' ')
              .trim();
          };

          const outHtmlBlocks: string[] = [];
          const blockRe = /<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
          let m: RegExpExecArray | null;
          let lastTblEnd = 0;
          while ((m = blockRe.exec(docXml)) !== null) {
            if (m.index < lastTblEnd) continue;
            const block = m[0];
            if (block.startsWith('<w:tbl')) {
              lastTblEnd = m.index + block.length;
              const rowsHtml = (block.match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g) || []).map((tr, rIdx) => {
                const cells = (tr.match(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g) || []).map((tc) =>
                  cleanXmlText(tc).replace(/\n+/g, ' ')
                );
                const tag = rIdx === 0 ? 'th' : 'td';
                return `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
              });
              if (rowsHtml.length > 0) {
                outHtmlBlocks.push(`<table><tbody>${rowsHtml.join('')}</tbody></table>`);
              }
            } else {
              const txt = cleanXmlText(block);
              if (txt) outHtmlBlocks.push(`<p>${txt}</p>`);
            }
          }
          const xmlDerivedText = convertHtmlTablesToMarkdown(outHtmlBlocks.join('\n')).textWithTables.trim();
          const mammothPlainLen = rawDocxText.replace(/\[\[IMAGE_DATA:[^\]]+\]\]/g, '').trim().length;
          const xmlPlainLen = xmlDerivedText.replace(/\[\[IMAGE_DATA:[^\]]+\]\]/g, '').trim().length;
          if (!rawDocxText || mammothPlainLen < 20 || xmlPlainLen > mammothPlainLen * 1.15) {
            rawDocxText = xmlDerivedText;
          }
        }
      } catch (xmlErr) {
        console.warn('[DocxParser] OOXML direct fallback warning:', xmlErr);
      }

      const { soalList, metadata, imageWarnings, failedImagesCount: lineFailedImages } =
        parseQuestionsFromText(rawDocxText, imageMap);

      const allWarnings = Array.from(new Set([...zipWarnings, ...imageWarnings]));
      const totalFailedImages = zipFailedCount + htmlFailedImages + lineFailedImages;
      const attachedImageCount = soalList.reduce(
        (acc, q) =>
          acc +
          (q.gambar ? 1 : 0) +
          (Array.isArray(q.gambarTambahan) ? q.gambarTambahan.length : 0) +
          (q.pilihanGambar ? Object.keys(q.pilihanGambar).length : 0),
        0
      );
      const totalExtractedImages = Math.max(docxAssets.length, attachedImageCount);

      if (soalList.length > 0 && areRegexParsedQuestionsTrustworthy(soalList, rawDocxText)) {
        return finalizeValidatedParseResult(
          {
            success: true,
            judul: metadata.judul,
            mataPelajaran: metadata.mapel,
            kelas: metadata.kelas,
            petunjukUmum: metadata.petunjuk,
            soalList,
            extractedImagesCount: totalExtractedImages,
            failedImagesCount: totalFailedImages,
            imageWarnings: [...precheck.warnings, ...allWarnings],
            extractedImages: docxAssets,
            originalText: rawDocxText.replace(/\[\[IMAGE_DATA:[^\]]+\]\]/g, '[Gambar Tersemat]'),
            originalHtml: rawDocxHtml,
          },
          rawDocxText
        );
      }

      // Smart AI text fallback when DOCX uses custom numbering or regex results look incomplete
      if (rawDocxText.trim().length > 20) {
        const cleanTextForAi = rawDocxText.replace(/\[\[IMAGE_DATA:[^\]]+\]\]/g, '[GAMBAR]');
        const aiRes = await callBackendParserTextInBatches(cleanTextForAi, file.name);
        if (aiRes.success && aiRes.data?.soalList?.length > 0) {
          let formatted = formatAiParsedSoalList(aiRes.data.soalList, false);
          if (rawDocxText.toLowerCase().includes('kunci')) {
            formatted = applyAnswerKeysFromText(formatted, rawDocxText).updatedSoalList;
          }
          return finalizeValidatedParseResult(
            {
              success: true,
              judul: aiRes.data.judul || metadata.judul,
              mataPelajaran: aiRes.data.mataPelajaran || metadata.mapel,
              kelas: aiRes.data.kelas || metadata.kelas,
              petunjukUmum: aiRes.data.petunjukUmum || metadata.petunjuk,
              soalList: formatted,
              extractedImagesCount: totalExtractedImages,
              failedImagesCount: totalFailedImages,
              imageWarnings:
                docxAssets.length > 0
                  ? [
                      ...precheck.warnings,
                      ...allWarnings,
                      `Terdapat ${docxAssets.length} gambar di dokumen Word. Silakan cek kecocokannya atau pasang lewat "+ Tambah Gambar -> Gambar Tersedia".`,
                    ]
                  : [...precheck.warnings, ...allWarnings],
              extractedImages: docxAssets,
              originalText: rawDocxText.replace(/\[\[IMAGE_DATA:[^\]]+\]\]/g, '[Gambar Tersemat]'),
              originalHtml: rawDocxHtml,
            },
            cleanTextForAi
          );
        }
      }

      // Image-only DOCX fallback (e.g. exam screenshots pasted inside Word without text)
      if (docxAssets.length > 0) {
        const docxPages: ScannedPdfPagePayload[] = docxAssets
          .map((asset, idx) => {
            const commaIdx = asset.url.indexOf(',');
            const mimeMatch = asset.url.match(/^data:([^;]+);base64,/i);
            return {
              pageNumber: idx + 1,
              imageBase64: commaIdx !== -1 ? asset.url.slice(commaIdx + 1) : '',
              mimeType: mimeMatch?.[1]?.toLowerCase() || 'image/png',
            };
          })
          .filter((p) => p.imageBase64.length > 0);

        if (docxPages.length > 0) {
          const ocrDocxRes = await callBackendParserInBatches(docxPages, file.name);
          if (ocrDocxRes.success && ocrDocxRes.data?.soalList?.length) {
            const formatted = formatAiParsedSoalList(ocrDocxRes.data.soalList, true);
            return finalizeValidatedParseResult(
              {
                success: true,
                judul: ocrDocxRes.data.judul || metadata.judul,
                mataPelajaran: ocrDocxRes.data.mataPelajaran || metadata.mapel,
                kelas: ocrDocxRes.data.kelas || metadata.kelas,
                petunjukUmum: ocrDocxRes.data.petunjukUmum || metadata.petunjuk,
                soalList: formatted,
                extractedImagesCount: totalExtractedImages,
                failedImagesCount: totalFailedImages,
                imageWarnings: [...precheck.warnings, ...allWarnings],
                extractedImages: docxAssets,
                originalText:
                  rawDocxText.replace(/\[\[IMAGE_DATA:[^\]]+\]\]/g, '[Gambar Tersemat]') ||
                  'Dokumen Word berisi gambar soal (OCR diterapkan)',
                originalHtml: rawDocxHtml,
              },
              rawDocxText
            );
          }
        }
      }

      return {
        success: false,
        soalList: [],
        extractedImagesCount: totalExtractedImages,
        failedImagesCount: totalFailedImages,
        imageWarnings: allWarnings,
        extractedImages: docxAssets,
        originalText: rawDocxText.replace(/\[\[IMAGE_DATA:[^\]]+\]\]/g, '[Gambar Tersemat]'),
        originalHtml: rawDocxHtml,
        kunciDitemukanCount: 0,
        kunciBelumDitemukanCount: 0,
        siapDiterbitkan: false,
        error:
          rawDocxText.trim().length < 15
            ? 'Dokumen Word kosong atau hanya berisi gambar tanpa teks soal yang terbaca. Pastikan berkas .docx memuat naskah soal yang jelas atau konfigurasi GEMINI_API_KEY aktif di server.'
            : 'Tidak ditemukan butir soal yang dapat dikenali dalam dokumen Word ini. Pastikan format nomor soal jelas (misal 1., 2.) dan pilihan ganda (A., B., C., D.).',
      };
    }

    // ------------------------------------------------------------------------
    // 2. IMAGE EXAM UPLOAD (.JPG, .JPEG, .PNG, .WEBP) VIA OCR
    // ------------------------------------------------------------------------
    if (/\.(jpg|jpeg|png|webp)$/i.test(filename)) {
      const preparedImg = await prepareImageFileForUpload(file as any, arrayBuffer);
      const imgAssets: ExtractedImageAsset[] = [
        {
          id: 'uploaded_exam_image_1',
          url: preparedImg.dataUri,
          label: `Foto Naskah (${file.name})`,
          source: 'pdf-page',
        },
      ];
      const ocrRes = await callBackendParserFallback({
        fileBase64: preparedImg.base64,
        mimeType: preparedImg.mimeType,
        fileName: file.name,
      });

      if (ocrRes.success && ocrRes.data?.soalList?.length > 0) {
        const formatted = formatAiParsedSoalList(ocrRes.data.soalList, true);
        return finalizeValidatedParseResult({
          success: true,
          judul: ocrRes.data.judul,
          mataPelajaran: ocrRes.data.mataPelajaran,
          kelas: ocrRes.data.kelas,
          petunjukUmum: ocrRes.data.petunjukUmum,
          soalList: formatted,
          extractedImagesCount: 1,
          failedImagesCount: 0,
          imageWarnings: Array.isArray(ocrRes.data.validationWarnings)
            ? ocrRes.data.validationWarnings
            : [],
          extractedImages: imgAssets,
          originalText: `Berkas Gambar Naskah: ${file.name} (OCR Diterapkan)`,
        });
      }

      return {
        success: false,
        soalList: [],
        extractedImagesCount: 1,
        failedImagesCount: 0,
        imageWarnings: [],
        extractedImages: imgAssets,
        originalText: `Berkas Gambar Naskah: ${file.name}`,
        kunciDitemukanCount: 0,
        kunciBelumDitemukanCount: 0,
        siapDiterbitkan: false,
        error: `Gagal membaca soal dari gambar "${file.name}"${ocrRes.error ? `: ${ocrRes.error}` : ''}. Pastikan foto jelas dan GEMINI_API_KEY aktif di Vercel.`,
      };
    }

    // ------------------------------------------------------------------------
    // 3. PDF PARSER (pdfjs-dist text + embedded images + Vercel-safe OCR fallback)
    // ------------------------------------------------------------------------
    if (filename.endsWith('.pdf')) {
      const {
        text: pdfText,
        pageCount,
        assets: pdfAssets,
        scannedPages,
        failedImagesCount: pdfImgFailed,
        imageWarnings: pdfImgWarnings,
      } = await extractFromPdf(arrayBuffer);

      const cleanDigitalText = pdfText
        .replace(/\[---\s*HALAMAN\s+\d+\s*---\]/g, '')
        .replace(/\[\[IMAGE_DATA:[^\]]+\]\]/g, '')
        .trim();
      const rasterAssetsOnly = pdfAssets.filter((a) => a.source === 'pdf');

      // 3a. Local deterministic text extraction (validated for structural integrity)
      if (cleanDigitalText.length > 30) {
        const { soalList, metadata, imageWarnings: parseImgWarnings, failedImagesCount: parseFailed } =
          parseQuestionsFromText(pdfText);

        if (soalList.length > 0 && areRegexParsedQuestionsTrustworthy(soalList, pdfText)) {
          const allWarnings = Array.from(new Set([...pdfImgWarnings, ...parseImgWarnings]));
          if (rasterAssetsOnly.length > 0) {
            allWarnings.push(
              `Ditemukan ${rasterAssetsOnly.length} gambar di PDF. Harap periksa kecocokan posisi gambar pada masing-masing soal sebelum menerbitkan.`
            );
          }

          return finalizeValidatedParseResult(
            {
              success: true,
              judul: metadata.judul,
              mataPelajaran: metadata.mapel,
              kelas: metadata.kelas,
              petunjukUmum: metadata.petunjuk,
              soalList,
              extractedImagesCount: rasterAssetsOnly.length,
              failedImagesCount: pdfImgFailed + parseFailed,
              imageWarnings: Array.from(new Set(allWarnings)),
              extractedImages: pdfAssets,
              originalText: pdfText.replace(/\[\[IMAGE_DATA:[^\]]+\]\]/g, '[Gambar Tersemat Pada Halaman PDF]'),
              pageCount,
            },
            pdfText
          );
        }

        // 3b. Digital PDF text exists and pages aren't mostly scanned -> batched AI text structuring fallback
        if (scannedPages.length === 0 || cleanDigitalText.length > 400) {
          const textFallbackRes = await callBackendParserTextInBatches(cleanDigitalText, file.name);
          if (textFallbackRes.success && textFallbackRes.data?.soalList?.length > 0) {
            let formatted = formatAiParsedSoalList(textFallbackRes.data.soalList, false);
            if (cleanDigitalText.toLowerCase().includes('kunci')) {
              formatted = applyAnswerKeysFromText(formatted, cleanDigitalText).updatedSoalList;
            }
            return finalizeValidatedParseResult(
              {
                success: true,
                judul: textFallbackRes.data.judul || metadata.judul,
                mataPelajaran: textFallbackRes.data.mataPelajaran || metadata.mapel,
                kelas: textFallbackRes.data.kelas || metadata.kelas,
                petunjukUmum: textFallbackRes.data.petunjukUmum || metadata.petunjuk,
                soalList: formatted,
                extractedImagesCount: rasterAssetsOnly.length,
                failedImagesCount: pdfImgFailed,
                imageWarnings: pdfImgWarnings,
                extractedImages: pdfAssets,
                originalText: pdfText.replace(/\[\[IMAGE_DATA:[^\]]+\]\]/g, '[Gambar Tersemat]'),
                pageCount,
              },
              cleanDigitalText
            );
          }
        }
      }

      // 3c. Scanned PDF or client PDF worker unavailable -> Vercel-safe Visual PDF OCR
      const scanWarnings = [
        ...pdfImgWarnings,
        'Dokumen PDF diproses melalui pembacaan visual/OCR. Jika soal memiliki gambar atau diagram, halaman PDF tersedia di "Atur / Crop -> Gambar Tersedia".',
      ];

      let ocrRes: { success: boolean; data?: any; error?: string } = { success: false };

      // Only send raw PDF directly if <= 2.4MB binary (~3.2MB base64, safely under Vercel's 4.5MB limit)
      if (arrayBuffer.byteLength <= 2_400_000) {
        const uint8Array = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < uint8Array.byteLength; i++) {
          binary += String.fromCharCode(uint8Array[i]);
        }
        const fileBase64 =
          typeof btoa !== 'undefined' ? btoa(binary) : Buffer.from(uint8Array).toString('base64');

        ocrRes = await callBackendParserFallback({
          fileBase64,
          fileName: file.name,
          mimeType: 'application/pdf',
        });
      }

      // If PDF exceeded 2.4MB (Vercel 4.5MB protection) OR direct PDF call failed, process rendered page images in <=2.1MB batches!
      if ((!ocrRes.success || !ocrRes.data?.soalList?.length) && scannedPages.length > 0) {
        const batchedRes = await callBackendParserInBatches(scannedPages, file.name);
        if (batchedRes.success && batchedRes.data?.soalList?.length) {
          ocrRes = batchedRes;
        } else if (!ocrRes.error && batchedRes.error) {
          ocrRes = batchedRes;
        }
      }

      if (ocrRes.success && ocrRes.data && Array.isArray(ocrRes.data.soalList) && ocrRes.data.soalList.length > 0) {
        let formattedSoalList = formatAiParsedSoalList(ocrRes.data.soalList, true);
        if (cleanDigitalText.toLowerCase().includes('kunci')) {
          formattedSoalList = applyAnswerKeysFromText(formattedSoalList, cleanDigitalText).updatedSoalList;
        }
        return finalizeValidatedParseResult(
          {
            success: true,
            judul: ocrRes.data.judul,
            mataPelajaran: ocrRes.data.mataPelajaran,
            kelas: ocrRes.data.kelas,
            petunjukUmum: ocrRes.data.petunjukUmum,
            soalList: formattedSoalList,
            extractedImagesCount: rasterAssetsOnly.length,
            failedImagesCount: pdfImgFailed,
            imageWarnings: Array.from(
              new Set([
                ...scanWarnings,
                ...(Array.isArray(ocrRes.data.validationWarnings) ? ocrRes.data.validationWarnings : []),
              ])
            ),
            extractedImages: pdfAssets,
            originalText: cleanDigitalText || 'Dokumen PDF Hasil Scan (OCR Diterapkan)',
            pageCount,
          },
          cleanDigitalText
        );
      }

      return {
        success: false,
        soalList: [],
        extractedImagesCount: rasterAssetsOnly.length,
        failedImagesCount: pdfImgFailed,
        imageWarnings: Array.from(new Set(scanWarnings)),
        extractedImages: pdfAssets,
        originalText: cleanDigitalText,
        pageCount,
        kunciDitemukanCount: 0,
        kunciBelumDitemukanCount: 0,
        siapDiterbitkan: false,
        error:
          cleanDigitalText.length > 30
            ? `Teks PDF terbaca (${cleanDigitalText.length} karakter), namun struktur nomor soal belum dikenali. Pastikan penomoran menggunakan format 1., 2., dan pilihan A., B., C., D.${ocrRes.error ? ` (${ocrRes.error})` : ''}`
            : arrayBuffer.byteLength > 2_400_000 && scannedPages.length === 0
            ? 'Ukuran PDF melebihi 2.4 MB dan halaman gagal dirender di browser. Perkecil/kompres ukuran PDF lalu unggah ulang.'
            : `PDF tidak memuat teks digital (kemungkinan hasil scan gambar) dan OCR otomatis belum berhasil${ocrRes.error ? `: ${ocrRes.error}` : ''}. Pastikan GEMINI_API_KEY aktif di Vercel Environment Variables untuk PDF scan, atau gunakan file Word (.docx) / PDF teks digital.`,
      };
    }

    // ------------------------------------------------------------------------
    // 3B. EXCEL SPREADSHEET PARSER (.XLSX, .XLS)
    // ------------------------------------------------------------------------
    if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
      const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
      const excelSoal: SoalUjian[] = [];
      const textDumpLines: string[] = [];
      const excelWarnings: string[] = [...precheck.warnings];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;
        const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' }) as any[][];
        if (!rows || rows.length === 0) continue;

        // Detect columnar exam spreadsheet header
        let headerIdx = -1;
        const colMap: Record<string, number> = {};
        for (let r = 0; r < Math.min(10, rows.length); r++) {
          const cells = (rows[r] || []).map((c) => String(c ?? '').trim().toLowerCase());
          const qIdx = cells.findIndex((c) =>
            /^(pertanyaan|soal|teks\s*soal|butir\s*soal|question)$/.test(c)
          );
          if (qIdx !== -1) {
            headerIdx = r;
            cells.forEach((h, cIdx) => {
              if (/^(no|no\.?|nomor)$/.test(h)) colMap.no = cIdx;
              else if (/^(pertanyaan|soal|teks\s*soal|butir\s*soal|question)$/.test(h)) colMap.pertanyaan = cIdx;
              else if (/^(a|pilihan\s*a|opsi\s*a|jwb\s*a)$/.test(h)) colMap.A = cIdx;
              else if (/^(b|pilihan\s*b|opsi\s*b|jwb\s*b)$/.test(h)) colMap.B = cIdx;
              else if (/^(c|pilihan\s*c|opsi\s*c|jwb\s*c)$/.test(h)) colMap.C = cIdx;
              else if (/^(d|pilihan\s*d|opsi\s*d|jwb\s*d)$/.test(h)) colMap.D = cIdx;
              else if (/^(e|pilihan\s*e|opsi\s*e|jwb\s*e)$/.test(h)) colMap.E = cIdx;
              else if (/^(kunci|kunci\s*jawaban|jawaban|kj|answer)$/.test(h)) colMap.kunci = cIdx;
              else if (/^(tipe|jenis|type)$/.test(h)) colMap.tipe = cIdx;
              else if (/^(bobot|skor|poin|nilai)$/.test(h)) colMap.bobot = cIdx;
              else if (/^(gambar|image|url\s*gambar|foto)$/.test(h)) colMap.gambar = cIdx;
              else if (/^(pedoman|pembahasan|rubrik)$/.test(h)) colMap.pedoman = cIdx;
            });
            break;
          }
        }

        if (headerIdx !== -1 && colMap.pertanyaan !== undefined) {
          for (let r = headerIdx + 1; r < rows.length; r++) {
            const row = rows[r] || [];
            const pertanyaan = String(row[colMap.pertanyaan] ?? '').trim();
            if (!pertanyaan) continue;

            const pilihan: Record<string, string> = {};
            (['A', 'B', 'C', 'D', 'E'] as const).forEach((letter) => {
              if (colMap[letter] !== undefined) {
                const val = String(row[colMap[letter]] ?? '').trim();
                if (val) pilihan[letter] = stripRedundantOptionLabel(letter, val);
              }
            });

            const rawTipe = colMap.tipe !== undefined ? String(row[colMap.tipe] ?? '').toLowerCase() : '';
            const hasOpts = Object.keys(pilihan).length >= 2;
            let tipe: TipeSoalUjian;
            if (rawTipe.includes('benar') || rawTipe.includes('salah') || rawTipe === 'bs') {
              tipe = 'benar_salah';
            } else if (rawTipe.includes('isian') || rawTipe.includes('singkat')) {
              tipe = 'isian_singkat';
            } else if (rawTipe.includes('uraian') || rawTipe.includes('esai') || rawTipe.includes('essay')) {
              tipe = 'uraian';
            } else if (hasOpts) {
              const isTf =
                Object.keys(pilihan).length === 2 &&
                /^(?:benar|betul|true|ya)$/i.test(pilihan.A || '') &&
                /^(?:salah|false|tidak)$/i.test(pilihan.B || '');
              tipe = isTf ? 'benar_salah' : 'pilihan_ganda';
            } else {
              tipe = 'uraian';
            }

            if (tipe === 'benar_salah' && !hasOpts) {
              pilihan.A = 'Benar';
              pilihan.B = 'Salah';
            }

            const rawKunci =
              colMap.kunci !== undefined ? String(row[colMap.kunci] ?? '').trim() : '';
            const upperKunci = rawKunci.toUpperCase();
            const cleanKunci =
              tipe === 'pilihan_ganda'
                ? upperKunci.match(/^[A-E]/)?.[0] || upperKunci.replace(/[^A-E]/g, '').slice(0, 1)
                : tipe === 'benar_salah'
                ? normalizeTrueFalseValue(rawKunci, { pilihan })
                : rawKunci;

            const rawGambar =
              colMap.gambar !== undefined ? String(row[colMap.gambar] ?? '').trim() : '';
            const validGambar =
              rawGambar && (rawGambar.startsWith('http') || rawGambar.startsWith('data:image/'))
                ? rawGambar
                : undefined;

            const bobotVal =
              colMap.bobot !== undefined ? Number(row[colMap.bobot]) : NaN;
            const bobot = Number.isFinite(bobotVal) && bobotVal > 0 ? bobotVal : tipe === 'uraian' ? 2 : 1;
            const nomor = excelSoal.length + 1;
            const pedoman =
              colMap.pedoman !== undefined ? String(row[colMap.pedoman] ?? '').trim() : '';

            const needsExcelVerify =
              (tipe === 'pilihan_ganda' || tipe === 'benar_salah' || tipe === 'isian_singkat') &&
              !cleanKunci;

            excelSoal.push({
              id: `soal-xlsx-${Date.now()}-${nomor}`,
              nomor,
              tipe,
              pertanyaan,
              pilihan: tipe === 'pilihan_ganda' || tipe === 'benar_salah' ? pilihan : undefined,
              kunciJawaban: cleanKunci,
              bobot,
              gambar: validGambar,
              gambarPosisi: validGambar ? 'atas' : undefined,
              gambarUkuran: validGambar ? 'sedang' : undefined,
              gambarStatus: validGambar ? 'ok' : undefined,
              pedomanPenilaian:
                tipe === 'uraian'
                  ? pedoman || 'Kriteria: Kesesuaian konsep, kelengkapan uraian, ketepatan penalaran.'
                  : undefined,
              pembahasan: pedoman || undefined,
              perluVerifikasi: needsExcelVerify,
              catatanVerifikasi: needsExcelVerify
                ? 'Kunci jawaban pada kolom Excel masih kosong. Silakan isi kunci jawaban.'
                : undefined,
            });
          }
        } else {
          // Freeform vertical Excel layout fallback
          for (const row of rows) {
            const nonEmpty = row.map((c) => String(c ?? '').trim()).filter(Boolean);
            if (nonEmpty.length === 0) continue;
            if (
              nonEmpty.length >= 2 &&
              (/^\d+[\.\)]?$/.test(nonEmpty[0]) || /^\(?[A-Ea-e][\.\)]?$/.test(nonEmpty[0]))
            ) {
              const pfx = /[\.\)]$/.test(nonEmpty[0]) ? nonEmpty[0] : `${nonEmpty[0]}.`;
              textDumpLines.push(`${pfx} ${nonEmpty.slice(1).join(' ')}`);
            } else {
              textDumpLines.push(nonEmpty.join(' '));
            }
          }
        }
      }

      if (excelSoal.length > 0) {
        return finalizeValidatedParseResult(
          {
            success: true,
            judul: file.name.replace(/\.(xlsx|xls)$/i, '').replace(/[_-]+/g, ' ').trim(),
            soalList: excelSoal,
            extractedImagesCount: excelSoal.filter((q) => Boolean(q.gambar)).length,
            failedImagesCount: 0,
            imageWarnings: excelWarnings,
            extractedImages: [],
            originalText: excelSoal
              .map((q) => `${q.nomor}. ${q.pertanyaan}`)
              .join('\n'),
          }
        );
      }

      const excelRawText = textDumpLines.join('\n');
      if (excelRawText.trim().length > 15) {
        const { soalList, metadata, imageWarnings, failedImagesCount } =
          parseQuestionsFromText(excelRawText);
        if (soalList.length > 0) {
          return finalizeValidatedParseResult(
            {
              success: true,
              judul: metadata.judul,
              mataPelajaran: metadata.mapel,
              kelas: metadata.kelas,
              petunjukUmum: metadata.petunjuk,
              soalList,
              extractedImagesCount: 0,
              failedImagesCount,
              imageWarnings: [...excelWarnings, ...imageWarnings],
              extractedImages: [],
              originalText: excelRawText,
            },
            excelRawText
          );
        }
      }

      return {
        success: false,
        soalList: [],
        extractedImagesCount: 0,
        failedImagesCount: 0,
        imageWarnings: excelWarnings,
        extractedImages: [],
        originalText: excelRawText,
        kunciDitemukanCount: 0,
        kunciBelumDitemukanCount: 0,
        siapDiterbitkan: false,
        error:
          'Format tabel Excel belum dikenali. Gunakan header kolom: No | Pertanyaan | A | B | C | D | Kunci (atau format baris bernomor 1., A., B., C., D.).',
      };
    }

    // ------------------------------------------------------------------------
    // 4. PLAIN TEXT / CSV PARSER (.TXT, .CSV)
    // ------------------------------------------------------------------------
    const txtBytes = new Uint8Array(arrayBuffer);
    let txtEncoding = 'utf-8';
    let txtSliceOffset = 0;
    if (txtBytes.length >= 2 && txtBytes[0] === 0xff && txtBytes[1] === 0xfe) {
      txtEncoding = 'utf-16le';
      txtSliceOffset = 2;
    } else if (txtBytes.length >= 2 && txtBytes[0] === 0xfe && txtBytes[1] === 0xff) {
      txtEncoding = 'utf-16be';
      txtSliceOffset = 2;
    } else if (
      txtBytes.length >= 3 &&
      txtBytes[0] === 0xef &&
      txtBytes[1] === 0xbb &&
      txtBytes[2] === 0xbf
    ) {
      txtSliceOffset = 3;
    }
    const rawText = new TextDecoder(txtEncoding).decode(txtBytes.subarray(txtSliceOffset));
    const { soalList, metadata, imageWarnings, failedImagesCount } = parseQuestionsFromText(rawText);

    if (soalList.length > 0 && areRegexParsedQuestionsTrustworthy(soalList, rawText)) {
      return finalizeValidatedParseResult(
        {
          success: true,
          judul: metadata.judul,
          mataPelajaran: metadata.mapel,
          kelas: metadata.kelas,
          petunjukUmum: metadata.petunjuk,
          soalList,
          extractedImagesCount: 0,
          failedImagesCount,
          imageWarnings,
          extractedImages: [],
          originalText: rawText,
        },
        rawText
      );
    }

    if (rawText.trim().length > 30) {
      const aiTextRes = await callBackendParserTextInBatches(rawText, file.name);
      if (aiTextRes.success && aiTextRes.data?.soalList?.length > 0) {
        let formatted = formatAiParsedSoalList(aiTextRes.data.soalList, false);
        if (rawText.toLowerCase().includes('kunci')) {
          formatted = applyAnswerKeysFromText(formatted, rawText).updatedSoalList;
        }
        return finalizeValidatedParseResult(
          {
            success: true,
            judul: aiTextRes.data.judul || metadata.judul,
            mataPelajaran: aiTextRes.data.mataPelajaran || metadata.mapel,
            kelas: aiTextRes.data.kelas || metadata.kelas,
            petunjukUmum: aiTextRes.data.petunjukUmum || metadata.petunjuk,
            soalList: formatted,
            extractedImagesCount: 0,
            failedImagesCount,
            imageWarnings,
            extractedImages: [],
            originalText: rawText,
          },
          rawText
        );
      }
    }

    return finalizeValidatedParseResult(
      {
        success: false,
        soalList: [],
        extractedImagesCount: 0,
        failedImagesCount,
        imageWarnings,
        extractedImages: [],
        originalText: rawText,
      },
      rawText
    );
  } catch (err: any) {
    console.error('[ExamDocumentParser Error]:', err);
    return {
      success: false,
      soalList: [],
      extractedImagesCount: 0,
      failedImagesCount: 0,
      imageWarnings: [],
      extractedImages: [],
      kunciDitemukanCount: 0,
      kunciBelumDitemukanCount: 0,
      siapDiterbitkan: false,
      error: `Gagal membaca dokumen: ${err?.message || 'Terjadi kesalahan sistem saat memproses berkas.'}`,
    };
  }
}
