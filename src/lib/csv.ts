/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, CRLF). `delimiter` for ";" or tab files. */
export function parseCsv(text: string, delimiter = ',', keepEmptyRows = false): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (keepEmptyRows || row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if ((keepEmptyRows && row.length) || cell !== '' || row.some((c) => c !== '')) rows.push([...row, cell]);
  return rows;
}
