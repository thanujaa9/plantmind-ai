import { evidence, type Evidence } from "./data.js";
import { buildCompoundRiskDiagnosis, buildLimitAnswer, buildMaintenanceAnswer } from "./reasoner.js";
import { semanticRank } from "./vector.js";

export type Answer = {
  status: "answered" | "insufficient_evidence";
  answer: string;
  evidenceStrength: "Strong" | "Moderate" | "Insufficient";
  basis: string;
  citations: Evidence[];
  responseMs: number;
  retrievalScore: number;
  reasoningChecks?: Array<{ label: string; passed: boolean; detail: string }>;
};

const tokens = (value: string) =>
  new Set(value.toLowerCase().replace(/[^a-z0-9-]+/g, " ").split(/\s+/).filter((word) => word.length > 2));

export function retrieve(question: string, corpus: Evidence[] = evidence) {
  const query = tokens(question);
  const lexical = corpus
    .map((item) => {
      const searchable = tokens(`${item.text} ${item.keywords.join(" ")} ${item.assetId}`);
      const matches = [...query].filter((token) => searchable.has(token));
      return { item, score: matches.length / Math.max(query.size, 1), matches: matches.length };
    })
    .filter((result) => result.matches > 0)
    .sort((a, b) => b.score - a.score);
  const semantic = semanticRank(question, corpus);
  const merged = new Map<string, { item: Evidence; score: number; matches: number }>();
  for (const result of semantic) merged.set(result.item.id, result);
  for (const result of lexical) {
    const previous = merged.get(result.item.id);
    merged.set(result.item.id, { ...result, score: Math.min(1, result.score * .55 + (previous?.score || 0) * .45), matches: result.matches });
  }
  return [...merged.values()].sort((a, b) => b.score - a.score);
}

export function answerQuestion(question: string, corpus: Evidence[] = evidence): Answer {
  const started = performance.now();
  const normalized = question.toLowerCase();
  const ranked = retrieve(question, corpus);
  const enoughEvidence = ranked.length > 0 && ranked[0].score >= 0.12;

  if (!enoughEvidence || /manufactur(ed|ing)|purchase date|serial number/.test(normalized)) {
    return {
      status: "insufficient_evidence",
      answer: "I could not find sufficient evidence in the uploaded documents to answer that reliably. Upload an equipment register, purchase record, or nameplate record and try again.",
      evidenceStrength: "Insufficient",
      basis: `Searched ${corpus.length} records; no passage directly supports the requested fact.`,
      citations: ranked.slice(0, 1).map(({ item }) => item),
      retrievalScore: Math.round((ranked[0]?.score || 0) * 100),
      responseMs: Math.max(1, Math.round(performance.now() - started))
    };
  }

  if (/limit|safe|permitted/.test(normalized)) {
    const manualEvidence = corpus.filter((item) => /manual/i.test(item.document) || /equipment manual/i.test(item.text));
    const containsLimit = manualEvidence.some((item) => /(?:above\s*)?\d+(?:\.\d+)?(?:\s*(?:-|–|to)\s*\d+(?:\.\d+)?)?\s*(?:mm\/s|(?:degrees?\s*)?(?:°\s*)?C)\b/i.test(item.text));
    if (!containsLimit) {
      return {
        status: "insufficient_evidence",
        answer: "The uploaded records contain operating readings, but no OEM manual or approved safety-limit passage supports the requested limit. Upload the equipment manual and try again.",
        evidenceStrength: "Insufficient",
        basis: `Searched ${corpus.length} records; no authoritative safety-limit passage was found.`,
        citations: [],
        retrievalScore: Math.round((ranked[0]?.score || 0) * 100),
        responseMs: Math.max(1, Math.round(performance.now() - started))
      };
    }
  }

  let answer = "";
  let status: Answer["status"] = "answered";
  let citations: Evidence[] = [];
  let reasoningChecks: Answer["reasoningChecks"];
  const requestedAsset = question.match(/\b[A-Z]\s*-?\s*\d{2,4}\b/i)?.[0].replace(/\s+/g, "").toUpperCase();
  const assetEvidence = requestedAsset
    ? corpus.filter((item) => new RegExp(`\\b${requestedAsset.replace("-", "[- ]?")}\\b`, "i").test(`${item.assetId} ${item.document} ${item.text}`))
    : [];
  const currentAssetEvidence = assetEvidence.filter((item) =>
    /inspection|condition monitoring|sensor/i.test(`${item.type} ${item.document}`)
    && !/incident|historical/i.test(`${item.type} ${item.document}`)
  );
  const historicalAssetEvidence = assetEvidence.filter((item) => /incident|failure|seizure/i.test(`${item.type} ${item.document} ${item.text}`));

  if (/\b(?:current\s+)?risk level\b/.test(normalized) && requestedAsset && currentAssetEvidence.length === 0 && historicalAssetEvidence.length > 0) {
    citations = historicalAssetEvidence.slice(0, 2);
    answer = `${requestedAsset} is present only as a historical incident reference. The uploaded records do not contain current inspection or monitoring readings for ${requestedAsset}, so PlantMind cannot assign it a current risk level.`;
  } else if (/why|overheat|heat issue|risk|wrong|problem|failure|taken offline|keep running/.test(normalized)) {
    citations = [
      preferUploaded(corpus, /inspection/i, "ev-inspection-3", /current reading|measured readings|mm\/s|temperature/i),
      preferUploaded(corpus, /manual/i, "ev-manual-18", /safety|vibration limits|alarm threshold|mm\/s|bearing temperature/i),
      preferUploaded(corpus, /work.orders|maintenance/i, "ev-maintenance-2", /postponed|overdue|lubrication/i),
      preferUploaded(corpus, /incident/i, "ev-incident-7", /bearing failure|bearing seizure|bearing degradation|compound risk/i)
    ].filter(Boolean) as Evidence[];
    const diagnosis = buildCompoundRiskDiagnosis(citations);
    answer = diagnosis.answer;
    reasoningChecks = diagnosis.checks;
  } else if (/limit|safe|permitted|temperature|vibration/.test(normalized)) {
    citations = [preferUploaded(corpus, /manual/i, "ev-manual-18", /safety|vibration limits|alarm threshold|mm\/s|bearing temperature/i), preferUploaded(corpus, /inspection/i, "ev-inspection-3", /current reading|measured readings|mm\/s|temperature/i)].filter(Boolean) as Evidence[];
    answer = buildLimitAnswer(citations, question);
  } else if (/maintenance|servic(?:e|ing)|deferred|work order|lubrication|overdue/.test(normalized)) {
    citations = [preferUploaded(corpus, /work.orders|maintenance/i, "ev-maintenance-2", /postponed|overdue|lubrication/i), preferUploaded(corpus, /manual/i, "ev-manual-18", /lubrication|every 30 days|delayed/i)].filter(Boolean) as Evidence[];
    answer = buildMaintenanceAnswer(citations);
  } else {
    status = "insufficient_evidence";
    answer = "I found related records, but they do not directly support a reliable answer to this question. Try asking about a documented asset, operating limit, inspection reading, or maintenance event.";
    citations = ranked.slice(0, 2).map(({ item }) => item);
  }

  return {
    status,
    answer,
    evidenceStrength: citations.length >= 2 ? "Strong" : "Moderate",
    basis: `${citations.length} supporting passages across ${new Set(citations.map((item) => item.document)).size} documents.`,
    citations,
    retrievalScore: Math.round((ranked[0]?.score || 0) * 100),
    reasoningChecks,
    responseMs: Math.max(1, Math.round(performance.now() - started))
  };
}

function preferUploaded(corpus: Evidence[], pattern: RegExp, fallbackId: string, contentPattern?: RegExp) {
  const uploadedCorpus = corpus.filter((item) => item.sourceUrl);
  const identifiedDocuments = uploadedCorpus.filter((item) => pattern.test(`${item.document} ${item.type}`));
  const uploaded = identifiedDocuments.length
    ? identifiedDocuments
    : uploadedCorpus.filter((item) => pattern.test(item.text));
  const best = contentPattern
    ? uploaded.sort((a, b) => scoreContent(b.text, contentPattern) - scoreContent(a.text, contentPattern))[0]
    : uploaded[0];
  return best
    || corpus.find((item) => item.id === fallbackId);
}

function scoreContent(text: string, pattern: RegExp) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return [...text.matchAll(new RegExp(pattern.source, flags))].length;
}
