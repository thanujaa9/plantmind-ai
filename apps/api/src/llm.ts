import type { Answer } from "./engine.js";

export type GeneratedAnswer = Answer & {
  generation: { mode: "deterministic" | "llm-grounded"; provider: string; model?: string };
};

const apiUrl = process.env.LLM_API_URL;
const apiKey = process.env.LLM_API_KEY;
const model = process.env.LLM_MODEL;

export async function generateGroundedAnswer(question: string, draft: Answer): Promise<GeneratedAnswer> {
  if (!apiUrl || !apiKey || !model || draft.status === "insufficient_evidence") return deterministic(draft);
  const sources = draft.citations.map((citation, index) => `[${index + 1}] ${citation.document}, page ${citation.page}: ${citation.text}`).join("\n\n");
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: "You are PlantMind, an industrial knowledge assistant. Rewrite the supplied verified draft clearly and concisely. Use only the supplied sources. Do not add measurements, causes, dates, certainty, or actions absent from the draft and sources. Refer to evidence using [1], [2] markers. If evidence conflicts, state the conflict." },
          { role: "user", content: `Question: ${question}\n\nVerified deterministic draft:\n${draft.answer}\n\nSources:\n${sources}` }
        ]
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return deterministic(draft);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const answer = payload.choices?.[0]?.message?.content?.trim();
    if (!answer) return deterministic(draft);
    return { ...draft, answer, generation: { mode: "llm-grounded", provider: new URL(apiUrl).hostname, model } };
  } catch { return deterministic(draft); }
}

function deterministic(draft: Answer): GeneratedAnswer {
  return { ...draft, generation: { mode: "deterministic", provider: "local evidence engine" } };
}
