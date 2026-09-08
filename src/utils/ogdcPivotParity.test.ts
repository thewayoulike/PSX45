import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { computeAwaisOverlays, normalizeAwaisLayers, DEFAULT_AWAIS_LAYERS } from "./src/utils/awaisIndicators.ts";

const bars = JSON.parse(readFileSync("D:/PSX45/tmp_ogdc_bars.json","utf8"));

describe("OGDC Awais pivots vs TradingView", () => {
  it("Monthly Traditional matches TV Awais panel screenshot", () => {
    const layers = normalizeAwaisLayers({
      ...DEFAULT_AWAIS_LAYERS,
      pivotType: "Traditional",
      pivotAnchor: "Monthly",
      maxHistoricalPivots: 1,
    });
    const data = computeAwaisOverlays(bars, layers, { timeframe: "day", pivotBars: bars });
    const map = Object.fromEntries(data.pivots.map((p) => [p.label, p.value]));
    expect(map.P).toBeCloseTo(325.59, 2);
    expect(map.R1).toBeCloseTo(338.11, 2);
    expect(map.S1).toBeCloseTo(316.18, 2);
    expect(map.R2).toBeCloseTo(347.52, 2);
    expect(map.S2).toBeCloseTo(303.66, 2);
    expect(map.R3).toBeCloseTo(360.04, 2);
    expect(map.S3).toBeCloseTo(294.25, 2);
    expect(map.R4).toBeCloseTo(372.56, 2);
    expect(map.S4).toBeCloseTo(284.84, 2);
    expect(map.R5).toBeCloseTo(385.08, 2);
    expect(map.S5).toBeCloseTo(275.43, 2);
  });

  it("Auto on day chart resolves to same Monthly Traditional levels", () => {
    const layers = normalizeAwaisLayers({
      ...DEFAULT_AWAIS_LAYERS,
      pivotType: "Traditional",
      pivotAnchor: "Auto",
      maxHistoricalPivots: 1,
    });
    const data = computeAwaisOverlays(bars, layers, { timeframe: "day", pivotBars: bars });
    const map = Object.fromEntries(data.pivots.map((p) => [p.label, p.value]));
    expect(map.P).toBeCloseTo(325.59, 2);
    expect(map.S5).toBeCloseTo(275.43, 2);
    expect(data.pivots.length).toBe(11);
  });
});
