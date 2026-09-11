const fs = require('fs');
let code = fs.readFileSync('src/services/database.ts', 'utf8');

const newSetItem = `
  private setItem<T>(key: string, value: T): void {
    const actualKey = this.resolveStorageKey(key);
    
    // FIRESTORE SYNC LOGIC
    let schoolId = 'superadmin';
    let colName = '';

    if (!this.isSchoolScopedKey(key)) {
       // Global keys
       colName = key.replace('sdn2_', ''); // e.g. 'school_accounts'
    } else {
       // Scoped keys like school_sch-1_users
       const match = actualKey.match(/^school_(.+?)_(.+)$/);
       if (match) {
          schoolId = match[1];
          colName = match[2];
       } else {
          // fallback
          colName = actualKey.replace('sdn2_', '');
          schoolId = this.getActiveSchoolId();
       }
    }

    if (colName === 'absensi_siswa' || colName === 'kas' || colName === 'siswa' || colName === 'guru' || colName === 'kelas' || colName === 'mapel' || colName === 'nilai' || colName === 'nilai_harian' || colName === 'catatan_rapor' || colName === 'pengumuman' || colName === 'berita' || colName === 'galeri' || colName === 'users' || colName === 'school_accounts') {
      if (Array.isArray(value)) {
        const previous = (this.cache.get(actualKey) as any[]) || [];
        
        value.forEach((item: any) => {
           if (!item || !item.id) return;
           const prevItem = previous.find((p: any) => p.id === item.id);
           if (!prevItem || JSON.stringify(prevItem) !== JSON.stringify(item)) {
              this.syncToFirestore(schoolId, colName, item);
           }
        });
        
        previous.forEach((prevItem: any) => {
           if (!prevItem || !prevItem.id) return;
           const exists = value.find((v: any) => v.id === prevItem.id);
           if (!exists) {
              this.deleteFromFirestore(schoolId, colName, prevItem.id);
           }
        });
      }
    } else if (colName === 'settings' || colName === 'landing_config') {
       this.syncToFirestore(schoolId, colName, { ...(value as any), id: 'default' });
    }

    this.cache.set(actualKey, Array.isArray(value) ? [...value] : value);
    try {
      localStorage.setItem(actualKey, JSON.stringify(value));
    } catch (e) {
      console.error('Storage error:', e);
    }
  }
`;

code = code.replace(/private setItem<T>\(key: string, value: T\): void \{[\s\S]*?console\.error\('Storage error:', e\);\n    \}\n  \}/, newSetItem);
fs.writeFileSync('src/services/database.ts', code);
