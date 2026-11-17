import React from 'react';
import { RefreshCw, ZoomIn } from 'lucide-react';
import { KontenElemenSoal, SoalUjian } from '../../types';

interface ExamRichContentProps {
  soal: SoalUjian;
  displayNumber: number;
  imageLoadErrors: Record<string, boolean>;
  imageRetryNonce: number;
  onImageError: (imgKey: string) => void;
  onRetryImage: (imgKey: string) => void;
  onOpenLightbox: (payload: { imageUrl: string; title: string; caption?: string }) => void;
  compact?: boolean;
}

/**
 * Safely formats mathematical tokens (^2, _{n}, x^3, <=, >=, !=, sqrt()) into React nodes
 * without dangerouslySetInnerHTML so formulas display legibly with zero XSS risk.
 */
export function renderMathAndTextInline(text: string): React.ReactNode[] {
  if (!text) return [];
  // Normalize common ASCII operators gracefully while preserving exact values
  const normalized = text
    .replace(/<=/g, ' ≤ ')
    .replace(/>=/g, ' ≥ ')
    .replace(/!=/g, ' ≠ ')
    .replace(/\+-/g, ' ± ');

  const tokenRegex = /(\^\{[^}]+\}|\^[A-Za-z0-9+\-()]+|_\{[^}]+\}|_[A-Za-z0-9]+)/g;
  const nodes: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let k = 0;

  while ((match = tokenRegex.exec(normalized)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(normalized.slice(lastIdx, match.index));
    }
    const token = match[0];
    if (token.startsWith('^')) {
      const inner = token.startsWith('^{') ? token.slice(2, -1) : token.slice(1);
      nodes.push(
        <sup key={`sup-${k++}`} className="text-[0.75em] font-semibold">
          {inner}
        </sup>
      );
    } else if (token.startsWith('_')) {
      const inner = token.startsWith('_{') ? token.slice(2, -1) : token.slice(1);
      nodes.push(
        <sub key={`sub-${k++}`} className="text-[0.75em] font-semibold">
          {inner}
        </sub>
      );
    }
    lastIdx = match.index + token.length;
  }

  if (lastIdx < normalized.length) {
    nodes.push(normalized.slice(lastIdx));
  }

  return nodes;
}

/**
 * Renders Markdown tables cleanly inside horizontal-scroll containers for Android mobile safety.
 */
export function renderMarkdownTableBlock(tableLines: string[], blockKey: string): React.ReactNode {
  const parsedRows = tableLines
    .map((row) =>
      row
        .trim()
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim())
    )
    .filter((cells) => cells.length > 0 && !cells.every((c) => /^:?-+:?$/.test(c)));

  if (parsedRows.length === 0) return null;

  const headerRow = parsedRows.length > 1 ? parsedRows[0] : null;
  const bodyRows = parsedRows.length > 1 ? parsedRows.slice(1) : parsedRows;

  return (
    <div key={blockKey} className="overflow-x-auto max-w-full my-2 rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-xs sm:text-sm text-left border-collapse">
        {headerRow && (
          <thead className="bg-slate-100 text-slate-800 font-bold">
            <tr>
              {headerRow.map((cell, ci) => (
                <th key={ci} className="px-3 py-2 border-b border-r last:border-r-0 border-slate-200">
                  {renderMathAndTextInline(cell)}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-slate-200 bg-white">
          {bodyRows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 border-r last:border-r-0 border-slate-200 text-slate-700">
                  {renderMathAndTextInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Renders text lines while recognizing embedded Markdown tables and inline math notations.
 */
export function renderLinesWithTables(lines: string[], prefixKey: string): React.ReactNode {
  if (lines.length === 0) return null;
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }
      const tbl = renderMarkdownTableBlock(tableLines, `${prefixKey}-tbl-${i}`);
      if (tbl) nodes.push(tbl);
    } else {
      nodes.push(
        <p key={`${prefixKey}-p-${i}`} className="break-words">
          {renderMathAndTextInline(line)}
        </p>
      );
      i++;
    }
  }

  return (
    <div className="text-sm sm:text-base text-slate-900 leading-relaxed font-medium whitespace-pre-line space-y-2 break-words">
      {nodes}
    </div>
  );
}

export const ExamRichContent: React.FC<ExamRichContentProps> = ({
  soal,
  displayNumber,
  imageLoadErrors,
  imageRetryNonce,
  onImageError,
  onRetryImage,
  onOpenLightbox,
  compact = false,
}) => {
  const renderSingleImage = (
    url: string,
    keySuffix: string,
    caption?: string,
    ukuran?: 'kecil' | 'sedang' | 'besar' | 'asli',
    altLabel?: string
  ) => {
    const qImgKey = `${soal.id}_${keySuffix}_${imageRetryNonce}`;
    const sizeClass = compact
      ? 'max-w-xs'
      : ukuran === 'kecil'
      ? 'max-w-xs'
      : ukuran === 'besar'
      ? 'max-w-2xl'
      : ukuran === 'asli'
      ? 'max-w-full'
      : 'max-w-md';

    if (imageLoadErrors[qImgKey]) {
      return (
        <div
          key={`err-${qImgKey}`}
          className="my-2 p-4 rounded-2xl border border-amber-200 bg-amber-50 text-center space-y-2 max-w-md mx-auto"
        >
          <p className="text-xs font-bold text-amber-800">
            Gambar soal gagal dimuat. Periksa koneksi internet Anda.
          </p>
          <button
            type="button"
            onClick={() => onRetryImage(qImgKey)}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Muat Ulang Gambar</span>
          </button>
        </div>
      );
    }

    return (
      <div key={`img-${qImgKey}`} className="space-y-1.5 my-2">
        <div
          onClick={() =>
            onOpenLightbox({
              imageUrl: url,
              title: `Gambar Soal Nomor ${displayNumber}`,
              caption,
            })
          }
          className={`relative group rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 p-2 mx-auto cursor-zoom-in transition-all hover:border-blue-400 hover:shadow-md w-full ${sizeClass}`}
        >
          <img
            key={qImgKey}
            src={url}
            alt={caption || altLabel || `Gambar Soal ${displayNumber}`}
            className={`${compact ? 'max-h-48' : 'max-h-80'} w-auto max-w-full h-auto object-contain mx-auto rounded-xl select-none`}
            loading="lazy"
            onError={() => onImageError(qImgKey)}
          />
          <div className="absolute inset-0 bg-blue-900/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl pointer-events-none">
            <span className="px-3 py-1.5 rounded-xl bg-white/95 text-blue-900 text-xs font-bold shadow-md flex items-center gap-1.5 backdrop-blur-xs">
              <ZoomIn className="w-3.5 h-3.5" />
              <span>Perbesar Gambar</span>
            </span>
          </div>
        </div>
        {caption && (
          <p className="text-[11px] text-center text-slate-500 font-medium italic">
            {caption}
          </p>
        )}
      </div>
    );
  };

  // Prefer ordered document blocks when available AND consistent with attached gambar
  const hasOrderedBlocks = Array.isArray(soal.kontenElemen) && soal.kontenElemen.length > 0;

  if (hasOrderedBlocks) {
    const blocks = soal.kontenElemen as KontenElemenSoal[];
    const hasPrimaryImgInBlocks =
      !soal.gambar || blocks.some((b) => b.tipe === 'gambar' && b.url === soal.gambar);

    return (
      <div className="space-y-2.5">
        {!hasPrimaryImgInBlocks &&
          soal.gambar &&
          (soal.gambarPosisi || 'atas') === 'atas' &&
          renderSingleImage(soal.gambar, 'primary', soal.gambarCaption, soal.gambarUkuran)}

        {blocks.map((block, bIdx) => {
          if (block.tipe === 'gambar') {
            return renderSingleImage(
              block.url,
              `blk_${bIdx}`,
              block.caption || (bIdx === 0 ? soal.gambarCaption : undefined),
              block.ukuran || soal.gambarUkuran,
              `Gambar Soal ${displayNumber} #${bIdx + 1}`
            );
          }
          if (block.tipe === 'tabel') {
            const tblLines = block.markdown
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter(Boolean);
            return renderMarkdownTableBlock(tblLines, `${soal.id}_tbl_${bIdx}`);
          }
          if (block.tipe === 'rumus') {
            return (
              <div
                key={`${soal.id}_math_${bIdx}`}
                className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-serif text-sm sm:text-base overflow-x-auto"
              >
                {renderMathAndTextInline(block.isi)}
              </div>
            );
          }
          const lines = (block.isi || '')
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);
          return (
            <React.Fragment key={`${soal.id}_txt_${bIdx}`}>
              {renderLinesWithTables(lines, `${soal.id}_b_${bIdx}`)}
            </React.Fragment>
          );
        })}

        {!hasPrimaryImgInBlocks &&
          soal.gambar &&
          (soal.gambarPosisi === 'tengah' || soal.gambarPosisi === 'bawah') &&
          renderSingleImage(soal.gambar, 'primary_after', soal.gambarCaption, soal.gambarUkuran)}
      </div>
    );
  }

  // Fallback legacy rendering with positional layout (atas / tengah / bawah) + gambarTambahan
  const pos = soal.gambarPosisi || 'atas';
  const qText = (soal.pertanyaan || '').trim();
  const isPlaceholderImagePrompt = qText === '(Perhatikan gambar berikut)';
  const paragraphs = qText
    ? qText
        .split(/\r?\n+/)
        .map((p) => p.trim())
        .filter(Boolean)
    : [];
  const canSplitMiddle = pos === 'tengah' && paragraphs.length >= 2;
  const splitPoint = canSplitMiddle ? Math.ceil(paragraphs.length / 2) : paragraphs.length;
  const topParagraphs = canSplitMiddle
    ? paragraphs.slice(0, splitPoint)
    : pos === 'tengah' || pos === 'bawah'
    ? paragraphs
    : [];
  const bottomParagraphs = canSplitMiddle ? paragraphs.slice(splitPoint) : pos === 'atas' ? paragraphs : [];

  return (
    <div className="space-y-2.5">
      {pos === 'atas' &&
        soal.gambar &&
        renderSingleImage(soal.gambar, 'q', soal.gambarCaption, soal.gambarUkuran)}

      {!isPlaceholderImagePrompt && renderLinesWithTables(topParagraphs, `${soal.id}_top`)}

      {(pos === 'tengah' || pos === 'bawah') &&
        soal.gambar &&
        renderSingleImage(soal.gambar, 'q', soal.gambarCaption, soal.gambarUkuran)}

      {!isPlaceholderImagePrompt && renderLinesWithTables(bottomParagraphs, `${soal.id}_bot`)}

      {Array.isArray(soal.gambarTambahan) &&
        soal.gambarTambahan.map((extra, exIdx) =>
          renderSingleImage(extra.url, `extra_${exIdx}`, extra.caption, soal.gambarUkuran)
        )}
    </div>
  );
};
