import type { Evidence } from "./data.js";

const DIMENSIONS = 256;
const concepts: Record<string, string[]> = {
  temperature: ["temperature", "temp", "heat", "hot", "overheat", "overheating", "thermal"],
  maintenance: ["maintenance", "service", "servicing", "repair", "work", "work-order", "workorder"],
  postponed: ["postponed", "delayed", "deferred", "overdue", "late", "pending"],
  vibration: ["vibration", "vibrating", "shake", "shaking", "rms"],
  bearing: ["bearing", "drive-end", "seizure", "metallic"],
  limit: ["limit", "threshold", "safe", "permitted", "maximum", "alert"],
  incident: ["incident", "failure", "breakdown", "trip", "seizure"],
  lubrication: ["lubrication", "lubricate", "grease", "greasing"]
};

const canonical = new Map(Object.entries(concepts).flatMap(([concept, words]) => words.map((word) => [word, concept])));
const stopWords = new Set(["the", "and", "for", "with", "from", "has", "have", "had", "was", "were", "this", "that", "what", "when", "where", "why", "how", "issue", "record", "records", "document", "documents"]);

export function embed(text: string) {
  const vector = new Float32Array(DIMENSIONS);
  for (const token of semanticTokens(text)) {
    const index = hash(token) % DIMENSIONS;
    const sign = hash(`sign:${token}`) % 2 ? 1 : -1;
    vector[index] += sign;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return Array.from(vector, (value) => value / magnitude);
}

export function semanticRank(question: string, corpus: Evidence[]) {
  const queryVector = embed(question);
  return corpus.map((item) => {
    const itemVector = embed(`${item.document} ${item.type} ${item.assetId} ${item.text}`);
    const similarity = cosine(queryVector, itemVector);
    const assetBoost = [...question.matchAll(/\b[A-Z]{1,4}-\d{2,5}\b/g)].some((match) => item.assetId === match[0]) ? .18 : 0;
    return { item, score: Math.min(1, similarity + assetBoost), matches: similarity > .05 ? 1 : 0 };
  }).filter((result) => result.score > .05).sort((a, b) => b.score - a.score);
}

export function semanticTokens(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9-]+/g, " ").split(/\s+/).filter((word) => word.length > 2 && !stopWords.has(word)).map((word) => canonical.get(word) || word);
}

function cosine(a: number[], b: number[]) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}
