export interface SafeFetchResponse<T = any> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  isHtml?: boolean;
}

/**
 * Safely fetches a URL and parses JSON response.
 * Completely prevents JSON parse crashes by checking HTTP status, content-type,
 * and reading response text first before parsing.
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
      (trimmed.includes('Vercel') && trimmed.includes('error'));

    if (isHtml) {
      console.warn(`[API Diagnostic] Server returned HTML / edge error for ${url}: status ${status}`);

      let friendlyMsg = '';
      if (status === 404) {
        friendlyMsg =
          `Endpoint ${url} tidak ditemukan di server Vercel (HTTP 404). ` +
          `Pastikan fungsi Vercel Serverless pada folder /api sudah terdeploy dengan benar dan file vercel.json sudah aktif di repositori.`;
      } else if (status === 413 || trimmed.includes('PAYLOAD_TOO_LARGE')) {
        friendlyMsg =
          `Ukuran data melebihi batas unggah server Vercel (HTTP 413: Payload Too Large, batas maksimal 4.5 MB). ` +
          `Silakan gunakan berkas berukuran lebih kecil.`;
      } else if (status === 504 || trimmed.includes('GATEWAY_TIMEOUT') || trimmed.includes('TIMEOUT')) {
        friendlyMsg =
          `Waktu proses server Vercel habis (HTTP 504: Gateway Timeout). ` +
          `Silakan coba beberapa saat lagi.`;
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
        error: parsed.error || 'Server menolak pemrosesan permintaan.',
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
        error: 'Waktu permintaan habis (Timeout). Silakan periksa koneksi internet atau coba kembali.',
      };
    }
    return {
      ok: false,
      status: 0,
      error: `Gagal terhubung ke server (${err?.message || 'Koneksi terputus'}). Pastikan perangkat terhubung ke internet.`,
    };
  }
}
