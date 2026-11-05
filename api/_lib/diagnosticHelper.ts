import dotenv from "dotenv";
dotenv.config();

export type ErrorCategory =
  | "CONFIGURATION_ERROR"
  | "AUTHENTICATION_ERROR"
  | "GEMINI_API_ERROR"
  | "INPUT_VALIDATION_ERROR"
  | "FIREBASE_ERROR"
  | "RUNTIME_ERROR";

export interface SafeDiagnosticInfo {
  exists: boolean;
  source: string;
  length: number;
  maskedPreview: string;
}

/**
 * Inspects environment variables for Gemini API key and returns safe diagnostic metadata.
 * NEVER leaks the full key value.
 */
export function getSafeKeyDiagnostics(): SafeDiagnosticInfo {
  const candidates: Array<{ name: string; val: string | undefined }> = [
    { name: "GEMINI_API_KEY", val: process.env.GEMINI_API_KEY },
    { name: "GOOGLE_API_KEY", val: process.env.GOOGLE_API_KEY },
    { name: "VITE_GEMINI_API_KEY", val: process.env.VITE_GEMINI_API_KEY },
    { name: "API_KEY", val: process.env.API_KEY },
  ];

  for (const c of candidates) {
    const raw = (c.val || "").trim();
    if (raw.length > 0) {
      const prefix = raw.slice(0, 6);
      const suffix = raw.slice(-4);
      return {
        exists: true,
        source: c.name,
        length: raw.length,
        maskedPreview: raw.length > 10 ? `${prefix}...${suffix}` : "Terdeteksi (pendek)",
      };
    }
  }

  return {
    exists: false,
    source: "NONE",
    length: 0,
    maskedPreview: "TIDAK_DITEMUKAN",
  };
}

/**
 * Returns raw API key for SDK consumption only.
 */
export function resolveGeminiApiKey(): string | undefined {
  const key =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    process.env.API_KEY ||
    "";
  const trimmed = key.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Structured, safe backend step logger.
 */
export function logBackendStep(endpoint: string, stage: string, details?: Record<string, any>) {
  const sanitizedDetails = details ? { ...details } : undefined;
  if (sanitizedDetails) {
    // Strip sensitive fields if present
    delete sanitizedDetails.apiKey;
    delete sanitizedDetails.fileBase64;
    delete sanitizedDetails.keyFileBase64;
    delete sanitizedDetails.password;
    delete sanitizedDetails.token;
  }
  console.log(`[API STEP][${new Date().toISOString()}][${endpoint}][${stage}]`, sanitizedDetails ? JSON.stringify(sanitizedDetails) : "");
}

/**
 * Categorizes and safely logs backend errors without exposing secrets.
 */
export function logBackendError(
  endpoint: string,
  stage: string,
  err: any,
  categoryHint?: ErrorCategory
): {
  httpStatus: number;
  category: ErrorCategory;
  message: string;
  code: string;
  hint?: string;
} {
  const rawMsg = err?.message || String(err || "Unknown error");
  let category: ErrorCategory = categoryHint || "RUNTIME_ERROR";
  let httpStatus = 500;
  let code = "INTERNAL_SERVER_ERROR";
  let hint: string | undefined = undefined;

  // 1. Configuration check
  if (
    rawMsg.includes("GEMINI_KEY_NOT_CONFIGURED") ||
    rawMsg.includes("belum dikonfigurasi") ||
    rawMsg.includes("API key not found")
  ) {
    category = "CONFIGURATION_ERROR";
    httpStatus = 503;
    code = "GEMINI_KEY_NOT_CONFIGURED";
    hint = "Pastikan GEMINI_API_KEY disetel di Project Settings > Environment Variables Vercel, lalu redeploy.";
  }
  // 2. Authentication check
  else if (
    rawMsg.includes("API_KEY_INVALID") ||
    rawMsg.includes("API key not valid") ||
    rawMsg.includes("PERMISSION_DENIED") ||
    rawMsg.includes("Unauthorized")
  ) {
    category = "AUTHENTICATION_ERROR";
    httpStatus = 401;
    code = "GEMINI_AUTH_FAILED";
    hint = "API key yang terdaftar di Vercel tidak valid atau tidak memiliki izin pada Google AI Studio.";
  }
  // 3. Quota / Rate limit
  else if (
    rawMsg.includes("RESOURCE_EXHAUSTED") ||
    rawMsg.includes("429") ||
    rawMsg.includes("quota")
  ) {
    category = "GEMINI_API_ERROR";
    httpStatus = 429;
    code = "GEMINI_QUOTA_EXHAUSTED";
    hint = "Batas kuota gratis Google Gemini telah tercapai atau rate limit sedang berlaku. Silakan coba kembali sesaat lagi.";
  }
  // 4. Overloaded / 503 from Gemini
  else if (
    rawMsg.includes("503") ||
    rawMsg.includes("UNAVAILABLE") ||
    rawMsg.includes("high demand")
  ) {
    category = "GEMINI_API_ERROR";
    httpStatus = 503;
    code = "GEMINI_SERVICE_UNAVAILABLE";
    hint = "Server Google AI sedang mengalami beban puncak. Sistem telah mencoba fallback model.";
  }
  // 5. Input validation error
  else if (
    rawMsg.includes("INVALID_INPUT") ||
    rawMsg.includes("tidak ditemukan") ||
    rawMsg.includes("kosong") ||
    rawMsg.includes("wajib disertakan")
  ) {
    category = "INPUT_VALIDATION_ERROR";
    httpStatus = 400;
    code = "INVALID_REQUEST_PAYLOAD";
  }
  // 6. Firebase error
  else if (
    rawMsg.includes("Firebase") ||
    rawMsg.includes("firestore") ||
    rawMsg.includes("auth/")
  ) {
    category = "FIREBASE_ERROR";
    httpStatus = 502;
    code = "FIREBASE_SERVICE_ERROR";
  }

  // Safe server console logging with stack trace (without exposing secret strings)
  const safeStack = err?.stack
    ? String(err.stack).replace(/AIza[0-9A-Za-z-_]{35}/g, "[MASKED_API_KEY]")
    : undefined;

  console.error(`[API ERROR][${new Date().toISOString()}][${endpoint}][${stage}][${category}] ${code}: ${rawMsg}`);
  if (safeStack) {
    console.error(`[API ERROR STACK][${endpoint}]:`, safeStack);
  }

  return {
    httpStatus,
    category,
    message: rawMsg.replace(/AIza[0-9A-Za-z-_]{35}/g, "[MASKED_API_KEY]"),
    code,
    hint,
  };
}
