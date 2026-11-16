import {
  parseExamDocumentWithGemini,
  getGeminiApiKey,
  logBackendError,
} from "../_lib/geminiBackend.ts";

export const config = {
  maxDuration: 60,
  api: {
    bodyParser: {
      sizeLimit: "25mb",
    },
  },
};

const ALLOWED_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Metode request harus POST.",
    });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      // keep raw
    }
  }

  const {
    fileBase64,
    fileName = "dokumen-soal",
    mimeType,
    text,
    pages,
  } = body && typeof body === "object" ? body : {};

  const hasValidBase64 = typeof fileBase64 === "string" && fileBase64.trim().length > 0;
  const hasValidText = typeof text === "string" && text.trim().length > 0;
  const safeFileName =
    typeof fileName === "string" && fileName.trim() ? fileName.trim() : "dokumen-soal";

  const normalizedPages = Array.isArray(pages)
    ? pages
        .filter(
          (p: any) =>
            p &&
            typeof p === "object" &&
            typeof p.imageBase64 === "string" &&
            p.imageBase64.trim().length > 0
        )
        .map((p: any) => ({
          pageNumber: typeof p.pageNumber === "number" ? p.pageNumber : undefined,
          imageBase64: p.imageBase64.trim(),
          mimeType:
            typeof p.mimeType === "string" && p.mimeType.trim()
              ? p.mimeType.trim().toLowerCase()
              : "image/jpeg",
        }))
    : [];

  const hasValidPages = normalizedPages.length > 0;

  if (!hasValidBase64 && !hasValidText && !hasValidPages) {
    return res.status(400).json({
      success: false,
      error: "Data berkas (fileBase64), halaman gambar, atau teks soal tidak ditemukan dalam request.",
    });
  }

  for (const p of normalizedPages) {
    if (!ALLOWED_MIMES.has(p.mimeType)) {
      return res.status(400).json({
        success: false,
        error: `Tipe gambar halaman (${p.mimeType}) tidak didukung.`,
      });
    }
  }

  const resolvedMime =
    typeof mimeType === "string" && mimeType.trim()
      ? mimeType.trim().toLowerCase()
      : safeFileName.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : hasValidBase64
      ? "image/jpeg"
      : "text/plain";

  if ((hasValidBase64 || hasValidText) && !ALLOWED_MIMES.has(resolvedMime)) {
    return res.status(400).json({
      success: false,
      error: `Tipe berkas (${resolvedMime}) tidak didukung.`,
    });
  }

  try {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return res.status(200).json({
        success: false,
        fallbackToLocal: true,
        error:
          "GEMINI_API_KEY belum dikonfigurasi di server. Sistem menggunakan parser dokumen lokal in-browser.",
      });
    }

    const result = await parseExamDocumentWithGemini({
      text: hasValidText ? text : undefined,
      fileBase64: hasValidBase64 ? fileBase64 : undefined,
      mimeType: resolvedMime,
      fileName: safeFileName,
      pages: hasValidPages ? normalizedPages : undefined,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    const errorInfo = logBackendError("/api/ujian/parse", "gemini_parse_catch", err);
    return res.status(200).json({
      success: false,
      fallbackToLocal: true,
      error: errorInfo.message || "Gagal memproses dokumen dengan model AI. Beralih ke parser lokal.",
      diagnostics: errorInfo,
    });
  }
}
