import {
  getGeminiApiKey,
  parseExamDocumentWithGemini,
} from "./_lib/geminiBackend.ts";
import { getSafeKeyDiagnostics, logBackendError } from "./_lib/diagnosticHelper.ts";

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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
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

      const { fileBase64, fileName = "dokumen-soal", mimeType, text } = body && typeof body === "object" ? body : {};
      const hasValidBase64 = typeof fileBase64 === "string" && fileBase64.trim().length > 0;
      const hasValidText = typeof text === "string" && text.trim().length > 0;
      const safeFileName = typeof fileName === "string" && fileName.trim() ? fileName.trim() : "dokumen-soal";

      if (!hasValidBase64 && !hasValidText) {
        return res.status(400).json({
          success: false,
          error: "Data berkas atau teks soal tidak ditemukan dalam request.",
        });
      }

      const resolvedMime =
        typeof mimeType === "string" && mimeType.trim()
          ? mimeType.trim().toLowerCase()
          : safeFileName.toLowerCase().endsWith(".pdf")
          ? "application/pdf"
          : hasValidBase64
          ? "image/jpeg"
          : "text/plain";

      const allowedMimes = new Set([
        "application/pdf",
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "text/plain",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ]);

      if (!allowedMimes.has(resolvedMime)) {
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
