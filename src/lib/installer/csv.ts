export function detectDelimiter(headerLine: string): "," | ";" | "\t" {
  const candidates = [",", ";", "\t"] as const;
  return candidates
    .map((delimiter) => ({
      delimiter,
      count: headerLine.split(delimiter).length,
    }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

export function parseCsv(
  text: string,
  delimiter?: "," | ";" | "\t",
): string[][] {
  return [...parseCsvRows(text, delimiter)];
}

export function* parseCsvRows(
  text: string,
  delimiter?: "," | ";" | "\t",
): Generator<string[]> {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const separator =
    delimiter ?? detectDelimiter(clean.split(/\r?\n/, 1)[0] ?? "");
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < clean.length; index += 1) {
    const character = clean[index];
    if (quoted) {
      if (character === '"' && clean[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') quoted = true;
    else if (character === separator) {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      if (row.some((value) => value.trim() !== "")) yield row;
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ""));
    if (row.some((value) => value.trim() !== "")) yield row;
  }
}

export function rowsToObjects(rows: string[][]): Array<Record<string, string>> {
  if (rows.length === 0) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows
    .slice(1)
    .map((row) =>
      Object.fromEntries(
        headers.map((header, index) => [header, row[index]?.trim() ?? ""]),
      ),
    );
}
