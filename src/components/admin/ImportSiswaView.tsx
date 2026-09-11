import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { db } from '../../services/database';
import { Siswa } from '../../types';
import { exportToExcel } from '../../utils/exportHelper';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Download,
  ArrowRight,
  Database,
  Sparkles,
  Info,
} from 'lucide-react';

interface ParsedRow {
  index: number;
  namaLengkap: string;
  nisn: string;
  nomorInduk: string;
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
  onSuccess: () => void;
}

export const ImportSiswaView: React.FC<ImportSiswaViewProps> = ({ onSuccess }) => {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState('');

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
        Kelas: 'Kelas 1A',
        'Jenis Kelamin (L/P)': 'P',
        'Tempat Lahir': 'Ciparay',
        'Tanggal Lahir (YYYY-MM-DD)': '2017-09-24',
        'Nama Orang Tua / Wali': 'Yayan Suryana',
        Alamat: 'Jl. Raya Laswi No. 10',
      },
    ];
    exportToExcel(templateData, 'Template_Import_Siswa_Sekolah', 'Template');
  };

  // Quick load sample data
  const handleLoadSample = () => {
    const sampleRaw = [
      {
        'Nama Lengkap': 'Naufal Farhan',
        NISN: '0165999001',
        'Nomor Induk': '23240155',
        Kelas: 'Kelas 1B',
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
        Kelas: 'Kelas 1B',
        'Jenis Kelamin': 'P',
        'Tempat Lahir': 'Bandung',
        'Tanggal Lahir': '2017-11-15',
        'Nama Orang Tua': 'Dadang Solihin',
        Alamat: 'Desa Giriharja No. 33',
      },
      {
        'Nama Lengkap': 'Siswa Tanpa NISN',
        NISN: '', // Intentional error
        'Nomor Induk': '23240157',
        Kelas: 'Kelas 1B',
        'Jenis Kelamin': 'L',
        'Tempat Lahir': 'Bandung',
        'Tanggal Lahir': '2017-01-01',
        'Nama Orang Tua': 'Asep',
        Alamat: 'Ciparay',
      },
      {
        'Nama Lengkap': 'Aditya Pratama Putra', // Existing duplicate
        NISN: '0165432101', // Duplicate NISN from existing database!
        'Nomor Induk': '23240101',
        Kelas: 'Kelas 1A',
        'Jenis Kelamin': 'L',
        'Tempat Lahir': 'Bandung',
        'Tanggal Lahir': '2017-05-14',
        'Nama Orang Tua': 'Bambang',
        Alamat: 'Kp. Giriharja',
      },
    ];
    setFileName('contoh_data_siswa.xlsx');
    parseRecords(sampleRaw);
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
        parseRecords(rawJson);
      } catch (err) {
        console.error('Parsing error:', err);
        alert('Gagal membaca file Excel/CSV! Pastikan format file sesuai.');
      } finally {
        setIsProcessing(false);
      }
    };

    reader.readAsBinaryString(file);
  };

  const parseRecords = (rawItems: Record<string, unknown>[]) => {
    const existingSiswa = db.getSiswaList();
    const existingNisns = new Set(existingSiswa.map((s) => s.nisn.trim()));
    const existingNoInduk = new Set(existingSiswa.map((s) => s.nomorInduk.trim()));

    const seenFileNisn = new Set<string>();

    const parsed: ParsedRow[] = rawItems.map((item, idx) => {
      // Flexible key lookup
      const nama = String(
        item['Nama Lengkap'] || item['namaLengkap'] || item['Nama'] || item['NAMA'] || ''
      ).trim();
      const nisnVal = String(
        item['NISN'] || item['nisn'] || item['No. NISN'] || ''
      ).trim();
      const noIndukVal = String(
        item['Nomor Induk'] || item['nomorInduk'] || item['No Induk'] || item['NI'] || ''
      ).trim();
      const kelasVal = String(
        item['Kelas'] || item['kelas'] || item['Rombel'] || 'Kelas 1A'
      ).trim();
      const jkVal = String(
        item['Jenis Kelamin (L/P)'] || item['Jenis Kelamin'] || item['JK'] || 'L'
      ).toUpperCase().startsWith('P')
        ? 'P'
        : 'L';
      const tmpLahir = String(
        item['Tempat Lahir'] || item['tempatLahir'] || 'Bandung'
      ).trim();
      const tglLahir = String(
        item['Tanggal Lahir (YYYY-MM-DD)'] || item['Tanggal Lahir'] || item['tanggalLahir'] || '2017-01-01'
      ).trim();
      const ortuVal = String(
        item['Nama Orang Tua / Wali'] || item['Nama Orang Tua'] || item['Orang Tua'] || ''
      ).trim();
      const alamatVal = String(item['Alamat'] || item['alamat'] || '-').trim();

      const errors: string[] = [];

      // 1. Cek data kosong
      if (!nama) errors.push('Nama siswa kosong');
      if (!nisnVal) errors.push('NISN siswa kosong');

      // 2. Cek data duplikat (dalam database)
      if (nisnVal && existingNisns.has(nisnVal)) {
        errors.push(`NISN ${nisnVal} sudah terdaftar di database`);
      }
      if (noIndukVal && existingNoInduk.has(noIndukVal)) {
        errors.push(`Nomor Induk ${noIndukVal} sudah ada di database`);
      }

      // 3. Cek data duplikat (dalam file yang sama)
      if (nisnVal && seenFileNisn.has(nisnVal)) {
        errors.push(`Duplikat NISN ${nisnVal} di baris lain dalam file ini`);
      }
      if (nisnVal) seenFileNisn.add(nisnVal);

      return {
        index: idx + 1,
        namaLengkap: nama,
        nisn: nisnVal,
        nomorInduk: noIndukVal || `NI-${Math.floor(1000 + Math.random() * 9000)}`,
        kelas: kelasVal.includes('Kelas') ? kelasVal : `Kelas ${kelasVal}`,
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

  const validRows = rows.filter((r) => r.isValid);
  const invalidRows = rows.filter((r) => !r.isValid);

  const handleSaveToDatabase = () => {
    if (validRows.length === 0) {
      alert('Tidak ada data valid yang dapat disimpan.');
      return;
    }

    // Auto-generate sequential QR Code ID STU-xxxxx
    const newStudents: Siswa[] = validRows.map((row) => {
      const nextQrId = db.generateNextSiswaQrId();
      return {
        id: `stu-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
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

    db.saveManySiswa(newStudents);
    setSaveSuccessMessage(
      `Berhasil menyimpan ${newStudents.length} siswa baru ke database! Seluruh QR Code siswa telah dibuat secara otomatis.`
    );
    setRows([]);
    setFileName('');

    setTimeout(() => {
      onSuccess();
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
            Unggah file .xlsx, .xls, atau .csv untuk menambahkan siswa secara massal dengan verifikasi duplikasi otomatis.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadTemplate}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-blue-700" />
            <span>Download Template Excel</span>
          </button>
          <button
            onClick={handleLoadSample}
            className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-blue-200"
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
            IMPORT DATA SISWA
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

          {/* Action Bar */}
          <div className="flex items-center justify-between bg-blue-50/60 p-4 rounded-2xl border border-blue-200">
            <div className="flex items-center gap-2 text-xs text-blue-900">
              <Info className="w-4 h-4 text-blue-700 flex-shrink-0" />
              <span>
                Menampilkan hasil verifikasi file <strong>{fileName}</strong>. Hanya baris yang berstatus <strong>Valid</strong> yang akan masuk ke database dan dibuatkan ID QR unik.
              </span>
            </div>

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

          {/* Table Preview */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[11px]">
                  <tr>
                    <th className="px-4 py-3 text-center w-12">Baris</th>
                    <th className="px-4 py-3">Status Verifikasi</th>
                    <th className="px-4 py-3">Nama Lengkap</th>
                    <th className="px-4 py-3">NISN</th>
                    <th className="px-4 py-3">Nomor Induk</th>
                    <th className="px-4 py-3">Kelas</th>
                    <th className="px-4 py-3">L/P</th>
                    <th className="px-4 py-3">Tempat, Tgl Lahir</th>
                    <th className="px-4 py-3">Orang Tua / Wali</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {rows.map((row) => (
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
                      <td className="px-4 py-3 font-mono">
                        {row.nisn || <span className="text-rose-500 italic">Kosong</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{row.nomorInduk}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-slate-100 rounded text-[11px]">
                          {row.kelas}
                        </span>
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
          </div>
        </div>
      )}
    </div>
  );
};
