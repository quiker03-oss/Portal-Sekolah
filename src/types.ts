export type UserRole = 'admin' | 'guru' | 'siswa' | 'superadmin';

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
  siswaId?: string; // linked to Student if role is siswa
  kelas?: string;
  nisn?: string;
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
  nomorHp?: string;
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
  assessmentId?: string;
  keterangan?: string;
}


export interface BelJadwal {
  id: string;
  schoolId?: string;
  waktu: string; // HH:MM format
  keterangan: string;
  pesanSuara: string;
  aktif: boolean;
  tipeBel: 'masuk' | 'istirahat' | 'pulang' | 'ganti_jam' | 'upacara' | string;
  hari?: string[]; // e.g. ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
  durasiDetik?: number;
  updatedAt?: string;
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

// ==================== ASISTEN AI GURU (SOAL, MODUL, LKPD) ====================
export interface SoalPilihanGanda {
  nomor: number;
  pertanyaan: string;
  gambar?: string; // High-res image data URI (Base64) or URL
  gambarCaption?: string;
  tipe?: 'pilihan_ganda' | 'pilihan_ganda_kompleks' | 'benar_salah' | 'menjodohkan' | 'isian' | 'esai' | string;
  pilihan: {
    A: string;
    B: string;
    C: string;
    D: string;
    E?: string;
    [key: string]: string | undefined;
  };
  kunciJawaban: string;
  pembahasan: string;
}

export interface SoalEsai {
  nomor: number;
  pertanyaan: string;
  gambar?: string;
  gambarCaption?: string;
  tipe?: string;
  pedomanPenskoran: string;
  kunciJawaban: string;
  pembahasan?: string;
}

export interface NaskahUjianAI {
  id: string;
  schoolId?: string;
  guruId?: string;
  guruName?: string;
  judul: string;
  mataPelajaran: string;
  kelas: string;
  fase?: string;
  semester?: 'Ganjil' | 'Genap';
  durasiMenit?: number;
  kurikulum: 'Kurikulum Merdeka' | 'Kurikulum 2013';
  jenisUjian: string;
  tingkatKesulitan: string;
  topikMateri: string;
  tujuanPembelajaran?: string;
  petunjukUmum: string;
  pilihanGanda: SoalPilihanGanda[];
  esai: SoalEsai[];
  kisiKisi?: { nomor: number; materi: string; indikator: string; tingkatKognitif: string; bentukSoal: string }[];
  rubrikPenilaian?: string;
  createdAt: string;
}

export interface ModulAjarAI {
  id: string;
  schoolId?: string;
  guruId?: string;
  guruName?: string;
  judul: string;
  jenisDokumen?: string; // 'Modul Ajar' | 'RPP Kurikulum Merdeka' | 'RPP K13' | 'RPP 1 Lembar'
  kurikulum?: 'Kurikulum Merdeka' | 'Kurikulum 2013';
  jenjang?: string;
  mataPelajaran: string;
  faseKelas: string;
  tahunAjaran?: string;
  semester?: 'Ganjil' | 'Genap';
  alokasiWaktu: string;
  capaianPembelajaran?: string;
  targetProfilPelajar: string[];
  modelPembelajaran?: string;
  metodePendekatan?: string;
  saranaPrasarana?: string[];
  tujuanPembelajaran: string[];
  pemahamanBermakna: string;
  pertanyaanPemantik: string[];
  diferensiasi?: {
    konten?: string;
    proses?: string;
    produk?: string;
  };
  kegiatanPembelajaran: {
    pendahuluan: string[];
    inti: string[];
    penutup: string[];
  };
  asesmen: {
    diagnostik: string;
    formatif: string;
    sumatif: string;
    rubrik?: string;
  };
  pengayaanRemedial?: string;
  refleksiGuruSiswa?: string;
  lembarKerjaRingkas?: string;
  createdAt: string;
}

export interface LkpdAktivitasItem {
  id: string;
  nomor: number;
  tipe: 'tanya_gambar' | 'cocokkan' | 'hitung_objek' | 'urutkan' | 'isi_kosong' | 'tabel_pengamatan' | 'uraian_kreatif';
  instruksi: string;
  gambar?: string; // data URI / SVG
  gambarCaption?: string;
  pertanyaan?: string;
  pilihanKiri?: string[]; // untuk mencocokkan garis
  pilihanKanan?: string[];
  objekHitung?: { nama: string; jumlah: number; emojiOrShape?: string }[];
  itemUrutan?: { teks: string; gambar?: string }[];
  kolomTabel?: string[];
  barisTabel?: string[][];
  garisJawaban?: number; // jumlah garis bergaris untuk menulis
}

export interface LkpdHalaman {
  nomorHalaman: number;
  subJudul?: string;
  aktivitas: LkpdAktivitasItem[];
  pngDataUri?: string; // High-res rendered PNG image
}

export interface LkpdData {
  judulLkpd: string;
  mataPelajaran: string;
  kelas: string;
  topikMateri: string;
  tujuanKegiatan: string[];
  petunjukPengerjaan: string[];
  halamanList: LkpdHalaman[];
  warnaAksen?: string;
  temaVisual?: 'ceria' | 'saintifik' | 'alam' | 'minimalis';
}

export interface BahanAjarAI {
  id: string;
  schoolId?: string;
  guruId?: string;
  guruName?: string;
  judul: string;
  mataPelajaran: string;
  kelas: string;
  fase?: string;
  topikMateri: string;
  tipe: 'ringkasan' | 'lkpd' | 'remedial' | 'lkpd_gambar' | 'bahan_plus_lkpd';
  tujuanPembelajaran?: string[];
  isiMarkdown: string;
  lkpdData?: LkpdData;
  createdAt: string;
}

// ==================== UJIAN ONLINE / CBT MODULE ====================
export type JenisSoal =
  | 'pilihan_ganda'
  | 'pilihan_ganda_kompleks'
  | 'benar_salah'
  | 'menjodohkan'
  | 'isian'
  | 'esai';
export type StatusUjian = 'draf' | 'terjadwal' | 'aktif' | 'selesai' | 'diarsipkan';

export interface PasanganMenjodohkan {
  id: string;
  kiri: string;
  kanan: string;
}

export interface SoalUjian {
  id: string;
  nomor: number;
  tipe: JenisSoal;
  pertanyaan: string;
  gambar?: string; // Data URI (Base64) or URL
  gambarList?: string[]; // Multiple figures / illustrations
  gambarCaption?: string;
  pilihan?: {
    [key: string]: string; // A, B, C, D, E
  };
  pilihanKompleks?: {
    [key: string]: string; // A, B, C, D, E for multi-checkbox
  };
  kunciPilihanKompleks?: string[]; // e.g. ["A", "C"]
  pasanganMenjodohkan?: PasanganMenjodohkan[];
  kunciMenjodohkan?: { [keyKiri: string]: string }; // Map key kiri to expected kanan
  kunciJawaban: string; // e.g. "A", "Benar", "kata kunci", atau rubrik esai
  pembahasan?: string;
  bobot: number; // default 1
  perluVerifikasi?: boolean; // flag if OCR/parser is uncertain
  catatanVerifikasi?: string;
  nomorHalaman?: number;
}

export interface RiwayatPerubahanKunci {
  id: string;
  tanggal: string;
  diubahOleh: string;
  keterangan: string;
  nomorSoal: number;
  kunciLama: string;
  kunciBaru: string;
}

export interface UjianOnline {
  id: string;
  schoolId?: string;
  judul: string;
  deskripsi?: string;
  mataPelajaran: string;
  mapelId?: string;
  guruId: string;
  guruNama: string;
  kelasTarget: string[]; // e.g. ["Kelas 1A", "Kelas 1B"] or ["Semua Siswa"]
  semester: 'Ganjil' | 'Genap';
  tahunAjaran: string;
  jenisUjian:
    | 'Ulangan Harian'
    | 'Penilaian Tengah Semester (PTS/STS)'
    | 'Penilaian Akhir Semester (PAS/SAS)'
    | 'Ujian Sekolah'
    | 'Try Out'
    | 'Kuis / Latihan Harian';
  status: StatusUjian;
  tanggalMulai: string; // YYYY-MM-DDTHH:mm
  tanggalSelesai: string; // YYYY-MM-DDTHH:mm
  durasiMenit: number; // e.g. 60
  jumlahPercobaan: number; // default 1
  acakSoal: boolean;
  acakPilihan: boolean;
  tampilkanNilaiLangsung: boolean;
  tampilkanPembahasan: 'tidak' | 'setelah_ujian' | 'setelah_jadwal_selesai';
  kodeUjian?: string; // Optional PIN / Token (e.g. "ABC123")
  kkm: number; // e.g. 75
  soalList: SoalUjian[];
  modeTampilan: 'terstruktur' | 'dokumen_asli';
  dokumenAsliNama?: string;
  dokumenAsliUrl?: string; // Base64 or Blob
  riwayatPerubahanKunci?: RiwayatPerubahanKunci[];
  // Fitur Pengawasan & Anti-Curang (Proctoring)
  pengawasanAktif?: boolean; // default true
  wajibFullscreen?: boolean; // default true
  maksimalPelanggaran?: number; // default 3, jika tercapai maka otomatis terkunci
  blokirCopyPaste?: boolean; // default true
  createdAt: string;
  updatedAt: string;
}

export interface LogPelanggaranUjian {
  id: string;
  waktu: string;
  jenis: 'pindah_tab' | 'keluar_fullscreen' | 'copy_paste' | 'klik_kanan' | 'jendela_blur' | 'lainnya';
  deskripsi: string;
  durasiKeluarDetik?: number;
}

export interface DetailJawabanSiswa {
  jawabanDipilih: string; // Plain string or comma-separated keys for complex
  jawabanKompleks?: string[]; // Array of selected option keys (e.g. ['A', 'C'])
  jawabanMenjodohkan?: { [keyKiri: string]: string }; // Pair selections
  raguRagu?: boolean;
  isBenar?: boolean;
  skorDidapat?: number;
  nilaiEsai?: number;
  catatanGuruEsai?: string;
  dinilaiOlehGuru?: boolean;
}

export interface DeviceSessionInfo {
  deviceId: string;
  userAgent: string;
  platform: string;
  screenResolution: string;
  language?: string;
  browserSummary?: string;
  ip?: string;
  loginAt: string;
  lastActiveAt?: string;
}

export interface AuditLogUjian {
  id: string;
  ujianId: string;
  siswaId: string;
  namaSiswa: string;
  kelas: string;
  waktu: string;
  tipe:
    | 'login_awal'
    | 'pemulihan_sesi'
    | 'deteksi_perangkat_ganda'
    | 'kunci_otomatis'
    | 'buka_kunci_guru'
    | 'simpan_jawaban_ditolak'
    | 'selesai_ujian';
  deskripsi: string;
  alasan?: string;
  deviceAwal?: Partial<DeviceSessionInfo>;
  deviceMencurigakan?: Partial<DeviceSessionInfo>;
  aktor?: string; // 'Sistem Server (Otomatis)' or 'Guru Pengawas: ...'
}

export interface JawabanSiswaUjian {
  id: string;
  schoolId?: string;
  ujianId: string;
  siswaId: string;
  namaSiswa: string;
  nisn?: string;
  nomorInduk?: string;
  kelas: string;
  jawaban: { [soalId: string]: DetailJawabanSiswa };
  waktuMulai: string;
  waktuSelesai?: string;
  durasiDetik?: number;
  status: 'sedang_mengerjakan' | 'selesai' | 'waktu_habis' | 'terkunci' | 'mencurigakan';
  jumlahBenar?: number;
  jumlahSalah?: number;
  jumlahKosong?: number;
  nilaiAkhir?: number; // 0 - 100
  lulusKkm?: boolean;
  adaEsaiBelumDinilai?: boolean;
  catatanGuru?: string;
  // Pengawasan & Status Sesi Perangkat
  sessionToken?: string;
  deviceInfo?: DeviceSessionInfo;
  deviceMencurigakan?: DeviceSessionInfo;
  waktuAktivitasMencurigakan?: string;
  riwayatAudit?: AuditLogUjian[];
  jumlahPelanggaran?: number;
  logPelanggaran?: LogPelanggaranUjian[];
  terkunciOlehSistem?: boolean;
  alasanTerkunci?: string;
  waktuTerkunci?: string;
  dibukaOlehGuru?: boolean;
  terakhirAktif?: string;
  createdAt: string;
  updatedAt: string;
}

