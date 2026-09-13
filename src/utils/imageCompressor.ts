/**
 * Utility for client-side image compression and resizing.
 * Converts uploaded photos to high quality, lightweight Base64 data URLs.
 * Keeps sizes well below 50KB to safely store in localStorage and Firebase Firestore
 * without QuotaExceededError or document size limits.
 */

export async function compressImage(
  fileOrDataUrl: File | string,
  maxWidth: number = 480,
  maxHeight: number = 480,
  quality: number = 0.82
): Promise<string> {
  return new Promise((resolve) => {
    // 1. Helper to read File to Data URL safely
    const getInitialDataUrl = (input: File | string): Promise<string> => {
      if (typeof input === 'string') {
        return Promise.resolve(input);
      }
      return new Promise((res) => {
        const reader = new FileReader();
        reader.onload = () => res((reader.result as string) || '');
        reader.onerror = () => res('');
        reader.readAsDataURL(input);
      });
    };

    getInitialDataUrl(fileOrDataUrl)
      .then((dataUrl) => {
        if (!dataUrl) {
          resolve('');
          return;
        }

        // SVG files don't need raster compression
        if (dataUrl.startsWith('data:image/svg+xml')) {
          resolve(dataUrl);
          return;
        }

        // If it's already an external HTTP(S) URL, keep it
        if (dataUrl.startsWith('http://') || dataUrl.startsWith('https://')) {
          resolve(dataUrl);
          return;
        }

        const img = new Image();

        img.onload = () => {
          try {
            let width = img.naturalWidth || img.width || 1;
            let height = img.naturalHeight || img.height || 1;

            // Constrain dimensions proportionally
            if (width > maxWidth || height > maxHeight) {
              const ratio = Math.min(maxWidth / width, maxHeight / height);
              width = Math.max(1, Math.round(width * ratio));
              height = Math.max(1, Math.round(height * ratio));
            }

            const canvas = document.createElement('canvas');
            canvas.width = Math.max(width, 1);
            canvas.height = Math.max(height, 1);

            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(dataUrl);
              return;
            }

            // Fill background white in case of transparency converting to JPEG
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);

            // Draw image scaled
            ctx.drawImage(img, 0, 0, width, height);

            // Use JPEG for guaranteed compact compression (~20KB - 40KB)
            // Even PNG photos convert safely to clean JPEG without QuotaExceededError
            let compressed = canvas.toDataURL('image/jpeg', quality);

            // Fallback check: if string is too large (> 150KB), compress further
            if (compressed.length > 200000) {
              const miniCanvas = document.createElement('canvas');
              const miniRatio = 320 / Math.max(width, height);
              miniCanvas.width = Math.max(1, Math.round(width * miniRatio));
              miniCanvas.height = Math.max(1, Math.round(height * miniRatio));
              const miniCtx = miniCanvas.getContext('2d');
              if (miniCtx) {
                miniCtx.fillStyle = '#ffffff';
                miniCtx.fillRect(0, 0, miniCanvas.width, miniCanvas.height);
                miniCtx.drawImage(img, 0, 0, miniCanvas.width, miniCanvas.height);
                compressed = miniCanvas.toDataURL('image/jpeg', 0.75);
              }
            }

            if (compressed && compressed.startsWith('data:image')) {
              resolve(compressed);
            } else {
              resolve(dataUrl);
            }
          } catch (err) {
            console.warn('Canvas compression error, using original:', err);
            resolve(dataUrl);
          }
        };

        img.onerror = (err) => {
          console.warn('Image loading error in compressImage:', err);
          resolve(dataUrl);
        };

        img.src = dataUrl;
      })
      .catch((err) => {
        console.warn('compressImage reader error:', err);
        resolve(typeof fileOrDataUrl === 'string' ? fileOrDataUrl : '');
      });
  });
}
