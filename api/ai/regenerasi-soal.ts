import { handleRegenerasiSoal } from "../_lib/geminiBackend";

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
      error: `Metode ${req.method} tidak diizinkan. Gunakan POST.`,
    });
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        // keep as is
      }
    }

    const result = await handleRegenerasiSoal(body);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error("[Vercel API /api/ai/regenerasi-soal Error]:", err);
    return res.status(200).json({
      success: false,
      error: err?.message || "Terjadi kendala saat meregenerasi butir soal.",
    });
  }
}
