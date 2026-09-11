import React, { useState } from 'react';
import { db } from '../../services/database';
import { Settings } from '../../types';
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
  Image as ImageIcon,
} from 'lucide-react';

export const ProfilSekolahView: React.FC = () => {
  const [settings, setSettings] = useState<Settings>(db.getSettings());
  const [successMsg, setSuccessMsg] = useState('');

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
  const [sambutanKepalaSekolah, setSambutanKepalaSekolah] = useState(
    settings.sambutanKepalaSekolah
  );
  const [fotoKepalaSekolah, setFotoKepalaSekolah] = useState(settings.fotoKepalaSekolah);
  const [fotoSekolah, setFotoSekolah] = useState(settings.fotoSekolah);
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
      sambutanKepalaSekolah,
      fotoKepalaSekolah,
      fotoSekolah,
      logoUrl,
    };

    db.saveSettings(updated);
    setSettings(updated);
    setSuccessMsg('Profil sekolah & alamat berhasil disimpan dan diperbarui di seluruh sistem!');

    setTimeout(() => {
      setSuccessMsg('');
    }, 3500);
  };

  const handleUploadFotoKS = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      setFotoKepalaSekolah(evt.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      setLogoUrl(evt.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadFotoSekolah = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      setFotoSekolah(evt.target?.result as string);
    };
    reader.readAsDataURL(file);
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
            Perubahan pada profil ini akan otomatis diperbarui pada Landing Page, Kartu Identitas, dan e-Rapor
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
        {/* Identitas Pokok */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <Building2 className="w-4 h-4 text-blue-700" />
            <span>Identitas Pokok Sekolah</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Sekolah Resmi
              </label>
              <input
                type="text"
                required
                value={namaSekolah}
                onChange={(e) => setNamaSekolah(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">NPSN</label>
              <input
                type="text"
                required
                value={npsn}
                onChange={(e) => setNpsn(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nomor Telepon / WhatsApp Sekolah
              </label>
              <input
                type="text"
                value={telepon}
                onChange={(e) => setTelepon(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Sekolah
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alamat Lengkap / Jalan / Dusun / RT-RW
              </label>
              <textarea
                rows={2}
                value={alamat}
                onChange={(e) => handleAlamatChange(e.target.value)}
                placeholder="Contoh: Kp. Bojong No. 12 RT 01/RW 03"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Alamat ini akan langsung tampil di Landing Page (bagian kontak, footer, dan peta) serta kop cetak dokumen.
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

            <div className="grid grid-cols-2 gap-2">
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
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Visi dan Misi */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <FileText className="w-4 h-4 text-blue-700" />
            <span>Visi dan Misi Sekolah</span>
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Visi Sekolah
              </label>
              <textarea
                rows={3}
                value={visi}
                onChange={(e) => setVisi(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Misi Sekolah (Tuliskan satu poin per baris)
              </label>
              <textarea
                rows={5}
                value={misi}
                onChange={(e) => setMisi(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white leading-relaxed"
              />
            </div>
          </div>
        </div>

        {/* Foto Background Landing Page */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <ImageIcon className="w-4 h-4 text-blue-700" />
            <span>Foto Background Landing Page</span>
          </h3>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="w-48 h-32 rounded-2xl overflow-hidden bg-slate-100 border-2 border-slate-200 shadow-md flex items-center justify-center flex-shrink-0">
              <img
                src={fotoSekolah || 'https://via.placeholder.com/600x400'}
                alt="Foto Gedung Sekolah"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="space-y-3 flex-1 text-center sm:text-left">
              <p className="text-xs text-slate-500">
                Foto ini akan digunakan sebagai gambar latar belakang (background) utama di halaman depan aplikasi.
                Disarankan menggunakan foto gedung sekolah dengan orientasi landscape (mendatar) beresolusi tinggi.
              </p>
              <div>
                <input
                  type="file"
                  id="upload-foto-sekolah"
                  accept="image/*"
                  onChange={handleUploadFotoSekolah}
                  className="hidden"
                />
                <label
                  htmlFor="upload-foto-sekolah"
                  className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl cursor-pointer inline-flex items-center gap-2 transition-colors border border-blue-200"
                >
                  <Upload className="w-4 h-4" />
                  Ganti Background
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Logo Sekolah */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <Sparkles className="w-4 h-4 text-blue-700" />
            <span>Logo Sekolah (Tampil di Landing Page & Header)</span>
          </h3>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="w-32 h-32 rounded-2xl overflow-hidden bg-slate-100 border-2 border-slate-200 shadow-md flex items-center justify-center p-2 flex-shrink-0">
              <img
                src={logoUrl || 'https://via.placeholder.com/150'}
                alt="Logo Sekolah"
                className="w-full h-full object-contain"
              />
            </div>

            <div className="space-y-3 flex-1 text-center sm:text-left">
              <p className="text-xs text-slate-500">
                Logo ini akan ditampilkan di pojok kiri atas aplikasi, halaman depan (landing page), dan dokumen cetak resmi. 
                Gunakan gambar dengan format PNG (transparan) atau JPG dengan resolusi minimal 500x500px.
              </p>
              <div>
                <input
                  type="file"
                  id="upload-logo-foto"
                  accept="image/*"
                  onChange={handleUploadLogo}
                  className="hidden"
                />
                <label
                  htmlFor="upload-logo-foto"
                  className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl cursor-pointer inline-flex items-center gap-2 transition-colors border border-blue-200"
                >
                  <Upload className="w-4 h-4" />
                  Upload Logo Sekolah
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Kepala Sekolah */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <User className="w-4 h-4 text-blue-700" />
            <span>Kepala Sekolah & Sambutan</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-6">
            <div className="sm:col-span-4 flex flex-col items-center text-center space-y-3">
              <div className="w-36 h-36 rounded-2xl overflow-hidden border-2 border-blue-600 shadow-md">
                <img
                  src={fotoKepalaSekolah}
                  alt="Kepala Sekolah"
                  className="w-full h-full object-cover"
                />
              </div>

              <div>
                <input
                  type="file"
                  id="upload-ks-foto"
                  accept="image/*"
                  onChange={handleUploadFotoKS}
                  className="hidden"
                />
                <label
                  htmlFor="upload-ks-foto"
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer flex items-center gap-1.5 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5 text-blue-700" />
                  Ganti Foto Kepala Sekolah
                </label>
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
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Naskah Sambutan Kepala Sekolah (Tampil di Landing Page)
                </label>
                <textarea
                  rows={4}
                  value={sambutanKepalaSekolah}
                  onChange={(e) => setSambutanKepalaSekolah(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white leading-relaxed"
                />
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
