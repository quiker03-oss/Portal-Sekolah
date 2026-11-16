import { db } from './database';
import { DetailJawabanSiswa, Siswa } from '../types';

export interface LoadTestResult {
  concurrentUsers: number;
  durationMs: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  totalAnswersSaved: number;
  totalSubmissions: number;
  memoryUsageMb?: number;
  status: 'passed' | 'warning' | 'failed';
  notes: string;
}

/**
 * Runs an isolated in-memory concurrent stress test for multi-school exam traffic.
 * Benchmarks sanitized exam loading, per-question autosave serialization, and auto-grading
 * across N simultaneous virtual students WITHOUT polluting live Firestore or student scoreboards.
 */
export async function runExamLoadSimulation(
  examId: string,
  targetConcurrency: number = 100
): Promise<LoadTestResult> {
  const startTime = performance.now();
  const exam = db.getUjianById(examId);

  if (!exam) {
    throw new Error('Naskah ujian tidak ditemukan untuk uji beban.');
  }

  const allSiswa = db.getSiswaList();
  const simulatedSiswaList: Siswa[] = [];
  for (let i = 0; i < targetConcurrency; i++) {
    const base = allSiswa.length > 0 ? allSiswa[i % allSiswa.length] : null;
    simulatedSiswaList.push({
      id: `sim_stu_${i + 1}`,
      qrId: `STU-SIM-${(i + 1).toString().padStart(5, '0')}`,
      nomorInduk: base?.nomorInduk || `2400${i + 1}`,
      nisn: `999000${(i + 1).toString().padStart(4, '0')}`,
      namaLengkap: `Peserta Simulasi ${i + 1}`,
      tempatLahir: base?.tempatLahir || 'Bandung',
      tanggalLahir: base?.tanggalLahir || '2014-01-01',
      jenisKelamin: i % 2 === 0 ? 'L' : 'P',
      alamat: base?.alamat || '-',
      kelas: base?.kelas || exam.kelasTarget[0] || 'Kelas 1A',
      namaOrangTua: base?.namaOrangTua || '-',
      createdAt: new Date().toISOString(),
    });
  }

  let successfulRequests = 0;
  let failedRequests = 0;
  let totalAnswersSaved = 0;
  let totalSubmissions = 0;
  const latencies: number[] = [];

  // Batch simulation in chunks of 50 to preserve UI responsiveness
  const chunkSize = Math.min(50, targetConcurrency);
  for (let c = 0; c < targetConcurrency; c += chunkSize) {
    const currentBatch = simulatedSiswaList.slice(c, c + chunkSize);

    await Promise.all(
      currentBatch.map(async (student) => {
        const reqStart = performance.now();
        try {
          // 1. Concurrent Fetch: Get sanitized exam for student (keys stripped)
          const studentExam = db.getUjianForStudent(exam.id);
          if (!studentExam) throw new Error('Exam fetch failed');
          if (studentExam.soalList.some((s) => Boolean(s.kunciJawaban))) {
            throw new Error('Security breach: kunciJawaban leaked in student payload');
          }

          // 2. Simulate isolated session creation & serialization
          const jawabanMap: { [soalId: string]: DetailJawabanSiswa } = {};
          const questionsToAnswer = studentExam.soalList.slice(0, 10);
          for (const q of questionsToAnswer) {
            const choices = q.pilihan ? Object.keys(q.pilihan) : ['A'];
            const randomChoice = choices[Math.floor(Math.random() * choices.length)];
            jawabanMap[q.id] = {
              jawabanDipilih: randomChoice,
              waktuJawab: new Date().toISOString(),
            };
            // Exercise JSON serialization path
            JSON.stringify({
              sesiId: `sim_sesi_${exam.id}_${student.id}`,
              soalId: q.id,
              detail: jawabanMap[q.id],
            });
            totalAnswersSaved++;
          }

          // 3. Auto-grading throughput benchmark against real exam rubric
          const graded = db.hitungNilaiSesi(exam, jawabanMap);
          if (typeof graded.nilaiAkhir !== 'number') {
            throw new Error('Grading computation failed');
          }
          totalSubmissions++;

          const reqEnd = performance.now();
          latencies.push(reqEnd - reqStart);
          successfulRequests++;
        } catch {
          failedRequests++;
        }
      })
    );
    // Yield to event loop between batches
    await new Promise((r) => setTimeout(r, 0));
  }

  const endTime = performance.now();
  const durationMs = Math.max(1, Math.round(endTime - startTime));
  const avgLatencyMs =
    latencies.length > 0
      ? Math.max(1, Math.round((latencies.reduce((a, b) => a + b, 0) / latencies.length) * 10) / 10)
      : 0;
  const minLatencyMs = latencies.length > 0 ? Math.round(Math.min(...latencies) * 10) / 10 : 0;
  const maxLatencyMs = latencies.length > 0 ? Math.round(Math.max(...latencies) * 10) / 10 : 0;
  const successRate = Math.round((successfulRequests / targetConcurrency) * 100);

  let status: 'passed' | 'warning' | 'failed' = 'passed';
  let notes =
    'Performa sangat baik (Mode Sandbox Terisolasi): Sanitasi kunci soal, serialisasi autosave, dan penilaian berjalan optimal tanpa mengganggu data siswa asli.';

  if (successRate < 95) {
    status = 'failed';
    notes = 'Terdeteksi kegagalan pemrosesan di atas toleransi 5%.';
  } else if (avgLatencyMs > 500) {
    status = 'warning';
    notes = 'Waktu pemrosesan melambat pada beban tinggi, disarankan optimasi batching.';
  }

  return {
    concurrentUsers: targetConcurrency,
    durationMs,
    avgLatencyMs,
    minLatencyMs,
    maxLatencyMs,
    successfulRequests,
    failedRequests,
    successRate,
    totalAnswersSaved,
    totalSubmissions,
    status,
    notes,
  };
}
