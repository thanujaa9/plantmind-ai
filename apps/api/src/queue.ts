import { readFileSync } from "node:fs";
import { cacheSet, redisAvailable, redisCommand } from "./cache.js";
import { parseDocument } from "./parser.js";
import { getDocument, getDocumentFile, indexDocument, setDocumentStatus } from "./store.js";

const QUEUE_KEY = "plantmind:document-jobs";
const localQueue: string[] = [];
let draining = false;
let workerTimer: ReturnType<typeof setInterval> | undefined;

export async function enqueueDocument(id: string) {
  await cacheSet(`plantmind:job:${id}`, { id, status: "queued" }, 86400);
  if (redisAvailable()) await redisCommand(["LPUSH", QUEUE_KEY, id]);
  else localQueue.push(id);
  void drainOnce();
}

export function startDocumentWorker() {
  if (workerTimer) return;
  workerTimer = setInterval(() => void drainOnce(), 750);
}

async function drainOnce() {
  if (draining) return;
  draining = true;
  try {
    const id = redisAvailable() ? await redisCommand<string>(["RPOP", QUEUE_KEY]) : localQueue.shift();
    if (id) await processDocument(id);
  } finally { draining = false; }
}

async function processDocument(id: string) {
  const file = getDocumentFile(id);
  if (!file) return;
  try {
    setDocumentStatus(id, "processing");
    await cacheSet(`plantmind:job:${id}`, { id, status: "processing" }, 86400);
    const pages = parseDocument(file.name, file.mimeType, readFileSync(file.filePath));
    const result = indexDocument(id, pages);
    await cacheSet(`plantmind:job:${id}`, result, 86400);
  } catch (error) {
    setDocumentStatus(id, "failed");
    await cacheSet(`plantmind:job:${id}`, { ...getDocument(id), status: "failed", error: error instanceof Error ? error.message : "Processing failed." }, 86400);
  }
}
