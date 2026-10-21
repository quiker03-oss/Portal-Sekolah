import JSZip from 'jszip';
import { SoalUjian } from '../types';

export interface SafeFetchResponse<T = any> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  isHtml?: boolean;
}

/**
 * Safely fetches a URL and parses JSON response.
 * Completely prevents "Unexpected token 'T', "The page c"... is not valid JSON" errors
 * by checking HTTP status, content-type, and reading response as text first before JSON parsing.
 */
export async function safeFetchJson<T = any>(
  url: string,
  options?: RequestInit,
  timeoutMs: number = 75000
): Promise<SafeFetchResponse<T>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchOptions: RequestInit = {
      ...options,
      signal: controller.signal,
    };

    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);

    const status = response.status;
    const contentType = (response.headers.get('content-type') || '').toLowerCase();

    // 1. Read response body safely as text first
    let rawText = '';
    try {
      rawText = await response.text();
    } catch (readErr: any) {
      return {
        ok: false,
        status,
        error: `Gagal membaca isi balasan dari server: ${readErr?.message || 'Read error'}`,
      };
    }

    const trimmed = rawText.trim();

    // 2. Empty response handling
    if (!trimmed) {
      if (!response.ok) {
        return {
          ok: false,
          status,
          error: `Server mengembalikan status HTTP ${status} (${response.statusText || 'Error'}) tanpa pesan balasan.`,
        };
      }
      return {
        ok: false,
        status,
        error: 'Server mengembalikan respons kosong.',
      };
    }

    // 3. HTML response or Vercel edge error detection
    const isHtml =
      contentType.includes('text/html') ||
      trimmed.startsWith('<!DOCTYPE') ||
      trimmed.startsWith('<html') ||
      trimmed.startsWith('The page could not be found') ||
      trimmed.includes('The page could not be found') ||
      trimmed.includes('504: GATEWAY_TIMEOUT') ||
      trimmed.includes('FUNCTION_INVOCATION_TIMEOUT') ||
      trimmed.includes('413: FUNCTION_PAYLOAD_TOO_LARGE') ||
      trimmed.includes('Vercel') && trimmed.includes('error');

    if (isHtml) {
      console.warn(`[API Diagnostic] Server returned HTML / edge error for ${url}: status ${status}`);

      let friendlyMsg = '';
      if (status === 404) {
        friendlyMsg =
          `Endpoint ${url} tidak ditemukan di server Vercel (HTTP 404). ` +
          `Pastikan fungsi Vercel Serverless pada folder /api sudah terdeploy dengan benar dan file vercel.json sudah aktif di repositori.`;
      } else if (status === 413 || trimmed.includes('PAYLOAD_TOO_LARGE')) {
        friendlyMsg =
          `Ukuran dokumen melebihi batas unggah server Vercel (HTTP 413: Payload Too Large, batas maksimal 4.5 MB). ` +
          `Silakan kompres gambar di dalam dokumen Word/PDF atau gunakan berkas berukuran lebih kecil.`;
      } else if (status === 504 || trimmed.includes('GATEWAY_TIMEOUT') || trimmed.includes('TIMEOUT')) {
        friendlyMsg =
          `Waktu proses server Vercel habis (HTTP 504: Gateway Timeout). ` +
          `Analisis dokumen membutuhkan waktu lebih dari batas serverless Vercel (10-60 detik). Silakan coba lagi atau gunakan dokumen yang lebih ringkas.`;
      } else if (status >= 500) {
        friendlyMsg =
          `Server Vercel mengalami kendala internal (HTTP ${status}). ` +
          `Pastikan environment variable GEMINI_API_KEY sudah ditambahkan pada Project Settings > Environment Variables di dashboard Vercel Anda.`;
      } else {
        friendlyMsg =
          `Server mengembalikan halaman web (HTML), bukan data JSON (HTTP ${status}). ` +
          `Kemungkinan URL endpoint salah atau routing server belum aktif.`;
      }

      return {
        ok: false,
        status,
        isHtml: true,
        error: friendlyMsg,
      };
    }

    // 4. Parse JSON safely
    let parsed: any;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      console.warn(`[API Diagnostic] Failed to parse JSON from ${url}:`, trimmed.slice(0, 150));
      let errorMsg = `Format balasan dari server bukan data JSON yang valid (HTTP ${status}).`;
      if (status >= 500) {
        errorMsg = `Server backend mengalami kendala internal (HTTP ${status}). Pastikan variabel lingkungan GEMINI_API_KEY sudah disetel di menu Project Settings > Environment Variables pada deployment Vercel Anda.`;
      } else if (trimmed.length > 0 && trimmed.length < 180) {
        errorMsg = `Respon server (HTTP ${status}): ${trimmed}`;
      }
      return {
        ok: false,
        status,
        error: errorMsg,
      };
    }

    // 5. Check if HTTP status indicates error
    if (!response.ok) {
      const serverErrMsg =
        parsed?.error || parsed?.message || `Terjadi kesalahan pada server (HTTP ${status}).`;
      return {
        ok: false,
        status,
        data: parsed,
        error: serverErrMsg,
      };
    }

    // 6. Check if backend returned success: false
    if (parsed && typeof parsed === 'object' && parsed.success === false) {
      return {
        ok: false,
        status,
        data: parsed,
        error: parsed.error || 'Server menolak pemrosesan dokumen.',
      };
    }

    return {
      ok: true,
      status,
      data: parsed,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === 'AbortError') {
      return {
        ok: false,
        status: 408,
        error:
          'Waktu permintaan habis (Timeout). Proses analisis dokumen dengan AI memakan waktu lebih lama dari batas tunggu. Silakan periksa koneksi atau coba berkas yang lebih ringkas.',
      };
    }
    return {
      ok: false,
      status: 0,
      error:
        `Gagal terhubung ke server (${err?.message || 'Koneksi terputus'}). ` +
        `Pastikan perangkat terhubung ke internet.`,
    };
  }
}

/**
 * Client-side extractor for Word (.docx) files using JSZip.
 * Extracts paragraphs and embedded images directly in the browser.
 */
export async function extractDocxInBrowser(file: File): Promise<{
  text: string;
  paragraphs: { text: string; imageUri?: string; imageUris?: string[] }[];
  mediaImages: { [key: string]: string };
  imageMarkerMap: { [marker: string]: string };
}> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // Extract relationship mappings for images
  const relsFile = zip.file('word/_rels/document.xml.rels');
  const relsMap: { [rId: string]: string } = {};
  if (relsFile) {
    const relsXml = await relsFile.async('string');
    const relMatches = relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g);
    for (const m of relMatches) {
      relsMap[m[1]] = m[2];
    }
  }

  // Normalize path helper for reliable cross-matching
  const normalizePath = (p: string): string => {
    return p.replace(/^(\.\.\/)+/, '').replace(/^\//, '').replace(/^word\//, '').toLowerCase().trim();
  };

  // Extract embedded media images as base64 data URIs
  const mediaImages: { [mediaPath: string]: string } = {};
  const mediaFiles = zip.file(/(?:^|\/)media\//);
  for (const f of mediaFiles) {
    const ext = f.name.split('.').pop()?.toLowerCase() || 'png';
    let mime = 'image/png';
    if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
    else if (ext === 'gif') mime = 'image/gif';
    else if (ext === 'webp') mime = 'image/webp';
    else if (ext === 'svg') mime = 'image/svg+xml';
    else if (ext === 'bmp') mime = 'image/bmp';
    else if (ext === 'emf') mime = 'image/x-emf';
    else if (ext === 'wmf') mime = 'image/x-wmf';

    const b64 = await f.async('base64');
    const dataUri = `data:${mime};base64,${b64}`;
    const relativePath = f.name.replace(/^(?:word|ppt)\//, '');
    const baseName = f.name.split('/').pop() || f.name;

    mediaImages[f.name] = dataUri;
    mediaImages[f.name.toLowerCase()] = dataUri;
    mediaImages[relativePath] = dataUri;
    mediaImages[relativePath.toLowerCase()] = dataUri;
    mediaImages[baseName] = dataUri;
    mediaImages[baseName.toLowerCase()] = dataUri;
    mediaImages[normalizePath(f.name)] = dataUri;
    mediaImages[normalizePath(relativePath)] = dataUri;
  }

  const docFile = zip.file('word/document.xml');
  if (!docFile) {
    throw new Error('File Word (.docx) tidak memiliki berkas dokumen utama (word/document.xml).');
  }
  const docXml = await docFile.async('string');

  // Helper to extract image URIs from an XML fragment
  const getImagesFromFragment = (frag: string): string[] => {
    const uris: string[] = [];
    const rIdMatches = [...frag.matchAll(/(?:[a-zA-Z0-9_]+:)?(?:embed|id|link|src|href)="([^"]+)"/g)];
    for (const rMatch of rIdMatches) {
      const rId = rMatch[1];
      const target = relsMap[rId];
      if (target) {
        const norm = normalizePath(target);
        const foundUri =
          mediaImages[target] ||
          mediaImages[target.toLowerCase()] ||
          mediaImages[norm] ||
          mediaImages[target.split('/').pop()?.toLowerCase() || ''];
        if (foundUri && !uris.includes(foundUri)) {
          uris.push(foundUri);
        }
      }
    }
    return uris;
  };

  // Helper to extract text from w:t and m:t (formulas / math)
  const getTextFromFragment = (frag: string): string => {
    const textMatches = frag.match(/<[wm]:t[^>]*>(.*?)<\/[wm]:t>/g);
    if (!textMatches) return '';
    return textMatches.map((t) => t.replace(/<[^>]+>/g, '')).join('');
  };

  const paragraphs: { text: string; imageUri?: string; imageUris?: string[] }[] = [];
  const imageMarkerMap: { [marker: string]: string } = {};
  let imgIndex = 1;
  const formattedLines: string[] = [];

  // Parse top-level blocks: <w:p> and <w:tbl>
  const blockRegex = /<(w:p|w:tbl)[^>]*>([\s\S]*?)<\/\1>/g;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = blockRegex.exec(docXml)) !== null) {
    const tag = blockMatch[1];
    const content = blockMatch[2];

    if (tag === 'w:p') {
      const imageUris = getImagesFromFragment(content);
      const text = getTextFromFragment(content).trim();
      if (text || imageUris.length > 0) {
        paragraphs.push({ text, imageUri: imageUris[0], imageUris });
        let line = text;
        if (imageUris.length > 0) {
          const markers = imageUris.map((uri) => {
            const marker = `[[IMAGE_SOAL_${imgIndex++}]]`;
            imageMarkerMap[marker] = uri;
            return marker;
          });
          line = `${line} ${markers.join(' ')}`.trim();
        }
        if (line) {
          formattedLines.push(line);
        }
      }
    } else if (tag === 'w:tbl') {
      const tableImageUris = getImagesFromFragment(content);
      const rows: string[][] = [];
      const trRegex = /<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g;
      let trMatch: RegExpExecArray | null;

      while ((trMatch = trRegex.exec(content)) !== null) {
        const cells: string[] = [];
        const tcRegex = /<w:tc[^>]*>([\s\S]*?)<\/w:tc>/g;
        let tcMatch: RegExpExecArray | null;

        while ((tcMatch = tcRegex.exec(trMatch[1])) !== null) {
          cells.push(getTextFromFragment(tcMatch[1]).trim());
        }
        if (cells.length > 0) {
          rows.push(cells);
        }
      }

      if (rows.length > 0) {
        let mdTable = rows.map((r) => '| ' + r.join(' | ') + ' |').join('\n');
        if (rows.length > 1) {
          const sep = '| ' + rows[0].map(() => '---').join(' | ') + ' |';
          const lines = mdTable.split('\n');
          lines.splice(1, 0, sep);
          mdTable = lines.join('\n');
        }

        if (tableImageUris.length > 0) {
          const markers = tableImageUris.map((uri) => {
            const marker = `[[IMAGE_SOAL_${imgIndex++}]]`;
            imageMarkerMap[marker] = uri;
            return marker;
          });
          mdTable = `${mdTable}\n${markers.join(' ')}`;
        }

        paragraphs.push({ text: mdTable, imageUri: tableImageUris[0], imageUris: tableImageUris });
        formattedLines.push(mdTable);
      }
    }
  }

  // Fallback if no blocks matched
  if (formattedLines.length === 0) {
    const pMatches = docXml.split(/<\/w:p>/g);
    for (const p of pMatches) {
      const imageUris = getImagesFromFragment(p);
      const text = getTextFromFragment(p).trim();
      if (text || imageUris.length > 0) {
        paragraphs.push({ text, imageUri: imageUris[0], imageUris });
        let line = text;
        if (imageUris.length > 0) {
          const markers = imageUris.map((uri) => {
            const marker = `[[IMAGE_SOAL_${imgIndex++}]]`;
            imageMarkerMap[marker] = uri;
            return marker;
          });
          line = `${line} ${markers.join(' ')}`.trim();
        }
        if (line) {
          formattedLines.push(line);
        }
      }
    }
  }

  const plainText = formattedLines.join('\n');
  return { text: plainText, paragraphs, mediaImages, imageMarkerMap };
}

/**
 * Emergency local rule-based question parser.
 * Extracts questions, multiple choice options (A, B, C, D), and answer keys
 * purely client-side without needing an AI server.
 * Preserves images by associating markers or map references with questions.
 */
export function parseQuestionsWithRegex(
  rawText: string,
  imageMap?: Record<string, string>
): SoalUjian[] {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const questions: SoalUjian[] = [];
  let currentSoal: Partial<SoalUjian> | null = null;
  let currentPilihan: Record<string, string> = {};
  let currentImages: string[] = [];

  const extractImagesFromText = (text: string): { cleanText: string; images: string[] } => {
    let clean = text;
    const foundImages: string[] = [];
    if (imageMap) {
      for (const [marker, uri] of Object.entries(imageMap)) {
        if (clean.includes(marker)) {
          if (!foundImages.includes(uri)) {
            foundImages.push(uri);
          }
          clean = clean.split(marker).join('').trim();
        }
      }
    }
    return { cleanText: clean, images: foundImages };
  };

  const finalizeCurrent = () => {
    if (currentSoal && currentSoal.pertanyaan) {
      const { cleanText, images } = extractImagesFromText(currentSoal.pertanyaan);
      const allImages = [...currentImages, ...images].filter(
        (val, idx, self) => self.indexOf(val) === idx
      );

      const hasOptions = Object.keys(currentPilihan).length > 0;
      questions.push({
        id: `soal-local-${Date.now()}-${questions.length + 1}`,
        nomor: questions.length + 1,
        tipe: hasOptions ? 'pilihan_ganda' : 'esai',
        pertanyaan: cleanText.trim(),
        pilihan: hasOptions ? { ...currentPilihan } : undefined,
        kunciJawaban: currentSoal.kunciJawaban || '',
        bobot: 1,
        gambar: allImages.length > 0 ? allImages[0] : undefined,
        gambarList: allImages.length > 0 ? allImages : undefined,
        perluVerifikasi: !currentSoal.kunciJawaban,
        catatanVerifikasi: !currentSoal.kunciJawaban
          ? 'Kunci jawaban belum terdeteksi. Silakan periksa kunci jawaban.'
          : undefined,
      });
    }
    currentSoal = null;
    currentPilihan = {};
    currentImages = [];
  };

  for (const line of lines) {
    // Check if line contains standalone image markers
    const { cleanText: lineWithoutMarkers, images: lineImages } = extractImagesFromText(line);
    if (lineImages.length > 0) {
      currentImages.push(...lineImages);
    }

    // 1. Detect question number start (e.g., "1. ", "1) ", "Soal 1: ")
    const numMatch = lineWithoutMarkers.match(/^(?:Soal\s*)?(\d+)[\.\)]\s*(.+)/i);
    if (numMatch) {
      finalizeCurrent();
      currentSoal = {
        nomor: parseInt(numMatch[1], 10),
        pertanyaan: numMatch[2],
      };
      if (lineImages.length > 0) {
        currentImages.push(...lineImages);
      }
      continue;
    }

    // 2. Detect multiple choice option (e.g., "A. ", "a. ", "A) ")
    const optMatch = lineWithoutMarkers.match(/^([A-Ea-e])[\.\)]\s*(.+)/);
    if (optMatch && currentSoal) {
      const optLetter = optMatch[1].toUpperCase();
      currentPilihan[optLetter] = optMatch[2].trim();
      continue;
    }

    // 3. Detect answer key (e.g., "Kunci: A", "Kunci Jawaban: B", "Jawaban: C")
    const keyMatch = lineWithoutMarkers.match(/^(?:Kunci(?:\s+Jawaban)?|Jawaban)\s*[:=]\s*([A-Ea-e])/i);
    if (keyMatch && currentSoal) {
      currentSoal.kunciJawaban = keyMatch[1].toUpperCase();
      continue;
    }

    // 4. Continued question text, table, or stimulus
    if (currentSoal) {
      if (Object.keys(currentPilihan).length === 0) {
        currentSoal.pertanyaan = `${currentSoal.pertanyaan || ''}\n${line}`;
      }
    }
  }

  finalizeCurrent();
  return questions;
}
