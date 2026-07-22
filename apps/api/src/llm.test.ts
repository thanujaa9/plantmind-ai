import { describe, expect, it } from "vitest";
import { answerQuestion } from "./engine.js";
import { generateGroundedAnswer } from "./llm.js";

describe("grounded generation fallback", () => {
  it("preserves the deterministic answer when no provider is configured", async () => {
    const draft = answerQuestion("Why is P-101 overheating?");
    const result = await generateGroundedAnswer("Why is P-101 overheating?", draft);
    expect(result.generation.mode).toBe("deterministic");
    expect(result.answer).toBe(draft.answer);
    expect(result.citations).toEqual(draft.citations);
  });
});
