import React, { useState, useEffect, useMemo } from 'react';
import {
  Wallet,
  Trash2,
  FileText,
  CheckCircle2,
  Calendar,
  Settings,
  Plus,
  ArrowDownRight,
  ArrowUpRight,
  TrendingUp,
  Printer,
  Search,
  Users,
  CheckSquare,
  AlertCircle,
  X,
  Layers,
  Sparkles,
  Info,
  ExternalLink,
  CreditCard,
  Receipt,
  Check,
  RotateCcw,
} from 'lucide-react';
import { db } from '../../services/database';
import { TransaksiKas, Siswa, Kelas } from '../../types';
import { printElement, openPrintWindow } from '../../utils/exportHelper';
import { ConfirmModal } from '../common/ConfirmModal';

type TabType = 'pembayaran' | 'buku-kas' | 'rekap' | 'pengaturan';

interface KasSettings {
  nominalMingguan: number;
  namaBendahara: string;
  hariPenarikan: string;
  aturanKas: string;
}

export const UangKasView: React.FC = () => {
  const [transaksi, setTransaksi] = useState<TransaksiKas[]>([]);
  const [siswaList, setSiswaList] = useState<Siswa[]>([]);
  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [selectedKelasId, setSelectedKelasId] = useState<string>('');
  
  const [activeTab, setActiveTab] = useState<TabType>('pembayaran');
  const [selectedBulan, setSelectedBulan] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; // e.g. "2026-09"
  });

  const [searchStudent, setSearchStudent] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [formError, setFormError] = useState('');

  // Menu Bayar Modal state
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [paySiswaId, setPaySiswaId] = useState('');
  const [payBulan, setPayBulan] = useState('');
  const [paySelectedWeeks, setPaySelectedWeeks] = useState<number[]>([1]);
  const [payTanggal, setPayTanggal] = useState(new Date().toISOString().split('T')[0]);
  const [payMetode, setPayMetode] = useState<'Tunai' | 'Transfer'>('Tunai');
  const [payCatatan, setPayCatatan] = useState('');
  const [payNominalCustom, setPayNominalCustom] = useState<number>(0);

  // Confirm delete states
  const [deleteKasTarget, setDeleteKasTarget] = useState<{ id: string; ket: string } | null>(null);
  const [markAllWeekTarget, setMarkAllWeekTarget] = useState<number | null>(null);

  // Form Transaksi Baru
  const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0]);
  const [jenis, setJenis] = useState<'Pemasukan' | 'Pengeluaran'>('Pengeluaran');
  const [kategori, setKategori] = useState<string>('Alat Kebersihan');
  const [keterangan, setKeterangan] = useState('');
  const [jumlah, setJumlah] = useState<number>(0);

  // Settings state per class
  const [settings, setSettings] = useState<KasSettings>({
    nominalMingguan: 5000,
    namaBendahara: 'Bendahara Kelas',
    hariPenarikan: 'Setiap Hari Senin',
    aturanKas: 'Uang kas digunakan untuk kebutuhan bersama kelas, kebersihan, dan sosial kemanusiaan.',
  });

  const currentUser = db.getCurrentUser();
  const sekolah = db.getSekolah();

  // Load initial classes & default selection
  useEffect(() => {
    const allKelas = db.getKelasList();
    setKelasList(allKelas);

    // If current user is a guru with assigned class, select it; otherwise select first class
    const myKelas = allKelas.find((k) => k.waliKelasId === currentUser?.guruId);
    if (myKelas) {
      setSelectedKelasId(myKelas.id);
    } else if (allKelas.length > 0) {
      setSelectedKelasId(allKelas[0].id);
    }
  }, [currentUser?.guruId]);

  // Load transactions and class settings
  const loadData = () => {
    setTransaksi(db.getKasList());
    setSiswaList(db.getSiswaList());

    if (selectedKelasId) {
      const saved = localStorage.getItem(`kas_settings_full_${selectedKelasId}`);
      if (saved) {
        try {
          setSettings(JSON.parse(saved));
        } catch {
          // fallback
        }
      } else {
        // Check old key
        const oldNominal = localStorage.getItem(`kas_settings_${selectedKelasId}`);
        setSettings({
          nominalMingguan: oldNominal ? parseInt(oldNominal, 10) || 5000 : 5000,
          namaBendahara: 'Bendahara Kelas',
          hariPenarikan: 'Setiap Hari Senin',
          aturanKas: 'Uang kas digunakan untuk operasional kebersihan, spidol tugas, serta dana sosial kelas.',
        });
      }
    }
  };

  useEffect(() => {
    loadData();
    window.addEventListener('kas_updated', loadData);
    window.addEventListener('data_siswa_changed', loadData);
    return () => {
      window.removeEventListener('kas_updated', loadData);
      window.removeEventListener('data_siswa_changed', loadData);
    };
  }, [selectedKelasId]);

  const activeKelas = kelasList.find((k) => k.id === selectedKelasId) || kelasList[0];

  // Students in selected class
  const studentsInClass = useMemo(() => {
    if (!activeKelas) return [];
    return siswaList.filter((s) => s.kelas === activeKelas.nama || s.kelas === activeKelas.id);
  }, [siswaList, activeKelas]);

  // Filtered students by search
  const filteredStudents = useMemo(() => {
    if (!searchStudent.trim()) return studentsInClass;
    return studentsInClass.filter((s) =>
      s.namaLengkap.toLowerCase().includes(searchStudent.toLowerCase()) ||
      s.nomorInduk.includes(searchStudent) ||
      (s.nisn && s.nisn.includes(searchStudent))
    );
  }, [studentsInClass, searchStudent]);

  // Cash transactions for this class
  const classKas = useMemo(() => {
    if (!activeKelas) return [];
    return transaksi.filter(
      (t) =>
        t.kelasId === activeKelas.id ||
        t.kelasId === activeKelas.nama ||
        (t.siswaId && studentsInClass.some((s) => s.id === t.siswaId || s.qrId === t.siswaId || s.nomorInduk === t.siswaId))
    );
  }, [transaksi, activeKelas, studentsInClass]);

  // Format IDR helper
  const formatRupiah = (angka: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(angka);
  };

  const getBulanLabel = (val: string) => {
    if (!val) return '';
    const [y, m] = val.split('-');
    const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
    return date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  };

  // Open Pay Modal
  const openPayModal = (targetSiswaId?: string) => {
    const sId = targetSiswaId || (filteredStudents[0]?.id ?? '');
    setPaySiswaId(sId);
    setPayBulan(selectedBulan);
    setPayTanggal(new Date().toISOString().split('T')[0]);
    setPayMetode('Tunai');
    setPayCatatan('');
    setPayNominalCustom(settings.nominalMingguan);
    setFormError('');

    // Auto-select unpaid weeks for target student
    if (sId) {
      const targetS = studentsInClass.find((s) => s.id === sId || s.qrId === sId);
      const unpaidWeeks = [1, 2, 3, 4, 5].filter((m) => {
        return !classKas.some(
          (t) =>
            (t.siswaId === sId || (targetS && (t.siswaId === targetS.id || t.siswaId === targetS.qrId || t.siswaId === targetS.nomorInduk))) &&
            (t.bulan === selectedBulan || (!t.bulan && t.tanggal?.startsWith(selectedBulan))) &&
            t.mingguKe === m &&
            t.kategori === 'Uang Kas'
        );
      });
      setPaySelectedWeeks(unpaidWeeks.length > 0 ? unpaidWeeks : [1]);
    } else {
      setPaySelectedWeeks([1]);
    }
    setIsPayModalOpen(true);
  };

  // Handle Save from Payment Modal
  const handleSavePaymentModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paySiswaId) {
      setFormError('Pilih siswa yang akan membayar uang kas.');
      return;
    }
    if (paySelectedWeeks.length === 0) {
      setFormError('Pilih minimal satu minggu yang akan dibayar.');
      return;
    }

    const targetSiswa = studentsInClass.find((s) => s.id === paySiswaId || s.qrId === paySiswaId);
    const nominalPerWeek = payNominalCustom > 0 ? payNominalCustom : settings.nominalMingguan;
    const newItems: TransaksiKas[] = [];

    paySelectedWeeks.forEach((mingguKe) => {
      // Check if already paid
      const alreadyPaid = classKas.some(
        (t) =>
          (t.siswaId === paySiswaId || (targetSiswa && (t.siswaId === targetSiswa.id || t.siswaId === targetSiswa.qrId || t.siswaId === targetSiswa.nomorInduk))) &&
          (t.bulan === payBulan || (!t.bulan && t.tanggal?.startsWith(payBulan))) &&
          t.mingguKe === mingguKe &&
          t.kategori === 'Uang Kas'
      );

      if (!alreadyPaid) {
        const item: TransaksiKas = {
          id: `kas-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-m${mingguKe}`,
          tanggal: payTanggal,
          jenis: 'Pemasukan',
          kategori: 'Uang Kas',
          keterangan: `Kas ${targetSiswa?.namaLengkap || 'Siswa'} - ${getBulanLabel(payBulan)} M${mingguKe}${payCatatan ? ` (${payCatatan})` : ''} [${payMetode}]`,
          jumlah: nominalPerWeek,
          kelasId: activeKelas.id,
          siswaId: targetSiswa?.id || paySiswaId,
          bulan: payBulan,
          mingguKe,
        };
        db.saveKas(item);
        newItems.push(item);
      }
    });

    if (newItems.length > 0) {
      setTransaksi([...newItems, ...transaksi]);
      setSuccessMsg(
        `Pembayaran kas ${targetSiswa?.namaLengkap || 'siswa'} berhasil disimpan (${newItems.length} minggu = ${formatRupiah(newItems.length * nominalPerWeek)})!`
      );
      setTimeout(() => setSuccessMsg(''), 3500);
    } else {
      setSuccessMsg('Minggu yang dipilih sebelumnya sudah berstatus lunas.');
      setTimeout(() => setSuccessMsg(''), 2500);
    }

    setIsPayModalOpen(false);
  };

  // Toggle single week payment
  const handleTogglePayment = (siswaId: string, mingguKe: number) => {
    const targetSiswa = studentsInClass.find((s) => s.id === siswaId || s.qrId === siswaId);
    const existingList = transaksi.filter(
      (t) =>
        (t.siswaId === siswaId || (targetSiswa && (t.siswaId === targetSiswa.id || t.siswaId === targetSiswa.qrId || t.siswaId === targetSiswa.nomorInduk))) &&
        (t.bulan === selectedBulan || (!t.bulan && t.tanggal?.startsWith(selectedBulan))) &&
        t.mingguKe === mingguKe &&
        t.kategori === 'Uang Kas'
    );

    if (existingList.length > 0) {
      existingList.forEach((e) => db.deleteKas(e.id));
      const updated = transaksi.filter((t) => !existingList.some((e) => e.id === t.id));
      setTransaksi([...updated]);
      setSuccessMsg(`Setoran Minggu ${mingguKe} untuk ${targetSiswa?.namaLengkap || 'siswa'} berhasil dibatalkan.`);
      setTimeout(() => setSuccessMsg(''), 2500);
    } else {
      const newKas: TransaksiKas = {
        id: `kas-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        tanggal: new Date().toISOString().split('T')[0],
        jenis: 'Pemasukan',
        kategori: 'Uang Kas',
        keterangan: `Kas ${targetSiswa?.namaLengkap || 'Siswa'} - ${getBulanLabel(selectedBulan)} M${mingguKe}`,
        jumlah: settings.nominalMingguan,
        kelasId: activeKelas.id,
        siswaId: targetSiswa?.id || siswaId,
        bulan: selectedBulan,
        mingguKe,
      };
      db.saveKas(newKas);
      setTransaksi([newKas, ...transaksi]);
      setSuccessMsg(`Berhasil! Kas Minggu ${mingguKe} ${targetSiswa?.namaLengkap || 'siswa'} lunas (${formatRupiah(settings.nominalMingguan)}).`);
      setTimeout(() => setSuccessMsg(''), 2500);
    }
  };

  // Mark all students paid for a specific week
  const handleMarkWeekAllPaid = (mingguKe: number) => {
    setMarkAllWeekTarget(mingguKe);
  };

  const confirmMarkWeekAllPaid = () => {
    if (markAllWeekTarget === null || !activeKelas) return;
    const mingguKe = markAllWeekTarget;
    const newItems: TransaksiKas[] = [];

    studentsInClass.forEach((siswa) => {
      const alreadyPaid = transaksi.some(
        (t) =>
          (t.siswaId === siswa.id || t.siswaId === siswa.qrId || t.siswaId === siswa.nomorInduk) &&
          (t.bulan === selectedBulan || (!t.bulan && t.tanggal?.startsWith(selectedBulan))) &&
          t.mingguKe === mingguKe &&
          t.kategori === 'Uang Kas'
      );

      if (!alreadyPaid) {
        const newKas: TransaksiKas = {
          id: `kas-${Date.now()}-${siswa.id.slice(-4)}-${Math.random().toString(36).substring(2, 7)}`,
          tanggal: new Date().toISOString().split('T')[0],
          jenis: 'Pemasukan',
          kategori: 'Uang Kas',
          keterangan: `Kas ${siswa.namaLengkap} - ${getBulanLabel(selectedBulan)} M${mingguKe}`,
          jumlah: settings.nominalMingguan,
          kelasId: activeKelas.id,
          siswaId: siswa.id,
          bulan: selectedBulan,
          mingguKe,
        };
        db.saveKas(newKas);
        newItems.push(newKas);
      }
    });

    if (newItems.length > 0) {
      setTransaksi([...newItems, ...transaksi]);
    }
    setMarkAllWeekTarget(null);
    setSuccessMsg(`Semua siswa (${newItems.length} siswa baru) berhasil dicatat lunas untuk Minggu ke-${mingguKe}!`);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // Add Income / Expense Transaction
  const handleSaveTransaksiLain = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tanggal || !keterangan.trim() || jumlah <= 0) {
      setFormError('Mohon isi tanggal, uraian keterangan, dan nominal dengan benar.');
      return;
    }
    setFormError('');

    const newKas: TransaksiKas = {
      id: `kas-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      tanggal,
      jenis,
      kategori: jenis === 'Pemasukan' ? 'Lainnya' : 'Lainnya',
      keterangan: `[${kategori}] ${keterangan.trim()}`,
      jumlah,
      kelasId: activeKelas.id,
    };

    db.saveKas(newKas);
    setIsModalOpen(false);
    setKeterangan('');
    setJumlah(0);
    setSuccessMsg(`Transaksi ${jenis.toLowerCase()} berhasil disimpan!`);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleDeleteKas = (id: string, ket: string) => {
    setDeleteKasTarget({ id, ket });
  };

  const confirmDeleteKas = () => {
    if (!deleteKasTarget) return;
    db.deleteKas(deleteKasTarget.id);
    setDeleteKasTarget(null);
    setSuccessMsg('Transaksi kas berhasil dihapus.');
    setTimeout(() => setSuccessMsg(''), 2500);
  };

  // Save Settings
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (settings.nominalMingguan < 0) {
      setSuccessMsg('Nominal kas tidak boleh kurang dari 0.');
      return;
    }
    localStorage.setItem(`kas_settings_full_${activeKelas.id}`, JSON.stringify(settings));
    localStorage.setItem(`kas_settings_${activeKelas.id}`, settings.nominalMingguan.toString());
    setSuccessMsg(`Pengaturan uang kas ${activeKelas.nama} berhasil disimpan!`);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // Summary Calculations
  const totalPemasukanSiswa = classKas
    .filter((t) => t.jenis === 'Pemasukan' && t.kategori === 'Uang Kas')
    .reduce((acc, curr) => acc + curr.jumlah, 0);

  const totalPemasukanLain = classKas
    .filter((t) => t.jenis === 'Pemasukan' && t.kategori === 'Lainnya')
    .reduce((acc, curr) => acc + curr.jumlah, 0);

  const totalPemasukan = totalPemasukanSiswa + totalPemasukanLain;

  const totalPengeluaran = classKas
    .filter((t) => t.jenis === 'Pengeluaran')
    .reduce((acc, curr) => acc + curr.jumlah, 0);

  const saldoAkhir = totalPemasukan - totalPengeluaran;

  // Monthly breakdown for selected month
  const kasBulanIni = classKas.filter(
    (t) => t.bulan === selectedBulan || (t.tanggal && t.tanggal.startsWith(selectedBulan))
  );
  const pemasukanSiswaBulanIni = kasBulanIni
    .filter((t) => t.jenis === 'Pemasukan' && t.kategori === 'Uang Kas')
    .reduce((acc, curr) => acc + curr.jumlah, 0);
  const pemasukanLainBulanIni = kasBulanIni
    .filter((t) => t.jenis === 'Pemasukan' && t.kategori === 'Lainnya')
    .reduce((acc, curr) => acc + curr.jumlah, 0);
  const pengeluaranBulanIni = kasBulanIni
    .filter((t) => t.jenis === 'Pengeluaran')
    .reduce((acc, curr) => acc + curr.jumlah, 0);
  const surplusBulanIni = pemasukanSiswaBulanIni + pemasukanLainBulanIni - pengeluaranBulanIni;

  if (!activeKelas) {
    return (
      <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
        Belum ada data kelas terdaftar. Silakan tambahkan kelas di menu Kelas & Mapel.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Class Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-blue-50 text-blue-700 font-bold">
              <Wallet className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                Sistem Pengelolaan Uang Kas
              </h2>
              <p className="text-xs text-slate-500">
                Pencatatan mingguan 1x seminggu, buku kas masuk & keluar, serta rekap akhir otomatis.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Class Selector Dropdown */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            <Layers className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-600">Pilih Kelas:</span>
            {kelasList.length <= 1 ? (
               <div className="text-xs font-bold text-blue-700">
                 {kelasList[0]?.nama || 'Belum ada kelas'}
               </div>
            ) : (
              <select
                value={selectedKelasId}
                onChange={(e) => setSelectedKelasId(e.target.value)}
                className="bg-transparent text-xs font-bold text-blue-700 focus:outline-hidden cursor-pointer"
              >
                {kelasList.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama} {k.waliKelas ? `(${k.waliKelas})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Saldo Badge */}
          <div className="bg-emerald-50 text-emerald-800 px-4 py-2 rounded-xl text-xs font-extrabold border border-emerald-200 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <span>Saldo Kas: {formatRupiah(saldoAkhir)}</span>
          </div>

          {/* Print Rekap Button */}
          <button
            onClick={() => setIsPrintModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak Rekap Kas</span>
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-semibold flex items-center gap-3 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('pembayaran')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'pembayaran'
              ? 'bg-blue-700 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <CheckSquare className="w-4 h-4" />
          <span>Pencatatan Kas Mingguan</span>
        </button>

        <button
          onClick={() => setActiveTab('buku-kas')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'buku-kas'
              ? 'bg-blue-700 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <ArrowDownRight className="w-4 h-4" />
          <span>Buku Kas (Masuk & Keluar)</span>
        </button>

        <button
          onClick={() => setActiveTab('rekap')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'rekap'
              ? 'bg-blue-700 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Rekap Akhir & Laporan</span>
        </button>

        <button
          onClick={() => setActiveTab('pengaturan')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'pengaturan'
              ? 'bg-blue-700 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Pengaturan Kas Kelas</span>
        </button>
      </div>

      {/* TAB 1: PENCATATAN MINGGUAN SISWA */}
      {activeTab === 'pembayaran' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden animate-in fade-in space-y-4 p-5">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-slate-700 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                <Calendar className="w-4 h-4 text-blue-700" />
                <span className="text-xs font-bold">Bulan:</span>
                <input
                  type="month"
                  value={selectedBulan}
                  onChange={(e) => setSelectedBulan(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-800 focus:outline-hidden cursor-pointer"
                />
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari nama siswa..."
                  value={searchStudent}
                  onChange={(e) => setSearchStudent(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600/20"
                />
              </div>

              {/* Menu Bayar Kas Button */}
              <button
                type="button"
                onClick={() => openPayModal()}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
                title="Buka form menu bayar uang kas siswa"
              >
                <Wallet className="w-4 h-4" />
                <span>+ Menu Bayar Kas</span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium">Iuran:</span>
              <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-bold border border-blue-200">
                {formatRupiah(settings.nominalMingguan)} / minggu
              </span>
              <span className="text-slate-400">|</span>
              <span className="text-slate-600 font-semibold">{studentsInClass.length} Siswa</span>
            </div>
          </div>

          {/* Quick Notice */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-blue-50/60 border border-blue-100 text-xs text-blue-900">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-700 flex-shrink-0" />
              <span>
                Klik tombol <strong>Bayar</strong> atau <strong>Lunas</strong> pada kolom Minggu 1–5 untuk mengubah status pembayaran langsung, atau klik <strong>Menu Bayar</strong> untuk bayar borongan.
              </span>
            </div>
            <div className="flex items-center gap-3 font-semibold text-[11px] flex-shrink-0">
              <span className="flex items-center gap-1.5 text-emerald-700">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span> Lunas
              </span>
              <span className="flex items-center gap-1.5 text-blue-700">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span> Belum Bayar
              </span>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-3 font-bold text-slate-700 text-center w-10 border-r border-slate-200">No</th>
                  <th className="px-4 py-3 font-bold text-slate-700 border-r border-slate-200">Nama Lengkap Siswa</th>
                  {[1, 2, 3, 4, 5].map((m) => (
                    <th key={m} className="px-2 py-2.5 font-bold text-slate-700 text-center border-r border-slate-200 w-28">
                      <div className="flex flex-col items-center gap-1">
                        <span>Minggu {m}</span>
                        <button
                          type="button"
                          onClick={() => handleMarkWeekAllPaid(m)}
                          className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                          title={`Tandai semua lunas untuk minggu ${m}`}
                        >
                          Semua Lunas
                        </button>
                      </div>
                    </th>
                  ))}
                  <th className="px-4 py-3 font-bold text-slate-700 text-center w-24 border-r border-slate-200">Setoran</th>
                  <th className="px-3 py-3 font-bold text-slate-700 text-center w-20 border-r border-slate-200">Status</th>
                  <th className="px-3 py-3 font-bold text-slate-700 text-center w-28">Menu Bayar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((siswa, idx) => {
                  let paidCount = 0;
                  const weekStatus = [1, 2, 3, 4, 5].map((m) => {
                    const isPaid = classKas.some(
                      (t) =>
                        (t.siswaId === siswa.id || (siswa.qrId && t.siswaId === siswa.qrId) || (siswa.nomorInduk && t.siswaId === siswa.nomorInduk)) &&
                        (t.bulan === selectedBulan || (!t.bulan && t.tanggal?.startsWith(selectedBulan))) &&
                        t.mingguKe === m &&
                        t.kategori === 'Uang Kas'
                    );
                    if (isPaid) paidCount++;
                    return { m, isPaid };
                  });

                  const totalPaidAmount = paidCount * settings.nominalMingguan;
                  const isFull = paidCount >= 4;

                  return (
                    <tr key={siswa.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-3 py-3 text-center text-slate-400 font-mono border-r border-slate-200">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3 border-r border-slate-200">
                        <div className="font-bold text-slate-900">{siswa.namaLengkap}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          NISN: {siswa.nisn || '-'} | Induk: {siswa.nomorInduk}
                        </div>
                      </td>

                      {weekStatus.map(({ m, isPaid }) => (
                        <td key={m} className="px-2 py-2 text-center border-r border-slate-200 align-middle">
                          <button
                            type="button"
                            onClick={() => handleTogglePayment(siswa.id, m)}
                            className={`w-full py-2 px-1 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer select-none active:scale-95 ${
                              isPaid
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                                : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 shadow-2xs'
                            }`}
                            title={isPaid ? 'Sudah dibayar (klik untuk membatalkan)' : `Belum dibayar (klik untuk bayar ${formatRupiah(settings.nominalMingguan)})`}
                          >
                            {isPaid ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-100" />
                                <span>Lunas</span>
                              </>
                            ) : (
                              <>
                                <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                                <span>Bayar</span>
                              </>
                            )}
                          </button>
                        </td>
                      ))}

                      <td className="px-4 py-3 text-center font-bold text-slate-800 border-r border-slate-200">
                        {formatRupiah(totalPaidAmount)}
                        <div className="text-[10px] text-slate-400 font-normal">({paidCount}/5 mgg)</div>
                      </td>

                      <td className="px-3 py-3 text-center border-r border-slate-200">
                        <span
                          className={`px-2 py-1 rounded-full text-[10px] font-extrabold ${
                            isFull
                              ? 'bg-emerald-100 text-emerald-800'
                              : paidCount > 0
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {isFull ? 'Lunas' : paidCount > 0 ? 'Sebagian' : 'Belum'}
                        </span>
                      </td>

                      <td className="px-3 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => openPayModal(siswa.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[11px] font-bold shadow-2xs hover:shadow-xs transition-all cursor-pointer whitespace-nowrap active:scale-95"
                          title="Buka formulir menu bayar kas untuk siswa ini"
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          <span>Menu Bayar</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredStudents.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-slate-500 text-xs">
                      {studentsInClass.length === 0
                        ? `Belum ada siswa di ${activeKelas.nama}. Tambahkan siswa terlebih dahulu di Data Siswa.`
                        : 'Tidak ada siswa yang sesuai pencarian.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: BUKU KAS UMUM (PEMASUKAN & PENGELUARAN) */}
      {activeTab === 'buku-kas' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden animate-in fade-in space-y-4 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Buku Kas Umum: {activeKelas.nama}</h3>
              <p className="text-xs text-slate-500">
                Pencatatan arus kas operasional: uang kas siswa, pemasukan donasi, dan seluruh pengeluaran.
              </p>
            </div>
            <button
              onClick={() => {
                setJenis('Pengeluaran');
                setIsModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Transaksi Baru</span>
            </button>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold flex-shrink-0">
                <ArrowDownRight className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-emerald-700 uppercase">Total Pemasukan</span>
                <div className="text-lg font-extrabold text-slate-900">{formatRupiah(totalPemasukan)}</div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold flex-shrink-0">
                <ArrowUpRight className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-rose-700 uppercase">Total Pengeluaran</span>
                <div className="text-lg font-extrabold text-slate-900">{formatRupiah(totalPengeluaran)}</div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-700 text-white flex items-center justify-center font-bold flex-shrink-0">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-blue-700 uppercase">Sisa Saldo Kas</span>
                <div className="text-lg font-extrabold text-blue-900">{formatRupiah(saldoAkhir)}</div>
              </div>
            </div>
          </div>

          {/* List of Transactions */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-bold text-slate-700 w-28">Tanggal</th>
                  <th className="px-4 py-3 font-bold text-slate-700 w-28">Jenis</th>
                  <th className="px-4 py-3 font-bold text-slate-700 w-32">Kategori</th>
                  <th className="px-4 py-3 font-bold text-slate-700">Keterangan / Uraian</th>
                  <th className="px-4 py-3 font-bold text-slate-700 text-right w-36">Nominal (Rp)</th>
                  <th className="px-4 py-3 font-bold text-slate-700 text-center w-16">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classKas.map((t) => {
                  const isIncome = t.jenis === 'Pemasukan';
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 text-slate-600 font-mono">{t.tanggal}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            isIncome
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {isIncome ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                          {isIncome ? 'Masuk' : 'Keluar'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[10px]">
                          {t.kategori || 'Kas'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">{t.keterangan}</td>
                      <td
                        className={`px-4 py-3 text-right font-bold ${
                          isIncome ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {isIncome ? '+' : '-'} {formatRupiah(t.jumlah)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteKas(t.id, t.keterangan)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Hapus transaksi ini"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {classKas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-xs">
                      Belum ada transaksi kas tercatat untuk kelas ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: HASIL REKAP AKHIR & LAPORAN */}
      {activeTab === 'rekap' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-bold text-slate-500 uppercase">Pemasukan Uang Kas</span>
              <div className="text-2xl font-extrabold text-emerald-700 mt-1">
                {formatRupiah(totalPemasukanSiswa)}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Akumulasi iuran mingguan siswa</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-bold text-slate-500 uppercase">Pemasukan Lainnya</span>
              <div className="text-2xl font-extrabold text-emerald-700 mt-1">
                {formatRupiah(totalPemasukanLain)}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Donasi, sumbangan & sisa lalu</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-bold text-slate-500 uppercase">Total Pengeluaran</span>
              <div className="text-2xl font-extrabold text-rose-700 mt-1">
                {formatRupiah(totalPengeluaran)}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Biaya alat, kegiatan, dan sosial</p>
            </div>

            <div className="bg-gradient-to-br from-blue-700 to-indigo-800 p-5 rounded-2xl text-white shadow-sm">
              <span className="text-xs font-bold text-blue-200 uppercase">Saldo Kas Saat Ini</span>
              <div className="text-2xl font-extrabold mt-1">{formatRupiah(saldoAkhir)}</div>
              <p className="text-[11px] text-blue-200 mt-1">Tersedia di kas {activeKelas.nama}</p>
            </div>
          </div>

          {/* Rekapitulasi Rinci Per Siswa */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Rekapitulasi Pembayaran Per Siswa ({getBulanLabel(selectedBulan)})
                </h3>
                <p className="text-xs text-slate-500">
                  Daftar akumulasi pembayaran mingguan setiap peserta didik untuk bulan berjalan.
                </p>
              </div>

              <button
                onClick={() => setIsPrintModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Lembar Rekap</span>
              </button>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-3 text-center w-10 font-bold text-slate-700">No</th>
                    <th className="px-4 py-3 font-bold text-slate-700">Nama Siswa</th>
                    <th className="px-4 py-3 font-bold text-slate-700">NISN / No Induk</th>
                    <th className="px-3 py-3 text-center font-bold text-slate-700">M1</th>
                    <th className="px-3 py-3 text-center font-bold text-slate-700">M2</th>
                    <th className="px-3 py-3 text-center font-bold text-slate-700">M3</th>
                    <th className="px-3 py-3 text-center font-bold text-slate-700">M4</th>
                    <th className="px-3 py-3 text-center font-bold text-slate-700">M5</th>
                    <th className="px-4 py-3 text-right font-bold text-slate-700">Total Dibayar</th>
                    <th className="px-4 py-3 text-right font-bold text-slate-700">Tunggakan (Est)</th>
                    <th className="px-4 py-3 text-center font-bold text-slate-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {studentsInClass.map((siswa, idx) => {
                    const weeks = [1, 2, 3, 4, 5].map((m) =>
                      classKas.some(
                        (t) =>
                          t.siswaId === siswa.id &&
                          t.bulan === selectedBulan &&
                          t.mingguKe === m &&
                          t.kategori === 'Uang Kas'
                      )
                    );
                    const paidWeeks = weeks.filter(Boolean).length;
                    const totalBayar = paidWeeks * settings.nominalMingguan;
                    const targetBulan = 4 * settings.nominalMingguan; // standard 4 weeks
                    const tunggakan = Math.max(0, targetBulan - totalBayar);
                    const isLunas = paidWeeks >= 4;

                    return (
                      <tr key={siswa.id} className="hover:bg-slate-50/70">
                        <td className="px-3 py-2.5 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="px-4 py-2.5 font-bold text-slate-800">{siswa.namaLengkap}</td>
                        <td className="px-4 py-2.5 text-slate-500 font-mono">
                          {siswa.nisn || siswa.nomorInduk}
                        </td>
                        {weeks.map((paid, wIdx) => (
                          <td key={wIdx} className="px-3 py-2.5 text-center">
                            {paid ? (
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" title="Lunas"></span>
                            ) : (
                              <span className="w-2.5 h-2.5 rounded-full bg-slate-200 inline-block" title="Belum"></span>
                            )}
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-right font-bold text-emerald-700">
                          {formatRupiah(totalBayar)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-rose-600">
                          {tunggakan > 0 ? formatRupiah(tunggakan) : '-'}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              isLunas
                                ? 'bg-emerald-100 text-emerald-800'
                                : paidWeeks > 0
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {isLunas ? 'Lunas' : paidWeeks > 0 ? 'Sebagian' : 'Belum'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PENGATURAN PENGELOLAAN KAS */}
      {activeTab === 'pengaturan' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6 max-w-3xl animate-in fade-in">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Settings className="w-5 h-5 text-blue-700" />
              <span>Pengaturan Pengelolaan Kas ({activeKelas.nama})</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Sesuaikan besaran iuran per minggu, jadwal penarikan kas, nama bendahara, dan aturan pemakaian uang kas.
            </p>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">
                Nominal Iuran Kas per Minggu (Rp)
              </label>
              <input
                type="number"
                required
                min="0"
                step="500"
                value={settings.nominalMingguan}
                onChange={(e) =>
                  setSettings({ ...settings, nominalMingguan: parseInt(e.target.value, 10) || 0 })
                }
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 bg-slate-50 focus:bg-white"
              />
              <p className="text-[11px] text-slate-400">
                Nominal ini akan otomatis dicatat setiap kali Anda menandai pembayaran siswa (1 minggu 1 kali).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Nama Bendahara Kelas</label>
                <input
                  type="text"
                  value={settings.namaBendahara}
                  onChange={(e) => setSettings({ ...settings, namaBendahara: e.target.value })}
                  placeholder="Contoh: Aisyah Putri / Siswa Terpilih"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 bg-slate-50 focus:bg-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Hari / Jadwal Penarikan</label>
                <input
                  type="text"
                  value={settings.hariPenarikan}
                  onChange={(e) => setSettings({ ...settings, hariPenarikan: e.target.value })}
                  placeholder="Contoh: Setiap Hari Senin"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 bg-slate-50 focus:bg-white"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Aturan & Tujuan Penggunaan Kas</label>
              <textarea
                rows={3}
                value={settings.aturanKas}
                onChange={(e) => setSettings({ ...settings, aturanKas: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 bg-slate-50 focus:bg-white"
                placeholder="Tuliskan tujuan penggunaan kas kelas..."
              />
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                Simpan Pengaturan Kas
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL TAMBAH TRANSAKSI LAIN */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Catat Transaksi Buku Kas</h3>
                <p className="text-[11px] text-slate-500">Pemasukan tambahan atau pengeluaran kelas</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTransaksiLain} className="space-y-3.5">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Jenis Transaksi</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setJenis('Pengeluaran');
                      setKategori('Alat Kebersihan');
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                      jenis === 'Pengeluaran'
                        ? 'bg-rose-50 text-rose-700 border-rose-300 ring-2 ring-rose-500/20'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>Pengeluaran</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setJenis('Pemasukan');
                      setKategori('Donasi / Sisa Kas');
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                      jenis === 'Pemasukan'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-2 ring-emerald-500/20'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    <ArrowDownRight className="w-3.5 h-3.5" />
                    <span>Pemasukan</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Kategori</label>
                <select
                  value={kategori}
                  onChange={(e) => setKategori(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600/20 bg-white"
                >
                  {jenis === 'Pengeluaran' ? (
                    <>
                      <option value="Alat Kebersihan">Alat Kebersihan & Sapu</option>
                      <option value="Spidol & ATK">Spidol & Alat Tulis Kelas</option>
                      <option value="Foto Kopi Tugas">Foto Kopi & Cetak Tugas</option>
                      <option value="Sosial / Jenguk Sakit">Dana Sosial / Jenguk Sakit</option>
                      <option value="Dekorasi Kelas">Dekorasi & Mading Kelas</option>
                      <option value="Konsumsi Acara">Konsumsi & Kegiatan Kelas</option>
                      <option value="Lainnya">Pengeluaran Lainnya</option>
                    </>
                  ) : (
                    <>
                      <option value="Donasi / Sisa Kas">Donasi / Sisa Kas Lalu</option>
                      <option value="Hadiah Lomba">Hadiah Lomba Kelas</option>
                      <option value="Sumbangan Paguyuban">Sumbangan Paguyuban Orang Tua</option>
                      <option value="Lainnya">Pemasukan Lainnya</option>
                    </>
                  )}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Tanggal Transaksi</label>
                <input
                  type="date"
                  required
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600/20"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Uraian / Keterangan</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Beli 2 sapu lantai & pel"
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600/20"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Nominal Transaksi (Rp)</label>
                <input
                  type="number"
                  required
                  min="500"
                  step="500"
                  placeholder="Contoh: 35000"
                  value={jumlah || ''}
                  onChange={(e) => setJumlah(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-600/20"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  Simpan Transaksi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CETAK REKAP AKHIR KAS (PRINTABLE SHEET) */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-8 shadow-2xl border border-slate-200 space-y-6 my-8 print:p-0 print:border-none print:shadow-none">
            {/* Action Bar (hidden in print) */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-blue-700" />
                <h3 className="text-sm font-bold text-slate-900">
                  Pratinjau Lembar Rekap Kas {activeKelas.nama}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => printElement('print-area', `Rekap_Uang_Kas_${activeKelas.nama}`)}
                  className="px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak Sekarang (Print)</span>
                </button>
                <button
                  onClick={() => openPrintWindow('print-area', `Rekap_Uang_Kas_${activeKelas.nama}`)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Buka di Tab Baru / Unduh PDF"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Buka di Tab Baru</span>
                  <span className="sm:hidden">Tab Baru</span>
                </button>
                <button
                  onClick={() => setIsPrintModalOpen(false)}
                  className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>

            {/* Printable Document Body */}
            <div id="print-area" className="text-slate-900 font-serif space-y-5">
              {/* Kop Surat Sekolah */}
              <div className="flex items-center gap-4 border-b-2 border-slate-900 pb-4 text-center sm:text-left">
                <img
                  src={sekolah.logo || '/logo.svg'}
                  alt={sekolah.nama}
                  className="w-16 h-16 object-contain flex-shrink-0 mx-auto sm:mx-0"
                />
                <div className="flex-1 text-center font-sans">
                  <h4 className="text-xs uppercase tracking-widest text-slate-600 font-bold">
                    Pemerintah {sekolah.kabupaten?.toUpperCase().startsWith('KABUPATEN') ? sekolah.kabupaten : `Kabupaten ${sekolah.kabupaten || ''}`}
                  </h4>
                  <h2 className="text-lg font-extrabold uppercase tracking-wide text-slate-900">
                    {sekolah.nama}
                  </h2>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    {sekolah.alamat}
                    {sekolah.kecamatan && !sekolah.alamat.toLowerCase().includes(sekolah.kecamatan.toLowerCase()) ? `, Kec. ${sekolah.kecamatan}` : ''}
                    {sekolah.kabupaten && !sekolah.alamat.toLowerCase().includes(sekolah.kabupaten.toLowerCase()) ? `, ${sekolah.kabupaten}` : ''}
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono">
                    Email: {sekolah.email} | NPSN: {sekolah.npsn}
                  </p>
                </div>
              </div>

              {/* Title */}
              <div className="text-center font-sans space-y-1">
                <h3 className="text-base font-bold uppercase underline tracking-wide">
                  Laporan Rekapitulasi Uang Kas Siswa
                </h3>
                <p className="text-xs text-slate-600">
                  Kelas: <strong className="text-slate-900">{activeKelas.nama}</strong> | Periode:{' '}
                  <strong>{getBulanLabel(selectedBulan)}</strong>
                </p>
              </div>

              {/* Ringkasan Kas Box */}
              <div className="grid grid-cols-4 gap-2 font-sans text-xs border border-slate-300 rounded-lg p-3 bg-slate-50">
                <div>
                  <span className="text-slate-500 text-[10px] block">Kas Siswa:</span>
                  <span className="font-bold text-slate-900">{formatRupiah(totalPemasukanSiswa)}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Kas Lainnya:</span>
                  <span className="font-bold text-slate-900">{formatRupiah(totalPemasukanLain)}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Pengeluaran:</span>
                  <span className="font-bold text-rose-700">{formatRupiah(totalPengeluaran)}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Saldo Akhir:</span>
                  <span className="font-bold text-blue-900">{formatRupiah(saldoAkhir)}</span>
                </div>
              </div>

              {/* Table Siswa */}
              <div className="overflow-x-auto font-sans">
                <table className="w-full text-left text-[11px] border border-slate-300">
                  <thead className="bg-slate-100 border-b border-slate-300">
                    <tr>
                      <th className="p-2 text-center w-8 border-r border-slate-300">No</th>
                      <th className="p-2 border-r border-slate-300">Nama Siswa</th>
                      <th className="p-2 text-center w-12 border-r border-slate-300">M1</th>
                      <th className="p-2 text-center w-12 border-r border-slate-300">M2</th>
                      <th className="p-2 text-center w-12 border-r border-slate-300">M3</th>
                      <th className="p-2 text-center w-12 border-r border-slate-300">M4</th>
                      <th className="p-2 text-center w-12 border-r border-slate-300">M5</th>
                      <th className="p-2 text-right w-24 border-r border-slate-300">Total Setor</th>
                      <th className="p-2 text-center w-20">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {studentsInClass.map((s, idx) => {
                      const weeks = [1, 2, 3, 4, 5].map((m) =>
                        classKas.some(
                          (t) =>
                            t.siswaId === s.id &&
                            t.bulan === selectedBulan &&
                            t.mingguKe === m &&
                            t.kategori === 'Uang Kas'
                        )
                      );
                      const paidCount = weeks.filter(Boolean).length;
                      const totalSetor = paidCount * settings.nominalMingguan;

                      return (
                        <tr key={s.id}>
                          <td className="p-1.5 text-center border-r border-slate-200">{idx + 1}</td>
                          <td className="p-1.5 font-medium border-r border-slate-200">{s.namaLengkap}</td>
                          {weeks.map((paid, wIdx) => (
                            <td key={wIdx} className="p-1.5 text-center border-r border-slate-200">
                              {paid ? '✓' : '-'}
                            </td>
                          ))}
                          <td className="p-1.5 text-right font-bold border-r border-slate-200">
                            {formatRupiah(totalSetor)}
                          </td>
                          <td className="p-1.5 text-center text-[10px]">
                            {paidCount >= 4 ? 'Lunas' : paidCount > 0 ? `${paidCount}/4 Mgg` : 'Belum'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Tanda Tangan */}
              <div className="pt-8 grid grid-cols-2 text-center font-sans text-xs">
                <div className="space-y-16">
                  <p>
                    Mengetahui,<br />Wali Kelas {activeKelas.nama}
                  </p>
                  <div>
                    <p className="font-bold underline">{activeKelas.waliKelas || 'Wali Kelas'}</p>
                    <p className="text-[10px] text-slate-500">NIP. -</p>
                  </div>
                </div>

                <div className="space-y-16">
                  <p>
                    {sekolah.kecamatan || sekolah.kabupaten || 'Daerah'}, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                    <br />Bendahara Kelas
                  </p>
                  <div>
                    <p className="font-bold underline">{settings.namaBendahara || 'Bendahara Kelas'}</p>
                    <p className="text-[10px] text-slate-500">Siswa Pengelola</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Hapus Transaksi Kas */}
      <ConfirmModal
        isOpen={!!deleteKasTarget}
        title="Hapus Transaksi Kas"
        message={`Apakah Anda yakin ingin menghapus transaksi "${deleteKasTarget?.ket}"? Saldo kas akan diperbarui secara otomatis.`}
        confirmLabel="Hapus Transaksi"
        onConfirm={confirmDeleteKas}
        onCancel={() => setDeleteKasTarget(null)}
      />

      {/* Modal Tandai Semua Lunas Minggu Ini */}
      <ConfirmModal
        isOpen={markAllWeekTarget !== null}
        title="Tandai Semua Siswa Lunas"
        message={`Apakah Anda yakin ingin menandai semua siswa lunas untuk Minggu ke-${markAllWeekTarget} (${getBulanLabel(selectedBulan)}) dengan nominal ${formatRupiah(settings.nominalMingguan)} per siswa?`}
        confirmLabel="Tandai Lunas"
        isDestructive={false}
        onConfirm={confirmMarkWeekAllPaid}
        onCancel={() => setMarkAllWeekTarget(null)}
      />

      {/* MODAL MENU BAYAR KAS SISWA */}
      {isPayModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-200">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Menu Pembayaran Uang Kas</h3>
                  <p className="text-[11px] text-slate-500">
                    Catat setoran kas mingguan siswa secara borongan atau satuan
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPayModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePaymentModal} className="space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Pilih Siswa */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Pilih Siswa <span className="text-rose-600">*</span>
                </label>
                <select
                  value={paySiswaId}
                  onChange={(e) => {
                    const sid = e.target.value;
                    setPaySiswaId(sid);
                    // auto select unpaid weeks for this new student
                    const targetS = studentsInClass.find((s) => s.id === sid || s.qrId === sid);
                    const unpaidWeeks = [1, 2, 3, 4, 5].filter((m) => {
                      return !classKas.some(
                        (t) =>
                          (t.siswaId === sid || (targetS && (t.siswaId === targetS.id || t.siswaId === targetS.qrId || t.siswaId === targetS.nomorInduk))) &&
                          (t.bulan === (payBulan || selectedBulan) || (!t.bulan && t.tanggal?.startsWith(payBulan || selectedBulan))) &&
                          t.mingguKe === m &&
                          t.kategori === 'Uang Kas'
                      );
                    });
                    setPaySelectedWeeks(unpaidWeeks.length > 0 ? unpaidWeeks : [1]);
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600/20 text-xs font-semibold text-slate-800"
                >
                  <option value="">-- Pilih Nama Siswa --</option>
                  {studentsInClass.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.namaLengkap} (NISN: {s.nisn || '-'} / Induk: {s.nomorInduk})
                    </option>
                  ))}
                </select>
              </div>

              {/* Bulan Pembayaran */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Bulan Setoran</label>
                  <input
                    type="month"
                    value={payBulan || selectedBulan}
                    onChange={(e) => setPayBulan(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600/20 text-xs font-semibold text-slate-800 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tanggal Bayar</label>
                  <input
                    type="date"
                    value={payTanggal}
                    onChange={(e) => setPayTanggal(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600/20 text-xs font-semibold text-slate-800 cursor-pointer"
                  />
                </div>
              </div>

              {/* Pilihan Minggu */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-bold text-slate-700">
                    Pilih Minggu Pembayaran <span className="text-rose-600">*</span>
                  </label>
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <button
                      type="button"
                      onClick={() => {
                        const targetS = studentsInClass.find((s) => s.id === paySiswaId || s.qrId === paySiswaId);
                        const unpaidWeeks = [1, 2, 3, 4, 5].filter((m) => {
                          return !classKas.some(
                            (t) =>
                              (t.siswaId === paySiswaId || (targetS && (t.siswaId === targetS.id || t.siswaId === targetS.qrId || t.siswaId === targetS.nomorInduk))) &&
                              (t.bulan === (payBulan || selectedBulan) || (!t.bulan && t.tanggal?.startsWith(payBulan || selectedBulan))) &&
                              t.mingguKe === m &&
                              t.kategori === 'Uang Kas'
                          );
                        });
                        setPaySelectedWeeks(unpaidWeeks);
                      }}
                      className="text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer"
                    >
                      Belum Lunas
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setPaySelectedWeeks([1, 2, 3, 4])}
                      className="text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer"
                    >
                      1 Bulan (M1-M4)
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setPaySelectedWeeks([1, 2, 3, 4, 5])}
                      className="text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer"
                    >
                      Semua
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((m) => {
                    const targetS = studentsInClass.find((s) => s.id === paySiswaId || s.qrId === paySiswaId);
                    const isAlreadyPaid = classKas.some(
                      (t) =>
                        (t.siswaId === paySiswaId || (targetS && (t.siswaId === targetS.id || t.siswaId === targetS.qrId || t.siswaId === targetS.nomorInduk))) &&
                        (t.bulan === (payBulan || selectedBulan) || (!t.bulan && t.tanggal?.startsWith(payBulan || selectedBulan))) &&
                        t.mingguKe === m &&
                        t.kategori === 'Uang Kas'
                    );
                    const isSelected = paySelectedWeeks.includes(m);

                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setPaySelectedWeeks(paySelectedWeeks.filter((w) => w !== m));
                          } else {
                            setPaySelectedWeeks([...paySelectedWeeks, m].sort((a, b) => a - b));
                          }
                        }}
                        className={`py-2 px-1 rounded-xl border text-center transition-all cursor-pointer select-none flex flex-col items-center justify-center gap-1 ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                            : isAlreadyPaid
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:border-emerald-300'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span className="text-xs font-bold">M{m}</span>
                        <span
                          className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md ${
                            isSelected
                              ? 'bg-blue-700 text-white'
                              : isAlreadyPaid
                              ? 'bg-emerald-200 text-emerald-900'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {isSelected ? 'Dipilih' : isAlreadyPaid ? '✓ Lunas' : 'Belum'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Nominal & Metode Bayar */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nominal per Minggu (Rp)</label>
                  <input
                    type="number"
                    min={1000}
                    step={1000}
                    value={payNominalCustom || settings.nominalMingguan}
                    onChange={(e) => setPayNominalCustom(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600/20 text-xs font-semibold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Metode Bayar</label>
                  <select
                    value={payMetode}
                    onChange={(e) => setPayMetode(e.target.value as 'Tunai' | 'Transfer')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600/20 text-xs font-semibold text-slate-800"
                  >
                    <option value="Tunai">Tunai / Cash</option>
                    <option value="Transfer">Transfer / QRIS</option>
                  </select>
                </div>
              </div>

              {/* Catatan */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Catatan Tambahan (Opsional)</label>
                <input
                  type="text"
                  placeholder="Contoh: Titip ke ketua kelas, dibayar lunas di muka"
                  value={payCatatan}
                  onChange={(e) => setPayCatatan(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600/20 text-xs text-slate-800"
                />
              </div>

              {/* Total Calculation Card */}
              <div className="p-3.5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-blue-900 font-semibold block">Total yang Harus Dibayar:</span>
                  <span className="text-[10px] text-blue-700">
                    {paySelectedWeeks.length} Minggu x {formatRupiah(payNominalCustom || settings.nominalMingguan)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-base font-extrabold text-blue-950 font-mono">
                    {formatRupiah(paySelectedWeeks.length * (payNominalCustom || settings.nominalMingguan))}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPayModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-semibold text-xs cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    Simpan Pembayaran (
                    {formatRupiah(paySelectedWeeks.length * (payNominalCustom || settings.nominalMingguan))})
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
