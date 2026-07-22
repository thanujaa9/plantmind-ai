export type Evidence = {
  id: string;
  document: string;
  type: string;
  page: number;
  text: string;
  assetId: string;
  keywords: string[];
  sourceUrl?: string;
};

export const evidence: Evidence[] = [
  {
    id: "ev-manual-18",
    document: "Centrifugal Pump P-100 Series Manual.pdf",
    type: "OEM Manual",
    page: 18,
    assetId: "P-101",
    keywords: ["vibration", "limit", "bearing", "temperature", "safe"],
    text: "For P-100 series pumps, overall vibration above 7.1 mm/s RMS is unacceptable. Bearing temperature should remain below 85 C. Inspect bearing condition and lubrication immediately when both limits trend upward."
  },
  {
    id: "ev-inspection-3",
    document: "July 2026 Rotating Equipment Inspection.pdf",
    type: "Inspection",
    page: 3,
    assetId: "P-101",
    keywords: ["vibration", "inspection", "reading", "temperature", "overheating"],
    text: "Pump P-101 vibration increased from 4.2 mm/s on 02 July to 7.8 mm/s on 18 July. Bearing temperature rose from 72 C to 88 C during the same period. Metallic noise was observed near the drive-end bearing."
  },
  {
    id: "ev-maintenance-2",
    document: "P-101 Maintenance Work Orders.csv",
    type: "Maintenance",
    page: 2,
    assetId: "P-101",
    keywords: ["maintenance", "lubrication", "postponed", "bearing", "work order"],
    text: "Work orders WO-1842 and WO-1901 for drive-end bearing lubrication were postponed due to production demand. The latest lubrication task is 19 days overdue."
  },
  {
    id: "ev-incident-7",
    document: "Rotating Equipment Incident Review 2025.pdf",
    type: "Incident",
    page: 7,
    assetId: "P-204",
    keywords: ["incident", "failure", "bearing", "vibration", "overheating"],
    text: "Pump P-204 suffered drive-end bearing seizure after sustained vibration above 7 mm/s, rising temperature, and delayed lubrication. The review recommends immediate inspection when this compound pattern recurs."
  }
];

export const asset = {
  id: "P-101",
  name: "Cooling Water Pump P-101",
  area: "Utilities / Cooling Loop A",
  status: "Attention required",
  risk: "High",
  readings: [
    { label: "Vibration", value: "7.8 mm/s", state: "Above 7.1 limit" },
    { label: "Bearing temp", value: "88 C", state: "Above 85 C limit" },
    { label: "Lubrication", value: "19 days", state: "Overdue" }
  ],
  alert: {
    title: "Probable drive-end bearing degradation",
    explanation: "Rising vibration and temperature coincide with two postponed lubrication work orders. A prior incident shows the same compound pattern before bearing seizure.",
    action: "Inspect the drive-end bearing and lubrication system within 24 hours. Reduce load until cleared by maintenance.",
    evidenceIds: ["ev-manual-18", "ev-inspection-3", "ev-maintenance-2", "ev-incident-7"]
  }
};
