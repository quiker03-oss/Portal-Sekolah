import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../../services/database';
import { sound } from '../../services/audio';
import {
  UjianOnline,
  SoalUjian,
  Siswa,
  JawabanSiswaUjian,
  GameModeType,
  DetailJawabanSiswa,
} from '../../types';
import {
  Sparkles,
  Award,
  Star,
  CheckCircle2,
  HelpCircle,
  RotateCcw,
  Volume2,
  VolumeX,
  ChevronRight,
  ChevronLeft,
  Flame,
  Trophy,
  ArrowRight,
  Lightbulb,
  Clock,
  MapPin,
  Compass,
  Check,
  X,
  Shuffle,
  Eye,
  ZoomIn,
  RefreshCw,
  Home,
  ArrowUp,
  ArrowDown,
  Layers,
  Heart,
} from 'lucide-react';

interface KuisGameInteraktifViewProps {
  ujian: UjianOnline;
  siswa: Siswa;
  onExit: () => void;
}

interface BadgeInfo {
  id: string;
  nama: string;
  deskripsi: string;
  icon: string;
  unlocked: boolean;
}

export const KuisGameInteraktifView: React.FC<KuisGameInteraktifViewProps> = ({
  ujian,
  siswa,
  onExit,
}) => {
  // Game Settings from exam or fallback defaults
  const settings = useMemo(() => {
    return (
      ujian.gameSettings || {
        gameMode: 'petualangan' as GameModeType,
        tingkatKesulitan: 'sedang',
        maksimalPercobaan: 2,
        poinPerSoal: 10,
        batasWaktuPerSoalDetik: 0,
        tampilkanPetunjuk: true,
        efekSuaraAktif: true,
        animasiAktif: true,
        izinkanUlangKuis: true,
        tampilkanPapanPeringkat: true,
        simpanSebagaiNilai: 'latihan_saja',
      }
    );
  }, [ujian]);

  // Audio State
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(() => sound.getMuted());

  // Question navigation
  const questions: SoalUjian[] = useMemo(() => {
    return ujian.soalList || [];
  }, [ujian]);

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const currentQuestion = questions[currentIndex];

  // Game Progress State
  const [score, setScore] = useState<number>(0);
  const [stars, setStars] = useState<number>(0);
  const [streak, setStreak] = useState<number>(0);
  const [maxStreak, setMaxStreak] = useState<number>(0);
  const [solvedQuestions, setSolvedQuestions] = useState<{ [soalId: string]: boolean }>({});
  const [attemptsPerQuestion, setAttemptsPerQuestion] = useState<{ [soalId: string]: number }>({});
  const [answersMap, setAnswersMap] = useState<{ [soalId: string]: DetailJawabanSiswa }>({});

  // Question interaction state for current question
  const [selectedAnswer, setSelectedAnswer] = useState<string>('');
  const [feedbackStatus, setFeedbackStatus] = useState<'idle' | 'correct' | 'wrong' | 'exhausted'>('idle');
  const [hasAwardedScoreForCurrent, setHasAwardedScoreForCurrent] = useState<boolean>(false);
  const [showExplanation, setShowExplanation] = useState<boolean>(false);
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  // Mode F: Matching Pairs interactive state
  const [matchingSelectedLeft, setMatchingSelectedLeft] = useState<string | null>(null);
  const [matchingPairs, setMatchingPairs] = useState<{ [kiri: string]: string }>({});

  // Mode G: Ordering list interactive state
  const [orderingItems, setOrderingItems] = useState<string[]>([]);

  // Mode C: Timer state (if enabled)
  const timerLimit = settings.batasWaktuPerSoalDetik || 0;
  const [timeLeft, setTimeLeft] = useState<number>(timerLimit);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Victory / Final summary
  const [isGameFinished, setIsGameFinished] = useState<boolean>(false);
  const [unlockedBadges, setUnlockedBadges] = useState<string[]>([]);
  const [newlyUnlockedBadge, setNewlyUnlockedBadge] = useState<string | null>(null);

  // Confetti / Celebration trigger
  const [showConfetti, setShowConfetti] = useState<boolean>(false);

  // Restore saved progress if student refreshes
  useEffect(() => {
    const existing = db.getJawabanSiswaByUjian(ujian.id, siswa.id);
    if (existing && existing.isGameMode) {
      if (existing.totalPoinGame !== undefined) setScore(existing.totalPoinGame);
      if (existing.totalBintang !== undefined) setStars(existing.totalBintang);
      if (existing.lencanaDiperoleh) setUnlockedBadges(existing.lencanaDiperoleh);
      if (existing.percobaanPerSoal) setAttemptsPerQuestion(existing.percobaanPerSoal);
      if (existing.jawaban) {
        setAnswersMap(existing.jawaban);
        const solved: { [soalId: string]: boolean } = {};
        Object.keys(existing.jawaban).forEach((qid) => {
          if (existing.jawaban[qid].isBenar) solved[qid] = true;
        });
        setSolvedQuestions(solved);

        // Resume to the first unsolved question
        const firstUnsolved = questions.findIndex((q) => !solved[q.id]);
        if (firstUnsolved >= 0) {
          setCurrentIndex(firstUnsolved);
        } else if (questions.length > 0) {
          setIsGameFinished(true);
        }
      }
    }
  }, [ujian.id, siswa.id, questions]);

  // Synchronize ordering items whenever current question changes in Mode G
  useEffect(() => {
    if (currentQuestion) {
      setFeedbackStatus('idle');
      setSelectedAnswer(answersMap[currentQuestion.id]?.jawabanDipilih || '');
      setHasAwardedScoreForCurrent(Boolean(solvedQuestions[currentQuestion.id]));
      setShowExplanation(false);
      setMatchingSelectedLeft(null);
      setMatchingPairs(answersMap[currentQuestion.id]?.jawabanMenjodohkan || {});

      if (currentQuestion.tipe === 'susun_urutan' || settings.gameMode === 'susun_urutan') {
        const initialList =
          currentQuestion.itemUrutan && currentQuestion.itemUrutan.length > 0
            ? [...currentQuestion.itemUrutan]
            : Object.values(currentQuestion.pilihan || {});
        // If not already shuffled or answered
        setOrderingItems(initialList);
      }

      // Reset timer if Mode C is active
      if (timerLimit > 0) {
        setTimeLeft(timerLimit);
      }
    }
  }, [currentIndex, currentQuestion, answersMap, solvedQuestions, settings.gameMode, timerLimit]);

  // Countdown timer for Mode C
  useEffect(() => {
    if (timerLimit > 0 && !isGameFinished && feedbackStatus === 'idle') {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            handleTimeExpired();
            return 0;
          }
          if (prev <= 6 && !isAudioMuted) {
            sound.playGameTick();
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerLimit, currentIndex, isGameFinished, feedbackStatus, isAudioMuted]);

  // Audio mute toggler
  const handleToggleMute = () => {
    const next = sound.toggleMute();
    setIsAudioMuted(next);
  };

  // Check badges achievement
  const checkAndAwardBadges = (
    currentScore: number,
    currentStars: number,
    currentStreak: number,
    isFinal: boolean,
    hasRetriedSuccessfully: boolean
  ) => {
    const newBadges = [...unlockedBadges];
    let justEarned: string | null = null;

    // Badge 1: Bintang Pemula (Selesaikan 3 soal)
    const solvedCount = Object.keys(solvedQuestions).length + 1;
    if (solvedCount >= 3 && !newBadges.includes('bintang_pemula')) {
      newBadges.push('bintang_pemula');
      justEarned = 'Bintang Pemula 🌟';
    }

    // Badge 2: Penjelajah Ilmu (Streak 3x benar berurutan)
    if (currentStreak >= 3 && !newBadges.includes('penjelajah_ilmu')) {
      newBadges.push('penjelajah_ilmu');
      justEarned = 'Penjelajah Ilmu 🧭';
    }

    // Badge 3: Ahli Matematika (Soal Matematika terjawab benar)
    if (
      ujian.mataPelajaran.toLowerCase().includes('mat') &&
      solvedCount >= 2 &&
      !newBadges.includes('ahli_matematika')
    ) {
      newBadges.push('ahli_matematika');
      justEarned = 'Ahli Matematika 📐';
    }

    // Badge 4: Jago IPA (Soal IPA / IPAS terjawab benar)
    if (
      (ujian.mataPelajaran.toLowerCase().includes('ipa') ||
        ujian.mataPelajaran.toLowerCase().includes('sains')) &&
      solvedCount >= 2 &&
      !newBadges.includes('jago_ipa')
    ) {
      newBadges.push('jago_ipa');
      justEarned = 'Jago IPA 🔬';
    }

    // Badge 5: Juara Ketekunan (Berhasil mencoba lagi setelah salah)
    if (hasRetriedSuccessfully && !newBadges.includes('juara_ketekunan')) {
      newBadges.push('juara_ketekunan');
      justEarned = 'Juara Ketekunan 🏆';
    }

    // Badge 6: Master Kuis (Selesaikan kuis dengan nilai >= KKM)
    if (isFinal) {
      const totalPossible = questions.length * (settings.poinPerSoal || 10);
      const percentage = totalPossible > 0 ? (currentScore / totalPossible) * 100 : 0;
      if (percentage >= (ujian.kkm || 75) && !newBadges.includes('master_kuis')) {
        newBadges.push('master_kuis');
        justEarned = 'Master Kuis 🎓';
      }
    }

    if (newBadges.length > unlockedBadges.length) {
      setUnlockedBadges(newBadges);
      if (justEarned) {
        setNewlyUnlockedBadge(justEarned);
        sound.playGameBadge();
        setTimeout(() => setNewlyUnlockedBadge(null), 4000);
      }
    }

    return newBadges;
  };

  // Save game progress permanently
  const saveProgressToDatabase = (
    updatedAnswers: { [soalId: string]: DetailJawabanSiswa },
    updatedScore: number,
    updatedStars: number,
    updatedAttempts: { [soalId: string]: number },
    badges: string[],
    isFinished: boolean = false
  ) => {
    const totalCount = questions.length;
    const correctCount = Object.values(updatedAnswers).filter((a) => a.isBenar).length;
    const finalGrade = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

    const gameSubmission: JawabanSiswaUjian = {
      id: `game-${ujian.id}-${siswa.id}`,
      ujianId: ujian.id,
      siswaId: siswa.id,
      namaSiswa: siswa.namaLengkap || (siswa as any).nama || 'Siswa',
      nisn: siswa.nisn || siswa.nomorInduk,
      nomorInduk: siswa.nomorInduk,
      kelas: siswa.kelas,
      jawaban: updatedAnswers,
      waktuMulai: new Date().toISOString(),
      waktuSelesai: isFinished ? new Date().toISOString() : undefined,
      status: isFinished ? 'selesai' : 'sedang_mengerjakan',
      isGameMode: true,
      totalPoinGame: updatedScore,
      totalBintang: updatedStars,
      lencanaDiperoleh: badges,
      levelSiswa: Math.floor(updatedScore / 50) + 1,
      xpGame: updatedScore * 10,
      percobaanPerSoal: updatedAttempts,
      jumlahBenar: correctCount,
      jumlahSalah: Math.max(0, totalCount - correctCount),
      nilaiAkhir: finalGrade,
      lulusKkm: finalGrade >= (ujian.kkm || 75),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.saveJawabanSiswaUjian(gameSubmission);
  };

  // Handle Time Expired in Mode C
  const handleTimeExpired = () => {
    if (feedbackStatus !== 'idle') return;
    setFeedbackStatus('exhausted');
    setShowExplanation(true);
    sound.playGameWrongFriendly();
  };

  // 1. Submit Answer & Immediate Evaluation
  const handleEvaluateAnswer = (answerValue: string) => {
    if (!currentQuestion) return;
    if (feedbackStatus === 'correct' || feedbackStatus === 'exhausted') return;

    sound.playGameClick();

    const qId = currentQuestion.id;
    const currentAttempts = (attemptsPerQuestion[qId] || 0) + 1;
    const maxAttempts = settings.maksimalPercobaan || 2;

    const updatedAttempts = {
      ...attemptsPerQuestion,
      [qId]: currentAttempts,
    };
    setAttemptsPerQuestion(updatedAttempts);

    // Normalize answer checking
    const expected = (currentQuestion.kunciJawaban || '').trim().toLowerCase();
    const studentAns = (answerValue || '').trim().toLowerCase();

    // Matching pairs or ordering checks
    let isCorrect = false;
    if (currentQuestion.tipe === 'menjodohkan' || settings.gameMode === 'pasangkan_jawaban') {
      const expectedPairs = currentQuestion.kunciMenjodohkan || {};
      const expectedKeys = Object.keys(expectedPairs);
      if (expectedKeys.length > 0) {
        isCorrect = expectedKeys.every(
          (k) => matchingPairs[k] && matchingPairs[k].toLowerCase() === expectedPairs[k].toLowerCase()
        );
      } else {
        isCorrect = true;
      }
    } else if (currentQuestion.tipe === 'susun_urutan' || settings.gameMode === 'susun_urutan') {
      const expectedOrder = currentQuestion.kunciUrutan || [];
      if (expectedOrder.length > 0) {
        isCorrect = orderingItems.every((item, idx) => item.toLowerCase() === (expectedOrder[idx] || '').toLowerCase());
      } else {
        isCorrect = true;
      }
    } else {
      isCorrect = expected === studentAns;
    }

    if (isCorrect) {
      // Correct on this attempt!
      setFeedbackStatus('correct');
      setShowExplanation(true);

      const hasRetried = currentAttempts > 1;
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      if (nextStreak > maxStreak) setMaxStreak(nextStreak);

      // Stars calculation: attempt 1 = 3 stars, attempt 2 = 2 stars, attempt 3+ = 1 star
      const earnedStars = currentAttempts === 1 ? 3 : currentAttempts === 2 ? 2 : 1;
      const pointsToAdd = hasAwardedScoreForCurrent ? 0 : settings.poinPerSoal || 10;
      const starsToAdd = hasAwardedScoreForCurrent ? 0 : earnedStars;

      const newScore = score + pointsToAdd;
      const newStars = stars + starsToAdd;

      if (!hasAwardedScoreForCurrent) {
        setScore(newScore);
        setStars(newStars);
        setHasAwardedScoreForCurrent(true);
      }

      setSolvedQuestions((prev) => ({ ...prev, [qId]: true }));

      // Sound & Animations
      sound.playGameCorrect();
      setTimeout(() => sound.playGameStar(), 250);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);

      // Save answer record
      const updatedAnswers: { [soalId: string]: DetailJawabanSiswa } = {
        ...answersMap,
        [qId]: {
          jawabanDipilih: answerValue,
          jawabanMenjodohkan: matchingPairs,
          isBenar: true,
          skorDidapat: pointsToAdd,
        },
      };
      setAnswersMap(updatedAnswers);

      // Badges
      const badges = checkAndAwardBadges(newScore, newStars, nextStreak, false, hasRetried);
      saveProgressToDatabase(updatedAnswers, newScore, newStars, updatedAttempts, badges, false);
    } else {
      // Incorrect attempt!
      setStreak(0);
      sound.playGameWrongFriendly();

      if (currentAttempts >= maxAttempts) {
        // All attempts used up -> reveal correct answer and explanation kindly
        setFeedbackStatus('exhausted');
        setShowExplanation(true);

        const updatedAnswers: { [soalId: string]: DetailJawabanSiswa } = {
          ...answersMap,
          [qId]: {
            jawabanDipilih: answerValue,
            jawabanMenjodohkan: matchingPairs,
            isBenar: false,
            skorDidapat: 0,
          },
        };
        setAnswersMap(updatedAnswers);
        saveProgressToDatabase(updatedAnswers, score, stars, updatedAttempts, unlockedBadges, false);
      } else {
        // Still has retry opportunities!
        setFeedbackStatus('wrong');
        // Do not reveal correct answer yet
      }
    }
  };

  // Retry question when wrong and attempts remain
  const handleRetryCurrent = () => {
    setFeedbackStatus('idle');
    setSelectedAnswer('');
  };

  // Advance to next question
  const handleNextQuestion = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // Quiz complete!
      setIsGameFinished(true);
      sound.playGameBadge();
      const badges = checkAndAwardBadges(score, stars, streak, true, false);
      saveProgressToDatabase(answersMap, score, stars, attemptsPerQuestion, badges, true);
    }
  };

  // Move ordering item in Mode G
  const handleMoveOrderItem = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= orderingItems.length) return;
    const copy = [...orderingItems];
    const temp = copy[index];
    copy[index] = copy[targetIndex];
    copy[targetIndex] = temp;
    setOrderingItems(copy);
    sound.playGameClick();
  };

  // Replay quiz if allowed
  const handleRestartQuiz = () => {
    if (!settings.izinkanUlangKuis) return;
    setCurrentIndex(0);
    setScore(0);
    setStars(0);
    setStreak(0);
    setSolvedQuestions({});
    setAttemptsPerQuestion({});
    setAnswersMap({});
    setSelectedAnswer('');
    setFeedbackStatus('idle');
    setShowExplanation(false);
    setIsGameFinished(false);
  };

  // Mascot dynamic advice
  const mascotDialogue = useMemo(() => {
    if (isGameFinished) {
      return 'Luar biasa! Kamu telah menuntaskan seluruh petualangan belajar hari ini dengan penuh semangat!';
    }
    if (feedbackStatus === 'correct') {
      return 'Hebat sekali! Jawabanmu tepat dan bintangmu bertambah! Ayo lanjut ke tantangan berikutnya!';
    }
    if (feedbackStatus === 'wrong') {
      return 'Belum tepat, tapi jangan khawatir! Coba baca petunjuk di bawah dan coba sekali lagi yuk!';
    }
    if (feedbackStatus === 'exhausted') {
      return 'Tidak apa-apa! Setiap kesalahan adalah kesempatan untuk belajar lebih pintar. Pahami penjelasannya ya!';
    }
    if (streak >= 3) {
      return `Luar biasa! Kamu sedang dalam rentetan ${streak} jawaban benar beruntun! Tetap fokus ya!`;
    }
    return 'Baca pertanyaannya dengan santai ya. Aku yakin kamu pasti bisa menjawabnya!';
  }, [feedbackStatus, isGameFinished, streak]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col antialiased selection:bg-amber-400 selection:text-slate-950 font-sans relative overflow-x-hidden">
      {/* Background Ambience / Subtle Grid Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-indigo-950 via-slate-900 to-slate-950 pointer-events-none" />

      {/* Confetti Animation Canvas Overlay */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center animate-ping">
            <Sparkles className="w-96 h-96 text-amber-300 opacity-30" />
          </div>
          <div className="text-4xl animate-bounce">🎉 🌟 🏆 🌟 🎉</div>
        </div>
      )}

      {/* Badge Earned Toast Banner */}
      {newlyUnlockedBadge && (
        <div className="fixed top-20 right-4 z-50 bg-amber-400 text-slate-950 px-5 py-3 rounded-2xl shadow-2xl border-2 border-amber-300 font-black flex items-center gap-3 animate-in slide-in-from-top-6 duration-300">
          <Award className="w-7 h-7 text-amber-900 animate-spin" />
          <div>
            <div className="text-[11px] uppercase tracking-wider font-extrabold text-amber-900">Lencana Baru Diraih!</div>
            <div className="text-sm font-black">{newlyUnlockedBadge}</div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TOP NAVBAR / GAME STATUS BAR */}
      {/* ======================================================== */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 px-4 py-3 sm:px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          {/* Left: Exit & Quiz Info */}
          <div className="flex items-center gap-3">
            <button
              onClick={onExit}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
              title="Keluar dari Kuis"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  {settings.gameMode === 'petualangan' && '🗺️ Petualangan Belajar'}
                  {settings.gameMode === 'kumpulkan_bintang' && '⭐ Kumpulkan Bintang'}
                  {settings.gameMode === 'tantangan_waktu' && '⏱️ Tantangan Waktu'}
                  {settings.gameMode === 'misi_pengetahuan' && '🎯 Misi Pengetahuan'}
                  {settings.gameMode === 'tebak_gambar' && '🖼️ Tebak Gambar'}
                  {settings.gameMode === 'pasangkan_jawaban' && '🧩 Pasangkan Jawaban'}
                  {settings.gameMode === 'susun_urutan' && '🔢 Susun Urutan'}
                </span>
                <span className="text-xs text-slate-400 hidden sm:inline">&bull; {ujian.mataPelajaran}</span>
              </div>
              <h1 className="text-xs sm:text-sm font-bold text-white truncate max-w-xs sm:max-w-md">
                {ujian.judul}
              </h1>
            </div>
          </div>

          {/* Right: Stars, Points, Streak & Sound Mute Button */}
          <div className="flex items-center gap-2 sm:gap-3.5">
            {/* Streak Counter */}
            {streak > 1 && (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-orange-500/20 border border-orange-500/40 text-orange-400 text-xs font-black animate-pulse">
                <Flame className="w-4 h-4 text-orange-400" />
                <span>{streak}x</span>
              </div>
            )}

            {/* Stars Counter */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold text-xs">
              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
              <span>{stars}</span>
            </div>

            {/* Score Counter */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-200 font-black text-xs">
              <Trophy className="w-4 h-4 text-indigo-400" />
              <span>{score} PTS</span>
            </div>

            {/* Audio Toggle */}
            <button
              onClick={handleToggleMute}
              className={`p-2 rounded-xl transition cursor-pointer ${
                isAudioMuted
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
              title={isAudioMuted ? 'Nyalakan Efek Suara' : 'Bisukan Suara'}
            >
              {isAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Global Progress Bar */}
        <div className="max-w-5xl mx-auto mt-2.5">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold mb-1">
            <span>
              Soal {currentIndex + 1} dari {questions.length}
            </span>
            <span>{Math.round(((currentIndex + (feedbackStatus === 'correct' ? 1 : 0)) / questions.length) * 100)}% Selesai</span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all duration-300 rounded-full"
              style={{
                width: `${((currentIndex + (feedbackStatus === 'correct' ? 1 : 0)) / questions.length) * 100}%`,
              }}
            />
          </div>
        </div>
      </header>

      {/* ======================================================== */}
      {/* MAIN GAME CONTENT AREA */}
      {/* ======================================================== */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 flex flex-col justify-center relative z-10">
        {!isGameFinished ? (
          <div className="space-y-6">
            {/* Friendly Mascot Dialogue Bubble */}
            <div className="flex items-start gap-3 bg-slate-800/60 border border-slate-700/80 p-3.5 sm:p-4 rounded-2xl shadow-lg backdrop-blur-xs">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-slate-950 flex items-center justify-center font-black text-2xl shadow-md shrink-0">
                🦊
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-amber-400">Kiki si Kancil Pintar</span>
                  <span className="text-[10px] text-slate-400 font-medium">Pemandu Belajar</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-200 mt-0.5 leading-relaxed font-medium">
                  "{mascotDialogue}"
                </p>
              </div>
            </div>

            {/* Mode C: Per-Question Countdown Timer Bar */}
            {timerLimit > 0 && (
              <div className="bg-slate-800/80 border border-slate-700 p-2.5 rounded-xl flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-amber-300">
                  <Clock className="w-4 h-4 animate-spin" />
                  <span>Sisa Waktu Soal:</span>
                </div>
                <div className="flex-1 max-w-md h-2.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-1000 rounded-full ${
                      timeLeft <= 5 ? 'bg-red-500' : timeLeft <= 15 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${(timeLeft / timerLimit) * 100}%` }}
                  />
                </div>
                <span className="font-mono font-bold text-white">{timeLeft} dtk</span>
              </div>
            )}

            {/* Question Card */}
            {currentQuestion && (
              <div className="bg-slate-800/90 border border-slate-700/90 rounded-3xl p-5 sm:p-7 shadow-2xl backdrop-blur-sm space-y-5">
                {/* Question Header & Points Indicator */}
                <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <span className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-bold text-xs">
                      {currentIndex + 1}
                    </span>
                    <span>Pertanyaan {currentIndex + 1}</span>
                  </span>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-amber-400 flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      <span>+{settings.poinPerSoal || 10} Poin</span>
                    </span>
                    <span className="text-[11px] text-slate-400">
                      (Tersisa {Math.max(0, (settings.maksimalPercobaan || 2) - (attemptsPerQuestion[currentQuestion.id] || 0))}x Coba)
                    </span>
                  </div>
                </div>

                {/* Question Image (Supports Word/PDF extracted illustrations) */}
                {currentQuestion.gambar && (
                  <div className="relative group max-w-lg mx-auto rounded-2xl overflow-hidden border border-slate-700 bg-slate-900/60 p-2">
                    <img
                      src={currentQuestion.gambar}
                      alt="Ilustrasi Soal"
                      className="w-full max-h-64 object-contain rounded-xl cursor-pointer hover:scale-[1.02] transition"
                      onClick={() => setZoomImage(currentQuestion.gambar!)}
                    />
                    <button
                      onClick={() => setZoomImage(currentQuestion.gambar!)}
                      className="absolute bottom-4 right-4 bg-slate-950/80 hover:bg-slate-900 text-white p-2 rounded-xl text-xs flex items-center gap-1.5 border border-slate-700 shadow-md transition cursor-pointer"
                    >
                      <ZoomIn className="w-4 h-4 text-amber-400" />
                      <span>Perbesar</span>
                    </button>
                    {currentQuestion.gambarCaption && (
                      <p className="text-[11px] text-slate-400 text-center mt-1.5 italic">
                        {currentQuestion.gambarCaption}
                      </p>
                    )}
                  </div>
                )}

                {/* Question Prompt Text */}
                <h2 className="text-base sm:text-lg md:text-xl font-bold text-white leading-relaxed">
                  {currentQuestion.pertanyaan}
                </h2>

                {/* ====================================================== */}
                {/* INTERACTIVE CHOICES / ANSWER CONTROLS */}
                {/* ====================================================== */}

                {/* Sub-Type 1: Mode F (Matching Pairs) */}
                {currentQuestion.tipe === 'menjodohkan' || settings.gameMode === 'pasangkan_jawaban' ? (
                  <div className="space-y-3 pt-2">
                    <p className="text-xs text-amber-300 font-semibold flex items-center gap-1.5">
                      <HelpCircle className="w-4 h-4" />
                      <span>Klik satu item di sebelah kiri, lalu klik pasangannya di sebelah kanan:</span>
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      {/* Left Column */}
                      <div className="space-y-2">
                        {(currentQuestion.pasanganMenjodohkan || []).map((pair) => {
                          const isSelected = matchingSelectedLeft === pair.kiri;
                          const isPaired = Boolean(matchingPairs[pair.kiri]);

                          return (
                            <button
                              key={`left-${pair.id}`}
                              disabled={feedbackStatus === 'correct' || feedbackStatus === 'exhausted'}
                              onClick={() => {
                                sound.playGameClick();
                                setMatchingSelectedLeft(pair.kiri);
                              }}
                              className={`w-full text-left p-3 rounded-2xl font-bold transition flex items-center justify-between border cursor-pointer ${
                                isSelected
                                  ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-lg scale-[1.02]'
                                  : isPaired
                                  ? 'bg-indigo-900/40 text-indigo-200 border-indigo-700'
                                  : 'bg-slate-900/80 text-slate-200 border-slate-700 hover:bg-slate-800'
                              }`}
                            >
                              <span>{pair.kiri}</span>
                              {isPaired && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-normal">
                                  ➜ {matchingPairs[pair.kiri]}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Right Column */}
                      <div className="space-y-2">
                        {(currentQuestion.pasanganMenjodohkan || []).map((pair) => {
                          const isPairedWithActive =
                            matchingSelectedLeft && matchingPairs[matchingSelectedLeft] === pair.kanan;

                          return (
                            <button
                              key={`right-${pair.id}`}
                              disabled={
                                !matchingSelectedLeft ||
                                feedbackStatus === 'correct' ||
                                feedbackStatus === 'exhausted'
                              }
                              onClick={() => {
                                if (!matchingSelectedLeft) return;
                                sound.playGameClick();
                                setMatchingPairs((prev) => ({
                                  ...prev,
                                  [matchingSelectedLeft]: pair.kanan,
                                }));
                                setMatchingSelectedLeft(null);
                              }}
                              className={`w-full text-left p-3 rounded-2xl font-bold transition border cursor-pointer ${
                                isPairedWithActive
                                  ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500'
                                  : matchingSelectedLeft
                                  ? 'bg-slate-800 text-white border-amber-500/50 hover:bg-amber-400 hover:text-slate-950'
                                  : 'bg-slate-900/60 text-slate-400 border-slate-800 cursor-not-allowed'
                              }`}
                            >
                              <span>{pair.kanan}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Submit Matching Pairs Button */}
                    {feedbackStatus === 'idle' && (
                      <div className="pt-3 flex justify-end">
                        <button
                          onClick={() => handleEvaluateAnswer('checked')}
                          className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-6 py-2.5 rounded-2xl text-xs transition shadow-lg flex items-center gap-2 cursor-pointer"
                        >
                          <Check className="w-4 h-4" />
                          <span>Periksa Pasangan</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : currentQuestion.tipe === 'susun_urutan' || settings.gameMode === 'susun_urutan' ? (
                  /* Sub-Type 2: Mode G (Susun Urutan) */
                  <div className="space-y-3 pt-2">
                    <p className="text-xs text-amber-300 font-semibold flex items-center gap-1.5">
                      <Shuffle className="w-4 h-4" />
                      <span>Susun urutan berikut dengan menekan tombol panah naik atau turun:</span>
                    </p>

                    <div className="space-y-2">
                      {orderingItems.map((item, idx) => (
                        <div
                          key={`item-${idx}`}
                          className="flex items-center justify-between p-3 rounded-2xl bg-slate-900/80 border border-slate-700 text-xs text-white"
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-300 font-black flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="font-bold">{item}</span>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              disabled={idx === 0 || feedbackStatus !== 'idle'}
                              onClick={() => handleMoveOrderItem(idx, 'up')}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 cursor-pointer"
                              title="Pindahkan ke atas"
                            >
                              <ArrowUp className="w-4 h-4" />
                            </button>
                            <button
                              disabled={idx === orderingItems.length - 1 || feedbackStatus !== 'idle'}
                              onClick={() => handleMoveOrderItem(idx, 'down')}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 cursor-pointer"
                              title="Pindahkan ke bawah"
                            >
                              <ArrowDown className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {feedbackStatus === 'idle' && (
                      <div className="pt-3 flex justify-end">
                        <button
                          onClick={() => handleEvaluateAnswer(orderingItems.join('->'))}
                          className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-6 py-2.5 rounded-2xl text-xs transition shadow-lg flex items-center gap-2 cursor-pointer"
                        >
                          <Check className="w-4 h-4" />
                          <span>Periksa Urutan</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Sub-Type 3: Standard Multiple Choice / True-False */
                  <div className="grid grid-cols-1 gap-3 pt-2">
                    {Object.entries(currentQuestion.pilihan || {}).map(([key, text]) => {
                      const isChosen = selectedAnswer === key;
                      const isCorrectKey =
                        (currentQuestion.kunciJawaban || '').trim().toLowerCase() === key.toLowerCase();

                      // Visual states when evaluated
                      let buttonStyle = 'bg-slate-900/80 hover:bg-slate-800 text-slate-100 border-slate-700';
                      if (feedbackStatus === 'correct' && isChosen) {
                        buttonStyle = 'bg-emerald-500/30 border-emerald-400 text-emerald-200 ring-2 ring-emerald-400';
                      } else if (feedbackStatus === 'wrong' && isChosen) {
                        buttonStyle = 'bg-rose-500/30 border-rose-400 text-rose-200 ring-2 ring-rose-400';
                      } else if (feedbackStatus === 'exhausted') {
                        if (isCorrectKey) {
                          buttonStyle = 'bg-emerald-500/30 border-emerald-400 text-emerald-200 ring-2 ring-emerald-400';
                        } else if (isChosen) {
                          buttonStyle = 'bg-rose-500/30 border-rose-400 text-rose-200';
                        }
                      } else if (isChosen) {
                        buttonStyle = 'bg-indigo-600/40 border-indigo-400 text-white ring-2 ring-indigo-400';
                      }

                      return (
                        <button
                          key={key}
                          disabled={feedbackStatus === 'correct' || feedbackStatus === 'exhausted'}
                          onClick={() => {
                            setSelectedAnswer(key);
                            handleEvaluateAnswer(key);
                          }}
                          className={`w-full text-left p-4 rounded-2xl border transition-all duration-150 flex items-center gap-3.5 group cursor-pointer shadow-sm ${buttonStyle}`}
                        >
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0 transition ${
                              isChosen
                                ? 'bg-amber-400 text-slate-950 font-black'
                                : 'bg-slate-800 text-slate-300 group-hover:bg-slate-700'
                            }`}
                          >
                            {key}
                          </div>
                          <span className="text-xs sm:text-sm font-semibold leading-relaxed flex-1">
                            {text}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* ====================================================== */}
                {/* IMMEDIATE EVALUATION FEEDBACK OVERLAY / RESULT BOX */}
                {/* ====================================================== */}
                {feedbackStatus === 'correct' && (
                  <div className="p-4 sm:p-5 rounded-2xl bg-emerald-500/20 border-2 border-emerald-500/60 text-emerald-200 space-y-3 animate-in zoom-in-95 duration-200">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-slate-950 flex items-center justify-center font-black text-xl shadow-lg shrink-0">
                        <CheckCircle2 className="w-7 h-7 text-slate-950" />
                      </div>
                      <div>
                        <h3 className="text-base sm:text-lg font-black text-emerald-300 tracking-tight">
                          BENAR! HEBAT SEKALI! 🎉
                        </h3>
                        <p className="text-xs text-emerald-200/90 font-medium">
                          +{settings.poinPerSoal || 10} Poin &bull; Bintang bertambah!
                        </p>
                      </div>
                    </div>

                    {/* Educational Explanation */}
                    {(currentQuestion.penjelasanBenar || currentQuestion.pembahasan) && (
                      <div className="p-3 rounded-xl bg-slate-900/60 border border-emerald-500/30 text-xs text-emerald-100/90 leading-relaxed">
                        <strong className="text-emerald-300 block mb-0.5">Penjelasan Edukatif:</strong>
                        {currentQuestion.penjelasanBenar || currentQuestion.pembahasan}
                      </div>
                    )}

                    <div className="flex justify-end pt-1">
                      <button
                        onClick={handleNextQuestion}
                        className="bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-black px-6 py-3 rounded-2xl text-xs sm:text-sm transition shadow-lg flex items-center gap-2 cursor-pointer"
                      >
                        <span>Lanjut ke Soal Berikutnya</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {feedbackStatus === 'wrong' && (
                  <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/20 border-2 border-amber-500/60 text-amber-200 space-y-3 animate-in zoom-in-95 duration-200">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black text-xl shadow-lg shrink-0">
                        <RotateCcw className="w-6 h-6 text-slate-950" />
                      </div>
                      <div>
                        <h3 className="text-base sm:text-lg font-black text-amber-300 tracking-tight">
                          BELUM TEPAT, AYO COBA LAGI! ✨
                        </h3>
                        <p className="text-xs text-amber-200/90 font-medium">
                          Sisa kesempatan: {Math.max(0, (settings.maksimalPercobaan || 2) - (attemptsPerQuestion[currentQuestion.id] || 0))} kali percobaan.
                        </p>
                      </div>
                    </div>

                    {/* Educational Hint (Petunjuk yang tidak membocorkan kunci) */}
                    {settings.tampilkanPetunjuk && (
                      <div className="p-3.5 rounded-xl bg-slate-900/70 border border-amber-500/40 text-xs text-amber-100 leading-relaxed flex items-start gap-2.5">
                        <Lightbulb className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-amber-300 block mb-0.5">Petunjuk Belajar:</strong>
                          <p>
                            {currentQuestion.petunjuk ||
                              'Perhatikan kembali konsep utama pada pertanyaan, teliti setiap pilihan dengan seksama, dan eliminasi pilihan yang kurang masuk akal.'}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end pt-1">
                      <button
                        onClick={handleRetryCurrent}
                        className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-6 py-2.5 rounded-2xl text-xs sm:text-sm transition shadow-lg flex items-center gap-2 cursor-pointer"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>Coba Jawab Lagi</span>
                      </button>
                    </div>
                  </div>
                )}

                {feedbackStatus === 'exhausted' && (
                  <div className="p-4 sm:p-5 rounded-2xl bg-indigo-950/60 border-2 border-indigo-500/50 text-indigo-200 space-y-3 animate-in zoom-in-95 duration-200">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-500 text-white flex items-center justify-center font-black text-xl shadow-lg shrink-0">
                        <HelpCircle className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-base sm:text-lg font-black text-indigo-300 tracking-tight">
                          KESEMPATAN HABIS — MARI KITA PELAJARI BERSAMA 📖
                        </h3>
                        <p className="text-xs text-indigo-300 font-medium">
                          Jawaban yang benar adalah:{' '}
                          <strong className="text-amber-300 text-sm underline">
                            {currentQuestion.kunciJawaban}
                          </strong>
                        </p>
                      </div>
                    </div>

                    {/* Full Explanation */}
                    <div className="p-3.5 rounded-xl bg-slate-900/80 border border-indigo-500/30 text-xs text-slate-200 leading-relaxed">
                      <strong className="text-amber-300 block mb-1">Pembahasan & Penjelasan Materi:</strong>
                      <p>
                        {currentQuestion.penjelasanBenar ||
                          currentQuestion.pembahasan ||
                          `Jawaban yang tepat adalah ${currentQuestion.kunciJawaban}. Jangan berkecil hati, yuk pahami materinya dan kita coba lebih baik di soal selanjutnya!`}
                      </p>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        onClick={handleNextQuestion}
                        className="bg-indigo-500 hover:bg-indigo-400 text-white font-black px-6 py-3 rounded-2xl text-xs sm:text-sm transition shadow-lg flex items-center gap-2 cursor-pointer"
                      >
                        <span>Lanjut ke Soal Berikutnya</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* ======================================================== */
          /* FINAL GAME OVER / VICTORY SUMMARY CARD */
          /* ======================================================== */
          <div className="bg-slate-800/90 border border-slate-700 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md max-w-2xl mx-auto text-center space-y-6 animate-in zoom-in-95 duration-300">
            {/* Victory Mascot & Header */}
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-400 to-orange-500 mx-auto flex items-center justify-center text-4xl shadow-xl animate-bounce">
              🏆
            </div>

            <div>
              <span className="text-xs font-black uppercase tracking-widest text-amber-400">
                Misi Pembelajaran Selesai!
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-1">
                SELAMAT, {siswa.namaLengkap || (siswa as any).nama || 'TEMAN PINTAR'}!
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                Kamu telah menyelesaikan seluruh tantangan kuis pada {ujian.judul}.
              </p>
            </div>

            {/* Metric Highlights */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-700">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Skor</span>
                <span className="text-2xl sm:text-3xl font-black text-indigo-400">{score}</span>
                <span className="text-[10px] text-slate-500 block">Poin Belajar</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-700">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Bintang</span>
                <span className="text-2xl sm:text-3xl font-black text-amber-400 flex items-center justify-center gap-1">
                  <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                  <span>{stars}</span>
                </span>
                <span className="text-[10px] text-slate-500 block">Koleksi Bintang</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-700">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Akurasi</span>
                <span className="text-2xl sm:text-3xl font-black text-emerald-400">
                  {questions.length > 0
                    ? Math.round(
                        (Object.values(answersMap).filter((a) => a.isBenar).length / questions.length) * 100
                      )
                    : 100}
                  %
                </span>
                <span className="text-[10px] text-slate-500 block">Ketepatan Jawaban</span>
              </div>
            </div>

            {/* Badges Earned Gallery */}
            <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-700/80 text-left space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-amber-400" />
                  <span>Lencana yang Berhasil Diraih:</span>
                </span>
                <span className="text-[11px] text-amber-400 font-semibold">{unlockedBadges.length} Lencana</span>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {[
                  { id: 'bintang_pemula', name: 'Bintang Pemula', icon: '🌟' },
                  { id: 'penjelajah_ilmu', name: 'Penjelajah Ilmu', icon: '🧭' },
                  { id: 'ahli_matematika', name: 'Ahli Matematika', icon: '📐' },
                  { id: 'jago_ipa', name: 'Jago IPA', icon: '🔬' },
                  { id: 'juara_ketekunan', name: 'Juara Ketekunan', icon: '🏆' },
                  { id: 'master_kuis', name: 'Master Kuis', icon: '🎓' },
                ].map((b) => {
                  const isUnlocked = unlockedBadges.includes(b.id);
                  return (
                    <div
                      key={b.id}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition ${
                        isUnlocked
                          ? 'bg-amber-400/20 text-amber-300 border-amber-400/40'
                          : 'bg-slate-800/40 text-slate-600 border-slate-800 opacity-40'
                      }`}
                    >
                      <span>{b.icon}</span>
                      <span>{b.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {settings.izinkanUlangKuis && (
                <button
                  onClick={handleRestartQuiz}
                  className="bg-slate-700 hover:bg-slate-600 text-white font-bold px-5 py-3 rounded-2xl text-xs transition flex items-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Mainkan Lagi</span>
                </button>
              )}

              <button
                onClick={onExit}
                className="bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-black px-6 py-3 rounded-2xl text-xs sm:text-sm transition shadow-lg flex items-center gap-2 cursor-pointer"
              >
                <Home className="w-4 h-4" />
                <span>Selesai & Kembali ke Portal</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Image Modal Lightbox */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xs flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setZoomImage(null)}
        >
          <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center">
            <button
              onClick={() => setZoomImage(null)}
              className="absolute -top-10 right-0 text-white bg-slate-800 p-2 rounded-full cursor-pointer hover:bg-slate-700"
            >
              <X className="w-6 h-6" />
            </button>
            <img src={zoomImage} alt="Perbesar Ilustrasi" className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  );
};
