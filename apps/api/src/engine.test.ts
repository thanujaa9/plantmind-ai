import { describe, expect, it } from "vitest";
import { answerQuestion } from "./engine.js";
import { evidence } from "./data.js";

describe("evidence engine", () => {
  it("answers the P-101 failure question with citations", () => {
    const result = answerQuestion("Why is P-101 overheating?");
    expect(result.status).toBe("answered");
    expect(result.evidenceStrength).toBe("Strong");
    expect(result.citations.length).toBeGreaterThanOrEqual(3);
  });

  it("refuses unsupported manufacturing questions", () => {
    const result = answerQuestion("When was P-101 manufactured?");
    expect(result.status).toBe("insufficient_evidence");
  });

  it("refuses a safety-limit question when only maintenance evidence is uploaded", () => {
    const maintenanceOnly = evidence.filter((item) => /maintenance/i.test(item.type));
    const result = answerQuestion("What is the safe vibration limit for P-101?", maintenanceOnly);
    expect(result.status).toBe("insufficient_evidence");
    expect(result.citations).toHaveLength(0);
  });

  it("prefers a dedicated maintenance document over incident text mentioning maintenance", () => {
    const uploaded = evidence.map((item) => ({ ...item, sourceUrl: `/files/${item.id}` }));
    uploaded[2] = { ...uploaded[2], document: "03_Maintenance_Log_P101.txt", text: "Two consecutive bearing lubrication cycles were postponed. The latest task is 19 days overdue." };
    uploaded[3] = { ...uploaded[3], document: "04_Incident_Report_P103_BearingFailure.txt", text: "Bearing failure followed postponed maintenance and delayed lubrication. Maintenance crews did not respond." };
    const result = answerQuestion("Why is P-101 at risk of bearing failure?", uploaded);
    expect(result.citations.some((item) => item.document === "03_Maintenance_Log_P101.txt")).toBe(true);
    expect(result.reasoningChecks?.find((check) => check.label === "Maintenance delay")?.passed).toBe(true);
  });

  it("returns an identical retrieval score across repeated identical queries", () => {
    const question = "What is the vibration threshold for P-101?";
    const scores = Array.from({ length: 6 }, () => answerQuestion(question, evidence).retrievalScore);
    expect(new Set(scores).size).toBe(1);
  });

  it("describes incident-only assets as historical rather than currently monitored", () => {
    const uploaded = evidence.map((item) => ({ ...item, sourceUrl: `/files/${item.id}` }));
    uploaded[3] = { ...uploaded[3], assetId: "P-103", document: "04_Incident_Report_P103_BearingFailure.txt", text: "Historical incident: P-103 suffered bearing seizure in October 2025 after current readings crossed the alert threshold." };
    const result = answerQuestion("What is the current risk level for P-103?", uploaded);
    expect(result.answer).toContain("historical incident reference");
    expect(result.answer).toContain("cannot assign it a current risk level");
    expect(result.answer).not.toContain("P-101 shows");
  });

  it("never dumps raw passages for an unmatched question", () => {
    const result = answerQuestion("Summarize something unrelated but vaguely present", evidence);
    expect(result.status).toBe("insufficient_evidence");
    expect(result.answer).not.toContain("The uploaded records contain the following relevant evidence:");
  });
});
