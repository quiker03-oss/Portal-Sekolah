import {
  handleParseDocx,
  handleParsePdf,
  handleParseTextSoal,
  handleBuatSoal,
  handleBuatModul,
  handleBuatMateri,
} from "./_lib/geminiBackend";

export const config = {
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
      // ignore
    }
  }

  try {
    // 1. Health check
    if (pathname === "/health" || pathname === "" || pathname === "/") {
      return res.status(200).json({
        status: "ok",
        aiAvailable: Boolean(process.env.GEMINI_API_KEY),
        timestamp: new Date().toISOString(),
        platform: "vercel-serverless",
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

    // 5. Buat Soal AI
    if (pathname === "/ai/buat-soal") {
      if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Metode harus POST." });
      }
      const result = await handleBuatSoal(body);
      return res.status(200).json(result);
    }

    // 6. Buat Modul Ajar AI
    if (pathname === "/ai/buat-modul") {
      if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Metode harus POST." });
      }
      const result = await handleBuatModul(body);
      return res.status(200).json(result);
    }

    // 7. Buat Materi / LKPD AI
    if (pathname === "/ai/buat-materi") {
      if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Metode harus POST." });
      }
      const result = await handleBuatMateri(body);
      return res.status(200).json(result);
    }

    return res.status(404).json({
      success: false,
      error: `Endpoint ${pathname} tidak ditemukan di server Vercel API.`,
    });
  } catch (err: any) {
    console.error(`[Vercel API Error on ${pathname}]:`, err);
    return res.status(500).json({
      success: false,
      error: err?.message || "Terjadi kesalahan internal pada server API.",
    });
  }
}
