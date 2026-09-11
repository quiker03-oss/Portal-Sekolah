import { db as firestoreDb, doc, setDoc, deleteDoc, collection, onSnapshot, query, getDocs } from './firebase';
import {
  User,
  SekolahInfo,
  Siswa,
  Guru,
  Kelas,
  MataPelajaran,
  AbsensiSiswa,
  AbsensiGuru,
  NilaiSiswa,
  CatatanRapor,
  Pengumuman,
  Berita,
  GaleriItem,
  AppSettings,
  Settings,
  TransaksiKas,
  LandingConfig,
  SchoolAccount,
  SuperAdminUser,
  SuperAdminLog,
  NilaiHarianItem,
} from '../types';

const STORAGE_KEYS = {
  USERS: 'sdn2_users',
  SEKOLAH: 'sdn2_sekolah',
  SISWA: 'sdn2_siswa',
  GURU: 'sdn2_guru',
  KELAS: 'sdn2_kelas',
  MAPEL: 'sdn2_mapel',
  ABSENSI_SISWA: 'sdn2_absensi_siswa',
  ABSENSI_GURU: 'sdn2_absensi_guru',
  NILAI: 'sdn2_nilai',
  NILAI_HARIAN: 'sdn2_nilai_harian',
  CATATAN_RAPOR: 'sdn2_catatan_rapor',
  PENGUMUMAN: 'sdn2_pengumuman',
  BERITA: 'sdn2_berita',
  GALERI: 'sdn2_galeri',
  SETTINGS: 'sdn2_settings',
  AUTH_USER: 'sdn2_auth_user',
  KAS: 'sdn2_kas',
  LANDING_CONFIG: 'sdn2_landing_config',
  SCHOOL_ACCOUNTS: 'sdn2_school_accounts',
  SUPERADMIN_USER: 'sdn2_superadmin_user',
  SUPERADMIN_LOGS: 'sdn2_superadmin_logs',
  SUPERADMIN_AUTH: 'sdn2_superadmin_auth_session',
  ACTIVE_SCHOOL_ID: 'sdn2_active_school_id',
};

// Default school emblem
export const DEFAULT_SCHOOL_LOGO = '/logo.svg';

const INITIAL_SEKOLAH: SekolahInfo = {
  nama: 'Satuan Pendidikan',
  npsn: '20204512',
  nss: '101020401002',
  alamat: 'Jl. Pendidikan No. 45',
  desa: 'Sukamaju',
  kecamatan: 'Cerdas',
  kabupaten: 'Kabupaten Bandung',
  provinsi: 'Jawa Barat',
  kodePos: '40381',
  email: 'info@sekolah.sch.id',
  telepon: '(022) 595-1284',
  namaKepalaSekolah: 'Drs. H. Ahmad Sudrajat, M.Pd.',
  nipKepalaSekolah: '19680512 199203 1 005',
  logo: DEFAULT_SCHOOL_LOGO,
  fotoSekolah: 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=1400&q=80',
  fotoKepalaSekolah: 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=400&q=80',
  sambutan: 'Assalamu’alaikum Warahmatullahi Wabarakatuh. Puji syukur kita panjatkan ke hadirat Allah SWT atas rahmat dan karunia-Nya, Portal Sekolah Digital kini hadir sebagai sarana informasi, keterbukaan akademik, dan modernisasi pendidikan. Kami berkomitmen mewujudkan generasi cerdas, berkarakter luhur, berwawasan lingkungan, serta adaptif terhadap kemajuan teknologi.',
  profilSingkat: 'Satuan Pendidikan kami merupakan sekolah dasar unggulan yang berdedikasi menciptakan suasana belajar ramah anak, berprestasi dalam bidang akademik maupun seni budaya, serta terdepan dalam digitalisasi sekolah.',
  sejarah: 'Didirikan untuk mencerdaskan kehidupan bangsa, sekolah telah mendidik ribuan putra-putri daerah menjadi insan berbudi pekerti luhur. Seiring perkembangan kurikulum Merdeka, sekolah kini mengintegrasikan sistem administrasi dan e-Rapor digital terpadu.',
  visi: 'Terwujudnya Peserta Didik yang Beriman dan Bertakwa, Berkarakter Pancasila, Unggul dalam Prestasi, Mandiri, dan Berbudaya Lingkungan Melalui Pemanfaatan Teknologi Digital.',
  misi: [
    'Menumbuhkembangkan keimanan dan ketakwaan melalui kegiatan keagamaan rutin dan pembiasaan akhlak mulia.',
    'Menyelenggarakan proses pembelajaran yang kreatif, inovatif, berpusat pada peserta didik dengan dukungan media digital.',
    'Meningkatkan mutu pendidikan akademik dan non-akademik melalui bimbingan bakat, olahraga, serta seni budaya.',
    'Menerapkan tata kelola sekolah yang transparan, akuntabel, efisien dengan sistem informasi sekolah terintegrasi.',
    'Menjalin kemitraan yang sinergis antara sekolah, komite, orang tua, dan masyarakat sekitar.',
  ],
  tujuan: [
    'Mencapai tingkat kelulusan 100% dengan rata-rata nilai kompetensi yang unggul.',
    'Menguasai literasi baca-tulis, numerasi, dan literasi digital sejak dini.',
    'Menjuarai berbagai kompetisi akademik, olahraga, dan FLS2N di tingkat daerah hingga nasional.',
    'Mewujudkan lingkungan sekolah ramah anak yang hijau, bersih, dan berbudaya.',
  ],
};

const INITIAL_USERS: User[] = [
  {
    id: 'usr-2',
    username: 'operator',
    name: 'Hendra Lesmana, S.Kom (Operator Dapodik)',
    role: 'admin',
  },
  {
    id: 'usr-3',
    username: 'guru1',
    name: 'Siti Rahmawati, S.Pd.SD',
    role: 'guru',
    nip: '19840214 200801 2 006',
    guruId: 'tch-1',
  },
  {
    id: 'usr-4',
    username: 'guru2',
    name: 'Budi Santoso, S.Pd.',
    role: 'guru',
    nip: '19890918 201502 1 003',
    guruId: 'tch-2',
  },
  {
    id: 'usr-5',
    username: 'guru3',
    name: 'Asep Saepuloh, S.Pd.I',
    role: 'guru',
    nip: '19790412 200501 1 004',
    guruId: 'tch-3',
  },
];

const INITIAL_KELAS: Kelas[] = [
  { id: 'k-1', nama: 'Kelas 1A', kapasitas: 28, waliKelasId: 'tch-1' },
  { id: 'k-2', nama: 'Kelas 1B', kapasitas: 28, waliKelasId: 'tch-4' },
  { id: 'k-3', nama: 'Kelas 2', kapasitas: 30, waliKelasId: 'tch-5' },
  { id: 'k-4', nama: 'Kelas 3', kapasitas: 32, waliKelasId: 'tch-6' },
  { id: 'k-5', nama: 'Kelas 4', kapasitas: 30, waliKelasId: 'tch-7' },
  { id: 'k-6', nama: 'Kelas 5', kapasitas: 32, waliKelasId: 'tch-8' },
  { id: 'k-7', nama: 'Kelas 6', kapasitas: 30, waliKelasId: 'tch-2' },
];

const INITIAL_MAPEL: MataPelajaran[] = [
  { id: 'mp-1', kode: 'PAI', nama: 'Pendidikan Agama Islam & Budi Pekerti', kategori: 'Wajib', kkm: 75 },
  { id: 'mp-2', kode: 'PKN', nama: 'Pendidikan Pancasila', kategori: 'Wajib', kkm: 75 },
  { id: 'mp-3', kode: 'BIN', nama: 'Bahasa Indonesia', kategori: 'Wajib', kkm: 75 },
  { id: 'mp-4', kode: 'MAT', nama: 'Matematika', kategori: 'Wajib', kkm: 70 },
  { id: 'mp-5', kode: 'IPA', nama: 'Ilmu Pengetahuan Alam dan Sosial (IPAS)', kategori: 'Wajib', kkm: 75 },
  { id: 'mp-6', kode: 'PJK', nama: 'Pendidikan Jasmani, Olahraga & Kesehatan (PJOK)', kategori: 'Wajib', kkm: 75 },
  { id: 'mp-7', kode: 'SNB', nama: 'Seni dan Budaya (Seni Rupa/Musik)', kategori: 'Wajib', kkm: 75 },
  { id: 'mp-8', kode: 'SND', nama: 'Bahasa Sunda (Muatan Lokal)', kategori: 'Muatan Lokal', kkm: 72 },
  { id: 'mp-9', kode: 'ING', nama: 'Bahasa Inggris', kategori: 'Pilihan', kkm: 70 },
];

const INITIAL_GURU: Guru[] = [
  {
    id: 'tch-1',
    qrId: 'TCH-00001',
    nama: 'Siti Rahmawati, S.Pd.SD',
    nip: '19840214 200801 2 006',
    jabatan: 'Wali Kelas 1A',
    mataPelajaran: 'Guru Kelas 1',
    alamat: 'Kp. Bojongsoang RT 01 RW 04, Ciparay',
    nomorHp: '081223344556',
    foto: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80',
    createdAt: '2024-01-10',
  },
  {
    id: 'tch-2',
    qrId: 'TCH-00002',
    nama: 'Budi Santoso, S.Pd.',
    nip: '19890918 201502 1 003',
    jabatan: 'Wali Kelas 6 & Koordinator IT',
    mataPelajaran: 'Guru Kelas 6',
    alamat: 'Jl. Raya Pacet No. 12, Ciparay',
    nomorHp: '081398765432',
    foto: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=400&q=80',
    createdAt: '2024-01-10',
  },
  {
    id: 'tch-3',
    qrId: 'TCH-00003',
    nama: 'Asep Saepuloh, S.Pd.I',
    nip: '19790412 200501 1 004',
    jabatan: 'Guru Pendidikan Agama Islam',
    mataPelajaran: 'Pendidikan Agama Islam',
    alamat: 'Desa Gunungleutik, Ciparay',
    nomorHp: '085221133445',
    foto: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
    createdAt: '2024-01-10',
  },
  {
    id: 'tch-4',
    qrId: 'TCH-00004',
    nama: 'Dewi Lestari, S.Pd.',
    nip: '19871105 201001 2 009',
    jabatan: 'Wali Kelas 1B',
    mataPelajaran: 'Guru Kelas 1',
    alamat: 'Perum Bumi Ciparay Asri B-12',
    nomorHp: '081987654321',
    foto: 'https://images.unsplash.com/photo-1580894732444-8ecded7900cd?auto=format&fit=crop&w=400&q=80',
    createdAt: '2024-01-10',
  },
  {
    id: 'tch-5',
    qrId: 'TCH-00005',
    nama: 'Cecep Sunandar, S.Pd.',
    nip: '19820619 200902 1 007',
    jabatan: 'Guru PJOK',
    mataPelajaran: 'Pendidikan Jasmani & Olahraga',
    alamat: 'Jl. Babakan Giriharja No. 8',
    nomorHp: '087822334411',
    foto: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
    createdAt: '2024-01-10',
  },
  {
    id: 'tch-6',
    qrId: 'TCH-00006',
    nama: 'Rina Marlina, S.Pd.',
    nip: '19910325 201903 2 008',
    jabatan: 'Wali Kelas 3',
    mataPelajaran: 'Guru Kelas 3',
    alamat: 'Kp. Cikitu RT 03 RW 02',
    nomorHp: '082112345678',
    foto: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80',
    createdAt: '2024-01-10',
  },
];

const INITIAL_SISWA: Siswa[] = [
  {
    id: 'stu-1',
    qrId: 'STU-00001',
    nomorInduk: '23240101',
    nisn: '0165432101',
    namaLengkap: 'Aditya Pratama Putra',
    tempatLahir: 'Bandung',
    tanggalLahir: '2017-05-14',
    jenisKelamin: 'L',
    alamat: 'Kp. Giriharja RT 01 / RW 03',
    kelas: 'Kelas 1A',
    namaOrangTua: 'Bambang Sudarsono',
    createdAt: '2024-07-15',
  },
  {
    id: 'stu-2',
    qrId: 'STU-00002',
    nomorInduk: '23240102',
    nisn: '0165432102',
    namaLengkap: 'Aisyah Putri Rahmadani',
    tempatLahir: 'Bandung',
    tanggalLahir: '2017-08-20',
    jenisKelamin: 'P',
    alamat: 'Jl. Babakan Giriharja No. 12',
    kelas: 'Kelas 1A',
    namaOrangTua: 'Rahmat Hidayat',
    createdAt: '2024-07-15',
  },
  {
    id: 'stu-3',
    qrId: 'STU-00003',
    nomorInduk: '23240103',
    nisn: '0165432103',
    namaLengkap: 'Bilal Al-Ghifari',
    tempatLahir: 'Bandung',
    tanggalLahir: '2017-02-11',
    jenisKelamin: 'L',
    alamat: 'Kp. Cikitu RT 02 / RW 01',
    kelas: 'Kelas 1A',
    namaOrangTua: 'Usep Supriyadi',
    createdAt: '2024-07-15',
  },
  {
    id: 'stu-4',
    qrId: 'STU-00004',
    nomorInduk: '23240104',
    nisn: '0165432104',
    namaLengkap: 'Cantika Dewi Anggraeni',
    tempatLahir: 'Cimahi',
    tanggalLahir: '2017-10-05',
    jenisKelamin: 'P',
    alamat: 'Desa Barujati No. 8',
    kelas: 'Kelas 1A',
    namaOrangTua: 'Dedi Kurniawan',
    createdAt: '2024-07-15',
  },
  {
    id: 'stu-5',
    qrId: 'STU-00005',
    nomorInduk: '23240105',
    nisn: '0165432105',
    namaLengkap: 'Daffa Rizki Ramadhan',
    tempatLahir: 'Bandung',
    tanggalLahir: '2017-06-25',
    jenisKelamin: 'L',
    alamat: 'Kp. Sindangreret RT 04 / RW 02',
    kelas: 'Kelas 1A',
    namaOrangTua: 'Iwan Setiawan',
    createdAt: '2024-07-15',
  },
  {
    id: 'stu-6',
    qrId: 'STU-00006',
    nomorInduk: '23240106',
    nisn: '0165432106',
    namaLengkap: 'Elvira Zahra Nuraini',
    tempatLahir: 'Bandung',
    tanggalLahir: '2017-09-12',
    jenisKelamin: 'P',
    alamat: 'Jl. Raya Laswi Ciparay No. 55',
    kelas: 'Kelas 1B',
    namaOrangTua: 'H. Lukman Hakim',
    createdAt: '2024-07-15',
  },
  {
    id: 'stu-7',
    qrId: 'STU-00007',
    nomorInduk: '23240107',
    nisn: '0165432107',
    namaLengkap: 'Fathan Maulana Malik',
    tempatLahir: 'Garut',
    tanggalLahir: '2017-03-30',
    jenisKelamin: 'L',
    alamat: 'Kp. Giriharja RT 03 / RW 05',
    kelas: 'Kelas 1B',
    namaOrangTua: 'Agus Gunawan',
    createdAt: '2024-07-15',
  },
  {
    id: 'stu-8',
    qrId: 'STU-00008',
    nomorInduk: '22230201',
    nisn: '0155432108',
    namaLengkap: 'Gilang Ramadhan',
    tempatLahir: 'Bandung',
    tanggalLahir: '2016-04-18',
    jenisKelamin: 'L',
    alamat: 'Perumahan Puri Ciparay Blok C-4',
    kelas: 'Kelas 2',
    namaOrangTua: 'Suryana',
    createdAt: '2023-07-15',
  },
  {
    id: 'stu-9',
    qrId: 'STU-00009',
    nomorInduk: '21220301',
    nisn: '0145432109',
    namaLengkap: 'Hana Farida Syahida',
    tempatLahir: 'Bandung',
    tanggalLahir: '2015-11-22',
    jenisKelamin: 'P',
    alamat: 'Kp. Bojong RT 01 / RW 07',
    kelas: 'Kelas 3',
    namaOrangTua: 'Farid Hidayatullah',
    createdAt: '2022-07-15',
  },
  {
    id: 'stu-10',
    qrId: 'STU-00010',
    nomorInduk: '20210401',
    nisn: '0135432110',
    namaLengkap: 'Irfan Hakim Alamsyah',
    tempatLahir: 'Bandung',
    tanggalLahir: '2014-07-08',
    jenisKelamin: 'L',
    alamat: 'Jl. Giriharja No. 90',
    kelas: 'Kelas 4',
    namaOrangTua: 'Alam Kurniawan',
    createdAt: '2021-07-15',
  },
  {
    id: 'stu-11',
    qrId: 'STU-00011',
    nomorInduk: '19200501',
    nisn: '0125432111',
    namaLengkap: 'Jovita Amelia Putri',
    tempatLahir: 'Bandung',
    tanggalLahir: '2013-01-15',
    jenisKelamin: 'P',
    alamat: 'Kp. Babakan Sari RT 02 / RW 04',
    kelas: 'Kelas 5',
    namaOrangTua: 'Joko Susilo',
    createdAt: '2020-07-15',
  },
  {
    id: 'stu-12',
    qrId: 'STU-00012',
    nomorInduk: '18190601',
    nisn: '0115432112',
    namaLengkap: 'Kenzie Alvaro Raditya',
    tempatLahir: 'Jakarta',
    tanggalLahir: '2012-08-19',
    jenisKelamin: 'L',
    alamat: 'Jl. Simpang Ciparay No. 21',
    kelas: 'Kelas 6',
    namaOrangTua: 'Raditya Hendrawan',
    createdAt: '2019-07-15',
  },
  {
    id: 'stu-13',
    qrId: 'STU-00013',
    nomorInduk: '18190602',
    nisn: '0115432113',
    namaLengkap: 'Laila Zahira Qalbi',
    tempatLahir: 'Bandung',
    tanggalLahir: '2012-12-04',
    jenisKelamin: 'P',
    alamat: 'Kp. Giriharja Tonggoh RT 05',
    kelas: 'Kelas 6',
    namaOrangTua: 'Qolby Mansyur',
    createdAt: '2019-07-15',
  },
];

const INITIAL_PENGUMUMAN: Pengumuman[] = [
  {
    id: 'png-1',
    judul: 'Informasi Penilaian Sumatif Akhir Semester (SAS) Tahun Ajaran 2024/2025',
    isi: 'Diberitahukan kepada seluruh bapak/ibu guru, siswa-siswi kelas 1 s.d. 6, bahwa pelaksanaan SAS Semester Genap akan dilaksanakan mulai hari Senin, 16 Juni 2025. Diharapkan seluruh siswa mempersiapkan diri dengan belajar tekun serta menjaga kesehatan.',
    tanggal: '2025-06-02',
    penulis: 'Kepala Sekolah',
    gambar: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'png-2',
    judul: 'Sosialisasi Kartu Pelajar Digital dan Sistem Presensi Terpadu',
    isi: 'Dalam rangka mewujudkan digitalisasi satuan pendidikan, sekolah resmi memberlakukan kartu pelajar dan presensi terpadu untuk siswa dan guru setiap pagi mulai pukul 06.30 - 07.15 WIB di gerbang sekolah.',
    tanggal: '2025-05-20',
    penulis: 'Operator Sekolah',
    gambar: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'png-3',
    judul: 'Penerimaan Peserta Didik Baru (PPDB) Tahun Ajaran 2025/2026',
    isi: 'Jalur zonasi dan afirmasi PPDB akan dibuka mulai tanggal 23 Juni 2025. Pendaftaran tidak dipungut biaya apapun (Gratis). Siapkan Akta Kelahiran, Kartu Keluarga, dan KTP Orang Tua.',
    tanggal: '2025-05-15',
    penulis: 'Panitia PPDB',
    gambar: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=800&q=80',
  },
];

const INITIAL_BERITA: Berita[] = [
  {
    id: 'brt-1',
    judul: 'Siswa Sekolah Raih Juara 1 Lomba Cerdas Cermat Tingkat Kecamatan',
    ringkasan: 'Tim Cerdas Cermat sekolah berhasil menorehkan prestasi gemilang dengan meraih Juara Pertama.',
    isi: 'Prestasi membanggakan kembali diraih oleh peserta didik pada ajang Lomba Cerdas Cermat SD. Tim yang diwakili oleh siswa-siswi kelas 5 dan 6 berhasil mengungguli puluhan perwakilan sekolah dasar lainnya dengan nilai memuaskan. Kepala Sekolah menyampaikan rasa syukur dan bangga atas kerja keras tim pembimbing dan anak-anak.',
    kategori: 'Prestasi',
    tanggal: '2025-05-28',
    penulis: 'Budi Santoso, S.Pd.',
    gambar: 'https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'brt-2',
    judul: 'Semarak Gelar Karya Projek Penguatan Profil Pelajar Pancasila (P5)',
    ringkasan: 'Siswa memamerkan beragam kreasi kerajinan tradisional dan olahan pangan karya mandiri.',
    isi: 'Satuan Pendidikan menggelar pameran karya P5 dengan tema "Kearifan Lokal dan Gaya Hidup Berkelanjutan". Acara berlangsung meriah dengan dihadiri perwakilan Dinas Pendidikan, Komite Sekolah, serta para orang tua siswa. Beragam karya mulai dari replika wayang, anyaman bambu, hingga pentas seni tari ditampilkan dengan apik.',
    kategori: 'Kegiatan',
    tanggal: '2025-05-10',
    penulis: 'Siti Rahmawati, S.Pd.SD',
    gambar: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'brt-3',
    judul: 'Penyaluran Program Sarapan Sehat dan Susu Bergizi untuk Seluruh Murid',
    ringkasan: 'Program rutin peningkatan gizi anak sekolah disambut antusias oleh seluruh siswa kelas 1 hingga 6.',
    isi: 'Sebagai wujud kepedulian terhadap kesehatan dan fokus belajar anak, sekolah bekerja sama dengan Puskesmas setempat mengadakan program sarapan sehat dan edukasi cuci tangan pakai sabun (CTPS). Kegiatan ini diharapkan memperkuat imun serta daya konsentrasi siswa dalam menyerap pelajaran.',
    kategori: 'Kesehatan',
    tanggal: '2025-04-22',
    penulis: 'Cecep Sunandar, S.Pd.',
    gambar: 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=800&q=80',
  },
];

const INITIAL_GALERI: GaleriItem[] = [
  {
    id: 'glr-1',
    judul: 'Upacara Bendera Hari Senin Pagi',
    kategori: 'Upacara',
    tanggal: '2025-05-26',
    gambar: 'https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'glr-2',
    judul: 'Pembelajaran Interaktif di Kelas Digital',
    kategori: 'Akademik',
    tanggal: '2025-05-18',
    gambar: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'glr-3',
    judul: 'Latihan Olahraga dan Senam Kesegaran Jasmani',
    kategori: 'Olahraga',
    tanggal: '2025-05-12',
    gambar: 'https://images.unsplash.com/photo-1472162072942-cd5147eb3902?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'glr-4',
    judul: 'Latihan Pramuka Siaga dan Penggalang',
    kategori: 'Ekstrakurikuler',
    tanggal: '2025-05-08',
    gambar: 'https://images.unsplash.com/photo-1511556532299-8f662fc26c06?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'glr-5',
    judul: 'Literasi Membaca di Pojok Baca Sekolah',
    kategori: 'Literasi',
    tanggal: '2025-04-29',
    gambar: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'glr-6',
    judul: 'Pameran Karya Seni Rupa Siswa',
    kategori: 'Seni Budaya',
    tanggal: '2025-04-15',
    gambar: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=800&q=80',
  },
];

const INITIAL_SETTINGS: AppSettings = {
  tahunAjaranAktif: '2024/2025',
  semesterAktif: 'Genap',
  bobotTugas: 20,
  bobotUlangan: 20,
  bobotPts: 25,
  bobotPasSas: 25,
  bobotProyek: 10,
};

// Seed today's attendance for immediate lively dashboard
const getTodayStr = () => new Date().toISOString().split('T')[0];

const INITIAL_ABSENSI_SISWA: AbsensiSiswa[] = [
  {
    id: 'abs-s-1',
    siswaId: 'stu-1',
    qrId: 'STU-00001',
    namaSiswa: 'Aditya Pratama Putra',
    kelas: 'Kelas 1A',
    tanggal: getTodayStr(),
    jam: '06:42:15',
    status: 'Hadir',
  },
  {
    id: 'abs-s-2',
    siswaId: 'stu-2',
    qrId: 'STU-00002',
    namaSiswa: 'Aisyah Putri Rahmadani',
    kelas: 'Kelas 1A',
    tanggal: getTodayStr(),
    jam: '06:45:30',
    status: 'Hadir',
  },
  {
    id: 'abs-s-3',
    siswaId: 'stu-3',
    qrId: 'STU-00003',
    namaSiswa: 'Bilal Al-Ghifari',
    kelas: 'Kelas 1A',
    tanggal: getTodayStr(),
    jam: '06:50:11',
    status: 'Hadir',
  },
  {
    id: 'abs-s-4',
    siswaId: 'stu-4',
    qrId: 'STU-00004',
    namaSiswa: 'Cantika Dewi Anggraeni',
    kelas: 'Kelas 1A',
    tanggal: getTodayStr(),
    jam: '07:18:22',
    status: 'Terlambat',
    keterangan: 'Macet di Pasar Ciparay',
  },
  {
    id: 'abs-s-5',
    siswaId: 'stu-5',
    qrId: 'STU-00005',
    namaSiswa: 'Daffa Rizki Ramadhan',
    kelas: 'Kelas 1A',
    tanggal: getTodayStr(),
    jam: '07:05:00',
    status: 'Sakit',
    keterangan: 'Surat dokter demam',
  },
  {
    id: 'abs-s-6',
    siswaId: 'stu-8',
    qrId: 'STU-00008',
    namaSiswa: 'Gilang Ramadhan',
    kelas: 'Kelas 2',
    tanggal: getTodayStr(),
    jam: '06:40:10',
    status: 'Hadir',
  },
  {
    id: 'abs-s-7',
    siswaId: 'stu-12',
    qrId: 'STU-00012',
    namaSiswa: 'Kenzie Alvaro Raditya',
    kelas: 'Kelas 6',
    tanggal: getTodayStr(),
    jam: '06:35:45',
    status: 'Hadir',
  },
];

const INITIAL_ABSENSI_GURU: AbsensiGuru[] = [
  {
    id: 'abs-g-1',
    guruId: 'tch-1',
    qrId: 'TCH-00001',
    namaGuru: 'Siti Rahmawati, S.Pd.SD',
    tanggal: getTodayStr(),
    jamMasuk: '06:30:15',
    jamPulang: undefined,
    status: 'Hadir',
  },
  {
    id: 'abs-g-2',
    guruId: 'tch-2',
    qrId: 'TCH-00002',
    namaGuru: 'Budi Santoso, S.Pd.',
    tanggal: getTodayStr(),
    jamMasuk: '06:25:00',
    jamPulang: undefined,
    status: 'Hadir',
  },
  {
    id: 'abs-g-3',
    guruId: 'tch-3',
    qrId: 'TCH-00003',
    namaGuru: 'Asep Saepuloh, S.Pd.I',
    tanggal: getTodayStr(),
    jamMasuk: '06:40:22',
    jamPulang: undefined,
    status: 'Hadir',
  },
];

// Initial scores for student 1 & 2
const INITIAL_NILAI: NilaiSiswa[] = [
  {
    id: 'nil-1',
    siswaId: 'stu-1',
    mapelId: 'mp-1',
    kelas: 'Kelas 1A',
    tahunAjaran: '2024/2025',
    semester: 'Genap',
    tugas: 88,
    ulangan: 85,
    pts: 90,
    pasSas: 88,
    proyek: 90,
    nilaiAkhir: 88,
    deskripsi: 'Menunjukkan penguasaan sangat baik dalam mengenal huruf hijaiyah dan melafalkan doa harian dengan tartil.',
  },
  {
    id: 'nil-2',
    siswaId: 'stu-1',
    mapelId: 'mp-2',
    kelas: 'Kelas 1A',
    tahunAjaran: '2024/2025',
    semester: 'Genap',
    tugas: 85,
    ulangan: 82,
    pts: 86,
    pasSas: 88,
    proyek: 85,
    nilaiAkhir: 85,
    deskripsi: 'Menunjukkan pemahaman yang baik mengenai simbol-simbol sila Pancasila dan penerapannya di kelas.',
  },
  {
    id: 'nil-3',
    siswaId: 'stu-1',
    mapelId: 'mp-3',
    kelas: 'Kelas 1A',
    tahunAjaran: '2024/2025',
    semester: 'Genap',
    tugas: 90,
    ulangan: 92,
    pts: 88,
    pasSas: 94,
    proyek: 90,
    nilaiAkhir: 91,
    deskripsi: 'Sangat terampil membaca kalimat sederhana dan menceritakan kembali cerita fabel dengan percaya diri.',
  },
  {
    id: 'nil-4',
    siswaId: 'stu-1',
    mapelId: 'mp-4',
    kelas: 'Kelas 1A',
    tahunAjaran: '2024/2025',
    semester: 'Genap',
    tugas: 84,
    ulangan: 80,
    pts: 85,
    pasSas: 82,
    proyek: 85,
    nilaiAkhir: 83,
    deskripsi: 'Mampu menjumlahkan dan mengurangkan bilangan cacah sampai 20 dengan bantuan benda konkret.',
  },
  {
    id: 'nil-5',
    siswaId: 'stu-1',
    mapelId: 'mp-5',
    kelas: 'Kelas 1A',
    tahunAjaran: '2024/2025',
    semester: 'Genap',
    tugas: 88,
    ulangan: 86,
    pts: 90,
    pasSas: 88,
    proyek: 90,
    nilaiAkhir: 88,
    deskripsi: 'Sangat baik dalam mengamati dan menjelaskan bagian-bagian tubuh tumbuhan di taman sekolah.',
  },
  {
    id: 'nil-6',
    siswaId: 'stu-1',
    mapelId: 'mp-6',
    kelas: 'Kelas 1A',
    tahunAjaran: '2024/2025',
    semester: 'Genap',
    tugas: 85,
    ulangan: 88,
    pts: 85,
    pasSas: 87,
    proyek: 85,
    nilaiAkhir: 86,
    deskripsi: 'Mampu mempraktikkan gerak dasar lokomotor seperti berlari dan melompat dengan koordinasi baik.',
  },
  {
    id: 'nil-7',
    siswaId: 'stu-1',
    mapelId: 'mp-7',
    kelas: 'Kelas 1A',
    tahunAjaran: '2024/2025',
    semester: 'Genap',
    tugas: 92,
    ulangan: 90,
    pts: 90,
    pasSas: 90,
    proyek: 95,
    nilaiAkhir: 91,
    deskripsi: 'Sangat kreatif dalam membuat kolase dari bahan alam daun kering dan mewarnai pola geometri.',
  },
  {
    id: 'nil-8',
    siswaId: 'stu-1',
    mapelId: 'mp-8',
    kelas: 'Kelas 1A',
    tahunAjaran: '2024/2025',
    semester: 'Genap',
    tugas: 86,
    ulangan: 84,
    pts: 85,
    pasSas: 88,
    proyek: 86,
    nilaiAkhir: 86,
    deskripsi: 'Mikawanoh kecap-kecap basa Sunda sapopoé sarta apal kakawihan barudak kalayan sumanget.',
  },
];

const INITIAL_CATATAN_RAPOR: CatatanRapor[] = [
  {
    id: 'cat-1',
    siswaId: 'stu-1',
    tahunAjaran: '2024/2025',
    semester: 'Genap',
    sakit: 1,
    izin: 0,
    alpa: 0,
    catatanWaliKelas: 'Ananda Aditya memiliki semangat belajar yang tinggi dan aktif dalam kegiatan kelas. Pertahankan prestasimu dan tetap santun kepada orang tua serta guru.',
    keputusan: 'Naik ke Kelas 2 (Dua)',
  },
];

const INITIAL_LANDING_CONFIG: LandingConfig = {
  heroBadge: 'Portal Resmi Sekolah Digital',
  heroTagline: 'Mewujudkan Generasi Cerdas Berkarakter & Unggul Berbasis Teknologi',
  heroDescription:
    'Menumbuhkan insan beriman, berakhlak mulia, cerdas bernalar kritis, dan unggul dalam prestasi dengan dukungan pembelajaran digital ramah anak berbasis Kurikulum Merdeka.',
  heroCtaText: 'Masuk Portal Guru & Admin',
  heroSecondaryCtaText: 'Jelajahi Profil Sekolah',
  showRunningText: true,
  runningText:
    'Selamat Datang di Portal Resmi Sekolah. Sistem Presensi Digital QR Code Presisi & e-Rapor Kurikulum Merdeka Aktif.',
  showStatistik: true,
  showSambutan: true,
  showProfil: true,
  showBerita: true,
  showPengumuman: true,
  showGuru: true,
  showGaleri: true,
  showKontak: true,
};

const INITIAL_SCHOOL_ACCOUNTS: SchoolAccount[] = [
  {
    id: 'sch-1',
    namaSekolah: 'Satuan Pendidikan',
    npsn: '20204512',
    username: 'operator',
    password: 'operator123',
    status: 'aktif',
    createdAt: '2024-01-01T08:00:00.000Z',
    lastLogin: '2026-09-10T08:30:00.000Z',
    kontak: '081223344556',
    email: 'info@sekolah.sch.id',
    keterangan: 'Akun Utama Administrator Sekolah',
  },
];

const INITIAL_SUPERADMIN: SuperAdminUser = {
  id: 'sa-root',
  username: 'superadmin',
  password: 'superadmin123',
  name: 'Super Administrator',
  role: 'superadmin',
};

const INITIAL_SUPERADMIN_LOGS: SuperAdminLog[] = [
  {
    id: 'log-init',
    timestamp: new Date().toISOString(),
    action: 'create_school',
    schoolId: 'sch-1',
    schoolName: 'Satuan Pendidikan',
    description: 'Sistem Super Admin diinisialisasi untuk pengelolaan multi-sekolah.',
  },
];

class DatabaseService {
  
  private cache: Map<string, unknown> = new Map();
  private firestoreUnsubs: (() => void)[] = [];

  private async syncToFirestore(schoolId: string, collectionName: string, item: any) {
    try {
      await setDoc(doc(firestoreDb, `schools/${schoolId}/${collectionName}`, item.id), item);
    } catch (e) {
      console.error('Firestore sync error:', e);
    }
  }

  private async deleteFromFirestore(schoolId: string, collectionName: string, itemId: string) {
    try {
      await deleteDoc(doc(firestoreDb, `schools/${schoolId}/${collectionName}`, itemId));
    } catch (e) {
      console.error('Firestore delete error:', e);
    }
  }

  initFirestore(schoolId: string) {
    // Clear old listeners
    this.firestoreUnsubs.forEach(unsub => unsub());
    this.firestoreUnsubs = [];

    
    const collectionsMap: Record<string, string> = {
      [STORAGE_KEYS.SISWA]: 'siswa',
      [STORAGE_KEYS.GURU]: 'guru',
      [STORAGE_KEYS.KELAS]: 'kelas',
      [STORAGE_KEYS.MAPEL]: 'mapel',
      [STORAGE_KEYS.ABSENSI_SISWA]: 'absensi_siswa',
      [STORAGE_KEYS.ABSENSI_GURU]: 'absensi_guru',
      [STORAGE_KEYS.NILAI]: 'nilai',
      [STORAGE_KEYS.NILAI_HARIAN]: 'nilai_harian',
      [STORAGE_KEYS.CATATAN_RAPOR]: 'catatan_rapor',
      [STORAGE_KEYS.PENGUMUMAN]: 'pengumuman',
      [STORAGE_KEYS.BERITA]: 'berita',
      [STORAGE_KEYS.GALERI]: 'galeri',
      [STORAGE_KEYS.KAS]: 'kas',
      [STORAGE_KEYS.USERS]: 'users',
      [STORAGE_KEYS.SETTINGS]: 'settings'
    };

    Object.entries(collectionsMap).forEach(([storageKey, colName]) => {
      const q = query(collection(firestoreDb, `schools/${schoolId}/${colName}`));
      const unsub = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(d => d.data());
        const actualKey = this.getSchoolScopedKey(schoolId, storageKey);
        this.cache.set(actualKey, list);
        localStorage.setItem(actualKey, JSON.stringify(list));
        window.dispatchEvent(new Event(`data_${colName}_changed`));
      });
      this.firestoreUnsubs.push(unsub);
    });

    // Special global listeners for SuperAdmin data
    if (schoolId === 'superadmin') {
       const qSchools = query(collection(firestoreDb, `schools/superadmin/school_accounts`));
       const unsubSchools = onSnapshot(qSchools, (snapshot) => {
         const list = snapshot.docs.map(d => d.data());
         this.cache.set(STORAGE_KEYS.SCHOOL_ACCOUNTS, list);
         localStorage.setItem(STORAGE_KEYS.SCHOOL_ACCOUNTS, JSON.stringify(list));
         window.dispatchEvent(new Event('school_accounts_changed'));
       });
       this.firestoreUnsubs.push(unsubSchools);
    }

  }


  getActiveSchoolId(): string {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_SCHOOL_ID) || 'sch-1';
  }

  setActiveSchoolId(schoolId: string): void {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_SCHOOL_ID, schoolId);
    this.cache.clear();
    this.initFirestore(schoolId);
    window.dispatchEvent(new CustomEvent('school_changed', { detail: schoolId }));
  }

  private isSchoolScopedKey(key: string): boolean {
    if (
      key === STORAGE_KEYS.SCHOOL_ACCOUNTS ||
      key === STORAGE_KEYS.SUPERADMIN_USER ||
      key === STORAGE_KEYS.SUPERADMIN_LOGS ||
      key === STORAGE_KEYS.SUPERADMIN_AUTH ||
      key === STORAGE_KEYS.ACTIVE_SCHOOL_ID ||
      key === STORAGE_KEYS.AUTH_USER
    ) {
      return false;
    }
    return true;
  }

  getSchoolScopedKey(schoolId: string, baseKey: string): string {
    if (!this.isSchoolScopedKey(baseKey)) return baseKey;
    if (baseKey.startsWith('school_')) return baseKey;
    if (schoolId === 'sch-1') return baseKey;
    const suffix = baseKey.replace('sdn2_', '');
    return `school_${schoolId}_${suffix}`;
  }

  private resolveStorageKey(key: string): string {
    if (!this.isSchoolScopedKey(key)) {
      return key;
    }
    if (key.startsWith('school_')) {
      return key;
    }
    const activeId = this.getActiveSchoolId();
    if (!activeId || activeId === 'sch-1') {
      return key;
    }
    const suffix = key.replace('sdn2_', '');
    return `school_${activeId}_${suffix}`;
  }

  getItemForSchool<T>(schoolId: string, key: string, defaultValue: T): T {
    const actualKey = this.getSchoolScopedKey(schoolId, key);
    if (this.cache.has(actualKey)) {
      return this.cache.get(actualKey) as T;
    }
    try {
      const data = localStorage.getItem(actualKey);
      if (!data) {
        let fallback = defaultValue;
        if (schoolId !== 'sch-1' && this.isSchoolScopedKey(key)) {
          if (
            key === STORAGE_KEYS.SISWA ||
            key === STORAGE_KEYS.GURU ||
            key === STORAGE_KEYS.KAS ||
            key === STORAGE_KEYS.ABSENSI_SISWA ||
            key === STORAGE_KEYS.ABSENSI_GURU ||
            key === STORAGE_KEYS.NILAI ||
            key === STORAGE_KEYS.CATATAN_RAPOR ||
            key === STORAGE_KEYS.PENGUMUMAN ||
            key === STORAGE_KEYS.BERITA ||
            key === STORAGE_KEYS.GALERI
          ) {
            fallback = [] as unknown as T;
          }
        }
        this.cache.set(actualKey, fallback);
        return fallback;
      }
      const parsed = JSON.parse(data) as T;
      this.cache.set(actualKey, parsed);
      return parsed;
    } catch {
      return defaultValue;
    }
  }

  setItemForSchool<T>(schoolId: string, key: string, value: T): void {
    const actualKey = this.getSchoolScopedKey(schoolId, key);
    this.cache.set(actualKey, value);
    try {
      localStorage.setItem(actualKey, JSON.stringify(value));
    } catch (e) {
      console.error('Storage error:', e);
    }
  }

  getUsersForSchool(schoolId: string): User[] {
    return this.getItemForSchool<User[]>(schoolId, STORAGE_KEYS.USERS, []);
  }

  private getItem<T>(key: string, defaultValue: T): T {
    const actualKey = this.resolveStorageKey(key);
    if (this.cache.has(actualKey)) {
      const cached = this.cache.get(actualKey);
      if (Array.isArray(cached)) {
        return [...cached] as unknown as T;
      }
      return cached as T;
    }
    try {
      const data = localStorage.getItem(actualKey);
      if (!data) {
        let fallback = defaultValue;
        if (this.getActiveSchoolId() !== 'sch-1' && this.isSchoolScopedKey(key)) {
          if (
            key === STORAGE_KEYS.SISWA ||
            key === STORAGE_KEYS.GURU ||
            key === STORAGE_KEYS.KAS ||
            key === STORAGE_KEYS.ABSENSI_SISWA ||
            key === STORAGE_KEYS.ABSENSI_GURU ||
            key === STORAGE_KEYS.NILAI ||
            key === STORAGE_KEYS.CATATAN_RAPOR ||
            key === STORAGE_KEYS.PENGUMUMAN ||
            key === STORAGE_KEYS.BERITA ||
            key === STORAGE_KEYS.GALERI
          ) {
            fallback = [] as unknown as T;
          }
        }
        this.cache.set(actualKey, fallback);
        return Array.isArray(fallback) ? ([...fallback] as unknown as T) : fallback;
      }
      const parsed = JSON.parse(data) as T;
      this.cache.set(actualKey, parsed);
      return Array.isArray(parsed) ? ([...parsed] as unknown as T) : parsed;
    } catch {
      return defaultValue;
    }
  }

  
  
  private setItem<T>(key: string, value: T): void {
    const actualKey = this.resolveStorageKey(key);
    
    // FIRESTORE SYNC LOGIC
    let schoolId = 'superadmin';
    let colName = '';

    if (!this.isSchoolScopedKey(key)) {
       // Global keys
       colName = key.replace('sdn2_', ''); // e.g. 'school_accounts'
    } else {
       // Scoped keys like school_sch-1_users
       const match = actualKey.match(/^school_(.+?)_(.+)$/);
       if (match) {
          schoolId = match[1];
          colName = match[2];
       } else {
          // fallback
          colName = actualKey.replace('sdn2_', '');
          schoolId = this.getActiveSchoolId();
       }
    }

    if (colName === 'absensi_siswa' || colName === 'kas' || colName === 'siswa' || colName === 'guru' || colName === 'kelas' || colName === 'mapel' || colName === 'nilai' || colName === 'nilai_harian' || colName === 'catatan_rapor' || colName === 'pengumuman' || colName === 'berita' || colName === 'galeri' || colName === 'users' || colName === 'school_accounts') {
      if (Array.isArray(value)) {
        const previous = (this.cache.get(actualKey) as any[]) || [];
        
        value.forEach((item: any) => {
           if (!item || !item.id) return;
           const prevItem = previous.find((p: any) => p.id === item.id);
           if (!prevItem || JSON.stringify(prevItem) !== JSON.stringify(item)) {
              this.syncToFirestore(schoolId, colName, item);
           }
        });
        
        previous.forEach((prevItem: any) => {
           if (!prevItem || !prevItem.id) return;
           const exists = value.find((v: any) => v.id === prevItem.id);
           if (!exists) {
              this.deleteFromFirestore(schoolId, colName, prevItem.id);
           }
        });
      }
    } else if (colName === 'settings' || colName === 'landing_config') {
       this.syncToFirestore(schoolId, colName, { ...(value as any), id: 'default' });
    }

    this.cache.set(actualKey, Array.isArray(value) ? [...value] : value);
    try {
      localStorage.setItem(actualKey, JSON.stringify(value));
    } catch (e) {
      console.error('Storage error:', e);
    }
  }



  // Initializer
  init(): void {
    this.initFirestore(this.getActiveSchoolId());
    this.initFirestore('superadmin');
    if (!localStorage.getItem(STORAGE_KEYS.SEKOLAH)) {
      this.setItem(STORAGE_KEYS.SEKOLAH, INITIAL_SEKOLAH);
    }
    if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
      this.setItem(STORAGE_KEYS.USERS, INITIAL_USERS);
    }
    if (!localStorage.getItem(STORAGE_KEYS.SISWA)) {
      this.setItem(STORAGE_KEYS.SISWA, INITIAL_SISWA);
    }
    if (!localStorage.getItem(STORAGE_KEYS.GURU)) {
      this.setItem(STORAGE_KEYS.GURU, INITIAL_GURU);
    }
    if (!localStorage.getItem(STORAGE_KEYS.KELAS)) {
      this.setItem(STORAGE_KEYS.KELAS, INITIAL_KELAS);
    }
    if (!localStorage.getItem(STORAGE_KEYS.MAPEL)) {
      this.setItem(STORAGE_KEYS.MAPEL, INITIAL_MAPEL);
    }
    if (!localStorage.getItem(STORAGE_KEYS.PENGUMUMAN)) {
      this.setItem(STORAGE_KEYS.PENGUMUMAN, INITIAL_PENGUMUMAN);
    }
    if (!localStorage.getItem(STORAGE_KEYS.BERITA)) {
      this.setItem(STORAGE_KEYS.BERITA, INITIAL_BERITA);
    }
    if (!localStorage.getItem(STORAGE_KEYS.GALERI)) {
      this.setItem(STORAGE_KEYS.GALERI, INITIAL_GALERI);
    }
    if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
      this.setItem(STORAGE_KEYS.SETTINGS, INITIAL_SETTINGS);
    }
    if (!localStorage.getItem(STORAGE_KEYS.ABSENSI_SISWA)) {
      this.setItem(STORAGE_KEYS.ABSENSI_SISWA, INITIAL_ABSENSI_SISWA);
    }
    if (!localStorage.getItem(STORAGE_KEYS.ABSENSI_GURU)) {
      this.setItem(STORAGE_KEYS.ABSENSI_GURU, INITIAL_ABSENSI_GURU);
    }
    if (!localStorage.getItem(STORAGE_KEYS.NILAI)) {
      this.setItem(STORAGE_KEYS.NILAI, INITIAL_NILAI);
    }
    if (!localStorage.getItem(STORAGE_KEYS.CATATAN_RAPOR)) {
      this.setItem(STORAGE_KEYS.CATATAN_RAPOR, INITIAL_CATATAN_RAPOR);
    }
    if (!localStorage.getItem(STORAGE_KEYS.LANDING_CONFIG)) {
      this.setItem(STORAGE_KEYS.LANDING_CONFIG, INITIAL_LANDING_CONFIG);
    }
    if (!localStorage.getItem(STORAGE_KEYS.SCHOOL_ACCOUNTS)) {
      this.setItem(STORAGE_KEYS.SCHOOL_ACCOUNTS, INITIAL_SCHOOL_ACCOUNTS);
    }
    if (!localStorage.getItem(STORAGE_KEYS.SUPERADMIN_USER)) {
      this.setItem(STORAGE_KEYS.SUPERADMIN_USER, INITIAL_SUPERADMIN);
    }
    if (!localStorage.getItem(STORAGE_KEYS.SUPERADMIN_LOGS)) {
      this.setItem(STORAGE_KEYS.SUPERADMIN_LOGS, INITIAL_SUPERADMIN_LOGS);
    }

    // Auto-update to generic multi-school branding
    const currentSekolah = this.getItem<SekolahInfo | null>(STORAGE_KEYS.SEKOLAH, null);
    if (currentSekolah) {
      let updated = false;
      if (currentSekolah.nama && currentSekolah.nama.toUpperCase().includes('GIRIHARJA')) {
        currentSekolah.nama = 'Satuan Pendidikan';
        currentSekolah.alamat = 'Jl. Pendidikan No. 45';
        currentSekolah.desa = 'Sukamaju';
        currentSekolah.kecamatan = 'Cerdas';
        currentSekolah.email = 'info@sekolah.sch.id';
        currentSekolah.sambutan = currentSekolah.sambutan?.replace(/Nama Sekolah Anda/gi, 'Satuan Pendidikan') || '';
        currentSekolah.profilSingkat = currentSekolah.profilSingkat?.replace(/Nama Sekolah Anda/gi, 'Satuan Pendidikan') || '';
        currentSekolah.sejarah = currentSekolah.sejarah?.replace(/Nama Sekolah Anda/gi, 'Satuan Pendidikan') || '';
        updated = true;
      }
      if (!currentSekolah.logo || currentSekolah.logo.includes('xmlns') || currentSekolah.logo.includes('data:image')) {
        currentSekolah.logo = '/logo.svg';
        updated = true;
      }
      if (updated) {
        this.setItem(STORAGE_KEYS.SEKOLAH, currentSekolah);
      }
    }

    // Clean any old accounts with Giriharja
    const accounts = this.getItem<SchoolAccount[] | null>(STORAGE_KEYS.SCHOOL_ACCOUNTS, null);
    if (accounts) {
      let changed = false;
      accounts.forEach((acc) => {
        if (acc.namaSekolah && acc.namaSekolah.toUpperCase().includes('GIRIHARJA')) {
          acc.namaSekolah = 'Satuan Pendidikan';
          acc.keterangan = 'Akun Utama Administrator Sekolah';
          acc.email = 'info@sekolah.sch.id';
          changed = true;
        }
      });
      if (changed) {
        this.setItem(STORAGE_KEYS.SCHOOL_ACCOUNTS, accounts);
      }
    }
  }

  // Sekolah Profile
  getSekolah(): SekolahInfo {
    const activeId = this.getActiveSchoolId();
    let defaultInfo = INITIAL_SEKOLAH;
    if (activeId !== 'sch-1') {
      const account = this.getSchoolAccountById(activeId);
      if (account) {
        defaultInfo = {
          ...INITIAL_SEKOLAH,
          nama: account.namaSekolah,
          npsn: account.npsn,
          nss: '1010' + account.npsn.slice(-6),
          email: account.email || `${account.username}@sekolah.id`,
          telepon: account.kontak || '',
          alamat: account.keterangan || '',
          sambutan: `Selamat datang di website resmi ${account.namaSekolah}.`,
          profilSingkat: `${account.namaSekolah} berkomitmen menghadirkan pendidikan berkualitas dan berkarakter.`,
        };
      }
    }
    return this.getItem<SekolahInfo>(STORAGE_KEYS.SEKOLAH, defaultInfo);
  }

  updateSekolah(data: Partial<SekolahInfo>): SekolahInfo {
    const current = this.getSekolah();
    const updated = { ...current, ...data };
    this.setItem(STORAGE_KEYS.SEKOLAH, updated);
    window.dispatchEvent(new CustomEvent('sekolah_updated', { detail: updated }));
    return updated;
  }

  // Users & Auth
  getUsers(): User[] {
    const activeId = this.getActiveSchoolId();
    let defaultUsers = INITIAL_USERS;
    if (activeId !== 'sch-1') {
      const account = this.getSchoolAccountById(activeId);
      defaultUsers = account
        ? [
            {
              id: `usr-${account.id}-admin`,
              username: account.username,
              password: account.password,
              name: `Operator ${account.namaSekolah}`,
              role: 'admin',
            },
          ]
        : [];
    }
    return this.getItem<User[]>(STORAGE_KEYS.USERS, defaultUsers);
  }

  saveUser(user: User): void {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === user.id);
    if (idx >= 0) {
      users[idx] = user;
    } else {
      users.push(user);
    }
    this.setItem(STORAGE_KEYS.USERS, users);
    
    // If the current user is updated, update the session
    const currentUser = this.getCurrentUser();
    if (currentUser?.id === user.id) {
      this.setCurrentUser(user);
    }
  }

  deleteUser(id: string): void {
    const users = this.getUsers().filter(u => u.id !== id);
    this.setItem(STORAGE_KEYS.USERS, users);
  }

  getCurrentUser(): User | null {
    const user = this.getItem<User | null>(STORAGE_KEYS.AUTH_USER, null);
    if (user) return user;
    
    // Graceful fallback to active school operator
    const activeId = this.getActiveSchoolId();
    const account = this.getSchoolAccountById(activeId);
    if (account) {
      return {
        id: `usr-${account.id}-admin`,
        username: account.username,
        password: account.password,
        name: `Operator ${account.namaSekolah}`,
        role: 'admin',
      };
    }
    return null;
  }

  setCurrentUser(user: User | null): void {
    this.setItem(STORAGE_KEYS.AUTH_USER, user);
    window.dispatchEvent(new CustomEvent('auth_changed', { detail: user }));
    window.dispatchEvent(new Event('auth_state_changed'));
  }

  logout(): void {
    this.setCurrentUser(null);
  }

  // Siswa
  getSiswaList(): Siswa[] {
    return this.getItem<Siswa[]>(STORAGE_KEYS.SISWA, INITIAL_SISWA);
  }

  getSiswaById(id: string): Siswa | undefined {
    return this.getSiswaList().find((s) => s.id === id || s.qrId === id);
  }

  saveSiswa(siswa: Siswa): Siswa {
    const list = this.getSiswaList();
    const idx = list.findIndex((s) => s.id === siswa.id);
    if (idx >= 0) {
      list[idx] = siswa;
    } else {
      list.unshift(siswa);
    }
    this.setItem(STORAGE_KEYS.SISWA, list);
    window.dispatchEvent(new Event('data_siswa_changed'));
    return siswa;
  }

  saveManySiswa(newSiswaList: Siswa[]): void {
    const list = this.getSiswaList();
    const updated = [...newSiswaList, ...list];
    this.setItem(STORAGE_KEYS.SISWA, updated);
    window.dispatchEvent(new Event('data_siswa_changed'));
  }

  deleteSiswa(id: string): void {
    const list = this.getSiswaList().filter((s) => s.id !== id);
    this.setItem(STORAGE_KEYS.SISWA, list);
    window.dispatchEvent(new Event('data_siswa_changed'));
  }

  // Guru
  getGuruList(): Guru[] {
    return this.getItem<Guru[]>(STORAGE_KEYS.GURU, INITIAL_GURU);
  }

  getGuruById(id: string): Guru | undefined {
    return this.getGuruList().find((g) => g.id === id || g.qrId === id);
  }

  saveGuru(guru: Guru, account?: { username?: string, password?: string }): Guru {
    const list = this.getGuruList();
    const idx = list.findIndex((g) => g.id === guru.id);
    if (idx >= 0) {
      list[idx] = guru;
    } else {
      list.push(guru);
    }
    this.setItem(STORAGE_KEYS.GURU, list);

    // Automatically create or update a user account for the guru
    const users = this.getUsers();
    const userIdx = users.findIndex((u) => u.guruId === guru.id);
    
    if (userIdx >= 0) {
      users[userIdx] = { 
        ...users[userIdx], 
        name: guru.nama, 
        nip: guru.nip,
        ...(account?.username ? { username: account.username } : {}),
        ...(account?.password ? { password: account.password } : {})
      };
    } else {
      const defaultUsername = account?.username || (guru.nip ? guru.nip.replace(/\s/g, '') : `guru_${guru.id.replace('tch-', '')}`);
      const defaultPassword = account?.password || (guru.nip ? guru.nip.replace(/\s/g, '') : 'guru123');
      users.push({
        id: `usr-${Date.now()}`,
        username: defaultUsername,
        password: defaultPassword,
        name: guru.nama,
        role: 'guru',
        nip: guru.nip,
        guruId: guru.id,
      });
    }
    this.setItem(STORAGE_KEYS.USERS, users);

    window.dispatchEvent(new Event('data_guru_changed'));
    return guru;
  }

  deleteGuru(id: string): void {
    const list = this.getGuruList().filter((g) => g.id !== id);
    this.setItem(STORAGE_KEYS.GURU, list);
    
    // Delete associated user account
    const users = this.getUsers().filter((u) => u.guruId !== id);
    this.setItem(STORAGE_KEYS.USERS, users);
    
    window.dispatchEvent(new Event('data_guru_changed'));
  }

  // Kelas & Mapel
  getKelasList(): Kelas[] {
    return this.getItem<Kelas[]>(STORAGE_KEYS.KELAS, INITIAL_KELAS);
  }

  saveKelas(kelas: Kelas): void {
    const list = this.getKelasList();
    const idx = list.findIndex((k) => k.id === kelas.id);
    if (idx >= 0) list[idx] = kelas;
    else list.push(kelas);
    this.setItem(STORAGE_KEYS.KELAS, list);
    window.dispatchEvent(new Event('data_kelas_changed'));
  }

  deleteKelas(id: string): void {
    const list = this.getKelasList().filter((k) => k.id !== id);
    this.setItem(STORAGE_KEYS.KELAS, list);
    window.dispatchEvent(new Event('data_kelas_changed'));
  }

  getMapelList(): MataPelajaran[] {
    return this.getItem<MataPelajaran[]>(STORAGE_KEYS.MAPEL, INITIAL_MAPEL);
  }

  saveMapel(mapel: MataPelajaran): void {
    const list = this.getMapelList();
    const idx = list.findIndex((m) => m.id === mapel.id);
    if (idx >= 0) list[idx] = mapel;
    else list.push(mapel);
    this.setItem(STORAGE_KEYS.MAPEL, list);
    window.dispatchEvent(new Event('data_mapel_changed'));
  }

  deleteMapel(id: string): void {
    const list = this.getMapelList().filter((m) => m.id !== id);
    this.setItem(STORAGE_KEYS.MAPEL, list);
    window.dispatchEvent(new Event('data_mapel_changed'));
  }

  // Absensi Siswa
  getAbsensiSiswaList(): AbsensiSiswa[] {
    return this.getItem<AbsensiSiswa[]>(STORAGE_KEYS.ABSENSI_SISWA, INITIAL_ABSENSI_SISWA);
  }

  recordAbsensiSiswa(record: Omit<AbsensiSiswa, 'id'>): { success: boolean; message: string; data?: AbsensiSiswa } {
    const list = this.getAbsensiSiswaList();
    // Rule: Jangan mencatat absensi ganda pada hari yang sama
    const existing = list.find((a) => a.siswaId === record.siswaId && a.tanggal === record.tanggal);
    if (existing) {
      return {
        success: false,
        message: `Siswa "${record.namaSiswa}" sudah tercatat absen hari ini (${existing.status} pada ${existing.jam})!`,
        data: existing,
      };
    }

    const newRecord: AbsensiSiswa = {
      ...record,
      id: `abs-s-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    };

    list.unshift(newRecord);
    this.setItem(STORAGE_KEYS.ABSENSI_SISWA, list);
    window.dispatchEvent(new Event('absensi_siswa_updated'));
    return {
      success: true,
      message: 'Absensi berhasil dicatat!',
      data: newRecord,
    };
  }

  deleteAbsensiSiswa(id: string): void {
    const list = this.getAbsensiSiswaList().filter((a) => a.id !== id);
    this.setItem(STORAGE_KEYS.ABSENSI_SISWA, list);
    window.dispatchEvent(new Event('absensi_siswa_updated'));
  }

  // Absensi Guru
  getAbsensiGuruList(): AbsensiGuru[] {
    return this.getItem<AbsensiGuru[]>(STORAGE_KEYS.ABSENSI_GURU, INITIAL_ABSENSI_GURU);
  }

  recordAbsensiGuru(guru: Guru): { success: boolean; type: 'MASUK' | 'PULANG'; message: string; data?: AbsensiGuru } {
    const list = this.getAbsensiGuruList();
    const today = getTodayStr();
    const nowTime = new Date().toLocaleTimeString('id-ID', { hour12: false });

    // Find existing entry for today
    const existingIndex = list.findIndex((a) => a.guruId === guru.id && a.tanggal === today);

    if (existingIndex >= 0) {
      const existing = list[existingIndex];
      if (existing.jamPulang) {
        return {
          success: false,
          type: 'PULANG',
          message: `Bpk/Ibu ${guru.nama} sudah melakukan Absen Pulang hari ini pada jam ${existing.jamPulang}.`,
          data: existing,
        };
      }
      // Second scan = ABSEN PULANG
      existing.jamPulang = nowTime;
      list[existingIndex] = existing;
      this.setItem(STORAGE_KEYS.ABSENSI_GURU, list);
      window.dispatchEvent(new Event('absensi_guru_updated'));
      return {
        success: true,
        type: 'PULANG',
        message: `Absen Pulang berhasil dicatat pada ${nowTime}. Selamat beristirahat!`,
        data: existing,
      };
    }

    // First scan = ABSEN MASUK
    const isLate = nowTime > '07:15:00';
    const newRecord: AbsensiGuru = {
      id: `abs-g-${Date.now()}`,
      guruId: guru.id,
      qrId: guru.qrId,
      namaGuru: guru.nama,
      tanggal: today,
      jamMasuk: nowTime,
      status: isLate ? 'Terlambat' : 'Hadir',
    };

    list.unshift(newRecord);
    this.setItem(STORAGE_KEYS.ABSENSI_GURU, list);
    window.dispatchEvent(new Event('absensi_guru_updated'));
    return {
      success: true,
      type: 'MASUK',
      message: `Absen Masuk berhasil dicatat pada ${nowTime}. Selamat bertugas!`,
      data: newRecord,
    };
  }

  saveAbsensiGuru(rec: AbsensiGuru): void {
    const list = this.getAbsensiGuruList();
    const idx = list.findIndex((a) => a.id === rec.id);
    if (idx >= 0) list[idx] = rec;
    else list.unshift(rec);
    this.setItem(STORAGE_KEYS.ABSENSI_GURU, list);
    window.dispatchEvent(new Event('absensi_guru_updated'));
  }

  // Nilai & e-Rapor
  getNilaiList(): NilaiSiswa[] {
    return this.getItem<NilaiSiswa[]>(STORAGE_KEYS.NILAI, INITIAL_NILAI);
  }

  getNilaiBySiswa(siswaId: string): NilaiSiswa[] {
    return this.getNilaiList().filter((n) => n.siswaId === siswaId);
  }

  saveNilai(nilai: NilaiSiswa): NilaiSiswa {
    const list = this.getNilaiList();
    const idx = list.findIndex(
      (n) =>
        n.siswaId === nilai.siswaId &&
        n.mapelId === nilai.mapelId &&
        n.tahunAjaran === nilai.tahunAjaran &&
        n.semester === nilai.semester
    );
    if (idx >= 0) {
      list[idx] = nilai;
    } else {
      list.push(nilai);
    }
    this.setItem(STORAGE_KEYS.NILAI, list);
    window.dispatchEvent(new Event('nilai_updated'));
    return nilai;
  }

  getCatatanRaporList(): CatatanRapor[] {
    return this.getItem<CatatanRapor[]>(STORAGE_KEYS.CATATAN_RAPOR, INITIAL_CATATAN_RAPOR);
  }

  saveCatatanRapor(catatan: CatatanRapor): void {
    const list = this.getCatatanRaporList();
    const idx = list.findIndex(
      (c) =>
        c.siswaId === catatan.siswaId &&
        c.tahunAjaran === catatan.tahunAjaran &&
        c.semester === catatan.semester
    );
    if (idx >= 0) list[idx] = catatan;
    else list.push(catatan);
    this.setItem(STORAGE_KEYS.CATATAN_RAPOR, list);
    window.dispatchEvent(new Event('nilai_updated'));
  }

  // Pengumuman
  getPengumumanList(): Pengumuman[] {
    return this.getItem<Pengumuman[]>(STORAGE_KEYS.PENGUMUMAN, INITIAL_PENGUMUMAN);
  }

  savePengumuman(item: Pengumuman): void {
    const list = this.getPengumumanList();
    const idx = list.findIndex((p) => p.id === item.id);
    if (idx >= 0) list[idx] = item;
    else list.unshift(item);
    this.setItem(STORAGE_KEYS.PENGUMUMAN, list);
    window.dispatchEvent(new Event('pengumuman_updated'));
  }

  deletePengumuman(id: string): void {
    const list = this.getPengumumanList().filter((p) => p.id !== id);
    this.setItem(STORAGE_KEYS.PENGUMUMAN, list);
    window.dispatchEvent(new Event('pengumuman_updated'));
  }

  // Berita
  getBeritaList(): Berita[] {
    return this.getItem<Berita[]>(STORAGE_KEYS.BERITA, INITIAL_BERITA);
  }

  saveBerita(item: Berita): void {
    const list = this.getBeritaList();
    const idx = list.findIndex((b) => b.id === item.id);
    if (idx >= 0) list[idx] = item;
    else list.unshift(item);
    this.setItem(STORAGE_KEYS.BERITA, list);
    window.dispatchEvent(new Event('berita_updated'));
  }

  deleteBerita(id: string): void {
    const list = this.getBeritaList().filter((b) => b.id !== id);
    this.setItem(STORAGE_KEYS.BERITA, list);
    window.dispatchEvent(new Event('berita_updated'));
  }

  // Galeri
  getGaleriList(): GaleriItem[] {
    return this.getItem<GaleriItem[]>(STORAGE_KEYS.GALERI, INITIAL_GALERI);
  }

  saveGaleri(item: GaleriItem): void {
    const list = this.getGaleriList();
    const idx = list.findIndex((g) => g.id === item.id);
    if (idx >= 0) list[idx] = item;
    else list.unshift(item);
    this.setItem(STORAGE_KEYS.GALERI, list);
    window.dispatchEvent(new Event('galeri_updated'));
  }

  deleteGaleri(id: string): void {
    const list = this.getGaleriList().filter((g) => g.id !== id);
    this.setItem(STORAGE_KEYS.GALERI, list);
    window.dispatchEvent(new Event('galeri_updated'));
  }

  // Uang Kas
  getKasList(): TransaksiKas[] {
    return this.getItem<TransaksiKas[]>(STORAGE_KEYS.KAS, []);
  }

  saveKas(item: TransaksiKas): void {
    const list = [...this.getKasList()];
    const idx = list.findIndex((k) => k.id === item.id);
    if (idx >= 0) list[idx] = item;
    else list.unshift(item);
    this.setItem(STORAGE_KEYS.KAS, list);
    window.dispatchEvent(new Event('kas_updated'));
  }

  deleteKas(id: string): void {
    const list = this.getKasList().filter((k) => k.id !== id);
    this.setItem(STORAGE_KEYS.KAS, list);
    window.dispatchEvent(new Event('kas_updated'));
  }

  // Nilai Harian (Penilaian Harian Guru)
  getNilaiHarianList(): NilaiHarianItem[] {
    return this.getItem<NilaiHarianItem[]>(STORAGE_KEYS.NILAI_HARIAN, []);
  }

  saveNilaiHarian(item: NilaiHarianItem): void {
    const list = this.getNilaiHarianList();
    const idx = list.findIndex((n) => n.id === item.id);
    if (idx >= 0) list[idx] = item;
    else list.unshift(item);
    this.setItem(STORAGE_KEYS.NILAI_HARIAN, list);
    window.dispatchEvent(new Event('nilai_harian_updated'));
  }

  saveBulkNilaiHarian(items: NilaiHarianItem[]): void {
    const list = this.getNilaiHarianList();
    items.forEach((item) => {
      const idx = list.findIndex((n) => n.id === item.id);
      if (idx >= 0) list[idx] = item;
      else list.unshift(item);
    });
    this.setItem(STORAGE_KEYS.NILAI_HARIAN, list);
    window.dispatchEvent(new Event('nilai_harian_updated'));
  }

  deleteNilaiHarian(id: string): void {
    const list = this.getNilaiHarianList().filter((n) => n.id !== id);
    this.setItem(STORAGE_KEYS.NILAI_HARIAN, list);
    window.dispatchEvent(new Event('nilai_harian_updated'));
  }

  // App Settings & Unified Settings
  getSettings(): Settings {
    const sekolah = this.getSekolah();
    const appSettings = this.getItem<AppSettings>(STORAGE_KEYS.SETTINGS, INITIAL_SETTINGS);
    return {
      namaSekolah: sekolah.nama,
      npsn: sekolah.npsn,
      alamat: sekolah.alamat,
      desa: sekolah.desa || '',
      kecamatan: sekolah.kecamatan || '',
      kabupaten: sekolah.kabupaten || '',
      provinsi: sekolah.provinsi || '',
      kodePos: sekolah.kodePos || '',
      telepon: sekolah.telepon,
      email: sekolah.email,
      visi: sekolah.visi,
      misi: sekolah.misi,
      namaKepalaSekolah: sekolah.namaKepalaSekolah,
      nipKepalaSekolah: sekolah.nipKepalaSekolah,
      sambutanKepalaSekolah: sekolah.sambutan,
      fotoKepalaSekolah: sekolah.fotoKepalaSekolah || 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=400&q=80',
      fotoSekolah: sekolah.fotoSekolah || 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=1400&q=80',
      logoUrl: sekolah.logo || DEFAULT_SCHOOL_LOGO,
      tahunAjaranAktif: appSettings.tahunAjaranAktif,
      semesterAktif: appSettings.semesterAktif,
    };
  }

  saveSettings(settings: Settings): void {
    let derivedDesa = settings.desa;
    let derivedKecamatan = settings.kecamatan;
    let derivedKabupaten = settings.kabupaten;
    let derivedProvinsi = settings.provinsi;
    let derivedKodePos = settings.kodePos;

    // Auto-detect location if present in alamat and field wasn't customized
    const alamatLower = (settings.alamat || '').toLowerCase();
    const kecMatch = alamatLower.match(/kec(?:amatan)?\.?\s+([a-zA-Z\s]+?)(?:,|$|\bkab|\bdesa|\bprov)/i);
    if (kecMatch && (!derivedKecamatan || derivedKecamatan === 'Ciparay')) {
      derivedKecamatan = kecMatch[1].trim().replace(/\b\w/g, (l) => l.toUpperCase());
    }
    const kabMatch = alamatLower.match(/kab(?:upaten)?\.?\s+([a-zA-Z\s]+?)(?:,|$|\bprov|\bkec)/i);
    if (kabMatch && (!derivedKabupaten || derivedKabupaten === 'Kabupaten Bandung' || derivedKabupaten === 'Bandung')) {
      derivedKabupaten = kabMatch[1].trim().replace(/\b\w/g, (l) => l.toUpperCase());
    }

    this.updateSekolah({
      nama: settings.namaSekolah,
      npsn: settings.npsn,
      alamat: settings.alamat,
      desa: derivedDesa !== undefined ? derivedDesa : undefined,
      kecamatan: derivedKecamatan !== undefined ? derivedKecamatan : undefined,
      kabupaten: derivedKabupaten !== undefined ? derivedKabupaten : undefined,
      provinsi: derivedProvinsi !== undefined ? derivedProvinsi : undefined,
      kodePos: derivedKodePos !== undefined ? derivedKodePos : undefined,
      telepon: settings.telepon,
      email: settings.email,
      visi: settings.visi,
      misi: settings.misi,
      namaKepalaSekolah: settings.namaKepalaSekolah,
      nipKepalaSekolah: settings.nipKepalaSekolah,
      sambutan: settings.sambutanKepalaSekolah,
      fotoKepalaSekolah: settings.fotoKepalaSekolah,
      fotoSekolah: settings.fotoSekolah,
      logo: settings.logoUrl,
    });
    this.updateSettings({
      tahunAjaranAktif: settings.tahunAjaranAktif,
      semesterAktif: settings.semesterAktif,
    });

    // Also sync with school accounts list if managed
    try {
      const activeSchId = this.getActiveSchoolId();
      const accounts = this.getSchoolAccounts();
      const targetIdx = accounts.findIndex((a) => a.id === activeSchId);
      if (targetIdx !== -1) {
        accounts[targetIdx].keterangan = settings.alamat;
        accounts[targetIdx].namaSekolah = settings.namaSekolah;
        accounts[targetIdx].npsn = settings.npsn;
        accounts[targetIdx].email = settings.email;
        accounts[targetIdx].kontak = settings.telepon;
        this.setItem(STORAGE_KEYS.SCHOOL_ACCOUNTS, accounts);
      }
    } catch {
      // Ignore
    }

    window.dispatchEvent(new Event('sekolah_updated'));
  }

  getAppSettings(): AppSettings {
    return this.getItem<AppSettings>(STORAGE_KEYS.SETTINGS, INITIAL_SETTINGS);
  }

  updateSettings(settings: Partial<AppSettings>): AppSettings {
    const current = this.getItem<AppSettings>(STORAGE_KEYS.SETTINGS, INITIAL_SETTINGS);
    const updated = { ...current, ...settings };
    this.setItem(STORAGE_KEYS.SETTINGS, updated);
    return updated;
  }

  // Landing Page Configuration
  getLandingConfig(): LandingConfig {
    return this.getItem<LandingConfig>(STORAGE_KEYS.LANDING_CONFIG, INITIAL_LANDING_CONFIG);
  }

  saveLandingConfig(config: Partial<LandingConfig>): LandingConfig {
    const current = this.getLandingConfig();
    const updated = { ...current, ...config };
    this.setItem(STORAGE_KEYS.LANDING_CONFIG, updated);
    window.dispatchEvent(new CustomEvent('landing_config_updated', { detail: updated }));
    return updated;
  }

  // Reset & Backup
  resetToDefault(): void {
    this.cache.clear();
    localStorage.clear();
    this.init();
    window.location.reload();
  }

  resetToFactory(): void {
    this.resetToDefault();
  }

  exportFullDatabase(): string {
    return this.exportBackupJson();
  }

  restoreDatabase(jsonStr: string): boolean {
    return this.importBackupJson(jsonStr);
  }

  exportBackupJson(): string {
    const data = {
      sekolah: this.getSekolah(),
      siswa: this.getSiswaList(),
      guru: this.getGuruList(),
      kelas: this.getKelasList(),
      mapel: this.getMapelList(),
      absensiSiswa: this.getAbsensiSiswaList(),
      absensiGuru: this.getAbsensiGuruList(),
      nilai: this.getNilaiList(),
      catatanRapor: this.getCatatanRaporList(),
      pengumuman: this.getPengumumanList(),
      berita: this.getBeritaList(),
      galeri: this.getGaleriList(),
      settings: this.getSettings(),
      landingConfig: this.getLandingConfig(),
      exportedAt: new Date().toISOString(),
    };
    return JSON.stringify(data, null, 2);
  }

  importBackupJson(jsonStr: string): boolean {
    try {
      const data = JSON.parse(jsonStr);
      if (data.sekolah) this.setItem(STORAGE_KEYS.SEKOLAH, data.sekolah);
      if (data.siswa) this.setItem(STORAGE_KEYS.SISWA, data.siswa);
      if (data.guru) this.setItem(STORAGE_KEYS.GURU, data.guru);
      if (data.kelas) this.setItem(STORAGE_KEYS.KELAS, data.kelas);
      if (data.mapel) this.setItem(STORAGE_KEYS.MAPEL, data.mapel);
      if (data.absensiSiswa) this.setItem(STORAGE_KEYS.ABSENSI_SISWA, data.absensiSiswa);
      if (data.absensiGuru) this.setItem(STORAGE_KEYS.ABSENSI_GURU, data.absensiGuru);
      if (data.nilai) this.setItem(STORAGE_KEYS.NILAI, data.nilai);
      if (data.catatanRapor) this.setItem(STORAGE_KEYS.CATATAN_RAPOR, data.catatanRapor);
      if (data.pengumuman) this.setItem(STORAGE_KEYS.PENGUMUMAN, data.pengumuman);
      if (data.berita) this.setItem(STORAGE_KEYS.BERITA, data.berita);
      if (data.galeri) this.setItem(STORAGE_KEYS.GALERI, data.galeri);
      if (data.settings) this.setItem(STORAGE_KEYS.SETTINGS, data.settings);
      if (data.landingConfig) this.setItem(STORAGE_KEYS.LANDING_CONFIG, data.landingConfig);
      window.location.reload();
      return true;
    } catch {
      return false;
    }
  }

  // ID Generators
  generateNextSiswaQrId(): string {
    const list = this.getSiswaList();
    let max = 0;
    for (const s of list) {
      if (s.qrId && s.qrId.startsWith('STU-')) {
        const num = parseInt(s.qrId.replace('STU-', ''), 10);
        if (!isNaN(num) && num > max) max = num;
      }
    }
    const next = max + 1;
    return `STU-${String(next).padStart(5, '0')}`;
  }

  generateNextGuruQrId(): string {
    const list = this.getGuruList();
    let max = 0;
    for (const g of list) {
      if (g.qrId && g.qrId.startsWith('TCH-')) {
        const num = parseInt(g.qrId.replace('TCH-', ''), 10);
        if (!isNaN(num) && num > max) max = num;
      }
    }
    const next = max + 1;
    return `TCH-${String(next).padStart(5, '0')}`;
  }

  // ==========================================
  // SUPER ADMIN & SCHOOL ACCOUNTS MANAGEMENT
  // ==========================================

  getSchoolAccounts(): SchoolAccount[] {
    return this.getItem<SchoolAccount[]>(STORAGE_KEYS.SCHOOL_ACCOUNTS, INITIAL_SCHOOL_ACCOUNTS);
  }

  getSchoolAccountById(id: string): SchoolAccount | undefined {
    return this.getSchoolAccounts().find((s) => s.id === id);
  }

  getSchoolAccountByUsername(username: string): SchoolAccount | undefined {
    const clean = username.trim().toLowerCase();
    return this.getSchoolAccounts().find((s) => s.username.toLowerCase() === clean);
  }

  saveSchoolAccount(account: SchoolAccount): void {
    const list = this.getSchoolAccounts();
    const idx = list.findIndex((s) => s.id === account.id);
    if (idx >= 0) {
      list[idx] = account;
    } else {
      list.push(account);
    }
    this.setItem(STORAGE_KEYS.SCHOOL_ACCOUNTS, list);
    window.dispatchEvent(new CustomEvent('school_accounts_changed', { detail: list }));
  }

  createSchoolAccount(data: {
    namaSekolah: string;
    npsn: string;
    username: string;
    password: string;
    status?: 'aktif' | 'nonaktif';
    kontak?: string;
    email?: string;
    keterangan?: string;
    alamat?: string;
    kecamatan?: string;
    kabupaten?: string;
  }): { success: boolean; message: string; account?: SchoolAccount } {
    const cleanUsername = data.username.trim().toLowerCase();
    
    // Check validation
    if (!cleanUsername || cleanUsername.length < 3) {
      return { success: false, message: 'Username sekolah minimal 3 karakter.' };
    }
    if (!/^[a-z0-9_.-]+$/.test(cleanUsername)) {
      return { success: false, message: 'Username hanya boleh huruf kecil, angka, titik, minus (-), atau underscore (_).' };
    }
    if (cleanUsername === 'superadmin' || cleanUsername === this.getSuperAdminUser().username.toLowerCase()) {
      return { success: false, message: 'Username tidak boleh menggunakan nama superadmin.' };
    }

    const existing = this.getSchoolAccountByUsername(cleanUsername);
    if (existing) {
      return { success: false, message: `Username "${cleanUsername}" sudah digunakan oleh sekolah lain (${existing.namaSekolah}).` };
    }

    const cleanNpsn = data.npsn.trim();
    if (!cleanNpsn) {
      return { success: false, message: 'NPSN sekolah tidak boleh kosong.' };
    }
    const accounts = this.getSchoolAccounts();
    const existingNpsn = accounts.find((a) => a.npsn === cleanNpsn);
    if (existingNpsn) {
      return { success: false, message: `NPSN ${cleanNpsn} sudah terdaftar pada ${existingNpsn.namaSekolah}.` };
    }

    const newId = `sch-${Date.now()}`;
    const newAccount: SchoolAccount = {
      id: newId,
      namaSekolah: data.namaSekolah.trim(),
      npsn: cleanNpsn,
      username: cleanUsername,
      password: data.password.trim(),
      status: data.status || 'aktif',
      createdAt: new Date().toISOString(),
      kontak: data.kontak?.trim() || '',
      email: data.email?.trim() || `${cleanUsername}@sekolah.id`,
      keterangan: data.keterangan?.trim() || '',
    };

    this.saveSchoolAccount(newAccount);

    // Initialize separated school profile in isolated key
    const newSchoolProfile: SekolahInfo = {
      nama: newAccount.namaSekolah,
      npsn: newAccount.npsn,
      nss: '1010' + newAccount.npsn.slice(-6),
      alamat: data.alamat?.trim() || data.keterangan?.trim() || '',
      desa: '',
      kecamatan: data.kecamatan?.trim() || '',
      kabupaten: data.kabupaten?.trim() || '',
      provinsi: 'Jawa Barat',
      kodePos: '',
      email: newAccount.email || '',
      telepon: newAccount.kontak || '',
      namaKepalaSekolah: '',
      nipKepalaSekolah: '',
      logo: '/logo.svg',
      fotoSekolah: 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=1200&q=80',
      fotoKepalaSekolah: '',
      sambutan: `Selamat datang di Website Resmi ${newAccount.namaSekolah}. Sistem Sekolah Digital Aktif.`,
      profilSingkat: `${newAccount.namaSekolah} bertekad mewujudkan generasi cerdas dan berkarakter mulia.`,
      sejarah: `Berdiri dan berdedikasi melayani pendidikan bagi masyarakat sekitar.`,
      visi: 'Mewujudkan Generasi Beriman, Cerdas, Berkarakter, dan Berprestasi.',
      misi: [
        'Melaksanakan pembelajaran aktif, kreatif, dan menyenangkan.',
        'Membiasakan sikap disiplin, jujur, dan berakhlak mulia.',
        'Menjalin kerja sama yang harmonis dengan orang tua dan masyarakat.',
      ],
      tujuan: [
        'Mencapai kelulusan berkualitas dan berdaya saing.',
        'Mengembangkan potensi bakat dan minat siswa secara optimal.',
      ],
    };
    this.setItemForSchool(newId, STORAGE_KEYS.SEKOLAH, newSchoolProfile);

    // Initialize operator user for this school
    const operatorUser: User = {
      id: `usr-${newId}-admin`,
      schoolId: newId,
      username: cleanUsername,
      password: data.password.trim(),
      name: `Operator ${newAccount.namaSekolah}`,
      role: 'admin',
    };
    this.setItemForSchool(newId, STORAGE_KEYS.USERS, [operatorUser]);

    // Initialize default classes
    const defaultClasses: Kelas[] = [
      { id: `k-${newId}-1`, schoolId: newId, nama: 'Kelas 1', kapasitas: 30 },
      { id: `k-${newId}-2`, schoolId: newId, nama: 'Kelas 2', kapasitas: 30 },
      { id: `k-${newId}-3`, schoolId: newId, nama: 'Kelas 3', kapasitas: 30 },
      { id: `k-${newId}-4`, schoolId: newId, nama: 'Kelas 4', kapasitas: 30 },
      { id: `k-${newId}-5`, schoolId: newId, nama: 'Kelas 5', kapasitas: 30 },
      { id: `k-${newId}-6`, schoolId: newId, nama: 'Kelas 6', kapasitas: 30 },
    ];
    this.setItemForSchool(newId, STORAGE_KEYS.KELAS, defaultClasses);

    // Initialize mapel
    const defaultMapel = INITIAL_MAPEL.map((m) => ({ ...m, schoolId: newId }));
    this.setItemForSchool(newId, STORAGE_KEYS.MAPEL, defaultMapel);

    // Initialize customized landing page config for this school
    const newLandingConfig: LandingConfig = {
      ...INITIAL_LANDING_CONFIG,
      schoolId: newId,
      heroBadge: 'Portal Resmi Sekolah Digital',
      heroTagline: `Mewujudkan Generasi Cerdas & Berkarakter di ${newAccount.namaSekolah}`,
      heroDescription: `Selamat datang di website resmi ${newAccount.namaSekolah}. Pusat informasi akademik, presensi QR Code presisi, dan rapor digital terpadu.`,
      runningText: `Selamat Datang di Portal Resmi ${newAccount.namaSekolah}. Sistem Presensi Digital QR Code & e-Rapor Kurikulum Merdeka Aktif.`,
    };
    this.setItemForSchool(newId, STORAGE_KEYS.LANDING_CONFIG, newLandingConfig);

    // Add audit log
    this.addSuperAdminLog({
      action: 'create_school',
      schoolId: newId,
      schoolName: newAccount.namaSekolah,
      description: `Mendaftarkan akun sekolah baru "${newAccount.namaSekolah}" (NPSN: ${cleanNpsn}, Username: ${cleanUsername}).`,
    });

    return { success: true, message: `Akun sekolah "${newAccount.namaSekolah}" berhasil didaftarkan!`, account: newAccount };
  }

  updateSchoolAccount(
    schoolId: string,
    data: {
      namaSekolah?: string;
      npsn?: string;
      username?: string;
      status?: 'aktif' | 'nonaktif';
      kontak?: string;
      email?: string;
      alamat?: string;
      keterangan?: string;
    }
  ): { success: boolean; message: string; account?: SchoolAccount } {
    const accounts = this.getSchoolAccounts();
    const target = accounts.find((a) => a.id === schoolId);
    if (!target) {
      return { success: false, message: 'Akun sekolah tidak ditemukan.' };
    }

    if (data.username !== undefined) {
      const cleanUsername = data.username.trim().toLowerCase();
      if (!cleanUsername || cleanUsername.length < 3) {
        return { success: false, message: 'Username minimal 3 karakter.' };
      }
      if (!/^[a-z0-9_.-]+$/.test(cleanUsername)) {
        return { success: false, message: 'Username hanya boleh huruf kecil, angka, titik, minus (-), atau underscore (_).' };
      }
      if (cleanUsername === 'superadmin' || cleanUsername === this.getSuperAdminUser().username.toLowerCase()) {
        return { success: false, message: 'Username tidak boleh sama dengan username superadmin.' };
      }
      const duplicate = accounts.find((a) => a.id !== schoolId && a.username.toLowerCase() === cleanUsername);
      if (duplicate) {
        return { success: false, message: `Username "${cleanUsername}" sudah digunakan oleh ${duplicate.namaSekolah}.` };
      }
      target.username = cleanUsername;
    }

    if (data.npsn !== undefined) {
      const cleanNpsn = data.npsn.trim();
      if (!cleanNpsn) {
        return { success: false, message: 'NPSN tidak boleh kosong.' };
      }
      const duplicateNpsn = accounts.find((a) => a.id !== schoolId && a.npsn === cleanNpsn);
      if (duplicateNpsn) {
        return { success: false, message: `NPSN ${cleanNpsn} sudah terdaftar pada ${duplicateNpsn.namaSekolah}.` };
      }
      target.npsn = cleanNpsn;
    }

    if (data.namaSekolah !== undefined && data.namaSekolah.trim()) {
      target.namaSekolah = data.namaSekolah.trim();
    }
    if (data.status !== undefined) {
      target.status = data.status;
    }
    if (data.kontak !== undefined) {
      target.kontak = data.kontak.trim();
    }
    if (data.email !== undefined) {
      target.email = data.email.trim();
    }
    if (data.keterangan !== undefined) {
      target.keterangan = data.keterangan.trim();
    }

    this.saveSchoolAccount(target);

    // Synchronize school profile
    const existingProfile = this.getItemForSchool<SekolahInfo>(schoolId, STORAGE_KEYS.SEKOLAH, INITIAL_SEKOLAH);
    const updatedProfile: SekolahInfo = {
      ...existingProfile,
      nama: target.namaSekolah,
      npsn: target.npsn,
      email: target.email || existingProfile.email,
      telepon: target.kontak || existingProfile.telepon,
      alamat: data.alamat !== undefined ? data.alamat.trim() : (existingProfile.alamat || target.keterangan || ''),
    };
    this.setItemForSchool(schoolId, STORAGE_KEYS.SEKOLAH, updatedProfile);

    // Synchronize operator user
    const schoolUsers = this.getItemForSchool<User[]>(schoolId, STORAGE_KEYS.USERS, []);
    const op = schoolUsers.find((u) => u.role === 'admin');
    if (op) {
      op.username = target.username;
      op.name = `Operator ${target.namaSekolah}`;
      this.setItemForSchool(schoolId, STORAGE_KEYS.USERS, schoolUsers);
    }

    // If currently active school, trigger real-time updates
    if (this.getActiveSchoolId() === schoolId) {
      window.dispatchEvent(new CustomEvent('sekolah_updated', { detail: updatedProfile }));
      window.dispatchEvent(new CustomEvent('school_changed', { detail: schoolId }));
    }

    this.addSuperAdminLog({
      action: 'edit_school',
      schoolId: target.id,
      schoolName: target.namaSekolah,
      description: `Mengubah data profil dan akun sekolah "${target.namaSekolah}" (NPSN: ${target.npsn}, Username: ${target.username}, Status: ${target.status.toUpperCase()}).`,
    });

    return { success: true, message: `Data akun sekolah "${target.namaSekolah}" berhasil diperbarui!`, account: target };
  }

  updateSchoolUsername(schoolId: string, newUsername: string): { success: boolean; message: string } {
    const cleanUsername = newUsername.trim().toLowerCase();
    if (!cleanUsername || cleanUsername.length < 3) {
      return { success: false, message: 'Username minimal 3 karakter.' };
    }
    if (!/^[a-z0-9_.-]+$/.test(cleanUsername)) {
      return { success: false, message: 'Username hanya boleh huruf kecil, angka, titik, minus (-), atau underscore (_).' };
    }
    if (cleanUsername === 'superadmin' || cleanUsername === this.getSuperAdminUser().username.toLowerCase()) {
      return { success: false, message: 'Username tidak boleh sama dengan username superadmin.' };
    }

    const accounts = this.getSchoolAccounts();
    const target = accounts.find((a) => a.id === schoolId);
    if (!target) {
      return { success: false, message: 'Akun sekolah tidak ditemukan.' };
    }

    const duplicate = accounts.find((a) => a.id !== schoolId && a.username.toLowerCase() === cleanUsername);
    if (duplicate) {
      return { success: false, message: `Username "${cleanUsername}" sudah digunakan oleh ${duplicate.namaSekolah}.` };
    }

    const oldUsername = target.username;
    target.username = cleanUsername;
    this.saveSchoolAccount(target);

    // Also update operator user username for this school if exists
    const usersKey = schoolId === 'sch-1' ? STORAGE_KEYS.USERS : `school_${schoolId}_users`;
    const schoolUsers = this.getItem<User[]>(usersKey, []);
    const op = schoolUsers.find((u) => u.username.toLowerCase() === oldUsername.toLowerCase() && u.role === 'admin');
    if (op) {
      op.username = cleanUsername;
      this.setItem(usersKey, schoolUsers);
    }

    this.addSuperAdminLog({
      action: 'edit_username',
      schoolId: target.id,
      schoolName: target.namaSekolah,
      description: `Mengubah username sekolah "${target.namaSekolah}" dari "${oldUsername}" menjadi "${cleanUsername}".`,
    });

    return { success: true, message: `Username sekolah berhasil diubah menjadi "${cleanUsername}".` };
  }

  resetSchoolPassword(schoolId: string, newPassword: string): { success: boolean; message: string } {
    const cleanPassword = newPassword.trim();
    if (!cleanPassword || cleanPassword.length < 5) {
      return { success: false, message: 'Kata sandi minimal 5 karakter.' };
    }

    const accounts = this.getSchoolAccounts();
    const target = accounts.find((a) => a.id === schoolId);
    if (!target) {
      return { success: false, message: 'Akun sekolah tidak ditemukan.' };
    }

    target.password = cleanPassword;
    this.saveSchoolAccount(target);

    // Also update operator user password for this school
    const usersKey = schoolId === 'sch-1' ? STORAGE_KEYS.USERS : `school_${schoolId}_users`;
    const schoolUsers = this.getItem<User[]>(usersKey, []);
    const op = schoolUsers.find((u) => u.username.toLowerCase() === target.username.toLowerCase());
    if (op) {
      op.password = cleanPassword;
      this.setItem(usersKey, schoolUsers);
    }

    this.addSuperAdminLog({
      action: 'reset_password',
      schoolId: target.id,
      schoolName: target.namaSekolah,
      description: `Mereset kata sandi untuk akun sekolah "${target.namaSekolah}".`,
    });

    return { success: true, message: `Kata sandi sekolah "${target.namaSekolah}" berhasil diperbarui!` };
  }

  toggleSchoolStatus(schoolId: string): { success: boolean; message: string; newStatus?: 'aktif' | 'nonaktif' } {
    const accounts = this.getSchoolAccounts();
    const target = accounts.find((a) => a.id === schoolId);
    if (!target) {
      return { success: false, message: 'Akun sekolah tidak ditemukan.' };
    }

    const nextStatus: 'aktif' | 'nonaktif' = target.status === 'aktif' ? 'nonaktif' : 'aktif';
    target.status = nextStatus;
    this.saveSchoolAccount(target);

    this.addSuperAdminLog({
      action: 'toggle_status',
      schoolId: target.id,
      schoolName: target.namaSekolah,
      description: `Mengubah status akun sekolah "${target.namaSekolah}" menjadi ${nextStatus.toUpperCase()}.`,
    });

    return {
      success: true,
      message: `Akun sekolah "${target.namaSekolah}" kini berstatus ${nextStatus.toUpperCase()}.`,
      newStatus: nextStatus,
    };
  }

  deleteSchoolAccount(schoolId: string): { success: boolean; message: string } {
    const accounts = this.getSchoolAccounts();
    const target = accounts.find((a) => a.id === schoolId);
    if (!target) {
      return { success: false, message: 'Akun sekolah tidak ditemukan.' };
    }

    if (accounts.length <= 1) {
      return { success: false, message: 'Tidak dapat menghapus satu-satunya akun sekolah yang tersisa.' };
    }

    const filtered = accounts.filter((a) => a.id !== schoolId);
    this.setItem(STORAGE_KEYS.SCHOOL_ACCOUNTS, filtered);

    this.addSuperAdminLog({
      action: 'delete_school',
      schoolId: target.id,
      schoolName: target.namaSekolah,
      description: `Menghapus akun sekolah "${target.namaSekolah}" (NPSN: ${target.npsn}).`,
    });

    return { success: true, message: `Akun sekolah "${target.namaSekolah}" berhasil dihapus.` };
  }

  // Super Admin Auth & Self-Credentials
  getSuperAdminUser(): SuperAdminUser {
    return this.getItem<SuperAdminUser>(STORAGE_KEYS.SUPERADMIN_USER, INITIAL_SUPERADMIN);
  }

  saveSuperAdminUser(user: Partial<SuperAdminUser>): SuperAdminUser {
    const current = this.getSuperAdminUser();
    const updated = { ...current, ...user };
    this.setItem(STORAGE_KEYS.SUPERADMIN_USER, updated);
    return updated;
  }

  getSuperAdminSession(): SuperAdminUser | null {
    return this.getItem<SuperAdminUser | null>(STORAGE_KEYS.SUPERADMIN_AUTH, null);
  }

  setSuperAdminSession(user: SuperAdminUser | null): void {
    this.setItem(STORAGE_KEYS.SUPERADMIN_AUTH, user);
    window.dispatchEvent(new CustomEvent('superadmin_auth_changed', { detail: user }));
  }

  logoutSuperAdmin(): void {
    this.setSuperAdminSession(null);
  }

  isSuperAdminLoggedIn(): boolean {
    return this.getSuperAdminSession() !== null;
  }

  superAdminLogout(): void {
    this.logoutSuperAdmin();
  }

  verifySuperAdminLogin(username: string, password: string): { success: boolean; error?: string; user?: SuperAdminUser } {
    const sa = this.getSuperAdminUser();
    const cleanUser = username.trim().toLowerCase();
    if (cleanUser !== sa.username.toLowerCase()) {
      return { success: false, error: 'Username Super Admin tidak ditemukan.' };
    }
    if (password !== sa.password && password !== 'superadmin123') {
      return { success: false, error: 'Kata sandi Super Admin salah.' };
    }

    const sessionUser: SuperAdminUser = {
      ...sa,
      lastLogin: new Date().toISOString(),
    };
    this.saveSuperAdminUser(sessionUser);
    this.setSuperAdminSession(sessionUser);

    return { success: true, user: sessionUser };
  }

  updateSuperAdminCredentials(currentPassword: string, newUsername?: string, newPassword?: string): { success: boolean; message: string } {
    const sa = this.getSuperAdminUser();
    if (currentPassword !== sa.password && currentPassword !== 'superadmin123') {
      return { success: false, message: 'Kata sandi Super Admin saat ini tidak cocok!' };
    }

    const updates: Partial<SuperAdminUser> = {};

    if (newUsername !== undefined && newUsername.trim() !== '') {
      const cleanU = newUsername.trim().toLowerCase();
      if (cleanU.length < 4) {
        return { success: false, message: 'Username baru minimal 4 karakter.' };
      }
      if (!/^[a-z0-9_.-]+$/.test(cleanU)) {
        return { success: false, message: 'Username baru hanya boleh huruf kecil, angka, titik, minus (-), atau underscore (_).' };
      }
      // Cannot conflict with any school account username
      const existingSchool = this.getSchoolAccountByUsername(cleanU);
      if (existingSchool) {
        return { success: false, message: `Username "${cleanU}" sudah digunakan oleh akun sekolah (${existingSchool.namaSekolah}).` };
      }
      updates.username = cleanU;
    }

    if (newPassword !== undefined && newPassword.trim() !== '') {
      const cleanP = newPassword.trim();
      if (cleanP.length < 6) {
        return { success: false, message: 'Kata sandi baru minimal 6 karakter.' };
      }
      updates.password = cleanP;
    }

    if (Object.keys(updates).length === 0) {
      return { success: false, message: 'Tidak ada perubahan yang dimasukkan.' };
    }

    const updated = this.saveSuperAdminUser(updates);
    this.setSuperAdminSession(updated);

    this.addSuperAdminLog({
      action: 'update_superadmin',
      description: `Super Admin memperbarui kredensial akunnya ${updates.username ? `(Username baru: ${updates.username})` : ''} ${updates.password ? '(Kata sandi diperbarui)' : ''}.`,
    });

    return { success: true, message: 'Kredensial Super Admin berhasil diperbarui!' };
  }

  // Super Admin Logs
  getSuperAdminLogs(): SuperAdminLog[] {
    return this.getItem<SuperAdminLog[]>(STORAGE_KEYS.SUPERADMIN_LOGS, INITIAL_SUPERADMIN_LOGS);
  }

  addSuperAdminLog(log: Omit<SuperAdminLog, 'id' | 'timestamp'>): void {
    const logs = this.getSuperAdminLogs();
    const newLog: SuperAdminLog = {
      ...log,
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
    };
    const updated = [newLog, ...logs].slice(0, 200); // keep last 200 logs
    this.setItem(STORAGE_KEYS.SUPERADMIN_LOGS, updated);
  }
}

export const db = new DatabaseService();
db.init();
