import React, { useState, useEffect } from 'react';
import { db } from '../../services/database';
import { User, Settings } from '../../types';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { BellRing,
  LayoutDashboard,
  Building2,
  GraduationCap,
  Upload,
  QrCode,
  FileSpreadsheet,
  Users,
  Layers,
  BookOpen,
  CalendarCheck,
  UserCheck,
  FileText,
  Megaphone,
  Newspaper,
  Image as ImageIcon,
  Settings as SettingsIcon,
  LogOut,
  ChevronRight,
  Menu,
  X,
  ExternalLink,
  Shield,
  User as UserIcon,
  Cloud,
  Wallet,
  LayoutTemplate,
  Sparkles,
} from 'lucide-react';

// Subviews
import { DashboardView } from './DashboardView';
import { AsistenAiGuruView } from './AsistenAiGuruView';
import { DataSiswaView } from './DataSiswaView';
import { ImportSiswaView } from './ImportSiswaView';
import { QrCodeSiswaView } from './QrCodeSiswaView';
import { DataGuruView } from './DataGuruView';
import { QrCodeGuruView } from './QrCodeGuruView';
import { DataKelasMapelView } from './DataKelasMapelView';
import { NilaiHarianView } from './NilaiHarianView';
import { AbsensiSiswaView } from './AbsensiSiswaView';
import { AbsensiGuruView } from './AbsensiGuruView';
import { ERaporView } from './ERaporView';
import { ProfilSekolahView } from './ProfilSekolahView';
import { PengaturanView } from './PengaturanView';
import { BelOtomatisView } from './BelOtomatisView';
import { ManajemenPenggunaView } from './ManajemenPenggunaView';
import { UangKasView } from './UangKasView';

interface AdminLayoutProps {
  currentUser: User;
  onLogout: () => void;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  currentUser,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [settings, setSettings] = useState<Settings>(db.getSettings());
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);
  const [targetQrId, setTargetQrId] = useState<string | undefined>();

  useEffect(() => {
    let lastCheckedMinute = "";
    const interval = setInterval(() => {
      const now = new Date();
      const currentMinute = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      if (currentMinute !== lastCheckedMinute) {
        lastCheckedMinute = currentMinute;
        try {
          const raw = localStorage.getItem("bel_otomatis");
          if (!raw) return;
          const jadwal = JSON.parse(raw);
          const matches = jadwal.filter((j: any) => j.aktif && j.waktu === currentMinute);
          if (matches.length > 0) {
            import("../../services/audio").then(m => {
              m.sound.playBell(matches[0].tipeBel || "masuk");
              const msg = matches[0].pesanSuara;
              if (msg) {
                m.sound.speak(msg);
              }
            });
          }
        } catch { }
      }
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleSettingsUpdate = () => {
      setSettings(db.getSettings());
    };
    window.addEventListener('sekolah_updated', handleSettingsUpdate);
    window.addEventListener('settings_updated', handleSettingsUpdate);
    return () => {
      window.removeEventListener('sekolah_updated', handleSettingsUpdate);
      window.removeEventListener('settings_updated', handleSettingsUpdate);
    };
  }, []);

  const navigateToQrSiswa = (siswaId?: string) => {
    setTargetQrId(siswaId);
    setActiveTab('qr-siswa');
  };

  const navigateToQrGuru = (guruId?: string) => {
    setTargetQrId(guruId);
    setActiveTab('qr-guru');
  };

  // Nav item definitions based on user request (17 menu items)
  const isAdmin = currentUser.role === 'admin' || currentUser.role === 'superadmin';

  const menuSections = [
    {
      label: 'Utama',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, visible: true },
        { id: 'profil-sekolah', label: 'Profil Sekolah', icon: Building2, visible: isAdmin },
      ],
    },
    {
      label: 'Guru & Pembelajaran AI',
      items: [
        { id: 'asisten-ai-guru', label: 'Asisten AI Guru (Soal & RPP)', icon: Sparkles, visible: true },
      ],
    },
    {
      label: 'Kesiswaan & Guru',
      items: [
        { id: 'data-siswa', label: 'Data Siswa', icon: GraduationCap, visible: true },
        { id: 'import-siswa', label: 'Import Siswa', icon: Upload, visible: isAdmin },
        { id: 'uang-kas', label: 'Uang Kas Kelas', icon: Wallet, visible: true },
        { id: 'data-guru', label: 'Data Guru', icon: Users, visible: isAdmin },
      ],
    },
    {
      label: 'Akademik & Presensi',
      items: [
        { id: 'kelas-mapel', label: 'Kelas & Mapel', icon: BookOpen, visible: true },
        { id: 'nilai-harian', label: 'Nilai Harian Siswa', icon: FileSpreadsheet, visible: true },
        { id: 'absensi-siswa', label: 'Presensi Siswa', icon: CalendarCheck, visible: true },
        { id: 'absensi-guru', label: 'Presensi Guru', icon: UserCheck, visible: isAdmin },
        { id: 'e-rapor', label: 'e-Rapor Digital', icon: FileText, visible: true },
      ],
    },
    {
      label: 'Informasi & Sistem',
      items: [
        { id: 'bel-otomatis', label: 'Bel Sekolah Otomatis', icon: BellRing, visible: isAdmin },
        { id: 'pengaturan', label: 'Pengaturan Sistem', icon: SettingsIcon, visible: isAdmin },
        { id: 'manajemen-pengguna', label: 'Manajemen Pengguna', icon: Users, visible: isAdmin },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col antialiased">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs h-16 flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSidebarOpenMobile(!isSidebarOpenMobile)}
            className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 md:hidden"
            aria-label="Toggle Menu"
          >
            {isSidebarOpenMobile ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="flex items-center gap-2.5">
            <img
              src={settings.logoUrl}
              alt="Logo"
              className="w-9 h-9 object-contain"
            />
            <div>
              <h1 className="text-sm font-extrabold text-blue-900 tracking-tight leading-none">
                {settings.namaSekolah}
              </h1>
              <span className="text-[10px] text-slate-500 font-medium">
                Panel Administrasi Sekolah Digital
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* User profile capsule */}
          <div className="flex items-center gap-2.5 pl-1">
            <div className="w-8 h-8 rounded-xl bg-blue-700 text-white flex items-center justify-center font-bold text-xs shadow-xs">
              {currentUser.name.charAt(0)}
            </div>
            <div className="hidden md:block text-left">
              <span className="text-xs font-bold text-slate-800 block leading-tight">
                {currentUser.name}
              </span>
              <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider">
                {currentUser.role === 'admin'
                  ? 'Admin Sekolah'
                  : 'Dewan Guru'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Body Container with Sidebar + Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Overlay (Mobile) */}
        {isSidebarOpenMobile && (
          <div
            onClick={() => setIsSidebarOpenMobile(false)}
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs z-40 md:hidden"
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed md:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 shadow-sm flex flex-col justify-between transition-transform duration-200 ease-in-out ${
            isSidebarOpenMobile ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
        >
          {/* Scrollable nav items */}
          <div className="p-3 space-y-5 overflow-y-auto max-h-[calc(100vh-8rem)]">
            {menuSections.map((sec, sIdx) => {
              const visibleItems = sec.items.filter((item) => item.visible);
              if (visibleItems.length === 0) return null;

              return (
                <div key={sIdx} className="space-y-1">
                  <span className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                    {sec.label}
                  </span>
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        id={`menu-${item.id}`}
                        onClick={() => {
                          setActiveTab(item.id);
                          setIsSidebarOpenMobile(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isActive
                            ? 'bg-blue-50 text-blue-800 shadow-[inset_0_0_0_1px_rgba(37,99,235,0.2)]'
                            : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                          <span>{item.label}</span>
                        </div>
                        {isActive && <ChevronRight className="w-3.5 h-3.5 text-blue-400" />}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Bottom Sidebar Logout Button */}
          <div className="p-3 border-t border-slate-100 bg-slate-50/50">
            <button
              id="btn-logout"
              onClick={onLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Keluar (Logout)</span>
            </button>
          </div>
        </aside>

        {/* Content View Panel */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            <ErrorBoundary fallbackTitle="Kendala pada Halaman Ini" onReset={() => setActiveTab('dashboard')}>
              {currentUser.role === 'guru' && !currentUser.kelasId && activeTab !== 'dashboard' && (
                 <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl mb-6 shadow-xs flex gap-3 items-start animate-in fade-in">
                   <Shield className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-600" />
                   <div>
                     <h3 className="text-sm font-bold">Kelas mengajar belum ditentukan</h3>
                     <p className="text-xs mt-1 text-amber-700">Akun Anda belum dikaitkan dengan kelas mana pun oleh Admin Sekolah. Anda tidak akan dapat melihat atau mengelola data siswa sampai Admin menetapkan kelas Anda di menu Data Guru.</p>
                   </div>
                 </div>
              )}

              {activeTab === 'dashboard' && (
                <DashboardView currentUser={currentUser} onNavigate={(tab) => setActiveTab(tab)} />
              )}

              {activeTab === 'asisten-ai-guru' && <AsistenAiGuruView currentUser={currentUser} />}

              {activeTab === 'data-siswa' && (
                <DataSiswaView
                  onNavigateToImport={() => setActiveTab('import-siswa')}
                  onNavigateToQr={navigateToQrSiswa}
                />
              )}

              {activeTab === 'import-siswa' && (
                <ImportSiswaView onSuccess={() => setActiveTab('data-siswa')} />
              )}

              {activeTab === 'qr-siswa' && <QrCodeSiswaView initialSiswaId={targetQrId} />}

              {activeTab === 'uang-kas' && <UangKasView />}

              {activeTab === 'data-guru' && <DataGuruView onNavigateToQr={navigateToQrGuru} />}

              {activeTab === 'qr-guru' && <QrCodeGuruView initialGuruId={targetQrId} />}

              {activeTab === 'kelas-mapel' && <DataKelasMapelView />}

              {activeTab === 'nilai-harian' && <NilaiHarianView />}

              {activeTab === 'absensi-siswa' && <AbsensiSiswaView />}

              {activeTab === 'absensi-guru' && <AbsensiGuruView />}

              {activeTab === 'e-rapor' && <ERaporView />}

              {activeTab === 'profil-sekolah' && <ProfilSekolahView />}

              {activeTab === 'bel-otomatis' && <BelOtomatisView />}

              {activeTab === 'pengaturan' && <PengaturanView />}

              {activeTab === 'manajemen-pengguna' && <ManajemenPenggunaView currentUser={currentUser} />}
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
};
