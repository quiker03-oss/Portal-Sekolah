import { storage, ref, uploadString, getDownloadURL, deleteObject } from './firebase';
import { db } from './database';
import { ExamImageMeta, SoalUjian } from '../types';

export interface UploadedImageResult {
  imageId: string;
  url: string;
  storagePath?: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  mimeType: string;
}

export interface CropAreaPercent {
  xPct: number; // 0..100
  yPct: number; // 0..100
  wPct: number; // 1..100
  hPct: number; // 1..100
}

export function generateImageId(): string {
  return `img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Validates an image file selected by teacher (from Android gallery or desktop).
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  if (!file || !file.type || !allowedTypes.includes(file.type.toLowerCase())) {
    return {
      valid: false,
      error: 'Format gambar tidak didukung. Harap gunakan berkas JPG, JPEG, PNG, atau WEBP.',
    };
  }

  // 20MB limit before client-side compression
  const maxSize = 20 * 1024 * 1024;
  if (file.size > maxSize) {
    return {
      valid: false,
      error: 'Ukuran berkas gambar terlalu besar (maksimal 20 MB).',
    };
  }

  return { valid: true };
}

/**
 * Compresses and resizes high-resolution images (e.g., from Android camera or scanner)
 * using HTML5 Canvas, preserving aspect ratio and converting to optimized WebP/JPEG.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function compressAndOptimizeImage(
  source: File | Blob | string,
  maxWidth = 1400,
  maxHeight = 1400,
  quality = 0.85
): Promise<{ dataUrl: string; width: number; height: number; sizeBytes: number; mimeType: string }> {
  // Node / headless environment fallback when document or Image is unavailable
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    if (typeof source === 'string' && source.startsWith('data:image/')) {
      const mimeMatch = source.match(/^data:([^;]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
      const base64Len = source.length - (source.indexOf(',') + 1);
      return {
        dataUrl: source,
        width: 0,
        height: 0,
        sizeBytes: Math.round((base64Len * 3) / 4),
        mimeType,
      };
    }
    throw new Error('Lingkungan browser tidak tersedia untuk kompresi gambar.');
  }

  const decodePromise = new Promise<{ dataUrl: string; width: number; height: number; sizeBytes: number; mimeType: string }>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        let { width, height } = img;
        if (!width || !height) {
          reject(new Error('Dimensi gambar tidak valid (0x0).'));
          return;
        }

        // Calculate proportional dimensions (aspect ratio preserved)
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Canvas context tidak tersedia.'));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Try webp first, fallback to jpeg
        let mimeType = 'image/webp';
        let dataUrl = canvas.toDataURL('image/webp', quality);
        if (!dataUrl.startsWith('data:image/webp')) {
          mimeType = 'image/jpeg';
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        const base64Len = dataUrl.length - (dataUrl.indexOf(',') + 1);
        const sizeBytes = Math.round((base64Len * 3) / 4);

        resolve({
          dataUrl,
          width,
          height,
          sizeBytes,
          mimeType,
        });
      } catch (canvasErr) {
        reject(canvasErr);
      }
    };

    img.onerror = () => reject(new Error('Gagal memuat atau memproses berkas gambar.'));

    if (typeof source === 'string') {
      img.src = source;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = (e.target?.result as string) || '';
      };
      reader.onerror = () => reject(new Error('Gagal membaca berkas gambar.'));
      reader.readAsDataURL(source);
    }
  });

  try {
    return await withTimeout(decodePromise, 5000, 'Waktu pemrosesan gambar habis.');
  } catch (err) {
    if (typeof source === 'string' && source.startsWith('data:image/')) {
      const mimeMatch = source.match(/^data:([^;]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
      const base64Len = source.length - (source.indexOf(',') + 1);
      return {
        dataUrl: source,
        width: 0,
        height: 0,
        sizeBytes: Math.round((base64Len * 3) / 4),
        mimeType,
      };
    }
    throw err;
  }
}

/**
 * Crops an image using HTML5 Canvas based on percentage coordinates (0-100).
 */
export async function cropImageDataUrl(
  sourceUrl: string,
  crop: CropAreaPercent
): Promise<{ dataUrl: string; width: number; height: number; mimeType: string }> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error('Fitur potong gambar memerlukan lingkungan browser.');
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const natW = img.naturalWidth || img.width;
      const natH = img.naturalHeight || img.height;
      if (!natW || !natH) {
        reject(new Error('Ukuran gambar asli tidak terbaca.'));
        return;
      }

      const sx = Math.max(0, Math.round((crop.xPct / 100) * natW));
      const sy = Math.max(0, Math.round((crop.yPct / 100) * natH));
      const sw = Math.max(10, Math.min(natW - sx, Math.round((crop.wPct / 100) * natW)));
      const sh = Math.max(10, Math.min(natH - sy, Math.round((crop.hPct / 100) * natH)));

      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context tidak tersedia untuk pemotongan.'));
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

      let mimeType = 'image/webp';
      let dataUrl = canvas.toDataURL('image/webp', 0.9);
      if (!dataUrl.startsWith('data:image/webp')) {
        mimeType = 'image/png';
        dataUrl = canvas.toDataURL('image/png');
      }

      resolve({
        dataUrl,
        width: sw,
        height: sh,
        mimeType,
      });
    };
    img.onerror = () => reject(new Error('Gagal memuat gambar untuk dipotong (periksa CORS / URL).'));
    img.src = sourceUrl;
  });
}

/**
 * Uploads an exam image to Firebase Storage AND stores permanent metadata
 * in Firestore collection `schools/{schoolId}/exam_images/{imageId}`.
 * Falls back gracefully to an optimized Base64 Data URI if Firebase Storage is unreachable.
 */
export async function uploadExamImage(
  schoolId: string,
  examId: string,
  soalId: string,
  source: File | Blob | string,
  filename?: string,
  options?: {
    targetType?: 'soal' | 'pilihan';
    choiceLetter?: string;
    caption?: string;
    createdBy?: string;
    skipStorage?: boolean;
    timeoutMs?: number;
  }
): Promise<UploadedImageResult & { storageFailed?: boolean }> {
  const safeSchoolId = schoolId || db.getActiveSchoolId() || 'global';
  const safeExamId = examId || 'general';
  const targetType = options?.targetType || 'soal';
  const uploadTimeoutMs = options?.timeoutMs ?? 5500;

  // 1. Compress & optimize in browser first (saves bandwidth & storage, keeps aspect ratio)
  let optimized = await compressAndOptimizeImage(source);

  // 2. Generate unique image ID & storage path
  const imageId = generateImageId();
  const ext = optimized.mimeType === 'image/webp' ? 'webp' : optimized.mimeType === 'image/png' ? 'png' : 'jpg';
  const cleanFilename = (filename || 'image').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  const storagePath = `schools/${safeSchoolId}/exams/${safeExamId}/${soalId}_${imageId}_${cleanFilename}.${ext}`;

  let finalUrl = optimized.dataUrl;
  let finalStoragePath: string | undefined = undefined;
  let storageFailed = false;

  if (!options?.skipStorage) {
    try {
      const storageRef = ref(storage, storagePath);
      await withTimeout(
        (async () => {
          await uploadString(storageRef, optimized.dataUrl, 'data_url', {
            contentType: optimized.mimeType,
            customMetadata: {
              imageId,
              schoolId: safeSchoolId,
              examId: safeExamId,
              soalId: soalId || '',
              targetType,
              choiceLetter: options?.choiceLetter || '',
              uploadedAt: new Date().toISOString(),
            },
          });
          finalUrl = await getDownloadURL(storageRef);
        })(),
        uploadTimeoutMs,
        'Batas waktu unggah gambar ke Firebase Storage terlampaui.'
      );
      finalStoragePath = storagePath;
    } catch (storageErr) {
      storageFailed = true;
      console.warn('[ImageStorageService] Firebase Storage upload fallback to Data URI:', storageErr);
    }
  } else {
    storageFailed = true;
  }

  // If Storage is unavailable and fallback Data URI is still large, tighten compression so Firestore doc stays lightweight
  if (!finalStoragePath && finalUrl.startsWith('data:image/') && finalUrl.length > 130000) {
    try {
      const compact = await compressAndOptimizeImage(finalUrl, 850, 850, 0.7);
      if (compact.dataUrl.length < finalUrl.length) {
        optimized = compact;
        finalUrl = compact.dataUrl;
      }
    } catch {
      // Keep existing optimized Data URI
    }
  }

  // 3. Record metadata in Firestore exam_images collection without stalling publish flow
  const metaRecord: ExamImageMeta = {
    id: imageId,
    schoolId: safeSchoolId,
    ujianId: safeExamId,
    soalId: soalId || '',
    targetType,
    choiceLetter: options?.choiceLetter,
    url: finalUrl.length <= 240000 ? finalUrl : finalUrl.slice(0, 240000),
    storagePath: finalStoragePath,
    mimeType: optimized.mimeType,
    sizeBytes: optimized.sizeBytes,
    width: optimized.width,
    height: optimized.height,
    caption: options?.caption,
    createdBy: options?.createdBy,
    createdAt: new Date().toISOString(),
  };

  await withTimeout(
    db.saveExamImageMeta(metaRecord).catch((e) => {
      console.warn('[ImageStorageService] Metadata save warning:', e);
    }),
    3000,
    'Metadata gambar disimpan lokal'
  ).catch(() => {});

  return {
    imageId,
    url: finalUrl,
    storagePath: finalStoragePath,
    sizeBytes: optimized.sizeBytes,
    width: optimized.width,
    height: optimized.height,
    mimeType: optimized.mimeType,
    storageFailed,
  };
}

/**
 * Ensures all inline Data URI images across an exam's question list (from Word/PDF/Crop)
 * are uploaded to Firebase Storage (when reachable) or compacted safely so publishing never hangs.
 */
export async function uploadExamQuestionsImages(
  schoolId: string,
  examId: string,
  soalList: SoalUjian[],
  createdBy?: string,
  onProgress?: (message: string) => void
): Promise<SoalUjian[]> {
  const results: SoalUjian[] = [];
  let storageUnavailable = false;
  const uploadedCache = new Map<
    string,
    { url: string; imageId: string; storagePath?: string }
  >();
  let totalEmbeddedImages = 0;

  for (const s of soalList) {
    if (s.gambar && s.gambar.startsWith('data:image/')) totalEmbeddedImages++;
    if (s.pilihanGambar) {
      for (const val of Object.values(s.pilihanGambar)) {
        if (val && val.startsWith('data:image/')) totalEmbeddedImages++;
      }
    }
    if (Array.isArray(s.kontenElemen)) {
      for (const el of s.kontenElemen) {
        if (el.tipe === 'gambar' && el.url.startsWith('data:image/')) totalEmbeddedImages++;
      }
    }
    if (Array.isArray(s.gambarTambahan)) {
      for (const ex of s.gambarTambahan) {
        if (ex.url && ex.url.startsWith('data:image/')) totalEmbeddedImages++;
      }
    }
  }

  let processedImages = 0;

  const uploadWithDedup = async (
    soal: SoalUjian,
    idx: number,
    dataUri: string,
    suffix: string,
    targetType: 'soal' | 'pilihan',
    choiceLetter?: string,
    caption?: string
  ) => {
    const cached = uploadedCache.get(dataUri);
    if (cached) {
      processedImages++;
      return cached;
    }
    processedImages++;
    onProgress?.(`Mengoptimalkan & mengunggah gambar ${processedImages}/${totalEmbeddedImages}...`);
    const up = await uploadExamImage(
      schoolId,
      examId,
      soal.id,
      dataUri,
      `soal_${soal.nomor || idx + 1}_${suffix}`,
      {
        targetType,
        choiceLetter,
        caption,
        createdBy,
        skipStorage: storageUnavailable,
        timeoutMs: 5000,
      }
    );
    if (up.storageFailed) storageUnavailable = true;
    const entry = { url: up.url, imageId: up.imageId, storagePath: up.storagePath };
    uploadedCache.set(dataUri, entry);
    return entry;
  };

  for (let i = 0; i < soalList.length; i++) {
    const soal = { ...soalList[i] };

    // 1. Primary question image
    if (soal.gambar && soal.gambar.startsWith('data:image/')) {
      try {
        const up = await uploadWithDedup(
          soal,
          i,
          soal.gambar,
          'utama',
          'soal',
          undefined,
          soal.gambarCaption
        );
        soal.gambar = up.url;
        soal.gambarId = up.imageId;
        soal.gambarStoragePath = up.storagePath;
        soal.gambarStatus = 'ok';
      } catch (err: any) {
        storageUnavailable = true;
        soal.gambarStatus = 'warning';
        soal.gambarWarning = err?.message || 'Gagal mengunggah gambar ke cloud storage.';
      }
    }

    // 2. Ordered content blocks (kontenElemen) multi-image support
    if (Array.isArray(soal.kontenElemen) && soal.kontenElemen.length > 0) {
      const updatedBlocks = [];
      let blkImgIdx = 0;
      for (const el of soal.kontenElemen) {
        if (el.tipe === 'gambar' && el.url && el.url.startsWith('data:image/')) {
          blkImgIdx++;
          try {
            const up = await uploadWithDedup(
              soal,
              i,
              el.url,
              `blk_${blkImgIdx}`,
              'soal',
              undefined,
              el.caption
            );
            updatedBlocks.push({
              ...el,
              url: up.url,
              imageId: up.imageId,
              storagePath: up.storagePath,
            });
          } catch {
            storageUnavailable = true;
            updatedBlocks.push(el);
          }
        } else {
          updatedBlocks.push(el);
        }
      }
      soal.kontenElemen = updatedBlocks;
    }

    // 3. Additional question images (gambarTambahan)
    if (Array.isArray(soal.gambarTambahan) && soal.gambarTambahan.length > 0) {
      const updatedExtras = [];
      for (let exIdx = 0; exIdx < soal.gambarTambahan.length; exIdx++) {
        const ex = soal.gambarTambahan[exIdx];
        if (ex.url && ex.url.startsWith('data:image/')) {
          try {
            const up = await uploadWithDedup(
              soal,
              i,
              ex.url,
              `extra_${exIdx + 1}`,
              'soal',
              undefined,
              ex.caption
            );
            updatedExtras.push({
              ...ex,
              url: up.url,
              imageId: up.imageId,
              storagePath: up.storagePath,
            });
          } catch {
            storageUnavailable = true;
            updatedExtras.push(ex);
          }
        } else {
          updatedExtras.push(ex);
        }
      }
      soal.gambarTambahan = updatedExtras;
    }

    // 4. Choice images (A-E)
    if (soal.pilihanGambar) {
      const updatedChoices = { ...soal.pilihanGambar };
      const updatedMeta = { ...(soal.pilihanGambarMeta || {}) };

      for (const letter of Object.keys(updatedChoices)) {
        const imgVal = updatedChoices[letter];
        if (imgVal && imgVal.startsWith('data:image/')) {
          try {
            const up = await uploadWithDedup(
              soal,
              i,
              imgVal,
              `pilihan_${letter}`,
              'pilihan',
              letter
            );
            updatedChoices[letter] = up.url;
            updatedMeta[letter] = {
              imageId: up.imageId,
              storagePath: up.storagePath,
            };
          } catch {
            storageUnavailable = true;
          }
        }
      }

      soal.pilihanGambar = updatedChoices;
      if (Object.keys(updatedMeta).length > 0) {
        soal.pilihanGambarMeta = updatedMeta;
      }
    }

    results.push(soal);
  }

  return results;
}

/**
 * Deletes an image from Firebase Storage and removes its Firestore metadata doc if available.
 */
export async function deleteExamImage(
  storagePath?: string,
  schoolId?: string,
  imageId?: string
): Promise<boolean> {
  let deleted = false;
  if (storagePath) {
    try {
      const storageRef = ref(storage, storagePath);
      await deleteObject(storageRef);
      deleted = true;
    } catch (err) {
      console.warn('[ImageStorageService] Gagal menghapus gambar dari storage:', err);
    }
  }
  if (imageId) {
    await db.deleteExamImageMeta(schoolId || db.getActiveSchoolId(), imageId).catch(() => {});
  }
  return deleted;
}
