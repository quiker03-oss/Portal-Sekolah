import React, { useState, useEffect } from 'react';
import { db } from '../services/database';
import { SekolahInfo } from '../types';
import { MapPin, Phone, Mail, Clock, ShieldCheck, Award } from 'lucide-react';

export const Footer: React.FC = () => {
  const [sekolah, setSekolah] = useState<SekolahInfo>(db.getSekolah());

  useEffect(() => {
    const handleUpdate = () => setSekolah(db.getSekolah());
    window.addEventListener('sekolah_updated', handleUpdate);
    return () => window.removeEventListener('sekolah_updated', handleUpdate);
  }, []);

  return (
    <footer className="bg-slate-900 text-slate-300 pt-16 pb-12 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Col 1: Brand & Bio */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white rounded-xl p-1 shadow-sm flex-shrink-0 flex items-center justify-center">
                <img
                  src={sekolah.logo}
                  alt={sekolah.nama}
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-wide">{sekolah.nama}</h3>
                <p className="text-xs text-blue-400 font-medium">Sistem Digital Sekolah Terpadu</p>
              </div>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              Mewujudkan generasi pembelajar yang berakhlak mulia, cerdas, berkarakter Pancasila, dan melek digital di era modern.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-800 text-emerald-400 text-xs font-semibold rounded-full border border-slate-700">
                <ShieldCheck className="w-3.5 h-3.5" /> Terakreditasi A
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-800 text-amber-400 text-xs font-semibold rounded-full border border-slate-700">
                <Award className="w-3.5 h-3.5" /> Sekolah Ramah Anak
              </span>
            </div>
          </div>

          {/* Col 2: Kontak & Alamat */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Kontak & Alamat</h4>
            <ul className="space-y-2.5 text-sm text-slate-400">
              <li className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <span>{sekolah.alamat}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <span>{sekolah.telepon}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <span>{sekolah.email}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <span>Senin - Sabtu: 06.45 - 14.00 WIB</span>
              </li>
            </ul>
          </div>

          {/* Col 3: Data Pokok Sekolah */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Identitas Satuan Pendidikan</h4>
            <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/60 space-y-2 text-xs">
              <div className="flex justify-between pb-1 border-b border-slate-700">
                <span className="text-slate-400">NPSN</span>
                <span className="text-white font-semibold">{sekolah.npsn}</span>
              </div>
              <div className="flex justify-between pb-1 border-b border-slate-700">
                <span className="text-slate-400">NSS</span>
                <span className="text-white font-semibold">{sekolah.nss}</span>
              </div>
              <div className="flex justify-between pb-1 border-b border-slate-700">
                <span className="text-slate-400">Status</span>
                <span className="text-emerald-400 font-semibold">Negeri</span>
              </div>
              <div className="flex justify-between pb-1 border-b border-slate-700">
                <span className="text-slate-400">Kurikulum</span>
                <span className="text-white font-semibold">Kurikulum Merdeka</span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-slate-400">Kepala Sekolah</span>
                <span className="text-white font-medium text-right">{sekolah.namaKepalaSekolah}</span>
              </div>
            </div>
          </div>

          {/* Col 4: Layanan Digital */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Portal Digital</h4>
            <p className="text-xs text-slate-400">
              Sistem informasi sekolah terpadu memfasilitasi absensi cepat dengan QR Code, pencatatan akademik, serta pengelolaan nilai e-Rapor resmi bagi Tenaga Pendidik.
            </p>
            <div className="p-3 bg-blue-950/60 border border-blue-800/50 rounded-lg text-xs text-blue-300">
              <p className="font-semibold text-blue-200">Keamanan Akses</p>
              <p className="mt-0.5 text-blue-300/90">Akses dibatasi khusus untuk Administrator dan Dewan Guru yang terdaftar.</p>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} {sekolah.nama}. Hak Cipta Dilindungi.</p>
          <p className="text-slate-400">Sistem Informasi Akademik & Absensi Digital Terpadu</p>
        </div>
      </div>
    </footer>
  );
};
