const fs = require('fs');

let code = fs.readFileSync('src/services/database.ts', 'utf8');

// 1. Add Firebase imports
if (!code.includes('import { db as firestoreDb')) {
  code = code.replace(
    "import { STORAGE_KEYS",
    "import { db as firestoreDb, doc, setDoc, deleteDoc, collection, onSnapshot, query, getDocs } from './firebase';\nimport { STORAGE_KEYS"
  );
}

// 2. Add Firestore cache and init logic
// We will replace `private cache: Map<string, unknown> = new Map();`
// with our enhanced cache and sync logic.
const cacheLogic = `
  private cache: Map<string, unknown> = new Map();
  private firestoreUnsubs: (() => void)[] = [];

  private async syncToFirestore(schoolId: string, collectionName: string, item: any) {
    try {
      await setDoc(doc(firestoreDb, \`schools/\${schoolId}/\${collectionName}\`, item.id), item);
    } catch (e) {
      console.error('Firestore sync error:', e);
    }
  }

  private async deleteFromFirestore(schoolId: string, collectionName: string, itemId: string) {
    try {
      await deleteDoc(doc(firestoreDb, \`schools/\${schoolId}/\${collectionName}\`, itemId));
    } catch (e) {
      console.error('Firestore delete error:', e);
    }
  }

  initFirestore(schoolId: string) {
    // Clear old listeners
    this.firestoreUnsubs.forEach(unsub => unsub());
    this.firestoreUnsubs = [];

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
        // Also update local storage as backup
        localStorage.setItem(actualKey, JSON.stringify(list));
        
        // Fire generic event
        window.dispatchEvent(new Event(\`data_\${colName}_changed\`));
        // Fire specific events used by the app
        if (colName === 'kelas') window.dispatchEvent(new Event('data_kelas_changed'));
        if (colName === 'mapel') window.dispatchEvent(new Event('data_mapel_changed'));
        if (colName === 'absensi_siswa') window.dispatchEvent(new Event('absensi_siswa_updated'));
        if (colName === 'absensi_guru') window.dispatchEvent(new Event('absensi_guru_updated'));
        if (colName === 'nilai' || colName === 'catatan_rapor') window.dispatchEvent(new Event('nilai_updated'));
        if (colName === 'nilai_harian') window.dispatchEvent(new Event('nilai_harian_updated'));
        if (colName === 'pengumuman') window.dispatchEvent(new Event('pengumuman_updated'));
        if (colName === 'berita') window.dispatchEvent(new Event('berita_updated'));
        if (colName === 'galeri') window.dispatchEvent(new Event('galeri_updated'));
        if (colName === 'kas') window.dispatchEvent(new Event('kas_updated'));
      });
      this.firestoreUnsubs.push(unsub);
    });
  }
`;

code = code.replace('private cache: Map<string, unknown> = new Map();', cacheLogic);

fs.writeFileSync('src/services/database.ts', code);
