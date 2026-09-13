import React, { useState } from 'react';
import { db } from '../../services/database';
import { Settings } from '../../types';
import { compressImage } from '../../utils/imageCompressor';
import {
  Building2,
  Save,
  CheckCircle,
  Upload,
  User,
  MapPin,
  Mail,
  Phone,
  FileText,
  Sparkles,
  Loader2,
  Camera,
  RotateCcw,
} from 'lucide-react';

export const ProfilSekolahView: React.FC = () => {
  const [settings, setSettings] = useState<Settings>(db.getSettings());
  const [successMsg, setSuccessMsg] = useState('');
  const [isUploadingKS, setIsUploadingKS] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  // Form fields
  const [namaSekolah, setNamaSekolah] = useState(settings.namaSekolah);
  const [npsn, setNpsn] = useState(settings.npsn);
  const [alamat, setAlamat] = useState(settings.alamat);
  const [desa, setDesa] = useState(settings.desa || '');
  const [kecamatan, setKecamatan] = useState(settings.kecamatan || '');
  const [kabupaten, setKabupaten] = useState(settings.kabupaten || '');
  const [provinsi, setProvinsi] = useState(settings.provinsi || '');
  const [kodePos, setKodePos] = useState(settings.kodePos || '');
  const [telepon, setTelepon] = useState(settings.telepon);
  const [email, setEmail] = useState(settings.email);
  const [visi, setVisi] = useState(settings.visi);
  const [misi, setMisi] = useState(settings.misi.join('\n'));
  const [namaKepalaSekolah, setNamaKepalaSekolah] = useState(settings.namaKepalaSekolah);
  const [nipKepalaSekolah, setNipKepalaSekolah] = useState(settings.nipKepalaSekolah);
  const [fotoKepalaSekolah, setFotoKepalaSekolah] = useState(settings.fotoKepalaSekolah || '');
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl || '');

  const handleAlamatChange = (val: string) => {
    setAlamat(val);
    const valLower = val.toLowerCase();
    const kecMatch = valLower.match(/kec(?:amatan)?\.?\s+([a-zA-Z\s]+?)(?:,|$|\bkab|\bdesa|\bprov)/i);
    if (kecMatch && (!kecamatan || kecamatan === 'Ciparay')) {
      setKecamatan(kecMatch[1].trim().replace(/\b\w/g, (l) => l.toUpperCase()));
    }
    const kabMatch = valLower.match(/kab(?:upaten)?\.?\s+([a-zA-Z\s]+?)(?:,|$|\bprov|\bkec)/i);
    if (kabMatch && (!kabupaten || kabupaten === 'Kabupaten Bandung' || kabupaten === 'Bandung')) {
      setKabupaten(kabMatch[1].trim().replace(/\b\w/g, (l) => l.toUpperCase()));
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    const updated: Settings = {
      ...settings,
      namaSekolah,
      npsn,
      alamat,
      desa,
      kecamatan,
      kabupaten,
      provinsi,
      kodePos,
      telepon,
      email,
      visi,
      misi: misi.split('\n').map((m) => m.trim()).filter(Boolean),
      namaKepalaSekolah,
      nipKepalaSekolah,
      sambutanKepalaSekolah: '', // Bersih dari data landing page yang tidak digunakan lagi
      fotoKepalaSekolah,
      logoUrl,
    };

    db.saveSettings(updated);
    setSettings(updated);
    setSuccessMsg('Profil sekolah & identitas berhasil disimpan dan diperbarui di seluruh sistem!');

    setTimeout(() => {
      setSuccessMsg('');
    }, 3500);
  };

  const handleUploadFotoKS = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingKS(true);
    try {
      // Compress to lightweight, clean format to avoid QuotaExceededError
      const compressed = await compressImage(file, 480, 480, 0.82);
      if (compressed) {
        setFotoKepalaSekolah(compressed);
        db.updateSekolah({ fotoKepalaSekolah: compressed });
        const current = db.getSettings();
        db.saveSettings({ ...current, fotoKepalaSekolah: compressed });
        setSuccessMsg('Foto Kepala Sekolah berhasil diperbarui dan disimpan!');
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (err) {
      console.error('Foto KS upload error:', err);
      alert('Gagal memproses foto. Silakan coba file foto lain.');
    } finally {
      setIsUploadingKS(false);
      // Reset input value so re-selecting same file triggers change
      e.target.value = '';
    }
  };

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingLogo(true);
    try {
      const compressed = await compressImage(file, 360, 360, 0.88);
      if (compressed) {
        setLogoUrl(compressed);
        db.updateSekolah({ logo: compressed });
        db.updateSettings({ logoUrl: compressed });
        const current = db.getSettings();
        db.saveSettings({ ...current, logoUrl: compressed });
        setSuccessMsg('Logo sekolah berhasil diperbarui di seluruh dokumen!');
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (err) {
      console.error('Logo upload error:', err);
      alert('Gagal memproses logo. Silakan coba file lain.');
    } finally {
      setIsUploadingLogo(false);
      // Reset input value
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Profil & Identitas Resmi Sekolah
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Perubahan pada profil ini otomatis diperbarui pada Header Sistem, Kartu Identitas, Presensi, dan Dokumen e-Rapor.
          </p>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-semibold flex items-center gap-3 animate-in fade-in">
          <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Identitas Utama */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <Building2 className="w-4 h-4 text-blue-700" />
            <span>Identitas Utama Sekolah</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Resmi Sekolah
              </label>
              <input
                type="text"
                value={namaSekolah}
                onChange={(e) => setNamaSekolah(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                NPSN (Nomor Pokok Sekolah Nasional)
              </label>
              <input
                type="text"
                value={npsn}
                onChange={(e) => setNpsn(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-500" />
                <span>Nomor Telepon / Kontak</span>
              </label>
              <input
                type="text"
                value={telepon}
                onChange={(e) => setTelepon(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-500" />
                <span>Email Resmi Sekolah</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
              />
            </div>
          </div>
        </div>

        {/* Alamat Lengkap & Wilayah */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <MapPin className="w-4 h-4 text-blue-700" />
            <span>Alamat & Wilayah Geografis</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alamat Jalan / Dusun / Kampung
              </label>
              <textarea
                rows={2}
                value={alamat}
                onChange={(e) => handleAlamatChange(e.target.value)}
                placeholder="Contoh: Kp. Bojong No. 12 RT 01/RW 03"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Alamat ini akan langsung tampil pada kop resmi cetak dokumen, kartu pelajar, dan laporan akademik.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Desa / Kelurahan
              </label>
              <input
                type="text"
                value={desa}
                onChange={(e) => setDesa(e.target.value)}
                placeholder="Contoh: Giriharja"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kecamatan
              </label>
              <input
                type="text"
                value={kecamatan}
                onChange={(e) => setKecamatan(e.target.value)}
                placeholder="Contoh: Ciparay"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kabupaten / Kota
              </label>
              <input
                type="text"
                value={kabupaten}
                onChange={(e) => setKabupaten(e.target.value)}
                placeholder="Contoh: Kabupaten Bandung"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Provinsi
              </label>
              <input
                type="text"
                value={provinsi}
                onChange={(e) => setProvinsi(e.target.value)}
                placeholder="Contoh: Jawa Barat"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kode Pos
              </label>
              <input
                type="text"
                value={kodePos}
                onChange={(e) => setKodePos(e.target.value)}
                placeholder="Contoh: 40381"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white font-mono"
              />
            </div>
          </div>
        </div>

        {/* Visi & Misi */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <FileText className="w-4 h-4 text-blue-700" />
            <span>Visi & Misi Satuan Pendidikan</span>
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Visi Sekolah
              </label>
              <textarea
                rows={2}
                value={visi}
                onChange={(e) => setVisi(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Misi Sekolah (Pisahkan setiap poin dengan baris baru / Enter)
              </label>
              <textarea
                rows={4}
                value={misi}
                onChange={(e) => setMisi(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white leading-relaxed"
              />
            </div>
          </div>
        </div>

        {/* Logo Sekolah */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <Sparkles className="w-4 h-4 text-blue-700" />
            <span>Logo Resmi Sekolah (Header & Kop Dokumen)</span>
          </h3>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="w-32 h-32 rounded-2xl overflow-hidden bg-slate-50 border-2 border-slate-200 shadow-md flex items-center justify-center p-2 flex-shrink-0">
              <img
                src={logoUrl || '/logo.svg'}
                alt="Logo Sekolah"
                className="w-full h-full object-contain"
              />
            </div>

            <div className="space-y-3 flex-1 text-center sm:text-left">
              <p className="text-xs text-slate-500 leading-relaxed">
                Logo resmi ini akan ditampilkan di pojok kiri atas aplikasi (header), kartu identitas (ID Card), presensi QR, serta kop seluruh dokumen resmi dan e-Rapor. 
                Gunakan gambar dengan format PNG transparan atau JPG.
              </p>
              <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
                <input
                  type="file"
                  id="upload-logo-foto"
                  accept="image/*"
                  onChange={handleUploadLogo}
                  className="hidden"
                />
                <label
                  htmlFor="upload-logo-foto"
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xl cursor-pointer inline-flex items-center gap-2 transition-colors shadow-xs"
                >
                  <Upload className="w-4 h-4" />
                  Ganti Logo Sekolah
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setLogoUrl('/logo.svg');
                    db.updateSekolah({ logo: '/logo.svg' });
                    db.updateSettings({ logoUrl: '/logo.svg' });
                    setSuccessMsg('Logo dikembalikan ke logo default.');
                    setTimeout(() => setSuccessMsg(''), 3000);
                  }}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                >
                  Gunakan Logo Default
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Kepala Sekolah */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <User className="w-4 h-4 text-blue-700" />
            <span>Kepala Sekolah (Penandatangan Dokumen Resmi & e-Rapor)</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-start">
            <div className="sm:col-span-4 flex flex-col items-center text-center space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <div className="w-36 h-36 rounded-2xl overflow-hidden border-2 border-blue-600 shadow-md bg-white flex items-center justify-center relative">
                {fotoKepalaSekolah ? (
                  <img
                    src={fotoKepalaSekolah}
                    alt="Kepala Sekolah"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-100">
                    <User className="w-12 h-12 text-slate-300 mb-1" />
                    <span className="text-[10px]">Belum Ada Foto</span>
                  </div>
                )}

                {isUploadingKS && (
                  <div className="absolute inset-0 bg-blue-900/60 backdrop-blur-xs flex flex-col items-center justify-center text-white text-xs">
                    <Loader2 className="w-6 h-6 animate-spin mb-1" />
                    <span>Menyimpan...</span>
                  </div>
                )}
              </div>

              <div className="w-full space-y-2">
                <input
                  type="file"
                  id="upload-ks-foto"
                  accept="image/*"
                  onChange={handleUploadFotoKS}
                  className="hidden"
                />
                <label
                  htmlFor="upload-ks-foto"
                  className="w-full py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-xl cursor-pointer flex items-center justify-center gap-2 transition-colors shadow-xs"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Pilih & Ganti Foto</span>
                </label>

                {fotoKepalaSekolah && (
                  <button
                    type="button"
                    onClick={() => {
                      setFotoKepalaSekolah('');
                      db.updateSekolah({ fotoKepalaSekolah: '' });
                      const current = db.getSettings();
                      db.saveSettings({ ...current, fotoKepalaSekolah: '' });
                      setSuccessMsg('Foto Kepala Sekolah berhasil dihapus.');
                      setTimeout(() => setSuccessMsg(''), 3000);
                    }}
                    className="w-full py-1.5 text-[11px] text-rose-600 hover:bg-rose-50 rounded-lg transition-colors font-medium"
                  >
                    Hapus Foto
                  </button>
                )}
              </div>
            </div>

            <div className="sm:col-span-8 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Lengkap & Gelar Kepala Sekolah
                  </label>
                  <input
                    type="text"
                    value={namaKepalaSekolah}
                    onChange={(e) => setNamaKepalaSekolah(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white font-bold"
                    placeholder="Contoh: H. Ahmad Fauzi, M.Pd."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    NIP Kepala Sekolah
                  </label>
                  <input
                    type="text"
                    value={nipKepalaSekolah}
                    onChange={(e) => setNipKepalaSekolah(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white font-mono"
                    placeholder="Contoh: 19780512 200501 1 004"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Atau Tempel URL Foto (Opsional)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={fotoKepalaSekolah}
                    onChange={(e) => setFotoKepalaSekolah(e.target.value)}
                    placeholder="https://images.unsplash.com/... atau link foto web"
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white text-slate-700"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (fotoKepalaSekolah.trim()) {
                        db.updateSekolah({ fotoKepalaSekolah });
                        const current = db.getSettings();
                        db.saveSettings({ ...current, fotoKepalaSekolah });
                        setSuccessMsg('Foto Kepala Sekolah berhasil disimpan!');
                        setTimeout(() => setSuccessMsg(''), 3000);
                      }
                    }}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
                  >
                    Terapkan URL
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Foto ini ditampilkan pada data profil resmi dan cetak dokumen identitas pimpinan sekolah.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Submit button */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="px-6 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>Simpan Perubahan Profil Sekolah</span>
          </button>
        </div>
      </form>
    </div>
  );
};
