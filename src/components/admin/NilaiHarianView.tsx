import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../../services/database';
import { Kelas, MataPelajaran, Siswa, NilaiHarianItem } from '../../types';
import { ConfirmModal } from '../common/ConfirmModal';
import {
  FileSpreadsheet,
  Plus,
  Save,
  Trash2,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Printer,
  Sparkles,
  Edit2,
  Download,
  Clock,
  X,
  Search,
  BookOpen,
  Info,
} from 'lucide-react';

interface AssessmentMeta {
  assessmentId: string;
  tanggal: string;
  materi: string;
  jenisPenilaian: 'Tugas' | 'Ulangan Harian' | 'Formatif' | 'Kuis' | 'Praktik' | string;
  keterangan?: string;
}

export const NilaiHarianView: React.FC = () => {
  const [kelasList, setKelasList] = useState<Kelas[]>(db.getKelasList());
  const [mapelList, setMapelList] = useState<MataPelajaran[]>(db.getMapelList());
  const [siswaList, setSiswaList] = useState<Siswa[]>(db.getSiswaList());
  const [nilaiHarianList, setNilaiHarianList] = useState<NilaiHarianItem[]>(db.getNilaiHarianList());
  const [settings, setSettings] = useState(db.getSettings());

  const currentUser = db.getCurrentUser();
  const isGuru = currentUser?.role === 'guru';

  // 1. Core Filters
  const [selectedKelasId, setSelectedKelasId] = useState<string>(() => {
    if (isGuru && currentUser?.kelasId) return currentUser.kelasId;
    return kelasList[0]?.id || '';
  });
  const [selectedMapelId, setSelectedMapelId] = useState<string>(() => mapelList[0]?.id || '');
  const [selectedSemester, setSelectedSemester] = useState<'Ganjil' | 'Genap'>(
    settings?.semesterAktif || 'Ganjil'
  );
  const [selectedTahunAjaran, setSelectedTahunAjaran] = useState<string>(
    settings?.tahunAjaranAktif || '2023/2024'
  );

  // Date Range Filter
  const [startDateFilter, setStartDateFilter] = useState<string>('');
  const [endDateFilter, setEndDateFilter] = useState<string>('');
  const [searchStudent, setSearchStudent] = useState<string>('');

  // 2. Assessment Matrix Management
  // assessmentId -> { [siswaId]: number }
  const [assessmentScores, setAssessmentScores] = useState<Record<string, Record<string, number>>>({});
  // List of active assessments for current filtered context
  const [assessments, setAssessments] = useState<AssessmentMeta[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Modal: Add New Assessment
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [newTanggal, setNewTanggal] = useState<string>(new Date().toISOString().split('T')[0]);
  const [newMateri, setNewMateri] = useState<string>('');
  const [newJenis, setNewJenis] = useState<'Tugas' | 'Ulangan Harian' | 'Formatif' | 'Kuis' | 'Praktik'>('Formatif');
  const [newKeterangan, setNewKeterangan] = useState<string>('');

  // Modal: Edit Assessment
  const [editingAssessment, setEditingAssessment] = useState<AssessmentMeta | null>(null);
  const [editTanggal, setEditTanggal] = useState<string>('');
  const [editMateri, setEditMateri] = useState<string>('');
  const [editJenis, setEditJenis] = useState<string>('');
  const [editKeterangan, setEditKeterangan] = useState<string>('');

  // Modal: Delete Assessment
  const [assessmentToDelete, setAssessmentToDelete] = useState<AssessmentMeta | null>(null);

  // Modal: History View
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);

  const printRef = useRef<HTMLDivElement>(null);

  // Sync data from database
  const reloadData = () => {
    setSettings(db.getSettings());
    const kList = db.getKelasList();
    setKelasList(kList);
    setMapelList(db.getMapelList());
    setSiswaList(db.getSiswaList());
    setNilaiHarianList(db.getNilaiHarianList());

    if (isGuru && currentUser?.kelasId) {
      setSelectedKelasId(currentUser.kelasId);
    } else if (!selectedKelasId && kList.length > 0) {
      setSelectedKelasId(kList[0].id);
    }
  };

  useEffect(() => {
    window.addEventListener('nilai_harian_updated', reloadData);
    window.addEventListener('data_kelas_changed', reloadData);
    return () => {
      window.removeEventListener('nilai_harian_updated', reloadData);
      window.removeEventListener('data_kelas_changed', reloadData);
    };
  }, []);

  const activeKelas = useMemo(() => {
    return kelasList.find((k) => k.id === selectedKelasId) || kelasList[0];
  }, [kelasList, selectedKelasId]);

  const activeMapel = useMemo(() => {
    return mapelList.find((m) => m.id === selectedMapelId) || mapelList[0];
  }, [mapelList, selectedMapelId]);

  const studentsInClass = useMemo(() => {
    if (!activeKelas) return [];
    return siswaList.filter((s) => s.kelas === activeKelas.nama);
  }, [siswaList, activeKelas]);

  const filteredStudents = useMemo(() => {
    if (!searchStudent.trim()) return studentsInClass;
    const q = searchStudent.toLowerCase();
    return studentsInClass.filter(
      (s) =>
        s.namaLengkap.toLowerCase().includes(q) ||
        (s.nomorInduk && s.nomorInduk.toLowerCase().includes(q)) ||
        (s.nisn && s.nisn.toLowerCase().includes(q))
    );
  }, [studentsInClass, searchStudent]);

  // Load Assessments & Existing Scores whenever class, mapel, semester, or tahunAjaran changes
  useEffect(() => {
    if (!activeKelas || !activeMapel) return;

    // Filter relevant entries
    const relevantEntries = nilaiHarianList.filter(
      (n) =>
        n.kelasId === activeKelas.id &&
        n.mapelId === activeMapel.id &&
        (!n.semester || n.semester === selectedSemester) &&
        (!n.tahunAjaran || n.tahunAjaran === selectedTahunAjaran)
    );

    // Group entries by assessment (use assessmentId or combo of tanggal+materi+jenis)
    const assessmentMap = new Map<string, AssessmentMeta>();
    const scoresMap: Record<string, Record<string, number>> = {};

    relevantEntries.forEach((entry) => {
      // Build unique identifier per assessment column
      const assId =
        entry.assessmentId ||
        `ass_${entry.tanggal}_${entry.materi.replace(/\s+/g, '_')}_${entry.jenisPenilaian}`;

      if (!assessmentMap.has(assId)) {
        assessmentMap.set(assId, {
          assessmentId: assId,
          tanggal: entry.tanggal,
          materi: entry.materi,
          jenisPenilaian: entry.jenisPenilaian,
          keterangan: entry.catatan || entry.keterangan || '',
        });
      }

      if (!scoresMap[assId]) {
        scoresMap[assId] = {};
      }
      scoresMap[assId][entry.siswaId] = entry.nilai;
    });

    // Convert map to array and sort chronologically by date
    const sortedAssessments = Array.from(assessmentMap.values()).sort((a, b) =>
      a.tanggal.localeCompare(b.tanggal)
    );

    setAssessments(sortedAssessments);
    setAssessmentScores(scoresMap);
    setHasUnsavedChanges(false);
  }, [activeKelas, activeMapel, selectedSemester, selectedTahunAjaran, nilaiHarianList]);

  // Filtered assessment columns by date range
  const displayedAssessments = useMemo(() => {
    return assessments.filter((ass) => {
      if (startDateFilter && ass.tanggal < startDateFilter) return false;
      if (endDateFilter && ass.tanggal > endDateFilter) return false;
      return true;
    });
  }, [assessments, startDateFilter, endDateFilter]);

  // Handle Score Input Change
  const handleScoreChange = (assId: string, siswaId: string, valStr: string) => {
    let numVal = parseInt(valStr, 10);
    if (isNaN(numVal)) numVal = 0;
    if (numVal < 0) numVal = 0;
    if (numVal > 100) numVal = 100;

    setAssessmentScores((prev) => ({
      ...prev,
      [assId]: {
        ...(prev[assId] || {}),
        [siswaId]: numVal,
      },
    }));
    setHasUnsavedChanges(true);
  };

  // Quick fill entire column with a single score
  const handleQuickFillColumn = (ass: AssessmentMeta) => {
    const val = prompt(`Masukkan nilai serentak untuk penilaian "${ass.materi}" (0 - 100):`, '80');
    if (val === null) return;
    const num = Math.min(100, Math.max(0, parseInt(val, 10) || 0));

    const newColumnScores: Record<string, number> = {};
    studentsInClass.forEach((s) => {
      newColumnScores[s.id] = num;
    });

    setAssessmentScores((prev) => ({
      ...prev,
      [ass.assessmentId]: {
        ...(prev[ass.assessmentId] || {}),
        ...newColumnScores,
      },
    }));
    setHasUnsavedChanges(true);
  };

  // Add New Assessment Column
  const handleCreateAssessment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMateri.trim()) {
      setErrorMsg('Materi / Judul penilaian harus diisi');
      setTimeout(() => setErrorMsg(''), 3000);
      return;
    }
    if (!activeKelas || !activeMapel) return;

    const uniqueAssId = `ass_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newAss: AssessmentMeta = {
      assessmentId: uniqueAssId,
      tanggal: newTanggal,
      materi: newMateri.trim(),
      jenisPenilaian: newJenis,
      keterangan: newKeterangan.trim(),
    };

    const updatedAssessments = [...assessments, newAss].sort((a, b) =>
      a.tanggal.localeCompare(b.tanggal)
    );
    setAssessments(updatedAssessments);

    // Initialize scores for all students in this column with 0
    const initialScores: Record<string, number> = {};
    studentsInClass.forEach((s) => {
      initialScores[s.id] = 0;
    });

    setAssessmentScores((prev) => ({
      ...prev,
      [uniqueAssId]: initialScores,
    }));

    setHasUnsavedChanges(true);
    setIsAddModalOpen(false);
    setNewMateri('');
    setNewKeterangan('');
    setSuccessMsg(`Kolom penilaian "${newAss.materi}" berhasil ditambahkan! Silakan masukkan nilai siswa.`);
    setTimeout(() => setSuccessMsg(''), 3500);
  };

  // Open Edit Modal for an Assessment
  const openEditModal = (ass: AssessmentMeta) => {
    setEditingAssessment(ass);
    setEditTanggal(ass.tanggal);
    setEditMateri(ass.materi);
    setEditJenis(ass.jenisPenilaian);
    setEditKeterangan(ass.keterangan || '');
  };

  // Save Edit Assessment
  const handleSaveAssessmentEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAssessment || !activeKelas || !activeMapel) return;
    if (!editMateri.trim()) {
      setErrorMsg('Materi penilaian tidak boleh kosong');
      return;
    }

    const updatedAss: AssessmentMeta = {
      ...editingAssessment,
      tanggal: editTanggal,
      materi: editMateri.trim(),
      jenisPenilaian: editJenis,
      keterangan: editKeterangan.trim(),
    };

    // Update in local state
    setAssessments((prev) =>
      prev
        .map((a) => (a.assessmentId === editingAssessment.assessmentId ? updatedAss : a))
        .sort((a, b) => a.tanggal.localeCompare(b.tanggal))
    );

    // Update in database for existing persisted items
    db.updateNilaiHarianAssessmentInfo(
      {
        kelasId: activeKelas.id,
        mapelId: activeMapel.id,
        assessmentId: editingAssessment.assessmentId,
        semester: selectedSemester,
        tahunAjaran: selectedTahunAjaran,
      },
      {
        tanggal: editTanggal,
        materi: editMateri.trim(),
        jenisPenilaian: editJenis,
        keterangan: editKeterangan.trim(),
      }
    );

    setEditingAssessment(null);
    setHasUnsavedChanges(true);
    setSuccessMsg('Informasi penilaian berhasil diperbarui!');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // Delete Assessment
  const confirmDeleteAssessment = () => {
    if (!assessmentToDelete || !activeKelas || !activeMapel) return;

    const assId = assessmentToDelete.assessmentId;

    // Delete in database
    db.deleteNilaiHarianAssessment({
      kelasId: activeKelas.id,
      mapelId: activeMapel.id,
      assessmentId: assId,
      tanggal: assessmentToDelete.tanggal,
      materi: assessmentToDelete.materi,
      semester: selectedSemester,
      tahunAjaran: selectedTahunAjaran,
    });

    // Update local state
    setAssessments((prev) => prev.filter((a) => a.assessmentId !== assId));
    setAssessmentScores((prev) => {
      const next = { ...prev };
      delete next[assId];
      return next;
    });

    setAssessmentToDelete(null);
    setHasUnsavedChanges(false);
    setSuccessMsg(`Penilaian "${assessmentToDelete.materi}" berhasil dihapus.`);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // Core Save to Database
  const handleSaveAll = () => {
    if (!activeKelas || !activeMapel) return;
    const schoolId = currentUser?.schoolId || db.getActiveSchoolId() || 'sch-default';

    const itemsToSave: NilaiHarianItem[] = [];

    // For every assessment and every student, build persistent entity
    assessments.forEach((ass) => {
      const colScores = assessmentScores[ass.assessmentId] || {};

      studentsInClass.forEach((siswa) => {
        const scoreVal = colScores[siswa.id] !== undefined ? colScores[siswa.id] : 0;
        // Deterministic unique ID complying with requirement #11:
        // school_id + student_id + class_id + subject_id + semester + academic_year + assessment_date
        const cleanTahun = selectedTahunAjaran.replace(/[^a-zA-Z0-9]/g, '-');
        const deterministicId = `nh_${schoolId}_${siswa.id}_${activeKelas.id}_${activeMapel.id}_${selectedSemester}_${cleanTahun}_${ass.assessmentId}`;

        itemsToSave.push({
          id: deterministicId,
          schoolId,
          siswaId: siswa.id,
          namaSiswa: siswa.namaLengkap,
          kelasId: activeKelas.id,
          namaKelas: activeKelas.nama,
          mapelId: activeMapel.id,
          namaMapel: activeMapel.nama,
          jenisPenilaian: ass.jenisPenilaian,
          materi: ass.materi,
          tanggal: ass.tanggal,
          nilai: scoreVal,
          catatan: ass.keterangan || '',
          semester: selectedSemester,
          tahunAjaran: selectedTahunAjaran,
          assessmentId: ass.assessmentId,
          keterangan: ass.keterangan,
        });
      });
    });

    db.saveBulkNilaiHarian(itemsToSave);
    setHasUnsavedChanges(false);
    setSuccessMsg(`Seluruh nilai jurnal harian ${activeKelas.nama} - ${activeMapel.nama} berhasil disimpan ke database!`);
    setTimeout(() => setSuccessMsg(''), 3500);
  };

  // Calculate Student Average
  const calculateStudentAverage = (siswaId: string): { avg: number; count: number } => {
    if (displayedAssessments.length === 0) return { avg: 0, count: 0 };
    let total = 0;
    let count = 0;
    displayedAssessments.forEach((ass) => {
      const colScores = assessmentScores[ass.assessmentId];
      if (colScores && colScores[siswaId] !== undefined) {
        total += colScores[siswaId];
        count++;
      }
    });
    return {
      avg: count > 0 ? parseFloat((total / count).toFixed(1)) : 0,
      count,
    };
  };

  // Calculate Column Average
  const calculateColumnAverage = (assId: string): { avg: number; count: number } => {
    const colScores = assessmentScores[assId];
    if (!colScores || studentsInClass.length === 0) return { avg: 0, count: 0 };
    let total = 0;
    let count = 0;
    studentsInClass.forEach((s) => {
      if (colScores[s.id] !== undefined) {
        total += colScores[s.id];
        count++;
      }
    });
    return {
      avg: count > 0 ? parseFloat((total / count).toFixed(1)) : 0,
      count,
    };
  };

  // Overall Class Stats
  const kkm = activeMapel?.kkm || 75;
  const overallStats = useMemo(() => {
    if (studentsInClass.length === 0 || displayedAssessments.length === 0) {
      return { classAvg: 0, tuntasCount: 0, remedialCount: 0 };
    }
    let totalAllAvg = 0;
    let tuntas = 0;
    studentsInClass.forEach((s) => {
      const { avg } = calculateStudentAverage(s.id);
      totalAllAvg += avg;
      if (avg >= kkm) tuntas++;
    });
    return {
      classAvg: parseFloat((totalAllAvg / studentsInClass.length).toFixed(1)),
      tuntasCount: tuntas,
      remedialCount: studentsInClass.length - tuntas,
    };
  }, [studentsInClass, displayedAssessments, assessmentScores, kkm]);

  // Export to Excel (.xls HTML table)
  const handleExportExcel = () => {
    if (!activeKelas || !activeMapel) return;

    const filename = `Jurnal_Nilai_${activeKelas.nama}_${activeMapel.nama}_${selectedSemester}_${selectedTahunAjaran.replace('/', '-')}.xls`;

    let html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Jurnal Nilai</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
        <meta http-equiv="content-type" content="text/plain; charset=UTF-8"/>
        <style>
          table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 12px; }
          th { background-color: #2563eb; color: #ffffff; border: 1px solid #cbd5e1; padding: 8px; text-align: center; }
          td { border: 1px solid #cbd5e1; padding: 6px 8px; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .kkm-pass { background-color: #d1fae5; color: #065f46; font-weight: bold; }
          .kkm-fail { background-color: #fee2e2; color: #991b1b; font-weight: bold; }
          .title { font-size: 16px; font-weight: bold; text-align: center; }
          .sub { font-size: 12px; text-align: center; margin-bottom: 15px; }
        </style>
      </head>
      <body>
        <div class="title">JURNAL NILAI HARIAN PESERTA DIDIK</div>
        <div class="sub">${settings.namaSekolah || 'SD NEGERI'} - TAHUN AJARAN ${selectedTahunAjaran} SEMESTER ${selectedSemester.toUpperCase()}</div>
        <p><strong>Kelas:</strong> ${activeKelas.nama} | <strong>Mata Pelajaran:</strong> ${activeMapel.nama} | <strong>Standar KKM:</strong> ${kkm}</p>
        <table>
          <thead>
            <tr>
              <th rowspan="2">No</th>
              <th rowspan="2">NIS / NISN</th>
              <th rowspan="2">Nama Siswa</th>
    `;

    displayedAssessments.forEach((ass) => {
      html += `<th>${ass.tanggal}</th>`;
    });

    html += `
              <th rowspan="2">Rata-rata</th>
              <th rowspan="2">Status</th>
            </tr>
            <tr>
    `;

    displayedAssessments.forEach((ass) => {
      html += `<th>${ass.materi} (${ass.jenisPenilaian})</th>`;
    });

    html += `</tr></thead><tbody>`;

    studentsInClass.forEach((s, idx) => {
      const { avg } = calculateStudentAverage(s.id);
      const isPass = avg >= kkm;
      html += `
        <tr>
          <td class="center">${idx + 1}</td>
          <td class="center">'${s.nomorInduk || s.nisn || '-'}</td>
          <td class="bold">${s.namaLengkap}</td>
      `;

      displayedAssessments.forEach((ass) => {
        const val = assessmentScores[ass.assessmentId]?.[s.id] ?? 0;
        const cellClass = val >= kkm ? 'kkm-pass center' : 'center';
        html += `<td class="${cellClass}">${val}</td>`;
      });

      html += `
          <td class="center bold ${isPass ? 'kkm-pass' : 'kkm-fail'}">${avg}</td>
          <td class="center ${isPass ? 'kkm-pass' : 'kkm-fail'}">${isPass ? 'Tuntas' : 'Remedial'}</td>
        </tr>
      `;
    });

    // Column Averages row
    html += `
      <tr style="background-color: #f8fafc; font-weight: bold;">
        <td colspan="3" class="center">Rata-rata Penilaian Kelas</td>
    `;
    displayedAssessments.forEach((ass) => {
      const { avg } = calculateColumnAverage(ass.assessmentId);
      html += `<td class="center">${avg}</td>`;
    });
    html += `
        <td class="center">${overallStats.classAvg}</td>
        <td class="center">-</td>
      </tr>
    `;

    html += `</tbody></table></body></html>`;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Trigger Print View
  const handlePrint = () => {
    window.print();
  };

  if (!activeKelas || !activeMapel) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-500">
        Silakan daftarkan Kelas dan Mata Pelajaran terlebih dahulu di menu <strong>Kelas & Mapel</strong>.
      </div>
    );
  }

  return (
    <div className="space-y-5" ref={printRef}>
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700 font-bold">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Jurnal Nilai Harian</h2>
                {hasUnsavedChanges && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                    Perubahan Belum Disimpan
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Pencatatan buku nilai per pertemuan, tugas, dan ulangan harian secara langsung dalam satu tampilan
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            id="btn-tambah-penilaian"
            type="button"
            onClick={() => {
              setNewTanggal(new Date().toISOString().split('T')[0]);
              setNewMateri('');
              setNewKeterangan('');
              setIsAddModalOpen(true);
            }}
            className="px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Tambah Penilaian</span>
          </button>

          <button
            id="btn-simpan-nilai-jurnal"
            type="button"
            onClick={handleSaveAll}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer ${
              hasUnsavedChanges
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white animate-bounce ring-2 ring-emerald-400/40'
                : 'bg-slate-800 hover:bg-slate-900 text-white'
            }`}
          >
            <Save className="w-4 h-4" />
            <span>Simpan Nilai</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            title="Download Spreadsheet Excel"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span className="hidden sm:inline">Download Excel</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            title="Cetak Jurnal Nilai"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            <span className="hidden sm:inline">Cetak</span>
          </button>

          <button
            type="button"
            onClick={() => setIsHistoryModalOpen(true)}
            className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
            title="Lihat Riwayat Penilaian"
          >
            <Clock className="w-4 h-4 text-slate-500" />
            <span className="hidden sm:inline">Riwayat ({assessments.length})</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in print:hidden">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in print:hidden">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* FILTER PANEL */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3 print:hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Kelas */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Kelas</label>
            {isGuru && currentUser?.kelasId ? (
              <div className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold bg-slate-50 text-blue-900 flex items-center justify-between">
                <span>{activeKelas.nama}</span>
                <span className="text-[10px] text-blue-600 font-semibold px-2 py-0.5 rounded-md bg-blue-100">
                  Wali Kelas
                </span>
              </div>
            ) : (
              <select
                id="select-filter-kelas"
                value={selectedKelasId}
                onChange={(e) => setSelectedKelasId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-600/20 bg-white"
              >
                {kelasList.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama} (Tingkat {k.tingkat})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Mata Pelajaran */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Mata Pelajaran</label>
            <select
              id="select-filter-mapel"
              value={selectedMapelId}
              onChange={(e) => setSelectedMapelId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-600/20 bg-white"
            >
              {mapelList.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nama} (KKM: {m.kkm})
                </option>
              ))}
            </select>
          </div>

          {/* Semester */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Semester</label>
            <select
              id="select-filter-semester"
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-600/20 bg-white"
            >
              <option value="Ganjil">Semester 1 (Ganjil)</option>
              <option value="Genap">Semester 2 (Genap)</option>
            </select>
          </div>

          {/* Tahun Ajaran */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Tahun Ajaran</label>
            <select
              id="select-filter-tahun-ajaran"
              value={selectedTahunAjaran}
              onChange={(e) => setSelectedTahunAjaran(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-600/20 bg-white"
            >
              <option value="2023/2024">2023/2024</option>
              <option value="2024/2025">2024/2025</option>
              <option value="2025/2026">2025/2026</option>
              <option value="2026/2027">2026/2027</option>
            </select>
          </div>

          {/* Rentang Tanggal Filter */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between">
              <span>Rentang Tanggal</span>
              {(startDateFilter || endDateFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setStartDateFilter('');
                    setEndDateFilter('');
                  }}
                  className="text-[10px] text-rose-600 hover:underline cursor-pointer"
                >
                  Reset
                </button>
              )}
            </label>
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={startDateFilter}
                onChange={(e) => setStartDateFilter(e.target.value)}
                placeholder="Dari"
                className="w-1/2 px-2 py-1.5 border border-slate-200 rounded-xl text-[11px] font-medium"
                title="Dari tanggal"
              />
              <span className="text-slate-400 text-xs">-</span>
              <input
                type="date"
                value={endDateFilter}
                onChange={(e) => setEndDateFilter(e.target.value)}
                placeholder="Sampai"
                className="w-1/2 px-2 py-1.5 border border-slate-200 rounded-xl text-[11px] font-medium"
                title="Sampai tanggal"
              />
            </div>
          </div>
        </div>
      </div>

      {/* QUICK SUMMARY METRICS BAR */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:hidden">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Siswa</span>
            <div className="text-xl font-extrabold text-slate-900 mt-0.5">{studentsInClass.length}</div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-md">
              {activeKelas.nama}
            </span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Penilaian Dilakukan</span>
            <div className="text-xl font-extrabold text-blue-700 mt-0.5">{displayedAssessments.length}</div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-500 font-medium">KKM: {kkm}</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Rata-Rata Kelas</span>
            <div className="text-xl font-extrabold text-emerald-700 mt-0.5">{overallStats.classAvg}</div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md">
              {overallStats.tuntasCount} Tuntas
            </span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">Perlu Remedial</span>
            <div className="text-xl font-extrabold text-rose-600 mt-0.5">{overallStats.remedialCount}</div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded-md">
              &lt; {kkm}
            </span>
          </div>
        </div>
      </div>

      {/* PRINT HEADER ONLY VISIBLE ON PRINT */}
      <div className="hidden print:block mb-6 border-b-2 border-slate-800 pb-4 text-center">
        <h1 className="text-lg font-bold uppercase">{settings.namaSekolah || 'SD NEGERI'}</h1>
        <h2 className="text-base font-bold">JURNAL NILAI HARIAN PESERTA DIDIK</h2>
        <p className="text-xs text-slate-600 mt-1">
          Kelas: <strong>{activeKelas.nama}</strong> | Mata Pelajaran: <strong>{activeMapel.nama}</strong> | Semester: <strong>{selectedSemester}</strong> | Tahun Ajaran: <strong>{selectedTahunAjaran}</strong> | Standar KKM: <strong>{kkm}</strong>
        </p>
      </div>

      {/* STUDENT SEARCH INPUT */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <div className="relative max-w-xs w-full">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari nama atau NISN siswa..."
            value={searchStudent}
            onChange={(e) => setSearchStudent(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-blue-600/20"
          />
        </div>
        <div className="text-xs text-slate-500 font-medium">
          Menampilkan <strong className="text-slate-800">{filteredStudents.length}</strong> siswa
        </div>
      </div>

      {/* MAIN JOURNAL MATRIX TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                {/* Column 1: No */}
                <th className="px-3 py-3 font-bold text-center w-12 border-r border-slate-200 sticky left-0 bg-slate-50 z-20">
                  No
                </th>

                {/* Column 2: Nama Siswa */}
                <th className="px-4 py-3 font-bold min-w-[180px] max-w-[240px] border-r border-slate-200 sticky left-12 bg-slate-50 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                  Nama Siswa
                </th>

                {/* Dynamic Assessment Columns */}
                {displayedAssessments.map((ass, i) => {
                  const dateFormatted = ass.tanggal ? ass.tanggal.split('-').slice(1).reverse().join('/') : '';
                  return (
                    <th
                      key={ass.assessmentId}
                      className="px-3 py-2.5 border-r border-slate-200 min-w-[130px] max-w-[170px] text-center align-top relative group bg-slate-50/90"
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-[10px] font-extrabold font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                          {dateFormatted || ass.tanggal}
                        </span>
                        <div className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100 transition-opacity print:hidden">
                          <button
                            type="button"
                            onClick={() => handleQuickFillColumn(ass)}
                            title="Isi Serentak Semua Nilai"
                            className="p-1 rounded text-amber-600 hover:bg-amber-100/70 transition-colors cursor-pointer"
                          >
                            <Sparkles className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(ass)}
                            title="Edit Info Penilaian"
                            className="p-1 rounded text-slate-500 hover:bg-slate-200 transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setAssessmentToDelete(ass)}
                            title="Hapus Kolom Penilaian Ini"
                            className="p-1 rounded text-rose-500 hover:bg-rose-100 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <div className="font-bold text-slate-800 text-[11px] truncate" title={ass.materi}>
                        {ass.materi}
                      </div>

                      <div className="mt-0.5 flex items-center justify-center gap-1">
                        <span className="text-[9px] font-semibold text-slate-500 px-1.5 py-0.2 rounded bg-slate-200/70">
                          {ass.jenisPenilaian}
                        </span>
                      </div>
                    </th>
                  );
                })}

                {/* Empty State when no assessments exist */}
                {displayedAssessments.length === 0 && (
                  <th className="px-6 py-6 text-center text-slate-400 font-medium italic min-w-[260px]">
                    Belum ada kolom penilaian. Klik tombol <strong>"+ Tambah Penilaian"</strong> di atas.
                  </th>
                )}

                {/* Column Final: Rata-Rata */}
                <th className="px-4 py-3 font-extrabold text-center text-slate-800 bg-blue-50/60 min-w-[90px] border-l border-slate-200">
                  Rata-rata
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filteredStudents.map((siswa, idx) => {
                const { avg } = calculateStudentAverage(siswa.id);
                const isPass = avg >= kkm;

                return (
                  <tr key={siswa.id} className="hover:bg-blue-50/30 transition-colors">
                    {/* No */}
                    <td className="px-3 py-2 text-center text-slate-400 font-mono border-r border-slate-100 sticky left-0 bg-white z-10">
                      {idx + 1}
                    </td>

                    {/* Student Info */}
                    <td className="px-4 py-2 border-r border-slate-100 sticky left-12 bg-white z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                      <div className="font-bold text-slate-900 truncate max-w-[200px]" title={siswa.namaLengkap}>
                        {siswa.namaLengkap}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {siswa.nomorInduk ? `NIS: ${siswa.nomorInduk}` : siswa.nisn ? `NISN: ${siswa.nisn}` : '-'}
                      </div>
                    </td>

                    {/* Assessment Inputs */}
                    {displayedAssessments.map((ass) => {
                      const currentVal = assessmentScores[ass.assessmentId]?.[siswa.id] ?? 0;
                      const isCellPass = currentVal >= kkm;

                      return (
                        <td
                          key={ass.assessmentId}
                          className="px-2 py-1.5 text-center border-r border-slate-100"
                        >
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={currentVal === 0 ? '' : currentVal}
                            placeholder="0"
                            onChange={(e) => handleScoreChange(ass.assessmentId, siswa.id, e.target.value)}
                            className={`w-16 text-center font-bold font-mono py-1 rounded-lg border text-xs transition-all focus:ring-2 focus:outline-hidden ${
                              currentVal > 0 && isCellPass
                                ? 'bg-emerald-50/60 border-emerald-300 text-emerald-900 focus:ring-emerald-500/20'
                                : currentVal > 0 && !isCellPass
                                ? 'bg-rose-50/60 border-rose-300 text-rose-900 focus:ring-rose-500/20'
                                : 'bg-slate-50/50 border-slate-200 text-slate-700 focus:ring-blue-600/20'
                            }`}
                          />
                        </td>
                      );
                    })}

                    {displayedAssessments.length === 0 && (
                      <td className="px-4 py-3 text-center text-slate-300">-</td>
                    )}

                    {/* Student Average */}
                    <td className="px-4 py-2 text-center font-mono font-extrabold border-l border-slate-100 bg-blue-50/20">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md text-xs ${
                          displayedAssessments.length > 0 && isPass
                            ? 'text-emerald-800 bg-emerald-100/80 font-extrabold'
                            : displayedAssessments.length > 0 && !isPass
                            ? 'text-rose-800 bg-rose-100/80 font-extrabold'
                            : 'text-slate-400'
                        }`}
                      >
                        {displayedAssessments.length > 0 ? avg : '-'}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {/* No Students in Class Warning */}
              {studentsInClass.length === 0 && (
                <tr>
                  <td
                    colSpan={3 + displayedAssessments.length}
                    className="px-4 py-10 text-center text-slate-400 italic"
                  >
                    Belum ada siswa terdaftar di kelas <strong>{activeKelas.nama}</strong>. Silakan tambahkan siswa di menu{' '}
                    <strong>Data Siswa</strong>.
                  </td>
                </tr>
              )}
            </tbody>

            {/* Table Footer / Summary Row */}
            {studentsInClass.length > 0 && displayedAssessments.length > 0 && (
              <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold text-slate-700">
                <tr>
                  <td colSpan={2} className="px-4 py-2.5 text-right font-extrabold uppercase text-[10px] tracking-wider border-r border-slate-200 sticky left-0 bg-slate-50 z-20">
                    Rata-Rata Kelas
                  </td>
                  {displayedAssessments.map((ass) => {
                    const { avg } = calculateColumnAverage(ass.assessmentId);
                    return (
                      <td key={ass.assessmentId} className="px-2 py-2.5 text-center font-mono text-xs border-r border-slate-200">
                        <span className={`px-1.5 py-0.5 rounded ${avg >= kkm ? 'text-emerald-700 font-extrabold' : 'text-rose-700 font-extrabold'}`}>
                          {avg}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-4 py-2.5 text-center font-mono font-extrabold text-blue-900 bg-blue-100/60 border-l border-slate-200">
                    {overallStats.classAvg}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Bottom Bar: Action Hint & Save */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              Ketik angka nilai 0–100 pada kolom siswa. Nilai akan otomatis dikalkulasi rata-ratanya secara instan.
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleSaveAll}
              className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer ${
                hasUnsavedChanges
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              <Save className="w-4 h-4" />
              <span>Simpan Perubahan Nilai</span>
            </button>
          </div>
        </div>
      </div>

      {/* PRINT SIGNATURE FOOTER */}
      <div className="hidden print:flex justify-between items-center mt-12 pt-8 text-xs text-slate-800">
        <div className="text-center w-64">
          <p>Mengetahui,</p>
          <p>Kepala Sekolah</p>
          <div className="h-16"></div>
          <p className="font-bold underline">{settings.namaKepalaSekolah || 'Kepala Sekolah'}</p>
          <p>NIP: {settings.nipKepalaSekolah || '-'}</p>
        </div>

        <div className="text-center w-64">
          <p>{settings.kabupaten || 'Tempat'}, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <p>Guru Mata Pelajaran / Wali Kelas</p>
          <div className="h-16"></div>
          <p className="font-bold underline">{currentUser?.name || 'Guru Pengampu'}</p>
          <p>NIP: {currentUser?.nip || '-'}</p>
        </div>
      </div>

      {/* MODAL 1: TAMBAH PENILAIAN BARU */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-100 text-blue-700 font-bold">
                  <Plus className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Tambah Kolom Penilaian Baru</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAssessment} className="p-5 space-y-4">
              <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-blue-900">
                <p>
                  Target: <strong>{activeKelas.nama}</strong> - <strong>{activeMapel.nama}</strong> ({selectedSemester}, {selectedTahunAjaran})
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Tanggal Pelaksanaan *</label>
                <input
                  type="date"
                  required
                  value={newTanggal}
                  onChange={(e) => setNewTanggal(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-600/20"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Materi / Judul Penilaian *</label>
                <input
                  type="text"
                  required
                  placeholder="Misal: Penjumlahan, Pengurangan, Bab 1 Bilangan, dsb."
                  value={newMateri}
                  onChange={(e) => setNewMateri(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600/20"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Jenis Penilaian</label>
                <select
                  value={newJenis}
                  onChange={(e) => setNewJenis(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600/20 bg-white"
                >
                  <option value="Formatif">Asesmen Formatif (Pertemuan / Bab)</option>
                  <option value="Ulangan Harian">Ulangan Harian (Sumatif Bab)</option>
                  <option value="Tugas">Tugas / PR</option>
                  <option value="Kuis">Kuis Interaktif</option>
                  <option value="Praktik">Unjuk Kerja / Praktik</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Keterangan Tambahan (Opsional)</label>
                <input
                  type="text"
                  placeholder="Misal: Halaman 25 buku paket, KD 3.1, dll"
                  value={newKeterangan}
                  onChange={(e) => setNewKeterangan(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600/20"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  Buat Kolom Penilaian
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT INFO PENILAIAN */}
      {editingAssessment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-100 text-amber-700 font-bold">
                  <Edit2 className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Edit Info Penilaian</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingAssessment(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAssessmentEdit} className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Tanggal Pelaksanaan *</label>
                <input
                  type="date"
                  required
                  value={editTanggal}
                  onChange={(e) => setEditTanggal(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-600/20"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Materi / Judul Penilaian *</label>
                <input
                  type="text"
                  required
                  value={editMateri}
                  onChange={(e) => setEditMateri(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600/20"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Jenis Penilaian</label>
                <select
                  value={editJenis}
                  onChange={(e) => setEditJenis(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600/20 bg-white"
                >
                  <option value="Formatif">Asesmen Formatif (Pertemuan / Bab)</option>
                  <option value="Ulangan Harian">Ulangan Harian (Sumatif Bab)</option>
                  <option value="Tugas">Tugas / PR</option>
                  <option value="Kuis">Kuis Interaktif</option>
                  <option value="Praktik">Unjuk Kerja / Praktik</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Keterangan (Opsional)</label>
                <input
                  type="text"
                  value={editKeterangan}
                  onChange={(e) => setEditKeterangan(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600/20"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingAssessment(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  Simpan Perubahan Info
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: RIWAYAT SEMUA PENILAIAN */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-100 overflow-hidden max-h-[85vh] flex flex-col">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-100 text-blue-700 font-bold">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Riwayat Penilaian Kelas</h3>
                  <p className="text-[11px] text-slate-500">{activeKelas.nama} - {activeMapel.nama}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsHistoryModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {assessments.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs italic">
                  Belum ada rekaman penilaian yang dibuat.
                </div>
              ) : (
                assessments.map((ass, i) => {
                  const { avg } = calculateColumnAverage(ass.assessmentId);
                  return (
                    <div
                      key={ass.assessmentId}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                            {ass.tanggal}
                          </span>
                          <span className="text-xs font-extrabold text-slate-900">{ass.materi}</span>
                          <span className="text-[10px] font-semibold text-slate-500 px-2 py-0.5 rounded bg-slate-200/60">
                            {ass.jenisPenilaian}
                          </span>
                        </div>
                        {ass.keterangan && (
                          <p className="text-[11px] text-slate-500 italic">{ass.keterangan}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className="text-[10px] text-slate-400 font-bold uppercase">Rata-rata</div>
                          <div className={`text-sm font-extrabold font-mono ${avg >= kkm ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {avg}
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setIsHistoryModalOpen(false);
                              openEditModal(ass);
                            }}
                            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsHistoryModalOpen(false);
                              setAssessmentToDelete(ass);
                            }}
                            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-100 transition-colors cursor-pointer"
                            title="Hapus"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 text-right">
              <button
                type="button"
                onClick={() => setIsHistoryModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      <ConfirmModal
        isOpen={!!assessmentToDelete}
        title="Hapus Kolom Penilaian"
        message={`Apakah Anda yakin ingin menghapus penilaian "${assessmentToDelete?.materi}" (${assessmentToDelete?.tanggal})? Seluruh nilai siswa pada penilaian ini akan ikut terhapus secara permanen.`}
        confirmLabel="Hapus Kolom Penilaian"
        onConfirm={confirmDeleteAssessment}
        onCancel={() => setAssessmentToDelete(null)}
      />
    </div>
  );
};
