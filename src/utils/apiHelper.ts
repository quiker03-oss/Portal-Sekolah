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
  paragraphs: { text: string; imageUri?: string }[];
  mediaImages: { [key: string]: string };
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

  // Extract embedded media images as base64 data URIs
  const mediaImages: { [mediaPath: string]: string } = {};
  const mediaFiles = zip.file(/^word\/media\//);
  for (const f of mediaFiles) {
    const ext = f.name.split('.').pop()?.toLowerCase() || 'png';
    const mime =
      ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'gif'
        ? 'image/gif'
        : ext === 'webp'
        ? 'image/webp'
        : 'image/png';
    const b64 = await f.async('base64');
    const relativePath = f.name.replace(/^word\//, '');
    const dataUri = `data:${mime};base64,${b64}`;
    mediaImages[relativePath] = dataUri;
    mediaImages[f.name] = dataUri;
  }

  const docFile = zip.file('word/document.xml');
  if (!docFile) {
    throw new Error('File Word (.docx) tidak memiliki berkas dokumen utama (word/document.xml).');
  }
  const docXml = await docFile.async('string');

  const pMatches = docXml.split(/<\/w:p>/g);
  const paragraphs: { text: string; imageUri?: string }[] = [];

  for (const p of pMatches) {
    let imageUri: string | undefined = undefined;
    const rIdMatch = p.match(/r:embed="([^"]+)"/);
    if (rIdMatch) {
      const rId = rIdMatch[1];
      const target = relsMap[rId];
      if (target && mediaImages[target]) {
        imageUri = mediaImages[target];
      }
    }

    const textMatches = p.match(/<w:t[^>]*>(.*?)<\/w:t>/g);
    let text = '';
    if (textMatches) {
      text = textMatches.map((t) => t.replace(/<[^>]+>/g, '')).join('');
    }

    const cleanText = text.trim();
    if (cleanText || imageUri) {
      paragraphs.push({ text: cleanText, imageUri });
    }
  }

  const plainText = paragraphs.map((p) => p.text).filter(Boolean).join('\n');
  return { text: plainText, paragraphs, mediaImages };
}

/**
 * Emergency local rule-based question parser.
 * Extracts questions, multiple choice options (A, B, C, D), and answer keys
 * purely client-side without needing an AI server.
 */
export function parseQuestionsWithRegex(rawText: string): SoalUjian[] {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const questions: SoalUjian[] = [];
  let currentSoal: Partial<SoalUjian> | null = null;
  let currentPilihan: Record<string, string> = {};

  const finalizeCurrent = () => {
    if (currentSoal && currentSoal.pertanyaan) {
      const hasOptions = Object.keys(currentPilihan).length > 0;
      questions.push({
        id: `soal-local-${Date.now()}-${questions.length + 1}`,
        nomor: questions.length + 1,
        tipe: hasOptions ? 'pilihan_ganda' : 'esai',
        pertanyaan: currentSoal.pertanyaan.trim(),
        pilihan: hasOptions ? { ...currentPilihan } : undefined,
        kunciJawaban: currentSoal.kunciJawaban || '',
        bobot: 1,
        perluVerifikasi: !currentSoal.kunciJawaban,
        catatanVerifikasi: !currentSoal.kunciJawaban
          ? 'Kunci jawaban belum terdeteksi. Silakan periksa kunci jawaban.'
          : undefined,
      });
    }
    currentSoal = null;
    currentPilihan = {};
  };

  for (const line of lines) {
    // 1. Detect question number start (e.g., "1. ", "1) ", "Soal 1: ")
    const numMatch = line.match(/^(?:Soal\s*)?(\d+)[\.\)]\s*(.+)/i);
    if (numMatch) {
      finalizeCurrent();
      currentSoal = {
        nomor: parseInt(numMatch[1], 10),
        pertanyaan: numMatch[2],
      };
      continue;
    }

    // 2. Detect multiple choice option (e.g., "A. ", "a. ", "A) ")
    const optMatch = line.match(/^([A-Ea-e])[\.\)]\s*(.+)/);
    if (optMatch && currentSoal) {
      const optLetter = optMatch[1].toUpperCase();
      currentPilihan[optLetter] = optMatch[2].trim();
      continue;
    }

    // 3. Detect answer key (e.g., "Kunci: A", "Kunci Jawaban: B", "Jawaban: C")
    const keyMatch = line.match(/^(?:Kunci(?:\s+Jawaban)?|Jawaban)\s*[:=]\s*([A-Ea-e])/i);
    if (keyMatch && currentSoal) {
      currentSoal.kunciJawaban = keyMatch[1].toUpperCase();
      continue;
    }

    // 4. Continued question text or stimulus reading
    if (currentSoal) {
      if (Object.keys(currentPilihan).length === 0) {
        currentSoal.pertanyaan = `${currentSoal.pertanyaan || ''}\n${line}`;
      }
    }
  }

  finalizeCurrent();
  return questions;
}
