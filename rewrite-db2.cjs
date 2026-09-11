const fs = require('fs');

let code = fs.readFileSync('src/services/database.ts', 'utf8');

const setItemCode = `
  private setItem<T>(key: string, value: T): void {
    const actualKey = this.resolveStorageKey(key);
    
    // --- FIRESTORE SYNC LOGIC ---
    if (actualKey.includes('_sdn2_')) {
      const parts = actualKey.split('_sdn2_');
      const schoolId = parts[0];
      let colName = parts[1];
      
      // Some keys might not map 1:1, but they mostly do.
      if (colName === 'absensi_siswa' || colName === 'kas' || colName === 'siswa' || colName === 'guru' || colName === 'kelas' || colName === 'mapel' || colName === 'nilai' || colName === 'nilai_harian' || colName === 'catatan_rapor' || colName === 'pengumuman' || colName === 'berita' || colName === 'galeri' || colName === 'users') {
        if (Array.isArray(value)) {
          const previous = (this.cache.get(actualKey) as any[]) || [];
          
          // Added or updated
          value.forEach((item: any) => {
             if (!item || !item.id) return;
             const prevItem = previous.find((p: any) => p.id === item.id);
             if (!prevItem || JSON.stringify(prevItem) !== JSON.stringify(item)) {
                this.syncToFirestore(schoolId, colName, item);
             }
          });
          
          // Deleted
          previous.forEach((prevItem: any) => {
             if (!prevItem || !prevItem.id) return;
             const exists = value.find((v: any) => v.id === prevItem.id);
             if (!exists) {
                this.deleteFromFirestore(schoolId, colName, prevItem.id);
             }
          });
        }
      } else if (colName === 'settings' || colName === 'landing_config') {
         // Objects, not arrays
         this.syncToFirestore(schoolId, colName, { ...value, id: 'default' });
      } else if (colName === 'school_accounts') {
         if (Array.isArray(value)) {
            const previous = (this.cache.get(actualKey) as any[]) || [];
            value.forEach((item: any) => {
               if (!item || !item.id) return;
               const prevItem = previous.find((p: any) => p.id === item.id);
               if (!prevItem || JSON.stringify(prevItem) !== JSON.stringify(item)) {
                  this.syncToFirestore('superadmin', 'school_accounts', item);
               }
            });
            previous.forEach((prevItem: any) => {
               if (!prevItem || !prevItem.id) return;
               const exists = value.find((v: any) => v.id === prevItem.id);
               if (!exists) {
                  this.deleteFromFirestore('superadmin', 'school_accounts', prevItem.id);
               }
            });
         }
      }
    }
    // --- END FIRESTORE SYNC LOGIC ---

    this.cache.set(actualKey, Array.isArray(value) ? [...value] : value);
    try {
      localStorage.setItem(actualKey, JSON.stringify(value));
    } catch (e) {
      console.error('Storage error:', e);
    }
  }
`;

// Replace the existing setItem method
code = code.replace(/private setItem<T>\(key: string, value: T\): void \{[\s\S]*?console\.error\('Storage error:', e\);\n    \}\n  \}/, setItemCode);

fs.writeFileSync('src/services/database.ts', code);
