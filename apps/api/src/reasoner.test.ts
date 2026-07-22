import { describe, expect, it } from "vitest";
import { evidence } from "./data.js";
import { buildCompoundRiskDiagnosis, buildLimitAnswer, buildMaintenanceAnswer } from "./reasoner.js";

describe("compound risk reasoner", () => {
  it("derives the P-101 diagnosis from evidence values", () => {
    const result = buildCompoundRiskDiagnosis(evidence);
    expect(result.coverage).toBe(1);
    expect(result.answer).toContain("7.8 mm/s");
    expect(result.answer).toContain("88 C");
    expect(result.answer).toContain("bearing seizure");
  });

  it("extracts operating limits rather than using a canned response", () => {
    const answer = buildLimitAnswer(evidence);
    expect(answer).toContain("7.1 mm/s");
    expect(answer).toContain("85 C");
  });

  it("parses ranged thresholds and degrees C from unseen document wording", () => {
    const unseen = [
      { ...evidence[0], id: "range-manual", document: "01_Manual_P101.txt", text: "Vibration Velocity (mm/s RMS): Alert threshold: 4.5 - 7.0 mm/s. Alarm threshold: above 7.0 mm/s. Bearing Temperature: Alert threshold: 70 - 85 degrees C. Alarm threshold: above 85 degrees C." },
      { ...evidence[1], id: "degrees-inspection", document: "02_Inspection_Report_P101.txt", text: "Current reading: 7.8 mm/s. Drive-end bearing temperature current reading: 79 degrees C." }
    ];
    const answer = buildLimitAnswer(unseen);
    expect(answer).toContain("7 mm/s");
    expect(answer).toContain("85 C");
    expect(answer).toContain("7.8 mm/s");
    expect(answer).toContain("79 C");
    const diagnosis = buildCompoundRiskDiagnosis([
      ...unseen,
      { ...evidence[2], id: "range-maintenance", text: "Two bearing lubrication cycles were postponed." },
      { ...evidence[3], id: "range-incident", text: "A same-series pump suffered drive-end bearing failure after rising vibration, temperature, and postponed lubrication." }
    ]);
    expect(diagnosis.checks.find((check) => check.label === "Temperature threshold")?.passed).toBe(true);
    expect(diagnosis.checks.find((check) => check.label === "Temperature threshold")?.detail).toContain("70 C");
  });

  it("applies the documented alert boundary to a hypothetical reading", () => {
    const unseen = [
      { ...evidence[0], document: "01_Manual_P101.txt", text: "Vibration Velocity: Alert threshold: 4.5 - 7.0 mm/s. Alarm threshold: above 7.0 mm/s." }
    ];
    const answer = buildLimitAnswer(unseen, "If vibration were exactly 4.5 mm/s, would that be a concern?");
    expect(answer).toContain("is a concern");
    expect(answer).toContain("alert range begins");
  });

  it("recognizes bearing failure wording as historical precedent", () => {
    const unseen = evidence.map((item) => item.id === "ev-incident-7"
      ? { ...item, text: "A same-series pump suffered an unplanned drive-end bearing failure after rising vibration and postponed lubrication." }
      : item);
    const result = buildCompoundRiskDiagnosis(unseen);
    expect(result.checks.find((check) => check.label === "Historical precedent")?.passed).toBe(true);
  });

  it("describes unseen maintenance logs without inventing work-order IDs", () => {
    const maintenance = [{ ...evidence[2], document: "03_Maintenance_Log_P101.txt", text: "Status: POSTPONED. Rescheduled and completed 19 days later. Status: POSTPONED. Lubrication has not yet been carried out." }];
    const answer = buildMaintenanceAnswer(maintenance);
    expect(answer).toContain("2 bearing-lubrication cycles were postponed");
    expect(answer).toContain("19 days late");
    expect(answer).toContain("remained incomplete");
    expect(answer).not.toContain("WO-1842");
  });
});
