import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  ClipboardPaste,
  ImagePlus,
  Sparkles,
  Trash2,
  CheckCircle2,
  FileText,
  Info,
} from 'lucide-react';
import {
  extractPasteDataFromClipboard,
  parseContentEditableHtmlToExam,
  PasteParseExamResult,
  readBlobAsDataUrl,
} from '../../utils/examPasteParser';

interface ExamPasteEditorProps {
  onParsed: (result: PasteParseExamResult) => void;
  isProcessingExternal?: boolean;
}

export const ExamPasteEditor: React.FC<ExamPasteEditorProps> = ({
  onParsed,
  isProcessingExternal = false,
}) => {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [hasContent, setHasContent] = useState(false);
  const [imageCount, setImageCount] = useState(0);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [pasteWarnings, setPasteWarnings] = useState<string[]>([]);
  const [isPasting, setIsPasting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const syncEditorMetrics = () => {
    const el = editorRef.current;
    if (!el) return;
    const textLen = (el.textContent || '').trim().length;
    const imgs = el.querySelectorAll('img[src^="data:image/"], img[src^="http"]').length;
    const unresolved = el.querySelectorAll('[data-unresolved-image="true"]').length;
    setImageCount(imgs);
    setUnresolvedCount(unresolved);
    setHasContent(textLen > 0 || imgs > 0 || unresolved > 0);
  };

  const insertHtmlAtCursor = (html: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const temp = document.createElement('div');
      temp.innerHTML = html;
      const frag = document.createDocumentFragment();
      let lastNode: Node | null = null;
      while (temp.firstChild) {
        lastNode = frag.appendChild(temp.firstChild);
      }
      range.insertNode(frag);
      if (lastNode) {
        const nextRange = document.createRange();
        nextRange.setStartAfter(lastNode);
        nextRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(nextRange);
      }
    } else {
      el.insertAdjacentHTML('beforeend', html);
    }
    syncEditorMetrics();
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    setParseError(null);
    setIsPasting(true);

    try {
      const result = await extractPasteDataFromClipboard(e.clipboardData);
      if (result.htmlFragment) {
        insertHtmlAtCursor(result.htmlFragment);
      }
      if (result.warnings.length > 0) {
        setPasteWarnings((prev) => Array.from(new Set([...prev, ...result.warnings])));
      }
    } catch (err: any) {
      setPasteWarnings((prev) => [
        ...prev,
        err?.message || 'Gagal membaca konten clipboard. Coba tempel teks biasa atau sisipkan gambar manual.',
      ]);
    } finally {
      setIsPasting(false);
      syncEditorMetrics();
    }
  };

  const handleInsertImageFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setParseError(null);
    setIsPasting(true);
    try {
      const fragments: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;
        const dataUrl = await readBlobAsDataUrl(file);
        fragments.push(
          `<p><img src="${dataUrl}" alt="${file.name.replace(/"/g, '')}" style="max-width: 100%; max-height: 280px; border-radius: 8px; margin: 6px 0; display: block;" /></p>`
        );
      }
      if (fragments.length > 0) {
        insertHtmlAtCursor(fragments.join(''));
      }
    } catch {
      setParseError('Gagal membaca file gambar yang dipilih.');
    } finally {
      setIsPasting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      e.preventDefault();
      await handleInsertImageFiles(e.dataTransfer.files);
    }
  };

  const handleClear = () => {
    if (editorRef.current) {
      editorRef.current.innerHTML = '';
    }
    setHasContent(false);
    setImageCount(0);
    setUnresolvedCount(0);
    setPasteWarnings([]);
    setParseError(null);
  };

  const handleInsertSample = () => {
    const sampleHtml = `
      <p>1. Ibukota negara Republik Indonesia yang sedang berada di Pulau Jawa saat ini adalah...</p>
      <p>A. Surabaya</p>
      <p>B. Jakarta</p>
      <p>C. Bandung</p>
      <p>D. Yogyakarta</p>
      <p>Kunci: B</p>
      <p><br/></p>
      <p>II. BENAR / SALAH</p>
      <p>2. Air mendidih pada suhu 100 derajat Celcius pada tekanan udara 1 atm. (Benar/Salah)</p>
      <p>Kunci: Benar</p>
      <p><br/></p>
      <p>III. ISIAN SINGKAT</p>
      <p>3. Presiden pertama Republik Indonesia bernama Ir. ____</p>
      <p>Kunci: Soekarno; Sukarno</p>
    `.trim();
    if (editorRef.current) {
      editorRef.current.innerHTML = sampleHtml;
      syncEditorMetrics();
      setParseError(null);
    }
  };

  const handleProcessPaste = () => {
    const el = editorRef.current;
    if (!el) return;
    setParseError(null);

    const parsed = parseContentEditableHtmlToExam(el.innerHTML);
    if (!parsed.success || parsed.soalList.length === 0) {
      setParseError(
        parsed.error ||
          'Belum ada soal yang berhasil dikenali. Pastikan setiap soal diawali nomor urut (contoh: 1. Pertanyaan...) dan pilihan A, B, C, D.'
      );
      return;
    }
    onParsed(parsed);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header & Instructions */}
      <div className="px-4 sm:px-6 py-4 bg-gradient-to-r from-indigo-50/80 via-slate-50 to-white border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <ClipboardPaste className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">
              Editor Copy-Paste Soal Beserta Gambar
            </h3>
            <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
              Salin soal langsung dari Microsoft Word, Google Docs, PDF, atau browser lalu tempel (Ctrl+V / Tempel) di bawah. Gambar, tabel, pilihan A–E, Benar/Salah, Isian Singkat, dan Esai ikut terbaca otomatis.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold">
            <ImagePlus className="w-3.5 h-3.5 text-indigo-600" />
            {imageCount} Gambar
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(e) => handleInsertImageFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPasting || isProcessingExternal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/50 text-slate-700 text-xs font-semibold transition-colors shadow-xs"
          >
            <ImagePlus className="w-3.5 h-3.5 text-indigo-600" />
            + Sisipkan Gambar di Kursor
          </button>

          <button
            type="button"
            onClick={handleInsertSample}
            disabled={isPasting || isProcessingExternal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-medium transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            Contoh Format
          </button>
        </div>

        <button
          type="button"
          onClick={handleClear}
          disabled={!hasContent || isPasting || isProcessingExternal}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 disabled:opacity-40 text-xs font-semibold transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Bersihkan
        </button>
      </div>

      {/* Warnings */}
      {pasteWarnings.length > 0 && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Catatan Clipboard ({unresolvedCount > 0 ? `${unresolvedCount} gambar lokal perlu disisipkan` : 'Info'})</span>
          </div>
          {pasteWarnings.map((w, idx) => (
            <p key={idx} className="leading-relaxed pl-5">{w}</p>
          ))}
        </div>
      )}

      {parseError && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{parseError}</span>
        </div>
      )}

      {/* ContentEditable Surface */}
      <div className="p-4">
        <div className="relative">
          {!hasContent && (
            <div className="pointer-events-none absolute inset-4 flex flex-col items-center justify-center text-center text-slate-400 select-none">
              <ClipboardPaste className="w-8 h-8 mb-2 text-slate-300" />
              <p className="text-sm font-semibold text-slate-500">
                Tempelkan (Ctrl+V / Tempel) Naskah Soal & Gambar di Sini
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-md">
                Mendukung teks soal, pilihan A–E, gambar dari Word/Docs/screenshot, dan tabel data. Anda juga dapat drag & drop file gambar langsung ke kotak ini.
              </p>
            </div>
          )}

          <div
            ref={editorRef}
            contentEditable={!isProcessingExternal}
            suppressContentEditableWarning
            onPaste={handlePaste}
            onDrop={handleDrop}
            onInput={syncEditorMetrics}
            onKeyUp={syncEditorMetrics}
            className="min-h-[260px] max-h-[480px] overflow-y-auto w-full rounded-xl border-2 border-dashed border-slate-300 focus:border-indigo-500 focus:outline-none bg-slate-50/40 focus:bg-white p-4 text-sm text-slate-800 leading-relaxed transition-colors"
            style={{ wordBreak: 'break-word' }}
          />
        </div>

        {/* Helpful Tip + Submit CTA */}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2 text-xs text-slate-500">
            <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <span>
              Semua gambar yang ditempel otomatis dikonversi menjadi aset permanen sebelum ujian diterbitkan.
            </span>
          </div>

          <button
            type="button"
            onClick={handleProcessPaste}
            disabled={!hasContent || isPasting || isProcessingExternal}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-sm shadow-sm transition-all"
          >
            {isPasting || isProcessingExternal ? (
              <>
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Memproses Tempelan...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                BACA DAN BUAT SOAL
              </>
            )}
          </button>
        </div>

        {imageCount > 0 && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{imageCount} gambar terdeteksi dan siap dipasangkan ke posisi soal/pilihan jawaban terkait.</span>
          </div>
        )}
      </div>
    </div>
  );
};
