import { evidence } from "./data.js";
import { evaluateCorpus } from "./evaluation.js";
import { getStoredChunks } from "./store.js";

const stored = getStoredChunks();
const corpus = new Set(stored.map((item) => item.documentId)).size >= 4 ? stored : stored.length ? [...evidence, ...stored] : evidence;
console.log(JSON.stringify(evaluateCorpus(corpus), null, 2));
