import React, { useState, useEffect } from 'react';
import { db } from '../services/database';
import { SekolahInfo, User, SchoolAccount } from '../types';
import { LogIn, LayoutDashboard, Menu, X, Phone, Mail, UserPlus, ChevronDown } from 'lucide-react';

interface NavbarProps {
  onOpenLogin: () => void;
  onOpenRegister?: () => void;
  onNavigateToDashboard: () => void;
  currentUser: User | null;
  activeSection: string;
  onNavigateSection: (sectionId: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenLogin,
  onOpenRegister,
  onNavigateToDashboard,
  currentUser,
  activeSection,
  onNavigateSection,
}) => {
  const [sekolah, setSekolah] = useState<SekolahInfo>(db.getSekolah());
  const [activeSchoolId, setActiveSchoolId] = useState<string>(db.getActiveSchoolId());
  const [schoolAccounts, setSchoolAccounts] = useState<SchoolAccount[]>(() =>
    db.getSchoolAccounts().filter((s) => s.status === 'aktif')
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleUpdate = () => {
      setSekolah(db.getSekolah());
      setActiveSchoolId(db.getActiveSchoolId());
      setSchoolAccounts(db.getSchoolAccounts().filter((s) => s.status === 'aktif'));
    };
    window.addEventListener('sekolah_updated', handleUpdate);
    window.addEventListener('school_changed', handleUpdate);
    window.addEventListener('school_accounts_changed', handleUpdate);
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('sekolah_updated', handleUpdate);
      window.removeEventListener('school_changed', handleUpdate);
      window.removeEventListener('school_accounts_changed', handleUpdate);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const navLinks = [
    { id: 'beranda', label: 'Beranda' },
    { id: 'profil', label: 'Profil Sekolah' },
    { id: 'guru', label: 'Guru & Tendik' },
    { id: 'pengumuman', label: 'Pengumuman' },
    { id: 'berita', label: 'Berita' },
    { id: 'galeri', label: 'Galeri' },
    { id: 'kontak', label: 'Kontak' },
  ];

  const handleNavClick = (id: string) => {
    onNavigateSection(id);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 w-full transition-all duration-300">
      {/* Top microbar */}
      <div className="bg-blue-900 text-blue-100 text-xs py-1.5 px-4 hidden sm:block border-b border-blue-800">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-blue-300" />
              {sekolah.telepon}
            </span>
            <span className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-blue-300" />
              {sekolah.email}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {schoolAccounts.length > 1 && !currentUser && (
              <div className="flex items-center gap-1.5 bg-blue-950/70 px-2.5 py-0.5 rounded-sm border border-blue-700/60">
                <span className="text-[10px] text-blue-300 font-medium">Satuan Pendidikan:</span>
                <select
                  value={activeSchoolId}
                  onChange={(e) => {
                    const newId = e.target.value;
                    db.setActiveSchoolId(newId);
                    setActiveSchoolId(newId);
                    window.dispatchEvent(new CustomEvent('school_changed', { detail: newId }));
                  }}
                  className="bg-transparent text-white text-[11px] font-semibold focus:outline-none cursor-pointer"
                >
                  {schoolAccounts.map((s) => (
                    <option key={s.id} value={s.id} className="text-slate-900 bg-white">
                      {s.namaSekolah}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <span className="bg-blue-800/80 px-2 py-0.5 rounded text-[11px] font-medium tracking-wide">
              NPSN: {sekolah.npsn}
            </span>
            <span className="truncate max-w-xs">{sekolah.alamat || `Kec. ${sekolah.kecamatan}, ${sekolah.kabupaten}`}</span>
          </div>
        </div>
      </div>

      {/* Main Navbar */}
      <nav
        className={`w-full bg-white transition-shadow ${
          scrolled ? 'shadow-md border-b border-slate-200' : 'border-b border-slate-100'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Logo and Name */}
            <div
              onClick={() => handleNavClick('beranda')}
              className="flex items-center gap-3.5 cursor-pointer group select-none"
              id="nav-logo-brand"
            >
              <div className="relative w-12 h-12 flex-shrink-0 rounded-xl overflow-hidden bg-blue-50 p-1 border border-blue-200 group-hover:border-blue-400 transition-colors shadow-xs">
                <img
                  src={sekolah.logo}
                  alt={sekolah.nama}
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div>
                <span className="block text-xs font-semibold text-blue-700 tracking-widest uppercase">
                  Sekolah Dasar Negeri
                </span>
                <h1 className="text-xl font-bold tracking-tight text-slate-900 group-hover:text-blue-700 transition-colors leading-none">
                  {sekolah.nama}
                </h1>
                <span className="text-[11px] text-slate-500 font-medium truncate block max-w-[280px]">
                  {sekolah.alamat ? sekolah.alamat : `${sekolah.kecamatan}, ${sekolah.kabupaten}`}
                </span>
              </div>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center gap-1 xl:gap-2">
              {navLinks.map((item) => (
                <button
                  key={item.id}
                  id={`nav-link-${item.id}`}
                  onClick={() => handleNavClick(item.id)}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                    activeSection === item.id
                      ? 'text-blue-700 bg-blue-50'
                      : 'text-slate-600 hover:text-blue-700 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Auth Action Button */}
            <div className="hidden sm:flex items-center gap-2.5">
              {currentUser ? (
                <div className="flex items-center gap-2.5">
                  <div className="text-right">
                    <span className="block text-xs font-bold text-slate-800 leading-tight">
                      {currentUser.name}
                    </span>
                    <span className="block text-[10px] text-blue-700 font-semibold uppercase tracking-wider">
                      {currentUser.role === 'admin' ? 'Operator Sekolah' : 'Guru'}
                    </span>
                  </div>
                  <button
                    id="btn-goto-dashboard"
                    onClick={onNavigateToDashboard}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold shadow-xs transition-colors"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    Buka Dashboard
                  </button>
                </div>
              ) : (
                <button
                  id="btn-open-login"
                  onClick={onOpenLogin}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold shadow-xs transition-all hover:shadow"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Login Portal</span>
                </button>
              )}
            </div>

            {/* Mobile Menu Toggle */}
            <div className="flex lg:hidden items-center gap-2">
              {currentUser && (
                <button
                  onClick={onNavigateToDashboard}
                  className="p-2 rounded-lg bg-blue-50 text-blue-700"
                  title="Ke Dashboard"
                >
                  <LayoutDashboard className="w-5 h-5" />
                </button>
              )}
              <button
                id="btn-toggle-mobile-menu"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2.5 rounded-lg text-slate-700 hover:bg-slate-100"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-100 bg-white px-4 pt-3 pb-6 space-y-2 shadow-lg animate-in slide-in-from-top-2 duration-200">
            {navLinks.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium ${
                  activeSection === item.id
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {item.label}
              </button>
            ))}

            <div className="pt-4 border-t border-slate-100 space-y-2">
              {currentUser ? (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onNavigateToDashboard();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-blue-700 text-white text-sm font-semibold shadow-xs"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Buka Dashboard
                </button>
              ) : (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenLogin();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-700 text-white text-xs font-semibold shadow-xs"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Login Guru & Admin</span>
                </button>
              )}
            </div>
          </div>
        )}
      </nav>
    </header>
  );
};
