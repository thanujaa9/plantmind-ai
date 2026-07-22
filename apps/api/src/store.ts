import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type StoredChunk = {
  id: string;
  documentId: string;
  document: string;
  type: string;
  page: number;
  text: string;
  assetId: string;
  keywords: string[];
  sourceUrl: string;
};

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = process.env.DATA_DIR || path.resolve(moduleDirectory, "../../data");
const uploadDirectory = path.join(dataDirectory, "uploads");
mkdirSync(uploadDirectory, { recursive: true });

const database = new DatabaseSync(path.join(dataDirectory, "plantmind.db"));
database.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    status TEXT NOT NULL,
    page_count INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    content TEXT NOT NULL,
    asset_id TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(document_id) REFERENCES documents(id)
  );
  CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    question_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    generation_mode TEXT NOT NULL,
    evidence_strength TEXT NOT NULL,
    citations_json TEXT NOT NULL,
    response_ms INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
`);

const cleanName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);

export function saveDocument(input: { name: string; mimeType: string; bytes: Buffer; pages: string[] }) {
  const pending = createPendingDocument(input);
  return indexDocument(pending.id, input.pages);
}

export function createPendingDocument(input: { name: string; mimeType: string; bytes: Buffer }) {
  const id = randomUUID();
  const filePath = path.join(uploadDirectory, `${id}-${cleanName(input.name)}`);
  writeFileSync(filePath, input.bytes);
  const createdAt = new Date().toISOString();
  database.prepare("INSERT INTO documents (id,name,mime_type,file_path,status,page_count,created_at) VALUES (?,?,?,?,?,?,?)")
    .run(id, input.name, input.mimeType, filePath, "queued", 0, createdAt);
  return { id, name: input.name, mimeType: input.mimeType, status: "queued", pageCount: 0, chunkCount: 0, createdAt };
}

export function indexDocument(id: string, pages: string[]) {
  const document = getDocument(id);
  if (!document) throw new Error("Queued document no longer exists.");
  database.prepare("DELETE FROM chunks WHERE document_id = ?").run(id);
  const insert = database.prepare("INSERT INTO chunks (id,document_id,page_number,content,asset_id) VALUES (?,?,?,?,?)");
  let chunkCount = 0;
  pages.forEach((pageText, pageIndex) => {
    chunkText(pageText).forEach((content) => {
      const assetId = content.match(/\b[A-Z]{1,4}-\d{3,5}\b/)?.[0] || "";
      insert.run(randomUUID(), id, pageIndex + 1, content, assetId);
      chunkCount += 1;
    });
  });
  database.prepare("UPDATE documents SET status = 'indexed', page_count = ? WHERE id = ?").run(pages.length, id);
  return { ...document, status: "indexed", pageCount: pages.length, chunkCount };
}

function chunkText(text: string, size = 850, overlap = 120) {
  const normalized = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  for (let start = 0; start < normalized.length; start += size - overlap) {
    chunks.push(normalized.slice(start, start + size).trim());
    if (start + size >= normalized.length) break;
  }
  return chunks;
}

export function listDocuments() {
  return database.prepare(`SELECT d.id,d.name,d.mime_type AS mimeType,d.status,d.page_count AS pageCount,d.created_at AS createdAt,
    (SELECT COUNT(*) FROM chunks c WHERE c.document_id=d.id) AS chunkCount FROM documents d ORDER BY d.created_at DESC`).all();
}

export function getDocument(id: string) {
  return database.prepare(`SELECT d.id,d.name,d.mime_type AS mimeType,d.status,d.page_count AS pageCount,d.created_at AS createdAt,
    (SELECT COUNT(*) FROM chunks c WHERE c.document_id=d.id) AS chunkCount FROM documents d WHERE d.id=?`).get(id) as any;
}

export function setDocumentStatus(id: string, status: "queued" | "processing" | "indexed" | "failed") {
  database.prepare("UPDATE documents SET status=? WHERE id=?").run(status, id);
}

export function deleteDocument(id: string) {
  const file = getDocumentFile(id);
  database.prepare("DELETE FROM chunks WHERE document_id=?").run(id);
  database.prepare("DELETE FROM documents WHERE id=?").run(id);
  if (file) try { unlinkSync(file.filePath); } catch { /* already absent */ }
}

export function getDocumentFile(id: string) {
  return database.prepare("SELECT name,mime_type AS mimeType,file_path AS filePath FROM documents WHERE id = ?").get(id) as { name: string; mimeType: string; filePath: string } | undefined;
}

export function getStoredChunks(): StoredChunk[] {
  return database.prepare(`SELECT c.id,c.document_id AS documentId,d.name AS document,
    CASE WHEN d.mime_type LIKE '%csv%' THEN 'Maintenance / CSV' WHEN d.mime_type LIKE '%pdf%' THEN 'PDF document' ELSE 'Plant record' END AS type,
    c.page_number AS page,c.content AS text,c.asset_id AS assetId
    FROM chunks c JOIN documents d ON d.id=c.document_id`).all().map((row: any) => ({
      ...row,
      keywords: [],
      sourceUrl: `/api/documents/${row.documentId}/file`
    }));
}

export function documentStats() {
  const docs = database.prepare("SELECT COUNT(*) count, COALESCE(SUM(page_count),0) pages FROM documents").get() as { count: number; pages: number };
  const chunks = database.prepare("SELECT COUNT(*) count FROM chunks").get() as { count: number };
  return { documents: docs.count, pages: docs.pages, chunks: chunks.count };
}

export function recordAuditEvent(input: { questionHash: string; status: string; generationMode: string; evidenceStrength: string; citations: Array<{ document: string; page: number }>; responseMs: number }) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  database.prepare("INSERT INTO audit_events (id,question_hash,status,generation_mode,evidence_strength,citations_json,response_ms,created_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(id, input.questionHash, input.status, input.generationMode, input.evidenceStrength, JSON.stringify(input.citations), input.responseMs, createdAt);
  return { id, createdAt };
}

export function listAuditEvents(limit = 25) {
  return database.prepare("SELECT id,question_hash AS questionHash,status,generation_mode AS generationMode,evidence_strength AS evidenceStrength,citations_json AS citationsJson,response_ms AS responseMs,created_at AS createdAt FROM audit_events ORDER BY created_at DESC LIMIT ?")
    .all(Math.min(Math.max(limit, 1), 100)).map((row: any) => ({ ...row, citations: JSON.parse(row.citationsJson), citationsJson: undefined }));
}
