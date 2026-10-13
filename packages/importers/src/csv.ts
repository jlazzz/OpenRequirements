/**
 * Parses CSV text into rows of cells (RFC 4180: quoted cells, doubled quotes, line breaks inside quotes).
 * The separator is a comma, semicolon or tab, whichever the first line uses most. Blank lines are dropped.
 */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, "");
  const firstLine = input.slice(0, input.search(/\r?\n|$/));
  const separator = [",", ";", "\t"].map((s) => ({ s, n: firstLine.split(s).length })).sort((a, b) => b.n - a.n)[0]
    ?.s as string;

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const endRow = () => {
    row.push(cell);
    if (row.some((c) => c !== "")) rows.push(row);
    row = [];
    cell = "";
  };
  for (let i = 0; i < input.length; i++) {
    const char = input[i] as string;
    if (quoted) {
      if (char !== '"') cell += char;
      else if (input[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === separator) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") endRow();
    else if (char !== "\r") cell += char;
  }
  endRow();
  return rows;
}

/** Writes rows as CSV that Excel opens directly: comma-separated, CRLF line ends, UTF-8 byte order mark. */
export function toCsv(rows: (string | number)[][]): string {
  const cell = (value: string | number) => {
    let text = String(value);
    // A spreadsheet runs a cell starting with = + - or @ as a formula. The leading quote makes it plain text.
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return `\uFEFF${rows.map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;
}
