const fs = require('fs');

let code = fs.readFileSync('src/services/database.ts', 'utf8');

const fixInit = `
    const collectionsMap: Record<string, string> = {
      [STORAGE_KEYS.SISWA]: 'siswa',
      [STORAGE_KEYS.GURU]: 'guru',
      [STORAGE_KEYS.KELAS]: 'kelas',
      [STORAGE_KEYS.MAPEL]: 'mapel',
      [STORAGE_KEYS.ABSENSI_SISWA]: 'absensi_siswa',
      [STORAGE_KEYS.ABSENSI_GURU]: 'absensi_guru',
      [STORAGE_KEYS.NILAI]: 'nilai',
      [STORAGE_KEYS.NILAI_HARIAN]: 'nilai_harian',
      [STORAGE_KEYS.CATATAN_RAPOR]: 'catatan_rapor',
      [STORAGE_KEYS.PENGUMUMAN]: 'pengumuman',
      [STORAGE_KEYS.BERITA]: 'berita',
      [STORAGE_KEYS.GALERI]: 'galeri',
      [STORAGE_KEYS.KAS]: 'kas',
      [STORAGE_KEYS.USERS]: 'users',
      [STORAGE_KEYS.SETTINGS]: 'settings'
    };

    Object.entries(collectionsMap).forEach(([storageKey, colName]) => {
      const q = query(collection(firestoreDb, \`schools/\${schoolId}/\${colName}\`));
      const unsub = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(d => d.data());
        const actualKey = this.getSchoolScopedKey(schoolId, storageKey);
        this.cache.set(actualKey, list);
        localStorage.setItem(actualKey, JSON.stringify(list));
        window.dispatchEvent(new Event(\`data_\${colName}_changed\`));
      });
      this.firestoreUnsubs.push(unsub);
    });

    // Special global listeners for SuperAdmin data
    if (schoolId === 'superadmin') {
       const qSchools = query(collection(firestoreDb, \`schools/superadmin/school_accounts\`));
       const unsubSchools = onSnapshot(qSchools, (snapshot) => {
         const list = snapshot.docs.map(d => d.data());
         this.cache.set(STORAGE_KEYS.SCHOOL_ACCOUNTS, list);
         localStorage.setItem(STORAGE_KEYS.SCHOOL_ACCOUNTS, JSON.stringify(list));
         window.dispatchEvent(new Event('school_accounts_changed'));
       });
       this.firestoreUnsubs.push(unsubSchools);
    }
`;

code = code.replace(/const collectionsMap: Record<string, string> = \{[\s\S]*?this\.firestoreUnsubs\.push\(unsub\);\n    \}\);/, fixInit);

fs.writeFileSync('src/services/database.ts', code);
