const fs = require('fs');
let code = fs.readFileSync('src/services/database.ts', 'utf8');

if (!code.includes("import { db as firestoreDb")) {
  code = "import { db as firestoreDb, doc, setDoc, deleteDoc, collection, onSnapshot, query, getDocs } from './firebase';\n" + code;
}

fs.writeFileSync('src/services/database.ts', code);
