import { ModulAjarAI, NaskahUjianAI, BahanAjarAI } from '../types';

export interface CurriculumModulParams {
  jenisDokumen?: string;
  kurikulum: 'Kurikulum Merdeka' | 'Kurikulum 2013';
  jenjang: 'PAUD' | 'SD' | 'SMP' | 'SMA' | 'SMK';
  mataPelajaran: string;
  faseKelas: string;
  tahunAjaran: string;
  semester: 'Ganjil' | 'Genap';
  alokasiWaktu: string;
  topikMateri: string;
  capaianPembelajaran?: string;
  profilPancasila?: string[];
  modelPembelajaran?: string;
  metodePendekatan?: string;
  saranaPrasarana?: string;
  targetPesertaDidik?: string;
  instruksiTambahan?: string;
  guruName?: string;
  namaSekolah?: string;
}

/**
 * Generates an official, regulation-compliant Modul Ajar or RPP based on Indonesian curriculum guidelines.
 * Used as high-standard curriculum synthesizer and automatic fallback if AI server is busy or unavailable.
 */
export function generateOfficialCurriculumModul(params: CurriculumModulParams): ModulAjarAI {
  const isK13 = params.kurikulum === 'Kurikulum 2013';
  const topik = params.topikMateri.trim() || 'Materi Pokok Pembelajaran';
  const mapel = params.mataPelajaran || 'Tematik';
  const kelas = params.faseKelas || 'Kelas 4';
  const alokasi = params.alokasiWaktu || '2 x 35 Menit (1 Pertemuan)';
  const model = params.modelPembelajaran || (isK13 ? 'Problem Based Learning (PBL)' : 'Problem Based Learning (PBL)');
  const sarana = params.saranaPrasarana || 'Buku Guru, Buku Siswa, LCD Proyektor, Bahan Tayang/Slide, Lembar Kerja';
  const profilList =
    params.profilPancasila && params.profilPancasila.length > 0
      ? params.profilPancasila
      : isK13
      ? ['Religius', 'Nasionalis', 'Mandiri', 'Gotong Royong', 'Integritas']
      : ['Bernalar Kritis', 'Gotong Royong', 'Mandiri'];

  const now = new Date().toISOString();

  if (isK13) {
    const judul = params.jenisDokumen
      ? `${params.jenisDokumen} ${mapel} ${kelas} - ${topik}`
      : `RPP Kurikulum 2013 ${mapel} ${kelas} - ${topik}`;

    return {
      id: `modul-${Date.now()}`,
      judul,
      jenisDokumen: params.jenisDokumen || 'RPP K13',
      kurikulum: 'Kurikulum 2013',
      jenjang: params.jenjang || 'SD',
      mataPelajaran: mapel,
      faseKelas: kelas,
      tahunAjaran: params.tahunAjaran || '2025/2026',
      semester: params.semester || 'Ganjil',
      alokasiWaktu: alokasi,
      capaianPembelajaran:
        params.capaianPembelajaran ||
        `KD 3: Memahami konsep, prinsip, dan fakta esensial terkait ${topik}.\nKD 4: Menyajikan hasil penalaran dan pemecahan masalah kontekstual materi ${topik}.`,
      targetProfilPelajar: profilList,
      modelPembelajaran: model,
      metodePendekatan: params.metodePendekatan || 'Pendekatan Saintifik (5M) & Diskusi Kelompok',
      saranaPrasarana: [sarana],
      tujuanPembelajaran: [
        `Melalui kegiatan mengamati media tayang, peserta didik mampu mengidentifikasi karakteristik dan konsep dasar ${topik} dengan teliti dan benar.`,
        `Melalui diskusi kelompok dan bimbingan guru, peserta didik dapat menganalisis permasalahan kontekstual mengenai ${topik} secara kritis.`,
        `Melalui presentasi hasil penugasan, peserta didik mampu mengomunikasikan pemahaman tentang ${topik} dengan percaya diri dan santun.`,
      ],
      pemahamanBermakna: `Peserta didik menyadari bahwa materi ${topik} memiliki keterkaitan erat dalam kehidupan sehari-hari untuk memecahkan persoalan praktis secara bijak.`,
      pertanyaanPemantik: [
        `Mengapa materi ${topik} penting untuk kita pelajari bersama hari ini?`,
        `Pernahkah kalian menemukan fenomena atau contoh ${topik} di lingkungan sekitar rumah kalian?`,
      ],
      diferensiasi: {
        konten: `Penyediaan materi bertingkat: teks bacaan ringkas bergambar untuk pemahaman dasar, dan studi kasus pengayaan untuk peserta didik yang lebih cepat paham.`,
        proses: `Guru memberikan scaffolding (pendampingan lebih intensif) bagi kelompok siswa yang membutuhkan bantuan, sementara kelompok mandiri diberikan lembar eksplorasi terbuka.`,
        produk: `Peserta didik bebas melaporkan hasil kerja berupa bagan infografis, peta konsep ringkas, atau paparan lisan di depan kelas.`,
      },
      kegiatanPembelajaran: {
        pendahuluan: [
          'Guru membuka pembelajaran dengan salam, menyapa peserta didik, dan mengajak salah satu siswa memimpin doa bersama.',
          'Guru memeriksa kehadiran, kesiapan fisik dan psikis siswa untuk mengikuti proses pembelajaran.',
          'Apersepsi: Guru mengaitkan materi sebelumnya dengan topik hari ini mengenai ' + topik + '.',
          'Guru menyampaikan tujuan pembelajaran, garis besar kegiatan, dan manfaat materi ' + topik + ' dalam kehidupan nyata.',
        ],
        inti: [
          `Fase 1 (Orientasi Masalah): Peserta didik mengamati tayangan/ilustrasi kontekstual terkait materi ${topik} (Saintifik: Mengamati).`,
          `Fase 2 (Pengorganisasian Belajar): Guru membagi peserta didik ke dalam kelompok heterogen (3-4 orang) dan membagikan Lembar Kerja Siswa (Saintifik: Menanya).`,
          `Fase 3 (Penyelidikan): Peserta didik berdiskusi aktif mengumpulkan informasi, melakukan penalaran, dan memecahkan soal panduan pada LKS dengan bimbingan guru (Saintifik: Mengumpulkan Informasi & Menalar).`,
          `Fase 4 (Penyajian Karya): Setiap kelompok mempresentasikan hasil pemecahan masalah di depan kelas secara bergiliran (Saintifik: Mengomunikasikan).`,
          `Fase 5 (Evaluasi & Refleksi): Guru memberikan apresiasi, umpan balik konstruktif, serta konfirmasi atas konsep materi ${topik} yang telah didiskusikan.`,
        ],
        penutup: [
          'Peserta didik bersama guru menyimpulkan butir-butir penting materi pembelajaran hari ini.',
          'Guru melakukan refleksi singkat terhadap proses pembelajaran (apa yang paling dipahami dan apa kendala yang dihadapi).',
          'Guru menyampaikan rencana materi pada pertemuan berikutnya dan memberikan tugas penguatan mandiri.',
          'Pembelajaran ditutup dengan doa bersama dan salam penutup.',
        ],
      },
      asesmen: {
        diagnostik:
          'Pertanyaan lisan apersepsi di awal pertemuan untuk memetakan kesiapan awal peserta didik.',
        formatif:
          'Observasi sikap (tanggung jawab, kerja sama, ketelitian) dan penilaian keaktifan diskusi kelompok menggunakan lembar observasi.',
        sumatif:
          'Tes tertulis berupa soal pilihan ganda dan uraian singkat di akhir pembelajaran mengenai pemahaman konsep ' +
          topik +
          '.',
        rubrik:
          'Skala Penilaian: Sangat Baik (4), Baik (3), Cukup (2), Kurang (1). Kriteria: Ketepatan Konsep (40%), Kerjasama Kelompok (30%), Keterampilan Presentasi (30%).',
      },
      pengayaanRemedial:
        'Remedial: Bimbingan ulang konsep dasar ' +
        topik +
        ' dan pengerjaan kembali soal latihan terbimbing bagi siswa yang belum tuntas. Pengayaan: Pemberian studi kasus analisis tingkat tinggi (HOTS) bagi peserta didik yang telah melampaui KKM.',
      refleksiGuruSiswa:
        'Refleksi Guru: Apakah alokasi waktu dan sintaks model berjalan efektif? Apakah seluruh siswa aktif terlibat?\nRefleksi Murid: Bagian mana dari materi ' +
        topik +
        ' yang paling menarik dan bagian mana yang masih perlu dipelajari lagi?',
      lembarKerjaRingkas:
        `LEMBAR KERJA SISWA (LKS)\nTopik: ${topik}\nKelas/Semester: ${kelas} / ${params.semester || 'Ganjil'}\n` +
        `Nama Kelompok: ........................\nAnggota: 1. ................ 2. ................\n\n` +
        `Petunjuk Kerja:\n1. Bacalah materi ringkas dan diskusikan bersama anggota kelompok.\n` +
        `2. Analisislah permasalahan berikut: Bagaimana penerapan konsep ${topik} dapat memberikan solusi pada kehidupan sehari-hari?\n` +
        `3. Tuliskan kesimpulan kelompok pada kolom yang tersedia dan persiapkan presentasi singkat.`,
      createdAt: now,
    };
  }

  // Kurikulum Merdeka (Modul Ajar)
  const judul = params.jenisDokumen
    ? `${params.jenisDokumen} ${mapel} ${kelas} - ${topik}`
    : `Modul Ajar Kurikulum Merdeka ${mapel} ${kelas} - ${topik}`;

  return {
    id: `modul-${Date.now()}`,
    judul,
    jenisDokumen: params.jenisDokumen || 'Modul Ajar',
    kurikulum: 'Kurikulum Merdeka',
    jenjang: params.jenjang || 'SD',
    mataPelajaran: mapel,
    faseKelas: kelas,
    tahunAjaran: params.tahunAjaran || '2025/2026',
    semester: params.semester || 'Ganjil',
    alokasiWaktu: alokasi,
    capaianPembelajaran:
      params.capaianPembelajaran ||
      `Peserta didik mampu memahami, menganalisis, dan merefleksikan konsep esensial materi ${topik} serta mengaplikasikannya dalam konteks kehidupan nyata sehari-hari.`,
    targetProfilPelajar: profilList,
    modelPembelajaran: model,
    metodePendekatan: params.metodePendekatan || 'Pembelajaran Berdiferensiasi & Pembelajaran Bermakna',
    saranaPrasarana: [sarana],
    tujuanPembelajaran: [
      `Peserta didik dapat mengidentifikasi konsep dan prinsip dasar ${topik} secara tepat setelah mencermati materi stimulus.`,
      `Peserta didik mampu berkolaborasi dalam kelompok untuk menganalisis dan menyelesaikan tantangan seputar ${topik} dengan bernalar kritis.`,
      `Peserta didik dapat mengomunikasikan gagasan dan hasil karya terkait ${topik} dengan percaya diri dan bahasa yang runtut.`,
    ],
    pemahamanBermakna: `Memahami konsep ${topik} membantu peserta didik memiliki cara pandang yang terstruktur dan mampu mengambil keputusan yang bijak dalam kehidupan bermasyarakat.`,
    pertanyaanPemantik: [
      `Apa yang pertama kali kalian pikirkan ketika mendengar istilah ${topik}?`,
      `Bagaimana jika dalam kehidupan sehari-hari kita tidak menerapkan konsep ${topik} ini?`,
    ],
    diferensiasi: {
      konten: `Diferensiasi Konten: Menyediakan stimulus materi multimedia (video/infografis visual) untuk gaya visual, teks terstruktur untuk gaya auditori/membaca, dan objek manipulatif konkret untuk pembelajar kinestetik.`,
      proses: `Diferensiasi Proses: Siswa yang sudah mahir mengerjakan penyelidikan mandiri; siswa yang berkembang didampingi dengan petunjuk bertahap (scaffolding); siswa yang butuh pendampingan khusus didampingi intensif oleh guru.`,
      produk: `Diferensiasi Produk: Peserta didik dapat menampilkan hasil pemahaman berupa laporan infografis, rekaman penjelasan lisan, poster visual, atau presentasi ringkas.`,
    },
    kegiatanPembelajaran: {
      pendahuluan: [
        'Guru menyapa peserta didik dengan ramah, mengondisikan suasana kelas yang aman dan menyenangkan, dilanjutkan doa bersama.',
        'Guru mengecek kehadiran dan kesiapan belajar peserta didik (ice breaking singkat pembangkit semangat).',
        'Apersepsi bermakna: Guru menghubungkan pengalaman nyata peserta didik dengan materi ' + topik + '.',
        'Guru menyampaikan tujuan pembelajaran, kesepakatan kelas, dan kriteria ketercapaian tujuan pembelajaran (KKTP).',
      ],
      inti: [
        `Tahap 1 (Orientasi Bermakna): Guru menyajikan pemantik kontekstual mengenai materi ${topik}. Peserta didik merespons pertanyaan pemantik secara aktif.`,
        `Tahap 2 (Pengorganisasian Belajar Berdiferensiasi): Peserta didik berkelompok sesuai kesiapan belajar mereka. Guru membagikan LKPD dengan tingkat tantangan yang sesuai.`,
        `Tahap 3 (Eksplorasi & Kolaborasi): Peserta didik berkolaborasi mengkaji materi, berdiskusi memecahkan persoalan ${topik}, dan guru memfasilitasi scaffolding pada kelompok yang memerlukan bimbingan.`,
        `Tahap 4 (Berbagi Karya): Setiap kelompok mempresentasikan hasil karyanya. Kelompok lain memberikan apresiasi dan tanggapan konstruktif.`,
        `Tahap 5 (Konfirmasi & Penguatan Konsep): Guru meluruskan miskonsepsi, menegaskan konsep inti ${topik}, dan mengapresiasi partisipasi seluruh peserta didik.`,
      ],
      penutup: [
        'Peserta didik diajak merumuskan kesimpulan pembelajaran dengan bahasa mereka sendiri.',
        'Refleksi belajar: Menggunakan kartu refleksi 3-2-1 (3 hal baru yang dipelajari, 2 hal yang ingin diketahui lebih lanjut, 1 hal yang paling menyenangkan).',
        'Guru memberikan umpan balik menyeluruh serta menyampaikan rencana tindak lanjut pertemuan mendatang.',
        'Kegiatan diakhiri dengan rasa syukur, doa bersama, dan salam persahabatan.',
      ],
    },
    asesmen: {
      diagnostik:
        'Asesmen Awal: Kuis interaktif 3 butir soal pemantik untuk mendiagnosis kesiapan belajar awal sebelum kegiatan inti.',
      formatif:
        'Asesmen Selama Proses: Catatan anekdot observasi profil pelajar pancasila, lembar penilaian teman sejawat, dan cek pemahaman berkala saat pengerjaan LKPD.',
      sumatif:
        'Asesmen Akhir: Uji pemahaman lingkup materi berupa tes tertulis dan asesmen kinerja (rubrik presentasi hasil karya).',
      rubrik:
        'Rubrik Kriteria Ketercapaian Tujuan Pembelajaran (KKTP): Perlu Bimbingan (0-60), Cukup (61-74), Mahir/Tuntas (75-89), Sangat Mahir (90-100). Indikator: Penguasaan konsep, analisis nalar, keterlibatan aktif.',
    },
    pengayaanRemedial:
      'Remedial: Tutor sebaya dan penyederhanaan instruksi tugas dengan bimbingan pendidik. Pengayaan: Penugasan proyek mini atau studi kasus eksploratif materi lanjutan bagi siswa berkategori sangat mahir.',
    refleksiGuruSiswa:
      'Refleksi Pendidik: Apakah pembelajaran berdiferensiasi berhasil mengakomodasi kebutuhan setiap murid? Apa yang perlu ditingkatkan pada pertemuan selanjutnya?\nRefleksi Peserta Didik: Apakah saya sudah memahami seluruh materi hari ini? Apa yang membuat saya merasa bangga dengan hasil kerja saya?',
    lembarKerjaRingkas:
      `LEMBAR KERJA PESERTA DIDIK (LKPD)\nKurikulum Merdeka - ${mapel} (${kelas})\nTopik Pembelajaran: ${topik}\n` +
      `Petunjuk Belajar:\n1. Bekerjalah secara kolaboratif bersama teman kelompokmu.\n` +
      `2. Amati fenomena terkait ${topik} yang disajikan guru.\n` +
      `3. Diskusikan 2 pertanyaan kunci: (a) Apa penyebab fenomena tersebut? (b) Solusi kreatif apa yang dapat kelompokmu tawarkan?\n` +
      `4. Tuangkan hasil diskusimu ke dalam bentuk media pilihan kelompok (Poster / Peta Konsep / Rangkuman) dan sajikan di depan kelas!`,
    createdAt: now,
  };
}

export function generateFallbackSoal(params: {
  mataPelajaran: string;
  kelas: string;
  kurikulum: 'Kurikulum Merdeka' | 'Kurikulum 2013';
  jenisUjian: string;
  tingkatKesulitan: string;
  topikMateri: string;
  jumlahPg: number;
  jumlahEsai: number;
  guruId?: string;
  guruName?: string;
}): NaskahUjianAI {
  const {
    mataPelajaran,
    kelas,
    kurikulum,
    jenisUjian,
    tingkatKesulitan,
    topikMateri,
    jumlahPg,
    jumlahEsai,
    guruId,
    guruName,
  } = params;

  const topic = topikMateri.trim() || mataPelajaran;

  // Multi-dimensional cognitive templates ensuring full question variety
  const dimensions = [
    {
      kognitif: 'C1 - Mengingat',
      kunci: 'B',
      pertanyaan: `Apa pengertian atau konsep dasar yang paling tepat mengenai ${topic}?`,
      pilihan: {
        A: `Suatu proses perubahan sementara tanpa tahapan berulang pada alam.`,
        B: `Prinsip fundamental dan rangkaian aturan teratur yang melandasi materi ${topic}.`,
        C: `Aktivitas manusia tanpa keterkaitan dengan hukum alam fisik.`,
        D: `Kondisi acak yang hanya berlangsung pada kondisi darurat tertentu.`,
      },
      pembahasan: `Konsep dasar ${topic} mencakup pemahaman prinsip esensial dan keteraturan fenomena tersebut sesuai silabus ${mataPelajaran}.`,
    },
    {
      kognitif: 'C2 - Memahami',
      kunci: 'C',
      pertanyaan: `Manakah dari pernyataan berikut yang merupakan karakteristik atau ciri penting dari ${topic}?`,
      pilihan: {
        A: `Hanya dapat berlangsung jika terdapat intervensi buatan di laboratorium.`,
        B: `Berjalan seketika tanpa membutuhkan bahan atau energi pendukung apa pun.`,
        C: `Memiliki unsur-unsur saling melengkapi yang bekerja secara harmonis dan terstruktur.`,
        D: `Tidak memberikan pengaruh apa pun terhadap lingkungan kehidupan sehari-hari.`,
      },
      pembahasan: `Karakteristik penting dari ${topic} berada pada keterpaduan komponen dan siklus interaksi yang terukur.`,
    },
    {
      kognitif: 'C3 - Menerapkan',
      kunci: 'A',
      pertanyaan: `Dalam kehidupan sehari-hari di lingkungan sekitar, tindakan yang mencerminkan pemahaman materi ${topic} adalah...`,
      pilihan: {
        A: `Menerapkan kebiasaan bijak dan bertanggung jawab sesuai prinsip ilmiah ${topic}.`,
        B: `Membuang limbah atau sisa pemakaian secara sembarangan di aliran air bersih.`,
        C: `Mengabaikan keselamatan dan petunjuk kerja saat melakukan observasi praktikum.`,
        D: `Menyimpan perlengkapan belajar di tempat lembap tanpa perawatan rutin.`,
      },
      pembahasan: `Penerapan kontekstual ${topic} membimbing siswa untuk berperilaku positif dan berwawasan lingkungan.`,
    },
    {
      kognitif: 'C4 - Menganalisis',
      kunci: 'D',
      pertanyaan: `Apabila terjadi ketidakseimbangan atau gangguan pada tahapan proses ${topic}, akibat yang paling mungkin muncul adalah...`,
      pilihan: {
        A: `Seluruh kegiatan belajar dan siklus alam akan langsung berhenti total.`,
        B: `Tidak terjadi pengaruh apa pun karena setiap bagian berdiri sendiri tanpa hubungan.`,
        C: `Kecepatan proses meningkat berkali-kali lipat tanpa batas kapasitas.`,
        D: `Keseimbangan sistem terganggu dan memicu dampak lanjutan pada komponen pendukung lainnya.`,
      },
      pembahasan: `Analisis sebab-akibat membuktikan adanya ketergantungan dinamis antar komponen dalam ${topic}.`,
    },
    {
      kognitif: 'C5 - Evaluasi & Solusi',
      kunci: 'C',
      pertanyaan: `Sebagai peserta didik yang berkarakter Profil Pelajar Pancasila, solusi terbaik saat menghadapi masalah terkait ${topic} adalah...`,
      pilihan: {
        A: `Menyerahkan seluruh tanggung jawab kepada pihak lain tanpa berkontribusi.`,
        B: `Memilih jalan pintas yang merusak lingkungan asalkan cepat selesai.`,
        C: `Bergotong royong, bernalar kritis dalam menganalisis penyebab, dan merancang tindakan nyata.`,
        D: `Menghindari pembahasan masalah agar tidak menimbulkan perbedaan pendapat.`,
      },
      pembahasan: `Solusi yang mengedepankan nalar kritis dan gotong royong merupakan cerminan penguasaan evaluatif siswa kelas ${kelas}.`,
    },
  ];

  const pgItems = [];
  for (let i = 1; i <= Math.max(1, jumlahPg); i++) {
    const dim = dimensions[(i - 1) % dimensions.length];
    const targetKeys = ['A', 'B', 'C', 'D'];
    const targetKey = targetKeys[(i - 1) % 4];

    // Align options to target key rotation so keys are distributed evenly
    const finalOptions = { ...dim.pilihan };
    let finalKey = dim.kunci;
    if (dim.kunci !== targetKey) {
      const origCorrect = (finalOptions as any)[dim.kunci];
      const origTarget = (finalOptions as any)[targetKey];
      (finalOptions as any)[targetKey] = origCorrect;
      (finalOptions as any)[dim.kunci] = origTarget;
      finalKey = targetKey;
    }

    pgItems.push({
      nomor: i,
      pertanyaan: dim.pertanyaan,
      pilihan: finalOptions,
      kunciJawaban: finalKey,
      pembahasan: dim.pembahasan,
    });
  }

  const esaiQuestions = [
    `Jelaskan secara runtut bagaimana tahapan atau proses ${topic} berlangsung dan mengapa hal tersebut esensial bagi kehidupan kita!`,
    `Berikan 2 contoh konkret penerapan materi ${topic} di lingkungan sekolah atau rumahmu, serta jelaskan manfaat yang dirasakan!`,
    `Analisislah sebuah kendala yang sering terjadi berkaitan dengan ${topic}, lalu berikan saran tindakan perbaikan yang dapat dilakukan siswa!`,
  ];

  const esaiItems = [];
  for (let j = 1; j <= Math.max(0, jumlahEsai); j++) {
    esaiItems.push({
      nomor: j,
      pertanyaan: esaiQuestions[(j - 1) % esaiQuestions.length],
      pedomanPenskoran:
        'Skor 0-5. Kriteria: Menjelaskan konsep dengan tepat (2 poin), memberikan contoh konkret (2 poin), bahasa runtut dan logis (1 poin).',
      kunciJawaban: `Jawaban mencakup penjelasan konsep esensial ${topic}, keterkaitan fenomena nyata, dan solusi tindakan konkret sesuai nalar kritis siswa kelas ${kelas}.`,
    });
  }

  return {
    id: `soal-${Date.now()}`,
    guruId,
    guruName,
    judul: `Naskah ${jenisUjian} ${mataPelajaran} Kelas ${kelas} - ${topikMateri}`,
    mataPelajaran,
    kelas,
    kurikulum,
    jenisUjian: jenisUjian as any,
    tingkatKesulitan: tingkatKesulitan as any,
    topikMateri,
    petunjukUmum:
      'Berdoalah sebelum memulai. Bacalah setiap butir soal dengan teliti dan pilih atau tuliskan jawaban yang paling tepat.',
    pilihanGanda: pgItems,
    esai: esaiItems,
    createdAt: new Date().toISOString(),
  };
}

export function generateFallbackMateri(params: {
  mataPelajaran: string;
  kelas: string;
  topikMateri: string;
  tipe: 'ringkasan' | 'lkpd' | 'remedial';
  guruId?: string;
  guruName?: string;
}): BahanAjarAI {
  const { mataPelajaran, kelas, topikMateri, tipe, guruId, guruName } = params;
  const now = new Date().toISOString();

  let markdown = '';
  if (tipe === 'lkpd') {
    markdown = `# LEMBAR KERJA PESERTA DIDIK (LKPD)
**Mata Pelajaran:** ${mataPelajaran} | **Kelas:** ${kelas}
**Topik Pembelajaran:** ${topikMateri}

---

### A. Tujuan Pembelajaran
1. Peserta didik dapat mengamati dan mengidentifikasi karakteristik ${topikMateri}.
2. Peserta didik dapat bekerja sama dalam kelompok untuk mendiskusikan pemecahan masalah terkait ${topikMateri}.

### B. Alat dan Bahan
- Buku bacaan siswa
- Alat tulis dan kertas kerja
- Kartu pengamatan / gambar penunjang

### C. Langkah Kerja
1. Bentuklah kelompok belajar yang terdiri dari 3–4 orang peserta didik.
2. Cermati teks pengantar dan fenomena kontekstual mengenai ${topikMateri}.
3. Diskusikan dan jawablah pertanyaan analisis berikut:
   - Apa faktor utama yang memengaruhi terjadinya fenomena ${topikMateri}?
   - Bagaimana peran manusia dalam menjaga keseimbangan terkait ${topikMateri}?
4. Sajikan kesimpulan kelompok pada lembar presentasi!

---
*LKPD disusun sesuai kurikulum nasional untuk mendorong keaktifan peserta didik.*`;
  } else if (tipe === 'remedial') {
    markdown = `# PANDUAN PENGAYAAN & REMEDIAL TERSTRUKTUR
**Mata Pelajaran:** ${mataPelajaran} (Kelas ${kelas})
**Materi:** ${topikMateri}

---

### Bagian I: Bimbingan Konsep Dasar (Remedial)
Untuk peserta didik yang belum mencapai nilai KKM/KKTP:
- **Poin Kunci:** Ringkasan inti materi ${topikMateri} difokuskan pada pemahaman kosakata dan konsep fundamental.
- **Aktivitas Mandiri:** Menjawab 3 pertanyaan bertingkat dengan bantuan tutor sebaya atau pendampingan guru.

### Bagian II: Tantangan Berpikir Kritis (Pengayaan)
Untuk peserta didik yang telah melampaui KKM/KKTP:
- **Studi Kasus HOTS:** Menganalisis artikel aktual mengenai penerapan ${topikMateri} di era modern.
- **Proyek Mini:** Membuat infografis atau peta konsep rangkuman materi.`;
  } else {
    markdown = `# RINGKASAN MATERI PEMBELAJARAN
**Mata Pelajaran:** ${mataPelajaran} | **Kelas:** ${kelas}
**Topik Pembelajaran:** ${topikMateri}

---

## 1. Pendahuluan
Materi **${topikMateri}** merupakan salah satu kompetensi penting pada jenjang kelas ${kelas}. Pembahasan ini mengajak peserta didik memahami konsep dasar sekaligus mengenali penerapannya dalam kehidupan sehari-hari.

## 2. Pokok-Pokok Materi
- **Konsep Dasar:** Pengertian dan prinsip kerja atau aturan yang melandasi ${topikMateri}.
- **Ciri dan Karakteristik:** Komponen-komponen pembentuk materi serta fungsi masing-masing elemen.
- **Contoh Kontekstual:** Situasi nyata di sekitar lingkungan rumah dan sekolah yang berkaitan dengan ${topikMateri}.

## 3. Rangkuman Pembelajaran
1. Penguasaan materi ${topikMateri} membekali peserta didik keterampilan bernalar kritis dan memecahkan masalah.
2. Setiap elemen materi memiliki keterikatan yang harmonis untuk mencapai pemahaman bermakna.

---
*Materi disiapkan sebagai panduan guru dan bahan belajar mandiri siswa.*`;
  }

  return {
    id: `materi-${Date.now()}`,
    guruId,
    guruName,
    judul: `Bahan Ajar ${mataPelajaran} Kelas ${kelas} - ${topikMateri}`,
    mataPelajaran,
    kelas,
    topikMateri,
    tipe,
    isiMarkdown: markdown,
    createdAt: now,
  };
}
