/**
 * Utility: Generator Visual Edukasi Beresolusi Tinggi & Pustaka Ilustrasi Pembelajaran
 * Menghasilkan diagram SVG/Data-URI presisi untuk Matematika, IPAS, Bahasa Indonesia, & PPKn
 */

// Helper to convert SVG string to Base64 Data URI
export function svgToDataUri(svgString: string): string {
  const cleanSvg = svgString.trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
  const encoded = encodeURIComponent(cleanSvg)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22');
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}

// 1. GENERATOR VISUAL MATEMATIKA
export const MathVisuals = {
  // Pecahan Lingkaran
  pecahanLingkaran(pembilang: number, penyebut: number, warna = '#2563eb'): string {
    const size = 300;
    const center = size / 2;
    const radius = 110;
    const slices = Math.max(2, Math.min(12, penyebut));
    const active = Math.min(slices, Math.max(1, pembilang));

    let paths = '';
    const sliceAngle = (2 * Math.PI) / slices;

    for (let i = 0; i < slices; i++) {
      const startAngle = i * sliceAngle - Math.PI / 2;
      const endAngle = (i + 1) * sliceAngle - Math.PI / 2;
      const x1 = center + radius * Math.cos(startAngle);
      const y1 = center + radius * Math.sin(startAngle);
      const x2 = center + radius * Math.cos(endAngle);
      const y2 = center + radius * Math.sin(endAngle);
      const isFilled = i < active;

      const pathData = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`;
      paths += `<path d="${pathData}" fill="${isFilled ? warna : '#f1f5f9'}" stroke="#0f172a" stroke-width="2.5" />`;
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="100%" height="100%">
      <rect width="${size}" height="${size}" fill="#ffffff" rx="16" />
      <circle cx="${center}" cy="${center}" r="${radius + 6}" fill="none" stroke="#e2e8f0" stroke-width="2" />
      ${paths}
      <text x="${center}" y="${size - 20}" font-family="sans-serif" font-size="16" font-weight="bold" fill="#1e293b" text-anchor="middle">
        Pecahan: ${pembilang}/${penyebut}
      </text>
    </svg>`;
    return svgToDataUri(svg);
  },

  // Jam Analog Presisi
  jamAnalog(jam: number, menit: number): string {
    const size = 300;
    const center = size / 2;
    const radius = 100;

    const minuteAngle = (menit / 60) * 360 - 90;
    const hourAngle = ((jam % 12) / 12) * 360 + (menit / 60) * 30 - 90;

    const hourRad = (hourAngle * Math.PI) / 180;
    const minuteRad = (minuteAngle * Math.PI) / 180;

    const hx = center + 55 * Math.cos(hourRad);
    const hy = center + 55 * Math.sin(hourRad);
    const mx = center + 80 * Math.cos(minuteRad);
    const my = center + 80 * Math.sin(minuteRad);

    let numbers = '';
    for (let i = 1; i <= 12; i++) {
      const angle = (i / 12) * 2 * Math.PI - Math.PI / 2;
      const nx = center + 82 * Math.cos(angle);
      const ny = center + 82 * Math.sin(angle) + 5;
      numbers += `<text x="${nx}" y="${ny}" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0f172a" text-anchor="middle">${i}</text>`;
    }

    const formatMenit = String(menit).padStart(2, '0');
    const formatJam = String(jam).padStart(2, '0');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="100%" height="100%">
      <rect width="${size}" height="${size}" fill="#ffffff" rx="16" />
      <circle cx="${center}" cy="${center}" r="${radius + 15}" fill="#f8fafc" stroke="#cbd5e1" stroke-width="4" />
      <circle cx="${center}" cy="${center}" r="${radius}" fill="#ffffff" stroke="#1e293b" stroke-width="4" />
      ${numbers}
      <!-- Jarum Jam -->
      <line x1="${center}" y1="${center}" x2="${hx}" y2="${hy}" stroke="#0f172a" stroke-width="6" stroke-linecap="round" />
      <!-- Jarum Menit -->
      <line x1="${center}" y1="${center}" x2="${mx}" y2="${my}" stroke="#2563eb" stroke-width="4" stroke-linecap="round" />
      <!-- Titik Pusat -->
      <circle cx="${center}" cy="${center}" r="6" fill="#e11d48" />
      <text x="${center}" y="${size - 18}" font-family="sans-serif" font-size="15" font-weight="bold" fill="#334155" text-anchor="middle">
        Pukul ${formatJam}.${formatMenit}
      </text>
    </svg>`;
    return svgToDataUri(svg);
  },

  // Bangun Datar: Segitiga Siku-siku dengan label
  segitigaSiku(alas = '6 cm', tinggi = '8 cm', miring = '10 cm'): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 280" width="100%" height="100%">
      <rect width="340" height="280" fill="#ffffff" rx="16" />
      <!-- Poligon Segitiga -->
      <polygon points="70,50 70,210 270,210" fill="#dbeafe" stroke="#1d4ed8" stroke-width="3" />
      <!-- Siku-siku marker -->
      <polyline points="70,195 85,195 85,210" fill="none" stroke="#1d4ed8" stroke-width="2" />
      <!-- Labels -->
      <text x="170" y="235" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0f172a" text-anchor="middle">alas = ${alas}</text>
      <text x="35" y="135" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0f172a" text-anchor="middle">tinggi = ${tinggi}</text>
      <text x="195" y="115" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0f172a" text-anchor="middle">sisi miring = ${miring}</text>
      <!-- Vertex tags -->
      <text x="60" y="42" font-family="sans-serif" font-size="14" font-weight="bold" fill="#1e40af">A</text>
      <text x="55" y="222" font-family="sans-serif" font-size="14" font-weight="bold" fill="#1e40af">B</text>
      <text x="280" y="222" font-family="sans-serif" font-size="14" font-weight="bold" fill="#1e40af">C</text>
    </svg>`;
    return svgToDataUri(svg);
  },

  // Bangun Datar: Persegi Panjang
  persegiPanjang(panjang = '12 cm', lebar = '7 cm'): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 260" width="100%" height="100%">
      <rect width="340" height="260" fill="#ffffff" rx="16" />
      <rect x="60" y="60" width="220" height="130" fill="#ecfdf5" stroke="#059669" stroke-width="3" rx="4" />
      <text x="170" y="45" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0f172a" text-anchor="middle">Panjang (p) = ${panjang}</text>
      <text x="170" y="215" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0f172a" text-anchor="middle">Panjang (p) = ${panjang}</text>
      <text x="30" y="130" font-family="sans-serif" font-size="13" font-weight="bold" fill="#0f172a" text-anchor="middle" transform="rotate(-90 30,130)">Lebar (l) = ${lebar}</text>
      <text x="305" y="130" font-family="sans-serif" font-size="13" font-weight="bold" fill="#0f172a" text-anchor="middle" transform="rotate(90 305,130)">Lebar (l) = ${lebar}</text>
    </svg>`;
    return svgToDataUri(svg);
  },

  // Bangun Ruang: Balok 3D
  balok(p = '10 cm', l = '5 cm', t = '6 cm'): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 270" width="100%" height="100%">
      <rect width="340" height="270" fill="#ffffff" rx="16" />
      <!-- Depan -->
      <polygon points="50,110 210,110 210,210 50,210" fill="#fed7aa" stroke="#c2410c" stroke-width="2.5" />
      <!-- Atas -->
      <polygon points="50,110 110,60 270,60 210,110" fill="#ffedd5" stroke="#c2410c" stroke-width="2.5" />
      <!-- Kanan -->
      <polygon points="210,110 270,60 270,160 210,210" fill="#fdba74" stroke="#c2410c" stroke-width="2.5" />
      <!-- Garis tersembunyi putus-putus -->
      <line x1="50" y1="210" x2="110" y2="160" stroke="#9a3412" stroke-width="1.5" stroke-dasharray="4,4" />
      <line x1="110" y1="60" x2="110" y2="160" stroke="#9a3412" stroke-width="1.5" stroke-dasharray="4,4" />
      <line x1="110" y1="160" x2="270" y2="160" stroke="#9a3412" stroke-width="1.5" stroke-dasharray="4,4" />
      <!-- Label -->
      <text x="130" y="235" font-family="sans-serif" font-size="14" font-weight="bold" fill="#1e293b" text-anchor="middle">panjang = ${p}</text>
      <text x="250" y="200" font-family="sans-serif" font-size="13" font-weight="bold" fill="#1e293b" text-anchor="middle">lebar = ${l}</text>
      <text x="35" y="165" font-family="sans-serif" font-size="13" font-weight="bold" fill="#1e293b" text-anchor="middle">tinggi = ${t}</text>
    </svg>`;
    return svgToDataUri(svg);
  },

  // Bangun Ruang: Tabung (Silinder)
  tabung(r = '7 cm', t = '15 cm'): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 280" width="100%" height="100%">
      <rect width="320" height="280" fill="#ffffff" rx="16" />
      <!-- Selimut -->
      <path d="M 80,80 L 80,200 A 80,24 0 0,0 240,200 L 240,80 Z" fill="#e0e7ff" stroke="#4338ca" stroke-width="2.5" />
      <!-- Alas bawah putus-putus -->
      <ellipse cx="160" cy="200" rx="80" ry="24" fill="none" stroke="#4338ca" stroke-width="2" stroke-dasharray="4,4" />
      <!-- Tutup Atas -->
      <ellipse cx="160" cy="80" rx="80" ry="24" fill="#c7d2fe" stroke="#4338ca" stroke-width="2.5" />
      <!-- Jari-jari -->
      <line x1="160" y1="80" x2="240" y2="80" stroke="#b91c1c" stroke-width="2" />
      <circle cx="160" cy="80" r="3" fill="#b91c1c" />
      <text x="200" y="70" font-family="sans-serif" font-size="12" font-weight="bold" fill="#b91c1c" text-anchor="middle">r = ${r}</text>
      <!-- Tinggi -->
      <line x1="260" y1="80" x2="260" y2="200" stroke="#0f172a" stroke-width="1.5" marker-start="url(#arrow)" marker-end="url(#arrow)" />
      <text x="285" y="145" font-family="sans-serif" font-size="13" font-weight="bold" fill="#0f172a" text-anchor="middle">t = ${t}</text>
    </svg>`;
    return svgToDataUri(svg);
  },

  // Diagram Batang (Bar Chart)
  diagramBatang(data: { label: string; nilai: number }[], judul = 'Diagram Hasil Penjualan Buah (kg)'): string {
    const maxVal = Math.max(...data.map((d) => d.nilai), 10);
    const chartHeight = 140;
    const barWidth = 36;
    const gap = 20;
    const startX = 65;
    const startY = 200;

    let bars = '';
    data.forEach((item, idx) => {
      const height = (item.nilai / maxVal) * chartHeight;
      const x = startX + idx * (barWidth + gap);
      const y = startY - height;
      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
      const col = colors[idx % colors.length];

      bars += `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${height}" fill="${col}" rx="4" stroke="#1e293b" stroke-width="1.5" />
        <text x="${x + barWidth / 2}" y="${y - 6}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#1e293b" text-anchor="middle">${item.nilai}</text>
        <text x="${x + barWidth / 2}" y="${startY + 18}" font-family="sans-serif" font-size="11" font-weight="bold" fill="#475569" text-anchor="middle">${item.label}</text>
      `;
    });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 260" width="100%" height="100%">
      <rect width="360" height="260" fill="#ffffff" rx="16" />
      <text x="180" y="28" font-family="sans-serif" font-size="13" font-weight="bold" fill="#0f172a" text-anchor="middle">${judul}</text>
      <!-- Sumbu X & Y -->
      <line x1="45" y1="45" x2="45" y2="${startY}" stroke="#64748b" stroke-width="2" />
      <line x1="45" y1="${startY}" x2="335" y2="${startY}" stroke="#64748b" stroke-width="2" />
      <!-- Grid lines -->
      <line x1="40" y1="${startY - chartHeight}" x2="335" y2="${startY - chartHeight}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3,3" />
      <text x="35" y="${startY - chartHeight + 4}" font-family="sans-serif" font-size="10" fill="#64748b" text-anchor="end">${maxVal}</text>
      <line x1="40" y1="${startY - chartHeight / 2}" x2="335" y2="${startY - chartHeight / 2}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3,3" />
      <text x="35" y="${startY - chartHeight / 2 + 4}" font-family="sans-serif" font-size="10" fill="#64748b" text-anchor="end">${Math.round(maxVal / 2)}</text>
      <text x="35" y="${startY + 4}" font-family="sans-serif" font-size="10" fill="#64748b" text-anchor="end">0</text>
      ${bars}
    </svg>`;
    return svgToDataUri(svg);
  },
};

// 2. GENERATOR VISUAL IPAS & SAINS
export const ScienceVisuals = {
  // Bagian-Bagian Tumbuhan
  tumbuhan(): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 320" width="100%" height="100%">
      <rect width="360" height="320" fill="#ffffff" rx="16" />
      <text x="180" y="24" font-family="sans-serif" font-size="14" font-weight="bold" fill="#065f46" text-anchor="middle">Bagian-Bagian Utama Tumbuhan</text>
      <!-- Tanah -->
      <rect x="20" y="230" width="320" height="75" fill="#fef3c7" />
      <line x1="20" y1="230" x2="340" y2="230" stroke="#b45309" stroke-width="3" stroke-dasharray="8,4" />
      <!-- Akar -->
      <path d="M 180,230 Q 170,260 150,285 M 180,230 Q 190,265 210,290 M 180,240 Q 160,250 140,260 M 180,245 Q 200,260 220,270" stroke="#78350f" stroke-width="3" stroke-linecap="round" fill="none" />
      <!-- Batang -->
      <rect x="173" y="100" width="14" height="130" fill="#15803d" rx="4" />
      <!-- Daun Kiri & Kanan -->
      <path d="M 173,150 Q 120,130 110,165 Q 140,180 173,160 Z" fill="#22c55e" stroke="#166534" stroke-width="2" />
      <path d="M 187,130 Q 240,110 250,145 Q 220,160 187,140 Z" fill="#22c55e" stroke="#166534" stroke-width="2" />
      <!-- Bunga -->
      <circle cx="180" cy="75" r="16" fill="#facc15" stroke="#ca8a04" stroke-width="2" />
      <circle cx="160" cy="75" r="12" fill="#ec4899" opacity="0.85" />
      <circle cx="200" cy="75" r="12" fill="#ec4899" opacity="0.85" />
      <circle cx="180" cy="55" r="12" fill="#ec4899" opacity="0.85" />
      <circle cx="180" cy="95" r="12" fill="#ec4899" opacity="0.85" />
      <!-- Label Penunjuk -->
      <line x1="215" y1="70" x2="280" y2="70" stroke="#475569" stroke-width="1.5" />
      <text x="285" y="74" font-family="sans-serif" font-size="12" font-weight="bold" fill="#0f172a">A. Bunga</text>
      <line x1="95" y1="150" x2="45" y2="150" stroke="#475569" stroke-width="1.5" />
      <text x="40" y="154" font-family="sans-serif" font-size="12" font-weight="bold" fill="#0f172a" text-anchor="end">B. Daun</text>
      <line x1="187" y1="185" x2="280" y2="185" stroke="#475569" stroke-width="1.5" />
      <text x="285" y="189" font-family="sans-serif" font-size="12" font-weight="bold" fill="#0f172a">C. Batang</text>
      <line x1="135" y1="260" x2="65" y2="260" stroke="#475569" stroke-width="1.5" />
      <text x="60" y="264" font-family="sans-serif" font-size="12" font-weight="bold" fill="#0f172a" text-anchor="end">D. Akar</text>
    </svg>`;
    return svgToDataUri(svg);
  },

  // Siklus Air
  siklusAir(): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 280" width="100%" height="100%">
      <rect width="380" height="280" fill="#f0f9ff" rx="16" />
      <text x="190" y="24" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0369a1" text-anchor="middle">Bagan Siklus Air (Daur Hidrologi)</text>
      <!-- Matahari -->
      <circle cx="50" cy="55" r="22" fill="#fbbf24" stroke="#f59e0b" stroke-width="3" />
      <!-- Laut / Danau -->
      <path d="M 0,220 Q 95,210 190,225 T 380,220 L 380,280 L 0,280 Z" fill="#38bdf8" />
      <text x="290" y="255" font-family="sans-serif" font-size="12" font-weight="bold" fill="#0369a1">Laut / Perairan</text>
      <!-- Gunung / Daratan -->
      <polygon points="0,220 70,140 140,220" fill="#15803d" />
      <polygon points="50,165 70,140 90,165" fill="#f8fafc" />
      <!-- Awan Kondensasi -->
      <ellipse cx="280" cy="75" rx="35" ry="20" fill="#ffffff" stroke="#94a3b8" stroke-width="2" />
      <ellipse cx="255" cy="80" rx="25" ry="16" fill="#ffffff" stroke="#94a3b8" stroke-width="2" />
      <ellipse cx="300" cy="80" rx="25" ry="16" fill="#ffffff" stroke="#94a3b8" stroke-width="2" />
      <text x="280" y="78" font-family="sans-serif" font-size="10" font-weight="bold" fill="#475569" text-anchor="middle">Kondensasi</text>
      <!-- Panah Evaporasi -->
      <path d="M 230,205 Q 240,160 255,115" fill="none" stroke="#ea580c" stroke-width="2.5" stroke-dasharray="4,3" marker-end="url(#arrow)" />
      <text x="210" y="160" font-family="sans-serif" font-size="11" font-weight="bold" fill="#ea580c">1. Evaporasi</text>
      <!-- Hujan Presipitasi -->
      <line x1="265" y1="105" x2="255" y2="135" stroke="#0284c7" stroke-width="2" stroke-dasharray="2,3" />
      <line x1="285" y1="105" x2="275" y2="135" stroke="#0284c7" stroke-width="2" stroke-dasharray="2,3" />
      <line x1="305" y1="105" x2="295" y2="135" stroke="#0284c7" stroke-width="2" stroke-dasharray="2,3" />
      <text x="315" y="130" font-family="sans-serif" font-size="11" font-weight="bold" fill="#0284c7">2. Presipitasi</text>
      <!-- Aliran Infiltrasi -->
      <path d="M 120,225 Q 180,240 240,230" fill="none" stroke="#047857" stroke-width="2.5" />
      <text x="110" y="255" font-family="sans-serif" font-size="11" font-weight="bold" fill="#047857">3. Infiltrasi</text>
    </svg>`;
    return svgToDataUri(svg);
  },

  // Rantai Makanan
  rantaiMakanan(): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 240" width="100%" height="100%">
      <rect width="380" height="240" fill="#ffffff" rx="16" />
      <text x="190" y="24" font-family="sans-serif" font-size="13" font-weight="bold" fill="#1e293b" text-anchor="middle">Alur Rantai Makanan Ekosistem Sawah</text>
      <!-- Produsen -->
      <rect x="20" y="80" width="70" height="70" fill="#dcfce7" stroke="#16a34a" stroke-width="2" rx="10" />
      <text x="55" y="115" font-size="24" text-anchor="middle">🌾</text>
      <text x="55" y="138" font-family="sans-serif" font-size="10" font-weight="bold" fill="#15803d" text-anchor="middle">Padi</text>
      <text x="55" y="170" font-family="sans-serif" font-size="9" fill="#64748b" text-anchor="middle">(Produsen)</text>
      <!-- Panah 1 -->
      <path d="M 95,115 L 115,115" stroke="#dc2626" stroke-width="3" />
      <polygon points="120,115 112,110 112,120" fill="#dc2626" />
      <!-- Konsumen 1 -->
      <rect x="125" y="80" width="70" height="70" fill="#fef9c3" stroke="#ca8a04" stroke-width="2" rx="10" />
      <text x="160" y="115" font-size="24" text-anchor="middle">🦗</text>
      <text x="160" y="138" font-family="sans-serif" font-size="10" font-weight="bold" fill="#a16207" text-anchor="middle">Belalang</text>
      <text x="160" y="170" font-family="sans-serif" font-size="9" fill="#64748b" text-anchor="middle">(Konsumen I)</text>
      <!-- Panah 2 -->
      <path d="M 200,115 L 220,115" stroke="#dc2626" stroke-width="3" />
      <polygon points="225,115 217,110 217,120" fill="#dc2626" />
      <!-- Konsumen 2 -->
      <rect x="230" y="80" width="70" height="70" fill="#ffedd5" stroke="#ea580c" stroke-width="2" rx="10" />
      <text x="265" y="115" font-size="24" text-anchor="middle">🐸</text>
      <text x="265" y="138" font-family="sans-serif" font-size="10" font-weight="bold" fill="#c2410c" text-anchor="middle">Katak</text>
      <text x="265" y="170" font-family="sans-serif" font-size="9" fill="#64748b" text-anchor="middle">(Konsumen II)</text>
      <!-- Panah 3 -->
      <path d="M 305,115 L 325,115" stroke="#dc2626" stroke-width="3" />
      <polygon points="330,115 322,110 322,120" fill="#dc2626" />
      <!-- Konsumen 3 -->
      <rect x="330" y="80" width="45" height="70" fill="#fee2e2" stroke="#dc2626" stroke-width="2" rx="10" />
      <text x="352" y="115" font-size="20" text-anchor="middle">🐍</text>
      <text x="352" y="138" font-family="sans-serif" font-size="9" font-weight="bold" fill="#b91c1c" text-anchor="middle">Ular</text>
      <text x="352" y="170" font-family="sans-serif" font-size="8" fill="#64748b" text-anchor="middle">(K. III)</text>
    </svg>`;
    return svgToDataUri(svg);
  },

  // Tata Surya
  tataSurya(): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 240" width="100%" height="100%">
      <rect width="380" height="240" fill="#0f172a" rx="16" />
      <text x="190" y="24" font-family="sans-serif" font-size="13" font-weight="bold" fill="#f8fafc" text-anchor="middle">Sistem Tata Surya Kita</text>
      <!-- Matahari -->
      <circle cx="20" cy="130" r="45" fill="#f59e0b" stroke="#fbbf24" stroke-width="3" />
      <!-- Orbit Lines -->
      <ellipse cx="20" cy="130" rx="90" ry="60" fill="none" stroke="#334155" stroke-width="1" stroke-dasharray="2,3" />
      <ellipse cx="20" cy="130" rx="140" ry="75" fill="none" stroke="#334155" stroke-width="1" stroke-dasharray="2,3" />
      <ellipse cx="20" cy="130" rx="200" ry="90" fill="none" stroke="#334155" stroke-width="1" stroke-dasharray="2,3" />
      <ellipse cx="20" cy="130" rx="270" ry="100" fill="none" stroke="#334155" stroke-width="1" stroke-dasharray="2,3" />
      <!-- Planet-planet -->
      <!-- Merkurius -->
      <circle cx="105" cy="115" r="5" fill="#94a3b8" />
      <text x="105" y="135" font-family="sans-serif" font-size="8" fill="#cbd5e1" text-anchor="middle">Merkurius</text>
      <!-- Venus -->
      <circle cx="155" cy="100" r="9" fill="#fde047" />
      <text x="155" y="125" font-family="sans-serif" font-size="8" fill="#cbd5e1" text-anchor="middle">Venus</text>
      <!-- Bumi -->
      <circle cx="215" cy="120" r="11" fill="#38bdf8" stroke="#16a34a" stroke-width="2" />
      <text x="215" y="145" font-family="sans-serif" font-size="8" font-weight="bold" fill="#38bdf8" text-anchor="middle">Bumi</text>
      <!-- Mars -->
      <circle cx="285" cy="125" r="7" fill="#ef4444" />
      <text x="285" y="145" font-family="sans-serif" font-size="8" fill="#cbd5e1" text-anchor="middle">Mars</text>
      <!-- Yupiter -->
      <circle cx="345" cy="130" r="20" fill="#d97706" />
      <text x="345" y="165" font-family="sans-serif" font-size="8" fill="#cbd5e1" text-anchor="middle">Yupiter</text>
    </svg>`;
    return svgToDataUri(svg);
  },
};

// 3. GENERATOR VISUAL PANCASILA & BAHASA INDONESIA
export const SocialVisuals = {
  // Gotong Royong
  gotongRoyong(): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 250" width="100%" height="100%">
      <rect width="360" height="250" fill="#f8fafc" rx="16" />
      <text x="180" y="24" font-family="sans-serif" font-size="13" font-weight="bold" fill="#0f172a" text-anchor="middle">Penerapan Nilai Gotong Royong di Lingkungan</text>
      <rect x="20" y="45" width="320" height="150" fill="#e0f2fe" rx="12" stroke="#bae6fd" stroke-width="2" />
      <!-- Karakter Ilustrasi Sederhana -->
      <text x="90" y="130" font-size="44" text-anchor="middle">👦</text>
      <text x="90" y="170" font-family="sans-serif" font-size="11" font-weight="bold" fill="#0369a1" text-anchor="middle">Menyapu</text>
      <text x="180" y="130" font-size="44" text-anchor="middle">👧</text>
      <text x="180" y="170" font-family="sans-serif" font-size="11" font-weight="bold" fill="#0369a1" text-anchor="middle">Menanam Bunga</text>
      <text x="270" y="130" font-size="44" text-anchor="middle">🧒</text>
      <text x="270" y="170" font-family="sans-serif" font-size="11" font-weight="bold" fill="#0369a1" text-anchor="middle">Membuang Sampah</text>
      <text x="180" y="225" font-family="sans-serif" font-size="12" font-style="italic" fill="#475569" text-anchor="middle">"Kerja sama membuat pekerjaan berat menjadi ringan dan cepat selesai"</text>
    </svg>`;
    return svgToDataUri(svg);
  },

  // Musyawarah
  musyawarah(): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 250" width="100%" height="100%">
      <rect width="360" height="250" fill="#f8fafc" rx="16" />
      <text x="180" y="24" font-family="sans-serif" font-size="13" font-weight="bold" fill="#0f172a" text-anchor="middle">Musyawarah Mufakat Sila Ke-4 Pancasila</text>
      <!-- Meja Bundar -->
      <circle cx="180" cy="130" r="50" fill="#fed7aa" stroke="#c2410c" stroke-width="3" />
      <text x="180" y="135" font-family="sans-serif" font-size="11" font-weight="bold" fill="#9a3412" text-anchor="middle">MEJA KELAS</text>
      <!-- Peserta mengelilingi -->
      <text x="180" y="65" font-size="32" text-anchor="middle">👦</text>
      <text x="180" y="215" font-size="32" text-anchor="middle">👧</text>
      <text x="95" y="140" font-size="32" text-anchor="middle">🧒</text>
      <text x="265" y="140" font-size="32" text-anchor="middle">🧑</text>
      <text x="180" y="238" font-family="sans-serif" font-size="12" font-style="italic" fill="#475569" text-anchor="middle">"Menghargai pendapat teman dalam diskusi pemilihan ketua kelas"</text>
    </svg>`;
    return svgToDataUri(svg);
  },
};

// 4. SMART VISUAL MATCHER: Memilih visual secara otomatis berdasarkan teks soal / kata kunci
export function findSmartVisualForQuestion(
  teksSoalOrMapel: string,
  captionOrTopik?: string,
  keywordOrTeks?: string,
  subject?: string
): { url: string; dataUri: string; caption: string; title: string } | null {
  const combined = `${teksSoalOrMapel || ''} ${captionOrTopik || ''} ${keywordOrTeks || ''} ${subject || ''}`.toLowerCase();

  // Helper builder
  const buildResult = (dataUri: string, caption: string, title?: string) => ({
    url: dataUri,
    dataUri,
    caption,
    title: title || caption,
  });

  // Explicit keywords
  if (combined.includes('jam_0300')) {
    return buildResult(MathVisuals.jamAnalog(3, 0), 'Jam Analog Menunjukkan Pukul 03.00', 'Jam Analog Pukul 03.00');
  }
  if (combined.includes('pecahan_setengah')) {
    return buildResult(MathVisuals.pecahanLingkaran(1, 2, '#16a34a'), 'Lingkaran Diarsir Pecahan 1/2', 'Pecahan 1/2');
  }
  if (combined.includes('bagian_tumbuhan')) {
    return buildResult(ScienceVisuals.tumbuhan(), 'Bagan Bagian-Bagian Tumbuhan (Akar, Batang, Daun, Bunga)', 'Bagian-Bagian Tumbuhan');
  }
  if (combined.includes('siklus_air')) {
    return buildResult(ScienceVisuals.siklusAir(), 'Bagan Alur Daur Siklus Air di Bumi', 'Siklus Air Lengkap');
  }
  if (combined.includes('rantai_makanan')) {
    return buildResult(ScienceVisuals.rantaiMakanan(), 'Rantai Makanan Ekosistem Sawah', 'Rantai Makanan Sawah');
  }
  if (combined.includes('tata_surya')) {
    return buildResult(ScienceVisuals.tataSurya(), 'Gambar Susunan Planet dalam Tata Surya', 'Sistem Tata Surya');
  }
  if (combined.includes('gotong_royong')) {
    return buildResult(SocialVisuals.gotongRoyong(), 'Ilustrasi Perilaku Gotong Royong di Lingkungan', 'Gotong Royong');
  }
  if (combined.includes('musyawarah')) {
    return buildResult(SocialVisuals.musyawarah(), 'Ilustrasi Kegiatan Musyawarah untuk Mufakat', 'Musyawarah Mufakat');
  }
  if (combined.includes('segitiga_siku')) {
    return buildResult(MathVisuals.segitigaSiku('6 cm', '8 cm', '10 cm'), 'Segitiga Siku-Siku ABC', 'Segitiga Siku-Siku');
  }
  if (combined.includes('balok')) {
    return buildResult(MathVisuals.balok('10 cm', '5 cm', '6 cm'), 'Gambar Kerangka Bangun Ruang Balok', 'Balok 3D');
  }
  if (combined.includes('tabung')) {
    return buildResult(MathVisuals.tabung('7 cm', '15 cm'), 'Gambar Bangun Ruang Tabung (Silinder)', 'Tabung Silinder');
  }
  if (combined.includes('diagram_batang')) {
    return buildResult(MathVisuals.diagramBatang([
      { label: 'Senin', nilai: 20 },
      { label: 'Selasa', nilai: 35 },
      { label: 'Rabu', nilai: 25 },
      { label: 'Kamis', nilai: 40 },
    ]), 'Diagram Batang Penjualan Harian', 'Diagram Batang');
  }

  // Matematika: Jam
  if (combined.includes('jam') || combined.includes('pukul') || combined.includes('waktu')) {
    if (combined.includes('08.30') || combined.includes('08:30') || combined.includes('setengah sembilan')) {
      return buildResult(MathVisuals.jamAnalog(8, 30), 'Gambar Jam Menunjukkan Pukul 08.30', 'Jam Pukul 08.30');
    }
    if (combined.includes('07.15') || combined.includes('07:15')) {
      return buildResult(MathVisuals.jamAnalog(7, 15), 'Gambar Jam Menunjukkan Pukul 07.15', 'Jam Pukul 07.15');
    }
    return buildResult(MathVisuals.jamAnalog(7, 30), 'Gambar Penunjuk Waktu Analog', 'Jam Analog');
  }

  // Matematika: Pecahan
  if (combined.includes('pecahan') || combined.includes('arsir') || combined.includes('seperempat') || combined.includes('setengah')) {
    if (combined.includes('3/4') || combined.includes('tiga perempat')) {
      return buildResult(MathVisuals.pecahanLingkaran(3, 4, '#2563eb'), 'Lingkaran dengan Daerah Diarsir Menunjukkan Pecahan 3/4', 'Pecahan 3/4');
    }
    if (combined.includes('1/2') || combined.includes('setengah')) {
      return buildResult(MathVisuals.pecahanLingkaran(1, 2, '#16a34a'), 'Daerah Lingkaran Menunjukkan Pecahan 1/2', 'Pecahan 1/2');
    }
    return buildResult(MathVisuals.pecahanLingkaran(3, 8, '#7c3aed'), 'Ilustrasi Konsep Pecahan Daerah Terbagi', 'Konsep Pecahan');
  }

  // Matematika: Segitiga
  if (combined.includes('segitiga') || combined.includes('siku-siku') || combined.includes('phytagoras') || combined.includes('luas segitiga')) {
    return buildResult(MathVisuals.segitigaSiku('6 cm', '8 cm', '10 cm'), 'Segitiga Siku-Siku ABC', 'Segitiga Siku-Siku');
  }

  // Matematika: Persegi / Persegi Panjang
  if (combined.includes('persegi panjang') || combined.includes('keliling lapangan') || combined.includes('luas tanah')) {
    return buildResult(MathVisuals.persegiPanjang('12 cm', '7 cm'), 'Gambar Bangun Persegi Panjang', 'Persegi Panjang');
  }

  // Matematika: Balok
  if (combined.includes('balok') || combined.includes('volume balok')) {
    return buildResult(MathVisuals.balok('10 cm', '5 cm', '6 cm'), 'Gambar Kerangka Bangun Ruang Balok', 'Balok 3D');
  }

  // Matematika: Tabung
  if (combined.includes('tabung') || combined.includes('silinder')) {
    return buildResult(MathVisuals.tabung('7 cm', '15 cm'), 'Gambar Bangun Ruang Tabung (Silinder)', 'Tabung Silinder');
  }

  // Matematika: Diagram Batang
  if (combined.includes('diagram') || combined.includes('batang') || combined.includes('penjualan') || combined.includes('data siswa')) {
    return buildResult(
      MathVisuals.diagramBatang([
        { label: 'Apel', nilai: 25 },
        { label: 'Jeruk', nilai: 40 },
        { label: 'Mangga', nilai: 30 },
        { label: 'Pisang', nilai: 15 },
      ]),
      'Diagram Batang Penjualan Buah (kg)',
      'Diagram Batang Penjualan'
    );
  }

  // IPAS: Tumbuhan
  if (combined.includes('tumbuhan') || combined.includes('akar') || combined.includes('daun') || combined.includes('batang') || combined.includes('fotosintesis') || combined.includes('tanaman')) {
    return buildResult(ScienceVisuals.tumbuhan(), 'Bagan Struktur Utama Bagian Tumbuhan', 'Bagian-Bagian Tumbuhan');
  }

  // IPAS: Siklus Air
  if (combined.includes('air') || combined.includes('hujan') || combined.includes('siklus') || combined.includes('evaporasi') || combined.includes('awan') || combined.includes('presipitasi')) {
    return buildResult(ScienceVisuals.siklusAir(), 'Bagan Alur Daur Siklus Air di Bumi', 'Siklus Air Lengkap');
  }

  // IPAS: Rantai Makanan
  if (combined.includes('rantai makanan') || combined.includes('konsumen') || combined.includes('produsen') || combined.includes('ekosistem')) {
    return buildResult(ScienceVisuals.rantaiMakanan(), 'Alur Rantai Makanan Ekosistem Sawah', 'Rantai Makanan Sawah');
  }

  // IPAS: Tata Surya
  if (combined.includes('tata surya') || combined.includes('planet') || combined.includes('bumi') || combined.includes('matahari')) {
    return buildResult(ScienceVisuals.tataSurya(), 'Gambar Susunan Planet dalam Tata Surya', 'Sistem Tata Surya');
  }

  // PPKn / Sosial: Gotong Royong
  if (combined.includes('gotong royong') || combined.includes('kerja sama') || combined.includes('kebersihan') || combined.includes('pancasila')) {
    return buildResult(SocialVisuals.gotongRoyong(), 'Ilustrasi Perilaku Gotong Royong di Lingkungan', 'Gotong Royong');
  }

  // PPKn / Sosial: Musyawarah
  if (combined.includes('musyawarah') || combined.includes('mufakat') || combined.includes('diskusi') || combined.includes('sila 4') || combined.includes('pemilihan')) {
    return buildResult(SocialVisuals.musyawarah(), 'Ilustrasi Kegiatan Musyawarah untuk Mufakat', 'Musyawarah Mufakat');
  }

  return null;
}

export interface CuratedIllustrationItem {
  id: string;
  name: string;
  title: string;
  category: string;
  url: string;
  dataUri: string;
  caption: string;
}

// 5. CURATED EDUCATIONAL ILLUSTRATIONS FOR TEACHER PICKER
export const CURATED_ILLUSTRATIONS: CuratedIllustrationItem[] = [
  // Matematika
  {
    id: 'pecahan_3_4',
    name: 'Pecahan 3/4',
    title: 'Pecahan 3/4',
    category: 'Matematika',
    url: MathVisuals.pecahanLingkaran(3, 4, '#2563eb'),
    dataUri: MathVisuals.pecahanLingkaran(3, 4, '#2563eb'),
    caption: 'Lingkaran Diarsir Pecahan 3/4',
  },
  {
    id: 'pecahan_1_2',
    name: 'Pecahan 1/2',
    title: 'Pecahan 1/2',
    category: 'Matematika',
    url: MathVisuals.pecahanLingkaran(1, 2, '#16a34a'),
    dataUri: MathVisuals.pecahanLingkaran(1, 2, '#16a34a'),
    caption: 'Lingkaran Diarsir Pecahan 1/2',
  },
  {
    id: 'jam_0830',
    name: 'Jam Analog (08.30)',
    title: 'Jam Analog 08.30',
    category: 'Matematika',
    url: MathVisuals.jamAnalog(8, 30),
    dataUri: MathVisuals.jamAnalog(8, 30),
    caption: 'Jam Analog Menunjukkan Pukul 08.30',
  },
  {
    id: 'jam_0715',
    name: 'Jam Analog (07.15)',
    title: 'Jam Analog 07.15',
    category: 'Matematika',
    url: MathVisuals.jamAnalog(7, 15),
    dataUri: MathVisuals.jamAnalog(7, 15),
    caption: 'Jam Analog Menunjukkan Pukul 07.15',
  },
  {
    id: 'segitiga_siku',
    name: 'Segitiga Siku-Siku',
    title: 'Segitiga Siku-Siku',
    category: 'Matematika',
    url: MathVisuals.segitigaSiku('6 cm', '8 cm', '10 cm'),
    dataUri: MathVisuals.segitigaSiku('6 cm', '8 cm', '10 cm'),
    caption: 'Segitiga Siku-Siku ABC',
  },
  {
    id: 'persegi_panjang',
    name: 'Persegi Panjang',
    title: 'Persegi Panjang',
    category: 'Matematika',
    url: MathVisuals.persegiPanjang('12 cm', '7 cm'),
    dataUri: MathVisuals.persegiPanjang('12 cm', '7 cm'),
    caption: 'Bangun Datar Persegi Panjang',
  },
  {
    id: 'balok_3d',
    name: 'Balok 3D',
    title: 'Balok 3D',
    category: 'Matematika',
    url: MathVisuals.balok('10 cm', '5 cm', '6 cm'),
    dataUri: MathVisuals.balok('10 cm', '5 cm', '6 cm'),
    caption: 'Gambar Bangun Ruang Balok',
  },
  {
    id: 'tabung_silinder',
    name: 'Tabung (Silinder)',
    title: 'Tabung Silinder',
    category: 'Matematika',
    url: MathVisuals.tabung('7 cm', '15 cm'),
    dataUri: MathVisuals.tabung('7 cm', '15 cm'),
    caption: 'Gambar Bangun Ruang Tabung',
  },
  {
    id: 'diagram_batang',
    name: 'Diagram Batang',
    title: 'Diagram Batang Penjualan',
    category: 'Matematika',
    url: MathVisuals.diagramBatang([
      { label: 'Senin', nilai: 20 },
      { label: 'Selasa', nilai: 35 },
      { label: 'Rabu', nilai: 25 },
      { label: 'Kamis', nilai: 40 },
    ]),
    dataUri: MathVisuals.diagramBatang([
      { label: 'Senin', nilai: 20 },
      { label: 'Selasa', nilai: 35 },
      { label: 'Rabu', nilai: 25 },
      { label: 'Kamis', nilai: 40 },
    ]),
    caption: 'Diagram Batang Penjualan Harian',
  },
  // IPAS / Sains
  {
    id: 'bagian_tumbuhan',
    name: 'Bagian-Bagian Tumbuhan',
    title: 'Bagian-Bagian Tumbuhan',
    category: 'IPAS / Sains',
    url: ScienceVisuals.tumbuhan(),
    dataUri: ScienceVisuals.tumbuhan(),
    caption: 'Bagan Bagian-Bagian Tumbuhan (Akar, Batang, Daun, Bunga)',
  },
  {
    id: 'siklus_air',
    name: 'Siklus Air Lengkap',
    title: 'Siklus Air Lengkap',
    category: 'IPAS / Sains',
    url: ScienceVisuals.siklusAir(),
    dataUri: ScienceVisuals.siklusAir(),
    caption: 'Bagan Daur Siklus Air di Bumi',
  },
  {
    id: 'rantai_makanan',
    name: 'Rantai Makanan Sawah',
    title: 'Rantai Makanan Sawah',
    category: 'IPAS / Sains',
    url: ScienceVisuals.rantaiMakanan(),
    dataUri: ScienceVisuals.rantaiMakanan(),
    caption: 'Rantai Makanan: Padi -> Belalang -> Katak -> Ular',
  },
  {
    id: 'tata_surya',
    name: 'Sistem Tata Surya',
    title: 'Sistem Tata Surya',
    category: 'IPAS / Sains',
    url: ScienceVisuals.tataSurya(),
    dataUri: ScienceVisuals.tataSurya(),
    caption: 'Gambar Susunan Planet Mengelilingi Matahari',
  },
  // Pendidikan Pancasila & Sosial
  {
    id: 'gotong_royong',
    name: 'Gotong Royong Lingkungan',
    title: 'Gotong Royong Lingkungan',
    category: 'Pendidikan Pancasila',
    url: SocialVisuals.gotongRoyong(),
    dataUri: SocialVisuals.gotongRoyong(),
    caption: 'Ilustrasi Kegiatan Gotong Royong Membersihkan Lingkungan',
  },
  {
    id: 'musyawarah',
    name: 'Musyawarah Mufakat',
    title: 'Musyawarah Mufakat',
    category: 'Pendidikan Pancasila',
    url: SocialVisuals.musyawarah(),
    dataUri: SocialVisuals.musyawarah(),
    caption: 'Ilustrasi Diskusi dan Musyawarah Kelas',
  },
];

export function findIllustrationByKey(key: string): CuratedIllustrationItem | undefined {
  const cleanKey = (key || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
  return CURATED_ILLUSTRATIONS.find((item) =>
    item.id === cleanKey ||
    item.id.includes(cleanKey) ||
    item.name.toLowerCase().includes(cleanKey.replace(/_/g, ' '))
  );
}
