import { ExtractedImageAsset, ParseDocumentResult, convertHtmlTablesToMarkdown, finalizeValidatedParseResult, parseQuestionsFromText } from '../services/examDocumentParser';

export interface ClipboardExtractionResult {
  htmlFragment: string;
  convertedImageCount: number;
  unresolvedLocalImagesCount: number;
  warnings: string[];
}

export interface PasteParseExamResult extends ParseDocumentResult {
  unresolvedImagesCount: number;
}

export function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Gagal membaca data gambar ke Data URI.'));
      }
    };
    reader.onerror = () => reject(new Error('FileReader gagal memproses gambar.'));
    reader.readAsDataURL(blob);
  });
}

export async function convertImageSrcToDataUri(src: string): Promise<string | null> {
  const clean = (src || '').trim();
  if (!clean) return null;
  if (clean.startsWith('data:image/')) return clean;

  // Local file:// or Word cid: cannot be fetched by browser security sandbox
  if (/^(?:file:|cid:|ms-appx:|webkit-fake-url:)/i.test(clean)) {
    return null;
  }

  if (clean.startsWith('blob:')) {
    try {
      const resp = await fetch(clean);
      if (!resp.ok) return null;
      const blob = await resp.blob();
      if (!blob.type.startsWith('image/')) return null;
      return await readBlobAsDataUrl(blob);
    } catch {
      return null;
    }
  }

  if (/^https?:\/\//i.test(clean)) {
    try {
      const resp = await fetch(clean);
      if (resp.ok) {
        const blob = await resp.blob();
        if (blob.type.startsWith('image/')) {
          return await readBlobAsDataUrl(blob);
        }
      }
    } catch {
      // Fall back to permanent remote URL if CORS blocks fetch
    }
    return clean;
  }

  return null;
}

/**
 * Extracts binary images + rich HTML/text from browser ClipboardData,
 * turning blob:/binary images into permanent Data URIs ready for Storage upload.
 */
export async function extractPasteDataFromClipboard(
  clipboardData: DataTransfer
): Promise<ClipboardExtractionResult> {
  const warnings: string[] = [];
  let convertedImageCount = 0;
  let unresolvedLocalImagesCount = 0;

  // 1. Collect binary image files from clipboard (Windows Snip, Android Gboard, Word single-image copy, Docs)
  const imageFiles: File[] = [];
  const seenKeys = new Set<string>();

  if (clipboardData.items && clipboardData.items.length > 0) {
    for (let i = 0; i < clipboardData.items.length; i++) {
      const item = clipboardData.items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const sig = `${file.size}_${file.type}_${file.name}`;
          if (!seenKeys.has(sig)) {
            seenKeys.add(sig);
            imageFiles.push(file);
          }
        }
      }
    }
  }

  if (clipboardData.files && clipboardData.files.length > 0) {
    for (let i = 0; i < clipboardData.files.length; i++) {
      const file = clipboardData.files[i];
      if (file.type.startsWith('image/')) {
        const sig = `${file.size}_${file.type}_${file.name}`;
        if (!seenKeys.has(sig)) {
          seenKeys.add(sig);
          imageFiles.push(file);
        }
      }
    }
  }

  const binaryImageDataUrls: string[] = [];
  for (const f of imageFiles) {
    try {
      const dataUrl = await readBlobAsDataUrl(f);
      if (dataUrl.startsWith('data:image/')) {
        binaryImageDataUrls.push(dataUrl);
      }
    } catch {
      // ignore failed individual image conversion
    }
  }

  const rawHtml = clipboardData.getData('text/html') || '';
  const rawText = clipboardData.getData('text/plain') || '';

  if (rawHtml.trim() && typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');

    // Remove Word/Docs stylesheet noise & comments
    doc.querySelectorAll('style, script, meta, link, title, xml, o\\:p').forEach((el) => {
      if (el.tagName.toLowerCase() === 'o:p') {
        el.replaceWith(doc.createTextNode(' '));
      } else {
        el.remove();
      }
    });

    let binaryCursor = 0;
    const imgElements = Array.from(doc.body.querySelectorAll('img'));

    for (const img of imgElements) {
      const rawSrc = img.getAttribute('src') || '';
      const resolved = await convertImageSrcToDataUri(rawSrc);

      if (resolved) {
        img.setAttribute('src', resolved);
        img.setAttribute('style', 'max-width: 100%; max-height: 280px; border-radius: 8px; margin: 6px 0; display: block;');
        convertedImageCount++;
      } else if (binaryCursor < binaryImageDataUrls.length) {
        // Word often puts file:/// in HTML alongside a single PNG in clipboardData.files
        img.setAttribute('src', binaryImageDataUrls[binaryCursor++]);
        img.setAttribute('style', 'max-width: 100%; max-height: 280px; border-radius: 8px; margin: 6px 0; display: block;');
        convertedImageCount++;
      } else {
        unresolvedLocalImagesCount++;
        const placeholder = doc.createElement('div');
        placeholder.setAttribute('data-unresolved-image', 'true');
        placeholder.setAttribute(
          'style',
          'padding: 8px 12px; margin: 6px 0; border-radius: 8px; border: 1px dashed #d97706; background: #fffbeb; color: #b45309; font-size: 12px;'
        );
        placeholder.textContent =
          '⚠ Gambar lokal (file://) tidak ikut terbawa oleh clipboard sistem. Klik "+ Sisipkan Gambar" di sini untuk menempelkan gambar.';
        img.replaceWith(placeholder);
      }
    }

    // Append any leftover binary images not mapped to <img> tags
    while (binaryCursor < binaryImageDataUrls.length) {
      const p = doc.createElement('p');
      const img = doc.createElement('img');
      img.setAttribute('src', binaryImageDataUrls[binaryCursor++]);
      img.setAttribute('alt', 'Gambar dari Clipboard');
      img.setAttribute('style', 'max-width: 100%; max-height: 280px; border-radius: 8px; margin: 6px 0; display: block;');
      p.appendChild(img);
      doc.body.appendChild(p);
      convertedImageCount++;
    }

    // Clean excessive inline styles while preserving basic formatting & structure
    doc.body.querySelectorAll('*').forEach((el) => {
      const tag = el.tagName.toLowerCase();
      if (tag === 'img' || el.hasAttribute('data-unresolved-image')) return;
      el.removeAttribute('class');
      if (tag !== 'table' && tag !== 'td' && tag !== 'th') {
        el.removeAttribute('style');
      } else if (tag === 'table') {
        el.setAttribute('style', 'border-collapse: collapse; width: 100%; margin: 8px 0;');
      } else {
        el.setAttribute('style', 'border: 1px solid #cbd5e1; padding: 6px 10px;');
      }
    });

    if (unresolvedLocalImagesCount > 0) {
      warnings.push(
        `${unresolvedLocalImagesCount} gambar lokal (file://) dari dokumen sumber diblokir oleh kebijakan keamanan browser saat di-paste. Silakan sisipkan gambar manual menggunakan tombol "+ Sisipkan Gambar" atau gunakan Cara 1 (Upload Dokumen .docx/.pdf).`
      );
    }

    return {
      htmlFragment: doc.body.innerHTML,
      convertedImageCount,
      unresolvedLocalImagesCount,
      warnings,
    };
  }

  // Fallback to plain text + binary images
  const parts: string[] = [];
  if (rawText.trim()) {
    const escapedLines = rawText
      .split(/\r?\n/)
      .map((line) =>
        `<p>${line
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</p>`
      );
    parts.push(...escapedLines);
  }

  for (const dataUrl of binaryImageDataUrls) {
    parts.push(
      `<p><img src="${dataUrl}" alt="Gambar dari Clipboard" style="max-width: 100%; max-height: 280px; border-radius: 8px; margin: 6px 0; display: block;" /></p>`
    );
    convertedImageCount++;
  }

  return {
    htmlFragment: parts.join(''),
    convertedImageCount,
    unresolvedLocalImagesCount,
    warnings,
  };
}

/**
 * Parses HTML from the rich contentEditable paste area into structured SoalUjian objects
 * with inline stem images, choice images, tables, formulas, and all 4 question types.
 */
export function parseContentEditableHtmlToExam(rawHtml: string): PasteParseExamResult {
  const inputHtml = (rawHtml || '').trim();
  if (!inputHtml) {
    return {
      success: false,
      soalList: [],
      error: 'Area tempel soal masih kosong. Silakan paste teks & gambar soal terlebih dahulu.',
      extractedImagesCount: 0,
      failedImagesCount: 0,
      imageWarnings: [],
      extractedImages: [],
      kunciDitemukanCount: 0,
      kunciBelumDitemukanCount: 0,
      siapDiterbitkan: false,
      unresolvedImagesCount: 0,
    };
  }

  // Detect & strip unresolved placeholder warnings before table/question parsing
  const unresolvedMatches = inputHtml.match(/data-unresolved-image=["']true["']/gi) || [];
  const unresolvedImagesCount = unresolvedMatches.length;
  const cleanedHtml = inputHtml.replace(
    /<div[^>]*data-unresolved-image=["']true["'][^>]*>[\s\S]*?<\/div>/gi,
    '\n[[IMAGE_ERROR:Gambar lokal clipboard (file://) belum tersisip — harap tambahkan gambar secara manual.]]\n'
  );

  // Convert HTML tables, <ol> numbering, and <img> tags into structured parser lines
  const { textWithTables, extractedImageUrls, failedImageCount } = convertHtmlTablesToMarkdown(cleanedHtml);

  const normalizedLinesText = textWithTables
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n');

  const parsed = parseQuestionsFromText(normalizedLinesText);

  const extractedImages: ExtractedImageAsset[] = extractedImageUrls.map((url, idx) => ({
    id: `clip-img-${Date.now()}-${idx + 1}`,
    url,
    label: `Gambar Clipboard #${idx + 1}`,
    source: 'clipboard',
  }));

  const combinedWarnings = [...parsed.imageWarnings];
  if (unresolvedImagesCount > 0) {
    combinedWarnings.unshift(
      `${unresolvedImagesCount} gambar lokal clipboard (file://) tidak dapat diakses otomatis. Harap sisipkan ulang gambar yang bersangkutan pada editor.`
    );
  }

  const baseResult = finalizeValidatedParseResult(
    {
      success: parsed.soalList.length > 0,
      judul: parsed.metadata.judul,
      mataPelajaran: parsed.metadata.mapel,
      kelas: parsed.metadata.kelas,
      petunjukUmum: parsed.metadata.petunjuk,
      soalList: parsed.soalList,
      extractedImagesCount: extractedImageUrls.length,
      failedImagesCount: parsed.failedImagesCount + failedImageCount,
      imageWarnings: combinedWarnings,
      extractedImages,
      originalText: normalizedLinesText,
      originalHtml: cleanedHtml,
    },
    normalizedLinesText
  );

  return {
    ...baseResult,
    unresolvedImagesCount,
  };
}
