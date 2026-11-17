import {
  getGeminiApiKey,
  parseExamDocumentWithGemini,
  readQuestionsForAiReaderWithGemini,
  answerQuestionsForAiReaderWithGemini,
} from "./_lib/geminiBackend.ts";
import { getSafeKeyDiagnostics, logBackendError } from "./_lib/diagnosticHelper.ts";
import {
  getSanitizedExamPayloadForStudent,
  submitAndGradeExamOnBackend,
} from "./_lib/ujianBackend.ts";

export const config = {
  maxDuration: 60,
  api: {
    bodyParser: {
      sizeLimit: "25mb",
    },
  },
};

export default async function handler(req: any, res: any) {
  // CORS configuration
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Parse path from URL
  const rawUrl = req.url || "/";
  const pathname = rawUrl.split("?")[0].replace(/^\/api/, "") || "/";

  // Parse JSON body safely if it arrives as string
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      // keep raw
    }
  }

  try {
    // 1. Health check
    if (pathname === "/health" || pathname === "" || pathname === "/") {
      const diag = getSafeKeyDiagnostics();
      return res.status(200).json({
        status: "ok",
        app: "ISTAFA Portal Sekolah",
        aiAvailable: Boolean(getGeminiApiKey()),
        timestamp: new Date().toISOString(),
        platform: process.env.VERCEL ? "vercel-serverless" : "local-node",
        endpoint: pathname,
        diagnostics: {
          aiAvailable: diag.exists,
          platform: process.env.VERCEL ? "vercel-serverless" : "local-node",
          nodeVersion: process.version,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // 2. Exam document parsing with AI
    if (pathname === "/ujian/parse") {
      if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Metode request harus POST." });
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
      const safeFileName = typeof fileName === "string" && fileName.trim() ? fileName.trim() : "dokumen-soal";

      const allowedMimes = new Set([
        "application/pdf",
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "text/plain",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ]);

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
          error: "Data berkas atau teks soal tidak ditemukan dalam request.",
        });
      }

      for (const p of normalizedPages) {
        if (!allowedMimes.has(p.mimeType)) {
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

      if ((hasValidBase64 || hasValidText) && !allowedMimes.has(resolvedMime)) {
        return res.status(400).json({
          success: false,
          error: `Tipe berkas (${resolvedMime}) tidak didukung.`,
        });
      }

      const apiKey = getGeminiApiKey();
      if (!apiKey) {
        return res.status(200).json({
          success: false,
          fallbackToLocal: true,
          error: "GEMINI_API_KEY belum dikonfigurasi di server. Menggunakan parser lokal in-browser.",
        });
      }

      try {
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
      } catch (parseErr: any) {
        return res.status(200).json({
          success: false,
          fallbackToLocal: true,
          error: parseErr?.message || "AI tidak dapat membaca dokumen, beralih ke parser lokal.",
        });
      }
    }

    if (pathname === "/ujian/time") {
      const now = new Date();
      return res.status(200).json({
        success: true,
        serverTimeMs: now.getTime(),
        serverIso: now.toISOString(),
      });
    }

    if (pathname === "/ujian/exam") {
      if (req.method !== "GET") {
        return res.status(405).json({ success: false, error: "Metode request harus GET." });
      }
      const parsedUrl = new URL(rawUrl, "http://localhost");
      const id = String(req.query?.id || parsedUrl.searchParams.get("id") || "");
      const school = String(req.query?.school || parsedUrl.searchParams.get("school") || "") || undefined;
      if (!id) {
        return res.status(400).json({ success: false, error: "Parameter id ujian diperlukan." });
      }
      const result = await getSanitizedExamPayloadForStudent(id, school);
      if (!result.found) {
        return res.status(404).json({
          success: false,
          error: "Naskah ujian tidak ditemukan.",
          serverTimeMs: result.serverTimeMs,
        });
      }
      return res.status(200).json({
        success: true,
        schoolId: result.schoolId,
        exam: result.exam,
        serverTimeMs: result.serverTimeMs,
        scheduleCheck: result.scheduleCheck,
      });
    }

    if (pathname === "/ujian/submit") {
      if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Metode request harus POST." });
      }
      if (!body || !body.ujianId || !body.sessionId) {
        return res.status(400).json({
          success: false,
          error: "Parameter ujianId dan sessionId wajib diisi.",
        });
      }
      const result = await submitAndGradeExamOnBackend(body);
      if (!result.success) {
        return res.status(404).json(result);
      }
      return res.status(200).json(result);
    }

    if (pathname === "/ai-reader/read") {
      if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Metode request harus POST." });
      }
      if (!getGeminiApiKey()) {
        return res.status(503).json({
          success: false,
          error: "GEMINI_API_KEY belum dikonfigurasi pada server.",
        });
      }
      const { fileBase64, fileName = "dokumen-soal", mimeType, text, pages, chunkLabel } =
        body && typeof body === "object" ? body : {};
      const result = await readQuestionsForAiReaderWithGemini({
        text: typeof text === "string" && text.trim() ? text : undefined,
        fileBase64: typeof fileBase64 === "string" && fileBase64.trim() ? fileBase64 : undefined,
        mimeType: typeof mimeType === "string" ? mimeType.trim().toLowerCase() : undefined,
        fileName: typeof fileName === "string" && fileName.trim() ? fileName.trim() : "dokumen-soal",
        pages: Array.isArray(pages) && pages.length > 0 ? pages : undefined,
        chunkLabel: typeof chunkLabel === "string" ? chunkLabel : undefined,
      });
      return res.status(200).json({ success: true, data: result });
    }

    if (pathname === "/ai-reader/answer") {
      if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Metode request harus POST." });
      }
      if (!getGeminiApiKey()) {
        return res.status(503).json({
          success: false,
          error: "GEMINI_API_KEY belum dikonfigurasi pada server.",
        });
      }
      const { questions, pageImages } = body && typeof body === "object" ? body : {};
      if (!Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ success: false, error: "Daftar soal kosong." });
      }
      const result = await answerQuestionsForAiReaderWithGemini({
        questions,
        pageImages: Array.isArray(pageImages) && pageImages.length > 0 ? pageImages : undefined,
      });
      return res.status(200).json({ success: true, data: result });
    }

    return res.status(404).json({
      success: false,
      code: "ENDPOINT_NOT_FOUND",
      error: `Endpoint ${pathname} tidak ditemukan di server Vercel API.`,
    });
  } catch (err: any) {
    const errorInfo = logBackendError(pathname, "api_index_catch", err);
    return res.status(errorInfo.httpStatus).json({
      success: false,
      code: errorInfo.code,
      category: errorInfo.category,
      error: errorInfo.message,
      hint: errorInfo.hint,
      timestamp: new Date().toISOString(),
    });
  }
}
