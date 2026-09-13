export type UserRole = 'admin' | 'guru' | 'superadmin';

export interface SchoolAccount {
  id: string; // e.g. 'sch-1', 'sch-2'
  namaSekolah: string;
  npsn: string;
  username: string; // login username for this school's admin/operator
  password: string; // school password
  status: 'aktif' | 'nonaktif';
  createdAt: string;
  lastLogin?: string;
  kontak?: string;
  email?: string;
  keterangan?: string;
}

export interface SuperAdminUser {
  id: string;
  username: string;
  password: string;
  name: string;
  role: 'superadmin';
  lastLogin?: string;
}

export interface SuperAdminLog {
  id: string;
  timestamp: string;
  action: 'create_school' | 'edit_school' | 'edit_username' | 'reset_password' | 'toggle_status' | 'update_superadmin' | 'delete_school';
  schoolId?: string;
  schoolName?: string;
  description: string;
}

export interface TransaksiKas {
  id: string;
  schoolId?: string;
  tanggal: string;
  jenis: 'Pemasukan' | 'Pengeluaran';
  kategori: string;
  keterangan: string;
  jumlah: number;
  kelasId?: string; // Untuk memisahkan kas per kelas
  siswaId?: string; // Menyambungkan pembayaran ke siswa
  bulan?: string; // e.g. "2026-09"
  mingguKe?: number; // 1, 2, 3, 4, 5
}

export interface User {
  id: string;
  schoolId?: string;
  username: string;
  password?: string;
  name: string;
  role: UserRole;
  nip?: string;
  guruId?: string; // linked to Teacher
  kelasId?: string; // assigned class id for teacher filtering
}

export interface SekolahInfo {
  schoolId?: string;
  nama: string;
  npsn: string;
  nss: string;
  alamat: string;
  desa: string;
  kecamatan: string;
  kabupaten: string;
  provinsi: string;
  kodePos: string;
  email: string;
  telepon: string;
  namaKepalaSekolah: string;
  nipKepalaSekolah: string;
  logo: string; // Base64 or image URL
  fotoSekolah: string;
  fotoKepalaSekolah: string;
  sambutan: string;
  profilSingkat: string;
  sejarah: string;
  visi: string;
  misi: string[];
  tujuan: string[];
}

export interface Siswa {
  id: string; // Internal UUID
  schoolId?: string;
  qrId: string; // STU-00001
  nomorInduk: string;
  nisn: string;
  namaLengkap: string;
  tempatLahir: string;
  tanggalLahir: string;
  jenisKelamin: 'L' | 'P';
  alamat: string;
  kelas: string; // e.g. "1A", "2", "6"
  namaOrangTua: string;
  foto?: string;
  createdAt: string;
}

export interface Guru {
  id: string;
  schoolId?: string;
  qrId: string; // TCH-00001
  nama: string;
  nip: string; // NIP/NUPTK
  jabatan: string; // e.g. "Wali Kelas 1A", "Guru PJOK", "Kepala Sekolah"
  mataPelajaran: string;
  alamat: string;
  nomorHp: string;
  foto?: string;
  createdAt: string;
  kelasId?: string; // id of the class this teacher is responsible for
}

export interface Kelas {
  id: string;
  schoolId?: string;
  nama: string; // e.g. "1A", "1B", "2A", "3", "4", "5", "6"
  tingkat?: number;
  waliKelas?: string;
  waliKelasId?: string;
  kapasitas?: number;
}

export interface MataPelajaran {
  id: string;
  schoolId?: string;
  kode: string;
  nama: string;
  kategori?: 'Wajib' | 'Muatan Lokal' | 'Pilihan' | string;
  kkm: number;
  guruPengampu?: string;
}

export type StatusAbsensi = 'Hadir' | 'Izin' | 'Sakit' | 'Alpa' | 'Terlambat';

export interface AbsensiSiswa {
  id: string;
  schoolId?: string;
  siswaId: string;
  qrId: string;
  namaSiswa: string;
  kelas: string;
  tanggal: string; // YYYY-MM-DD
  jam: string; // HH:mm:ss
  status: StatusAbsensi;
  keterangan?: string;
}

export interface AbsensiGuru {
  id: string;
  schoolId?: string;
  guruId: string;
  qrId?: string;
  namaGuru: string;
  tanggal: string; // YYYY-MM-DD
  jamMasuk: string; // HH:mm:ss
  jamPulang?: string; // HH:mm:ss
  status: 'Hadir' | 'Terlambat' | 'Izin' | 'Sakit' | 'Dinas Luar';
  keterangan?: string;
}

export interface NilaiSiswa {
  id: string;
  schoolId?: string;
  siswaId: string;
  mapelId: string;
  namaMapel?: string;
  kelas?: string;
  tahunAjaran: string; // e.g. "2024/2025"
  semester: 'Ganjil' | 'Genap';
  tugas: number;
  uts?: number;
  uas?: number;
  ulangan?: number;
  pts?: number;
  pasSas?: number;
  proyek?: number;
  nilaiAkhir: number; // Auto computed
  predikat?: 'A' | 'B' | 'C' | 'D';
  catatan?: string;
  deskripsi?: string;
}

export interface NilaiHarianItem {
  id: string;
  schoolId?: string;
  siswaId: string;
  namaSiswa: string;
  kelasId: string;
  namaKelas: string;
  mapelId: string;
  namaMapel: string;
  jenisPenilaian: 'Tugas' | 'Ulangan Harian' | 'Formatif' | 'Kuis' | 'Praktik' | string;
  materi: string; // e.g. "Bab 1: Bilangan Cacah"
  tanggal: string; // YYYY-MM-DD
  nilai: number; // 0 - 100
  catatan?: string;
  semester?: 'Ganjil' | 'Genap';
  tahunAjaran?: string;
  assessmentId?: string; // Identifier for this specific assessment column/session
  keterangan?: string;
}

export interface CatatanRapor {
  id: string;
  schoolId?: string;
  siswaId: string;
  tahunAjaran: string;
  semester: 'Ganjil' | 'Genap';
  sakit: number;
  izin: number;
  alpa: number;
  catatanWaliKelas: string;
  keputusan?: string; // "Naik ke kelas X" / "Lulus"
}

export interface Pengumuman {
  id: string;
  schoolId?: string;
  judul: string;
  isi: string;
  tanggal: string;
  kategori?: string;
  gambar?: string;
  penulis?: string;
}

export interface Berita {
  id: string;
  schoolId?: string;
  judul: string;
  ringkasan: string;
  isi: string;
  kategori: string;
  tanggal: string;
  gambar?: string;
  penulis?: string;
}

export interface GaleriItem {
  id: string;
  schoolId?: string;
  judul: string;
  kategori: string;
  tanggal: string;
  gambar?: string;
  url?: string;
}

export type Galeri = GaleriItem;

export interface Settings {
  schoolId?: string;
  namaSekolah: string;
  npsn: string;
  alamat: string;
  desa?: string;
  kecamatan?: string;
  kabupaten?: string;
  provinsi?: string;
  kodePos?: string;
  telepon: string;
  email: string;
  visi: string;
  misi: string[];
  namaKepalaSekolah: string;
  nipKepalaSekolah: string;
  sambutanKepalaSekolah: string;
  fotoKepalaSekolah: string;
  fotoSekolah: string; // Add this
  logoUrl: string;
  tahunAjaranAktif: string;
  semesterAktif: 'Ganjil' | 'Genap';
}

export interface AppSettings {
  schoolId?: string;
  namaSekolah?: string;
  logoUrl?: string;
  tahunAjaranAktif: string;
  semesterAktif: 'Ganjil' | 'Genap';
  bobotTugas: number;
  bobotUlangan: number;
  bobotPts: number;
  bobotPasSas: number;
  bobotProyek: number;
}

export interface LandingConfig {
  schoolId?: string;
  heroBadge: string;
  heroTagline: string;
  heroDescription: string;
  heroCtaText: string;
  heroSecondaryCtaText: string;
  showRunningText: boolean;
  runningText: string;
  showStatistik: boolean;
  showSambutan: boolean;
  showProfil: boolean;
  showBerita: boolean;
  showPengumuman: boolean;
  showGuru: boolean;
  showGaleri: boolean;
  showKontak: boolean;
}

// ==================== ASISTEN AI GURU (SOAL & MODUL) ====================
export interface SoalPilihanGanda {
  nomor: number;
  pertanyaan: string;
  pilihan: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  kunciJawaban: 'A' | 'B' | 'C' | 'D';
  pembahasan: string;
}

export interface SoalEsai {
  nomor: number;
  pertanyaan: string;
  pedomanPenskoran: string;
  kunciJawaban: string;
}

export interface NaskahUjianAI {
  id: string;
  schoolId?: string;
  guruId?: string;
  guruName?: string;
  judul: string;
  mataPelajaran: string;
  kelas: string;
  kurikulum: 'Kurikulum Merdeka' | 'Kurikulum 2013';
  jenisUjian: 'Ulangan Harian' | 'Penilaian Tengah Semester (PTS/STS)' | 'Penilaian Akhir Semester (PAS/SAS)' | 'Kuis / Latihan Harian';
  tingkatKesulitan: 'Mudah' | 'Sedang' | 'HOTS (Analisis Tinggi)';
  topikMateri: string;
  petunjukUmum: string;
  pilihanGanda: SoalPilihanGanda[];
  esai: SoalEsai[];
  createdAt: string;
}

export interface ModulAjarAI {
  id: string;
  schoolId?: string;
  guruId?: string;
  guruName?: string;
  judul: string;
  mataPelajaran: string;
  faseKelas: string;
  alokasiWaktu: string;
  targetProfilPelajar: string[];
  tujuanPembelajaran: string[];
  pemahamanBermakna: string;
  pertanyaanPemantik: string[];
  kegiatanPembelajaran: {
    pendahuluan: string[];
    inti: string[];
    penutup: string[];
  };
  asesmen: {
    diagnostik: string;
    formatif: string;
    sumatif: string;
  };
  lembarKerjaRingkas?: string;
  createdAt: string;
}

export interface BahanAjarAI {
  id: string;
  schoolId?: string;
  guruId?: string;
  guruName?: string;
  judul: string;
  mataPelajaran: string;
  kelas: string;
  topikMateri: string;
  tipe: 'ringkasan' | 'lkpd' | 'remedial';
  isiMarkdown: string;
  createdAt: string;
}
