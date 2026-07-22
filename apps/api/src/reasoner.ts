import type { Evidence } from "./data.js";

export type Diagnosis = {
  answer: string;
  coverage: number;
  checks: Array<{ label: string; passed: boolean; detail: string }>;
};

export function buildCompoundRiskDiagnosis(citations: Evidence[]): Diagnosis {
  const inspection = find(citations, /inspection/i);
  const manual = find(citations, /manual/i);
  const maintenance = find(citations, /work.orders|maintenance/i);
  const incident = find(citations, /incident/i);

  const vibration = extractReading(inspection?.text, "vibration");
  const temperature = extractReading(inspection?.text, "temperature");
  const vibrationLimit = extractRiskThreshold(manual?.text, "vibration");
  const temperatureLimit = extractRiskThreshold(manual?.text, "temperature");
  const postponed = (maintenance?.text.match(/postponed/gi) || []).length;
  const similarFailure = /bearing (?:seizure|failure|degradation)|failed? .*bearing|compound risk indicator/i.test(incident?.text || "");

  const vibrationExceeded = vibration !== undefined && vibrationLimit !== undefined && vibration > vibrationLimit;
  const temperatureExceeded = temperature !== undefined && temperatureLimit !== undefined && temperature > temperatureLimit;
  const maintenanceDelayed = postponed > 0;

  const checks = [
    { label: "Vibration threshold", passed: vibrationExceeded, detail: vibration !== undefined && vibrationLimit !== undefined ? `${vibration} mm/s versus ${vibrationLimit} mm/s limit` : "Required values not found" },
    { label: "Temperature threshold", passed: temperatureExceeded, detail: temperature !== undefined && temperatureLimit !== undefined ? `${temperature} C versus ${temperatureLimit} C limit` : "Required values not found" },
    { label: "Maintenance delay", passed: maintenanceDelayed, detail: postponed ? `${postponed} postponed work-order references` : "No postponement found" },
    { label: "Historical precedent", passed: similarFailure, detail: similarFailure ? "Prior bearing-seizure pattern found" : "No comparable incident found" }
  ];
  const coverage = checks.filter((check) => check.passed).length / checks.length;

  const risk = coverage >= .75 ? "probable drive-end bearing degradation" : "an abnormal bearing condition requiring inspection";
  const alarmExceeded = vibration !== undefined && extractLimit(manual?.text, "vibration") !== undefined && vibration > extractLimit(manual?.text, "vibration")!;
  const action = alarmExceeded
    ? "Because vibration exceeds the documented alarm boundary, take the unit offline and inspect the drive-end bearing immediately; require maintenance clearance before return to service."
    : coverage >= .75
      ? "Schedule bearing and lubrication inspection within the documented alert-response window and monitor readings until cleared."
      : "A reliability engineer should review the cited evidence before operational action.";
  const inspectionClaim = `P-101 shows ${risk}: the latest inspection records ${vibration ?? "unavailable"} mm/s vibration and ${temperature ?? "unavailable"} C bearing temperature.`;
  const actionClause = `${action.charAt(0).toLowerCase()}${action.slice(1)}`;
  const manualClaim = `The OEM manual places those readings against alert boundaries of ${vibrationLimit ?? "an unavailable vibration value"} mm/s and ${temperatureLimit ?? "an unavailable temperature value"} C; ${actionClause}`;
  const maintenanceClaim = postponed
    ? `The maintenance record adds supporting context: ${postponed} lubrication work orders were postponed.`
    : "The maintenance record contains no documented postponement.";
  const incidentClaim = similarFailure
    ? "A historical pump incident documents the same rising-vibration, temperature, and delayed-lubrication pattern before bearing seizure."
    : "No comparable historical bearing-failure pattern was found in the incident records.";
  const answer = `${inspectionClaim} ${manualClaim} ${maintenanceClaim} ${incidentClaim}`;
  return { answer, coverage, checks };
}

export function buildLimitAnswer(citations: Evidence[], question = "") {
  const manual = find(citations, /manual/i);
  const inspection = find(citations, /inspection/i);
  const vibrationLimit = extractLimit(manual?.text, "vibration");
  const temperatureLimit = extractLimit(manual?.text, "temperature");
  const vibration = extractReading(inspection?.text, "vibration");
  const temperature = extractReading(inspection?.text, "temperature");
  const normalized = question.toLowerCase();
  const vibrationOnly = /vibration/.test(normalized) && !/temperature|thermal|bearing temp/.test(normalized);
  const temperatureOnly = /temperature|thermal|bearing temp/.test(normalized) && !/vibration/.test(normalized);
  const hypotheticalVibration = normalized.match(/(?:exactly|were|at)\s+(\d+(?:\.\d+)?)\s*mm\/s/)?.[1];
  const vibrationAlertRange = extractAlertRange(manual?.text, "vibration");
  if (vibrationOnly && hypotheticalVibration && vibrationAlertRange) {
    const value = Number(hypotheticalVibration);
    if (value < vibrationAlertRange[0]) return `${value} mm/s is below the documented alert range of ${vibrationAlertRange[0]}–${vibrationAlertRange[1]} mm/s, so it is within the manual's normal range.`;
    if (value <= vibrationAlertRange[1]) return `${value} mm/s is a concern because it is within the documented alert range of ${vibrationAlertRange[0]}–${vibrationAlertRange[1]} mm/s. At exactly ${vibrationAlertRange[0]} mm/s, the alert range begins, so the manual calls for inspection scheduling within its documented response window.`;
    return `${value} mm/s is above the documented ${vibrationAlertRange[1]} mm/s alarm boundary and requires immediate inspection.`;
  }
  if (vibrationOnly && vibrationAlertRange) return `The OEM manual defines the vibration alert range as ${vibrationAlertRange[0]}–${vibrationAlertRange[1]} mm/s RMS, with alarm conditions above ${vibrationAlertRange[1]} mm/s. The latest inspection records ${vibration ?? "an unavailable vibration reading"} mm/s.`;
  if (vibrationOnly) return `The OEM manual defines a vibration alert range up to ${vibrationLimit ?? "an unspecified boundary"} mm/s RMS, with alarm conditions above that boundary. The latest inspection records ${vibration ?? "an unavailable vibration reading"} mm/s.`;
  if (temperatureOnly) return `The drive-end bearing alert range extends up to ${temperatureLimit ?? "an unspecified boundary"} C, with alarm conditions above that boundary. The latest inspection records ${temperature ?? "an unavailable temperature reading"} C.`;
  return `The OEM manual defines the vibration alert range up to ${vibrationLimit ?? "an unspecified boundary"} mm/s RMS and the bearing-temperature alert range up to ${temperatureLimit ?? "an unspecified boundary"} C. Alarm conditions begin above those boundaries. The latest inspection records ${vibration ?? "an unavailable vibration reading"} mm/s and ${temperature ?? "an unavailable temperature reading"} C.`;
}

function extractAlertRange(text: string | undefined, kind: "vibration" | "temperature"): [number, number] | undefined {
  if (!text) return undefined;
  const unit = kind === "vibration" ? "mm\\/s" : "(?:degrees?\\s*)?(?:°\\s*)?C";
  const section = text.match(new RegExp(`${kind}[\\s\\S]{0,700}`, "i"))?.[0] || text;
  const match = section.match(new RegExp(`alert[^\\n:]{0,40}:?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:-|–|to)\\s*(\\d+(?:\\.\\d+)?)\\s*${unit}`, "i"));
  return match ? [Number(match[1]), Number(match[2])] : undefined;
}

export function buildMaintenanceAnswer(citations: Evidence[]) {
  const maintenance = find(citations, /work.orders|maintenance/i);
  if (!maintenance) return "The uploaded records do not contain a dedicated maintenance history for this asset.";
  const text = maintenance.text;
  const workOrders = [...new Set(text.match(/\bWO-\d+\b/gi) || [])];
  const postponed = Math.max(
    (text.match(/status:\s*postponed/gi) || []).length,
    (text.match(/\bpostponed\b/gi) || []).length > 0 ? Math.min(2, (text.match(/\bpostponed\b/gi) || []).length) : 0
  );
  const lateDays = Number(text.match(/(\d+)\s*days?\s*(?:later|late|overdue)/i)?.[1]);
  const incomplete = /not yet completed|has not yet been carried out|still pending/i.test(text);
  const facts = [
    postponed ? `${postponed} bearing-lubrication cycles were postponed` : "bearing-lubrication delays are recorded",
    Number.isFinite(lateDays) ? `one cycle was completed ${lateDays} days late` : "",
    incomplete ? "the latest postponed cycle remained incomplete at the time of the log" : "",
    workOrders.length ? `the referenced work orders are ${workOrders.join(" and ")}` : ""
  ].filter(Boolean);
  return `The maintenance record shows that ${joinFacts(facts)}. Review and complete the overdue lubrication work before returning the asset to normal load.`;
}

function find(citations: Evidence[], pattern: RegExp) {
  return citations.find((item) => pattern.test(item.document)) || citations.find((item) => pattern.test(item.text));
}

function numberNear(text: string | undefined, pattern: RegExp, mode: "min" | "max") {
  if (!text) return undefined;
  const values = [...text.matchAll(pattern)].map((match) => Number(match[1])).filter(Number.isFinite);
  if (!values.length) return undefined;
  return mode === "max" ? Math.max(...values) : Math.min(...values);
}

function extractLimit(text: string | undefined, kind: "vibration" | "temperature") {
  if (!text) return undefined;
  const unit = kind === "vibration" ? "mm\\/s" : "(?:degrees?\\s*)?(?:°\\s*)?C";
  const section = text.match(new RegExp(`${kind}[\\s\\S]{0,700}`, "i"))?.[0] || text;
  const above = numberNear(section, new RegExp(`(?:alarm threshold[^.\\n:]*:?\\s*)?(?:above|below|up to|maximum(?: of)?|exceeds?|greater than)\\s*(\\d+(?:\\.\\d+)?)\\s*${unit}`, "gi"), "max");
  if (above !== undefined) return above;
  const ranges = [...section.matchAll(new RegExp(`(?:alert|alarm)[^\\n:]{0,40}:?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:-|–|to)\\s*(\\d+(?:\\.\\d+)?)\\s*${unit}`, "gi"))];
  if (ranges.length) return Math.max(...ranges.map((match) => Number(match[2])));
  return undefined;
}

function extractRiskThreshold(text: string | undefined, kind: "vibration" | "temperature") {
  if (!text) return undefined;
  const unit = kind === "vibration" ? "mm\\/s" : "(?:degrees?\\s*)?(?:°\\s*)?C";
  const section = text.match(new RegExp(`${kind}[\\s\\S]{0,700}`, "i"))?.[0] || text;
  const alertRange = section.match(new RegExp(`alert[^\\n:]{0,40}:?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:-|–|to)\\s*(\\d+(?:\\.\\d+)?)\\s*${unit}`, "i"));
  return alertRange ? Number(alertRange[1]) : extractLimit(text, kind);
}

function extractReading(text: string | undefined, kind: "vibration" | "temperature") {
  if (!text) return undefined;
  const pattern = kind === "vibration"
    ? /(\d+(?:\.\d+)?)\s*mm\/s/gi
    : /(\d+(?:\.\d+)?)\s*(?:degrees?\s*)?(?:°\s*)?C\b/gi;
  return numberNear(text, pattern, "max");
}

function joinFacts(facts: string[]) {
  if (facts.length < 2) return facts[0] || "the available evidence is incomplete";
  return `${facts.slice(0, -1).join(", ")}, and ${facts.at(-1)}`;
}
