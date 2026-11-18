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
  status: 'Hadir' | 'Terlambat' | 'Izin' | 'Sakit' | 'Alpa' | 'Dinas Luar';
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
// ==================== ASISTEN AI GURU (MODUL AJAR & LKPD) ====================
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

export type TipeSoalUjian = 'pilihan_ganda' | 'benar_salah' | 'isian_singkat' | 'uraian';

export type ModePengacakanUjian = 'off' | 'sama' | 'per_siswa';

export type TingkatKesulitanSoal = 'mudah' | 'sedang' | 'sulit';

export type KontenElemenSoal =
  | { id: string; tipe: 'teks'; isi: string }
  | { id: string; tipe: 'tabel'; markdown: string }
  | { id: string; tipe: 'rumus'; isi: string }
  | {
      id: string;
      tipe: 'gambar';
      url: string;
      imageId?: string;
      storagePath?: string;
      caption?: string;
      ukuran?: 'kecil' | 'sedang' | 'besar' | 'asli';
    };

export interface ExamImageMeta {
  id: string;
  schoolId: string;
  ujianId: string;
  soalId: string;
  targetType: 'soal' | 'pilihan';
  choiceLetter?: string;
  url: string;
  storagePath?: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  caption?: string;
  createdBy?: string;
  createdAt: string;
}

export interface SoalUjian {
  id: string;
  nomor: number;
  tipe: TipeSoalUjian;
  pertanyaan: string;
  kontenElemen?: KontenElemenSoal[]; // Susunan elemen berurutan persis dokumen (teks, gambar, tabel, rumus)
  pilihan?: { [key: string]: string }; // A, B, C, D, E (teks pilihan)
  pilihanGambar?: { [key: string]: string }; // A, B, C, D, E (gambar pilihan)
  pilihanGambarMeta?: { [key: string]: { imageId?: string; storagePath?: string } };
  kunciJawaban: string; // e.g. "A", "BENAR", "SALAH", jawaban isian singkat (pisahkan `;` untuk variasi), atau pedoman uraian
  bobot: number; // default 1
  gambar?: string; // Data URI base64 atau storage URL
  gambarId?: string; // ID unik aset gambar di koleksi exam_images
  gambarStoragePath?: string; // Path objek di Firebase Storage
  gambarCaption?: string;
  gambarPosisi?: 'atas' | 'tengah' | 'bawah';
  gambarUkuran?: 'kecil' | 'sedang' | 'besar' | 'asli';
  gambarTambahan?: Array<{
    url: string;
    imageId?: string;
    storagePath?: string;
    caption?: string;
    posisi?: 'atas' | 'tengah' | 'bawah';
  }>;
  gambarStatus?: 'ok' | 'warning' | 'error';
  gambarWarning?: string;
  pedomanPenilaian?: string; // Rubrik skor untuk soal uraian
  pembahasan?: string; // Penjelasan jawaban untuk pembahasan atau Bank Soal
  perluVerifikasi?: boolean;
  catatanVerifikasi?: string;
}

export interface BankSoalItem {
  id: string;
  schoolId?: string;
  mataPelajaran: string;
  kelas: string;
  materi?: string;
  tingkatKesulitan: TingkatKesulitanSoal;
  tipe: TipeSoalUjian;
  pertanyaan: string;
  kontenElemen?: KontenElemenSoal[];
  pilihan?: { [key: string]: string };
  pilihanGambar?: { [key: string]: string };
  kunciJawaban: string;
  bobot: number;
  pembahasan?: string;
  pedomanPenilaian?: string;
  gambar?: string;
  gambarCaption?: string;
  gambarTambahan?: Array<{
    url: string;
    imageId?: string;
    storagePath?: string;
    caption?: string;
    posisi?: 'atas' | 'tengah' | 'bawah';
  }>;
  gambarPosisi?: 'atas' | 'tengah' | 'bawah';
  gambarUkuran?: 'kecil' | 'sedang' | 'besar' | 'asli';
  dibuatOleh?: string;
  createdAt: string;
  updatedAt: string;
}

export type StatusUjian = 'draf' | 'terjadwal' | 'terbit' | 'aktif' | 'selesai' | 'ditutup';

export interface UjianOnline {
  id: string;
  schoolId?: string;
  guruId: string;
  guruNama: string;
  judul: string;
  mataPelajaran: string;
  mapelId?: string;
  kelasTarget: string[]; // e.g. ["Kelas 4A", "Kelas 4B"]
  tanggalMulai: string; // YYYY-MM-DDTHH:mm
  tanggalSelesai: string; // YYYY-MM-DDTHH:mm
  durasiMenit: number; // e.g. 60
  jumlahPercobaan: number; // default 1
  kkm: number; // default 75
  status: StatusUjian;
  soalList: SoalUjian[];
  jumlahSoalTampil?: number; // 0 atau undefined = tampilkan seluruh soal
  acakSoal: boolean;
  acakPilihan: boolean;
  modeAcakSoal?: ModePengacakanUjian;
  modeAcakPilihan?: ModePengacakanUjian;
  modeFullscreen?: boolean; // default true
  tampilkanNilaiLangsung: boolean;
  tampilkanPembahasan: boolean;
  kodeUjian?: string; // 6-digit PIN akses umum
  petunjukPengerjaan?: string;
  batasPelanggaran?: number; // Maksimum toleransi pelanggaran (default: 3)
  dokumenAsliNama?: string;
  createdAt: string;
  updatedAt: string;
}

export type StatusSesiUjian = 'terverifikasi' | 'sedang_mengerjakan' | 'mengerjakan' | 'selesai' | 'waktu_habis' | 'terkunci';

export interface DetailJawabanSiswa {
  jawabanDipilih: string; // Selalu menyimpan ID/huruf opsi asli (e.g. 'C') atau teks uraian
  opsiAsliDipilih?: string; // Pemetaan huruf opsi asli sebelum acak pilihan
  opsiTampilDipilih?: string; // Huruf yang terlihat di layar siswa saat memilih (A-E)
  raguRagu?: boolean;
  nilaiManual?: number; // Nilai koreksi guru untuk uraian
  catatanGuru?: string;
  waktuJawab?: string;
  clientUpdatedAt?: number;
}

export interface LogPelanggaranSesi {
  waktu: string;
  jenis: 'pindah_tab' | 'keluar_fullscreen' | 'jendela_blur' | 'copy_paste' | 'akses_ganda' | 'lainnya';
  keterangan: string;
}

export interface SesiUjianSiswa {
  id: string; // session_<ujianId>_<siswaId>
  schoolId?: string;
  ujianId: string;
  siswaId: string;
  namaSiswa: string;
  nisn: string;
  kelas: string;
  attemptNumber?: number;
  sessionToken: string; // Unique URL token
  passCode: string; // 6-digit pairing code (e.g. 482195)
  status: StatusSesiUjian;
  waktuMulai?: string;
  waktuSelesai?: string;
  durasiDetik?: number;
  urutanSoalIds?: string[]; // Urutan soal terkunci per sesi agar konsisten saat refresh
  urutanPilihanMap?: { [soalId: string]: string[] }; // e.g. { soalId: ['C', 'A', 'D', 'B'] }
  jawaban: { [soalId: string]: DetailJawabanSiswa };
  nilaiPg: number; // 0 - 100
  nilaiUraian: number; // 0 - 100
  nilaiAkhir: number; // 0 - 100 proporsional
  jumlahBenar?: number;
  jumlahSalah?: number;
  jumlahKosong?: number;
  lulusKkm: boolean;
  adaUraianBelumDinilai: boolean;
  gradedBy?: 'backend' | 'local';
  gradedAt?: string;
  pendingSubmitSync?: boolean;
  syncVersion?: number;
  jumlahPelanggaran: number;
  logPelanggaran: LogPelanggaranSesi[];
  deviceInfo?: {
    browser?: string;
    platform?: string;
    userAgent?: string;
    ip?: string;
  };
  terakhirAktif: string;
  createdAt: string;
  updatedAt: string;
}
