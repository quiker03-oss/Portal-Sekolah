import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { getSafeKeyDiagnostics } from "./api/_lib/diagnosticHelper.ts";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parser with 50mb limit
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // CORS middleware for safety
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }
    next();
  });

  // Health check
  app.get("/api/health", (req, res) => {
    const diag = getSafeKeyDiagnostics();
    res.json({
      status: "ok",
      app: "ISTAFA Portal Sekolah",
      aiAvailable: diag.exists,
      platform: "local-node",
      timestamp: new Date().toISOString(),
      diagnostics: {
        aiAvailable: diag.exists,
        platform: "local-node",
        nodeVersion: process.version,
        timestamp: new Date().toISOString(),
      },
    });
  });

  // Exam document parsing endpoint
  app.post("/api/ujian/parse", async (req, res) => {
    try {
      const {
        fileBase64,
        fileName = "dokumen-soal",
        mimeType,
        text,
        pages,
      } = req.body && typeof req.body === "object" ? req.body : {};
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
          error: "Data berkas (fileBase64), halaman gambar, atau teks soal tidak ditemukan dalam request.",
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

      const { parseExamDocumentWithGemini, getGeminiApiKey } = await import("./api/_lib/geminiBackend.ts");

      const apiKey = getGeminiApiKey();
      if (!apiKey) {
        return res.json({
          success: false,
          fallbackToLocal: true,
          error: "GEMINI_API_KEY tidak disetel di environment server. Sistem menggunakan parser lokal.",
        });
      }

      const result = await parseExamDocumentWithGemini({
        text: hasValidText ? text : undefined,
        fileBase64: hasValidBase64 ? fileBase64 : undefined,
        mimeType: resolvedMime,
        fileName: safeFileName,
        pages: hasValidPages ? normalizedPages : undefined,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      console.warn("[/api/ujian/parse warn]:", err?.message);
      res.json({
        success: false,
        fallbackToLocal: true,
        error: err?.message || "Gagal memproses dokumen dengan AI. Beralih ke parser lokal.",
      });
    }
  });

  // Authoritative server clock for CBT timer & schedule window
  app.get("/api/ujian/time", (_req, res) => {
    const now = new Date();
    res.json({
      success: true,
      serverTimeMs: now.getTime(),
      serverIso: now.toISOString(),
    });
  });

  // Sanitized CBT exam fetch (never sends kunciJawaban or pedomanPenilaian to students)
  app.get("/api/ujian/exam", async (req, res) => {
    try {
      const id = typeof req.query?.id === "string" ? req.query.id : "";
      const school = typeof req.query?.school === "string" ? req.query.school : undefined;
      if (!id) {
        return res.status(400).json({ success: false, error: "Parameter id ujian diperlukan." });
      }
      const { getSanitizedExamPayloadForStudent } = await import("./api/_lib/ujianBackend.ts");
      const result = await getSanitizedExamPayloadForStudent(id, school);
      if (!result.found) {
        return res.status(404).json({
          success: false,
          error: "Naskah ujian tidak ditemukan.",
          serverTimeMs: result.serverTimeMs,
        });
      }
      return res.json({
        success: true,
        schoolId: result.schoolId,
        exam: result.exam,
        serverTimeMs: result.serverTimeMs,
        scheduleCheck: result.scheduleCheck,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err?.message || "Gagal memuat naskah ujian dari server.",
      });
    }
  });

  // Authoritative CBT exam submission & server-side grading endpoint
  app.post("/api/ujian/submit", async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      if (!body.ujianId || !body.sessionId) {
        return res.status(400).json({
          success: false,
          error: "Parameter ujianId dan sessionId wajib diisi.",
        });
      }
      const { submitAndGradeExamOnBackend } = await import("./api/_lib/ujianBackend.ts");
      const result = await submitAndGradeExamOnBackend(body);
      if (!result.success) {
        return res.status(404).json(result);
      }
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err?.message || "Gagal menilai & mengirim jawaban ke server.",
      });
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
