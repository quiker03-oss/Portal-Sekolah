// Complete single-file Web App frontend for Google Apps Script HtmlService
// File: Index.html in Google Apps Script

export const INDEX_HTML_CONTENT = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>SDN 2 GIRIHARJA - Website Sekolah Digital</title>
  
  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  
  <!-- jsQR Scanner Library -->
  <script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js"></script>
  
  <!-- Google Fonts: Plus Jakarta Sans -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  
  <style>
    body {
      font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
    }
    .scanner-overlay {
      background: rgba(0, 0, 0, 0.4);
    }
    .scanner-box {
      border: 3px solid #38bdf8;
      box-shadow: 0 0 25px #0284c7;
      animation: pulse-border 2s infinite;
    }
    @keyframes pulse-border {
      0%, 100% { border-color: #38bdf8; }
      50% { border-color: #facc15; }
    }
    @media print {
      .no-print { display: none !important; }
      .print-only { display: block !important; }
    }
  </style>
</head>
<body class="bg-slate-50 text-slate-900 min-h-screen antialiased flex flex-col">

  <!-- NAVBAR UTAMA -->
  <header class="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
      <div class="flex items-center gap-3 cursor-pointer" onclick="showView('landing')">
        <div class="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-lg shadow-sm">
          G2
        </div>
        <div>
          <h1 class="text-base font-black tracking-tight text-slate-900">SDN 2 GIRIHARJA</h1>
          <p class="text-xs text-blue-700 font-semibold tracking-wide">Website Sekolah Digital & Presensi</p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <div id="userBadge" class="hidden items-center gap-2 pr-2 border-r border-slate-200">
          <span id="userNameText" class="text-xs font-bold text-slate-700"></span>
          <span id="userRoleBadge" class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-blue-100 text-blue-800"></span>
        </div>
        
        <button id="navLoginBtn" onclick="openLoginModal()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition">
          Login Pegawai
        </button>

        <button id="navLogoutBtn" onclick="handleLogout()" class="hidden px-3 py-2 bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-700 text-xs font-bold rounded-xl transition">
          Keluar
        </button>
      </div>
    </div>
  </header>

  <!-- POPUP NOTIFIKASI HASIL SCAN BESAR DI LAYAR (AUTO DISMISS 2.5 DETIK) -->
  <div id="scanResultModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm hidden transition-all">
    <div id="scanResultCard" class="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 text-center shadow-2xl border-4 transition-transform transform scale-95 duration-200">
      <div id="scanResultIcon" class="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl">
        ✅
      </div>
      
      <h3 id="scanResultTitle" class="text-2xl font-black mb-2 tracking-tight">
        ABSENSI BERHASIL
      </h3>
      
      <div id="scanResultDetails" class="bg-slate-50 border border-slate-200 rounded-2xl p-4 my-4 text-left text-sm space-y-1.5 font-medium text-slate-700">
        <!-- Details injected here -->
      </div>
      
      <p id="scanCountdownText" class="text-xs text-slate-500 font-bold uppercase tracking-wider animate-pulse">
        Scan berikutnya dalam 2 detik...
      </p>
    </div>
  </div>

  <!-- CONTAINER KONTEN -->
  <main class="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
    
    <!-- VIEW 1: LANDING PAGE -->
    <div id="view-landing" class="space-y-8">
      <!-- Hero Banner -->
      <section class="rounded-3xl bg-gradient-to-br from-blue-700 via-blue-600 to-sky-500 text-white p-8 sm:p-12 shadow-lg relative overflow-hidden">
        <div class="relative z-10 max-w-2xl space-y-4">
          <span class="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-bold tracking-wider uppercase">
            Official School Portal
          </span>
          <h2 class="text-3xl sm:text-4xl font-black leading-tight tracking-tight">
            Selamat Datang di Portal Digital SDN 2 GIRIHARJA
          </h2>
          <p class="text-blue-100 text-sm sm:text-base leading-relaxed">
            Mewujudkan generasi berakhlak mulia, cerdas, berprestasi, dan siap menghadapi era teknologi modern dengan presensi QR Code dan e-Rapor digital terpadu.
          </p>
          <div class="flex flex-wrap gap-3 pt-2">
            <button onclick="openScannerView()" class="px-6 py-3 bg-white text-blue-700 font-extrabold text-sm rounded-xl shadow-md hover:bg-blue-50 transition">
              📷 Buka Scanner Absensi
            </button>
            <button onclick="openLoginModal()" class="px-6 py-3 bg-blue-800/60 hover:bg-blue-800 text-white font-bold text-sm rounded-xl backdrop-blur-md transition">
              Masuk Dashboard Guru
            </button>
          </div>
        </div>
      </section>

      <!-- Sambutan & Visi Misi -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs md:col-span-2">
          <h3 class="text-lg font-bold text-slate-900 mb-3">Sambutan Kepala Sekolah</h3>
          <p class="text-sm text-slate-600 leading-relaxed italic">
            "Puji syukur kita panjatkan ke hadirat Allah SWT. Dengan hadirnya sistem sekolah digital SDN 2 Giriharja berbasis Google Apps Script dan Google Sheets, proses presensi harian siswa serta penilaian e-Rapor dapat diakses secara transparan, akurat, dan cepat oleh dewan guru."
          </p>
          <div class="mt-4 pt-4 border-t border-slate-100 flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center">
              KS
            </div>
            <div>
              <p class="text-xs font-bold text-slate-800">Drs. H. Ahmad Sudrajat, M.Pd.</p>
              <p class="text-[11px] text-slate-500">Kepala SDN 2 Giriharja</p>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
          <h3 class="text-lg font-bold text-slate-900 mb-3">Visi & Misi</h3>
          <p class="text-xs text-blue-700 font-bold mb-2">Visi:</p>
          <p class="text-xs text-slate-600 leading-relaxed mb-4">
            Terwujudnya peserta didik yang beriman, berakhlak mulia, berprestasi, dan berbudaya lingkungan melalui pemanfaatan teknologi digital.
          </p>
          <p class="text-xs text-blue-700 font-bold mb-1">Motto:</p>
          <span class="px-2.5 py-1 rounded-md bg-yellow-100 text-yellow-800 text-xs font-bold">
            Berprestasi - Berakhlak Mulia
          </span>
        </div>
      </div>
    </div>

    <!-- VIEW 2: SCANNER KAMERA ABSENSI -->
    <div id="view-scanner" class="hidden max-w-xl mx-auto space-y-6">
      <div class="flex items-center justify-between">
        <button onclick="showView('landing')" class="text-xs font-bold text-slate-600 hover:text-blue-600 flex items-center gap-1">
          ← Kembali ke Beranda
        </button>
        <span class="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold flex items-center gap-1">
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span> Kamera Siap
        </span>
      </div>

      <div class="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm text-center">
        <h2 class="text-xl font-black text-slate-900 mb-1">Scan QR Code Absensi</h2>
        <p class="text-xs text-slate-500 mb-4">Arahkan QR Code Siswa atau Guru ke dalam kotak kamera</p>

        <!-- Mode Toggle (Siswa vs Guru) -->
        <div class="flex p-1 bg-slate-100 rounded-xl mb-4 max-w-xs mx-auto">
          <button id="modeStudentBtn" onclick="setScanMode('student')" class="flex-1 py-1.5 rounded-lg text-xs font-bold bg-white text-blue-700 shadow-xs">
            Absensi Siswa
          </button>
          <button id="modeTeacherBtn" onclick="setScanMode('teacher')" class="flex-1 py-1.5 rounded-lg text-xs font-bold text-slate-600">
            Absensi Guru
          </button>
        </div>

        <!-- Video & Canvas Container -->
        <div class="relative w-full aspect-square max-w-sm mx-auto rounded-2xl overflow-hidden bg-black flex items-center justify-center shadow-inner">
          <video id="scanVideo" playsinline class="w-full h-full object-cover"></video>
          <canvas id="scanCanvas" class="hidden"></canvas>
          
          <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div class="scanner-box w-3/4 h-3/4 rounded-2xl"></div>
          </div>
        </div>

        <!-- Tombol Beralih Kamera -->
        <div class="mt-4 flex justify-center gap-2">
          <button onclick="toggleCameraFacing()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition">
            🔄 Ganti Kamera Depan/Belakang
          </button>
        </div>

        <!-- Input Manual Alternatif -->
        <div class="mt-6 pt-4 border-t border-slate-100 text-left">
          <label class="text-xs font-bold text-slate-700 block mb-1">Input Manual Kode QR:</label>
          <div class="flex gap-2">
            <input id="manualQrInput" type="text" placeholder="Contoh: STU-00001 atau TCH-00001" class="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-xs uppercase font-mono">
            <button onclick="handleManualQrSubmit()" class="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700">
              Kirim
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- VIEW 3: DASHBOARD ADMIN & GURU -->
    <div id="view-dashboard" class="hidden space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 class="text-xl font-black text-slate-900" id="dashWelcomeTitle">Dashboard</h2>
          <p class="text-xs text-slate-500" id="dashWelcomeSubtitle">Selamat bertugas di SDN 2 Giriharja</p>
        </div>
        <div class="flex gap-2">
          <button onclick="openScannerView()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs">
            📷 Mulai Scan QR
          </button>
        </div>
      </div>

      <!-- Quick Action Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div onclick="openScannerView()" class="p-5 bg-blue-50 border border-blue-200 rounded-2xl cursor-pointer hover:bg-blue-100 transition text-center">
          <span class="text-3xl block mb-2">📸</span>
          <p class="text-xs font-bold text-blue-900">Scan Absensi</p>
          <p class="text-[10px] text-blue-700">Siswa & Guru</p>
        </div>

        <div onclick="showTab('rekap')" class="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl cursor-pointer hover:bg-emerald-100 transition text-center">
          <span class="text-3xl block mb-2">📊</span>
          <p class="text-xs font-bold text-emerald-900">Rekap Presensi</p>
          <p class="text-[10px] text-emerald-700">Google Sheets Sync</p>
        </div>

        <div onclick="showTab('erapor')" class="p-5 bg-purple-50 border border-purple-200 rounded-2xl cursor-pointer hover:bg-purple-100 transition text-center">
          <span class="text-3xl block mb-2">📝</span>
          <p class="text-xs font-bold text-purple-900">e-Rapor</p>
          <p class="text-[10px] text-purple-700">Tugas, UTS, UAS</p>
        </div>

        <div onclick="showTab('siswa')" class="p-5 bg-amber-50 border border-amber-200 rounded-2xl cursor-pointer hover:bg-amber-100 transition text-center">
          <span class="text-3xl block mb-2">🎓</span>
          <p class="text-xs font-bold text-amber-900">Data Siswa & QR</p>
          <p class="text-[10px] text-amber-700">Cetak Kartu QR</p>
        </div>
      </div>

      <!-- Live Attendance Stream -->
      <div class="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <h3 class="text-sm font-bold text-slate-900 mb-4 flex items-center justify-between">
          <span>Riwayat Absensi Hari Ini</span>
          <span class="text-xs text-blue-600 font-normal cursor-pointer" onclick="refreshData()">Muat Ulang Data</span>
        </h3>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="border-b border-slate-100 text-slate-500 font-bold">
                <th class="py-2.5 px-3">Jam</th>
                <th class="py-2.5 px-3">Nama Siswa / Guru</th>
                <th class="py-2.5 px-3">Kelas / Peran</th>
                <th class="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody id="attendanceRecentTable" class="divide-y divide-slate-100 text-slate-700 font-medium">
              <tr>
                <td colspan="4" class="py-6 text-center text-slate-400">Belum ada pemindaian hari ini.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

  </main>

  <!-- MODAL LOGIN GURU / ADMIN -->
  <div id="loginModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs hidden">
    <div class="w-full max-w-sm bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200">
      <div class="text-center mb-6">
        <div class="w-12 h-12 rounded-2xl bg-blue-600 text-white font-black text-xl flex items-center justify-center mx-auto mb-3">
          G2
        </div>
        <h3 class="text-xl font-bold text-slate-900">Login Pegawai</h3>
        <p class="text-xs text-slate-500 mt-1">Khusus Admin & Dewan Guru SDN 2 Giriharja</p>
      </div>

      <form onsubmit="handleLoginSubmit(event)" class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Username</label>
          <input id="loginUsername" type="text" required placeholder="admin atau guru1" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 outline-none">
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Password</label>
          <input id="loginPassword" type="password" required placeholder="••••••••" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 outline-none">
        </div>

        <div id="loginErrorMsg" class="hidden text-xs text-red-600 font-bold p-2.5 rounded-xl bg-red-50 border border-red-200"></div>

        <button type="submit" id="loginSubmitBtn" class="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition">
          Masuk ke Sistem
        </button>

        <button type="button" onclick="closeLoginModal()" class="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition">
          Batal
        </button>
      </form>
    </div>
  </div>

  <!-- JAVASCRIPT LENGKAP -->
  <script>
    // State Aplikasi
    var currentUser = null;
    var scanMode = 'student'; // 'student' | 'teacher'
    var videoStream = null;
    var currentFacingMode = 'environment'; // 'environment' | 'user'
    var isScanning = false;
    var isProcessingQr = false;

    // Web Audio API Beep Synthesizer (Bebas dari dependensi audio MP3 eksternal!)
    var audioCtx = null;
    function playBeep(type) {
      try {
        if (!audioCtx) {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        if (type === 'success') {
          // Bunyi "ting" cerah gembira (880Hz -> 1320Hz)
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, audioCtx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.15);
          gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.25);
        } else {
          // Bunyi "buzzer" gagal / peringatan (220Hz low tone)
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(240, audioCtx.currentTime);
          gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.35);
        }
      } catch (e) {
        console.warn("Audio unavailable:", e);
      }
    }

    // Tampilkan View
    function showView(viewName) {
      document.getElementById('view-landing').classList.add('hidden');
      document.getElementById('view-scanner').classList.add('hidden');
      document.getElementById('view-dashboard').classList.add('hidden');

      if (viewName !== 'scanner' && videoStream) {
        stopCamera();
      }

      var target = document.getElementById('view-' + viewName);
      if (target) target.classList.remove('hidden');
    }

    function openScannerView() {
      showView('scanner');
      startCamera();
    }

    function setScanMode(mode) {
      scanMode = mode;
      var sBtn = document.getElementById('modeStudentBtn');
      var tBtn = document.getElementById('modeTeacherBtn');
      if (mode === 'student') {
        sBtn.className = "flex-1 py-1.5 rounded-lg text-xs font-bold bg-white text-blue-700 shadow-xs";
        tBtn.className = "flex-1 py-1.5 rounded-lg text-xs font-bold text-slate-600";
      } else {
        tBtn.className = "flex-1 py-1.5 rounded-lg text-xs font-bold bg-white text-blue-700 shadow-xs";
        sBtn.className = "flex-1 py-1.5 rounded-lg text-xs font-bold text-slate-600";
      }
    }

    // KAMERA & SCANNER (jsQR)
    function startCamera() {
      var video = document.getElementById('scanVideo');
      var constraints = {
        video: { facingMode: currentFacingMode }
      };

      navigator.mediaDevices.getUserMedia(constraints)
        .then(function(stream) {
          videoStream = stream;
          video.srcObject = stream;
          video.setAttribute('playsinline', true);
          video.play();
          isScanning = true;
          requestAnimationFrame(tickScanner);
        })
        .catch(function(err) {
          console.error("Camera access error:", err);
          alert("Gagal membuka kamera: " + err.message + "\\nPastikan izin kamera diaktifkan di browser Anda.");
        });
    }

    function stopCamera() {
      isScanning = false;
      if (videoStream) {
        videoStream.getTracks().forEach(function(track) { track.stop(); });
        videoStream = null;
      }
    }

    function toggleCameraFacing() {
      stopCamera();
      currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
      startCamera();
    }

    function tickScanner() {
      if (!isScanning) return;
      var video = document.getElementById('scanVideo');
      var canvas = document.getElementById('scanCanvas');
      var ctx = canvas.getContext('2d');

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });

        if (code && code.data && !isProcessingQr) {
          isProcessingQr = true;
          processScannedCode(code.data.trim());
        }
      }

      if (isScanning) {
        requestAnimationFrame(tickScanner);
      }
    }

    // Pemrosesan Hasil Scan QR
    function processScannedCode(qrString) {
      // Panggil backend Google Apps Script
      var action = scanMode === 'student' ? 'scanAbsensiSiswa' : 'scanAbsensiGuru';
      var payload = {
        qrId: qrString,
        petugasScan: currentUser ? currentUser.nama : "Kamera Mandiri"
      };

      // Jalankan fungsi backend Apps Script
      if (typeof google !== 'undefined' && google.script && google.script.run) {
        google.script.run
          .withSuccessHandler(function(response) {
            handleScanResponse(response);
          })
          .withFailureHandler(function(err) {
            showBigNotification("error", "❌ SCAN GAGAL", "<p>Koneksi ke Google Sheets terputus: " + err.toString() + "</p>");
            playBeep('error');
            resumeScannerAfterDelay();
          })
          [action](payload);
      } else {
        // Fallback Simulasi Lokal jika dijalankan di luar Google Apps Script
        simulateScanLocally(qrString);
      }
    }

    function handleScanResponse(res) {
      if (res.status === 'SUCCESS' || res.status === 'CHECK_IN' || res.status === 'CHECK_OUT') {
        playBeep('success');
        var rec = res.record || {};
        var html = '<div class="space-y-1">' +
          '<p><strong>Nama:</strong> ' + (rec.nama || rec.namaGuru || "-") + '</p>' +
          (rec.kelas ? '<p><strong>Kelas:</strong> ' + rec.kelas + '</p>' : '') +
          '<p><strong>Jam:</strong> ' + (rec.jam || rec.jamMasuk || rec.jamPulang || "-") + '</p>' +
          '<p><strong>Status:</strong> <span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">' + (rec.status || "Hadir") + '</span></p>' +
          '</div>';

        showBigNotification('success', res.message || '✅ ABSENSI BERHASIL', html);
      } else if (res.status === 'ALREADY_PRESENT' || res.status === 'ALREADY_COMPLETED') {
        playBeep('error');
        showBigNotification('warning', '⚠️ SUDAH ABSEN', '<p>' + (res.message || 'Siswa/Guru sudah melakukan absensi hari ini.') + '</p>');
      } else {
        playBeep('error');
        showBigNotification('error', '❌ QR TIDAK TERDAFTAR', '<p>' + (res.message || 'Kode QR tidak dikenal dalam database.') + '</p>');
      }

      resumeScannerAfterDelay();
    }

    function handleManualQrSubmit() {
      var val = document.getElementById('manualQrInput').value.trim();
      if (!val) return;
      isProcessingQr = true;
      processScannedCode(val);
      document.getElementById('manualQrInput').value = '';
    }

    // Tampilkan Notifikasi Hasil Scan Besar di Layar
    function showBigNotification(type, title, detailsHtml) {
      var modal = document.getElementById('scanResultModal');
      var card = document.getElementById('scanResultCard');
      var icon = document.getElementById('scanResultIcon');
      var titleEl = document.getElementById('scanResultTitle');
      var detailsEl = document.getElementById('scanResultDetails');

      titleEl.innerText = title;
      detailsEl.innerHTML = detailsHtml;

      if (type === 'success') {
        icon.innerText = "✅";
        icon.className = "w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl bg-emerald-100 text-emerald-600";
        card.className = "w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 text-center shadow-2xl border-4 border-emerald-500";
      } else if (type === 'warning') {
        icon.innerText = "⚠️";
        icon.className = "w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl bg-amber-100 text-amber-600";
        card.className = "w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 text-center shadow-2xl border-4 border-amber-500";
      } else {
        icon.innerText = "❌";
        icon.className = "w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl bg-red-100 text-red-600";
        card.className = "w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 text-center shadow-2xl border-4 border-red-500";
      }

      modal.classList.remove('hidden');
    }

    function resumeScannerAfterDelay() {
      var countdownEl = document.getElementById('scanCountdownText');
      var remaining = 2;
      
      var timer = setInterval(function() {
        remaining--;
        if (countdownEl) countdownEl.innerText = "Scan berikutnya dalam " + remaining + " detik...";
        if (remaining <= 0) {
          clearInterval(timer);
          document.getElementById('scanResultModal').classList.add('hidden');
          isProcessingQr = false;
        }
      }, 1000);
    }

    // AUTENTIKASI (Hanya ADMIN dan GURU)
    function openLoginModal() {
      document.getElementById('loginModal').classList.remove('hidden');
      document.getElementById('loginErrorMsg').classList.add('hidden');
    }

    function closeLoginModal() {
      document.getElementById('loginModal').classList.add('hidden');
    }

    function handleLoginSubmit(e) {
      e.preventDefault();
      var u = document.getElementById('loginUsername').value.trim();
      var p = document.getElementById('loginPassword').value.trim();
      var errEl = document.getElementById('loginErrorMsg');

      if (typeof google !== 'undefined' && google.script && google.script.run) {
        google.script.run
          .withSuccessHandler(function(res) {
            if (res.success) {
              setLoggedInUser(res.user);
              closeLoginModal();
              showView('dashboard');
            } else {
              errEl.innerText = res.message;
              errEl.classList.remove('hidden');
            }
          })
          .handleLogin(u, p);
      } else {
        // Mock fallback jika test preview biasa
        if ((u === 'admin' || u === 'guru1') && (p === 'admin123' || p === 'guru123')) {
          setLoggedInUser({
            nama: u === 'admin' ? 'Administrator Sekolah' : 'Ahmad Hidayatullah, S.Pd.',
            role: u === 'admin' ? 'admin' : 'guru'
          });
          closeLoginModal();
          showView('dashboard');
        } else {
          errEl.innerText = "Username atau password salah!";
          errEl.classList.remove('hidden');
        }
      }
    }

    function setLoggedInUser(user) {
      currentUser = user;
      document.getElementById('navLoginBtn').classList.add('hidden');
      document.getElementById('navLogoutBtn').classList.remove('hidden');
      document.getElementById('userBadge').classList.remove('hidden');
      document.getElementById('userBadge').classList.add('flex');
      document.getElementById('userNameText').innerText = user.nama;
      document.getElementById('userRoleBadge').innerText = user.role;
      
      document.getElementById('dashWelcomeTitle').innerText = "Selamat Datang, " + user.nama;
      document.getElementById('dashWelcomeSubtitle').innerText = "Role: " + user.role.toUpperCase() + " • SDN 2 GIRIHARJA";
    }

    function handleLogout() {
      currentUser = null;
      document.getElementById('navLoginBtn').classList.remove('hidden');
      document.getElementById('navLogoutBtn').classList.add('hidden');
      document.getElementById('userBadge').classList.add('hidden');
      showView('landing');
    }

    function simulateScanLocally(qrString) {
      setTimeout(function() {
        if (qrString.startsWith('STU-') || qrString.startsWith('stu-')) {
          handleScanResponse({
            status: 'SUCCESS',
            message: '✅ ABSENSI BERHASIL',
            record: {
              nama: 'Ahmad Hidayatullah (Siswa)',
              kelas: '3',
              jam: new Date().toLocaleTimeString('id-ID'),
              status: 'Hadir'
            }
          });
        } else if (qrString.startsWith('TCH-') || qrString.startsWith('tch-')) {
          handleScanResponse({
            status: 'CHECK_IN',
            message: '✅ CHECK-IN BERHASIL',
            record: {
              namaGuru: 'Siti Nurhaliza, S.Pd.SD',
              jamMasuk: new Date().toLocaleTimeString('id-ID'),
              status: 'Hadir'
            }
          });
        } else {
          handleScanResponse({
            status: 'UNREGISTERED',
            message: 'Kode QR (' + qrString + ') tidak cocok dengan siswa atau guru manapun.'
          });
        }
      }, 300);
    }
  </script>
</body>
</html>
`;
