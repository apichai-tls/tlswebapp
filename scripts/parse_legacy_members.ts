import fs from 'fs';
import path from 'path';

interface RawRecord {
  id?: string;
  memNo?: string;
  startDate?: string;
  expireDate?: string;
  amountRaw?: string;
  amount?: number | null;
  branch?: string;
  sales?: string;
  package?: string;
  title?: string;
  name?: string;
  condo?: string;
  room?: string;
  phone?: string;
  email?: string;
  remarks?: string;
}

export interface LegacyMemberRecord {
  id: string;
  seq: number;
  memNo: string;
  branch: string;
  startDate: string;
  expireDate: string;
  amount: number | null;
  amountRaw: string;
  sales: string;
  package: string;
  title: string;
  name: string;
  condo: string;
  room: string;
  phone: string;
  email: string;
  remarks: string;
}

// Simple robust CSV tokenizer handling quoted multiline cells
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentCell += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (char === '\r') {
        if (nextChar === '\n') i++;
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else if (char === '\n') {
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    rows.push(currentRow);
  }

  return rows;
}

function parseAmount(amtStr?: string): number | null {
  if (!amtStr) return null;
  const cleaned = amtStr.replace(/[฿,\s]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function cleanPackage(pkg?: string): string {
  if (!pkg) return '';
  return pkg
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferBranch(memNo: string, explicitBranch?: string): string {
  if (explicitBranch && explicitBranch.trim()) {
    const b = explicitBranch.trim().toUpperCase();
    if (b.includes('15 SUKHUMVIT') || b.includes('15 SR')) return '15 Sukhumvit';
    if (b.includes('CIRCLE')) return 'Circle Condo';
    if (b.includes('RHYTHM')) return 'Rhythm Asoke';
    if (b.includes('PTY') || b.includes('PATTAYA')) return 'Pattaya';
    return explicitBranch.trim();
  }

  const upper = (memNo || '').toUpperCase();
  if (upper.startsWith('SR')) return '15 Sukhumvit';
  if (upper.startsWith('CC')) return 'Circle Condo';
  if (upper.startsWith('RA')) return 'Rhythm Asoke';
  if (upper.startsWith('OF')) return 'Office / Delivery';
  if (upper.startsWith('S1')) return 'Sukhumvit 1';
  if (upper.startsWith('PTY')) return 'Pattaya';

  return 'Other';
}

function normalizeMemNo(raw?: string): string {
  if (!raw) return '';
  // e.g. "S1 2001" -> "S1-2001" or "S12001", "CC 2012" -> "CC2012"
  return raw.replace(/\s+/g, '').toUpperCase().trim();
}

function run() {
  const filePath = path.join(__dirname, 'legacy_members_raw.csv');
  const rawText = fs.readFileSync(filePath, 'utf-8');

  const rows = parseCsvRows(rawText);
  console.log(`Total CSV rows tokenized: ${rows.length}`);

  let currentHeader: string[] = [];
  const records: LegacyMemberRecord[] = [];
  let seq = 1;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];

    // Skip empty lines
    if (row.every((cell) => !cell || cell.length === 0)) continue;

    // Detect header row
    const rowJoined = row.map((c) => c.toUpperCase()).join(',');
    if (
      rowJoined.includes('MEM NO') ||
      rowJoined.includes('MEMBER NO') ||
      rowJoined.includes('START DATE')
    ) {
      // Find non-empty leading index or strip leading empty cells
      currentHeader = row.map((c) => c.toUpperCase().trim());
      console.log(`Found Header at row ${r}: ${currentHeader.slice(0, 8).join(' | ')}`);
      continue;
    }

    if (currentHeader.length === 0) continue;

    // Map by header
    // Align row with header: some sections start with leading empty cell ','
    let cellOffset = 0;
    if (row[0] === '' && currentHeader[0] !== '') {
      cellOffset = 1;
    }

    // Helper to get cell by header column name
    const getVal = (colNames: string[]): string => {
      for (const colName of colNames) {
        const idx = currentHeader.findIndex((h) => h === colName);
        if (idx !== -1) {
          const val = row[idx + cellOffset] ?? row[idx];
          if (val) return val.trim();
        }
      }
      return '';
    };

    const memNoRaw = getVal(['MEM NO', 'MEMBER NO']);
    if (!memNoRaw) continue;

    const memNo = normalizeMemNo(memNoRaw);
    if (!memNo || memNo.length < 3) continue;

    const startDate = getVal(['START DATE']);
    const expireDate = getVal(['EXPIRE DATE']);
    const amtRaw = getVal(['AMT']);
    const explicitBranch = getVal(['BRANCH']);
    const sales = getVal(['SALES']);
    const pkg = cleanPackage(getVal(['PACKAGE']));
    const title = getVal(['TITLE']);
    const name = getVal(['NAME']);
    const condo = getVal(['CONDO/HSE']);
    const room = getVal(['ROOM/UNIT']);
    const phone = getVal(['MOBILE']);
    const email = getVal(['EMAIL']);
    const remarks = getVal(['REMARKS']);

    // Check if row has at least a member number and name/date
    if (!name && !startDate && !amtRaw) continue;

    const branch = inferBranch(memNo, explicitBranch);

    records.push({
      id: `LEGACY-${seq}`,
      seq,
      memNo,
      branch,
      startDate: startDate || '-',
      expireDate: expireDate || '-',
      amount: parseAmount(amtRaw),
      amountRaw: amtRaw || '-',
      sales: sales || '-',
      package: pkg || '-',
      title: title || '',
      name: name || '-',
      condo: condo || '',
      room: room || '',
      phone: phone.replace(/^['\.]/g, '').trim(),
      email: email || '',
      remarks: remarks || '',
    });

    seq++;
  }

  console.log(`Parsed ${records.length} legacy member records!`);

  // Group by branch summary
  const byBranch: Record<string, number> = {};
  for (const rec of records) {
    byBranch[rec.branch] = (byBranch[rec.branch] || 0) + 1;
  }
  console.log('Summary by Branch:', byBranch);

  const outDir = path.join(process.cwd(), 'src', 'data');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outPath = path.join(outDir, 'legacy-members.json');
  fs.writeFileSync(outPath, JSON.stringify(records, null, 2), 'utf-8');
  console.log(`Saved clean JSON to: ${outPath}`);
}

run();
