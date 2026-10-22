import React, { useState, useMemo, useRef } from 'react';
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
  Check,
  Settings2,
  RefreshCw,
  Edit3,
  AlertCircle,
  Loader2,
  SlidersHorizontal,
  FileDown,
  X,
  Search,
} from 'lucide-react';

export interface ParsedRow {
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
  nomorHp: string;
  isValid: boolean;
  isDuplicate?: boolean;
  duplicateReason?: string;
  errors: string[];
  rawSource: Record<string, unknown>;
}

interface ImportSiswaViewProps {
  onSuccess: (importedKelas?: string) => void;
  initialKelas?: string;
}

export interface ColumnMapping {
  namaLengkap?: string;
  nisn?: string;
  nomorInduk?: string;
  kelas?: string;
  jenisKelamin?: string;
  tempatLahir?: string;
  tanggalLahir?: string;
  ttlCombined?: string; // e.g. "Tempat, Tanggal Lahir"
  namaOrangTua?: string;
  alamat?: string;
  nomorHp?: string;
}

// Indonesian month mapping for date normalization
const INDONESIAN_MONTHS: Record<string, string> = {
  januari: '01',
  jan: '01',
  februari: '02',
  feb: '02',
  maret: '03',
  mar: '03',
  april: '04',
  apr: '04',
  mei: '05',
  juni: '06',
  jun: '06',
  juli: '07',
  jul: '07',
  agustus: '08',
  agt: '08',
  agust: '08',
  september: '09',
  sep: '09',
  oktober: '10',
  okt: '10',
  november: '11',
  nov: '11',
  desember: '12',
  des: '12',
};

// Date normalizer supporting Indonesian formats, Excel serials, and ISO
function formatBirthDate(val: unknown): string {
  if (!val) return '2017-01-01';

  // Excel serial number (e.g. 42898)
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
  if (!str) return '2017-01-01';

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Indonesian textual date: e.g. "12 Mei 2017" or "5 Agustus 2016"
  const textDateMatch = str.match(/^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})$/);
  if (textDateMatch) {
    const [, day, monthStr, year] = textDateMatch;
    const monthNum = INDONESIAN_MONTHS[monthStr.toLowerCase()];
    if (monthNum) {
      return `${year}-${monthNum}-${day.padStart(2, '0')}`;
    }
  }

  return str || '2017-01-01';
}

// Convert Roman numerals in class names
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

  const withArabic = convertRomanNumerals(trimmed);
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

  // 4. Standardize name format
  if (withArabic.toLowerCase().startsWith('kelas')) {
    return withArabic.replace(/^[kK][eE][lL][aA][sS]\s*/, 'Kelas ');
  }

  return `Kelas ${withArabic.toUpperCase()}`;
}

// Helper: robust column value extractor with support for explicit custom mapping
function extractField(
  row: Record<string, unknown>,
  aliases: string[],
  customMappedKey?: string
): string {
  // 0. Explicit user custom mapping
  if (customMappedKey && row[customMappedKey] !== undefined && row[customMappedKey] !== null) {
    const val = String(row[customMappedKey]).trim();
    if (val !== '') return val;
  }

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

// Clean and retain leading zeros on NIS/NISN
function cleanIdentificationNumber(val: unknown, expectedLength?: number): string {
  if (val === undefined || val === null) return '';
  const str = String(val).trim();
  if (!str) return '';

  // If scientific notation like 1.65999e+09
  if (/^\d+(\.\d+)?[eE]\+\d+$/.test(str)) {
    try {
      const num = Number(str);
      const fixed = num.toLocaleString('fullwide', { useGrouping: false });
      if (expectedLength && fixed.length < expectedLength) {
        return fixed.padStart(expectedLength, '0');
      }
      return fixed;
    } catch {
      // Fallback
    }
  }

  // Clean non-digits
  const digitsOnly = str.replace(/[^\d]/g, '');
  if (!digitsOnly) return str;

  // Standard Indonesian NISN is 10 digits often starting with 0 (e.g. 0165998811).
  // If Excel stripped the leading 0 leaving 9 digits, restore the leading zero!
  if (expectedLength === 10 && digitsOnly.length === 9) {
    return '0' + digitsOnly;
  }

  return digitsOnly;
}

// Header keywords dictionary for auto-scoring header rows
const HEADER_KEYWORDS = [
  'nama',
  'siswa',
  'peserta',
  'didik',
  'nisn',
  'nis',
  'nipd',
  'induk',
  'kelas',
  'rombel',
  'jk',
  'kelamin',
  'gender',
  'ttl',
  'tempat',
  'tanggal',
  'lahir',
  'alamat',
  'wali',
  'orang',
  'ayah',
  'ibu',
  'telepon',
  'hp',
  'kontak',
  'wa',
];

// Smart Header Row Finder
function findHeaderRowIndex(matrix: unknown[][]): {
  headerRowIndex: number;
  headers: string[];
  titleNotes: string[];
} {
  const maxScan = Math.min(matrix.length, 15);
  let bestRow = 0;
  let bestScore = -1;

  for (let r = 0; r < maxScan; r++) {
    const row = matrix[r];
    if (!Array.isArray(row)) continue;

    let score = 0;
    const nonEmptyCells = row.filter((c) => c !== undefined && c !== null && String(c).trim() !== '');

    if (nonEmptyCells.length < 2) continue; // Single banner title line

    for (const cell of nonEmptyCells) {
      const cleanCell = String(cell).toLowerCase().replace(/[^a-z0-9]/g, '');
      if (HEADER_KEYWORDS.some((kw) => cleanCell.includes(kw))) {
        score++;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestRow = r;
    }
  }

  // Extract title lines above the header
  const titleNotes: string[] = [];
  for (let r = 0; r < bestRow; r++) {
    const text = (matrix[r] || [])
      .map((c) => (c ? String(c).trim() : ''))
      .filter(Boolean)
      .join(' - ');
    if (text) titleNotes.push(text);
  }

  const rawHeaders = (matrix[bestRow] || []).map((c, idx) =>
    c !== undefined && c !== null && String(c).trim() !== ''
      ? String(c).trim()
      : `Kolom_${idx + 1}`
  );

  return {
    headerRowIndex: bestRow,
    headers: rawHeaders,
    titleNotes,
  };
}

// Automatic column matching recommendation
function autoDetectMapping(columns: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};

  const findBestCol = (aliases: string[]): string | undefined => {
    // 1. Exact match
    for (const alias of aliases) {
      const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const col of columns) {
        const cleanCol = col.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanCol === cleanAlias) return col;
      }
    }
    // 2. Substring match
    for (const alias of aliases) {
      const lowerAlias = alias.toLowerCase();
      for (const col of columns) {
        if (col.toLowerCase().includes(lowerAlias)) return col;
      }
    }
    return undefined;
  };

  mapping.namaLengkap = findBestCol([
    'nama lengkap',
    'nama peserta didik',
    'nama siswa',
    'nama murid',
    'nama',
    'peserta didik',
    'siswa',
    'student name',
  ]);

  mapping.nisn = findBestCol([
    'nisn',
    'no. nisn',
    'no nisn',
    'nomor nisn',
    'nisn siswa',
    'nomor induk siswa nasional',
  ]);

  mapping.nomorInduk = findBestCol([
    'nomor induk',
    'no. induk',
    'no induk',
    'nis',
    'nipd',
    'no induk siswa',
    'nomor induk siswa',
    'stambuk',
  ]);

  mapping.kelas = findBestCol([
    'kelas',
    'rombel',
    'rombongan belajar',
    'nama rombel',
    'tingkat',
    'tingkat kelas',
    'kelas / rombel',
    'kelas/rombel',
    'ruang',
  ]);

  mapping.jenisKelamin = findBestCol([
    'jenis kelamin (l/p)',
    'jenis kelamin',
    'jk',
    'l/p',
    'gender',
    'sex',
  ]);

  mapping.tempatLahir = findBestCol([
    'tempat lahir',
    'tempat_lahir',
    'kota lahir',
    'tempat lahir siswa',
    'tmp lahir',
  ]);

  mapping.tanggalLahir = findBestCol([
    'tanggal lahir (yyyy-mm-dd)',
    'tanggal lahir',
    'tanggal_lahir',
    'tgl lahir',
    'tgl_lahir',
    'date of birth',
    'dob',
  ]);

  mapping.ttlCombined = findBestCol([
    'tempat, tanggal lahir',
    'tempat tanggal lahir',
    'ttl',
    'tempat / tanggal lahir',
    'tempat/tgl lahir',
  ]);

  mapping.namaOrangTua = findBestCol([
    'nama orang tua / wali',
    'nama orang tua',
    'orang tua',
    'nama wali',
    'nama ayah',
    'nama ibu',
    'wali',
    'ayah',
    'ibu',
  ]);

  mapping.alamat = findBestCol([
    'alamat',
    'alamat siswa',
    'alamat tempat tinggal',
    'domisili',
    'tempat tinggal',
  ]);

  mapping.nomorHp = findBestCol([
    'nomor telepon',
    'no telepon',
    'no hp',
    'no wa',
    'telepon',
    'no telp',
    'kontak',
    'telepon orang tua',
    'hp',
  ]);

  return mapping;
}

export const ImportSiswaView: React.FC<ImportSiswaViewProps> = ({ onSuccess, initialKelas }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [kelasList] = useState<Kelas[]>(() => db.getAllKelasListUnfiltered());
  const defaultClass = initialKelas || kelasList[0]?.nama || 'Kelas 1A';

  // Assignment configuration
  const [assignmentMode, setAssignmentMode] = useState<'auto' | 'fixed'>('auto');
  const [selectedFixedKelas, setSelectedFixedKelas] = useState<string>(defaultClass);
  const [fallbackKelas, setFallbackKelas] = useState<string>(defaultClass);

  // Duplicate resolution mode
  const [duplicateMode, setDuplicateMode] = useState<'skip' | 'update' | 'reject'>('skip');

  // Column mapping states
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [customMapping, setCustomMapping] = useState<ColumnMapping>({});
  const [showMappingModal, setShowMappingModal] = useState<boolean>(false);

  // File and Parsing Diagnostics
  const [fileName, setFileName] = useState('');
  const [fileTypeInfo, setFileTypeInfo] = useState('');
  const [detectedHeaderIndex, setDetectedHeaderIndex] = useState<number>(0);
  const [detectedTitleNotes, setDetectedTitleNotes] = useState<string[]>([]);
  const [cachedRawItems, setCachedRawItems] = useState<Record<string, unknown>[]>([]);

  // Preview & Editing States
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'valid' | 'duplicate' | 'error'>('all');
  const [filterPreviewKelas, setFilterPreviewKelas] = useState<string>('');
  const [previewSearch, setPreviewSearch] = useState<string>('');

  // Processing & Saving States
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{ percent: number; text: string }>({
    percent: 0,
    text: '',
  });

  // Post-import summary report modal
  const [importReport, setImportReport] = useState<{
    totalChecked: number;
    savedCount: number;
    updatedCount: number;
    skippedCount: number;
    errorCount: number;
    durationSec: number;
    classesAffected: string[];
  } | null>(null);

  // Bulk class editor state
  const [bulkTargetKelas, setBulkTargetKelas] = useState<string>(defaultClass);

  // Download template
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'Nama Lengkap': 'Ahmad Fauzi Pratama',
        NISN: '0165998811',
        'Nomor Induk': '23240150',
        Kelas: 'Kelas 1A',
        'Jenis Kelamin (L/P)': 'L',
        'Tempat Lahir': 'Bandung',
        'Tanggal Lahir (YYYY-MM-DD)': '2017-06-12',
        'Nama Orang Tua / Wali': 'H. Ridwan',
        Alamat: 'Kp. Giriharja RT 02 RW 01',
        'Nomor Telepon / WA': '081234567890',
      },
      {
        'Nama Lengkap': 'Nabila Safitri Anjani',
        NISN: '0165998812',
        'Nomor Induk': '23240151',
        Kelas: 'Kelas 1B',
        'Jenis Kelamin (L/P)': 'P',
        'Tempat Lahir': 'Ciparay',
        'Tanggal Lahir (YYYY-MM-DD)': '2017-09-24',
        'Nama Orang Tua / Wali': 'Yayan Suryana',
        Alamat: 'Jl. Raya Laswi No. 10',
        'Nomor Telepon / WA': '081234567891',
      },
      {
        'Nama Lengkap': 'Dimas Ramadhan Kusuma',
        NISN: '0165998813',
        'Nomor Induk': '23240152',
        Kelas: 'Kelas 2',
        'Jenis Kelamin (L/P)': 'L',
        'Tempat Lahir': 'Bandung',
        'Tanggal Lahir (YYYY-MM-DD)': '2016-03-15',
        'Nama Orang Tua / Wali': 'Agus Sutrisno',
        Alamat: 'Jl. Babakan No. 4',
        'Nomor Telepon / WA': '081234567892',
      },
    ];
    exportToExcel(templateData, 'Template_Import_Siswa_Sekolah_Resmi', 'Data Siswa');
  };

  // Quick load sample data showcasing multiple classes and edge cases
  const handleLoadSample = () => {
    const sampleRaw: Record<string, unknown>[] = [
      {
        'Nama Peserta Didik': 'Naufal Farhan Kamil',
        NISN: '0165999001',
        'Nomor Induk': '23240155',
        Rombel: '1A',
        'Jenis Kelamin': 'L',
        'Tempat Lahir': 'Bandung',
        'Tanggal Lahir': '2017-04-10',
        'Nama Orang Tua': 'Hendra Sujana',
        Alamat: 'Kp. Bojong RT 03',
        'No. HP': '081234567810',
      },
      {
        'Nama Peserta Didik': 'Rania Humaira Az-Zahra',
        NISN: '0165999002',
        'Nomor Induk': '23240156',
        Rombel: '1B',
        'Jenis Kelamin': 'Perempuan',
        'Tempat Lahir': 'Bandung',
        'Tanggal Lahir': '15 November 2017',
        'Nama Orang Tua': 'Dadang Solihin',
        Alamat: 'Desa Giriharja No. 33',
        'No. HP': '081234567811',
      },
      {
        'Nama Peserta Didik': 'Bagas Pratama Putra',
        NISN: '0165999003',
        'Nomor Induk': '23240157',
        'Rombongan Belajar': 'Kelas 2',
        'Jenis Kelamin': 'L',
        'Tempat Lahir': 'Bandung',
        'Tanggal Lahir': '2016-08-20',
        'Nama Orang Tua': 'Joko Waluyo',
        Alamat: 'Ciparay',
        'No. HP': '081234567812',
      },
      {
        'Nama Peserta Didik': 'Citra Kirana Lestari',
        NISN: '0165999004',
        'Nomor Induk': '23240158',
        Kelas: 'Kelas 3',
        'Jenis Kelamin': 'P',
        'Tempat Lahir': 'Bandung',
        'Tanggal Lahir': '12 Mei 2015',
        'Nama Orang Tua': 'Mulyadi',
        Alamat: 'Kp. Pasir',
        'No. HP': '081234567813',
      },
      {
        'Nama Peserta Didik': 'Siswa Contoh Duplikat',
        NISN: '0165432101',
        'Nomor Induk': '23240101',
        Kelas: 'Kelas 1A',
        'Jenis Kelamin': 'L',
        'Tempat Lahir': 'Bandung',
        'Tanggal Lahir': '2017-05-14',
        'Nama Orang Tua': 'Bambang',
        Alamat: 'Kp. Giriharja',
        'No. HP': '081234567814',
      },
      {
        'Nama Peserta Didik': 'Farhan Nugraha (Uji Leading Zero)',
        NISN: '0089123456',
        'Nomor Induk': '0192',
        Kelas: 'Kelas 1A',
        'Jenis Kelamin': 'L',
        'Tempat Lahir': 'Bandung',
        'Tanggal Lahir': '2017-01-20',
        'Nama Orang Tua': 'Asep Nugraha',
        Alamat: 'Baleendah',
        'No. HP': '081234567815',
      },
    ];

    setFileName('contoh_data_siswa_cerdas.xlsx');
    setFileTypeInfo('Excel OpenXML (.xlsx)');
    setDetectedHeaderIndex(0);
    setDetectedTitleNotes([]);

    const cols = Object.keys(sampleRaw[0]);
    setAvailableColumns(cols);
    const autoMap = autoDetectMapping(cols);
    setCustomMapping(autoMap);
    setCachedRawItems(sampleRaw);

    parseRecords(
      sampleRaw,
      assignmentMode,
      selectedFixedKelas,
      fallbackKelas,
      duplicateMode,
      autoMap
    );
  };

  // Upload handler for Excel & CSV with intelligent header row & delimiter sniffing
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsProcessing(true);
    setImportReport(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      let matrix: unknown[][] = [];
      let detectedType = '';

      const isCsv = file.name.toLowerCase().endsWith('.csv');

      if (isCsv) {
        // Robust CSV delimiter sniffer (handles ;, ,, \t, |)
        const textWithBom = new TextDecoder('utf-8').decode(arrayBuffer);
        const text = textWithBom.replace(/^\uFEFF/, ''); // Strip BOM

        const firstLines = text.split('\n').slice(0, 10).join('\n');
        const commaCount = (firstLines.match(/,/g) || []).length;
        const semiCount = (firstLines.match(/;/g) || []).length;
        const tabCount = (firstLines.match(/\t/g) || []).length;
        const pipeCount = (firstLines.match(/\|/g) || []).length;

        let delimiter = ',';
        if (semiCount > commaCount && semiCount > tabCount && semiCount > pipeCount) delimiter = ';';
        else if (tabCount > commaCount && tabCount > semiCount && tabCount > pipeCount) delimiter = '\t';
        else if (pipeCount > commaCount && pipeCount > semiCount && pipeCount > tabCount) delimiter = '|';

        detectedType = `CSV (Pemisah: ${delimiter === '\t' ? 'Tab' : delimiter === ';' ? 'Titik Koma (;)' : delimiter === '|' ? 'Pipe (|)' : 'Koma (,)'})`;

        const wb = XLSX.read(text, { type: 'string', FS: delimiter, raw: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws) throw new Error('Berkas CSV kosong atau tidak memiliki lembar kerja.');
        matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
      } else {
        detectedType = file.name.toLowerCase().endsWith('.xls')
          ? 'Excel 97-2003 (.xls)'
          : 'Excel OpenXML (.xlsx)';

        const wb = XLSX.read(arrayBuffer, {
          type: 'array',
          cellDates: true,
          cellText: true,
          raw: false,
        });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws) throw new Error('Berkas Excel kosong atau tidak memiliki lembar kerja.');
        matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
      }

      setFileTypeInfo(detectedType);

      if (!matrix || matrix.length === 0) {
        throw new Error('Tidak ada data yang ditemukan di dalam lembar kerja.');
      }

      // Automatically find the actual table header row (skipping school banner lines)
      const { headerRowIndex, headers, titleNotes } = findHeaderRowIndex(matrix);
      setDetectedHeaderIndex(headerRowIndex);
      setDetectedTitleNotes(titleNotes);
      setAvailableColumns(headers);

      // Convert rows below the header row into objects
      const dataRows = matrix.slice(headerRowIndex + 1);
      const objectsList: Record<string, unknown>[] = [];

      dataRows.forEach((row) => {
        if (!Array.isArray(row)) return;
        // Check if row has any non-empty cell
        const hasContent = row.some((c) => c !== undefined && c !== null && String(c).trim() !== '');
        if (!hasContent) return; // Skip completely empty rows

        const itemObj: Record<string, unknown> = {};
        headers.forEach((h, colIdx) => {
          const val = row[colIdx];
          itemObj[h] = val !== undefined && val !== null ? String(val).trim() : '';
        });
        objectsList.push(itemObj);
      });

      if (objectsList.length === 0) {
        throw new Error('Tidak ditemukan baris data siswa setelah baris header.');
      }

      // Auto-detect and set initial mapping
      const autoMap = autoDetectMapping(headers);
      setCustomMapping(autoMap);
      setCachedRawItems(objectsList);

      parseRecords(
        objectsList,
        assignmentMode,
        selectedFixedKelas,
        fallbackKelas,
        duplicateMode,
        autoMap
      );
    } catch (err: any) {
      console.error('Parsing error:', err);
      alert('Gagal membaca file: ' + (err?.message || 'Pastikan format berkas valid.'));
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Main parser & deduplicator engine
  const parseRecords = (
    rawItems: Record<string, unknown>[],
    mode: 'auto' | 'fixed',
    fixedKelas: string,
    fallback: string,
    dupMode: 'skip' | 'update' | 'reject' = duplicateMode,
    mapping: ColumnMapping = customMapping
  ) => {
    const existingSiswa = db.getAllSiswaListUnfiltered();
    const existingNisns = new Set(
      existingSiswa.map((s) => cleanIdentificationNumber(s.nisn)).filter((n) => n.length >= 4)
    );
    const existingNoInduk = new Set(
      existingSiswa.map((s) => (s.nomorInduk || '').trim().toLowerCase()).filter(Boolean)
    );

    const seenFileNisn = new Set<string>();
    const batchQrIds = db.generateBatchSiswaQrIds(rawItems.length);

    const parsed: ParsedRow[] = rawItems.map((item, idx) => {
      // 1. Nama Lengkap
      const nama = extractField(
        item,
        [
          'Nama Lengkap',
          'namaLengkap',
          'Nama Peserta Didik',
          'Nama Siswa',
          'Nama Murid',
          'Nama',
          'Peserta Didik',
          'Siswa',
        ],
        mapping.namaLengkap
      );

      // 2. NISN
      const rawNisn = extractField(
        item,
        ['NISN', 'nisn', 'No. NISN', 'No NISN', 'Nomor NISN'],
        mapping.nisn
      );
      const nisnVal = cleanIdentificationNumber(rawNisn, 10);

      // 3. Nomor Induk (NIS)
      const rawNoInduk = extractField(
        item,
        ['Nomor Induk', 'nomorInduk', 'No Induk', 'No. Induk', 'NIPD', 'NIS', 'No Induk Siswa'],
        mapping.nomorInduk
      );
      const noIndukVal = cleanIdentificationNumber(rawNoInduk);

      // 4. Kelas / Rombel
      let finalKelas: string;
      if (mode === 'fixed') {
        finalKelas = fixedKelas || defaultClass;
      } else {
        const rawKelas = extractField(
          item,
          [
            'Kelas',
            'kelas',
            'KELAS',
            'Rombel',
            'rombel',
            'ROMBEL',
            'Rombongan Belajar',
            'rombongan_belajar',
            'Nama Rombel',
            'Tingkat',
            'Tingkat Kelas',
            'Kelas / Rombel',
            'Kelas/Rombel',
            'Ruang',
          ],
          mapping.kelas
        );
        finalKelas = normalizeAndMatchKelas(rawKelas, kelasList, fallback);
      }

      // 5. Gender
      const rawJk = extractField(
        item,
        ['Jenis Kelamin (L/P)', 'Jenis Kelamin', 'JK', 'jk', 'L/P', 'Gender', 'Sex'],
        mapping.jenisKelamin
      ).toUpperCase();
      const jkVal: 'L' | 'P' =
        rawJk.startsWith('P') || rawJk === 'PEREMPUAN' || rawJk === 'WANITA' || rawJk === 'F'
          ? 'P'
          : 'L';

      // 6. Tempat & Tanggal Lahir (Handles single TTL column or split columns)
      let tmpLahir = extractField(
        item,
        ['Tempat Lahir', 'tempatLahir', 'Tempat Lahir Siswa', 'Kota Lahir', 'Tmp Lahir'],
        mapping.tempatLahir
      );
      let tglLahirRaw = extractField(
        item,
        [
          'Tanggal Lahir (YYYY-MM-DD)',
          'Tanggal Lahir',
          'tanggalLahir',
          'Tgl Lahir',
          'Date of Birth',
        ],
        mapping.tanggalLahir
      );

      // Check combined TTL column if either is missing
      const combinedTtl = extractField(
        item,
        ['Tempat, Tanggal Lahir', 'Tempat Tanggal Lahir', 'TTL', 'Tempat/Tgl Lahir'],
        mapping.ttlCombined
      );

      if (combinedTtl && (!tmpLahir || !tglLahirRaw)) {
        const commaSplit = combinedTtl.split(/[,/]/);
        if (commaSplit.length >= 2) {
          if (!tmpLahir) tmpLahir = commaSplit[0].trim();
          if (!tglLahirRaw) tglLahirRaw = commaSplit.slice(1).join(' ').trim();
        } else {
          if (!tmpLahir) tmpLahir = combinedTtl.trim();
        }
      }

      const tglLahir = formatBirthDate(tglLahirRaw);
      if (!tmpLahir) tmpLahir = 'Bandung';

      // 7. Orang Tua & Alamat & Telepon
      const ortuVal = extractField(
        item,
        [
          'Nama Orang Tua / Wali',
          'Nama Orang Tua',
          'Orang Tua',
          'Nama Ayah',
          'Nama Ibu',
          'Wali',
          'Ayah',
          'Ibu',
        ],
        mapping.namaOrangTua
      );

      const alamatVal =
        extractField(
          item,
          ['Alamat', 'alamat', 'Alamat Siswa', 'Alamat Tempat Tinggal', 'Domisili'],
          mapping.alamat
        ) || '-';

      const hpVal = extractField(
        item,
        ['Nomor Telepon / WA', 'Nomor Telepon', 'No Telepon', 'No HP', 'No WA', 'Telepon', 'No Telp', 'Kontak'],
        mapping.nomorHp
      );

      const errors: string[] = [];
      let isDuplicate = false;
      let duplicateReason = '';

      // Required validation: Nama Siswa
      if (!nama || nama.length < 2) {
        errors.push('Nama siswa kosong atau terlalu pendek');
      }

      // Check database duplicates
      const isNisnRegistered = nisnVal && nisnVal.length >= 4 && existingNisns.has(nisnVal);
      const isNoIndukRegistered =
        noIndukVal &&
        noIndukVal.length >= 3 &&
        existingNoInduk.has(noIndukVal.toLowerCase());

      if (isNisnRegistered || isNoIndukRegistered) {
        isDuplicate = true;
        duplicateReason = isNisnRegistered
          ? `NISN ${nisnVal} sudah ada di database`
          : `Nomor Induk ${noIndukVal} sudah ada di database`;

        if (dupMode === 'reject') {
          errors.push(duplicateReason);
        }
      }

      // Check within-file duplicates
      if (nisnVal && nisnVal.length >= 4) {
        if (seenFileNisn.has(nisnVal)) {
          errors.push(`Duplikat NISN ${nisnVal} pada baris lain di dalam file ini`);
        } else {
          seenFileNisn.add(nisnVal);
        }
      }

      // Row validity depends on error count and duplicate mode
      const isValid = errors.length === 0 && (dupMode !== 'reject' || !isDuplicate);

      return {
        index: idx + 1,
        namaLengkap: nama,
        nisn: nisnVal,
        nomorInduk: noIndukVal || `NI-${String(idx + 1).padStart(4, '0')}`,
        qrId: batchQrIds[idx] || `STU-${String(idx + 1).padStart(5, '0')}`,
        kelas: finalKelas,
        jenisKelamin: jkVal,
        tempatLahir: tmpLahir,
        tanggalLahir: tglLahir,
        namaOrangTua: ortuVal,
        alamat: alamatVal,
        nomorHp: hpVal,
        isValid,
        isDuplicate,
        duplicateReason,
        errors,
        rawSource: item,
      };
    });

    setRows(parsed);
  };

  // Re-run parsing if settings change
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

  const handleDuplicateModeChange = (newDupMode: 'skip' | 'update' | 'reject') => {
    setDuplicateMode(newDupMode);
    if (cachedRawItems.length > 0) {
      parseRecords(
        cachedRawItems,
        assignmentMode,
        selectedFixedKelas,
        fallbackKelas,
        newDupMode,
        customMapping
      );
    }
  };

  // Re-apply custom mapping
  const handleApplyMapping = (newMapping: ColumnMapping) => {
    setCustomMapping(newMapping);
    setShowMappingModal(false);
    if (cachedRawItems.length > 0) {
      parseRecords(
        cachedRawItems,
        assignmentMode,
        selectedFixedKelas,
        fallbackKelas,
        duplicateMode,
        newMapping
      );
    }
  };

  // Inline row editor
  const handleUpdateRowField = (
    index: number,
    field: keyof ParsedRow,
    value: string
  ) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.index !== index) return r;
        const updated = { ...r, [field]: value };
        // Quick re-validation on row
        const errs: string[] = [];
        if (!updated.namaLengkap || updated.namaLengkap.length < 2) {
          errs.push('Nama siswa kosong');
        }
        updated.errors = errs;
        updated.isValid = errs.length === 0 && (duplicateMode !== 'reject' || !updated.isDuplicate);
        return updated;
      })
    );
  };

  // Bulk apply class to all rows
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
  const duplicateRows = rows.filter((r) => r.isDuplicate);
  const errorRows = rows.filter((r) => !r.isValid);

  // Filtered rows for the preview table
  const displayedRows = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter === 'valid' && !r.isValid) return false;
      if (statusFilter === 'duplicate' && !r.isDuplicate) return false;
      if (statusFilter === 'error' && r.isValid) return false;

      const matchKelas = filterPreviewKelas ? r.kelas === filterPreviewKelas : true;
      const matchSearch = previewSearch
        ? r.namaLengkap.toLowerCase().includes(previewSearch.toLowerCase()) ||
          r.nisn.includes(previewSearch) ||
          r.nomorInduk.includes(previewSearch) ||
          r.kelas.toLowerCase().includes(previewSearch.toLowerCase())
        : true;

      return matchKelas && matchSearch;
    });
  }, [rows, statusFilter, filterPreviewKelas, previewSearch]);

  // Download comprehensive import log report
  const handleDownloadFullReport = () => {
    const reportData = rows.map((r) => ({
      'No. Baris File': r.index,
      'Nama Siswa': r.namaLengkap,
      NISN: r.nisn,
      'Nomor Induk': r.nomorInduk,
      'ID QR Code': r.qrId,
      'Kelas / Rombel': r.kelas,
      'Jenis Kelamin': r.jenisKelamin,
      'Tempat Lahir': r.tempatLahir,
      'Tanggal Lahir': r.tanggalLahir,
      'Nama Orang Tua': r.namaOrangTua,
      Alamat: r.alamat,
      'Nomor HP': r.nomorHp || '-',
      'Status Verifikasi': r.isValid ? 'Valid' : 'Bermasalah',
      'Terindikasi Duplikat': r.isDuplicate ? 'Ya' : 'Tidak',
      'Catatan Kendala': r.errors.join('; ') || (r.isDuplicate ? r.duplicateReason : '-'),
    }));

    exportToExcel(
      reportData,
      `Laporan_Verifikasi_Import_Siswa_${new Date().toISOString().split('T')[0]}`,
      'Status Verifikasi'
    );
  };

  // Download ONLY failed rows so operator can fix and re-upload effortlessly
  const handleDownloadFailedRowsOnly = () => {
    const failedList = rows.filter((r) => !r.isValid || (duplicateMode === 'reject' && r.isDuplicate));
    if (failedList.length === 0) {
      alert('Tidak ada baris siswa yang bermasalah.');
      return;
    }

    const failedData = failedList.map((r) => ({
      'Nama Lengkap': r.namaLengkap,
      NISN: r.nisn,
      'Nomor Induk': r.nomorInduk,
      Kelas: r.kelas,
      'Jenis Kelamin (L/P)': r.jenisKelamin,
      'Tempat Lahir': r.tempatLahir,
      'Tanggal Lahir (YYYY-MM-DD)': r.tanggalLahir,
      'Nama Orang Tua / Wali': r.namaOrangTua,
      Alamat: r.alamat,
      'Nomor Telepon / WA': r.nomorHp || '',
      'KENDALA HARUS DIPERBAIKI': r.errors.join('; ') || (r.isDuplicate ? r.duplicateReason : 'Data tidak valid'),
    }));

    exportToExcel(
      failedData,
      `Perbaikan_Baris_Gagal_Siswa_${new Date().toISOString().split('T')[0]}`,
      'Perbaikan Siswa'
    );
  };

  // Save to database permanently with Firestore writeBatch and progress bar
  const handleSaveToDatabase = async () => {
    if (validRows.length === 0) {
      alert('Tidak ada data siswa yang valid untuk disimpan.');
      return;
    }

    setIsSaving(true);
    setSaveProgress({ percent: 5, text: 'Mempersiapkan data siswa...' });
    const startTime = Date.now();

    try {
      // Generate sequential unique QR IDs
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
          nomorHp: row.nomorHp || '',
          createdAt: new Date().toISOString().split('T')[0],
        };
      });

      // Execute atomic/batch database save
      const result = await db.saveManySiswa(newStudents, {
        overwriteDuplicates: duplicateMode === 'update',
        onProgress: (processed, total, statusText) => {
          const percent = Math.min(95, Math.round((processed / total) * 100));
          setSaveProgress({ percent, text: statusText });
        },
      });

      const durationSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));
      const affectedClasses = Array.from(new Set(newStudents.map((s) => s.kelas)));

      setSaveProgress({ percent: 100, text: 'Penyimpanan selesai!' });

      setImportReport({
        totalChecked: rows.length,
        savedCount: result.savedCount,
        updatedCount: result.updatedCount,
        skippedCount: result.skippedCount,
        errorCount: errorRows.length,
        durationSec,
        classesAffected: affectedClasses,
      });

      // Clear preview state
      setRows([]);
      setCachedRawItems([]);
      setFileName('');
    } catch (err: any) {
      console.error('Save to database error:', err);
      alert('Terjadi kendala saat menyimpan ke database: ' + (err?.message || 'Koneksi terputus.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-blue-950 tracking-tight flex items-center gap-2">
            <span>Sistem Import Data Siswa Cerdas</span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
              Auto-Mapping & Firestore Sync
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Membaca Excel (.xlsx/.xls) dan CSV dengan deteksi kolom otomatis, verifikasi duplikat, dan sinkronisasi rombel kelas permanen.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleDownloadTemplate}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors border border-slate-200 shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4 text-blue-600" />
            <span>Download Template Excel</span>
          </button>
          <button
            onClick={handleLoadSample}
            className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold flex items-center gap-1.5 transition-colors border border-blue-200 shadow-xs cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Muat Data Contoh Uji</span>
          </button>
        </div>
      </div>

      {/* File Upload Dropzone */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border-2 border-dashed border-blue-200 hover:border-blue-500 transition-all text-center shadow-xs">
        <input
          ref={fileInputRef}
          type="file"
          id="file-import-siswa"
          accept=".xlsx, .xls, .csv"
          onChange={handleFileUpload}
          disabled={isProcessing || isSaving}
          className="hidden"
        />
        <label
          htmlFor="file-import-siswa"
          className="cursor-pointer flex flex-col items-center justify-center space-y-3"
        >
          <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
            {isProcessing ? (
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            ) : (
              <FileSpreadsheet className="w-8 h-8" />
            )}
          </div>
          <div>
            <span className="text-sm font-bold text-slate-900 block">
              {fileName ? fileName : 'PILIH BERKAS EXCEL ATAU CSV SISWA'}
            </span>
            <span className="text-xs text-slate-500 mt-1 block">
              Mendukung Excel (.xlsx, .xls) dan CSV (koma, titik koma, tab) dengan pembacaan header otomatis
            </span>
          </div>
          <span className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-2">
            <Upload className="w-4 h-4" />
            <span>Pilih Berkas Komputer</span>
          </span>
        </label>
      </div>

      {/* Configuration Cards: Rombel Mode & Duplicate Strategy */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Rombel Class Strategy */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900 border-b border-slate-100 pb-2.5">
            <Layers className="w-4 h-4 text-blue-600" />
            <span>STRATEGI PENETAPAN ROMBEL KELAS</span>
          </div>

          <div className="space-y-2">
            <label
              onClick={() => handleModeChange('auto')}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                assignmentMode === 'auto'
                  ? 'border-blue-600 bg-blue-50/60 text-blue-950 shadow-xs'
                  : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 flex-shrink-0 ${
                  assignmentMode === 'auto'
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300'
                }`}
              >
                {assignmentMode === 'auto' && <Check className="w-2.5 h-2.5" />}
              </div>
              <div className="text-xs space-y-0.5">
                <span className="font-bold block">Otomatis dari Kolom Kelas di File (Direkomendasikan)</span>
                <span className="text-[11px] text-slate-500 block leading-tight">
                  Mengenali nama kelas dari file (misal: "1A", "Kelas 2", "VI A") dan mengelompokkan siswa ke kelas masing-masing.
                </span>
                <div className="pt-1.5 flex items-center gap-2 text-[11px]">
                  <span className="text-slate-500">Jika kolom kelas kosong:</span>
                  <select
                    value={fallbackKelas}
                    onChange={(e) => handleFallbackKelasChange(e.target.value)}
                    disabled={assignmentMode !== 'auto'}
                    className="px-2 py-0.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                  >
                    {kelasList.map((k) => (
                      <option key={k.id} value={k.nama}>
                        {k.nama}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </label>

            <label
              onClick={() => handleModeChange('fixed')}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                assignmentMode === 'fixed'
                  ? 'border-blue-600 bg-blue-50/60 text-blue-950 shadow-xs'
                  : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 flex-shrink-0 ${
                  assignmentMode === 'fixed'
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300'
                }`}
              >
                {assignmentMode === 'fixed' && <Check className="w-2.5 h-2.5" />}
              </div>
              <div className="text-xs space-y-0.5">
                <span className="font-bold block">Tetapkan Seluruh Siswa ke Satu Kelas Tertentu</span>
                <span className="text-[11px] text-slate-500 block leading-tight">
                  Cocok jika file hanya berisi siswa dari 1 kelas dan tidak memiliki kolom kelas.
                </span>
                <div className="pt-1.5 flex items-center gap-2 text-[11px]">
                  <span className="text-slate-500">Pilih kelas target:</span>
                  <select
                    value={selectedFixedKelas}
                    onChange={(e) => handleFixedKelasChange(e.target.value)}
                    disabled={assignmentMode !== 'fixed'}
                    className="px-2 py-0.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                  >
                    {kelasList.map((k) => (
                      <option key={k.id} value={k.nama}>
                        {k.nama}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Duplicate Resolution Strategy */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900 border-b border-slate-100 pb-2.5">
            <SlidersHorizontal className="w-4 h-4 text-blue-600" />
            <span>PENGATURAN DATA GANDA (DEDUPLIKASI)</span>
          </div>

          <div className="space-y-2">
            <label
              onClick={() => handleDuplicateModeChange('skip')}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                duplicateMode === 'skip'
                  ? 'border-blue-600 bg-blue-50/60 text-blue-950 shadow-xs'
                  : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 flex-shrink-0 ${
                  duplicateMode === 'skip'
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300'
                }`}
              >
                {duplicateMode === 'skip' && <Check className="w-2.5 h-2.5" />}
              </div>
              <div className="text-xs">
                <span className="font-bold block">Lewati Data Ganda (Aman / Default)</span>
                <span className="text-[11px] text-slate-500 block leading-tight">
                  Jika NISN/NIS sudah ada di database, baris dilewati dan data lama tetap utuh tanpa perubahan.
                </span>
              </div>
            </label>

            <label
              onClick={() => handleDuplicateModeChange('update')}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                duplicateMode === 'update'
                  ? 'border-blue-600 bg-blue-50/60 text-blue-950 shadow-xs'
                  : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 flex-shrink-0 ${
                  duplicateMode === 'update'
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300'
                }`}
              >
                {duplicateMode === 'update' && <Check className="w-2.5 h-2.5" />}
              </div>
              <div className="text-xs">
                <span className="font-bold block">Perbarui Data Siswa yang Sudah Ada (Update/Merge)</span>
                <span className="text-[11px] text-slate-500 block leading-tight">
                  Memperbarui kelas, alamat, orang tua, dsb., dengan mempertahankan ID unik & QR code siswa.
                </span>
              </div>
            </label>

            <label
              onClick={() => handleDuplicateModeChange('reject')}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                duplicateMode === 'reject'
                  ? 'border-rose-600 bg-rose-50/60 text-rose-950 shadow-xs'
                  : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 flex-shrink-0 ${
                  duplicateMode === 'reject'
                    ? 'border-rose-600 bg-rose-600 text-white'
                    : 'border-slate-300'
                }`}
              >
                {duplicateMode === 'reject' && <Check className="w-2.5 h-2.5" />}
              </div>
              <div className="text-xs">
                <span className="font-bold block">Tolak Import jika Terdapat Duplikat (Strict)</span>
                <span className="text-[11px] text-slate-500 block leading-tight">
                  Menandai baris duplikat sebagai error agar operator memeriksa data terlebih dahulu.
                </span>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* File Parsing Diagnostics Banner */}
      {availableColumns.length > 0 && (
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Info className="w-4 h-4 text-blue-600" />
                <span>Format: {fileTypeInfo || 'Excel'}</span>
              </span>
              <span className="text-[11px] bg-slate-200/80 px-2 py-0.5 rounded-md font-mono text-slate-700">
                Baris Header ke-{detectedHeaderIndex + 1}
              </span>
              <span className="text-[11px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md font-semibold">
                {availableColumns.length} Kolom Terdeteksi
              </span>
            </div>
            {detectedTitleNotes.length > 0 && (
              <p className="text-[11px] text-slate-500">
                Judul terdeteksi di atas tabel: <em>{detectedTitleNotes.join(' | ')}</em>
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMappingModal(true)}
              className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold flex items-center gap-1.5 transition-colors border border-slate-200 shadow-xs cursor-pointer"
            >
              <Settings2 className="w-3.5 h-3.5 text-blue-600" />
              <span>Atur / Sesuaikan Pemetaan Kolom</span>
            </button>
          </div>
        </div>
      )}

      {/* Preview Section */}
      {rows.length > 0 && (
        <div className="space-y-4 animate-in fade-in">
          {/* Summary Status Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                  Total Baris File
                </span>
                <h4 className="text-2xl font-black text-slate-900 mt-0.5">{rows.length}</h4>
              </div>
              <FileSpreadsheet className="w-7 h-7 text-slate-400" />
            </div>

            <div className="bg-emerald-50/80 rounded-2xl p-4 border border-emerald-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] text-emerald-700 font-bold uppercase tracking-wider">
                  Siap Disimpan (Valid)
                </span>
                <h4 className="text-2xl font-black text-emerald-800 mt-0.5">{validRows.length}</h4>
              </div>
              <CheckCircle className="w-7 h-7 text-emerald-600" />
            </div>

            <div className="bg-amber-50/80 rounded-2xl p-4 border border-amber-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] text-amber-700 font-bold uppercase tracking-wider">
                  Data Ganda Terdeteksi
                </span>
                <h4 className="text-2xl font-black text-amber-800 mt-0.5">{duplicateRows.length}</h4>
              </div>
              <AlertTriangle className="w-7 h-7 text-amber-600" />
            </div>

            <div className="bg-rose-50/80 rounded-2xl p-4 border border-rose-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] text-rose-700 font-bold uppercase tracking-wider">
                  Gagal Validasi
                </span>
                <h4 className="text-2xl font-black text-rose-800 mt-0.5">{errorRows.length}</h4>
              </div>
              <XCircle className="w-7 h-7 text-rose-600" />
            </div>
          </div>

          {/* Class Distribution & Quick Filter Chips */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Distribusi Rombel Kelas ({classDistribution.length} Kelas Terdeteksi)
                </span>
              </div>
              <span className="text-[11px] text-slate-500">
                Pilih filter kelas di bawah untuk memfilter pratinjau tabel
              </span>
            </div>

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

          {/* Action Toolbar */}
          <div className="bg-blue-50/80 rounded-2xl p-4 border border-blue-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-950">
                <Database className="w-4 h-4 text-blue-700" />
                <span>
                  {validRows.length} dari {rows.length} siswa siap disimpan ke database permanen
                </span>
              </div>
              <p className="text-[11px] text-blue-800">
                Mode saat ini:{' '}
                <strong>
                  {duplicateMode === 'skip'
                    ? 'Lewati Duplikat'
                    : duplicateMode === 'update'
                    ? 'Perbarui Data Lama'
                    : 'Tolak Duplikat'}
                </strong>
                . Semua data otomatis disinkronkan ke Firestore cloud.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 justify-end">
              <button
                onClick={handleDownloadFullReport}
                className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors border border-slate-200 shadow-xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-600" />
                <span>Unduh Laporan Verifikasi</span>
              </button>

              {errorRows.length > 0 && (
                <button
                  onClick={handleDownloadFailedRowsOnly}
                  className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1.5 transition-colors border border-rose-200 shadow-xs cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Unduh Baris Bermasalah Saja ({errorRows.length})</span>
                </button>
              )}

              <button
                id="btn-simpan-import"
                onClick={handleSaveToDatabase}
                disabled={validRows.length === 0 || isSaving}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all ${
                  validRows.length > 0 && !isSaving
                    ? 'bg-blue-700 hover:bg-blue-800 text-white cursor-pointer hover:shadow'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyimpan ({saveProgress.percent}%)...</span>
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    <span>SIMPAN ({validRows.length} DATA VALID)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Real-time Saving Progress Bar */}
          {isSaving && (
            <div className="bg-white rounded-2xl p-4 border border-blue-200 shadow-xs space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                <span className="flex items-center gap-2 text-blue-700">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{saveProgress.text || 'Memproses penyimpanan siswa ke database...'}</span>
                </span>
                <span>{saveProgress.percent}%</span>
              </div>
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-blue-600 h-full transition-all duration-300"
                  style={{ width: `${saveProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Filter & Search Toolbar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari nama, NISN, NIS..."
                  value={previewSearch}
                  onChange={(e) => setPreviewSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {/* Status Tabs */}
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl text-xs">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Semua ({rows.length})
                </button>
                <button
                  onClick={() => setStatusFilter('valid')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    statusFilter === 'valid'
                      ? 'bg-white text-emerald-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Valid ({validRows.length})
                </button>
                <button
                  onClick={() => setStatusFilter('duplicate')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    statusFilter === 'duplicate'
                      ? 'bg-white text-amber-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Duplikat ({duplicateRows.length})
                </button>
                <button
                  onClick={() => setStatusFilter('error')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    statusFilter === 'error'
                      ? 'bg-white text-rose-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Error ({errorRows.length})
                </button>
              </div>
            </div>

            {/* Bulk Class Override Tool */}
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

          {/* Interactive Preview Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto max-h-[520px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[11px] sticky top-0 z-10 shadow-xs">
                  <tr>
                    <th className="px-3.5 py-3 text-center w-12">No</th>
                    <th className="px-3.5 py-3">Status Verifikasi</th>
                    <th className="px-3.5 py-3">Nama Lengkap Siswa</th>
                    <th className="px-3.5 py-3">NISN</th>
                    <th className="px-3.5 py-3">Nomor Induk</th>
                    <th className="px-3.5 py-3">ID QR Code</th>
                    <th className="px-3.5 py-3">Kelas / Rombel</th>
                    <th className="px-3.5 py-3">L/P</th>
                    <th className="px-3.5 py-3">Tempat, Tanggal Lahir</th>
                    <th className="px-3.5 py-3">Orang Tua / Wali</th>
                    <th className="px-3.5 py-3">Nomor Telepon / WA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {displayedRows.map((row) => (
                    <tr
                      key={row.index}
                      className={
                        !row.isValid
                          ? 'bg-rose-50/40 hover:bg-rose-50/70'
                          : row.isDuplicate
                          ? 'bg-amber-50/40 hover:bg-amber-50/70'
                          : 'hover:bg-blue-50/30'
                      }
                    >
                      <td className="px-3.5 py-2.5 text-center text-slate-400 font-mono text-[11px]">
                        {row.index}
                      </td>

                      <td className="px-3.5 py-2.5">
                        {row.isValid ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                              <CheckCircle className="w-3 h-3 text-emerald-600" />
                              <span>{row.isDuplicate ? 'Siap Update' : 'Valid'}</span>
                            </span>
                            {row.isDuplicate && (
                              <div className="text-[10px] text-amber-700 font-medium">
                                {row.duplicateReason}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full">
                              <XCircle className="w-3 h-3 text-rose-600" />
                              <span>Bermasalah</span>
                            </span>
                            <div className="text-[10px] text-rose-600 font-medium leading-tight">
                              {row.errors.join(', ')}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Nama Siswa (Inline Editable) */}
                      <td className="px-3.5 py-2.5 font-bold text-slate-900 min-w-[180px]">
                        <input
                          type="text"
                          value={row.namaLengkap}
                          onChange={(e) => handleUpdateRowField(row.index, 'namaLengkap', e.target.value)}
                          className="w-full px-2 py-1 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-blue-500 rounded-md text-xs font-bold text-slate-900 focus:outline-hidden"
                        />
                      </td>

                      {/* NISN (Inline Editable) */}
                      <td className="px-3.5 py-2.5 font-mono text-slate-800 min-w-[130px]">
                        <input
                          type="text"
                          value={row.nisn}
                          onChange={(e) => handleUpdateRowField(row.index, 'nisn', e.target.value)}
                          placeholder="Kosong"
                          className="w-full px-2 py-1 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-blue-500 rounded-md font-mono text-xs text-slate-800 focus:outline-hidden"
                        />
                      </td>

                      {/* Nomor Induk (Inline Editable) */}
                      <td className="px-3.5 py-2.5 font-mono text-slate-700 min-w-[110px]">
                        <input
                          type="text"
                          value={row.nomorInduk}
                          onChange={(e) => handleUpdateRowField(row.index, 'nomorInduk', e.target.value)}
                          className="w-full px-2 py-1 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-blue-500 rounded-md font-mono text-xs text-slate-700 focus:outline-hidden"
                        />
                      </td>

                      {/* QR ID */}
                      <td className="px-3.5 py-2.5 font-mono text-[11px]">
                        <span className="px-2 py-0.5 font-bold bg-blue-50 text-blue-800 rounded-md border border-blue-200">
                          {row.qrId}
                        </span>
                      </td>

                      {/* Kelas Dropdown */}
                      <td className="px-3.5 py-2.5 min-w-[130px]">
                        <select
                          value={row.kelas}
                          onChange={(e) => handleUpdateRowField(row.index, 'kelas', e.target.value)}
                          className="py-1 px-2 bg-blue-50/70 hover:bg-blue-100/70 border border-blue-200 rounded-lg text-xs font-bold text-blue-900 focus:outline-hidden cursor-pointer"
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

                      {/* Gender Dropdown */}
                      <td className="px-3.5 py-2.5">
                        <select
                          value={row.jenisKelamin}
                          onChange={(e) => handleUpdateRowField(row.index, 'jenisKelamin', e.target.value)}
                          className="py-0.5 px-1.5 bg-slate-50 border border-slate-200 rounded-md font-bold text-xs"
                        >
                          <option value="L">L</option>
                          <option value="P">P</option>
                        </select>
                      </td>

                      {/* Tempat, Tgl Lahir */}
                      <td className="px-3.5 py-2.5 text-slate-600 text-[11px] whitespace-nowrap">
                        {row.tempatLahir}, {row.tanggalLahir}
                      </td>

                      {/* Orang Tua */}
                      <td className="px-3.5 py-2.5 text-slate-600 min-w-[140px]">
                        {row.namaOrangTua || '-'}
                      </td>

                      {/* Telepon */}
                      <td className="px-3.5 py-2.5 text-slate-600 font-mono text-[11px] min-w-[120px]">
                        {row.nomorHp || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {displayedRows.length === 0 && (
              <div className="py-12 text-center text-slate-400 text-xs">
                Tidak ada baris siswa yang cocok dengan filter atau kata kunci pencarian.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Custom Column Mapping */}
      {showMappingModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-blue-600" />
                  <span>Pengaturan Pemetaan Kolom File</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cocokkan kolom pada file Excel Anda dengan kolom data siswa di sistem.
                </p>
              </div>
              <button
                onClick={() => setShowMappingModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5">
              {[
                {
                  id: 'namaLengkap',
                  label: 'Nama Lengkap Siswa',
                  required: true,
                  desc: 'Nama peserta didik sesuai akta / raport',
                },
                {
                  id: 'nisn',
                  label: 'Nomor NISN',
                  required: false,
                  desc: '10 digit NISN resmi Kemdikbud',
                },
                {
                  id: 'nomorInduk',
                  label: 'Nomor Induk Siswa (NIS / NIPD)',
                  required: false,
                  desc: 'Nomor induk internal sekolah',
                },
                {
                  id: 'kelas',
                  label: 'Kelas / Rombel',
                  required: false,
                  desc: 'Rombongan belajar (e.g. 1A, 2B, Kelas 3)',
                },
                {
                  id: 'jenisKelamin',
                  label: 'Jenis Kelamin (L/P)',
                  required: false,
                  desc: 'Laki-laki (L) atau Perempuan (P)',
                },
                {
                  id: 'tempatLahir',
                  label: 'Tempat Lahir',
                  required: false,
                  desc: 'Kota / kabupaten tempat kelahiran',
                },
                {
                  id: 'tanggalLahir',
                  label: 'Tanggal Lahir',
                  required: false,
                  desc: 'Format tanggal YYYY-MM-DD atau DD/MM/YYYY',
                },
                {
                  id: 'ttlCombined',
                  label: 'Tempat, Tanggal Lahir (Digabung)',
                  required: false,
                  desc: 'Gunakan ini jika kota dan tanggal ada dalam 1 kolom (e.g. Bandung, 12 Mei 2017)',
                },
                {
                  id: 'namaOrangTua',
                  label: 'Nama Orang Tua / Wali',
                  required: false,
                  desc: 'Nama ayah, ibu, atau wali murid',
                },
                {
                  id: 'alamat',
                  label: 'Alamat Tinggal',
                  required: false,
                  desc: 'Jalan, RT/RW, desa/kelurahan',
                },
                {
                  id: 'nomorHp',
                  label: 'Nomor HP / WhatsApp',
                  required: false,
                  desc: 'Kontak orang tua atau siswa',
                },
              ].map((field) => {
                const currentVal = customMapping[field.id as keyof ColumnMapping] || '';
                return (
                  <div
                    key={field.id}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 items-center p-3 rounded-xl bg-slate-50 border border-slate-200/80"
                  >
                    <div className="sm:col-span-5">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <span>{field.label}</span>
                        {field.required && (
                          <span className="text-rose-500 text-[10px] font-black">*Wajib</span>
                        )}
                      </span>
                      <span className="text-[11px] text-slate-500 block leading-tight mt-0.5">
                        {field.desc}
                      </span>
                    </div>

                    <div className="sm:col-span-7">
                      <select
                        value={currentVal}
                        onChange={(e) =>
                          setCustomMapping((prev) => ({
                            ...prev,
                            [field.id]: e.target.value || undefined,
                          }))
                        }
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
                      >
                        <option value="">-- Abaikan / Tidak Dipetakan --</option>
                        {availableColumns.map((col) => {
                          const sampleVal = cachedRawItems[0]?.[col];
                          const preview = sampleVal ? ` (Contoh: ${String(sampleVal).slice(0, 20)})` : '';
                          return (
                            <option key={col} value={col}>
                              {col} {preview}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  const autoMap = autoDetectMapping(availableColumns);
                  setCustomMapping(autoMap);
                }}
                className="text-xs font-bold text-blue-700 hover:text-blue-800 flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset ke Rekomendasi Otomatis</span>
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setShowMappingModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyMapping(customMapping)}
                  className="px-5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  Terapkan Pemetaan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Post-Import Summary Report */}
      {importReport && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 sm:p-7 space-y-5">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center shadow-inner">
                <CheckCircle className="w-10 h-10" />
              </div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">
                Import Data Siswa Berhasil Disimpan!
              </h3>
              <p className="text-xs text-slate-500">
                Seluruh data siswa telah diverifikasi dan tersimpan secara permanen di database Google Cloud Firestore.
              </p>
            </div>

            {/* Metrics Breakdown */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 divide-y divide-slate-200/80 text-xs">
              <div className="flex items-center justify-between py-2">
                <span className="text-slate-600 font-medium">Total Baris File Diperiksa</span>
                <span className="font-extrabold text-slate-900">{importReport.totalChecked}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-emerald-700 font-medium">Data Siswa Baru Berhasil Disimpan</span>
                <span className="font-extrabold text-emerald-800">+{importReport.savedCount}</span>
              </div>
              {importReport.updatedCount > 0 && (
                <div className="flex items-center justify-between py-2">
                  <span className="text-blue-700 font-medium">Data Siswa Lama Berhasil Diperbarui</span>
                  <span className="font-extrabold text-blue-800">{importReport.updatedCount}</span>
                </div>
              )}
              {importReport.skippedCount > 0 && (
                <div className="flex items-center justify-between py-2">
                  <span className="text-amber-700 font-medium">Data Ganda Dilewati</span>
                  <span className="font-extrabold text-amber-800">{importReport.skippedCount}</span>
                </div>
              )}
              {importReport.errorCount > 0 && (
                <div className="flex items-center justify-between py-2">
                  <span className="text-rose-700 font-medium">Baris Gagal Validasi</span>
                  <span className="font-extrabold text-rose-800">{importReport.errorCount}</span>
                </div>
              )}
              <div className="flex items-center justify-between py-2">
                <span className="text-slate-600 font-medium">Rombel Kelas Terkait</span>
                <span className="font-bold text-slate-800">
                  {importReport.classesAffected.join(', ') || '-'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-slate-600 font-medium">Durasi Pemrosesan</span>
                <span className="font-mono text-slate-800">{importReport.durationSec} detik</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
              <button
                onClick={() => {
                  const targetClass = importReport.classesAffected[0] || '';
                  setImportReport(null);
                  onSuccess(targetClass);
                }}
                className="w-full py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                Buka Daftar Siswa Sekarang
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
