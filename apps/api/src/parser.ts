import { spawnSync } from "node:child_process";

export function parseDocument(name: string, mimeType: string, bytes: Buffer): string[] {
  const lower = name.toLowerCase();
  if (lower.endsWith(".csv") || mimeType.includes("csv")) return [parseCsv(bytes.toString("utf8"))];
  if (lower.endsWith(".txt") || mimeType.startsWith("text/")) return [bytes.toString("utf8")];
  if (lower.endsWith(".pdf") || mimeType.includes("pdf")) return parsePdf(bytes);
  throw new Error("PlantMind currently accepts PDF, CSV, and TXT records.");
}

function parseCsv(value: string) {
  const rows = value.split(/\r?\n/).filter(Boolean).map(parseCsvRow);
  if (!rows.length) return "";
  const headers = rows[0];
  return rows.slice(1).map((row, index) => `Record ${index + 1}: ${headers.map((header, column) => `${header}: ${row[column] || ""}`).join("; ")}`).join("\n");
}

function parseCsvRow(row: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < row.length; index++) {
    const character = row[index];
    if (character === '"' && row[index + 1] === '"') { current += '"'; index++; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { values.push(current.trim()); current = ""; }
    else current += character;
  }
  values.push(current.trim());
  return values;
}

function parsePdf(bytes: Buffer) {
  const python = process.env.PYTHON_BIN || "/Users/thanujasekuri/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
  const script = `
import io, json, sys
from pypdf import PdfReader
r=PdfReader(io.BytesIO(sys.stdin.buffer.read()))
print(json.dumps([(p.extract_text() or '') for p in r.pages]))
`;
  const result = spawnSync(python, ["-c", script], { input: bytes, maxBuffer: 20 * 1024 * 1024 });
  if (result.status !== 0) throw new Error("PDF extraction is unavailable. Configure PYTHON_BIN with pypdf installed.");
  const pages = JSON.parse(result.stdout.toString("utf8")) as string[];
  if (!pages.some((page) => page.trim())) throw new Error("This PDF has no readable text. OCR support is required for scanned files.");
  return pages;
}
