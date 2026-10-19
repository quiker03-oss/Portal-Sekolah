import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import {
  handleParseDocx,
  handleParsePdf,
  handleParseTextSoal,
  handleBuatSoal,
  handleBuatModul,
  handleBuatMateri,
} from "./api/_lib/geminiBackend.ts";

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
