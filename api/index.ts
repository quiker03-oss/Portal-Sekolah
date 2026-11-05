import {
  handleParseDocx,
  handleParsePdf,
  handleParseTextSoal,
  handleParseImage,
  handleMatchAnswerKeys,
  handleGradeEssay,
  getGeminiApiKey,
} from "./_lib/geminiBackend.ts";
import {
  handleStartExamSession,
  handleSaveAnswerSession,
  handleHeartbeatSession,
  handleSubmitSession,
  handleUnlockSession,
  handleGetProctoringAuditLogs,
  handleResetExamSession,
} from "./_lib/examSessionBackend.ts";
import { logBackendStep, logBackendError } from "./_lib/diagnosticHelper.ts";

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
      return res.status(200).json({
        status: "ok",
        app: "ISTAFA Portal Sekolah",
        aiAvailable: Boolean(getGeminiApiKey()),
        timestamp: new Date().toISOString(),
        platform: process.env.VERCEL ? "vercel-serverless" : "local-node",
        endpoint: pathname,
      });
    }

    // 2. Parse DOCX
    if (pathname === "/ujian/parse-docx") {
      if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Metode harus POST." });
      }
      const { fileBase64, fileName = "dokumen-soal.docx" } = body || {};
      if (!fileBase64) {
        return res.status(400).json({ success: false, error: "Data fileBase64 tidak ditemukan." });
      }
      const result = await handleParseDocx(fileBase64, fileName);
      return res.status(200).json(result);
    }

    // 3. Parse PDF
    if (pathname === "/ujian/parse-pdf") {
      if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Metode harus POST." });
      }
      const { fileBase64, fileName = "dokumen-soal.pdf" } = body || {};
      if (!fileBase64) {
        return res.status(400).json({ success: false, error: "Data fileBase64 PDF tidak ditemukan." });
      }
      const result = await handleParsePdf(fileBase64, fileName);
      return res.status(200).json(result);
    }

    // 4. Parse Raw Text Soal
    if (pathname === "/ujian/parse-text-soal") {
      if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Metode harus POST." });
      }
      const { text } = body || {};
      if (!text || !text.trim()) {
        return res.status(400).json({ success: false, error: "Teks soal tidak boleh kosong." });
      }
      const result = await handleParseTextSoal(text);
      return res.status(200).json(result);
    }

    // 5. Parse Image Soal
    if (pathname === "/ujian/parse-image") {
      if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Metode harus POST." });
      }
      const { fileBase64, fileName = "naskah-ujian.jpg", mimeType = "image/jpeg" } = body || {};
      if (!fileBase64) {
        return res.status(400).json({ success: false, error: "Data fileBase64 gambar tidak ditemukan." });
      }
      const result = await handleParseImage(fileBase64, fileName, mimeType);
      return res.status(200).json(result);
    }

    // 6. Match Answer Keys
    if (pathname === "/ujian/match-answer-keys") {
      if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Metode harus POST." });
      }
      const { soalList, keyFileBase64, keyMimeType, keyText, fileName } = body || {};
      if (!soalList || !Array.isArray(soalList) || soalList.length === 0) {
        return res.status(400).json({ success: false, error: "Daftar butir soal tidak boleh kosong." });
      }
      const result = await handleMatchAnswerKeys(soalList, {
        keyFileBase64,
        keyMimeType,
        keyText,
        fileName,
      });
      return res.status(200).json(result);
    }

    // 7. AI Grade Essay
    if (pathname === "/ujian/ai-grade-essay") {
      if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Metode harus POST." });
      }
      const {
        pertanyaan,
        kunciJawaban,
        contohJawaban,
        rubrikPenilaian,
        indikatorWajib,
        variasiJawaban,
        jawabanSiswa,
        bobotMaksimal,
      } = body || {};
      if (!pertanyaan) {
        return res.status(400).json({ success: false, error: "Teks pertanyaan wajib disertakan." });
      }
      const result = await handleGradeEssay({
        pertanyaan,
        kunciJawaban,
        contohJawaban,
        rubrikPenilaian,
        indikatorWajib,
        variasiJawaban,
        jawabanSiswa: jawabanSiswa || "",
        bobotMaksimal: Number(bobotMaksimal) || 10,
      });
      return res.status(200).json(result);
    }

    // 8. Session: Start / Recover
    if (pathname === "/ujian/session/start") {
      if (req.method !== "POST") return res.status(405).json({ success: false, error: "Metode harus POST." });
      const clientIp = (req.headers && req.headers["x-forwarded-for"]) || req.socket?.remoteAddress;
      const result = await handleStartExamSession(body, clientIp);
      if ("locked" in result && result.locked) return res.status(403).json(result);
      return res.status(200).json(result);
    }

    // 9. Session: Save Answer
    if (pathname === "/ujian/session/save-answer") {
      if (req.method !== "POST") return res.status(405).json({ success: false, error: "Metode harus POST." });
      const result = await handleSaveAnswerSession(body);
      if ("locked" in result && result.locked) return res.status(403).json(result);
      return res.status(200).json(result);
    }

    // 10. Session: Heartbeat
    if (pathname === "/ujian/session/heartbeat") {
      if (req.method !== "POST") return res.status(405).json({ success: false, error: "Metode harus POST." });
      const result = await handleHeartbeatSession(body);
      return res.status(200).json(result);
    }

    // 11. Session: Submit
    if (pathname === "/ujian/session/submit") {
      if (req.method !== "POST") return res.status(405).json({ success: false, error: "Metode harus POST." });
      const result = await handleSubmitSession(body);
      if (result.locked) return res.status(403).json(result);
      return res.status(200).json(result);
    }

    // 12. Session: Unlock
    if (pathname === "/ujian/session/unlock") {
      if (req.method !== "POST") return res.status(405).json({ success: false, error: "Metode harus POST." });
      const result = await handleUnlockSession(body);
      return res.status(200).json(result);
    }

    // 13. Session: Reset
    if (pathname === "/ujian/session/reset") {
      if (req.method !== "POST") return res.status(405).json({ success: false, error: "Metode harus POST." });
      const { ujianId, siswaId, guruNama } = body || {};
      const result = await handleResetExamSession(ujianId, siswaId, guruNama);
      return res.status(200).json(result);
    }

    // 14. Session: Audit Logs
    if (pathname === "/ujian/session/audit-logs") {
      const urlObj = new URL(rawUrl, "http://localhost");
      const ujianId = urlObj.searchParams.get("ujianId") || undefined;
      const result = handleGetProctoringAuditLogs(ujianId);
      return res.status(200).json(result);
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
