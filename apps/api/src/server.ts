import cors from "cors";
import express from "express";
import { z } from "zod";
import { answerQuestion } from "./engine.js";
import { createPendingDocument, deleteDocument, documentStats, getDocument, getDocumentFile, getStoredChunks, listAuditEvents, listDocuments, recordAuditEvent } from "./store.js";
import { createReadStream } from "node:fs";
import { cacheBackend, cacheGet, cacheSet } from "./cache.js";
import { enqueueDocument, startDocumentWorker } from "./queue.js";
import { evaluateCorpus } from "./evaluation.js";
import { generateGroundedAnswer } from "./llm.js";
import { createHash } from "node:crypto";

export const app = express();
app.use(cors());
app.use(express.json({ limit: "18mb" }));

app.get("/health", (_req, res) => res.json({ status: "ok", cache: cacheBackend(), retrieval: "hybrid-vector" }));
app.get("/api/dashboard", (_req, res) => {
  const stored = documentStats();
  const assets = deriveAssets();
  res.json({ documents: stored.documents, pages: stored.pages, assets: assets.length, alerts: assets.filter((item) => item.risk === "High").length, evidenceRecords: stored.chunks });
});
app.get("/api/evaluation", (_req, res) => {
  const stored = getStoredChunks();
  return res.json(evaluateCorpus(selectCorpus(stored)));
});
app.get("/api/audit", (req, res) => res.json(listAuditEvents(Number(req.query.limit || 25))));
app.get("/api/documents", (_req, res) => res.json(listDocuments()));
app.get("/api/documents/:id", (req, res) => {
  const document = getDocument(req.params.id);
  return document ? res.json(document) : res.status(404).json({ error: "Document not found" });
});
app.delete("/api/documents/:id", (req, res) => {
  const document = getDocument(req.params.id);
  if (!document) return res.status(404).json({ error: "Document not found" });
  deleteDocument(req.params.id);
  return res.json({ deleted: true, id: req.params.id });
});
app.get("/api/documents/:id/file", (req, res) => {
  const file = getDocumentFile(req.params.id);
  if (!file) return res.status(404).json({ error: "Document not found" });
  res.type(file.mimeType).setHeader("Content-Disposition", `inline; filename="${file.name.replace(/\"/g, "")}"`);
  return createReadStream(file.filePath).pipe(res);
});
app.post("/api/documents", (req, res) => {
  const parsed = z.object({ name: z.string().min(1).max(160), mimeType: z.string().max(100), data: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid upload." });
  try {
    const bytes = Buffer.from(parsed.data.data, "base64");
    if (bytes.length > 12 * 1024 * 1024) return res.status(413).json({ error: "Files must be smaller than 12 MB." });
    const document = createPendingDocument({ ...parsed.data, bytes });
    void enqueueDocument(document.id).catch((queueError) => {
      console.error(`Failed to enqueue document ${document.id}:`, queueError);
    });
    return res.status(202).json(document);
  } catch (error) {
    return res.status(422).json({ error: error instanceof Error ? error.message : "Document processing failed." });
  }
});
app.get("/api/assets", (_req, res) => res.json(deriveAssets()));
app.get("/api/assets/:id", (req, res) => {
  const discovered = deriveAssets().find((item) => item.id === req.params.id.toUpperCase());
  return discovered ? res.json(discovered) : res.status(404).json({ error: "Asset not found" });
});
app.post("/api/ask", async (req, res) => {
  const parsed = z.object({ question: z.string().min(3).max(500) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a question between 3 and 500 characters." });
  const stored = getStoredChunks();
  const corpus = selectCorpus(stored);
  const corpusVersion = createHash("sha256")
    .update(stored.map((item) => `${item.id}:${item.documentId}:${item.text}`).sort().join("|"))
    .digest("hex")
    .slice(0, 16);
  const generationVersion = process.env.LLM_MODEL || "deterministic-v3";
  const cacheKey = `plantmind:answer:${generationVersion}:${corpusVersion}:${parsed.data.question.trim().toLowerCase()}`;
  const cached = await cacheGet<Awaited<ReturnType<typeof generateGroundedAnswer>>>(cacheKey);
  if (cached) {
    const audit = auditAnswer(parsed.data.question, cached);
    return res.json({ ...cached, cached: true, auditId: audit.id });
  }
  const answer = await generateGroundedAnswer(parsed.data.question, answerQuestion(parsed.data.question, corpus));
  await cacheSet(cacheKey, answer);
  const audit = auditAnswer(parsed.data.question, answer);
  return res.json({ ...answer, cached: false, auditId: audit.id });
});

function selectCorpus(stored: ReturnType<typeof getStoredChunks>) {
  // Answers are grounded only in records uploaded by the user.
  return stored;
}

function deriveAssets() {
  const chunks = getStoredChunks();
  const ids = [...new Set(chunks.map((item) => item.assetId).filter((id) => /^[A-Z]{1,4}-\d{3,5}$/.test(id)))].sort();
  const referenceIds = ids.filter((id) => chunks.some((item) => item.assetId === id && /incident/i.test(item.document)));
  return ids.map((id) => {
    const related = chunks.filter((item) => item.assetId === id);
    const documents = [...new Map(related.map((item) => [item.documentId, { id: item.documentId, name: item.document, sourceUrl: item.sourceUrl }])).values()];
    const manualText = related.filter((item) => /manual/i.test(item.document)).map((item) => item.text).join(" ");
    const inspectionText = related.filter((item) => /inspection/i.test(item.document)).map((item) => item.text).join(" ");
    const maintenanceText = related.filter((item) => /maintenance|work.orders/i.test(item.document)).map((item) => item.text).join(" ");
    const incidentText = related.filter((item) => /incident/i.test(item.document)).map((item) => item.text).join(" ");
    const active = Boolean(manualText || inspectionText || maintenanceText);
    const nameMatch = manualText.match(/Equipment Name:\s*(.*?)(?:Manufacturer:|Model:|Installation Date:|Document Reference:)/i);
    const classMatch = incidentText.match(/Related Equipment Class:\s*(.*?)(?:Document Reference:|Incident Date:)/i);
    const equipmentType = cleanEquipmentType(nameMatch?.[1] || classMatch?.[1] || (/(?:horizontal\s+)?centrifugal pump/i.exec(`${manualText} ${incidentText}`)?.[0]) || "Industrial asset", id);
    const vibrationReadings = numbers(inspectionText, /(\d+(?:\.\d+)?)\s*mm\/s/gi);
    const temperatureReadings = numbers(inspectionText, /(\d+(?:\.\d+)?)\s*(?:degrees?\s*)?(?:°\s*)?C\b/gi);
    const vibrationRange = range(manualText, /Alert threshold:\s*(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*mm\/s/i);
    const temperatureRange = range(manualText, /Alert threshold:\s*(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:degrees?\s*)?(?:°\s*)?C/i);
    const vibrationAlarm = number(manualText, /Alarm threshold:\s*above\s*(\d+(?:\.\d+)?)\s*mm\/s/i);
    const temperatureAlarm = number(manualText, /Alarm threshold:\s*above\s*(\d+(?:\.\d+)?)\s*(?:degrees?\s*)?(?:°\s*)?C/i);
    const postponed = Math.min(2, (maintenanceText.match(/Status:\s*POSTPONED/gi) || maintenanceText.match(/\bpostponed\b/gi) || []).length);
    const lateDays = number(maintenanceText, /(\d+)\s*days?\s*(?:later|late|overdue)/i);
    const incomplete = /not yet completed|has not yet been carried out/i.test(maintenanceText);
    const risk = active && vibrationReadings.length && vibrationAlarm !== undefined && Math.max(...vibrationReadings) > vibrationAlarm ? "High" : active ? "Low" : "Reference";
    return {
      id,
      equipmentType,
      role: active ? "active" : "reference",
      risk,
      documents,
      readings: { vibration: vibrationReadings.length ? Math.max(...vibrationReadings) : null, temperature: temperatureReadings.length ? Math.max(...temperatureReadings) : null },
      limits: { vibrationAlert: vibrationRange, vibrationAlarm: vibrationAlarm ?? null, temperatureAlert: temperatureRange, temperatureAlarm: temperatureAlarm ?? null },
      maintenance: { postponed, lateDays: lateDays ?? null, incomplete },
      relatedIncidentId: active ? referenceIds.find((referenceId) => referenceId !== id) || null : null
    };
  });
}

function cleanEquipmentType(value: string, id: string) {
  const cleaned = value.replace(new RegExp(id, "gi"), "").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Industrial Asset";
}

function numbers(text: string, pattern: RegExp) {
  return [...text.matchAll(pattern)].map((match) => Number(match[1])).filter(Number.isFinite);
}

function number(text: string, pattern: RegExp) {
  const value = Number(text.match(pattern)?.[1]);
  return Number.isFinite(value) ? value : undefined;
}

function range(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

function auditAnswer(question: string, answer: Awaited<ReturnType<typeof generateGroundedAnswer>>) {
  return recordAuditEvent({
    questionHash: createHash("sha256").update(question.trim().toLowerCase()).digest("hex"),
    status: answer.status,
    generationMode: answer.generation.mode,
    evidenceStrength: answer.evidenceStrength,
    citations: answer.citations.map((citation) => ({ document: citation.document, page: citation.page })),
    responseMs: answer.responseMs
  });
}

const port = Number(process.env.PORT || 4000);
if (process.env.NODE_ENV !== "test") {
  startDocumentWorker();
  const server = app.listen(port, () => console.log(`PlantMind API listening on ${port}`));
  server.ref();
}
