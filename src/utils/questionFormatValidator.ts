import { SoalUjian } from '../types';

export interface ParsedQuestionNumberMatch {
  nomor: number;
  delimiter: string;
  content: string;
  rawPrefix: string;
  hasExplicitLabel: boolean;
}

export interface ParsedOptionPrefixMatch {
  letter: 'A' | 'B' | 'C' | 'D' | 'E';
  delimiter: string;
  content: string;
}

export interface FilePrecheckResult {
  valid: boolean;
  errorCode?: 'EMPTY_FILE' | 'FILE_TOO_LARGE' | 'UNSUPPORTED_EXTENSION' | 'CORRUPTED_HEADER' | 'BINARY_TEXT_CORRUPT';
  errorMessage?: string;
  warnings: string[];
}

export interface StructureValidationResult {
  isValidFormat: boolean;
  errorCode?:
    | 'NO_QUESTIONS_FOUND'
    | 'NON_STANDARD_PATTERN'
    | 'BROKEN_OPTIONS_STRUCTURE'
    | 'HIGH_EMPTY_STEM_RATIO';
  fatalError?: string;
  warnings: string[];
  questionIssues: Map<number, string[]>;
  stats: {
    totalQuestions: number;
    pgCount: number;
    uraianCount: number;
    incompleteOptionsCount: number;
    missingNumbers: number[];
    duplicateNumbers: number[];
  };
}

// Abbreviations that must never be mistaken for choice labels (a.n., e.g., s.d., d.a., c.q., u.b., d.p.r., d.k.k., dll.)
const ABBREVIATION_AFTER_LETTER_RE = /^(?:[a-z]{1,4}\.|dkk\b|dll\b|dsb\b|dst\b|tsb\b|karena\b|antara\b|yaitu\b|yakni\b|dan\b|atau\b|adalah\b)/i;

// Standard non-question exam headers/instructions
const EXAM_INSTRUCTION_TEXT_RE =
  /(?:berdo[a']|tulislah\s+nama|tulis\s+nama|nomor\s+peserta|periksalah\s+(?:naskah|kelengkapan|halaman)|dahulukan\s+(?:soal|menjawab)|kerjakan\s+(?:terlebih\s+dahulu|soal\s+yang)|lembar\s+jawaban|tanyakan\s+kepada\s+pengawas|tidak\s+diperkenankan|waktu\s+mengerjakan|petunjuk\s+(?:umum|pengerjaan)|gunakan\s+pensil|bulatkan\s+pilihan)/i;

/**
 * Checks whether a single line is a standard Indonesian exam instruction / rule (not a real exam question).
 */
export function isLikelyExamInstructionLine(text: string): boolean {
  return EXAM_INSTRUCTION_TEXT_RE.test(text);
}

/**
 * Strictly parses a line prefix as a question number (`1.`, `1)`, `(1)`, `No. 1.`, `Soal 1:`, `Soal 1 ...`),
 * rejecting decimals (`3.14`), times (`10:30`), subheadings (`1.1`), and large years (`1945.`).
 */
export function parseQuestionNumberPrefix(line: string): ParsedQuestionNumberMatch | null {
  const trimmed = (line || '').trim();
  if (!trimmed) return null;

  // Guard: option labels like "A. ..." or "(A) ..." are never question numbers
  if (/^[\(\[]?[A-Ea-e]\s*[\.\)\:\]]/.test(trimmed)) {
    return null;
  }

  // Case 1: Explicit keyword prefix ("Soal No. 1", "No. 1", "Nomor 1.", "Soal 12 ...")
  const explicitMatch = trimmed.match(
    /^(soal\s*(?:no\.?|nomor)?\s*|no\.?\s*|nomor\s*)[\(\[]?(\d{1,3})[\)\]]?\s*([\.\)\:\]]?)\s+(?![0-9])([\s\S]*)/i
  );
  if (explicitMatch) {
    const num = parseInt(explicitMatch[2], 10);
    if (num >= 1 && num <= 500) {
      return {
        nomor: num,
        delimiter: explicitMatch[3] || '.',
        content: explicitMatch[4].trim(),
        rawPrefix: explicitMatch[0].slice(0, explicitMatch[0].length - explicitMatch[4].length).trim(),
        hasExplicitLabel: true,
      };
    }
  }

  // Case 2: Standard numeric prefix ("1. ...", "1) ...", "(1) ...", "[1] ...", "1: ...")
  const numericMatch = trimmed.match(
    /^[\(\[]?(\d{1,3})\s*([\.\)\:\]])\s*(?![0-9])([\s\S]*)/
  );
  if (numericMatch) {
    const num = parseInt(numericMatch[1], 10);
    const delimiter = numericMatch[2];
    const content = numericMatch[3].trim();

    if (num < 1 || num > 500) return null;

    // Reject decimal/thousand separators or academic subsection markers ("1.1", "2.000", "3,5")
    if (/^[\.,]\d/.test(content)) return null;

    // Require either whitespace after delimiter, parenthesized/bracketed number, or meaningful text start
    const hasSpaceAfterDelimiter = /^[\(\[]?\d{1,3}\s*[\.\)\:\]]\s+/.test(trimmed);
    const isParenthesized = /^[\(\[]\d{1,3}[\)\]]/.test(trimmed);
    if (!hasSpaceAfterDelimiter && !isParenthesized && delimiter === '.' && content.length > 0 && !/^[A-Za-z"'(“\[]/.test(content)) {
      return null;
    }

    return {
      nomor: num,
      delimiter,
      content,
      rawPrefix: `${numericMatch[1]}${delimiter}`,
      hasExplicitLabel: false,
    };
  }

  return null;
}

/**
 * Strictly parses a multiple-choice option prefix (`A.`, `(A)`, `[A]`, `A)`, `A:`, `a.`),
 * filtering out abbreviations like `a.n.`, `e.g.`, `d.p.r.`, `c.q.` or lowercase prose words.
 */
export function parseOptionPrefix(line: string): ParsedOptionPrefixMatch | null {
  const trimmed = (line || '').trim();
  if (!trimmed) return null;

  const m = trimmed.match(/^([\(\[]?)([A-Ea-e])([\.\)\:\]])\s*([\s\S]*)/);
  if (!m) return null;

  const openBracket = m[1];
  const rawLetter = m[2];
  const delimiter = m[3];
  const content = (m[4] || '').trim();

  // Reject unclosed opening bracket mismatch e.g. "(A." without matching or weird punctuation combos
  if (openBracket === '(' && delimiter !== ')') return null;
  if (openBracket === '[' && delimiter !== ']') return null;

  const hasSpaceAfter = /^[\(\[]?[A-Ea-e][\.\)\:\]]\s+/.test(trimmed);

  // Reject common dot-abbreviations with no space such as "a.n.", "e.g.", "d.p.r.", "s.d."
  if (delimiter === '.' && !hasSpaceAfter && /^[a-z]\./i.test(content)) {
    return null;
  }

  // Lowercase letter options ("a. ...", "b. ...") must have whitespace or paren delimiter and not match abbreviations
  if (rawLetter === rawLetter.toLowerCase()) {
    if (!hasSpaceAfter && !openBracket && delimiter !== ')') return null;
    if (ABBREVIATION_AFTER_LETTER_RE.test(content)) return null;
  }

  // Reject isolated trailing initial without content unless paired with an image/placeholder later
  const letter = rawLetter.toUpperCase() as 'A' | 'B' | 'C' | 'D' | 'E';

  return {
    letter,
    delimiter,
    content,
  };
}

/**
 * Checks whether accepting option letter `nextLetter` makes sense given already collected options.
 * Prevents random wrapped lines like `"C. Ronaldo mencetak gol"` or `"D. I. Yogyakarta"` from falsely
 * starting options when A/B were never seen yet!
 */
export function isValidOptionProgression(
  existingLetters: string[],
  nextLetter: 'A' | 'B' | 'C' | 'D' | 'E'
): boolean {
  if (nextLetter === 'A') return true;
  if (existingLetters.length === 0) {
    // Options should almost never start out of thin air at C, D, or E without A/B!
    return false;
  }
  const hasA = existingLetters.includes('A');
  const hasB = existingLetters.includes('B');
  const hasC = existingLetters.includes('C');
  const hasD = existingLetters.includes('D');

  if (nextLetter === 'B') return hasA;
  if (nextLetter === 'C') return hasB || hasA;
  if (nextLetter === 'D') return hasC || hasB;
  if (nextLetter === 'E') return hasD || hasC;
  return false;
}

/**
 * Safely splits single-line horizontal choices ("A. Satu   B. Dua   C. Tiga   D. Empat")
 * or question + inline choices ("1. Ibu kota RI adalah... A. Bandung B. Jakarta C. Medan D. Bali")
 * without splitting ordinary sentences containing initials like "Dr. A. Rahman dan Prof. B. Santoso".
 */
export function splitInlineChoiceLine(line: string): string[] {
  const trimmed = (line || '').trim();
  if (!trimmed || trimmed.includes('[[IMAGE_DATA:') || trimmed.startsWith('|')) {
    return trimmed ? [trimmed] : [];
  }

  // Find candidate choice anchors along the line
  const anchorRe = /(?:^|(?<=\s))([\(\[]?)([A-Ea-e])([\.\)\]])(?=\s+\S)/g;
  const candidates: Array<{
    index: number;
    letter: 'A' | 'B' | 'C' | 'D' | 'E';
    isUpper: boolean;
    hasSpaceGapBefore: boolean;
  }> = [];

  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(trimmed)) !== null) {
    const openBr = m[1];
    const delim = m[3];
    if (openBr === '(' && delim !== ')') continue;
    if (openBr === '[' && delim !== ']') continue;
    const afterText = trimmed.slice(m.index + m[0].length).trimStart();
    if (delim === '.' && ABBREVIATION_AFTER_LETTER_RE.test(afterText)) continue;

    const beforeChars = m.index > 0 ? trimmed.slice(Math.max(0, m.index - 2), m.index) : '';
    const hasSpaceGapBefore = m.index === 0 || /\s{2}$|\t$/.test(beforeChars);
    candidates.push({
      index: m.index,
      letter: m[2].toUpperCase() as 'A' | 'B' | 'C' | 'D' | 'E',
      isUpper: m[2] === m[2].toUpperCase(),
      hasSpaceGapBefore,
    });
  }

  if (candidates.length < 2) {
    return [trimmed];
  }

  // Look for a valid sequential run starting at 'A' (A -> B, optionally C, D, E) OR 'C' -> 'D' at line start
  const runStartsWithA = candidates.findIndex((c) => c.letter === 'A');
  const runStartsWithC = candidates.findIndex((c) => c.letter === 'C' && c.index === 0);

  let selectedSplits: number[] = [];
  if (runStartsWithA !== -1) {
    const order = ['A', 'B', 'C', 'D', 'E'];
    let expectedIdx = 0;
    const seqIndices: number[] = [];
    for (let i = runStartsWithA; i < candidates.length && expectedIdx < order.length; i++) {
      if (candidates[i].letter === order[expectedIdx]) {
        // Avoid splitting initials in prose like "Dr. A. Rahman dan Prof. B. Santoso"
        if (
          expectedIdx === 0 &&
          candidates[i].index > 0 &&
          /(?:Dr|Prof|Ir|Hj|H|Ny|Tn|S|M|Bpk|Ibu|PT|CV)\.\s*$/i.test(trimmed.slice(0, candidates[i].index))
        ) {
          continue;
        }
        seqIndices.push(candidates[i].index);
        expectedIdx++;
      }
    }
    // Require at least A and B (and if A is mid-sentence, prefer either >=3 options A,B,C or explicit tab/2-space gap or stem ending in ?/...)
    if (seqIndices.length >= 2) {
      const stemBeforeA = trimmed.slice(0, seqIndices[0]).trim();
      const strongInlineCue =
        seqIndices[0] === 0 ||
        seqIndices.length >= 3 ||
        /[?\.\:…]$|\.\.\.$/.test(stemBeforeA) ||
        candidates.some((c) => seqIndices.includes(c.index) && c.hasSpaceGapBefore);
      if (strongInlineCue) {
        selectedSplits = seqIndices;
      }
    }
  } else if (runStartsWithC !== -1) {
    const dCandidate = candidates.find((c, idx) => idx > runStartsWithC && c.letter === 'D');
    if (dCandidate) {
      selectedSplits = [candidates[runStartsWithC].index, dCandidate.index];
      const eCandidate = candidates.find((c) => c.index > dCandidate.index && c.letter === 'E');
      if (eCandidate) selectedSplits.push(eCandidate.index);
    }
  }

  if (selectedSplits.length < 2) {
    return [trimmed];
  }

  const out: string[] = [];
  if (selectedSplits[0] > 0) {
    const lead = trimmed.slice(0, selectedSplits[0]).trim();
    if (lead) out.push(lead);
  }
  for (let i = 0; i < selectedSplits.length; i++) {
    const start = selectedSplits[i];
    const end = i + 1 < selectedSplits.length ? selectedSplits[i + 1] : trimmed.length;
    const part = trimmed.slice(start, end).trim();
    if (part) out.push(part);
  }

  return out.length > 0 ? out : [trimmed];
}

/**
 * Separates accidental inline choices (`A. ... B. ... C. ... D. ...`) that leaked into a question stem.
 */
export function extractEmbeddedChoicesFromStem(stemText: string): {
  cleanStem: string;
  extractedChoices?: Record<string, string>;
} {
  const cleanInput = (stemText || '').trim();
  if (!cleanInput) return { cleanStem: '' };

  const lines = cleanInput.split(/\r?\n/).flatMap((l) => splitInlineChoiceLine(l));
  const stemLines: string[] = [];
  const extracted: Record<string, string> = {};
  let activeKey: string | null = null;

  for (const line of lines) {
    const opt = parseOptionPrefix(line);
    if (opt && isValidOptionProgression(Object.keys(extracted), opt.letter)) {
      activeKey = opt.letter;
      extracted[opt.letter] = opt.content;
    } else if (activeKey) {
      extracted[activeKey] = `${extracted[activeKey]} ${line}`.trim();
    } else {
      stemLines.push(line);
    }
  }

  if (Object.keys(extracted).length >= 2) {
    return {
      cleanStem: stemLines.join('\n').trim(),
      extractedChoices: extracted,
    };
  }

  return { cleanStem: cleanInput };
}

/**
 * Removes accidental redundant prefix like `"A. Jakarta"` -> `"Jakarta"` or `"1. Siapa..."` -> `"Siapa..."`.
 */
export function stripRedundantOptionLabel(letter: string, value: string): string {
  const clean = (value || '').trim();
  if (!clean) return '';
  const re = new RegExp(`^[\\(\\[]?${letter}\\s*[\\.\\)\\:\\]]\\s+`, 'i');
  return clean.replace(re, '').trim();
}

export function stripRedundantQuestionNumber(nomor: number, text: string): string {
  const clean = (text || '').trim();
  if (!clean) return '';
  const match = parseQuestionNumberPrefix(clean);
  if (!match) return clean;
  // Strip only if it matches the known question number OR uses explicit "Soal/No." label,
  // and does NOT look like an internal sub-statement list ("1) ... \n 2) ...")
  const hasInternalSubList = /\n\s*2[\.\)]\s+/.test(clean);
  if (!hasInternalSubList && (match.nomor === nomor || match.hasExplicitLabel)) {
    return match.content;
  }
  return clean;
}

/**
 * Validates file integrity & binary headers before expensive parsing begins.
 */
export function validateUploadedFileHeader(
  fileName: string,
  arrayBuffer: ArrayBuffer,
  allowedExtensions: string[]
): FilePrecheckResult {
  const warnings: string[] = [];
  const lower = (fileName || '').toLowerCase();
  const extMatch = lower.match(/\.([a-z0-9]+)$/);
  const ext = extMatch ? extMatch[1] : '';

  if (!ext || !allowedExtensions.includes(ext)) {
    return {
      valid: false,
      errorCode: 'UNSUPPORTED_EXTENSION',
      errorMessage: `Format berkas ".${ext || 'tidak diketahui'}" belum didukung. Gunakan salah satu format standar: ${allowedExtensions.map((e) => `.${e.toUpperCase()}`).join(', ')}.`,
      warnings,
    };
  }

  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    return {
      valid: false,
      errorCode: 'EMPTY_FILE',
      errorMessage: `Berkas "${fileName}" kosong (0 byte). Pastikan dokumen soal sudah tersimpan dengan benar sebelum diunggah.`,
      warnings,
    };
  }

  if (arrayBuffer.byteLength > 50 * 1024 * 1024) {
    return {
      valid: false,
      errorCode: 'FILE_TOO_LARGE',
      errorMessage: `Ukuran berkas "${fileName}" melebihi batas maksimal 50 MB. Silakan kompres atau pecah dokumen menjadi beberapa bagian.`,
      warnings,
    };
  }

  const headBytes = new Uint8Array(arrayBuffer.slice(0, Math.min(1024, arrayBuffer.byteLength)));
  const headAscii = Array.from(headBytes)
    .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : ' '))
    .join('');

  if (ext === 'pdf') {
    if (!headAscii.includes('%PDF-')) {
      return {
        valid: false,
        errorCode: 'CORRUPTED_HEADER',
        errorMessage: `Berkas "${fileName}" tidak memiliki header PDF yang valid (%PDF). Kemungkinan file rusak atau berasal dari format lain yang diubah ekstensinya menjadi .pdf.`,
        warnings,
      };
    }
  } else if (ext === 'docx' || ext === 'xlsx' || ext === 'xls') {
    const isZip = headBytes.length >= 2 && headBytes[0] === 0x50 && headBytes[1] === 0x4b;
    const isOle2 =
      headBytes.length >= 4 &&
      headBytes[0] === 0xd0 &&
      headBytes[1] === 0xcf &&
      headBytes[2] === 0x11 &&
      headBytes[3] === 0xe0;

    if (!isZip && !isOle2) {
      return {
        valid: false,
        errorCode: 'CORRUPTED_HEADER',
        errorMessage: `Berkas "${fileName}" bukan dokumen Office (.${ext}) yang valid atau strukturnya rusak. Buka di Microsoft Word/Excel lalu Save As ulang ke .${ext}.`,
        warnings,
      };
    }
    if (isOle2 && ext === 'docx') {
      warnings.push(
        `Berkas "${fileName}" memakai ekstensi .docx tetapi isi internalnya masih format biner lama (.doc 97-2003).`
      );
    }
  } else if (ext === 'txt' || ext === 'csv') {
    const nullByteCount = headBytes.filter((b) => b === 0).length;
    if (nullByteCount > 4) {
      return {
        valid: false,
        errorCode: 'BINARY_TEXT_CORRUPT',
        errorMessage: `Berkas "${fileName}" berisi data biner yang tidak dapat dibaca sebagai teks. Simpan ulang naskah sebagai .txt (UTF-8), .docx, atau .pdf.`,
        warnings,
      };
    }
  }

  return { valid: true, warnings };
}

/**
 * Evaluates raw text + parsed SoalUjian[] for standard exam pattern compliance,
 * ensuring consistent separation of question stem, choices A-D, and question numbers.
 */
export function validateParsedQuestionsStructure(
  soalList: SoalUjian[],
  rawText?: string
): StructureValidationResult {
  const warnings: string[] = [];
  const questionIssues = new Map<number, string[]>();

  const addIssue = (nomor: number, msg: string) => {
    if (!questionIssues.has(nomor)) questionIssues.set(nomor, []);
    questionIssues.get(nomor)!.push(msg);
  };

  if (!Array.isArray(soalList) || soalList.length === 0) {
    const cleanLen = (rawText || '').replace(/\s+/g, ' ').trim().length;
    const hasNumbers = /(?:^|\n)\s*\d{1,3}\s*[\.\)]\s+/.test(rawText || '');
    const hasChoices = /(?:^|\n|\s)[A-D][\.\)]\s+\S/.test(rawText || '');

    let detailHint = '';
    if (cleanLen < 20) {
      detailHint = 'Teks dokumen terlalu sedikit atau kosong.';
    } else if (!hasNumbers && !hasChoices) {
      detailHint =
        'Dokumen terbaca sebagai teks biasa namun tidak mengikuti pola standar soal ujian (tidak ditemukan nomor soal "1., 2." maupun opsi "A., B., C., D.").';
    } else if (hasNumbers && !hasChoices) {
      detailHint =
        'Ditemukan angka berurutan, namun tidak terdeteksi pola pertanyaan atau pilihan jawaban yang konsisten.';
    } else {
      detailHint = 'Struktur nomor soal dan pilihan jawaban A–D tercampur atau tidak memenuhi pola standar.';
    }

    return {
      isValidFormat: false,
      errorCode: cleanLen > 30 ? 'NON_STANDARD_PATTERN' : 'NO_QUESTIONS_FOUND',
      fatalError: `${detailHint} Contoh pola standar yang disarankan:\n1. Teks pertanyaan soal di sini...\nA. Pilihan A   B. Pilihan B   C. Pilihan C   D. Pilihan D`,
      warnings: [detailHint],
      questionIssues,
      stats: {
        totalQuestions: 0,
        pgCount: 0,
        uraianCount: 0,
        incompleteOptionsCount: 0,
        missingNumbers: [],
        duplicateNumbers: [],
      },
    };
  }

  let pgCount = 0;
  let uraianCount = 0;
  let incompleteOptionsCount = 0;
  let emptyStemCount = 0;
  const seenNums = new Set<number>();
  const duplicateNumbers: number[] = [];

  for (const q of soalList) {
    const num = Number(q.nomor) || 0;
    if (num > 0) {
      if (seenNums.has(num)) duplicateNumbers.push(num);
      seenNums.add(num);
    }

    const stem = (q.pertanyaan || '').trim();
    if (!stem || /^Soal nomor \d+$/i.test(stem)) {
      emptyStemCount++;
      addIssue(num, `Soal No. ${num}: Teks pertanyaan kosong atau hanya berupa nomor placeholder.`);
    }

    // Check whether unseparated inline options remain inside stem text
    if (/\bA[\.\)]\s+\S+.*\bB[\.\)]\s+\S+/s.test(stem) && !q.pilihan?.A) {
      addIssue(num, `Soal No. ${num}: Label pilihan jawaban (A/B/C/D) terdeteksi masih menyatu dengan teks pertanyaan.`);
    }

    if (q.tipe === 'pilihan_ganda') {
      pgCount++;
      const filledKeys = ['A', 'B', 'C', 'D', 'E'].filter((k) => Boolean(q.pilihan?.[k]?.trim()));
      if (filledKeys.length < 3 && (!q.pilihanGambar || Object.keys(q.pilihanGambar).length < 3)) {
        incompleteOptionsCount++;
        addIssue(
          num,
          `Soal No. ${num}: Pilihan jawaban tidak lengkap (hanya terbaca ${filledKeys.join(', ') || 'kosong'}).`
        );
      } else {
        // Check skipped sequence like A, B, D (missing C)
        const order = ['A', 'B', 'C', 'D', 'E'];
        const maxIdx = Math.max(...filledKeys.map((k) => order.indexOf(k)));
        const missingLetters = order
          .slice(0, maxIdx + 1)
          .filter((letter) => !filledKeys.includes(letter) && !q.pilihanGambar?.[letter]);
        if (missingLetters.length > 0) {
          incompleteOptionsCount++;
          addIssue(
            num,
            `Soal No. ${num}: Urutan pilihan melompat — label opsi ${missingLetters.join(', ')} tidak ditemukan.`
          );
        }
      }
    } else {
      uraianCount++;
    }
  }

  const validNums = Array.from(seenNums).sort((a, b) => a - b);
  const missingNumbers: number[] = [];
  if (validNums.length > 1) {
    const minN = validNums[0] <= 3 ? 1 : validNums[0];
    const maxN = validNums[validNums.length - 1];
    for (let n = minN; n <= maxN; n++) {
      if (!seenNums.has(n)) missingNumbers.push(n);
    }
  }

  if (emptyStemCount > Math.max(1, Math.floor(soalList.length * 0.6))) {
    return {
      isValidFormat: false,
      errorCode: 'HIGH_EMPTY_STEM_RATIO',
      fatalError: `Sebagian besar butir soal (${emptyStemCount} dari ${soalList.length}) tidak memiliki teks pertanyaan yang terbaca. Format dokumen tidak sesuai pola standar naskah soal.`,
      warnings,
      questionIssues,
      stats: {
        totalQuestions: soalList.length,
        pgCount,
        uraianCount,
        incompleteOptionsCount,
        missingNumbers,
        duplicateNumbers,
      },
    };
  }

  if (incompleteOptionsCount > 0) {
    warnings.push(
      `${incompleteOptionsCount} soal pilihan ganda memiliki opsi jawaban yang tidak lengkap atau melompat. Harap periksa ulang sebelum menerbitkan.`
    );
  }
  if (duplicateNumbers.length > 0) {
    warnings.push(`Ditemukan nomor soal duplikat pada file: ${Array.from(new Set(duplicateNumbers)).join(', ')}.`);
  }
  if (missingNumbers.length > 0 && missingNumbers.length <= 10) {
    warnings.push(`Urutan nomor soal ada yang terlewat: No. ${missingNumbers.join(', ')}.`);
  }

  return {
    isValidFormat: true,
    warnings,
    questionIssues,
    stats: {
      totalQuestions: soalList.length,
      pgCount,
      uraianCount,
      incompleteOptionsCount,
      missingNumbers,
      duplicateNumbers: Array.from(new Set(duplicateNumbers)),
    },
  };
}
