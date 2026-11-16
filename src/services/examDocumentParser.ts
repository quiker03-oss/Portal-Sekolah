import mammoth from 'mammoth';
import JSZip from 'jszip';
import { SoalUjian } from '../types';

export interface ExtractedImageAsset {
  id: string;
  url: string;
  label: string;
  pageNumber?: number;
  source: 'docx' | 'pdf' | 'pdf-page';
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

/**
 * Reconstructs clean reading-order lines from PDF.js textContent items using Y/X coordinates.
 * Automatically detects true 2-column exam pages (numbered questions on both left and right halves)
 * while preserving side-by-side choices (A./B. and C./D.) on single-column exams.
 */
function buildPdfPageText(items: any[]): string {
  const positioned: Array<{ str: string; x: number; y: number; hasEOL: boolean }> = [];
  let minX = Infinity;
  let maxX = -Infinity;

  for (const item of items) {
    if (!('str' in item)) continue;
    const str = String(item.str || '');
    const x = Array.isArray(item.transform) ? Number(item.transform[4]) || 0 : 0;
    const y = Array.isArray(item.transform) ? Number(item.transform[5]) || 0 : 0;
    if (str.trim()) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    positioned.push({
      str,
      x,
      y,
      hasEOL: Boolean(item.hasEOL),
    });
  }

  if (positioned.length === 0) return '';

  const collapseRows = (subset: Array<{ str: string; x: number; y: number; hasEOL: boolean }>): string[] => {
    // Sort top-to-bottom (higher PDF Y = higher on page), then left-to-right
    const sorted = [...subset].sort((a, b) => {
      if (Math.abs(b.y - a.y) > 4) return b.y - a.y;
      return a.x - b.x;
    });

    const lines: string[] = [];
    let currentRowY: number | null = null;
    let rowItems: Array<{ str: string; x: number }> = [];

    const flushRow = () => {
      if (rowItems.length === 0) return;
      rowItems.sort((a, b) => a.x - b.x);
      const joined = rowItems
        .map((r) => r.str)
        .join(' ')
        .replace(/[ \t]+/g, ' ')
        .trim();
      if (joined) lines.push(joined);
      rowItems = [];
    };

    for (const it of sorted) {
      if (currentRowY !== null && Math.abs(it.y - currentRowY) > 4) {
        flushRow();
        currentRowY = it.y;
      } else if (currentRowY === null) {
        currentRowY = it.y;
      }

      if (it.str) {
        rowItems.push({ str: it.str, x: it.x });
      }
    }
    flushRow();
    return lines;
  };

  // Detect true 2-column exam layout (left half has >= 2 question numbers AND right half has >= 2 question numbers)
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

      // Keep any trailing KUNCI JAWABAN section below both columns in footer
      const kunciItem = bodyLeft.find(
        (p) => p.y < minRightY - 4 && /\bkunci\b/i.test(p.str)
      );
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

/**
 * Extracts text, embedded images, and scanned page snapshots from a PDF file using pdfjs-dist.
 * Uses locally hosted /pdf.worker.min.mjs (no external CDN dependency) with automatic fallback.
 */
async function extractFromPdf(arrayBuffer: ArrayBuffer): Promise<{
  text: string;
  pageCount: number;
  assets: ExtractedImageAsset[];
  pageImages: Record<number, string[]>;
  failedImagesCount: number;
  imageWarnings: string[];
}> {
  const assets: ExtractedImageAsset[] = [];
  const pageImages: Record<number, string[]> = {};
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
      const pageText = buildPdfPageText(textContent.items as any[]);
      const extractedOnPage: string[] = [];

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
          const isLowTextPage = pageText.trim().length < 80;

          // Only render canvas when page has images or looks scanned (keeps digital text PDFs ultra fast)
          if (hasImageOps || (isLowTextPage && i <= 10)) {
            const viewport = page.getViewport({ scale: 1.4 });
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(viewport.width);
            canvas.height = Math.round(viewport.height);
            const ctx = canvas.getContext('2d');

            if (ctx) {
              await page.render({ canvasContext: ctx, viewport }).promise;

              if (isLowTextPage || i <= 5) {
                const pageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
                assets.push({
                  id: `pdf_page_${i}`,
                  url: pageDataUrl,
                  label: `Halaman PDF ${i} (Pratinjau / Scan)`,
                  pageNumber: i,
                  source: 'pdf-page',
                });
              }

              const seenObjIds = new Set<string>();
              for (let opIdx = 0; opIdx < opList.fnArray.length; opIdx++) {
                const fn = opList.fnArray[opIdx];
                if (fn === OPS.paintImageXObject || fn === OPS.paintImageMaskXObject) {
                  const objId = opList.argsArray[opIdx]?.[0];
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
                  const inlineImg = opList.argsArray[opIdx]?.[0];
                  const dataUrl = pdfImageObjToDataUrl(inlineImg);
                  if (dataUrl) {
                    extractedOnPage.push(dataUrl);
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

      const imageMarkersText = extractedOnPage.map((uri) => `\n[[IMAGE_DATA:${uri}]]`).join('\n');
      fullText += `\n[--- HALAMAN ${i} ---]\n${pageText}${imageMarkersText}\n`;
    }

    return {
      text: fullText.trim(),
      pageCount: pdf.numPages,
      assets,
      pageImages,
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
  let globalQuestionCounter = 0;

  const processList = (ol: HTMLOListElement, isOptionList: boolean) => {
    const listType = (ol.getAttribute('type') || '').toLowerCase();
    const listItems = Array.from(ol.children).filter(
      (el): el is HTMLLIElement => el.tagName === 'LI'
    );

    const effectiveOptionList =
      isOptionList || listType === 'a' || listType === 'i';

    listItems.forEach((li, itemIdx) => {
      // First recursively expand any nested <ol> inside this <li> as options!
      const nestedOls = Array.from(li.querySelectorAll(':scope > ol')) as HTMLOListElement[];
      nestedOls.forEach((nested) => {
        processList(nested, true);
      });

      const currentText = (li.textContent || '').trim();
      const alreadyHasNumber = /^(?:soal\s*|no\.?\s*)?\(?\d+[\.\)\:]/.test(currentText);
      const alreadyHasLetter = /^\(?[A-Ea-e][\.\)]/.test(currentText);

      if (effectiveOptionList) {
        if (!alreadyHasLetter && itemIdx < 5) {
          const letter = String.fromCharCode(65 + itemIdx); // A..E
          li.insertBefore(document.createTextNode(`${letter}. `), li.firstChild);
        }
      } else {
        globalQuestionCounter++;
        if (!alreadyHasNumber && !alreadyHasLetter) {
          li.insertBefore(document.createTextNode(`${globalQuestionCounter}. `), li.firstChild);
        }
      }
    });

    // Replace <ol> with block wrapper so DOM order stays intact
    const div = document.createElement('div');
    while (ol.firstChild) {
      const child = ol.firstChild;
      if (child instanceof HTMLElement && child.tagName === 'LI') {
        const p = document.createElement('p');
        while (child.firstChild) p.appendChild(child.firstChild);
        div.appendChild(p);
        ol.removeChild(child);
      } else {
        div.appendChild(child);
      }
    }
    ol.replaceWith(div);
  };

  // Process top-level <ol> elements in document order
  const allOls = Array.from(root.querySelectorAll('ol'));
  for (const ol of allOls) {
    if (!ol.isConnected) continue;
    // Skip if inside another <ol> (will be handled recursively by parent)
    if (ol.parentElement?.closest('ol')) continue;

    const listType = (ol.getAttribute('type') || '').toLowerCase();
    const directLis = Array.from(ol.children).filter((el) => el.tagName === 'LI');
    const hasNestedOl = directLis.some((li) => Boolean(li.querySelector('ol')));

    // Heuristic: Is this standalone top-level <ol> actually options for a preceding numbered <p>?
    // Walk up to 3 preceding siblings (skipping image markers) to detect the question prompt
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
 * Helper to expand layout table rows cleanly (including paired columns like "A. | optA | B. | optB").
 */
function formatLayoutTableRows(parsedRows: string[][]): string[] {
  const outLines: string[] = [];
  for (const cells of parsedRows) {
    const nonEmpty = cells.map((c) => c.trim()).filter(Boolean);
    if (nonEmpty.length === 0) continue;

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
 * Converts HTML tables, Word <ol> numbering, and embedded <img> tags into structured lines.
 */
function convertHtmlTablesToMarkdown(html: string): {
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

    // Convert <ol> lists from innermost outward so nested question/option lists keep A-E & 1-N!
    let guard = 0;
    while (/<ol[^>]*>/i.test(text) && guard < 20) {
      guard++;
      const hadInner = text;
      text = text.replace(/<ol([^>]*)>((?:(?!<ol[\s>])[\s\S])*?)<\/ol>/gi, (_m, attrs, inner) => {
        const isAlphaAttr = /type=["']?[aA]["']?/i.test(attrs);
        const liMatches = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
        const isShortAlphaCandidate =
          liMatches.length >= 2 &&
          liMatches.length <= 5 &&
          liMatches.every((lm) => {
            const plain = lm[1].replace(/<[^>]+>/g, ' ').trim();
            return plain.length < 180 && !/^\d+[\.\)]/.test(plain) && !/\b[A-E]\.\s+/.test(plain);
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

      const isLayoutTable = parsedRows.some((cells) =>
        cells.some(
          (c) =>
            c.includes('[[IMAGE_DATA:') ||
            /^\d+[\.\)]?$/.test(c) ||
            /^\(?[A-Ea-e][\.\)]\s*/.test(c)
        )
      );

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

    const isLayoutTable = parsedRows.some((cells) =>
      cells.some(
        (c) =>
          c.includes('[[IMAGE_DATA:') ||
          c.includes('[[IMAGE_ERROR:') ||
          /^\d+[\.\)]?$/.test(c) ||
          /^(?:soal\s*)?\d+[\.\)]\s+/i.test(c) ||
          /^\(?[A-Ea-e][\.\)](?:\s|$)/.test(c)
      )
    );

    if (isLayoutTable) {
      table.replaceWith(document.createTextNode('\n' + formatLayoutTableRows(parsedRows).join('\n') + '\n'));
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
        table.replaceWith(document.createTextNode(tableMd));
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

    // Check if the line starts with an option ("A. ...", "a) ...", "A.10 ...") OR contains >= 2 distinct choices inline
    const startsWithOpt = /^\(?[A-Ea-e][\.\)]\s*\S/.test(line);
    const hasMultipleChoices =
      /\(?[AaCc][\.\)]\s*\S+[\s\t]+\(?[BbDd][\.\)]\s*\S+/.test(line) ||
      (startsWithOpt && /\s{1,}(?=\(?[B-Eb-e][\.\)]\s*\S)/.test(line));

    if (hasMultipleChoices) {
      const parts = line
        .split(/(?<=\S)\s+(?=\(?[A-Ea-e][\.\)]\s*\S)/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length > 1) {
        expanded.push(...parts);
        continue;
      }
    }

    expanded.push(line);
  }

  return expanded;
}

/**
 * Extracts answer keys from a dedicated "KUNCI JAWABAN" section, table, or list.
 */
export function extractAnswerKeysFromSection(text: string): Record<number, string> {
  const keysMap: Record<number, string> = {};
  if (!text) return keysMap;

  // 1. Table format: "| 1 | A |" or "| 1 | A | 2 | B |"
  const tableCellRegex = /\|\s*(\d+)\s*\|\s*([A-Ea-e])\s*\|/g;
  let match: RegExpExecArray | null;
  while ((match = tableCellRegex.exec(text)) !== null) {
    const num = parseInt(match[1], 10);
    const letter = match[2].toUpperCase();
    if (num > 0 && num <= 500) {
      keysMap[num] = letter;
    }
  }

  // 2. Standard list & inline format: "1. A", "1) B", "1=C", "1: D", "1.A"
  const listRegex = /(?:^|\s|\b)(\d+)\s*[\.\)\:\=\-]\s*([A-Ea-e])\b/g;
  while ((match = listRegex.exec(text)) !== null) {
    const num = parseInt(match[1], 10);
    const letter = match[2].toUpperCase();
    if (num > 0 && num <= 500) {
      keysMap[num] = letter;
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
    if (extractedKeys[q.nomor]) {
      appliedCount++;
      return {
        ...q,
        kunciJawaban: extractedKeys[q.nomor],
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

  // 2. Separate dedicated answer key section if located at the end of the document
  const keySectionKeywords = [
    'kunci jawaban',
    'kunci jawaban soal',
    'pedoman kunci jawaban',
    'kunci soal',
    'kunci jawaban pilihan ganda',
    'daftar kunci jawaban',
    'kunci:',
  ];

  let splitIndex = -1;
  for (let i = 0; i < allLines.length; i++) {
    const cleanLine = allLines[i].toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    if (
      keySectionKeywords.some(
        (kw) => cleanLine === kw || cleanLine.startsWith(kw + ' ') || cleanLine === '#' + kw
      )
    ) {
      if (i > 5) {
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
  const imageUris = Object.values(imageMap);
  let nextImageIdx = 0;

  const soalList: SoalUjian[] = [];
  let currentSoal: Partial<SoalUjian> | null = null;
  let currentPilihan: Record<string, string> = {};
  let currentPilihanGambar: Record<string, string> = {};
  let currentPertanyaanLines: string[] = [];
  let currentAttachedImage: string | undefined = undefined;
  let currentImagePosIndex: number = -1;
  let currentPosisiGambar: 'atas' | 'tengah' | 'bawah' = 'atas';
  let currentUkuranGambar: 'kecil' | 'sedang' | 'besar' | 'asli' = 'sedang';
  let currentImageWarning: string | undefined = undefined;
  let currentImageStatus: 'ok' | 'warning' | 'error' | undefined = undefined;
  let activeOptionLetter: string | null = null;

  const finalizeSoal = () => {
    if (!currentSoal) return;

    const pertanyaanText = currentPertanyaanLines.join('\n').trim();
    if (!pertanyaanText && Object.keys(currentPilihan).length === 0 && !currentAttachedImage) return;

    const optKeys = Object.keys(currentPilihan);
    const hasOptions = optKeys.length >= 2 || Object.keys(currentPilihanGambar).length >= 2;
    const tipe = hasOptions ? 'pilihan_ganda' : 'uraian';

    let finalPos: 'atas' | 'tengah' | 'bawah' = currentPosisiGambar;
    if (currentAttachedImage && currentImagePosIndex >= 0) {
      if (currentImagePosIndex === 0) {
        finalPos = 'atas';
      } else if (currentImagePosIndex < currentPertanyaanLines.length) {
        finalPos = 'tengah';
      } else {
        finalPos = 'bawah';
      }
    }

    let kunci = currentSoal.kunciJawaban || '';
    if (tipe === 'pilihan_ganda' && !kunci) {
      for (const [k, v] of Object.entries(currentPilihan)) {
        if (
          v.includes('[KUNCI]') ||
          v.includes('(KUNCI)') ||
          v.startsWith('*') ||
          v.includes('*(Kunci)*')
        ) {
          kunci = k;
          currentPilihan[k] = v.replace(/\[KUNCI\]|\(KUNCI\)|\*|\(kunci\)/gi, '').trim();
          break;
        }
      }
    }

    const nomorSoal = soalList.length + 1;
    const docNomor = currentSoal.nomor || nomorSoal;
    const finalKunci =
      kunci ||
      (tipe === 'pilihan_ganda' ? trailingKeys[docNomor] || trailingKeys[nomorSoal] || '' : '');

    soalList.push({
      id: `soal-${Date.now()}-${nomorSoal}`,
      nomor: nomorSoal,
      tipe,
      pertanyaan:
        pertanyaanText ||
        (currentAttachedImage ? '(Perhatikan gambar berikut)' : `Soal nomor ${nomorSoal}`),
      pilihan: hasOptions ? currentPilihan : undefined,
      pilihanGambar: Object.keys(currentPilihanGambar).length > 0 ? currentPilihanGambar : undefined,
      kunciJawaban: finalKunci,
      bobot: currentSoal.bobot || (tipe === 'pilihan_ganda' ? 1 : 2),
      gambar: currentAttachedImage,
      gambarPosisi: currentAttachedImage ? finalPos : undefined,
      gambarUkuran: currentAttachedImage ? currentUkuranGambar : undefined,
      gambarStatus: currentImageStatus || (currentAttachedImage ? 'ok' : undefined),
      gambarWarning: currentImageWarning,
      pedomanPenilaian:
        tipe === 'uraian'
          ? currentSoal.pedomanPenilaian ||
            'Kriteria: Kesesuaian konsep, kelengkapan uraian, ketepatan penalaran.'
          : undefined,
      perluVerifikasi: (tipe === 'pilihan_ganda' && !finalKunci) || currentImageStatus === 'warning' || currentImageStatus === 'error',
      catatanVerifikasi:
        currentImageWarning ||
        (tipe === 'pilihan_ganda' && !finalKunci
          ? 'Kunci jawaban belum ditentukan pada dokumen asli. Silakan pilih kunci jawaban yang benar.'
          : undefined),
    });

    currentSoal = null;
    currentPilihan = {};
    currentPilihanGambar = {};
    currentPertanyaanLines = [];
    currentAttachedImage = undefined;
    currentImagePosIndex = -1;
    currentPosisiGambar = 'atas';
    currentUkuranGambar = 'sedang';
    currentImageWarning = undefined;
    currentImageStatus = undefined;
    activeOptionLetter = null;
  };

  for (let i = 0; i < questionLines.length; i++) {
    const rawLine = questionLines[i];
    if (/^\[---\s*HALAMAN\s+\d+\s*---\]$/.test(rawLine)) {
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

    if (
      !line &&
      lineImages.length === 0 &&
      (rawLine.includes('[[IMAGE]]') || rawLine.includes('[IMAGE:') || rawLine.includes('[Gambar'))
    ) {
      if (currentSoal && !currentAttachedImage && nextImageIdx < imageUris.length) {
        currentAttachedImage = imageUris[nextImageIdx++];
        currentImagePosIndex = currentPertanyaanLines.length;
        currentImageStatus = 'ok';
      }
      continue;
    }

    // Ignore Roman numeral section headers (e.g. "I. Pilihan Ganda", "II. Uraian")
    if (/^(?:[IVX]{1,4}|BAGIAN\s+[A-Z0-9]+)\s*[\.\:\)]\s+(?:PILIHAN|URAIAN|ESAI|ESSAY|ISIAN|JAWABLAH)/i.test(line)) {
      finalizeSoal();
      continue;
    }

    // Match Question Start:
    // "1. Pertanyaan", "1 . Pertanyaan", "1) Pertanyaan", "(1) Pertanyaan", "[1] Pertanyaan", "No. 1: Pertanyaan", "Soal 1. Pertanyaan", "1.Pertanyaan"
    // Guard against decimals ("1.5", "3.14") via (?![0-9]) after delimiter
    const qMatch = line.match(
      /^(?:soal\s*(?:no\.?|nomor)?\s*|no\.?\s*|nomor\s*)?[\(\[]?(\d{1,3})\s*[\.\)\:\]]\s*(?![0-9])(.*)/i
    );
    const isOptionShape = /^[\(\[]?[A-Ea-e]\s*[\.\)\]]/.test(line);
    const optMatch = line.match(/^[\(\[]?([A-Ea-e])\s*[\.\)\]]\s*(.*)/);
    const keyMatch = line.match(/^(?:kunci(?:\s+jawaban)?|jawaban|kunci)\s*[:=]\s*([A-Ea-e])/i);

    if (qMatch && !isOptionShape) {
      finalizeSoal();
      const num = parseInt(qMatch[1], 10);
      currentSoal = {
        nomor: num,
        kunciJawaban: '',
        bobot: 1,
      };
      activeOptionLetter = null;
      const cleanQText = qMatch[2].trim();
      currentPertanyaanLines = cleanQText ? [cleanQText] : [];

      if (lineImages.length > 0) {
        currentAttachedImage = lineImages[0];
        currentImagePosIndex = cleanQText ? 1 : 0;
        currentPosisiGambar = cleanQText ? 'tengah' : 'atas';
        currentImageStatus = 'ok';
      } else if (!currentAttachedImage && nextImageIdx < imageUris.length) {
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
          currentAttachedImage = imageUris[nextImageIdx++];
          currentImagePosIndex = 0;
          currentImageStatus = 'warning';
          currentImageWarning =
            'Gambar dipasangkan otomatis berdasarkan konteks teks; harap periksa kecocokan gambar dengan soal.';
          imageWarnings.push(`Soal ${num}: Periksa kecocokan gambar yang dipasangkan otomatis.`);
        }
      }
      continue;
    }

    if (optMatch && currentSoal) {
      const letter = optMatch[1].toUpperCase();
      const optText = optMatch[2].trim();

      // Prevent section heading like "B. Jawablah pertanyaan uraian berikut!" from overwriting option B
      if (
        currentPilihan[letter] &&
        /(?:jawablah|uraian|esai|essay|isian singkat|isian)/i.test(optText)
      ) {
        finalizeSoal();
        continue;
      }

      activeOptionLetter = letter;
      currentPilihan[letter] = optText || (lineImages.length > 0 ? `(Gambar Pilihan ${letter})` : '');

      if (lineImages.length > 0) {
        currentPilihanGambar[letter] = lineImages[0];
      }
      continue;
    }

    if (keyMatch && currentSoal) {
      currentSoal.kunciJawaban = keyMatch[1].toUpperCase();
      continue;
    }

    if (currentSoal) {
      if (line) {
        if (Object.keys(currentPilihan).length === 0) {
          currentPertanyaanLines.push(line);
        } else if (activeOptionLetter) {
          currentPilihan[activeOptionLetter] = `${currentPilihan[activeOptionLetter]} ${line}`.trim();
        }
      }

      if (lineImages.length > 0) {
        for (const imgUri of lineImages) {
          if (Object.keys(currentPilihan).length > 0 && activeOptionLetter) {
            if (!currentPilihanGambar[activeOptionLetter]) {
              currentPilihanGambar[activeOptionLetter] = imgUri;
            }
          } else {
            if (!currentAttachedImage) {
              currentAttachedImage = imgUri;
              currentImagePosIndex = currentPertanyaanLines.length;
              currentPosisiGambar = currentPertanyaanLines.length === 0 ? 'atas' : 'tengah';
              currentImageStatus = 'ok';
            } else {
              imageWarnings.push(
                `Soal ${soalList.length + 1} memiliki lebih dari satu gambar di naskah. Gambar tambahan tersedia di Galeri Dokumen ("Atur / Crop -> Gambar Tersedia").`
              );
            }
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
}): Promise<{
  success: boolean;
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
      return { success: true, data: json.data };
    }
    return {
      success: false,
      error: json?.error || `Server merespons status ${resp.status}`,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Gagal menghubungi server parser.' };
  }
}

/**
 * Formats AI-parsed questions into SoalUjian objects with anti-hallucination verification flags.
 */
function formatAiParsedSoalList(rawList: any[], isOcr = false): SoalUjian[] {
  return rawList.map((q: any, idx: number) => {
    const mentionsVisual = /gambar|diagram|grafik|tabel|peta|ilustrasi/i.test(q.pertanyaan || '');
    const tipe = q.tipe === 'uraian' ? 'uraian' : 'pilihan_ganda';
    return {
      id: `soal-${isOcr ? 'ocr' : 'ai'}-${Date.now()}-${idx + 1}`,
      nomor: q.nomor || idx + 1,
      tipe,
      pertanyaan: q.pertanyaan || '',
      pilihan: tipe === 'pilihan_ganda' ? q.pilihan : undefined,
      kunciJawaban: q.kunciJawaban || '',
      bobot: q.bobot || (tipe === 'uraian' ? 2 : 1),
      pedomanPenilaian: q.pedomanPenilaian,
      gambarStatus: mentionsVisual ? 'warning' : undefined,
      gambarWarning: mentionsVisual
        ? 'Soal ini merujuk pada gambar/tabel di dokumen. Gunakan "Tambah Gambar -> Gambar Tersedia / Crop" untuk melampirkannya bila belum terpasang.'
        : undefined,
      perluVerifikasi: (tipe === 'pilihan_ganda' && !q.kunciJawaban) || mentionsVisual,
      catatanVerifikasi: mentionsVisual
        ? 'Soal merujuk visual: periksa atau lampirkan gambar yang sesuai.'
        : tipe === 'pilihan_ganda' && !q.kunciJawaban
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

    // ------------------------------------------------------------------------
    // 1. WORD (.DOCX & LEGACY .DOC) PARSER
    // ------------------------------------------------------------------------
    if (filename.endsWith('.docx') || filename.endsWith('.doc')) {
      const isZip = isZipDocxBuffer(arrayBuffer);

      // Handle legacy Word 97-2003 binary (.doc that is NOT an OOXML ZIP)
      if (!isZip && filename.endsWith('.doc')) {
        const legacyText = extractReadableTextFromLegacyDoc(arrayBuffer);
        const { soalList, metadata } = parseQuestionsFromText(legacyText);

        if (soalList.length > 0) {
          const pgQuestions = soalList.filter((s) => s.tipe === 'pilihan_ganda');
          const kunciDitemukanCount = pgQuestions.filter((s) => Boolean(s.kunciJawaban)).length;
          return {
            success: true,
            judul: metadata.judul,
            mataPelajaran: metadata.mapel,
            kelas: metadata.kelas,
            petunjukUmum: metadata.petunjuk,
            soalList,
            extractedImagesCount: 0,
            failedImagesCount: 0,
            imageWarnings: [
              'Berkas terdeteksi sebagai format lama (.doc 97-2003). Untuk pembacaan gambar & tabel maksimal, disarankan menyimpannya sebagai .docx atau .pdf.',
            ],
            extractedImages: [],
            originalText: legacyText,
            kunciDitemukanCount,
            kunciBelumDitemukanCount: pgQuestions.length - kunciDitemukanCount,
            siapDiterbitkan: pgQuestions.length - kunciDitemukanCount === 0,
          };
        }

        if (legacyText.trim().length > 40) {
          const aiRes = await callBackendParserFallback({ text: legacyText, fileName: file.name });
          if (aiRes.success && aiRes.data?.soalList?.length > 0) {
            const formatted = formatAiParsedSoalList(aiRes.data.soalList, false);
            const pgQuestions = formatted.filter((s) => s.tipe === 'pilihan_ganda');
            const kunciDitemukanCount = pgQuestions.filter((s) => Boolean(s.kunciJawaban)).length;
            return {
              success: true,
              judul: aiRes.data.judul,
              mataPelajaran: aiRes.data.mataPelajaran,
              kelas: aiRes.data.kelas,
              petunjukUmum: aiRes.data.petunjukUmum,
              soalList: formatted,
              extractedImagesCount: 0,
              failedImagesCount: 0,
              imageWarnings: [],
              extractedImages: [],
              originalText: legacyText,
              kunciDitemukanCount,
              kunciBelumDitemukanCount: pgQuestions.length - kunciDitemukanCount,
              siapDiterbitkan: pgQuestions.length - kunciDitemukanCount === 0,
            };
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

      let rawDocxText = '';
      let rawDocxHtml = '';
      let htmlFailedImages = 0;

      const isNodeRuntime =
        typeof process !== 'undefined' &&
        Boolean((process as any)?.versions?.node) &&
        typeof Buffer !== 'undefined';
      const mammothInput: any = isNodeRuntime
        ? { buffer: Buffer.from(arrayBuffer) }
        : { arrayBuffer };

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

      // Direct OOXML fallback via JSZip if mammoth did not yield readable text
      if (!rawDocxText || rawDocxText.trim().length < 10) {
        try {
          const fallbackZip = await JSZip.loadAsync(arrayBuffer);
          const docXmlFile = fallbackZip.file('word/document.xml');
          if (docXmlFile) {
            const docXml = await docXmlFile.async('string');
            const cleanXmlText = (chunk: string) =>
              chunk
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

            const outBlocks: string[] = [];
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
                  outBlocks.push(`\n[[TABLE_HTML:<table><tbody>${rowsHtml.join('')}</tbody></table>]]\n`);
                }
              } else {
                const txt = cleanXmlText(block);
                if (txt) outBlocks.push(txt);
              }
            }
            const xmlDerivedText = outBlocks.join('\n').trim();
            if (xmlDerivedText.length > rawDocxText.trim().length) {
              rawDocxText = xmlDerivedText;
            }
          }
        } catch (xmlErr) {
          console.warn('[DocxParser] OOXML direct fallback warning:', xmlErr);
        }
      }

      const { soalList, metadata, imageWarnings, failedImagesCount: lineFailedImages } =
        parseQuestionsFromText(rawDocxText, imageMap);

      const allWarnings = Array.from(new Set([...zipWarnings, ...imageWarnings]));
      const totalFailedImages = zipFailedCount + htmlFailedImages + lineFailedImages;
      const attachedImageCount = soalList.reduce(
        (acc, q) => acc + (q.gambar ? 1 : 0) + (q.pilihanGambar ? Object.keys(q.pilihanGambar).length : 0),
        0
      );
      const totalExtractedImages = Math.max(docxAssets.length, attachedImageCount);

      if (soalList.length > 0) {
        const pgQuestions = soalList.filter((s) => s.tipe === 'pilihan_ganda');
        const kunciDitemukanCount = pgQuestions.filter((s) => Boolean(s.kunciJawaban)).length;
        const kunciBelumDitemukanCount = pgQuestions.length - kunciDitemukanCount;

        return {
          success: true,
          judul: metadata.judul,
          mataPelajaran: metadata.mapel,
          kelas: metadata.kelas,
          petunjukUmum: metadata.petunjuk,
          soalList,
          extractedImagesCount: totalExtractedImages,
          failedImagesCount: totalFailedImages,
          imageWarnings: allWarnings,
          extractedImages: docxAssets,
          originalText: rawDocxText.replace(/\[\[IMAGE_DATA:[^\]]+\]\]/g, '[Gambar Tersemat]'),
          originalHtml: rawDocxHtml,
          kunciDitemukanCount,
          kunciBelumDitemukanCount,
          siapDiterbitkan: kunciBelumDitemukanCount === 0,
        };
      }

      // Smart AI text fallback when DOCX uses custom/unusual numbering format
      if (rawDocxText.trim().length > 20) {
        const cleanTextForAi = rawDocxText.replace(/\[\[IMAGE_DATA:[^\]]+\]\]/g, '[GAMBAR]');
        const aiRes = await callBackendParserFallback({
          text: cleanTextForAi,
          fileName: file.name,
        });
        if (aiRes.success && aiRes.data?.soalList?.length > 0) {
          const formatted = formatAiParsedSoalList(aiRes.data.soalList, false);
          const pgQuestions = formatted.filter((s) => s.tipe === 'pilihan_ganda');
          const kunciDitemukanCount = pgQuestions.filter((s) => Boolean(s.kunciJawaban)).length;
          return {
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
                    ...allWarnings,
                    `Terdapat ${docxAssets.length} gambar di dokumen Word. Silakan cek kecocokannya atau pasang lewat "+ Tambah Gambar -> Gambar Tersedia".`,
                  ]
                : allWarnings,
            extractedImages: docxAssets,
            originalText: rawDocxText.replace(/\[\[IMAGE_DATA:[^\]]+\]\]/g, '[Gambar Tersemat]'),
            originalHtml: rawDocxHtml,
            kunciDitemukanCount,
            kunciBelumDitemukanCount: pgQuestions.length - kunciDitemukanCount,
            siapDiterbitkan: pgQuestions.length - kunciDitemukanCount === 0,
          };
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
            ? 'Dokumen Word kosong atau hanya berisi gambar tanpa teks soal yang terbaca. Pastikan file .docx berisi teks soal (bukan gambar hasil screenshot yang ditempel ke Word).'
            : 'Tidak ditemukan butir soal yang dapat dikenali dalam dokumen Word ini. Pastikan format nomor soal jelas (misal 1., 2.) dan pilihan ganda (A., B., C., D.).',
      };
    }

    // ------------------------------------------------------------------------
    // 2. PDF PARSER (pdfjs-dist text + embedded images + AI/OCR fallback)
    // ------------------------------------------------------------------------
    if (filename.endsWith('.pdf')) {
      const {
        text: pdfText,
        pageCount,
        assets: pdfAssets,
        failedImagesCount: pdfImgFailed,
        imageWarnings: pdfImgWarnings,
      } = await extractFromPdf(arrayBuffer);

      const cleanDigitalText = pdfText
        .replace(/\[---\s*HALAMAN\s+\d+\s*---\]/g, '')
        .replace(/\[\[IMAGE_DATA:[^\]]+\]\]/g, '')
        .trim();
      const rasterAssetsOnly = pdfAssets.filter((a) => a.source === 'pdf');

      // 2a. Local deterministic text extraction
      if (cleanDigitalText.length > 30) {
        const { soalList, metadata, imageWarnings: parseImgWarnings, failedImagesCount: parseFailed } =
          parseQuestionsFromText(pdfText);

        if (soalList.length > 0) {
          const allWarnings = Array.from(new Set([...pdfImgWarnings, ...parseImgWarnings]));
          if (rasterAssetsOnly.length > 0) {
            allWarnings.push(
              `Ditemukan ${rasterAssetsOnly.length} gambar di PDF. Harap periksa kecocokan posisi gambar pada masing-masing soal sebelum menerbitkan.`
            );
          }

          const pgQuestions = soalList.filter((s) => s.tipe === 'pilihan_ganda');
          const kunciDitemukanCount = pgQuestions.filter((s) => Boolean(s.kunciJawaban)).length;
          const kunciBelumDitemukanCount = pgQuestions.length - kunciDitemukanCount;

          return {
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
            kunciDitemukanCount,
            kunciBelumDitemukanCount,
            siapDiterbitkan: kunciBelumDitemukanCount === 0,
          };
        }

        // 2b. Digital PDF text exists, but layout/numbering needs AI structuring fallback
        const textFallbackRes = await callBackendParserFallback({
          text: cleanDigitalText,
          fileName: file.name,
        });
        if (textFallbackRes.success && textFallbackRes.data?.soalList?.length > 0) {
          const formatted = formatAiParsedSoalList(textFallbackRes.data.soalList, false);
          const pgQuestions = formatted.filter((s) => s.tipe === 'pilihan_ganda');
          const kunciDitemukanCount = pgQuestions.filter((s) => Boolean(s.kunciJawaban)).length;
          return {
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
            kunciDitemukanCount,
            kunciBelumDitemukanCount: pgQuestions.length - kunciDitemukanCount,
            siapDiterbitkan: pgQuestions.length - kunciDitemukanCount === 0,
          };
        }
      }

      // 2c. Scanned PDF or client PDF worker unavailable -> Multimodal PDF OCR via backend
      const scanWarnings = [
        ...pdfImgWarnings,
        'Dokumen PDF diproses melalui pembacaan visual/OCR. Jika soal memiliki gambar atau diagram, halaman PDF tersedia di "Atur / Crop -> Gambar Tersedia".',
      ];

      const uint8Array = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < uint8Array.byteLength; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const fileBase64 = typeof btoa !== 'undefined' ? btoa(binary) : Buffer.from(uint8Array).toString('base64');

      const ocrRes = await callBackendParserFallback({
        fileBase64,
        fileName: file.name,
        mimeType: 'application/pdf',
      });

      if (ocrRes.success && ocrRes.data && Array.isArray(ocrRes.data.soalList) && ocrRes.data.soalList.length > 0) {
        const formattedSoalList = formatAiParsedSoalList(ocrRes.data.soalList, true);
        const pgQuestions = formattedSoalList.filter((s) => s.tipe === 'pilihan_ganda');
        const kunciDitemukanCount = pgQuestions.filter((s) => Boolean(s.kunciJawaban)).length;
        const kunciBelumDitemukanCount = pgQuestions.length - kunciDitemukanCount;

        return {
          success: true,
          judul: ocrRes.data.judul,
          mataPelajaran: ocrRes.data.mataPelajaran,
          kelas: ocrRes.data.kelas,
          petunjukUmum: ocrRes.data.petunjukUmum,
          soalList: formattedSoalList,
          extractedImagesCount: rasterAssetsOnly.length,
          failedImagesCount: pdfImgFailed,
          imageWarnings: Array.from(new Set(scanWarnings)),
          extractedImages: pdfAssets,
          originalText: cleanDigitalText || 'Dokumen PDF Hasil Scan (OCR Diterapkan)',
          pageCount,
          kunciDitemukanCount,
          kunciBelumDitemukanCount,
          siapDiterbitkan: kunciBelumDitemukanCount === 0,
        };
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
            : `PDF tidak memuat teks digital (kemungkinan hasil scan gambar) dan OCR otomatis belum berhasil${ocrRes.error ? `: ${ocrRes.error}` : ''}. Pastikan GEMINI_API_KEY aktif untuk PDF scan, atau gunakan file Word (.docx) / PDF teks digital.`,
      };
    }

    // ------------------------------------------------------------------------
    // 3. TEXT / CSV / OTHER GENERIC FILES
    // ------------------------------------------------------------------------
    const textDecoder = new TextDecoder('utf-8');
    const rawText = textDecoder.decode(arrayBuffer);
    const { soalList, metadata, imageWarnings, failedImagesCount } = parseQuestionsFromText(rawText);

    const pgQuestions = soalList.filter((s) => s.tipe === 'pilihan_ganda');
    const kunciDitemukanCount = pgQuestions.filter((s) => Boolean(s.kunciJawaban)).length;
    const kunciBelumDitemukanCount = pgQuestions.length - kunciDitemukanCount;

    return {
      success: soalList.length > 0,
      judul: metadata.judul,
      mataPelajaran: metadata.mapel,
      kelas: metadata.kelas,
      soalList,
      extractedImagesCount: 0,
      failedImagesCount,
      imageWarnings,
      extractedImages: [],
      originalText: rawText,
      kunciDitemukanCount,
      kunciBelumDitemukanCount,
      siapDiterbitkan: kunciBelumDitemukanCount === 0,
      error:
        soalList.length === 0
          ? 'Format dokumen belum memiliki struktur nomor soal yang terbaca.'
          : undefined,
    };
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
