import { describe, expect, it } from "vitest";
import { evidence } from "./data.js";
import { evaluateCorpus } from "./evaluation.js";

describe("retrieval and grounding benchmark", () => {
  it("passes the bundled P-101 benchmark", () => {
    const report = evaluateCorpus(evidence);
    expect(report.retrievalHitAt3).toBe(100);
    expect(report.answerStatusAccuracy).toBe(100);
    expect(report.citationGroundingRate).toBe(100);
  });
});
