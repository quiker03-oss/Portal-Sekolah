import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import {
  handleParseDocx,
  handleParsePdf,
  handleParseTextSoal,
  handleParseImage,
  handleMatchAnswerKeys,
  handleGradeEssay,
  handleBuatSoal,
  handleRegenerasiSoal,
  handleBuatModul,
  handleBuatMateri,
} from "./api/_lib/geminiBackend";
import {
  handleStartExamSession,
  handleSaveAnswerSession,
  handleHeartbeatSession,
  handleSubmitSession,
  handleUnlockSession,
  handleGetProctoringAuditLogs,
  handleResetExamSession,
} from "./api/_lib/examSessionBackend";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parser with 50mb limit for large docx and pdf uploads
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
    res.json({
      status: "ok",
      aiAvailable: Boolean(process.env.GEMINI_API_KEY),
      timestamp: new Date().toISOString(),
    });
  });

  // 1. Endpoint: Pembuat Soal Ujian & Ulangan (Pilihan Ganda + Esai)
  app.post("/api/ai/buat-soal", async (req, res) => {
    try {
      const result = await handleBuatSoal(req.body);
      res.json(result);
    } catch (err: any) {
      console.error("API /api/ai/buat-soal error:", err);
      res.status(500).json({
        success: false,
        error: err.message || "Terjadi kesalahan saat memproses permintaan soal dengan AI.",
      });
    }
  });

  // 1b. Endpoint: Regenerasi Butir Soal Tunggal (Anti-Duplikasi)
  app.post("/api/ai/regenerasi-soal", async (req, res) => {
    try {
      const result = await handleRegenerasiSoal(req.body);
      res.json(result);
    } catch (err: any) {
      console.error("API /api/ai/regenerasi-soal error:", err);
      res.status(200).json({
        success: false,
        error: err.message || "Gagal meregenerasi butir soal.",
      });
    }
  });

  // 2. Endpoint: Pembuat Modul Ajar / RPP Digital
  app.post("/api/ai/buat-modul", async (req, res) => {
    try {
      const result = await handleBuatModul(req.body);
      res.json(result);
    } catch (err: any) {
      console.error("API /api/ai/buat-modul error:", err);
      res.status(500).json({
        success: false,
        error: err.message || "Terjadi kesalahan saat menyusun modul ajar dengan AI.",
      });
    }
  });

  // 3. Endpoint: Pembuat Bahan Ajar, Ringkasan Materi, & LKPD
  app.post("/api/ai/buat-materi", async (req, res) => {
    try {
      const result = await handleBuatMateri(req.body);
      res.json(result);
    } catch (err: any) {
      console.error("API /api/ai/buat-materi error:", err);
      res.status(500).json({
        success: false,
        error: err.message || "Terjadi kesalahan saat membuat materi pembelajaran dengan AI.",
      });
    }
  });

  // 4. Endpoint: Parse Soal dari Word (.docx)
  app.post("/api/ujian/parse-docx", async (req, res) => {
    try {
      const { fileBase64, fileName = "dokumen-soal.docx" } = req.body || {};
      if (!fileBase64) {
        return res.status(400).json({ success: false, error: "Data fileBase64 tidak ditemukan." });
      }
      const result = await handleParseDocx(fileBase64, fileName);
      res.json(result);
    } catch (err: any) {
      console.error("API /api/ujian/parse-docx error:", err);
      res.status(500).json({
        success: false,
        error: err.message || "Gagal memproses file Word (.docx).",
      });
    }
  });

  // 5. Endpoint: Parse Soal dari PDF (Teks & Scan/OCR)
  app.post("/api/ujian/parse-pdf", async (req, res) => {
    try {
      const { fileBase64, fileName = "dokumen-soal.pdf" } = req.body || {};
      if (!fileBase64) {
        return res.status(400).json({ success: false, error: "Data fileBase64 PDF tidak ditemukan." });
      }
      const result = await handleParsePdf(fileBase64, fileName);
      res.json(result);
    } catch (err: any) {
      console.error("API /api/ujian/parse-pdf error:", err);
      res.status(500).json({
        success: false,
        error: err.message || "Gagal memproses file PDF.",
      });
    }
  });

  // 6. Endpoint: Parse Soal dari Teks Bebas (Copy-Paste)
  app.post("/api/ujian/parse-text-soal", async (req, res) => {
    try {
      const { text } = req.body || {};
      if (!text || !text.trim()) {
        return res.status(400).json({ success: false, error: "Teks soal tidak boleh kosong." });
      }
      const result = await handleParseTextSoal(text);
      res.json(result);
    } catch (err: any) {
      console.error("API /api/ujian/parse-text-soal error:", err);
      res.status(500).json({
        success: false,
        error: err.message || "Gagal memproses teks soal.",
      });
    }
  });

  // 7. Endpoint: Parse Soal dari Gambar (JPG / JPEG / PNG / Scan Kamera HP)
  app.post("/api/ujian/parse-image", async (req, res) => {
    try {
      const { fileBase64, fileName = "naskah-ujian.jpg", mimeType = "image/jpeg" } = req.body || {};
      if (!fileBase64) {
        return res.status(400).json({ success: false, error: "Data gambar (fileBase64) tidak ditemukan." });
      }
      const result = await handleParseImage(fileBase64, fileName, mimeType);
      res.json(result);
    } catch (err: any) {
      console.error("API /api/ujian/parse-image error:", err);
      res.status(500).json({
        success: false,
        error: err.message || "Gagal memproses gambar naskah soal.",
      });
    }
  });

  // 8. Endpoint: Pencocokan Kunci Jawaban Terpisah ke Butir Soal Ujian
  app.post("/api/ujian/match-answer-keys", async (req, res) => {
    try {
      const { soalList, keyFileBase64, keyMimeType, keyText, fileName } = req.body || {};
      if (!soalList || !Array.isArray(soalList) || soalList.length === 0) {
        return res.status(400).json({ success: false, error: "Daftar butir soal tidak boleh kosong." });
      }
      const result = await handleMatchAnswerKeys(soalList, {
        keyFileBase64,
        keyMimeType,
        keyText,
        fileName,
      });
      res.json(result);
    } catch (err: any) {
      console.error("API /api/ujian/match-answer-keys error:", err);
      res.status(500).json({
        success: false,
        error: err.message || "Gagal mencocokkan dokumen kunci jawaban ke butir soal.",
      });
    }
  });

  // 9. Endpoint: Penilaian Jawaban Esai Siswa Menggunakan Rubrik Berbantu AI
  app.post("/api/ujian/ai-grade-essay", async (req, res) => {
    try {
      const {
        pertanyaan,
        kunciJawaban,
        contohJawaban,
        rubrikPenilaian,
        indikatorWajib,
        variasiJawaban,
        jawabanSiswa,
        bobotMaksimal,
      } = req.body || {};

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
      res.json(result);
    } catch (err: any) {
      console.error("API /api/ujian/ai-grade-essay error:", err);
      res.status(500).json({
        success: false,
        error: err.message || "Gagal melakukan penilaian esai dengan AI.",
      });
    }
  });

  // =========================================================================
  // SISTEM KEAMANAN SESI UJIAN: DETEKSI PERANGKAT BERBEDA & PENGUNCIAN SERVER
  // =========================================================================

  // Endpoint: Mulai / Pulihkan Sesi Ujian (Deteksi Perangkat Ganda Secara Atomik)
  app.post("/api/ujian/session/start", async (req, res) => {
    try {
      const clientIp = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || req.ip;
      const result = await handleStartExamSession(req.body, clientIp);
      if ("locked" in result && result.locked) {
        return res.status(403).json(result);
      }
      res.json(result);
    } catch (err: any) {
      console.error("API /api/ujian/session/start error:", err);
      res.status(500).json({ success: false, error: err.message || "Gagal memverifikasi sesi ujian." });
    }
  });

  // Endpoint: Simpan Jawaban Siswa (Ditolak Jika Terkunci)
  app.post("/api/ujian/session/save-answer", async (req, res) => {
    try {
      const result = await handleSaveAnswerSession(req.body);
      if ("locked" in result && result.locked) {
        return res.status(403).json(result);
      }
      res.json(result);
    } catch (err: any) {
      console.error("API /api/ujian/session/save-answer error:", err);
      res.status(500).json({ success: false, error: err.message || "Gagal menyimpan jawaban ke server." });
    }
  });

  // Endpoint: Heartbeat & Pemantauan Penguncian Real-Time
  app.post("/api/ujian/session/heartbeat", async (req, res) => {
    try {
      const result = await handleHeartbeatSession(req.body);
      res.json(result);
    } catch (err: any) {
      console.error("API /api/ujian/session/heartbeat error:", err);
      res.status(500).json({ success: false, error: err.message || "Gagal memeriksa status sesi." });
    }
  });

  // Endpoint: Selesai / Kumpulkan Lembar Ujian
  app.post("/api/ujian/session/submit", async (req, res) => {
    try {
      const result = await handleSubmitSession(req.body);
      if (result.locked) {
        return res.status(403).json(result);
      }
      res.json(result);
    } catch (err: any) {
      console.error("API /api/ujian/session/submit error:", err);
      res.status(500).json({ success: false, error: err.message || "Gagal menyelesaikan ujian di server." });
    }
  });

  // Endpoint: Buka Kunci Ujian oleh Guru Pengawas yang Berwenang
  app.post("/api/ujian/session/unlock", async (req, res) => {
    try {
      const result = await handleUnlockSession(req.body);
      res.json(result);
    } catch (err: any) {
      console.error("API /api/ujian/session/unlock error:", err);
      res.status(500).json({ success: false, error: err.message || "Gagal membuka kunci ujian." });
    }
  });

  // Endpoint: Reset Sesi Siswa oleh Guru Pengawas
  app.post("/api/ujian/session/reset", async (req, res) => {
    try {
      const { ujianId, siswaId, guruNama } = req.body || {};
      const result = await handleResetExamSession(ujianId, siswaId, guruNama);
      res.json(result);
    } catch (err: any) {
      console.error("API /api/ujian/session/reset error:", err);
      res.status(500).json({ success: false, error: err.message || "Gagal mereset sesi." });
    }
  });

  // Endpoint: Ambil Audit Log & Sesi Aktif untuk Dashboard Guru Pengawas
  app.get("/api/ujian/session/audit-logs", (req, res) => {
    try {
      const ujianId = req.query.ujianId as string | undefined;
      const result = handleGetProctoringAuditLogs(ujianId);
      res.json(result);
    } catch (err: any) {
      console.error("API /api/ujian/session/audit-logs error:", err);
      res.status(500).json({ success: false, error: err.message || "Gagal memuat log audit." });
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
