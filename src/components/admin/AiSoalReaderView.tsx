import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Upload,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Play,
  Sparkles,
  Eye,
  EyeOff,
  Download,
  Save,
  History,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  X,
  FolderOpen,
  Layers,
  Loader2,
  HelpCircle,
  Search,
  ZoomIn,
} from 'lucide-react';
import {
  AiReaderQuestionItem,
  AiReaderSessionRecord,
  AiReaderValidationReport,
  User,
} from '../../types';
import { db } from '../../services/database';
import {
  AiReaderProgressState,
  AiReaderUploadedFilePreview,
  answerQuestionsInBatches,
  isSupportedAiReaderFile,
  prepareFilesForAiReader,
  readQuestionsFromPreparedFiles,
  validateAiReaderResult,
} from '../../services/aiQuestionReaderService';
import {
  exportAiReaderToDocx,
  exportAiReaderToPdf,
} from '../../utils/documentExporter';

interface AiSoalReaderViewProps {
  currentUser: User;
}

type QuestionFilter = 'semua' | 'terjawab' | 'belum' | 'perlu_cek' | 'visual';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Renders text that may contain Markdown tables (`| a | b |`) and Markdown prose
 * cleanly without relying on dangerouslySetInnerHTML or external GFM plugins.
 */
const StructuredContentBlock: React.FC<{ content: string; compact?: boolean }> = ({
  content,
  compact = false,
}) => {
  const blocks = useMemo(() => {
    const lines = String(content || '').split('\n');
    const result: Array<
      | { kind: 'text'; text: string }
      | { kind: 'table'; headers: string[]; rows: string[][] }
    > = [];

    let textBuffer: string[] = [];
    let i = 0;

    const flushText = () => {
      if (textBuffer.length > 0) {
        result.push({ kind: 'text', text: textBuffer.join('\n') });
        textBuffer = [];
      }
    };

    const parsePipeRow = (line: string): string[] =>
      line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim());

    while (i < lines.length) {
      const line = lines[i];
      const next = lines[i + 1];
      const looksLikeTableHeader =
        line.trim().startsWith('|') &&
        next &&
        /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(next.trim());

      if (looksLikeTableHeader) {
        flushText();
        const headers = parsePipeRow(line);
        i += 2; // Skip header and separator row
        const rows: string[][] = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          rows.push(parsePipeRow(lines[i]));
          i++;
        }
        result.push({ kind: 'table', headers, rows });
      } else {
        textBuffer.push(line);
        i++;
      }
    }
    flushText();
    return result;
  }, [content]);

  return (
    <div className={compact ? 'space-y-2 text-sm' : 'space-y-3 text-sm sm:text-[15px]'}>
      {blocks.map((blk, idx) =>
        blk.kind === 'table' ? (
          <div
            key={idx}
            className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-950/70"
          >
            <table className="w-full text-left text-xs sm:text-sm border-collapse">
              <thead className="bg-slate-800/90 text-slate-200">
                <tr>
                  {blk.headers.map((h, hIdx) => (
                    <th
                      key={hIdx}
                      className="px-3 py-2 font-semibold border-b border-r last:border-r-0 border-slate-700 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {blk.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-800/40">
                    {blk.headers.map((_, cIdx) => (
                      <td
                        key={cIdx}
                        className="px-3 py-2 border-r last:border-r-0 border-slate-800 align-top"
                      >
                        {row[cIdx] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            key={idx}
            className="prose prose-invert prose-sm max-w-none leading-relaxed text-slate-100 whitespace-pre-line break-words [&_p]:my-1 [&_strong]:text-white [&_code]:bg-slate-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded"
          >
            <ReactMarkdown>{blk.text}</ReactMarkdown>
          </div>
        )
      )}
    </div>
  );
};

export const AiSoalReaderView: React.FC<AiSoalReaderViewProps> = ({ currentUser }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const questionRefs = useRef<Record<string, HTMLElement | null>>({});

  const [preparedFiles, setPreparedFiles] = useState<AiReaderUploadedFilePreview[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number>(0);
  const [selectedPreviewPageIndex, setSelectedPreviewPageIndex] = useState<number>(0);
  const [showDocPreview, setShowDocPreview] = useState<boolean>(true);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const [sessionId, setSessionId] = useState<string>('');
  const [judulDokumen, setJudulDokumen] = useState<string>('');
  const [soalList, setSoalList] = useState<AiReaderQuestionItem[]>([]);
  const [validation, setValidation] = useState<AiReaderValidationReport | null>(null);

  const [progress, setProgress] = useState<AiReaderProgressState | null>(null);
  const [isPreparing, setIsPreparing] = useState<boolean>(false);
  const [isReading, setIsReading] = useState<boolean>(false);
  const [isAnswering, setIsAnswering] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const [showPembahasan, setShowPembahasan] = useState<boolean>(true);
  const [filterMode, setFilterMode] = useState<QuestionFilter>('semua');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeQuestionId, setActiveQuestionId] = useState<string>('');
  const [lightboxImageUri, setLightboxImageUri] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);

  const [savedSessions, setSavedSessions] = useState<AiReaderSessionRecord[]>(() =>
    db.getAiReaderSessions()
  );
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);

  const schoolInfo = useMemo(() => db.getSekolah(), []);

  useEffect(() => {
    const syncHistory = () => setSavedSessions(db.getAiReaderSessions());
    window.addEventListener('ai_soal_reader_updated', syncHistory);
    window.addEventListener('data_ai_soal_reader_changed', syncHistory);
    return () => {
      window.removeEventListener('ai_soal_reader_updated', syncHistory);
      window.removeEventListener('data_ai_soal_reader_changed', syncHistory);
    };
  }, []);

  const isBusy = isPreparing || isReading || isAnswering;

  const activeFile = preparedFiles[selectedFileIndex] || null;
  const activePreviewPages = activeFile?.previewPages || [];
  const activePage = activePreviewPages[selectedPreviewPageIndex] || null;

  const handleFilesAdded = async (incomingFiles: FileList | File[]) => {
    const arr = Array.from(incomingFiles || []);
    if (arr.length === 0) return;

    setErrorMsg(null);
    setNoticeMsg(null);

    const validFiles = arr.filter(isSupportedAiReaderFile);
    const rejectedFiles = arr.filter((f) => !isSupportedAiReaderFile(f));

    if (rejectedFiles.length > 0) {
      setErrorMsg(
        `Format tidak didukung (${rejectedFiles.map((f) => f.name).join(', ')}). Gunakan PDF, DOC, DOCX, XLS, XLSX, JPG, JPEG, atau PNG.`
      );
    }
    if (validFiles.length === 0) return;

    setIsPreparing(true);
    try {
      const prepared = await prepareFilesForAiReader(validFiles, (p) => setProgress(p));
      setPreparedFiles((prev) => {
        const next = [...prev, ...prepared];
        if (prev.length === 0) {
          setSelectedFileIndex(0);
          setSelectedPreviewPageIndex(0);
        }
        return next;
      });
      setShowDocPreview(true);
      setNoticeMsg(
        `${prepared.length} berkas siap dibaca. Klik "Mulai Membaca" untuk mengekstrak seluruh soal secara berurutan.`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menyiapkan berkas yang diunggah.');
    } finally {
      setIsPreparing(false);
      setProgress(null);
    }
  };

  const handleRemoveFile = (fileId: string) => {
    setPreparedFiles((prev) => {
      const next = prev.filter((f) => f.id !== fileId);
      if (selectedFileIndex >= next.length) {
        setSelectedFileIndex(Math.max(0, next.length - 1));
        setSelectedPreviewPageIndex(0);
      }
      return next;
    });
  };

  const handleClearWorkspace = () => {
    if (isBusy) return;
    setPreparedFiles([]);
    setSelectedFileIndex(0);
    setSelectedPreviewPageIndex(0);
    setSessionId('');
    setJudulDokumen('');
    setSoalList([]);
    setValidation(null);
    setActiveQuestionId('');
    setErrorMsg(null);
    setNoticeMsg(null);
  };

  const handleStartReading = async () => {
    if (preparedFiles.length === 0) {
      setErrorMsg('Unggah minimal 1 berkas soal terlebih dahulu (PDF, Word, Excel, atau Gambar).');
      return;
    }
    setErrorMsg(null);
    setNoticeMsg(null);
    setIsReading(true);

    try {
      const result = await readQuestionsFromPreparedFiles(preparedFiles, (p) => setProgress(p));
      const newSessionId = sessionId || `air-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setSessionId(newSessionId);
      setJudulDokumen(result.judul);
      setSoalList(result.soalList);
      setValidation(result.validation);
      if (result.soalList.length === 0) {
        setErrorMsg(
          'Tidak ada butir soal yang berhasil dikenali. Pastikan berkas mengikuti pola standar soal (1., 2., dan/atau pilihan A, B, C, D).'
        );
      } else {
        setActiveQuestionId(result.soalList[0].id);
        setNoticeMsg(
          `Berhasil membaca ${result.soalList.length} soal dari ${preparedFiles.length} berkas. Klik "Mulai Menjawab" untuk menghasilkan jawaban & pembahasan.`
        );
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal membaca soal dari berkas.');
    } finally {
      setIsReading(false);
      setProgress(null);
    }
  };

  const handleStartAnswering = async () => {
    if (soalList.length === 0) {
      setErrorMsg('Belum ada daftar soal yang dibaca. Jalankan "Mulai Membaca" terlebih dahulu.');
      return;
    }
    setErrorMsg(null);
    setNoticeMsg(null);
    setIsAnswering(true);

    try {
      const answered = await answerQuestionsInBatches(soalList, preparedFiles, (p) =>
        setProgress(p)
      );
      const nextValidation = validateAiReaderResult(
        answered,
        validation?.peringatanHalaman || []
      );
      setSoalList(answered);
      setValidation(nextValidation);
      setShowPembahasan(true);

      const solvedCount = answered.filter((q) => q.statusJawaban === 'terjawab').length;
      setNoticeMsg(
        `Selesai memproses jawaban untuk ${solvedCount} dari ${answered.length} soal.`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menghasilkan jawaban dan pembahasan soal.');
    } finally {
      setIsAnswering(false);
      setProgress(null);
    }
  };

  const buildCurrentSessionRecord = (): AiReaderSessionRecord => {
    const activeReport =
      validation || validateAiReaderResult(soalList, []);
    const now = new Date().toISOString();
    const existing = savedSessions.find((s) => s.id === sessionId);
    const fileNames =
      preparedFiles.length > 0
        ? preparedFiles.map((f) => f.fileName)
        : existing?.namaFiles || [];

    return {
      id: sessionId || `air-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      schoolId: db.getActiveSchoolId(),
      guruId: currentUser.guruId || currentUser.id,
      guruName: currentUser.name,
      judul: judulDokumen.trim() || 'Hasil Pembacaan Soal AI',
      namaFiles: fileNames,
      soalList,
      validation: activeReport,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
  };

  const handleSaveSession = () => {
    if (soalList.length === 0) {
      setErrorMsg('Belum ada hasil pembacaan soal untuk disimpan.');
      return;
    }
    setErrorMsg(null);
    const record = buildCurrentSessionRecord();
    const saved = db.saveAiReaderSession(record);
    setSessionId(saved.id);
    setNoticeMsg(`Hasil pembacaan "${saved.judul}" berhasil disimpan ke riwayat sekolah.`);
  };

  const handleLoadSession = (record: AiReaderSessionRecord) => {
    setSessionId(record.id);
    setJudulDokumen(record.judul);
    setSoalList(record.soalList || []);
    setValidation(record.validation || validateAiReaderResult(record.soalList || []));
    setPreparedFiles([]);
    setShowDocPreview(false);
    setShowHistoryModal(false);
    setErrorMsg(null);
    setNoticeMsg(`Memuat hasil tersimpan: "${record.judul}" (${record.soalList.length} soal).`);
    if (record.soalList?.[0]) {
      setActiveQuestionId(record.soalList[0].id);
    }
  };

  const handleDeleteSavedSession = (id: string) => {
    db.deleteAiReaderSession(id);
    if (sessionId === id) {
      setSessionId('');
    }
  };

  const handleExportPdf = () => {
    if (soalList.length === 0) {
      setErrorMsg('Belum ada soal yang siap diekspor ke PDF.');
      return;
    }
    setErrorMsg(null);
    try {
      exportAiReaderToPdf(buildCurrentSessionRecord(), schoolInfo.nama);
      setNoticeMsg('Berkas PDF hasil pembacaan soal berhasil diunduh.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal mengekspor hasil ke PDF.');
    }
  };

  const handleExportDocx = async () => {
    if (soalList.length === 0) {
      setErrorMsg('Belum ada soal yang siap diekspor ke Word (.docx).');
      return;
    }
    setErrorMsg(null);
    setIsExporting(true);
    try {
      await exportAiReaderToDocx(buildCurrentSessionRecord(), schoolInfo.nama);
      setNoticeMsg('Berkas Word (.docx) hasil pembacaan soal berhasil diunduh.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal mengekspor hasil ke Word.');
    } finally {
      setIsExporting(false);
    }
  };

  const stats = useMemo(() => {
    const terjawab = soalList.filter((q) => q.statusJawaban === 'terjawab').length;
    const belum = soalList.filter((q) => q.statusJawaban === 'belum_dijawab').length;
    const perluCek = soalList.filter(
      (q) =>
        q.statusTerbaca !== 'terbaca' ||
        q.statusJawaban === 'informasi_tidak_cukup' ||
        q.statusJawaban === 'tidak_terbaca'
    ).length;
    const visual = soalList.filter((q) => Boolean(q.mengandungVisual)).length;
    return { terjawab, belum, perluCek, visual };
  }, [soalList]);

  const filteredQuestions = useMemo(() => {
    const qLower = searchQuery.trim().toLowerCase();
    return soalList.filter((item) => {
      if (filterMode === 'terjawab' && item.statusJawaban !== 'terjawab') return false;
      if (filterMode === 'belum' && item.statusJawaban !== 'belum_dijawab') return false;
      if (
        filterMode === 'perlu_cek' &&
        item.statusTerbaca === 'terbaca' &&
        item.statusJawaban !== 'informasi_tidak_cukup' &&
        item.statusJawaban !== 'tidak_terbaca'
      ) {
        return false;
      }
      if (filterMode === 'visual' && !item.mengandungVisual) return false;
      if (qLower) {
        const hay = `${item.nomor} ${item.pertanyaan} ${item.jawaban || ''} ${item.pembahasan || ''}`.toLowerCase();
        if (!hay.includes(qLower)) return false;
      }
      return true;
    });
  }, [soalList, filterMode, searchQuery]);

  const jumpToQuestion = (id: string) => {
    setActiveQuestionId(id);
    if (filterMode !== 'semua') {
      setFilterMode('semua');
    }
    setTimeout(() => {
      const el = questionRefs.current[id];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  };

  const progressPercent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : 0;

  return (
    <div className="bg-slate-950 text-slate-100 rounded-2xl border border-slate-800 shadow-xl p-4 sm:p-6 space-y-5">
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
            AI Pembaca Soal Otomatis Berbasis File
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Baca seluruh soal secara bertahap dari PDF, Word (.doc/.docx), Excel (.xls/.xlsx), dan Gambar (JPG/PNG) beserta jawaban dan pembahasannya.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowHistoryModal(true)}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs sm:text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
          >
            <History className="w-4 h-4 text-sky-400" />
            <span>Riwayat Tersimpan ({savedSessions.length})</span>
          </button>

          {(preparedFiles.length > 0 || soalList.length > 0) && (
            <button
              type="button"
              disabled={isBusy}
              onClick={handleClearWorkspace}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs sm:text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-50 cursor-pointer transition-colors"
            >
              <Trash2 className="w-4 h-4 text-rose-400" />
              <span>Bersihkan</span>
            </button>
          )}
        </div>
      </div>

      {/* Upload Dropzone & Queued Files */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div
          className={`xl:col-span-5 rounded-xl border-2 border-dashed p-5 transition-colors flex flex-col justify-between gap-4 ${
            isDragging
              ? 'border-sky-500 bg-sky-950/30'
              : 'border-slate-700 bg-slate-900/70 hover:border-slate-600'
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              handleFilesAdded(e.dataTransfer.files);
            }
          }}
        >
          <div className="flex flex-col items-center text-center py-2">
            <div className="w-12 h-12 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center mb-3">
              <Upload className="w-6 h-6 text-sky-400" />
            </div>
            <h3 className="text-sm font-bold text-white">
              Unggah Satu atau Banyak Berkas Soal
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Mendukung PDF, DOC, DOCX, XLS, XLSX, JPG, JPEG, dan PNG. Dokumen panjang (50+ soal) diproses bertahap halaman demi halaman.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFilesAdded(e.target.files);
                  e.target.value = '';
                }
              }}
              className="hidden"
            />
            <button
              type="button"
              disabled={isBusy}
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 min-h-[44px] px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-50 cursor-pointer transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              <span>Pilih Berkas (Multi-File)</span>
            </button>
          </div>

          {preparedFiles.length > 0 && (
            <div className="space-y-2 border-t border-slate-800 pt-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-300">
                  Berkas Antrean ({preparedFiles.length})
                </span>
                <button
                  type="button"
                  onClick={() => setShowDocPreview((prev) => !prev)}
                  className="text-sky-400 hover:text-sky-300 font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  {showDocPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showDocPreview ? 'Tutup Pratinjau' : 'Pratinjau Dokumen'}</span>
                </button>
              </div>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {preparedFiles.map((f, fIdx) => {
                  const isSelected = fIdx === selectedFileIndex;
                  const Icon =
                    f.fileType === 'xls' || f.fileType === 'xlsx'
                      ? FileSpreadsheet
                      : f.fileType === 'image'
                      ? ImageIcon
                      : FileText;
                  return (
                    <div
                      key={f.id}
                      onClick={() => {
                        setSelectedFileIndex(fIdx);
                        setSelectedPreviewPageIndex(0);
                        setShowDocPreview(true);
                      }}
                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-sky-950/50 border-sky-600/70 text-white'
                          : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className="w-4 h-4 text-sky-400 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{f.fileName}</div>
                          <div className="text-[11px] text-slate-400 tabular-nums">
                            {f.fileType.toUpperCase()} · {formatBytes(f.sizeBytes)}
                            {f.pageCount ? ` · ${f.pageCount} halaman` : ''}
                            {f.previewTables ? ` · ${f.previewTables.length} sheet` : ''}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveFile(f.id);
                        }}
                        aria-label={`Hapus ${f.fileName}`}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Interactive Document Preview Panel */}
        <div className="xl:col-span-7 rounded-xl border border-slate-800 bg-slate-900/70 p-4 flex flex-col justify-between min-h-[260px]">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-bold text-white">Pratinjau Dokumen</h3>
              {activeFile && (
                <span className="text-xs text-slate-400 truncate max-w-[220px] sm:max-w-xs">
                  · {activeFile.fileName}
                </span>
              )}
            </div>

            {activePreviewPages.length > 1 && showDocPreview && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={selectedPreviewPageIndex === 0}
                  onClick={() => setSelectedPreviewPageIndex((p) => Math.max(0, p - 1))}
                  className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono text-slate-300 tabular-nums px-2">
                  Hal {selectedPreviewPageIndex + 1} / {activePreviewPages.length}
                </span>
                <button
                  type="button"
                  disabled={selectedPreviewPageIndex >= activePreviewPages.length - 1}
                  onClick={() =>
                    setSelectedPreviewPageIndex((p) =>
                      Math.min(activePreviewPages.length - 1, p + 1)
                    )
                  }
                  className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {!activeFile || !showDocPreview ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8 text-slate-500">
              <FileText className="w-8 h-8 mb-2 opacity-60" />
              <p className="text-xs sm:text-sm max-w-md">
                {activeFile
                  ? 'Pratinjau dokumen sedang disembunyikan. Klik "Pratinjau Dokumen" untuk membuka kembali.'
                  : 'Pratinjau halaman PDF, gambar soal, sheet Excel, atau teks Word akan tampil di sini.'}
              </p>
            </div>
          ) : (
            <div className="flex-1 pt-3 overflow-auto max-h-[340px] space-y-3">
              {activeFile.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-200 space-y-1">
                  {activeFile.warnings.map((w, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {activePage ? (
                <div className="flex flex-col items-center gap-2">
                  <img
                    src={activePage.dataUri}
                    alt={`${activeFile.fileName} Halaman ${activePage.pageNumber}`}
                    onClick={() => setLightboxImageUri(activePage.dataUri)}
                    className="max-h-[260px] w-auto rounded-lg border border-slate-700 cursor-zoom-in bg-white"
                  />
                  <span className="text-[11px] text-slate-400">
                    Klik gambar untuk memperbesar pratinjau
                  </span>
                </div>
              ) : activeFile.previewTables && activeFile.previewTables.length > 0 ? (
                <div className="space-y-3">
                  {activeFile.previewTables.map((tbl, tIdx) => (
                    <div key={tIdx} className="space-y-1">
                      <div className="text-xs font-semibold text-sky-400">
                        Sheet: {tbl.sheetName} ({tbl.rows.length} baris)
                      </div>
                      <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-slate-800 text-slate-200">
                            <tr>
                              {tbl.headers.map((h, hIdx) => (
                                <th
                                  key={hIdx}
                                  className="px-2.5 py-1.5 border-b border-r last:border-r-0 border-slate-700 whitespace-nowrap"
                                >
                                  {h || `Kolom ${hIdx + 1}`}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800 text-slate-300">
                            {tbl.rows.slice(0, 12).map((row, rIdx) => (
                              <tr key={rIdx}>
                                {row.map((cell, cIdx) => (
                                  <td
                                    key={cIdx}
                                    className="px-2.5 py-1.5 border-r last:border-r-0 border-slate-800 max-w-[220px] truncate"
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <pre className="text-xs text-slate-300 bg-slate-950 rounded-lg border border-slate-800 p-3 whitespace-pre-wrap font-sans leading-relaxed">
                  {(activeFile.previewText || '(Tidak ada pratinjau teks)').slice(0, 4500)}
                  {(activeFile.previewText || '').length > 4500 ? '\n\n... (dipersingkat untuk pratinjau)' : ''}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Primary Action Toolbar */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3 sm:p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isBusy || preparedFiles.length === 0}
            onClick={handleStartReading}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-45 cursor-pointer transition-colors"
          >
            {isReading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            <span>{isReading ? 'Sedang Membaca...' : 'Mulai Membaca'}</span>
          </button>

          <button
            type="button"
            disabled={isBusy || soalList.length === 0}
            onClick={handleStartAnswering}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-45 cursor-pointer transition-colors"
          >
            {isAnswering ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>{isAnswering ? 'Menjawab Soal...' : 'Mulai Menjawab'}</span>
          </button>

          <button
            type="button"
            disabled={soalList.length === 0}
            onClick={() => setShowPembahasan((v) => !v)}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-45 cursor-pointer transition-colors ${
              showPembahasan
                ? 'bg-slate-800 border-sky-500/60 text-sky-300'
                : 'bg-slate-950 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {showPembahasan ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            <span>{showPembahasan ? 'Sembunyikan Pembahasan' : 'Tampilkan Pembahasan'}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isBusy || soalList.length === 0}
            onClick={handleSaveSession}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs sm:text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-45 cursor-pointer transition-colors"
          >
            <Save className="w-4 h-4 text-sky-400" />
            <span>Simpan Hasil</span>
          </button>

          <button
            type="button"
            disabled={isBusy || soalList.length === 0}
            onClick={handleExportPdf}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs sm:text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-45 cursor-pointer transition-colors"
          >
            <Download className="w-4 h-4 text-rose-400" />
            <span>Ekspor PDF</span>
          </button>

          <button
            type="button"
            disabled={isBusy || isExporting || soalList.length === 0}
            onClick={handleExportDocx}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs sm:text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-45 cursor-pointer transition-colors"
          >
            <Download className="w-4 h-4 text-blue-400" />
            <span>{isExporting ? 'Mengekspor...' : 'Ekspor Word'}</span>
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      {progress && (
        <div className="rounded-xl border border-sky-800/70 bg-sky-950/30 p-4 space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
            <span className="font-semibold text-sky-200 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-sky-400 shrink-0" />
              <span>{progress.label}</span>
            </span>
            <span className="font-mono font-bold text-sky-300 tabular-nums shrink-0">
              {progress.current}/{progress.total} ({progressPercent}%)
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-sky-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Alerts / Feedback */}
      {errorMsg && (
        <div className="rounded-xl border border-rose-700/70 bg-rose-950/40 px-4 py-3 text-xs sm:text-sm text-rose-200 flex items-start gap-2.5">
          <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span className="flex-1 whitespace-pre-line">{errorMsg}</span>
        </div>
      )}
      {noticeMsg && !errorMsg && (
        <div className="rounded-xl border border-emerald-700/60 bg-emerald-950/35 px-4 py-3 text-xs sm:text-sm text-emerald-200 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span className="flex-1">{noticeMsg}</span>
        </div>
      )}

      {/* Validation & Results Section */}
      {soalList.length > 0 && validation && (
        <div className="space-y-5">
          {/* Document Title Editable Field + Validation Telemetry */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex-1">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Judul Dokumen Soal
                </label>
                <input
                  type="text"
                  value={judulDokumen}
                  onChange={(e) => setJudulDokumen(e.target.value)}
                  placeholder="Nama dokumen atau mata pelajaran..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-semibold text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
                <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                  <div className="text-[11px] text-slate-400">Total Soal</div>
                  <div className="text-lg font-bold text-white tabular-nums">
                    {validation.totalSoal}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                  <div className="text-[11px] text-slate-400">Urutan Nomor</div>
                  <div
                    className={`text-sm font-bold mt-0.5 ${
                      validation.urutanValid ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {validation.urutanValid ? 'Lengkap & Urut' : 'Perlu Cek'}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                  <div className="text-[11px] text-slate-400">Terjawab</div>
                  <div className="text-lg font-bold text-emerald-400 tabular-nums">
                    {stats.terjawab}/{validation.totalSoal}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                  <div className="text-[11px] text-slate-400">Kurang Jelas</div>
                  <div
                    className={`text-lg font-bold tabular-nums ${
                      stats.perluCek > 0 ? 'text-amber-400' : 'text-slate-300'
                    }`}
                  >
                    {stats.perluCek}
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed Validation Findings */}
            {(validation.nomorHilang.length > 0 ||
              validation.nomorDuplikat.length > 0 ||
              validation.soalTidakTerbaca.length > 0 ||
              validation.soalInformasiKurang.length > 0 ||
              validation.kesesuaianJawabanIssues.length > 0 ||
              validation.peringatanHalaman.length > 0) && (
              <div className="rounded-lg border border-amber-700/60 bg-amber-950/30 p-3 space-y-1.5 text-xs text-amber-200">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Hasil Validasi Kelengkapan & Kualitas Soal:</span>
                </div>
                {validation.nomorHilang.length > 0 && (
                  <div>
                    • Nomor soal terlewat / tidak ditemukan:{' '}
                    <span className="font-mono font-bold">
                      {validation.nomorHilang.join(', ')}
                    </span>
                  </div>
                )}
                {validation.nomorDuplikat.length > 0 && (
                  <div>
                    • Nomor soal duplikat:{' '}
                    <span className="font-mono font-bold">
                      {validation.nomorDuplikat.join(', ')}
                    </span>
                  </div>
                )}
                {validation.soalTidakTerbaca.length > 0 && (
                  <div>
                    • Soal tidak terbaca:{' '}
                    <span className="font-mono font-bold">
                      {validation.soalTidakTerbaca.join(', ')}
                    </span>
                  </div>
                )}
                {validation.soalInformasiKurang.length > 0 && (
                  <div>
                    • Informasi kurang lengkap / perlu dicek manual:{' '}
                    <span className="font-mono font-bold">
                      {validation.soalInformasiKurang.join(', ')}
                    </span>
                  </div>
                )}
                {validation.kesesuaianJawabanIssues.map((issue, i) => (
                  <div key={`iss-${i}`}>• {issue}</div>
                ))}
                {validation.peringatanHalaman.map((warn, i) => (
                  <div key={`warn-${i}`}>• {warn}</div>
                ))}
              </div>
            )}
          </div>

          {/* Question Navigator Strip + Search/Filter */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'semua', label: `Semua (${soalList.length})` },
                    { id: 'terjawab', label: `Terjawab (${stats.terjawab})` },
                    { id: 'belum', label: `Belum Dijawab (${stats.belum})` },
                    { id: 'perlu_cek', label: `Perlu Cek (${stats.perluCek})` },
                    { id: 'visual', label: `Visual/Diagram (${stats.visual})` },
                  ] as Array<{ id: QuestionFilter; label: string }>
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilterMode(tab.id)}
                    className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      filterMode === tab.id
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-950 border border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full md:w-64">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nomor atau kata soal..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Daftar Seluruh Soal (Klik Nomor untuk Lompat)
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                {soalList.map((q) => {
                  const isActive = activeQuestionId === q.id;
                  const isWarning =
                    q.statusTerbaca !== 'terbaca' ||
                    q.statusJawaban === 'informasi_tidak_cukup' ||
                    q.statusJawaban === 'tidak_terbaca';
                  const isSolved = q.statusJawaban === 'terjawab';

                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => jumpToQuestion(q.id)}
                      className={`min-w-[38px] h-9 px-2 rounded-lg font-mono text-xs font-bold tabular-nums border cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-sky-600 border-sky-400 text-white'
                          : isWarning
                          ? 'bg-amber-950/60 border-amber-600/60 text-amber-300 hover:bg-amber-900/60'
                          : isSolved
                          ? 'bg-emerald-950/50 border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/50'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {q.nomor}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Extracted Questions Cards (Exact Format) */}
          <div className="space-y-4">
            {filteredQuestions.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">
                Tidak ada soal yang cocok dengan filter atau kata pencarian saat ini.
              </div>
            ) : (
              filteredQuestions.map((q) => {
                const isWarn =
                  q.statusTerbaca !== 'terbaca' ||
                  q.statusJawaban === 'informasi_tidak_cukup' ||
                  q.statusJawaban === 'tidak_terbaca';
                return (
                  <article
                    key={q.id}
                    ref={(el) => {
                      questionRefs.current[q.id] = el;
                    }}
                    className={`rounded-xl border p-4 sm:p-5 space-y-4 transition-colors ${
                      activeQuestionId === q.id
                        ? 'bg-slate-900 border-sky-500/70'
                        : 'bg-slate-900/90 border-slate-800'
                    }`}
                  >
                    {/* Top Question Metadata Row */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-mono text-sm font-bold text-sky-400 tabular-nums">
                          NOMOR SOAL: {q.nomor}
                        </span>
                        {q.sumberFile && (
                          <span className="text-xs text-slate-400">
                            · {q.sumberFile}
                            {q.halaman ? ` (Hal. ${q.halaman})` : ''}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          {q.tipe === 'uraian' ? 'Uraian' : 'Pilihan Ganda'}
                        </span>
                        {isWarn ? (
                          <span className="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-700/60 text-amber-300 inline-flex items-center gap-1">
                            <HelpCircle className="w-3.5 h-3.5" />
                            <span>
                              {q.statusTerbaca === 'tidak_terbaca'
                                ? 'Tidak Terbaca'
                                : q.statusJawaban === 'informasi_tidak_cukup'
                                ? 'Informasi Tidak Cukup'
                                : 'Perlu Cek Manual'}
                            </span>
                          </span>
                        ) : q.statusJawaban === 'terjawab' ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-700/50 text-emerald-300 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Terjawab</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                            Belum Dijawab
                          </span>
                        )}
                      </div>
                    </div>

                    {/* PERTANYAAN */}
                    <div className="space-y-1.5">
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        PERTANYAAN:
                      </div>
                      <StructuredContentBlock content={q.pertanyaan} />
                      {q.catatanPembacaan && (
                        <div className="mt-2 rounded-lg border border-slate-700/80 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">
                          <span className="font-semibold text-sky-400">Catatan Visual / Pembacaan: </span>
                          {q.catatanPembacaan}
                        </div>
                      )}
                      {q.previewGambarDataUri && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => setLightboxImageUri(q.previewGambarDataUri || null)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 hover:border-sky-500 text-xs font-semibold text-sky-300 cursor-pointer"
                          >
                            <ZoomIn className="w-3.5 h-3.5" />
                            <span>Lihat Gambar Halaman Asli Soal Ini</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* PILIHAN JAWABAN */}
                    {q.pilihan && Object.keys(q.pilihan).length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          PILIHAN JAWABAN:
                        </div>
                        <div className="grid grid-cols-1 gap-1.5">
                          {(['A', 'B', 'C', 'D', 'E'] as const).map((optKey) => {
                            const val = q.pilihan?.[optKey];
                            if (!val) return null;
                            const isPicked =
                              q.jawaban &&
                              q.jawaban.trim().toUpperCase().startsWith(`${optKey}.`);
                            return (
                              <div
                                key={optKey}
                                className={`px-3 py-2 rounded-lg border text-sm flex items-start gap-2.5 ${
                                  isPicked
                                    ? 'bg-emerald-950/40 border-emerald-600/70 text-emerald-100'
                                    : 'bg-slate-950/60 border-slate-800 text-slate-200'
                                }`}
                              >
                                <span className="font-mono font-bold text-sky-400 shrink-0">
                                  {optKey}.
                                </span>
                                <span className="break-words">{val}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* JAWABAN */}
                    <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3.5 space-y-1">
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        JAWABAN:
                      </div>
                      <div
                        className={`text-sm sm:text-base font-bold ${
                          q.statusJawaban === 'terjawab'
                            ? 'text-emerald-400'
                            : isWarn
                            ? 'text-amber-300'
                            : 'text-slate-400'
                        }`}
                      >
                        {q.jawaban ||
                          'Belum dijawab — klik "Mulai Menjawab" untuk memproses jawaban.'}
                      </div>
                      {q.kunciAsliDokumen && (
                        <div className="text-xs text-slate-400 pt-1">
                          Kunci tertulis di berkas sumber: <span className="font-semibold text-slate-200">{q.kunciAsliDokumen}</span>
                        </div>
                      )}
                    </div>

                    {/* PEMBAHASAN */}
                    {showPembahasan && (q.pembahasan || (q.langkahMatematika && q.langkahMatematika.length > 0)) && (
                      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3.5 space-y-3">
                        <div className="text-xs font-bold uppercase tracking-wider text-sky-400">
                          PEMBAHASAN:
                        </div>
                        {q.pembahasan && (
                          <StructuredContentBlock content={q.pembahasan} compact />
                        )}
                        {Array.isArray(q.langkahMatematika) && q.langkahMatematika.length > 0 && (
                          <div className="pt-2 border-t border-slate-800 space-y-1.5">
                            <div className="text-xs font-bold text-slate-300">
                              Langkah Penyelesaian Matematika:
                            </div>
                            <ol className="list-decimal list-inside space-y-1 text-xs sm:text-sm text-slate-200">
                              {q.langkahMatematika.map((step, sIdx) => (
                                <li key={sIdx} className="leading-relaxed">
                                  {step}
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Lightbox Modal for Page / Visual Inspection */}
      {lightboxImageUri && (
        <div
          onClick={() => setLightboxImageUri(null)}
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-2xl p-3 flex flex-col gap-2"
          >
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-slate-300">
                Pratinjau Halaman Dokumen
              </span>
              <button
                type="button"
                onClick={() => setLightboxImageUri(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-auto rounded-lg bg-white">
              <img
                src={lightboxImageUri}
                alt="Pratinjau dokumen"
                className="max-w-full h-auto mx-auto"
              />
            </div>
          </div>
        </div>
      )}

      {/* Saved History Modal */}
      {showHistoryModal && (
        <div
          onClick={() => setShowHistoryModal(false)}
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-sky-400" />
                <h3 className="text-base font-bold text-white">
                  Riwayat Hasil Pembacaan Soal Tersimpan
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-2.5 flex-1">
              {savedSessions.length === 0 ? (
                <div className="text-center py-10 text-sm text-slate-400">
                  Belum ada hasil pembacaan soal yang disimpan.
                </div>
              ) : (
                savedSessions.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="text-sm font-bold text-white truncate">
                        {item.judul}
                      </div>
                      <div className="text-xs text-slate-400 truncate">
                        Berkas: {item.namaFiles.join(', ') || '-'} ·{' '}
                        <span className="tabular-nums">{item.soalList.length} Soal</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Disimpan pada {new Date(item.updatedAt || item.createdAt).toLocaleString('id-ID')}
                        {item.guruName ? ` oleh ${item.guruName}` : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleLoadSession(item)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer"
                      >
                        Buka Hasil
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSavedSession(item.id)}
                        aria-label="Hapus riwayat"
                        className="min-h-[38px] p-2 rounded-lg bg-slate-900 border border-slate-700 hover:border-rose-500 text-slate-400 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
