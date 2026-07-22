import { describe, expect, it } from "vitest";
import { evidence } from "./data.js";
import { semanticRank } from "./vector.js";
import { cacheGet, cacheSet } from "./cache.js";

describe("local semantic vector retrieval", () => {
  it("maps heat wording to the temperature inspection evidence", () => {
    const results = semanticRank("P-101 has a heat issue", evidence);
    expect(results.slice(0, 2).some((result) => result.item.id === "ev-inspection-3")).toBe(true);
  });

  it("maps deferred servicing to postponed maintenance", () => {
    const results = semanticRank("Was bearing servicing deferred?", evidence);
    expect(results.slice(0, 2).some((result) => result.item.id === "ev-maintenance-2")).toBe(true);
  });
});

describe("answer cache fallback", () => {
  it("stores and retrieves results without hosted Redis credentials", async () => {
    await cacheSet("test:answer", { status: "ok" }, 30);
    await expect(cacheGet("test:answer")).resolves.toEqual({ status: "ok" });
  });
});
