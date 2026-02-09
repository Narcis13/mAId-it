/**
 * CSV Parsing and Serialization
 *
 * Simple CSV parser/writer for file source/sink runtimes.
 * Handles quoted fields, commas within quotes, and newlines.
 */

/**
 * Parse a CSV string into an array of objects.
 * First row is treated as headers.
 */
export function parseCSV(text: string): Record<string, string>[] {
  const lines = splitCSVLines(text);
  if (lines.length === 0) return [];

  const headers = parseCSVRow(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVRow(lines[i]);
    if (values.length === 0 || (values.length === 1 && values[0] === '')) continue;

    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? '';
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Convert data to CSV string.
 * Input must be an array of objects with consistent keys.
 */
export function toCSV(data: unknown): string {
  if (!Array.isArray(data) || data.length === 0) {
    return '';
  }

  const first = data[0] as Record<string, unknown>;
  if (typeof first !== 'object' || first === null) {
    return '';
  }

  const headers = Object.keys(first);
  const lines: string[] = [headers.map(escapeCSVField).join(',')];

  for (const row of data) {
    const obj = row as Record<string, unknown>;
    const values = headers.map((h) => escapeCSVField(String(obj[h] ?? '')));
    lines.push(values.join(','));
  }

  return lines.join('\n');
}

// ============================================================================
// Internal Helpers
// ============================================================================

function splitCSVLines(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => line.trim() !== '');
}

function parseCSVRow(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }

  fields.push(current);
  return fields;
}

function escapeCSVField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
