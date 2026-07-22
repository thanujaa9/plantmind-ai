import type { Evidence } from "./data.js";
import { answerQuestion, retrieve } from "./engine.js";

export type BenchmarkCase = {
  id: string;
  question: string;
  expectedDocument?: RegExp;
  expectedStatus: "answered" | "insufficient_evidence";
};

export const benchmarkCases: BenchmarkCase[] = [
  { id: "temperature-symptom", question: "P-101 has a heat issue. What evidence explains it?", expectedDocument: /inspection/i, expectedStatus: "answered" },
  { id: "operating-limits", question: "What are the safe vibration and temperature limits for P-101?", expectedDocument: /manual/i, expectedStatus: "answered" },
  { id: "maintenance-delay", question: "Was bearing servicing deferred for P-101?", expectedDocument: /work.orders|maintenance/i, expectedStatus: "answered" },
  { id: "historical-pattern", question: "Was there a similar previous bearing failure?", expectedDocument: /incident/i, expectedStatus: "answered" },
  { id: "unsupported-manufacture", question: "When was P-101 manufactured?", expectedStatus: "insufficient_evidence" }
];

export function evaluateCorpus(corpus: Evidence[], cases = benchmarkCases) {
  const started = performance.now();
  const results = cases.map((test) => {
    const ranked = retrieve(test.question, corpus).slice(0, 3);
    const answer = answerQuestion(test.question, corpus);
    const retrievalHit = test.expectedDocument ? ranked.some(({ item }) => test.expectedDocument?.test(item.document)) : true;
    const statusCorrect = answer.status === test.expectedStatus;
    const citationsGrounded = answer.status === "insufficient_evidence" || answer.citations.length > 0;
    return { id: test.id, retrievalHit, statusCorrect, citationsGrounded, topDocuments: ranked.map(({ item }) => item.document), responseMs: answer.responseMs };
  });
  const percentage = (passing: number) => Math.round((passing / results.length) * 1000) / 10;
  return {
    cases: results.length,
    retrievalHitAt3: percentage(results.filter((result) => result.retrievalHit).length),
    answerStatusAccuracy: percentage(results.filter((result) => result.statusCorrect).length),
    citationGroundingRate: percentage(results.filter((result) => result.citationsGrounded).length),
    averageResponseMs: Math.round(results.reduce((sum, result) => sum + result.responseMs, 0) / results.length),
    evaluationMs: Math.max(1, Math.round(performance.now() - started)),
    results
  };
}
