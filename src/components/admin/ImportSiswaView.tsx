import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { db } from '../../services/database';
import { Siswa, Kelas } from '../../types';
import { exportToExcel } from '../../utils/exportHelper';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Download,
  Database,
  Sparkles,
  Info,
  Filter,
  Layers,
  ArrowRight,
  Check,
} from 'lucide-react';

interface ParsedRow {
  index: number;
  namaLengkap: string;
  nisn: string;
  nomorInduk: string;
  qrId: string;
  kelas: string;
  jenisKelamin: 'L' | 'P';
  tempatLahir: string;
  tanggalLahir: string;
  namaOrangTua: string;
  alamat: string;
  isValid: boolean;
  errors: string[];
}

interface ImportSiswaViewProps {
  onSuccess: (importedKelas?: string) => void;
  initialKelas?: string;
}

// Helper: robust column value extractor
function extractField(row: Record<string, unknown>, aliases: string[]): string {
  // 1. Exact match
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== null && String(row[alias]).trim() !== '') {
      return String(row[alias]).trim();
    }
  }

  // 2. Case-insensitive & symbol-stripped match
  const rowKeys = Object.keys(row);
  for (const alias of aliases) {
    const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const key of rowKeys) {
      const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanKey === cleanAlias) {
        const val = row[key];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return String(val).trim();
        }
      }
    }
  }

  // 3. Substring match
  for (const alias of aliases) {
    const lowerAlias = alias.toLowerCase();
    for (const key of rowKeys) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes(lowerAlias)) {
        const val = row[key];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return String(val).trim();
        }
      }
    }
  }

  return '';
}

// Convert Excel date serial numbers (e.g., 42898) or strings to YYYY-MM-DD
function formatBirthDate(val: unknown): string {
  if (!val) return '2017-01-01';
  if (typeof val === 'number') {
    try {
      const date = new Date((val - (25567 + 2)) * 86400 * 1000);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    } catch {
      // Fallback
    }
  }
  const str = String(val).trim();
  // If DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  // If already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  return str || '2017-01-01';
}

// Smart Roman numeral to Arabic converter
function convertRomanNumerals(text: string): string {
  return text
    .replace(/\bXII\b/gi, '12')
    .replace(/\bXI\b/gi, '11')
    .replace(/\bIX\b/gi, '9')
    .replace(/\bVIII\b/gi, '8')
    .replace(/\bVII\b/gi, '7')
    .replace(/\bVI\b/gi, '6')
    .replace(/\bIV\b/gi, '4')
    .replace(/\bV\b/gi, '5')
    .replace(/\bIII\b/gi, '3')
    .replace(/\bII\b/gi, '2')
    .replace(/\bI\b/gi, '1')
    .replace(/\bX\b/gi, '10');
}

// Smart Class Matcher & Normalizer
function normalizeAndMatchKelas(
  rawVal: string,
  existingClasses: Kelas[],
  fallbackDefault: string
): string {
  const trimmed = (rawVal || '').trim();
  if (!trimmed) return fallbackDefault;

  // Convert Roman numerals if present
  const withArabic = convertRomanNumerals(trimmed);

  // Clean string without extra spaces or symbols for comparison
  const cleanNorm = withArabic
    .toLowerCase()
    .replace(/\bkelas\b/g, '')
    .replace(/[^a-z0-9]/g, '');

  // 1. Direct match with existing classes
  for (const k of existingClasses) {
    if (k.nama.trim().toLowerCase() === trimmed.toLowerCase()) {
      return k.nama;
    }
  }

  // 2. Normalized match with existing classes (e.g., '1A', '1 A', '1-A' matches 'Kelas 1A')
  for (const k of existingClasses) {
    const kNorm = convertRomanNumerals(k.nama)
      .toLowerCase()
      .replace(/\bkelas\b/g, '')
      .replace(/[^a-z0-9]/g, '');

    if (kNorm === cleanNorm) {
      return k.nama;
    }
  }

  // 3. If value is just a number like "2", match "Kelas 2"
  if (/^\d+$/.test(cleanNorm)) {
    const matchNumeric = existingClasses.find((k) => {
      const kNorm = k.nama.toLowerCase().replace(/[^a-z0-9]/g, '');
      return kNorm === `kelas${cleanNorm}` || kNorm === cleanNorm;
    });
    if (matchNumeric) return matchNumeric.nama;
  }

  // 4. If no exact existing class matched, standardize name format
  if (withArabic.toLowerCase().startsWith('kelas')) {
    // Standardize casing to "Kelas X"
    return withArabic.replace(/^[kK][eE][lL][aA][sS]\s*/, 'Kelas ');
  }

  return `Kelas ${withArabic.toUpperCase()}`;
}

export const ImportSiswaView: React.FC<ImportSiswaViewProps> = ({ onSuccess, initialKelas }) => {
  const [kelasList] = useState<Kelas[]>(() => db.getAllKelasListUnfiltered());
  const defaultClass = initialKelas || kelasList[0]?.nama || 'Kelas 1A';

  // Assignment configuration
  const [assignmentMode, setAssignmentMode] = useState<'auto' | 'fixed'>('auto');
  const [selectedFixedKelas, setSelectedFixedKelas] = useState<string>(defaultClass);
  const [fallbackKelas, setFallbackKelas] = useState<string>(defaultClass);

  // Raw items cache so user can re-apply settings without re-uploading file
  const [cachedRawItems, setCachedRawItems] = useState<Record<string, unknown>[]>([]);

  // Preview states
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [filterPreviewKelas, setFilterPreviewKelas] = useState<string>('');
  const [previewSearch, setPreviewSearch] = useState<string>('');
  const [fileName, setFileName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState('');

  // Bulk class editor state
  const [bulkTargetKelas, setBulkTargetKelas] = useState<string>(defaultClass);

  // Download template
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'Nama Lengkap': 'Ahmad Fauzi',
        NISN: '0165998811',
        'Nomor Induk': '23240150',
        Kelas: 'Kelas 1A',
        'Jenis Kelamin (L/P)': 'L',
        'Tempat Lahir': 'Bandung',
        'Tanggal Lahir (YYYY-MM-DD)': '2017-06-12',
        'Nama Orang Tua / Wali': 'H. Ridwan',
        Alamat: 'Kp. Giriharja RT 02 RW 01',
      },
      {
        'Nama Lengkap': 'Nabila Safitri',
        NISN: '0165998812',
        'Nomor Induk': '23240151',
        Kelas: 'Kelas 1B',
        'Jenis Kelamin (L/P)': 'P',
        'Tempat Lahir': 'Ciparay',
        'Tanggal Lahir (YYYY-MM-DD)': '2017-09-24',
        'Nama Orang Tua / Wali': 'Yayan Suryana',
        Alamat: 'Jl. Raya Laswi No. 10',
      },
      {
        'Nama Lengkap': 'Dimas Ramadhan',
        NISN: '0165998813',
        'Nomor Induk': '23240152',
        Kelas: 'Kelas 2',
        'Jenis Kelamin (L/P)': 'L',
        'Tempat Lahir': 'Bandung',
        'Tanggal Lahir (YYYY-MM-DD)': '2016-03-15',
        'Nama Orang Tua / Wali': 'Agus Sutrisno',
        Alamat: 'Jl. Babakan No. 4',
      },
    ];
    exportToExcel(templateData, 'Template_Import_Siswa_Sekolah', 'Template');
  };

  // Quick load sample data showcasing multiple classes
  const handleLoadSample = () => {
    const sampleRaw = [
      {
        'Nama Lengkap': 'Naufal Farhan',
        NISN: '0165999001',
        'Nomor Induk': '23240155',
        Rombel: '1A', // Will smartly map to 'Kelas 1A'
        'Jenis Kelamin': 'L',
        'Tempat Lahir': 'Bandung',
        'Tanggal Lahir': '2017-04-10',
        'Nama Orang Tua': 'Hendra Sujana',
        Alamat: 'Kp. Bojong RT 03',
      },
      {
        'Nama Lengkap': 'Rania Humaira',
        NISN: '0165999002',
        'Nomor Induk': '23240156',
        Rombel: '1B', // Will smartly map to 'Kelas 1B'
        'Jenis Kelamin': 'P',
        'Tempat Lahir': 'Bandung',
        'Tanggal Lahir': '2017-11-15',
        'Nama Orang Tua': 'Dadang Solihin',
        Alamat: 'Desa Giriharja No. 33',
      },
      {
        'Nama Lengkap': 'Bagas Pratama',
        NISN: '0165999003',
        'Nomor Induk': '23240157',
        'Rombongan Belajar': 'Kelas 2', // Will smartly map to 'Kelas 2'
        'Jenis Kelamin': 'L',
        'Tempat Lahir': 'Bandung',
        'Tanggal Lahir': '2016-08-20',
        'Nama Orang Tua': 'Joko Waluyo',
        Alamat: 'Ciparay',
      },
      {
        'Nama Lengkap': 'Citra Kirana',
        NISN: '0165999004',
        'Nomor Induk': '23240158',
        Kelas: 'Kelas 3', // Will map to 'Kelas 3'
        'Jenis Kelamin': 'P',
        'Tempat Lahir': 'Bandung',
        'Tanggal Lahir': '2015-05-12',
        'Nama Orang Tua': 'Mulyadi',
        Alamat: 'Kp. Pasir',
      },
      {
        'Nama Lengkap': 'Siswa Duplikat Uji',
        NISN: '0165432101', // Duplicate NISN from initial seed database
        'Nomor Induk': '23240101',
        Kelas: 'Kelas 1A',
        'Jenis Kelamin': 'L',
        'Tempat Lahir': 'Bandung',
        'Tanggal Lahir': '2017-05-14',
        'Nama Orang Tua': 'Bambang',
        Alamat: 'Kp. Giriharja',
      },
    ];
    setFileName('contoh_data_siswa_multikelas.xlsx');
    setCachedRawItems(sampleRaw);
    parseRecords(sampleRaw, assignmentMode, selectedFixedKelas, fallbackKelas);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsProcessing(true);
    setSaveSuccessMessage('');

    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawJson = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
        setCachedRawItems(rawJson);
        parseRecords(rawJson, assignmentMode, selectedFixedKelas, fallbackKelas);
      } catch (err) {
        console.error('Parsing error:', err);
        alert('Gagal membaca file Excel/CSV! Pastikan format file sesuai.');
      } finally {
        setIsProcessing(false);
      }
    };

    reader.readAsBinaryString(file);
  };

  const parseRecords = (
    rawItems: Record<string, unknown>[],
    mode: 'auto' | 'fixed',
    fixedKelas: string,
    fallback: string
  ) => {
    const existingSiswa = db.getAllSiswaListUnfiltered();
    const existingNisns = new Set(existingSiswa.map((s) => s.nisn.trim()));
    const existingNoInduk = new Set(existingSiswa.map((s) => s.nomorInduk.trim()));

    const seenFileNisn = new Set<string>();
    const batchQrIds = db.generateBatchSiswaQrIds(rawItems.length);

    const parsed: ParsedRow[] = rawItems.map((item, idx) => {
      // 1. Flexible key matching for student names
      const nama = extractField(item, [
        'Nama Lengkap',
        'namaLengkap',
        'Nama Peserta Didik',
        'Nama Siswa',
        'Nama Murid',
        'Nama',
        'NAMA',
        'Peserta Didik',
      ]);

      // 2. NISN
      const nisnVal = extractField(item, [
        'NISN',
        'nisn',
        'No. NISN',
        'No NISN',
        'Nomor NISN',
      ]);

      // 3. Nomor Induk
      const noIndukVal = extractField(item, [
        'Nomor Induk',
        'nomorInduk',
        'No Induk',
        'No. Induk',
        'NIPD',
        'NIS',
        'No Induk Siswa',
      ]);

      // 4. Kelas / Rombel: handles 'Kelas', 'Rombel', 'Rombongan Belajar', 'Tingkat', etc.
      let finalKelas: string;
      if (mode === 'fixed') {
        finalKelas = fixedKelas || defaultClass;
      } else {
        const rawKelas = extractField(item, [
          'Kelas',
          'kelas',
          'KELAS',
          'Rombel',
          'rombel',
          'ROMBEL',
          'Rombongan Belajar',
          'rombongan_belajar',
          'ROMBONGAN BELAJAR',
          'Nama Rombel',
          'nama_rombel',
          'Tingkat',
          'tingkat',
          'Tingkat Kelas',
          'Kelas / Rombel',
          'Kelas/Rombel',
          'Rombel/Kelas',
          'Ruang',
          'Ruang Kelas',
        ]);
        finalKelas = normalizeAndMatchKelas(rawKelas, kelasList, fallback);
      }

      // 5. Gender
      const rawJk = extractField(item, [
        'Jenis Kelamin (L/P)',
        'Jenis Kelamin',
        'JK',
        'jk',
        'L/P',
        'Gender',
      ]).toUpperCase();
      const jkVal: 'L' | 'P' = rawJk.startsWith('P') || rawJk === 'PEREMPUAN' || rawJk === 'F' ? 'P' : 'L';

      // 6. Tempat & Tanggal Lahir
      const tmpLahir = extractField(item, [
        'Tempat Lahir',
        'tempatLahir',
        'Tempat Lahir Siswa',
        'Kota Lahir',
      ]) || 'Bandung';

      const rawTglLahir = item['Tanggal Lahir (YYYY-MM-DD)'] ??
        item['Tanggal Lahir'] ??
        item['tanggalLahir'] ??
        item['Tgl Lahir'] ??
        item['TGL LAHIR'];
      const tglLahir = formatBirthDate(rawTglLahir);

      // 7. Orang Tua & Alamat
      const ortuVal = extractField(item, [
        'Nama Orang Tua / Wali',
        'Nama Orang Tua',
        'Orang Tua',
        'Nama Ayah',
        'Nama Ibu',
        'Wali',
        'Orang Tua / Wali',
      ]);

      const alamatVal = extractField(item, [
        'Alamat',
        'alamat',
        'Alamat Siswa',
        'Alamat Tempat Tinggal',
        'Domisili',
      ]) || '-';

      const errors: string[] = [];

      // Validations
      if (!nama) errors.push('Nama siswa kosong');
      if (!nisnVal) errors.push('NISN siswa kosong');

      if (nisnVal && existingNisns.has(nisnVal)) {
        errors.push(`NISN ${nisnVal} sudah terdaftar di database`);
      }
      if (noIndukVal && existingNoInduk.has(noIndukVal)) {
        errors.push(`Nomor Induk ${noIndukVal} sudah ada di database`);
      }

      if (nisnVal && seenFileNisn.has(nisnVal)) {
        errors.push(`Duplikat NISN ${nisnVal} di baris lain dalam file ini`);
      }
      if (nisnVal) seenFileNisn.add(nisnVal);

      return {
        index: idx + 1,
        namaLengkap: nama,
        nisn: nisnVal,
        nomorInduk: noIndukVal || `NI-${Math.floor(1000 + Math.random() * 9000)}`,
        qrId: batchQrIds[idx] || `STU-${String(idx + 1).padStart(5, '0')}`,
        kelas: finalKelas,
        jenisKelamin: jkVal,
        tempatLahir: tmpLahir,
        tanggalLahir: tglLahir,
        namaOrangTua: ortuVal,
        alamat: alamatVal,
        isValid: errors.length === 0,
        errors,
      };
    });

    setRows(parsed);
  };

  // Re-run parsing if mode or fixed settings change
  const handleModeChange = (newMode: 'auto' | 'fixed') => {
    setAssignmentMode(newMode);
    if (cachedRawItems.length > 0) {
      parseRecords(cachedRawItems, newMode, selectedFixedKelas, fallbackKelas);
    }
  };

  const handleFixedKelasChange = (newFixedKelas: string) => {
    setSelectedFixedKelas(newFixedKelas);
    if (cachedRawItems.length > 0 && assignmentMode === 'fixed') {
      parseRecords(cachedRawItems, 'fixed', newFixedKelas, fallbackKelas);
    }
  };

  const handleFallbackKelasChange = (newFallback: string) => {
    setFallbackKelas(newFallback);
    if (cachedRawItems.length > 0 && assignmentMode === 'auto') {
      parseRecords(cachedRawItems, 'auto', selectedFixedKelas, newFallback);
    }
  };

  // Row-level class manual adjustment
  const handleUpdateRowKelas = (index: number, newKelas: string) => {
    setRows((prev) =>
      prev.map((r) => (r.index === index ? { ...r, kelas: newKelas } : r))
    );
  };

  // Bulk apply class to all valid rows
  const handleApplyBulkKelas = () => {
    if (!bulkTargetKelas) return;
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        kelas: bulkTargetKelas,
      }))
    );
  };

  // Class distribution summary
  const classDistribution = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => {
      if (r.kelas) {
        map.set(r.kelas, (map.get(r.kelas) || 0) + 1);
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const validRows = rows.filter((r) => r.isValid);
  const invalidRows = rows.filter((r) => !r.isValid);

  // Filtered rows for the preview table
  const displayedRows = useMemo(() => {
    return rows.filter((r) => {
      const matchKelas = filterPreviewKelas ? r.kelas === filterPreviewKelas : true;
      const matchSearch = previewSearch
        ? r.namaLengkap.toLowerCase().includes(previewSearch.toLowerCase()) ||
          r.nisn.includes(previewSearch) ||
          r.nomorInduk.includes(previewSearch) ||
          r.kelas.toLowerCase().includes(previewSearch.toLowerCase())
        : true;
      return matchKelas && matchSearch;
    });
  }, [rows, filterPreviewKelas, previewSearch]);

  const handleSaveToDatabase = () => {
    if (validRows.length === 0) {
      alert('Tidak ada data valid yang dapat disimpan.');
      return;
    }

    // Generate strictly unique sequential QR IDs for each student in the import batch
    const uniqueQrIds = db.generateBatchSiswaQrIds(validRows.length);

    const newStudents: Siswa[] = validRows.map((row, idx) => {
      const nextQrId = uniqueQrIds[idx] || row.qrId;
      return {
        id: `stu-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
        qrId: nextQrId,
        nomorInduk: row.nomorInduk,
        nisn: row.nisn,
        namaLengkap: row.namaLengkap,
        tempatLahir: row.tempatLahir,
        tanggalLahir: row.tanggalLahir,
        jenisKelamin: row.jenisKelamin,
        alamat: row.alamat,
        kelas: row.kelas,
        namaOrangTua: row.namaOrangTua,
        createdAt: new Date().toISOString().split('T')[0],
      };
    });

    // Save students and automatically ensure classes exist
    db.saveManySiswa(newStudents);

    // Identify primary imported class for target auto-navigation
    const importedClasses = Array.from(new Set(newStudents.map((s) => s.kelas)));
    const primaryClass =
      filterPreviewKelas || (importedClasses.length === 1 ? importedClasses[0] : importedClasses[0]);

    setSaveSuccessMessage(
      `Berhasil menyimpan ${newStudents.length} siswa ke dalam ${importedClasses.length} rombel kelas (${importedClasses.join(', ')}). Seluruh ID QR Code telah dibuat otomatis dan data siswa telah tersinkronisasi ke kelasnya masing-masing!`
    );
    setRows([]);
    setFileName('');

    setTimeout(() => {
      onSuccess(primaryClass);
    }, 1800);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Import Data Siswa (Excel / CSV)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Unggah file data siswa dengan sinkronisasi dan filter rombel kelas otomatis.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleDownloadTemplate}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-blue-700" />
            <span>Download Template Excel</span>
          </button>
          <button
            onClick={handleLoadSample}
            className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-blue-200 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Muat Data Contoh Uji</span>
          </button>
        </div>
      </div>

      {saveSuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-semibold flex items-center gap-3 animate-in fade-in">
          <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>{saveSuccessMessage}</span>
        </div>
      )}

      {/* Class Assignment Configuration Card */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-900 border-b border-slate-100 pb-3">
          <Layers className="w-4 h-4 text-blue-600" />
          <span>PENGATURAN PEMBAGIAN ROMBEL KELAS SISWA</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Mode Option 1: Auto detect */}
          <label
            onClick={() => handleModeChange('auto')}
            className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
              assignmentMode === 'auto'
                ? 'border-blue-600 bg-blue-50/50 text-blue-950'
                : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 ${
                  assignmentMode === 'auto'
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300'
                }`}
              >
                {assignmentMode === 'auto' && <Check className="w-2.5 h-2.5" />}
              </div>
              <div className="space-y-1">
                <span className="text-xs font-bold block">
                  Otomatis dari Kolom Kelas / Rombel di File (Direkomendasikan)
                </span>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Sistem otomatis mendeteksi nama kelas/rombel dari file (misal: "1A", "Kelas 1B", "Rombel 2", "VI A") dan mengelompokkan siswa ke kelasnya masing-masing.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200/60 flex items-center gap-2 text-[11px]">
              <span className="text-slate-500 font-medium">Jika kolom kelas kosong:</span>
              <select
                value={fallbackKelas}
                onChange={(e) => handleFallbackKelasChange(e.target.value)}
                disabled={assignmentMode !== 'auto'}
                className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-600"
              >
                {kelasList.map((k) => (
                  <option key={k.id} value={k.nama}>
                    {k.nama}
                  </option>
                ))}
              </select>
            </div>
          </label>

          {/* Mode Option 2: Fixed class */}
          <label
            onClick={() => handleModeChange('fixed')}
            className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
              assignmentMode === 'fixed'
                ? 'border-blue-600 bg-blue-50/50 text-blue-950'
                : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 ${
                  assignmentMode === 'fixed'
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300'
                }`}
              >
                {assignmentMode === 'fixed' && <Check className="w-2.5 h-2.5" />}
              </div>
              <div className="space-y-1">
                <span className="text-xs font-bold block">
                  Tetapkan Seluruh Siswa ke Satu Kelas Tertentu
                </span>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Gunakan opsi ini jika file Excel Anda hanya berisi daftar nama siswa untuk satu kelas tertentu dan tidak memiliki kolom kelas.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200/60 flex items-center gap-2 text-[11px]">
              <span className="text-slate-500 font-medium">Tetapkan ke kelas:</span>
              <select
                value={selectedFixedKelas}
                onChange={(e) => handleFixedKelasChange(e.target.value)}
                disabled={assignmentMode !== 'fixed'}
                className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-600"
              >
                {kelasList.map((k) => (
                  <option key={k.id} value={k.nama}>
                    {k.nama}
                  </option>
                ))}
              </select>
            </div>
          </label>
        </div>
      </div>

      {/* File Dropzone */}
      <div className="bg-white rounded-2xl p-8 border-2 border-dashed border-slate-300 hover:border-blue-500 transition-colors text-center shadow-xs">
        <input
          type="file"
          id="file-import-siswa"
          accept=".xlsx, .xls, .csv"
          onChange={handleFileUpload}
          className="hidden"
        />
        <label
          htmlFor="file-import-siswa"
          className="cursor-pointer flex flex-col items-center justify-center space-y-3"
        >
          <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center shadow-inner">
            <FileSpreadsheet className="w-8 h-8" />
          </div>
          <div>
            <span className="text-sm font-bold text-slate-900 block">
              {fileName ? fileName : 'PILIH FILE EXCEL / CSV UNTUK DIIMPORT'}
            </span>
            <span className="text-xs text-slate-500 mt-1 block">
              Mendukung format berkas .xlsx, .xls, dan .csv
            </span>
          </div>
          <span className="px-4 py-2 rounded-xl bg-blue-700 text-white text-xs font-semibold shadow-xs hover:bg-blue-800 transition-colors">
            PILIH DOKUMEN EXCEL SISWA
          </span>
        </label>
      </div>

      {/* Preview Section */}
      {rows.length > 0 && (
        <div className="space-y-4 animate-in fade-in">
          {/* Summary Status Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 font-semibold uppercase">Total Baris File</span>
                <h4 className="text-2xl font-extrabold text-slate-900 mt-0.5">{rows.length}</h4>
              </div>
              <FileSpreadsheet className="w-8 h-8 text-slate-400" />
            </div>

            <div className="bg-emerald-50/70 rounded-2xl p-4 border border-emerald-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs text-emerald-700 font-semibold uppercase">Data Valid Siap Simpan</span>
                <h4 className="text-2xl font-extrabold text-emerald-800 mt-0.5">{validRows.length}</h4>
              </div>
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>

            <div className="bg-rose-50/70 rounded-2xl p-4 border border-rose-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs text-rose-700 font-semibold uppercase">Bermasalah / Duplikat</span>
                <h4 className="text-2xl font-extrabold text-rose-800 mt-0.5">{invalidRows.length}</h4>
              </div>
              <XCircle className="w-8 h-8 text-rose-600" />
            </div>
          </div>

          {/* Detected Classes Distribution Bar */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Distribusi Siswa per Kelas ({classDistribution.length} Kelas Terdeteksi)
                </span>
              </div>
              <span className="text-[11px] text-slate-500">
                Klik salah satu kelas di bawah untuk memfilter pratinjau tabel
              </span>
            </div>

            {/* Quick Class Filter Chips */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={() => setFilterPreviewKelas('')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  filterPreviewKelas === ''
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                Semua Kelas ({rows.length})
              </button>

              {classDistribution.map(([kelasName, count]) => (
                <button
                  key={kelasName}
                  onClick={() => setFilterPreviewKelas(kelasName)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    filterPreviewKelas === kelasName
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-blue-50/80 hover:bg-blue-100 text-blue-800 border border-blue-200'
                  }`}
                >
                  <span>{kelasName}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                      filterPreviewKelas === kelasName
                        ? 'bg-blue-800 text-white'
                        : 'bg-blue-200/80 text-blue-900'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-blue-50/60 p-4 rounded-2xl border border-blue-200">
            <div className="flex items-center gap-2 text-xs text-blue-900">
              <Info className="w-4 h-4 text-blue-700 flex-shrink-0" />
              <span>
                Menampilkan hasil verifikasi file <strong>{fileName}</strong>. Hanya baris yang berstatus{' '}
                <strong>Valid</strong> yang akan masuk ke database dan langsung terkelompokkan ke kelasnya masing-masing.
              </span>
            </div>

            <div className="flex items-center gap-2 justify-end">
              <button
                id="btn-simpan-import"
                onClick={handleSaveToDatabase}
                disabled={validRows.length === 0}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-all ${
                  validRows.length > 0
                    ? 'bg-blue-700 hover:bg-blue-800 text-white cursor-pointer hover:shadow'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Database className="w-4 h-4" />
                <span>SIMPAN ({validRows.length} DATA VALID)</span>
              </button>
            </div>
          </div>

          {/* Search & Bulk Class Toolbar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
            <input
              type="text"
              placeholder="Cari siswa di tabel pratinjau..."
              value={previewSearch}
              onChange={(e) => setPreviewSearch(e.target.value)}
              className="w-full sm:w-72 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
            />

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end text-xs">
              <span className="text-slate-500 font-medium whitespace-nowrap">Ubah Semua Baris ke:</span>
              <select
                value={bulkTargetKelas}
                onChange={(e) => setBulkTargetKelas(e.target.value)}
                className="py-1 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
              >
                {kelasList.map((k) => (
                  <option key={k.id} value={k.nama}>
                    {k.nama}
                  </option>
                ))}
              </select>
              <button
                onClick={handleApplyBulkKelas}
                className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
              >
                Terapkan
              </button>
            </div>
          </div>

          {/* Table Preview */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[11px]">
                  <tr>
                    <th className="px-4 py-3 text-center w-12">Baris</th>
                    <th className="px-4 py-3">Status Verifikasi</th>
                    <th className="px-4 py-3">Nama Lengkap</th>
                    <th className="px-4 py-3">Kode QR Siswa</th>
                    <th className="px-4 py-3">NISN</th>
                    <th className="px-4 py-3">Nomor Induk</th>
                    <th className="px-4 py-3">Kelas / Rombel</th>
                    <th className="px-4 py-3">L/P</th>
                    <th className="px-4 py-3">Tempat, Tgl Lahir</th>
                    <th className="px-4 py-3">Orang Tua / Wali</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {displayedRows.map((row) => (
                    <tr
                      key={row.index}
                      className={
                        row.isValid ? 'hover:bg-blue-50/30' : 'bg-rose-50/30 hover:bg-rose-50/50'
                      }
                    >
                      <td className="px-4 py-3 text-center text-slate-400 font-medium">
                        {row.index}
                      </td>
                      <td className="px-4 py-3">
                        {row.isValid ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                            <CheckCircle className="w-3 h-3" /> Valid
                          </span>
                        ) : (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                              <XCircle className="w-3 h-3" /> Tidak Valid
                            </span>
                            <div className="text-[10px] text-rose-600">
                              {row.errors.join(', ')}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {row.namaLengkap || <span className="text-rose-500 italic">Kosong</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 font-mono text-[11px] font-bold bg-blue-50 text-blue-800 rounded-md border border-blue-200/80 inline-block">
                          {row.qrId}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {row.nisn || <span className="text-rose-500 italic">Kosong</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{row.nomorInduk}</td>
                      <td className="px-4 py-3">
                        <select
                          value={row.kelas}
                          onChange={(e) => handleUpdateRowKelas(row.index, e.target.value)}
                          className="py-1 px-2 bg-blue-50/60 hover:bg-blue-100/60 border border-blue-200 rounded-lg text-xs font-bold text-blue-900 focus:outline-hidden focus:ring-2 focus:ring-blue-600 cursor-pointer"
                        >
                          {classDistribution.map(([c]) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                          {kelasList
                            .filter((k) => !classDistribution.some(([c]) => c === k.nama))
                            .map((k) => (
                              <option key={k.id} value={k.nama}>
                                {k.nama}
                              </option>
                            ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 font-bold">{row.jenisKelamin}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {row.tempatLahir}, {row.tanggalLahir}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.namaOrangTua || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {displayedRows.length === 0 && (
              <div className="py-8 text-center text-slate-400 text-xs">
                Tidak ada data yang cocok dengan filter kelas atau pencarian.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
