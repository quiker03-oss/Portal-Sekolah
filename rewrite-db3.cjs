const fs = require('fs');

let code = fs.readFileSync('src/services/database.ts', 'utf8');

// Update setActiveSchoolId
code = code.replace(
  `setActiveSchoolId(schoolId: string): void {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_SCHOOL_ID, schoolId);
    this.cache.clear();
    window.dispatchEvent(new CustomEvent('school_changed', { detail: schoolId }));
  }`,
  `setActiveSchoolId(schoolId: string): void {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_SCHOOL_ID, schoolId);
    this.cache.clear();
    this.initFirestore(schoolId);
    window.dispatchEvent(new CustomEvent('school_changed', { detail: schoolId }));
  }`
);

// Update init
code = code.replace(
  `  init(): void {`,
  `  init(): void {\n    this.initFirestore(this.getActiveSchoolId());\n    this.initFirestore('superadmin');`
);

fs.writeFileSync('src/services/database.ts', code);
